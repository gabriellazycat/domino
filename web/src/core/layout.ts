import { PIECES, PieceId, Deck, FORK_OFFSET } from './pieces';
import { BOARD, BOARD_MARGIN, ENEMY_RADIUS, PhaseSpec, rectDist } from './mapgen';

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
  jump?: boolean; // nasceu depois de um poço de lava
}

export type Fail = 'board' | 'wall' | 'enemy' | 'lava' | 'piece' | 'empty' | 'nohead' | 'trigger' | 'lavaJump';

export const FAIL_TEXT: Record<Fail, string> = {
  board: 'Fora da mesa!',
  wall: 'Bloqueado pelo muro — contorne!',
  enemy: 'Muito perto do inimigo.',
  lava: 'Lava! Não dá pra construir aí.',
  lavaJump: 'Lava! Coloque uma GRANDE ou TORRE logo antes do poço.',
  piece: 'Esbarra em outra peça.',
  empty: 'Acabaram as peças desse tipo!',
  nohead: 'Continue de uma ponta brilhante.',
  trigger: 'Comece no marcador VERDE!',
};

export const MAX_TURN = (26 * Math.PI) / 180;
const PIECE_CLEAR = 0.24;

export interface Stroke { head: number; done: boolean; id: number }

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Layout {
  pieces: Placed[] = [];
  hand: Deck;
  readonly startHand: Deck;
  private nextId = 1;
  private strokeSeq = 0;

  constructor(public spec: PhaseSpec, hand: Deck) {
    this.hand = { ...hand };
    this.startHand = { ...hand };
  }

  get(id: number): Placed | undefined { return this.pieces.find((p) => p.id === id); }
  children(id: number): Placed[] { return this.pieces.filter((p) => p.parent === id); }
  heads(): Placed[] {
    const hasChild = new Set(this.pieces.map((p) => p.parent));
    return this.pieces.filter((p) => !hasChild.has(p.id));
  }
  root(): Placed | undefined { return this.pieces.find((p) => p.parent === -1); }
  cardsUsed(): number {
    let n = 0;
    for (const k of Object.keys(this.hand) as PieceId[]) n += this.startHand[k] - this.hand[k];
    return n;
  }

  /** Validade de um ponto para uma peça (raio de pegada aproximado). */
  check(x: number, z: number, ignore: Set<number>): Fail | null {
    if (Math.abs(x) > BOARD.w / 2 - BOARD_MARGIN || Math.abs(z) > BOARD.d / 2 - BOARD_MARGIN) return 'board';
    for (const w of this.spec.walls) if (rectDist(x, z, w) < 0.22) return 'wall';
    for (const e of this.spec.enemies) {
      if (e.patrol) continue; // rota de patrulha é construível (ele empurra o que estiver em pé)
      if (Math.hypot(e.x - x, e.z - z) < ENEMY_RADIUS[e.kind] + 0.24) return 'enemy';
    }
    for (const l of this.spec.lava) if (Math.hypot(l.x - x, l.z - z) < l.r + 0.14) return 'lava';
    for (const p of this.pieces) {
      if (ignore.has(p.id)) continue;
      if (Math.hypot(p.x - x, p.z - z) < PIECE_CLEAR) return 'piece';
    }
    return null;
  }

  /** Ponto de partida de um traço: gatilho (vazio) ou ponta próxima. */
  begin(x: number, z: number, type: PieceId): { stroke?: Stroke; placed?: Placed[]; fail?: Fail } {
    const t = this.spec.trigger;
    if (this.pieces.length === 0) {
      if (Math.hypot(x - t.x, z - t.z) > 0.8) return { fail: 'trigger' };
      const id = ++this.strokeSeq;
      const placed = this.placeAt(type, t.x, t.z, t.yaw, -1, id, new Set());
      if ('fail' in placed) return { fail: placed.fail };
      const last = placed.list[placed.list.length - 1];
      return { stroke: { head: last.id, done: type === 'fork', id }, placed: placed.list };
    }
    const h = this.nearestHead(x, z, 0.65);
    if (!h) return { fail: 'nohead' };
    return { stroke: { head: h.id, done: false, id: ++this.strokeSeq } };
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
  extend(st: Stroke, cx: number, cz: number, type: PieceId): { placed: Placed[]; fail?: Fail; ghost?: { x: number; z: number; yaw: number } } {
    const out: Placed[] = [];
    for (let guard = 0; guard < 60 && !st.done; guard++) {
      const h = this.get(st.head);
      if (!h) { st.done = true; break; }
      const step = PIECES[type].step;
      const dx = cx - h.x, dz = cz - h.z;
      if (Math.hypot(dx, dz) < step * 0.9) break;
      const desired = Math.atan2(dx, dz);
      // bifurcação nasce alinhada à ponta: as duas metades ficam dentro da faixa de queda dela
      const turn = type === 'fork' ? 0 : MAX_TURN;
      const diff = Math.max(-turn, Math.min(turn, wrapAngle(desired - h.yaw)));
      const yaw = wrapAngle(h.yaw + diff);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      let res = this.placeAt(type, h.x + fx * step, h.z + fz * step, yaw, h.id, st.id, new Set([h.id]));
      if ('fail' in res && (res.fail === 'lava')) {
        // pulo: procura o 1º ponto livre depois do poço, dentro do alcance da ponta
        const reach = PIECES[h.type].reach;
        let jumped: { list: Placed[] } | { fail: Fail } | null = null;
        for (let d = step + 0.05; d <= reach + 1e-6; d += 0.04) {
          const r2 = this.placeAt(type, h.x + fx * d, h.z + fz * d, yaw, h.id, st.id, new Set([h.id]), true);
          if (!('fail' in r2)) { jumped = r2; break; }
          if (r2.fail !== 'lava') break;
        }
        res = jumped ?? { fail: 'lavaJump' as Fail };
      }
      if ('fail' in res) return { placed: out, fail: res.fail, ghost: { x: h.x + fx * step, z: h.z + fz * step, yaw } };
      out.push(...res.list);
      st.head = res.list[res.list.length - 1].id;
      if (type === 'fork') st.done = true;
    }
    return { placed: out };
  }

  /** Traço completo: nasce em `anchor` (só se ainda não há ponta) e estende até `cur`. Muta o layout. */
  trail(st: Stroke | null, anchor: { x: number; z: number }, cur: { x: number; z: number }, type: PieceId):
    { stroke: Stroke | null; placed: Placed[]; fail?: Fail; ghost?: { x: number; z: number; yaw: number } } {
    const placed: Placed[] = [];
    let s = st;
    if (!s) {
      const b = this.begin(anchor.x, anchor.z, type);
      if (b.fail) return { stroke: null, placed, fail: b.fail };
      s = b.stroke!;
      if (b.placed) placed.push(...b.placed);
    }
    const r = this.extend(s, cur.x, cur.z, type);
    return { stroke: s, placed: [...placed, ...r.placed], fail: r.fail, ghost: r.ghost };
  }

  /** Prévia da trilha: o mesmo que `trail`, mas num clone — o layout real não muda. */
  preview(st: Stroke | null, anchor: { x: number; z: number }, cur: { x: number; z: number }, type: PieceId) {
    return this.clone().trail(st && { ...st }, anchor, cur, type);
  }

  private clone(): Layout {
    const c = new Layout(this.spec, this.hand);
    c.pieces = this.pieces.slice();
    c.nextId = this.nextId;
    c.strokeSeq = this.strokeSeq;
    return c;
  }

  private placeAt(type: PieceId, x: number, z: number, yaw: number, parent: number, stroke: number, ignore: Set<number>, jump = false):
    { list: Placed[] } | { fail: Fail } {
    if (this.hand[type] <= 0) return { fail: 'empty' };
    if (type === 'fork') {
      const px = Math.cos(yaw), pz = -Math.sin(yaw);
      const a = { x: x + px * FORK_OFFSET, z: z + pz * FORK_OFFSET };
      const b = { x: x - px * FORK_OFFSET, z: z - pz * FORK_OFFSET };
      const fa = this.check(a.x, a.z, ignore), fb = this.check(b.x, b.z, ignore);
      if (fa || fb) return { fail: (fa || fb)! };
      const pa: Placed = { id: this.nextId++, type, x: a.x, z: a.z, yaw, parent, stroke, jump };
      const pb: Placed = { id: this.nextId++, type, x: b.x, z: b.z, yaw, parent, stroke, jump };
      pa.pair = pb.id; pb.pair = pa.id;
      this.pieces.push(pa, pb);
      this.hand[type]--;
      return { list: [pa, pb] };
    }
    const f = this.check(x, z, ignore);
    if (f) return { fail: f };
    const p: Placed = { id: this.nextId++, type, x, z, yaw, parent, stroke, jump };
    this.pieces.push(p);
    this.hand[type]--;
    return { list: [p] };
  }

  /** Remove uma ponta (bifurcação sai inteira). Devolve ids removidos. */
  removeHead(id: number): number[] {
    const p = this.get(id);
    if (!p) return [];
    const group = p.pair ? [p, this.get(p.pair)].filter(Boolean) as Placed[] : [p];
    if (group.some((g) => this.children(g.id).length > 0)) return [];
    const ids = group.map((g) => g.id);
    this.pieces = this.pieces.filter((q) => !ids.includes(q.id));
    this.hand[p.type]++;
    return ids;
  }

  /** Desfaz o último traço inteiro (pontas primeiro). */
  undoStroke(): number[] {
    if (!this.pieces.length) return [];
    const last = Math.max(...this.pieces.map((p) => p.stroke));
    const removed: number[] = [];
    for (let guard = 0; guard < 500; guard++) {
      const heads = this.heads().filter((h) => h.stroke === last);
      if (!heads.length) break;
      for (const h of heads) removed.push(...this.removeHead(h.id));
    }
    return removed;
  }

  clear(): number[] {
    const ids = this.pieces.map((p) => p.id);
    this.pieces = [];
    this.hand = { ...this.startHand };
    return ids;
  }
}
