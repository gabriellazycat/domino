import { PIECES, PIECE_ORDER, Deck, emptyDeck } from '../core/pieces';
import { Card, Kind, kindOf, kindRank, usesOf, SEALS } from '../core/cards';
import type { HandEntry } from '../core/layout';
import { audio } from '../game/audio';
import { sealImg } from '../game/sigils';
import { icon } from './icons';

// A mão: os dominós ficam seguros em LEQUE (como cartas na mão), saindo da borda de baixo da tela;
// a CAIXA de peças (o baralho) fica à esquerda e o DESCARTE (um retângulo pontilhado) à direita.
// Aqui fica só a parte HTML (procurações invisíveis: clique, layout e animações); quem desenha os
// dominós e a caixa em 3D é o game/handrender.ts, copiando estas posições.
// Cada peça da mão é uma peça única da caixa (uid), com seus selos; a escolha na mão é por "kind"
// (tipo + selos). Toda operação muda o modelo na hora (ele fica sempre igual à mão do Layout); as
// animações são só transições/Web Animations saindo de onde cada peça está.
//
// Modo ESCOLHA (eventos): o leque mostra uma peça de cada kind da sua caixa para você escolher
// (prensa de selos, quebrar peça na loja); caixa, descarte e botões somem.

export interface ScreenPt { x: number; y: number }
/** Uma peça da mão indo para a mesa (ou voltando dela). `stay`: a carta continua na mão (Dupla). */
export interface CardMove { card: Card; at: ScreenPt | null; stay?: boolean }

export interface HandViewCallbacks {
  select(kind: Kind): void;
  newHand(): void;
  undo(): void;
  clear(): void;
  deck(): void;
  tip(html: string | null): void;
  /** o conjunto foi medido de novo: `right` = borda direita (px) do descarte */
  layoutChanged?(right: number): void;
}

interface Piece { card: Card; kind: Kind; left: number; el: HTMLElement; mood: Face; hover: boolean; landing: boolean }

/** Expressões. As de "repouso" se revezam sozinhas; as outras vêm do que está acontecendo. */
type Face = 'bored' | 'sleepy' | 'curious' | 'smug' | 'worried' | 'scared' | 'nervous' | 'sad' | 'wow' | 'scream';
/** Em repouso ninguém na mão está feliz: indiferentes, tristes ou com medo do que vem. */
const IDLE: Face[] = ['bored', 'bored', 'smug', 'sad', 'sad', 'worried', 'worried', 'curious', 'sleepy', 'nervous'];

/** Faixa de baixo com os nomes (caixa, descarte). */
const LABEL = 22;
/** Folga em cima das peças (peça levantada + botões). */
const TOP = 84;
/** Proporção da caixa de cada peça (largura × altura). */
const PIECE_RATIO = 2;
/** Parte de cada peça escondida abaixo da borda da tela (como cartas seguras na mão). */
const CUT = 0.2;
/** Abertura entre peças vizinhas no leque (graus) e abertura máxima do leque inteiro. */
const FAN_STEP = 8;
const FAN_MAX = 46;
/** Marcadores lidos pela camada 3D: base (a) e topo (b) da peça. */
const MARKS = '<i class="mk a"></i><i class="mk b"></i>';

// As animações da mão tocam mesmo com "reduzir movimento" do sistema: são curtas e são elas que
// mostram de onde cada peça vem e para onde vai. O balanço e as caras das peças também ficam: é o
// "estar vivo" da mão (o pedido de reduzir movimento corta só os enfeites de texto, no CSS).

