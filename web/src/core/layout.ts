import { PIECE_ORDER, PieceId, Deck, emptyDeck, isCursed, splits, splitOffsets } from './pieces';
import { DrawPile } from './draw';
import { Card, Kind, kindOf, kindType, usesOf } from './cards';
import { BOARD, BOARD_MARGIN, ENEMY_RADIUS, PhaseSpec, rectDist } from './mapgen';
import { launchOf, continuePoint, CROOK_DIST } from './motion';
import { archerTargets } from './archer';

// Modelo do planejamento (puro): peças colocadas, mão, traçado por arrasto.
// Regra: tabuleiro vazio → a 1ª peça nasce no gatilho; depois só se continua de uma PONTA
// (peça sem continuação). Cada passo gira no máximo MAX_TURN para a onda nunca morrer na curva.
export interface Placed {
  id: number;
  type: PieceId;
  x: number; z: number; yaw: number;
  parent: number; // -1 = raiz (gatilho)
  stroke: number;
  pair?: number; // meia-peça irmã (bifurcação)
  /** trifurcação: ids das 3 meias-peças (a primeira é a "dona" do grupo) */
  group?: number[];
  /** a peça da caixa que virou esta peça na mesa (selos, ouro da Dourada) */
  card?: Card;
  /** Torta: para que lado ela pula quando é derrubada (+1 = esquerda da direção dela, −1 = direita) */
  side?: 1 | -1;
}

/** Uma peça na mão: a carta + quantas peças ela ainda põe na mesa (Dupla começa com 2). */
export interface HandEntry { card: Card; kind: Kind; left: number }

export type Fail = 'board' | 'wall' | 'enemy' | 'piece' | 'empty' | 'nohead' | 'trigger' | 'lever' | 'gate' | 'archer';

export const FAIL_TEXT: Record<Fail, string> = {
  board: 'Fora da mesa!',
  wall: 'Bloqueado pelo muro — contorne!',
  enemy: 'Muito perto do inimigo.',
  piece: 'Esbarra em outra peça.',
  empty: 'Acabaram as peças desse tipo!',
  nohead: 'Continue de uma ponta brilhante.',
  trigger: 'Comece no marcador VERDE!',
  lever: 'Muito perto da alavanca: deixe espaço para a peça cair nela.',
  gate: 'Em cima da porteira: atravesse a grade reto.',
  archer: 'O arqueiro vai destruir essa peça! Continue de outra ponta.',
};

/** Distância mínima de uma peça até a alavanca (a peça cai por cima dela). */
export const LEVER_CLEAR = 0.45;

export const MAX_TURN = (26 * Math.PI) / 180;
/** Depois de uma peça de alcance longo (Torre) a próxima quase não vira: longe, um giro grande tira a peça da faixa de queda. */
export const LONG_TURN = (8 * Math.PI) / 180;
const PIECE_CLEAR = 0.24;