const div = (cls: string, html = ''): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export class HandView {
  root = div('handbar');
  /** tamanho da mão (regra + bênção Mão Grande), para o texto do botão Nova mão */
  handSize = 7;
  private boxEl = div('store box hit');
  private bowlEl = div('store bowl hit');
  private nextEl = div('next-chip');
  private handLbl = div('hand-lbl');
  private newBtn: HTMLButtonElement;
  private editRow = div('pile-actions');
  private pieces: Piece[] = [];
  private selected: Kind | null = null;
  private useKind: Kind | null = null;
  private useN = 0;
  private doomed = false;
  /** textos embaixo de cada peça no modo escolha (ex.: "×9"), por uid */
  private labels = new Map<number, string>();
  /** números exibidos (andam junto com as animações) e reais (o que o jogo diz) */
  private drawShown = 0;
  private discardShown = 0;
  private drawReal = 0;
  private discardReal = 0;
  private drawComp: Deck = emptyDeck();
  private next: Card | null = null;
  private timers = new Set<number>();
  /** largura/altura de uma peça na tela */
  private pw = 52;
  private ph = 95;
  /** caixa e descarte */
  private bw = 96;
  private bh = 77;
  private H = 0;
  private cx = 0;
  /** leque: raio (até o centro das peças) e altura do pivô, lá embaixo da tela */
  private fanR = 300;
  private pivotY = 0;
  private boxPos = { x: 0, y: 0 };
  private bowlPos = { x: 0, y: 0 };
  /** lugar de cada peça no leque (as compras voam até ele) */
  private target = new WeakMap<HTMLElement, { x: number; y: number; r: number }>();
  private mouse = { x: -1, y: -1 };
  private lookRaf = 0;

  constructor(private cb: HandViewCallbacks) {
    this.boxEl.innerHTML = `<div class="n">0</div><div class="lbl">Caixa</div>`;
    this.bowlEl.innerHTML = `<div class="n">0</div><div class="lbl">Descarte</div>`;
    this.root.append(this.boxEl, this.bowlEl, this.nextEl);
    this.boxEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); audio.ui('click'); cb.deck(); });
    this.boxEl.addEventListener('mouseenter', () => { audio.ui('hover'); cb.tip(this.boxTip()); });
    this.boxEl.addEventListener('mouseleave', () => cb.tip(null));
    this.bowlEl.addEventListener('mouseenter', () => cb.tip(`<b>Descarte · ${this.discardReal}</b>Peças que você deixou de lado nesta tentativa. Só voltam para a caixa se a fase recomeçar.`));
    this.bowlEl.addEventListener('mouseleave', () => cb.tip(null));

    const b = document.createElement('button');
    b.className = 'btn dark small newhand';
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); cb.newHand(); });
    b.addEventListener('mouseenter', () => { audio.ui('hover'); this.doomed = this.drawReal > 0 && !this.newBtn.classList.contains('cursed'); this.decorate(); });
    b.addEventListener('mouseleave', () => { this.doomed = false; this.decorate(); });
    this.newBtn = b;
    const small = (html: string, title: string, fn: () => void) => {
      const e = document.createElement('button');
      e.className = 'btn dark small';
      e.innerHTML = html;
      e.title = title;
      e.addEventListener('click', (ev) => { ev.stopPropagation(); audio.unlock(); fn(); });
      e.addEventListener('mouseenter', () => audio.ui('hover'));
      return e;
    };
    this.editRow.append(
      small(`${icon('undo')} Desfazer`, 'Desfaz o último traço (Ctrl+Z)', () => cb.undo()),
      small(`${icon('clear')} Limpar`, 'Devolve à mão as peças colocadas com esta mão (R)', () => cb.clear()),
    );
    this.root.append(b, this.editRow, this.handLbl);

    window.addEventListener('resize', () => { this.measure(); this.layout(); });
    // os olhos seguem o mouse
    window.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (!this.lookRaf) this.lookRaf = requestAnimationFrame(() => { this.lookRaf = 0; this.look(); });
    });
    // de vez em quando alguém na mão muda de cara (tédio, sono, curiosidade…)
    window.setInterval(() => {
      if (!this.pieces.length || document.hidden) return;
      const p = pick(this.pieces);
      p.mood = pick(IDLE);
      this.decorate();
    }, 1900);
    this.measure();
    this.renderStores();
  }

  // ---------- consultas ----------
  /** Kinds na mão, na ordem em que aparecem (teclas 1–9). */
  kinds(): Kind[] {
    const out: Kind[] = [];
    for (const p of this.pieces) if (!out.includes(p.kind)) out.push(p.kind);
    return out;
  }

  /** Centro (px de tela) da peça `uid` no leque. */
  pieceScreen(uid: number): ScreenPt | null {
    const p = this.pieces.find((q) => q.card.uid === uid);
    const t = p && this.target.get(p.el);
    if (!t) return null;
    const r = this.root.getBoundingClientRect();
    return { x: r.left + t.x + this.pw / 2, y: r.top + t.y + this.ph / 2 };
  }

  // ---------- estado ----------
  select(kind: Kind | null) {
    if (this.selected === kind) return;
    this.selected = kind;
    this.decorate();
  }

  /** Quantas peças de `kind` a trilha fantasma vai gastar (elas se levantam, com medo). */
  preview(kind: Kind | null, n: number) {
    if (this.useKind === kind && this.useN === n) return;
    this.useKind = kind;
    this.useN = n;
    this.decorate();
  }

  /** Números reais; os exibidos só são corrigidos quando nenhuma animação está andando. `next`: bênção Vidente. */
  setPiles(draw: number, discard: number, comp: Deck, next: Card | null = null) {
    this.drawReal = draw;
    this.discardReal = discard;
    this.drawComp = comp;
    this.next = next;
    if (!this.timers.size) { this.drawShown = draw; this.discardShown = discard; }
    this.renderStores();
  }

  hide(on: boolean) {
    this.root.classList.toggle('away', on);
    if (on) this.cb.tip(null);
    else { this.measure(); this.layout(); }
  }

  /** Chama atenção para a caixa e o botão Nova mão. */
  nudge() {
    for (const el of [this.newBtn, this.boxEl]) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); }
  }

  flash(kind: Kind) {
    for (const p of this.pieces) {
      if (p.kind !== kind) continue;
      p.el.classList.remove('flash'); void p.el.offsetWidth; p.el.classList.add('flash');
    }
  }

  /** Rede de segurança: se o desenho divergiu da mão do jogo, reconstrói sem animação. */
  sync(entries: readonly HandEntry[]) {
    const same = entries.length === this.pieces.length
      && entries.every((e) => this.pieces.some((p) => p.card.uid === e.card.uid && p.kind === e.kind));
    if (same) {
      for (const e of entries) { const p = this.pieces.find((q) => q.card.uid === e.card.uid)!; p.left = e.left; }
      return;
    }
    for (const p of this.pieces) p.el.remove();
    this.pieces = [];
    for (const e of entries) {
      const p = this.makePiece(e.card);
      p.left = e.left;
      this.root.append(p.el);
      this.pieces.splice(this.insertAt(p.kind), 0, p);
    }
    this.layout();
  }

  /** Mesa nova: some tudo, caixa com `draw` peças. */
  reset(draw: number, discard = 0) {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const el of Array.from(this.root.querySelectorAll('.hp'))) el.remove();
    this.pieces = [];
    this.labels.clear();
    this.root.classList.remove('choose');
    this.useKind = null; this.useN = 0;
    this.drawShown = this.drawReal = draw;
    this.discardShown = this.discardReal = discard;
    this.measure();
    this.layout();
  }

  // ---------- modo escolha (eventos) ----------
  /** Mostra uma peça de cada kind para o jogador escolher (`count` vira o rótulo "×N"). */
  chooseStart(items: { card: Card; count: number }[]) {
    this.reset(0);
    this.root.classList.add('choose');
    for (const it of items) if (it.count > 1) this.labels.set(it.card.uid, `×${it.count}`);
    this.deal(items.map((it) => it.card), 0, 120, 'below');
  }

  /** Fim da escolha: as peças que sobraram descem e somem. */
  chooseEnd() {
    const list = this.pieces;
    this.pieces = [];
    list.forEach((p, k) => {
      const t = this.target.get(p.el);
      p.el.classList.add('leaving-d');
      p.el.style.transitionDelay = `${k * 30}ms`;
      if (t) p.el.style.transform = this.tf(t.x, t.y + this.ph * 1.4, t.r);
      this.later(k * 30 + 500, () => p.el.remove());
    });
    this.labels.clear();
    this.later(list.length * 30 + 520, () => this.root.classList.remove('choose'));
    this.cb.tip(null);
  }

  /** A peça escolhida sai do leque e voa até `to` (px de tela), encolhendo. */
  takeOut(uid: number, to: ScreenPt) {
    const i = this.pieces.findIndex((p) => p.card.uid === uid);
    if (i < 0) return;
    const [p] = this.pieces.splice(i, 1);
    const r = this.root.getBoundingClientRect();
    p.el.dataset.face = 'scared';
    p.el.classList.add('leaving');
    p.el.style.zIndex = '800';
    p.el.style.transform = this.tf(to.x - r.left - this.pw / 2, to.y - r.top - this.ph / 2, 90, 0.5);
    p.el.style.opacity = '0';
    this.later(560, () => p.el.remove());
    this.cb.tip(null);
    this.layout();
  }

  // ---------- animações ----------
  /**
   * Pegar peças: cada uma pula de dentro da caixa, dá uma cambalhota no ar e cai de pé no leque.
   * O `.hp` já nasce no lugar final (o leque pode se rearrumar durante o voo); quem viaja é o
   * `.hp-pull` de dentro, saindo da caixa (ou de baixo da tela) até deslocamento zero.
   */
  deal(cards: Card[], drawAfter: number, delay = 0, from: 'box' | 'below' = 'box') {
    const n = cards.length;
    const step = from === 'box' ? 150 : 70;
    const dur = from === 'box' ? 820 : 620;
    const fresh: { p: Piece; t: number; k: number }[] = [];
    cards.forEach((card, k) => {
      const p = this.makePiece(card);
      p.landing = true;
      p.el.classList.add('flying');
      p.el.style.transition = 'none';
      this.root.append(p.el);
      this.pieces.splice(this.insertAt(p.kind), 0, p);
      fresh.push({ p, t: delay + k * step, k });
    });
    this.layout();
    void this.root.offsetWidth; // as novas já estão no lugar final; agora religa as transições
    const unrot = (x: number, y: number, deg: number) => {
      const a = (-deg * Math.PI) / 180;
      return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
    };
    const tf = (v: { x: number; y: number }, r: number, sx = 1, sy = sx) => `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${sx}, ${sy})`;
    // boca da caixa (onde as peças estão guardadas)
    const inX = this.boxPos.x + this.bw / 2 - this.pw / 2;
    const inY = this.boxPos.y + this.bh * 0.5 - this.ph / 2;
    for (const { p, t, k } of fresh) {
      const el = p.el;
      el.style.transition = '';
      const s = this.target.get(el)!;
      const pull = el.querySelector('.hp-pull') as HTMLElement;
      let anim: Animation;
      if (from === 'box') {
        const side = ((k * 7) % 5 - 2) * this.pw * 0.12;
        const p0 = unrot(inX + side - s.x, inY - s.y + this.bh * 0.15, s.r);              // lá dentro
        const p1 = unrot(inX + side - s.x, inY - s.y - this.ph * 0.5, s.r);               // pulou para fora
        const p2 = unrot((inX - s.x) * 0.4, (inY - s.y) * 0.4 - this.ph * 0.95, s.r);     // topo do arco
        anim = pull.animate([
          { transform: tf(p0, -s.r, 0.5), easing: 'cubic-bezier(.15, .75, .35, 1)' },
          { transform: tf(p1, -s.r - 12, 1.08), offset: 0.3, easing: 'cubic-bezier(.4, 0, .6, 1)' },
          { transform: tf(p2, 200, 1.12), offset: 0.62, easing: 'cubic-bezier(.45, 0, .75, .6)' },
          { transform: tf({ x: 0, y: 2 }, 360, 1.14, 0.84), offset: 0.88, easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
          { transform: tf({ x: 0, y: 0 }, 360) },
        ], { duration: dur, delay: t, fill: 'backwards' });
        // enquanto está dentro da caixa a parede da frente tampa a peça; ao sair, a peça passa por cima
        el.animate([{ zIndex: 300 - k }, { zIndex: 300 - k, offset: 0.22 }, { zIndex: 700 - k, offset: 0.23 }, { zIndex: 700 - k }],
          { duration: dur, delay: t, fill: 'backwards' });
        audio.card((t + 30) / 1000);
        this.later(t + dur * 0.2, () => {
          this.drawShown = drawAfter + (n - 1 - k);
          this.renderStores();
          this.boxEl.classList.remove('pull'); void this.boxEl.offsetWidth; this.boxEl.classList.add('pull');
        });
      } else {
        // sobe de baixo da tela, como quem tira as peças do bolso
        anim = pull.animate([
          { transform: `translate(0px, ${this.ph * 1.3}px) rotate(0deg)`, easing: 'cubic-bezier(.2, .9, .3, 1.15)' },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ], { duration: dur, delay: t, fill: 'backwards' });
      }
      const done = () => { el.classList.remove('flying'); p.landing = false; this.decorate(); };
      anim.onfinish = done;
      anim.oncancel = done;
      audio.card((t + dur * 0.86) / 1000, true);
    }
    this.decorate();
  }

  /** Colocar: as peças usadas pulam do leque e voam até onde nasceram na mesa. */
  play(moves: CardMove[]) {
    const r = this.root.getBoundingClientRect();
    moves.forEach((m, k) => {
      const i = this.pieces.findIndex((p) => p.card.uid === m.card.uid);
      if (i < 0) return;
      let el: HTMLElement;
      if (m.stay) {
        // a Dupla fica na mão: quem voa é uma cópia saindo de cima dela
        const src = this.pieces[i];
        const t = this.target.get(src.el);
        const twin = this.makePiece(m.card);
        el = twin.el;
        el.style.transition = 'none';
        if (t) el.style.transform = this.tf(t.x, t.y, t.r);
        this.root.append(el);
        void el.offsetWidth;
        el.style.transition = '';
        src.left = Math.max(0, src.left - 1);
        src.el.classList.remove('flash'); void src.el.offsetWidth; src.el.classList.add('flash');
      } else {
        el = this.pieces.splice(i, 1)[0].el;
      }
      el.dataset.face = 'scream';
      el.classList.add('leaving');
      el.style.transitionDelay = `${k * 45}ms`;
      el.style.zIndex = '800';
      const to = m.at ? { x: m.at.x - r.left - this.pw / 2, y: m.at.y - r.top - this.ph * 0.75 } : { x: this.cx, y: -this.ph };
      el.style.transform = this.tf(to.x, to.y, (Math.random() - 0.5) * 50, 0.35);
      el.style.opacity = '0';
      this.later(k * 45 + 560, () => el.remove());
    });
    this.useKind = null; this.useN = 0;
    this.cb.tip(null);
    this.layout();
  }

  /** Desfazer: as peças tiradas da mesa voltam pulando para o leque, aliviadas. */
  give(moves: CardMove[]) {
    const r = this.root.getBoundingClientRect();
    const fresh: Piece[] = [];
    for (const m of moves) {
      const have = this.pieces.find((p) => p.card.uid === m.card.uid);
      if (have) { have.left++; have.el.classList.remove('flash'); void have.el.offsetWidth; have.el.classList.add('flash'); continue; }
      const p = this.makePiece(m.card);
      p.left = 1;
      p.mood = 'bored';
      p.el.style.transition = 'none';
      const at = m.at ? { x: m.at.x - r.left - this.pw / 2, y: m.at.y - r.top - this.ph * 0.75 } : { x: this.cx, y: -this.ph };
      p.el.style.transform = this.tf(at.x, at.y, 0, 0.35);
      p.el.style.opacity = '0';
      this.root.append(p.el);
      this.pieces.splice(this.insertAt(p.kind), 0, p);
      fresh.push(p);
    }
    void this.root.offsetWidth;
    for (const p of fresh) { p.el.style.transition = ''; p.el.style.opacity = ''; }
    this.layout();
  }

  /**
   * Nova mão: o que sobrou no leque cai, triste, no descarte — menos as Guardadas (`keep`), que
   * ficam. Com a bênção Reciclagem (`toBox`), as sobras voltam para a caixa.
   */
  discard(discardAfter: number, keep: ReadonlySet<number> = new Set(), toBox = false) {
    const list = this.pieces.filter((p) => !keep.has(p.card.uid));
    this.pieces = this.pieces.filter((p) => keep.has(p.card.uid));
    const n = list.length;
    list.forEach((p, k) => {
      const el = p.el;
      const t = k * 50;
      el.dataset.face = toBox ? 'wow' : 'sad';
      el.classList.add('leaving-d');
      el.style.transitionDelay = `${t}ms`;
      el.style.zIndex = '300';
      const dst = toBox ? this.boxPos : this.bowlPos;
      el.style.transform = this.tf(dst.x + this.bw / 2 - this.pw / 2, dst.y + this.bh / 2 - this.ph / 2,
        (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 50), 0.4);
      this.later(t + 460, () => {
        el.remove();
        if (!toBox) { this.discardShown = discardAfter - (n - 1 - k); this.renderStores(); }
        audio.card(0, true);
      });
    });
    if (toBox && n) this.later((n - 1) * 50 + 470, () => { this.boxEl.classList.remove('riffle'); void this.boxEl.offsetWidth; this.boxEl.classList.add('riffle'); audio.shuffle(); });
    this.useKind = null; this.useN = 0;
    this.cb.tip(null);
    this.layout();
    return n ? (n - 1) * 50 + 460 : 0;
  }

  /**
   * Recomeçar: as peças do leque, do descarte e da mesa (`from`, em pixels de tela) voltam para a
   * caixa, que é sacudida. Devolve quanto tempo (ms) isso leva, para a nova mão vir depois.
   */
  gather(drawTotal: number, from: ScreenPt[] = []) {
    const r = this.root.getBoundingClientRect();
    const inX = this.boxPos.x + this.bw / 2 - this.pw / 2, inY = this.boxPos.y + this.bh * 0.5 - this.ph * 0.5;
    const fly = (el: HTMLElement, t: number) => {
      el.classList.add('leaving-d');
      el.style.transitionDelay = `${t}ms`;
      el.style.zIndex = '300';
      el.style.transform = this.tf(inX + (Math.random() - 0.5) * this.bw * 0.3, inY, (Math.random() - 0.5) * 120, 0.45);
      this.later(t + 500, () => el.remove());
    };
    let k = 0;
    for (const p of this.pieces) { p.el.dataset.face = 'wow'; fly(p.el, k++ * 35); }
    this.pieces = [];
    const ghosts: { el: HTMLElement; t: number }[] = [];
    const spawn = (x: number, y: number, s: number) => {
      const el = div('hp ghost', `<div class="hp-pull"><div class="hp-in">${MARKS}</div></div>`);
      el.style.transition = 'none';
      el.style.transform = this.tf(x, y, (Math.random() - 0.5) * 40, s);
      this.root.append(el);
      ghosts.push({ el, t: k++ * 35 });
    };
    for (let i = 0; i < Math.min(this.discardShown, 6); i++) spawn(this.bowlPos.x + this.bw / 2 - this.pw / 2, this.bowlPos.y + this.bh / 2 - this.ph / 2, 0.4);
    for (const p of from.slice(0, 14)) spawn(p.x - r.left - this.pw / 2, p.y - r.top - this.ph * 0.75, 0.4);
    this.discardShown = 0;
    this.renderStores();
    void this.root.offsetWidth;
    for (const g of ghosts) { g.el.style.transition = ''; fly(g.el, g.t); }
    const land = Math.min(k, 20) * 35 + 500;
    this.later(land, () => {
      this.drawShown = drawTotal;
      this.renderStores();
      this.boxEl.classList.remove('riffle'); void this.boxEl.offsetWidth; this.boxEl.classList.add('riffle');
      audio.shuffle();
    });
    this.useKind = null; this.useN = 0;
    this.layout();
    return land + 520;
  }

  // ---------- interno ----------
  private later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
  }

  private tf(x: number, y: number, r = 0, s = 1) {
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${s})`;
  }

  /** Mantém a mão agrupada por kind (mesma ordem das teclas). */
  private insertAt(kind: Kind): number {
    const o = kindRank(kind);
    let i = 0;
    while (i < this.pieces.length && kindRank(this.pieces[i].kind) <= o) i++;
    return i;
  }

  private tipFor(p: Piece): string {
    const d = PIECES[p.card.type];
    const seals = p.card.seals.map((s) => `<div class="tip-seal">${sealImg(s)}<span><b>${SEALS[s].name}</b> ${SEALS[s].desc}</span></div>`).join('');
    const left = p.card.seals.includes('double') && this.labels.size === 0 ? `<small>${p.left} de 2 restante${p.left === 1 ? '' : 's'}</small>` : '';
    return `<b>${d.name}</b>${d.desc}${seals}${left}`;
  }

  private makePiece(card: Card): Piece {
    const el = div('hp hit', `<div class="hp-pull"><div class="hp-in">${MARKS}</div></div><span class="hp-key"></span>`);
    el.dataset.type = card.type;
    el.dataset.uid = String(card.uid);
    el.dataset.seals = card.seals.join(',');
    // cada peça pisca e balança no seu próprio ritmo
    el.style.setProperty('--sw', `${(-Math.random() * 3).toFixed(2)}s`);
    const p: Piece = { card, kind: kindOf(card), left: usesOf(card), el, mood: pick(IDLE), hover: false, landing: false };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); this.cb.select(p.kind); });
    el.addEventListener('mouseenter', () => { p.hover = true; audio.ui('hover'); this.cb.tip(this.tipFor(p)); this.decorate(); });
    el.addEventListener('mouseleave', () => { p.hover = false; this.cb.tip(null); this.decorate(); });
    return p;
  }

  private measure() {
    const W = window.innerWidth;
    this.pw = Math.round(Math.max(46, Math.min(76, W * 0.052)));
    this.ph = Math.round(this.pw * PIECE_RATIO);
    this.bw = Math.round(this.pw * 1.35);
    this.bh = Math.round(this.pw * 1.3);
    const shown = this.ph * (1 - CUT);
    this.H = Math.round(shown + TOP);
    // leque: as peças giram em volta de um pivô bem abaixo da tela (a "mão" de quem segura)
    this.fanR = this.ph * 2.6;
    this.cx = Math.round(W / 2);
    this.pivotY = this.H - shown + this.ph / 2 + this.fanR;
    const half = this.fanR * Math.sin((FAN_STEP * 3.5 * Math.PI) / 180) + this.pw * 0.75;
    const gap = Math.round(this.pw * 0.45);
    const floor = this.H - LABEL;
    this.boxPos = { x: Math.round(this.cx - half - gap - this.bw), y: floor - this.bh };
    this.bowlPos = { x: Math.round(this.cx + half + gap), y: floor - this.bh };
    this.root.style.height = `${this.H}px`;
    this.root.style.setProperty('--pw', `${this.pw}px`);
    this.root.style.setProperty('--ph', `${this.ph}px`);
    this.root.style.setProperty('--bw', `${this.bw}px`);
    this.root.style.setProperty('--bh', `${this.bh}px`);
    document.documentElement.style.setProperty('--hand-h', `${Math.round(shown + 20)}px`);
    for (const [el, p] of [[this.boxEl, this.boxPos], [this.bowlEl, this.bowlPos]] as const) {
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
    this.nextEl.style.left = `${this.boxPos.x + this.bw / 2}px`;
    this.nextEl.style.top = `${this.boxPos.y - 86}px`;
    this.newBtn.style.left = `${this.boxPos.x + this.bw / 2}px`;
    this.newBtn.style.top = `${Math.max(2, this.boxPos.y - 54)}px`;
    this.editRow.style.left = `${this.bowlPos.x + this.bw / 2}px`;
    this.editRow.style.top = `${Math.max(2, this.bowlPos.y - 46)}px`;
    this.handLbl.style.left = `${this.cx}px`;
    this.handLbl.style.top = `${Math.round(this.H - shown - 34)}px`;
    // só o descarte divide a faixa de baixo com o DISPARAR (os botões dele ficam mais acima)
    this.cb.layoutChanged?.(this.bowlPos.x + this.bw + 16);
  }

  /** Leque: cada peça gira em volta do pivô; as do meio ficam por cima das dos lados. */
  private layout() {
    const n = this.pieces.length;
    const step = Math.min(FAN_STEP, FAN_MAX / Math.max(1, n - 1));
    this.pieces.forEach((p, i) => {
      const a = (i - (n - 1) / 2) * step;
      const ar = (a * Math.PI) / 180;
      const x = this.cx + this.fanR * Math.sin(ar) - this.pw / 2;
      const y = this.pivotY - this.fanR * Math.cos(ar) - this.ph / 2;
      p.el.style.transform = this.tf(x, y, a);
      p.el.style.zIndex = String(10 + i);
      this.target.set(p.el, { x, y, r: a });
    });
    this.decorate();
    this.renderStores();
    this.look();
  }

  /** Expressão e estado de cada peça (escolhida, vai ser usada, vai ser descartada…). */
  private decorate() {
    const kinds = this.kinds();
    let uses = this.useN;
    for (const p of this.pieces) {
      const use = p.kind === this.useKind && uses > 0;
      if (use) uses -= p.left;
      const sel = p.kind === this.selected;
      const doomed = this.doomed && !p.card.seals.includes('guard');
      p.el.classList.toggle('sel', sel);
      p.el.classList.toggle('use', use);
      p.el.classList.toggle('doomed', doomed);
      const face: Face = p.landing ? 'wow' : doomed ? 'sad' : use ? 'scared' : p.hover ? 'nervous' : sel ? 'worried' : p.mood;
      if (p.el.dataset.face !== face) p.el.dataset.face = face;
      const key = p.el.querySelector('.hp-key')!;
      const first = this.pieces.find((q) => q.kind === p.kind) === p;
      key.textContent = this.labels.size ? (this.labels.get(p.card.uid) ?? '') : first ? String(kinds.indexOf(p.kind) + 1) : '';
    }
  }

  /** Pupilas olhando para o mouse. */
  private look() {
    if (this.mouse.x < 0) return;
    const r = this.root.getBoundingClientRect();
    for (const p of this.pieces) {
      const t = this.target.get(p.el);
      if (!t) continue;
      const ex = r.left + t.x + this.pw / 2, ey = r.top + t.y + this.ph * 0.35;
      const dx = this.mouse.x - ex, dy = this.mouse.y - ey;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / 160);
      p.el.style.setProperty('--px', ((dx / len) * k).toFixed(2));
      p.el.style.setProperty('--py', ((dy / len) * k).toFixed(2));
    }
  }

  private renderStores() {
    const store = (el: HTMLElement, n: number) => {
      const nEl = el.querySelector('.n')!;
      if (nEl.textContent !== String(n)) {
        nEl.textContent = String(n);
        nEl.classList.remove('bump'); void (nEl as HTMLElement).offsetWidth; nEl.classList.add('bump');
      }
      el.classList.toggle('empty', n === 0);
    };
    store(this.boxEl, this.drawShown);
    store(this.bowlEl, this.discardShown);

    const inHand = this.pieces.length;
    const kept = this.pieces.filter((p) => p.card.seals.includes('guard')).length;
    const buy = Math.min(this.handSize, this.drawReal);
    // maldita na mão: o botão fica trancado (clicar só explica e balança a mão)
    const cursed = this.pieces.some((p) => PIECES[p.card.type].cursed);
    this.newBtn.disabled = this.drawReal === 0;
    this.newBtn.classList.toggle('cursed', cursed && this.drawReal > 0);
    this.newBtn.innerHTML = this.drawReal === 0
      ? `Caixa vazia`
      : cursed ? `<span class="l1">🔒 Nova mão</span><small>jogue a maldita</small>`
      : `<span class="l1">⟳ Nova mão<span class="kbd">N</span></span><small>${inHand - kept ? `descarta ${inHand - kept} · ` : ''}pega ${buy}</small>`;
    this.handLbl.classList.toggle('done', inHand === 0 && this.drawReal === 0);
    // com o leque a mão já se conta sozinha; o letreiro só aparece quando ela esvazia
    this.handLbl.classList.toggle('on', inHand === 0 && !this.root.classList.contains('choose'));
    this.handLbl.innerHTML = this.drawReal ? 'Mão vazia' : 'Acabaram as peças — <b>dispare!</b>';
    // bênção Vidente: a próxima peça da caixa
    const nx = this.next;
    this.nextEl.classList.toggle('on', !!nx);
    if (nx) {
      const key = `${nx.uid}`;
      if (this.nextEl.dataset.k !== key) {
        this.nextEl.dataset.k = key;
        this.nextEl.innerHTML = `<span>próxima</span><b>${PIECES[nx.type].name}</b>${nx.seals.map((s) => sealImg(s, 'seal-ico sm')).join('')}`;
      }
    }
  }

  private boxTip(): string {
    const parts = PIECE_ORDER.filter((k) => this.drawComp[k] > 0).map((k) => `${this.drawComp[k]} ${this.drawComp[k] === 1 ? PIECES[k].name : PIECES[k].plural}`);
    return `<b>Caixa · ${this.drawReal} ${this.drawReal === 1 ? 'peça' : 'peças'}</b>${parts.length ? `${parts.join(', ')}. Você pega sem olhar.` : 'Vazia: use o que está na mão e dispare.'}<br><small>clique para ver todas as suas peças</small>`;
  }
}