export interface Stroke { head: number; done: boolean; id: number }

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Layout {
  pieces: Placed[] = [];
  /** peças na mão, na ordem em que chegaram */
  entries: HandEntry[] = [];
  /** usos disponíveis por TIPO (derivado de `entries`; o bot e o solver leem isto) */
  hand: Deck = emptyDeck();
  /** baralho de compra da fase; sem ele a mão é o baralho inteiro (bot, solver e testes) */
  readonly pile: DrawPile | null;
  /** bênção Reciclagem: a próxima Nova mão devolve as sobras para a caixa em vez de descartar */
  recycle = false;
  /** peças com id menor que este vieram de mãos anteriores: ficam fixas na mesa */
  private lockId = 0;
  private placedCards = 0;
  private nextId = 1;
  private strokeSeq = 0;

  constructor(public spec: PhaseSpec, hand: Deck, pile?: DrawPile) {
    this.pile = pile ?? null;
    if (!pile) {
      // sem caixa: a mão é o baralho inteiro, sem selos (uids negativos para não colidir com os da run)
      let uid = -1;
      for (const t of PIECE_ORDER) for (let i = 0; i < hand[t]; i++) this.entries.push({ card: { uid: uid--, type: t, seals: [] }, kind: t, left: 1 });
      this.recount();
    }
  }

  private recount() {
    const h = emptyDeck();
    for (const e of this.entries) h[e.card.type] += e.left;
    this.hand = h;
  }

  /** Quantas peças (cartas) estão na mão. */
  handCount(): number { return this.entries.length; }
  /** Quantas peças desse kind dá para colocar (Dupla conta 2). */
  uses(kind: Kind): number { let n = 0; for (const e of this.entries) if (e.kind === kind) n += e.left; return n; }
  has(kind: Kind): boolean { return this.entries.some((e) => e.kind === kind && e.left > 0); }
  inHand(uid: number): boolean { return this.entries.some((e) => e.card.uid === uid); }
  /** Tem peça maldita na mão: a Nova mão fica travada até ela ir para a mesa. */
  cursedInHand(): boolean { return this.entries.some((e) => isCursed(e.card.type)); }
  /** Kinds na mão, na ordem em que aparecem. */
  kinds(): Kind[] {
    const out: Kind[] = [];
    for (const e of this.entries) if (!out.includes(e.kind)) out.push(e.kind);
    return out;
  }

  /**
   * Nova mão: as sobras vão para o descarte (ou de volta para a caixa, com Reciclagem) — menos as
   * Guardadas, que ficam — e chegam `size` peças (cada Sortuda traz mais uma). Devolve as que
   * chegaram, na ordem. Null se a caixa está vazia.
   */
  newHand(size: number): Card[] | null {
    const pile = this.pile;
    if (!pile || pile.size === 0) return null;
    const keep = this.entries.filter((e) => e.card.seals.includes('guard'));
    const rest = this.entries.filter((e) => !e.card.seals.includes('guard')).map((e) => e.card);
    if (this.recycle && rest.length) { pile.returnShuffled(rest); this.recycle = false; } else pile.discardAll(rest);
    this.entries = keep;
    const drawn: Card[] = [];
    let want = size;
    while (want > 0 && pile.size > 0) {
      const [c] = pile.draw(1);
      drawn.push(c);
      this.entries.push({ card: c, kind: kindOf(c), left: usesOf(c) });
      want--;
      if (c.seals.includes('lucky')) want++;
    }
    this.recount();
    // comprou: o que já está na mesa não volta mais para a mão (senão a mão não teria limite)
    this.lockId = this.nextId;
    return drawn;
  }

  /** A peça veio de uma mão anterior (não pode ser removida nem desfeita). */
  locked(p: Placed): boolean { return p.id < this.lockId; }

  get(id: number): Placed | undefined { return this.pieces.find((p) => p.id === id); }
  children(id: number): Placed[] { return this.pieces.filter((p) => p.parent === id); }
  heads(): Placed[] {
    const hasChild = new Set(this.pieces.map((p) => p.parent));
    return this.pieces.filter((p) => !hasChild.has(p.id));
  }
  root(): Placed | undefined { return this.pieces.find((p) => p.parent === -1); }
  cardsUsed(): number { return this.placedCards; }

  /** Validade de um ponto para uma peça (raio de pegada aproximado). */
  check(x: number, z: number, ignore: Set<number>): Fail | null {
    if (Math.abs(x) > BOARD.w / 2 - BOARD_MARGIN || Math.abs(z) > BOARD.d / 2 - BOARD_MARGIN) return 'board';
    for (const w of this.spec.walls) if (rectDist(x, z, w) < 0.22) return 'wall';
    // a grade da porteira é fina: dá para pôr peças rente dos dois lados (a corrente atravessa quando abre)
    for (const g of this.spec.gates ?? []) {
      if (rectDist(x, z, g) < 0.13) return 'gate';
      if (Math.hypot(g.lever.x - x, g.lever.z - z) < LEVER_CLEAR) return 'lever';
    }
    for (const e of this.spec.enemies) {
      if (e.patrol) continue; // rota de patrulha é construível (ele empurra o que estiver em pé)
      if (Math.hypot(e.x - x, e.z - z) < ENEMY_RADIUS[e.kind] + 0.24) return 'enemy';
    }
    for (const p of this.pieces) {
      if (ignore.has(p.id)) continue;
      if (Math.hypot(p.x - x, p.z - z) < PIECE_CLEAR) return 'piece';
    }
    return null;
  }

  /** Muro no meio da queda de uma peça de alcance longo (a Torre bate nele e para). */
  private fallBlocked(x: number, z: number, fx: number, fz: number, step: number): boolean {
    if (step <= 0.6) return false;
    for (let d = 0.3; d < step - 0.2; d += 0.15) {
      const px = x + fx * d, pz = z + fz * d;
      for (const w of this.spec.walls) if (rectDist(px, pz, w) < 0.12) return true;
    }
    return false;
  }

  /**
   * Ponto de partida de um traço: gatilho (vazio) ou ponta próxima.
   * `aim` (cursor) gira a 1ª peça do gatilho para o lado onde o jogador aponta; sem ele, vale o ângulo do gatilho.
   */
  begin(x: number, z: number, kind: Kind, aim?: { x: number; z: number }): { stroke?: Stroke; placed?: Placed[]; fail?: Fail } {
    const t = this.spec.trigger;
    const type = kindType(kind);
    if (this.pieces.length === 0) {
      if (Math.hypot(x - t.x, z - t.z) > 0.8) return { fail: 'trigger' };
      const id = ++this.strokeSeq;
      const far = aim && Math.hypot(aim.x - t.x, aim.z - t.z) > 0.5;
      const yaw = far ? Math.atan2(aim!.x - t.x, aim!.z - t.z) : t.yaw;
      const placed = this.placeAt(kind, t.x, t.z, yaw, -1, id, new Set());
      if ('fail' in placed) return { fail: placed.fail };
      const last = placed.list[placed.list.length - 1];
      return { stroke: { head: last.id, done: splits(type), id }, placed: placed.list };
    }
    const h = this.nearestAnchor(x, z, 0.65);
    if (!h) return { fail: 'nohead' };
    if (this.archerTargetIds().has(h.id)) return { fail: 'archer' };
    return { stroke: { head: h.id, done: false, id: ++this.strokeSeq } };
  }

  /** Peças que um Arqueiro vai queimar (ver `archerTargets`): não se continua a corrente a partir delas. */
  archerTargetIds(): Set<number> {
    if (!this.spec.enemies.some((e) => e.kind === 'archer')) return new Set();
    return new Set(archerTargets(this.spec, this.pieces).map((t) => t.piece.id));
  }

  /** Onde clicar (e onde o anel aparece) para continuar a partir da ponta `h`. */
  anchorOf(h: Placed): { x: number; z: number } { return continuePoint(h, this.spec); }

  /**
   * Ponta cujo anel está mais perto do ponto. Nas pontas de lançamento longo (Torre, Foguete, Saltadora/Mola, Torta) o
   * anel fica onde a próxima peça nasce; clicar nele ou na própria peça continua dali. Nas demais, vale a peça.
   */
  nearestAnchor(x: number, z: number, maxD: number): Placed | undefined {
    let best: Placed | undefined, bd = maxD;
    for (const h of this.heads()) {
      let d = Math.hypot(h.x - x, h.z - z);
      const a = this.anchorOf(h);
      if (Math.hypot(a.x - h.x, a.z - h.z) > 0.6) d = Math.min(d, Math.hypot(a.x - x, a.z - z));
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  nearestHead(x: number, z: number, maxD: number): Placed | undefined {
    let best: Placed | undefined, bd = maxD;
    for (const h of this.heads()) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** Estende o traço em direção ao cursor; devolve peças novas e, se travou, o motivo + fantasma. */
  extend(st: Stroke, cx: number, cz: number, kind: Kind): { placed: Placed[]; fail?: Fail; ghost?: { x: number; z: number; yaw: number } } {
    const out: Placed[] = [];
    const type = kindType(kind);
    for (let guard = 0; guard < 60 && !st.done; guard++) {
      const h = this.get(st.head);
      if (!h) { st.done = true; break; }
      // a peça que o Arqueiro vai queimar não continua a corrente
      if (this.archerTargetIds().has(h.id)) return { placed: out, fail: 'archer', ghost: this.nextSpot(h) };
      // a próxima peça sai de onde a PONTA leva a onda: a queda dela (Torre vai longe), o fim da
      // corrida do Foguete ou o outro lado do salto da Saltadora/Mola
      const o = launchOf(h, this.spec);
      const step = o.step;
      // o cursor precisa se afastar da ponta (Foguete: da peça, não do fim da corrida)
      if (Math.hypot(cx - h.x, cz - h.z) < (o.kind === 'run' ? 1.0 : step * 0.9)) break;
      const desired = Math.atan2(cx - o.x, cz - o.z);
      // bifurcação nasce alinhada à ponta: as duas metades ficam dentro da faixa de queda dela.
      // Torre depois de Torre também vai reta (o golpe de lado desvia a queda).
      const long = o.kind === 'fall' && step > 0.6;
      const turn = splits(type) || (long && type === 'tower') ? 0 : long ? LONG_TURN : MAX_TURN;
      const diff = Math.max(-turn, Math.min(turn, wrapAngle(desired - o.yaw)));
      const yaw = wrapAngle(o.yaw + diff);
      // a queda é reta na direção da ponta; só o giro da peça nova muda (salto e corrida idem)
      const fx = Math.sin(o.kind === 'fall' ? yaw : o.yaw), fz = Math.cos(o.kind === 'fall' ? yaw : o.yaw);
      let nx = o.x + fx * step, nz = o.z + fz * step;
      if (long && this.fallBlocked(o.x, o.z, fx, fz, step)) return { placed: out, fail: 'wall', ghost: { x: nx, z: nz, yaw } };
      // caiu em cima da grade da porteira: a peça vai um pouco além dela (a queda da anterior ainda alcança)
      if (o.kind === 'fall' && step < 0.6 && !splits(type) && this.check(nx, nz, new Set([h.id])) === 'gate') {
        for (const d of [0.12, 0.2, 0.26]) {
          if (this.check(nx + fx * d, nz + fz * d, new Set([h.id])) === null) { nx += fx * d; nz += fz * d; break; }
        }
      }
      const res = this.placeAt(kind, nx, nz, yaw, h.id, st.id, new Set([h.id]));
      if ('fail' in res) return { placed: out, fail: res.fail, ghost: { x: nx, z: nz, yaw } };
      out.push(...res.list);
      st.head = res.list[res.list.length - 1].id;
      if (splits(type)) st.done = true;
      else if (this.archerTargetIds().has(st.head)) return { placed: out, fail: 'archer', ghost: this.nextSpot(res.list[res.list.length - 1]) };
    }
    return { placed: out };
  }

  /** Onde a peça seguinte nasceria a partir da ponta `h` (fantasma vermelho do aviso). */
  private nextSpot(h: Placed): { x: number; z: number; yaw: number } {
    const o = launchOf(h, this.spec);
    return { x: o.x + Math.sin(o.yaw) * o.step, z: o.z + Math.cos(o.yaw) * o.step, yaw: o.yaw };
  }

  /** Traço completo: nasce em `anchor` (só se ainda não há ponta) e estende até `cur`. Muta o layout. */
  trail(st: Stroke | null, anchor: { x: number; z: number }, cur: { x: number; z: number }, kind: Kind):
    { stroke: Stroke | null; placed: Placed[]; fail?: Fail; ghost?: { x: number; z: number; yaw: number } } {
    const placed: Placed[] = [];
    let s = st;
    if (!s) {
      const b = this.begin(anchor.x, anchor.z, kind, cur);
      if (b.fail) return { stroke: null, placed, fail: b.fail };
      s = b.stroke!;
      if (b.placed) placed.push(...b.placed);
    }
    const r = this.extend(s, cur.x, cur.z, kind);
    return { stroke: s, placed: [...placed, ...r.placed], fail: r.fail, ghost: r.ghost };
  }

  /** Prévia da trilha: o mesmo que `trail`, mas num clone — o layout real não muda. */
  preview(st: Stroke | null, anchor: { x: number; z: number }, cur: { x: number; z: number }, kind: Kind) {
    return this.clone().trail(st && { ...st }, anchor, cur, kind);
  }

  private clone(): Layout {
    const c = new Layout(this.spec, emptyDeck());
    c.entries = this.entries.map((e) => ({ ...e }));
    c.hand = { ...this.hand };
    c.placedCards = this.placedCards;
    c.lockId = this.lockId;
    c.pieces = this.pieces.slice();
    c.nextId = this.nextId;
    c.strokeSeq = this.strokeSeq;
    return c;
  }

  private placeAt(kind: Kind, x: number, z: number, yaw: number, parent: number, stroke: number, ignore: Set<number>):
    { list: Placed[] } | { fail: Fail } {
    const e = this.entries.find((q) => q.kind === kind && q.left > 0);
    if (!e) return { fail: 'empty' };
    const type = e.card.type;
    let list: Placed[];
    if (splits(type)) {
      const px = Math.cos(yaw), pz = -Math.sin(yaw);
      // da direita para a esquerda (mesma ordem da bifurcação: offset negativo = +x local)
      const spots = splitOffsets(type).map((o) => ({ x: x - px * o, z: z - pz * o }));
      for (const s of spots) { const f = this.check(s.x, s.z, ignore); if (f) return { fail: f }; }
      list = spots.map((s) => ({ id: this.nextId++, type, x: s.x, z: s.z, yaw, parent, stroke, card: e.card }));
      if (list.length === 2) { list[0].pair = list[1].id; list[1].pair = list[0].id; }
      else { const ids = list.map((p) => p.id); for (const p of list) p.group = ids; }
    } else {
      const f = this.check(x, z, ignore);
      if (f) return { fail: f };
      // Torta: fica em pé como uma peça comum e, derrubada, pula 90° para o lado mais livre (empate = sorteio pelo id)
      const side = type === 'crooked' ? this.crookedSide(x, z, yaw, ignore) : undefined;
      list = [{ id: this.nextId++, type, x, z, yaw, parent, stroke, card: e.card, ...(side ? { side } : {}) }];
    }
    this.pieces.push(...list);
    e.left--;
    if (e.left <= 0) this.entries.splice(this.entries.indexOf(e), 1);
    this.recount();
    this.placedCards++;
    return { list };
  }

  /** Lado do pulo da Torta: o primeiro em que a próxima peça cabe (onde ela pousa). */
  private crookedSide(x: number, z: number, yaw: number, ignore: Set<number>): 1 | -1 {
    const sides: (1 | -1)[] = this.nextId % 2 ? [1, -1] : [-1, 1];
    for (const sd of sides) {
      const y = yaw + sd * Math.PI / 2;
      if (this.check(x + Math.sin(y) * CROOK_DIST, z + Math.cos(y) * CROOK_DIST, ignore) === null) return sd;
    }
    return sides[0];
  }

  /** Uma peça tirada da mesa volta para a mão (a Dupla recupera o uso que tinha gastado). */
  private giveBack(card: Card) {
    const e = this.entries.find((q) => q.card.uid === card.uid);
    if (e) e.left++;
    else this.entries.push({ card, kind: kindOf(card), left: 1 });
    this.recount();
  }

  /** Remove uma ponta (bifurcação sai inteira). Devolve ids removidos. */
  removeHead(id: number): number[] {
    const p = this.get(id);
    if (!p) return [];
    const group = p.group ? p.group.map((id) => this.get(id)).filter(Boolean) as Placed[]
      : p.pair ? [p, this.get(p.pair)].filter(Boolean) as Placed[] : [p];
    if (group.some((g) => this.locked(g) || this.children(g.id).length > 0)) return [];
    const ids = group.map((g) => g.id);
    this.pieces = this.pieces.filter((q) => !ids.includes(q.id));
    if (p.card) this.giveBack(p.card);
    else { this.hand[p.type]++; }
    this.placedCards--;
    return ids;
  }

  /** Desfaz o último traço inteiro (pontas primeiro). */
  undoStroke(): number[] {
    const free = this.pieces.filter((p) => !this.locked(p));
    if (!free.length) return [];
    const last = Math.max(...free.map((p) => p.stroke));
    const removed: number[] = [];
    for (let guard = 0; guard < 500; guard++) {
      const heads = this.heads().filter((h) => h.stroke === last);
      if (!heads.length) break;
      for (const h of heads) removed.push(...this.removeHead(h.id));
    }
    return removed;
  }

  /** Devolve à mão tudo que foi colocado com a mão atual (peças de mãos anteriores ficam). */
  clear(): number[] {
    const removed: number[] = [];
    for (let guard = 0; guard < 500; guard++) {
      const heads = this.heads().filter((h) => !this.locked(h));
      if (!heads.length) break;
      let n = 0;
      for (const h of heads) { const ids = this.removeHead(h.id); removed.push(...ids); n += ids.length; }
      if (!n) break;
    }
    return removed;
  }

}
