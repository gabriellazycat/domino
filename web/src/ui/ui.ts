import { PIECES, PieceId } from '../core/pieces';
import { Card, Kind, kindOf, kindRank, kindType } from '../core/cards';
import { Buffs, BUFF_ORDER, BUFFS, buffLevel } from '../core/buffs';
import { sealImg, buffImg } from '../game/sigils';
import { PhaseSpec } from '../core/mapgen';
import { RewardOption } from '../core/rewards';
import { audio } from '../game/audio';
import { icon } from './icons';
import { HandView } from './handview';
import { HandRender } from '../game/handrender';
import { RULES } from '../core/rules';

// Interface em DOM. Sem lógica de jogo: recebe dados e devolve escolhas por callback.
const h = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Texto com uma span por letra que ondula (estilo Balatro). */
export function wob(text: string): string {
  return [...text].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
}
const title = (text: string, cls = ''): HTMLElement => h('h1', `wob ${cls}`, wob(text));

/** Carta inclina em 3D seguindo o mouse (variáveis CSS --rx/--ry e brilho em --mx/--my). */
function tiltable(el: HTMLElement, amt = 20) {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${(x - 0.5) * amt}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * amt}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

const PIPS: Record<number, [number, number][]> = {
  1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.26, .26], [.74, .26], [.5, .5], [.26, .74], [.74, .74]],
  6: [[.28, .22], [.72, .22], [.28, .5], [.72, .5], [.28, .78], [.72, .78]],
};

/** Ilustração SVG de cada peça (recompensas, loja, visor das peças). */
export function pieceSvg(id: PieceId): string {
  const d = PIECES[id];
  const W = 40, H = id === 'tower' ? 88 : 72;
  const vb = `0 0 46 92`;
  const x = (46 - W) / 2, y = 92 - H - 2;
  const pip = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${d.pip}"/>`;
  const half = (n: number, top: boolean) => (PIPS[n] || []).map(([px, py]) => pip(x + 4 + px * (W - 8), y + (top ? 4 : H / 2 + 2) + py * (H / 2 - 6))).join('');
  let deco = '';
  if (id === 'blast') deco = `<path d="M${x + W / 2 + 6} ${y + 2} q 6 -8 12 -6" stroke="#333" stroke-width="2.5" fill="none"/><circle cx="${x + W / 2 + 18}" cy="${y - 4}" r="3.5" fill="#ffb347"/><circle cx="${x + W / 2}" cy="${y + H * 0.58}" r="9" fill="${d.pip}"/><text x="${x + W / 2}" y="${y + H * 0.33}" text-anchor="middle" font-size="9" font-family="Silkscreen" font-weight="700" fill="${d.pip}">TNT</text>`;
  else if (id === 'runner') deco = `<path d="M${x + 8} ${y + H * 0.45} l ${W / 2 - 8} -12 l ${W / 2 - 8} 12" stroke="${d.pip}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x + 8} ${y + H * 0.7} l ${W / 2 - 8} -12 l ${W / 2 - 8} 12" stroke="${d.pip}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="${x - 4}" y="${y + H - 22}" width="5" height="18" rx="2" fill="#d23a2a"/><rect x="${x + W - 1}" y="${y + H - 22}" width="5" height="18" rx="2" fill="#d23a2a"/>`;
  else if (id === 'jumper') deco = `<path d="M${x + 6} ${y + H * 0.42} q ${W / 2 - 6} -26 ${W - 12} 0" stroke="${d.pip}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M${x + W - 6} ${y + H * 0.42} l -7 -3 m 7 3 l -1 -7" stroke="${d.pip}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M${x + 8} ${y + H * 0.62} l ${(W - 16) / 4} 6 l ${(W - 16) / 4} -6 l ${(W - 16) / 4} 6 l ${(W - 16) / 4} -6" stroke="${d.pip}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x + 8} ${y + H * 0.76} l ${(W - 16) / 4} 6 l ${(W - 16) / 4} -6 l ${(W - 16) / 4} 6 l ${(W - 16) / 4} -6" stroke="${d.pip}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  else if (id === 'trifork') {
    const hw = 12, gap = (W - hw) / 2;
    const bar = (bx: number) => `<rect x="${bx}" y="${y + 8}" width="${hw}" height="${H - 8}" rx="3.5" fill="${d.color}" stroke="#2a1d16" stroke-width="2"/>`;
    return `<svg viewBox="${vb}">${bar(x - 1)}${bar(x - 1 + gap)}${bar(x - 1 + gap * 2)}${pip(x + 5, y + 24)}${pip(x + gap + 5, y + 40)}${pip(x + gap * 2 + 5, y + 28)}${pip(x + 5, y + 54)}${pip(x + gap * 2 + 5, y + 58)}<path d="M23 4 v8 M23 8 l -10 6 M23 8 l 10 6 M23 8 v7" stroke="${d.color}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  } else if (id === 'fork') {
    const hw = 16;
    return `<svg viewBox="${vb}"><rect x="${x - 1}" y="${y + 8}" width="${hw}" height="${H - 8}" rx="4" fill="${d.color}" stroke="#2a1d16" stroke-width="2"/><rect x="${x + W - hw + 1}" y="${y + 8}" width="${hw}" height="${H - 8}" rx="4" fill="${d.color}" stroke="#2a1d16" stroke-width="2"/>${pip(x + 7, y + 22)}${pip(x + 7, y + 50)}${pip(x + W - 7, y + 30)}${pip(x + W - 7, y + 60)}<path d="M23 4 v8 M23 8 l -8 6 M23 8 l 8 6" stroke="#f08a3c" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  } else {
    const b = id === 'heavy' ? 6 : id === 'tower' ? 6 : 5;
    // rosto na metade de cima (igual à peça 3D), pips embaixo
    const cy = y + H * 0.24, ex = W * 0.2, c = d.pip;
    const face = `<circle cx="${x + W / 2 - ex}" cy="${cy}" r="4.4" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${x + W / 2 + ex}" cy="${cy}" r="4.4" fill="none" stroke="${c}" stroke-width="2"/>`
      + `<circle cx="${x + W / 2 - ex}" cy="${cy + 0.5}" r="1.9" fill="${c}"/><circle cx="${x + W / 2 + ex}" cy="${cy + 0.5}" r="1.9" fill="${c}"/>`
      + (d.cursed
        // maldita: sobrancelhas em V e sorriso torto
        ? `<path d="M${x + W / 2 - ex - 6} ${cy - 9} l 8 3 M${x + W / 2 + ex + 6} ${cy - 9} l -8 3" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M${x + W / 2 - 8} ${cy + 8} q 7 7 15 -2" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
        : `<path d="M${x + W / 2 - 5} ${cy + 10} q 5 2 10 0" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
    deco = face + half(b, false) + `<line x1="${x + 5}" y1="${y + H / 2}" x2="${x + W - 5}" y2="${y + H / 2}" stroke="${d.pip}" stroke-width="2"/>`;
  }
  const shine = id === 'heavy' ? `<rect x="${x + 4}" y="${y + 4}" width="6" height="${H - 8}" rx="3" fill="rgba(255,255,255,.18)"/>` : `<rect x="${x + 4}" y="${y + 4}" width="5" height="${H - 8}" rx="2.5" fill="rgba(255,255,255,.35)"/>`;
  return `<svg viewBox="${vb}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="${d.color}" stroke="#2a1d16" stroke-width="2.5"/>${shine}${deco}</svg>`;
}

export interface HudCallbacks {
  select(kind: Kind): void;
  fire(): void;
  undo(): void;
  clear(): void;
  newHand(): void;
  pause(): void;
  deck(): void;
  speed(): void;
  skipSim(): void;
  fireHover?(on: boolean): void;
}

export type ResultCfg = { win: boolean; title: string; stars: number; rows: [string, string, string?][]; gold: number; buttons: { label: string; cls: string; fn: () => void }[] };

export class UI {
  root = document.getElementById('ui')!;
  hud = h('div', 'hud');
  private phaseBadge = h('div', 'phase-badge box hit');
  private obj = h('div', 'obj box');
  private enemyIcons = h('div', 'enemy-icons');
  private piecesPar = h('div', 'pieces-par');
  private lifeEl = h('div', 'stat box life');
  private goldEl = h('div', 'stat box gold');
  private attEl = h('div', 'stat box att');
  private skipEl = h('div', 'skip-hint off', 'clique para pular');
  private actions = h('div', 'actions');
  private fireBtn!: HTMLButtonElement;
  private coachEl = h('div', 'coach off');
  private toastEl = h('div', 'toast');
  private tipEl = h('div', 'tip');
  private simbar = h('div', 'simbar hidden');
  private speedBtn!: HTMLButtonElement;
  private comboEl = h('div', 'combo');
  private screenEl: HTMLElement | null = null;
  private toastT = 0;
  private comboT = 0;
  /** a mão (caixa de peças, suporte, pote de descarte) */
  hand: HandView;
  /** letreiro dos eventos (texto + botões, embaixo no meio) */
  private evBar = h('div', 'ev-bar off');
  /** bênçãos que você tem (canto de cima, à direita) */
  private buffsEl = h('div', 'buffs');
  private buffsKey = '';
  private fireW = 265;

  private vigEl = h('div', 'vig');
  /** clarão vermelho nas bordas quando a vida cai, e o pulsar contínuo com a vida baixa */
  private hurtEl = h('div', 'hurt');
  private dangerEl = h('div', 'danger');
  private lastLife = -1;
  private speedEl = h('div', 'speedlines');
  private speechEl = h('div', 'speech');
  /** balãozinho das peças (malditas falando na mesa / no evento) */
  private pieceSpeechEl = h('div', 'speech piece');
  private pieceSpeechT = 0;
  private speechT = 0;

  constructor(cb: HudCallbacks) {
    this.root.append(this.dangerEl, this.hurtEl, this.vigEl, this.speedEl, this.hud, this.comboEl, this.speechEl, this.pieceSpeechEl);
    const tl = h('div', 'top-left');
    this.obj.append(h('div', 'row', '<span>Inimigos</span>'), this.enemyIcons, this.piecesPar);
    tl.append(this.phaseBadge, this.obj);
    const tr = h('div', 'top-right');
    const pauseBtn = this.btn(icon('pause'), 'btn dark icon-btn', () => cb.pause());
    pauseBtn.title = 'Pausa (Esc)';
    tr.append(this.lifeEl, this.goldEl, this.attEl, pauseBtn, this.buffsEl);
    this.fireBtn = this.btn('DISPARAR!', 'btn red fire', () => cb.fire()) as HTMLButtonElement;
    this.fireBtn.addEventListener('mouseenter', () => cb.fireHover?.(true));
    this.fireBtn.addEventListener('mouseleave', () => cb.fireHover?.(false));
    this.actions.append(this.fireBtn);
    this.hand = new HandView({
      select: (id) => cb.select(id),
      newHand: () => cb.newHand(),
      undo: () => cb.undo(),
      clear: () => cb.clear(),
      deck: () => cb.deck(),
      tip: (html) => this.tipHtml(html),
      // o DISPARAR sobe para cima da mão quando o descarte encostaria nele
      layoutChanged: (right) => {
        const w = this.fireBtn?.getBoundingClientRect().width ?? 0;
        if (w > 0) this.fireW = w;
        this.actions.classList.toggle('raised', right > window.innerWidth - this.fireW - 26);
      },
    });
    // os dominós da mão em 3D (mesmos modelos e rostos do tabuleiro), por cima da interface
    new HandRender(this.hand.root, this.root);
    this.speedBtn = this.btn(`${icon('fast')} 1×`, 'btn dark small', () => cb.speed()) as HTMLButtonElement;
    this.simbar.append(this.speedBtn, this.btn(`${icon('skip')} Pular`, 'btn dark small', () => cb.skipSim()));
    this.hud.append(tl, tr, this.hand.root, this.actions, this.coachEl, this.toastEl, this.tipEl, this.evBar);
    this.root.append(this.simbar, this.skipEl);
    this.comboEl.innerHTML = `<span class="n">0</span><span class="l wob">${wob('COMBO')}</span>`;
  }

  setSkipHint(on: boolean) { this.skipEl.classList.toggle('off', !on); }

  btn(label: string, cls: string, fn: () => void): HTMLElement {
    const b = h('button', cls, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.ui('click'); fn(); });
    b.addEventListener('mouseenter', () => audio.ui('hover'));
    return b;
  }

  // ---------- HUD ----------
  setVisible(on: boolean) { this.hud.classList.toggle('hidden', !on); }
  setSimMode(on: boolean) {
    this.hand.hide(on);
    this.actions.style.display = on ? 'none' : '';
    this.simbar.classList.toggle('hidden', !on);
    if (on) this.coach(null);
  }
  setSpeed(x: number) { this.speedBtn.innerHTML = `${icon('fast')} ${x}×`; }

  // ---------- eventos entre as fases ----------
  /** Mesa de evento: some o que é de fase (objetivos, mão, DISPARAR); entra o nome do evento. */
  eventStart(title: string, sub: string) {
    this.hud.classList.add('event');
    this.hand.hide(true);
    this.actions.style.display = 'none';
    this.coach(null);
    this.phaseBadge.className = 'phase-badge box hit event';
    this.phaseBadge.innerHTML = `<div class="t wob">${wob(title)}</div><div class="s">${sub}</div>`;
    const b = h('div', 'banner event');
    b.innerHTML = `<div class="bn-rule"></div><div class="bn-tag">EVENTO</div><div class="bn-title">${title}</div><div class="bn-sub">${sub}</div><div class="bn-rule"></div>`;
    this.root.append(b);
    setTimeout(() => b.remove(), 2600);
  }
  eventEnd() {
    this.hud.classList.remove('event');
    this.actions.style.display = '';
    this.eventBar(null);
  }
  /** Letreiro do evento: texto e botões (null esconde). */
  eventBar(html: string | null, buttons: { label: string; cls: string; fn: () => void }[] = []) {
    this.evBar.classList.toggle('off', html === null);
    if (html === null) return;
    this.evBar.innerHTML = '';
    this.evBar.append(h('div', 'txt', html));
    if (buttons.length) {
      const row = h('div', 'btns');
      for (const b of buttons) row.append(this.btn(b.label, `${b.cls} small`, b.fn));
      this.evBar.append(row);
    }
  }
  /** Ícones das bênçãos (com explicação no hover). */
  setBuffs(b: Buffs) {
    const key = BUFF_ORDER.map((id) => buffLevel(b, id)).join(',');
    if (key === this.buffsKey) return;
    this.buffsKey = key;
    this.buffsEl.innerHTML = '';
    for (const id of BUFF_ORDER) {
      const n = buffLevel(b, id);
      if (!n) continue;
      const el = h('div', 'buff hit', `${buffImg(id)}${n > 1 ? `<i>${n}</i>` : ''}`);
      el.addEventListener('mouseenter', () => this.tip(`<b>${BUFFS[id].name}${n > 1 ? ` ×${n}` : ''}</b>${BUFFS[id].desc}`));
      el.addEventListener('mouseleave', () => this.tip(null));
      this.buffsEl.append(el);
      el.classList.add('pop');
    }
  }
  tip(html: string | null) { this.tipHtml(html); }

  /** Faixa de entrada da fase no meio da tela ("FASE 3 — Campo ..."); some sozinha em ~2,4 s. */
  phaseBanner(spec: PhaseSpec) {
    const b = h('div', `banner${spec.boss ? ' boss' : ''}`);
    b.innerHTML = `<div class="bn-rule"></div>${spec.boss ? `<div class="bn-tag">${icon('sword')} CHEFE ${icon('sword')}</div>` : ''}<div class="bn-title">${spec.title}</div><div class="bn-sub">${spec.subtitle}</div><div class="bn-rule"></div>`;
    this.root.append(b);
    setTimeout(() => b.remove(), 2600);
  }

  setPhase(spec: PhaseSpec) {
    this.phaseBadge.className = `phase-badge box hit${spec.boss ? ' boss' : ''}`;
    this.phaseBadge.innerHTML = `<div class="t wob">${wob(spec.title)}</div><div class="s">${spec.subtitle}</div>`;
    this.enemyIcons.innerHTML = spec.enemies.map((e) => `<i class="${e.kind}"></i>`).join('');
  }
  enemyDown(i: number) { this.enemyIcons.children[i]?.classList.add('down'); }
  resetEnemyIcons() { for (const c of Array.from(this.enemyIcons.children)) c.classList.remove('down'); }
  setPieces(used: number, par: number) {
    this.piecesPar.className = `pieces-par${used > par ? ' over' : ''}`;
    this.piecesPar.innerHTML = `Peças <b>${used}</b> / par ${par}`;
  }
  setStats(life: number, maxLife: number, gold: number, attLeft: number, attMax: number) {
    const bump = (el: HTMLElement, v: string) => { if (el.dataset.v !== v) { el.dataset.v = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
    this.lifeEl.innerHTML = `${icon('heart')}${life}<small style="opacity:.5;font-size:15px">/${maxLife}</small>`;
    bump(this.lifeEl, String(life));
    const low = life > 0 && life <= Math.max(2, Math.ceil(maxLife * 0.3));
    this.lifeEl.classList.toggle('low', low);
    this.dangerEl.classList.toggle('on', low);
    if (this.lastLife >= 0 && life < this.lastLife) this.hurt(this.lastLife - life);
    this.lastLife = life;
    this.goldEl.innerHTML = `${icon('coin')}${gold}`;
    bump(this.goldEl, String(gold));
    this.attEl.innerHTML = `<div class="att-pips" title="Tentativas">${Array.from({ length: attMax }, (_, i) => `<i class="${i < attMax - attLeft ? 'used' : ''}"></i>`).join('')}</div>`;
    this.attEl.title = `${attLeft} tentativa(s) restante(s)`;
  }
  /** Perdeu vida: bordas da tela piscam em vermelho, o contador treme e solta o "−N". */
  hurt(n: number) {
    for (const el of [this.hurtEl, this.lifeEl]) { el.classList.remove('on', 'hit'); void el.offsetWidth; }
    this.hurtEl.classList.add('on');
    this.lifeEl.classList.add('hit');
    const r = this.lifeEl.getBoundingClientRect();
    const m = h('div', 'minus', `−${n}`);
    m.style.left = `${r.left + r.width / 2}px`;
    m.style.top = `${r.bottom + 6}px`;
    this.root.append(m);
    setTimeout(() => m.remove(), 1300);
  }

  private tipHtml(html: string | null) {
    if (!html) { this.tipEl.classList.remove('on'); return; }
    this.tipEl.innerHTML = html;
    this.tipEl.classList.add('on');
  }
  setFireEnabled(on: boolean) { this.fireBtn.disabled = !on; }
  /** Sem peças para colocar: o DISPARAR pulsa chamando o clique. */
  setFireReady(on: boolean) { this.fireBtn.classList.toggle('ready', on); }

  coach(text: string | null) {
    if (!text) { this.coachEl.classList.add('off'); return; }
    this.coachEl.textContent = text;
    this.coachEl.classList.remove('off');
  }
  toast(text: string, info = false) {
    this.toastEl.textContent = text;
    this.toastEl.className = `toast on${info ? ' info' : ''}`;
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove('on'), 1600);
  }
  combo(n: number) {
    if (n < 2) return;
    const nEl = this.comboEl.querySelector('.n')!;
    nEl.textContent = `×${n}`;
    this.comboEl.classList.add('on');
    this.comboEl.classList.remove('pump');
    void (this.comboEl as HTMLElement).offsetWidth;
    this.comboEl.classList.add('pump');
    (this.comboEl as HTMLElement).style.fontSize = `${Math.min(1.6, 1 + n * 0.05)}em`;
    // combo alto: as bordas da tela pulsam em vermelho e linhas de velocidade explodem do centro
    this.vigEl.classList.toggle('on', n >= 5);
    if (n >= 3) { this.speedEl.classList.remove('on'); void this.speedEl.offsetWidth; this.speedEl.classList.add('on'); }
    clearTimeout(this.comboT);
    this.comboT = window.setTimeout(() => { this.comboEl.classList.remove('on'); this.vigEl.classList.remove('on'); }, 1600);
  }

  /** Balão de tinta do "dono da mesa": aparece perto da máscara e some sozinho. */
  speak(x: number, y: number, text: string, ms = 3400) {
    const el = this.speechEl;
    el.textContent = text;
    el.style.left = `${Math.min(window.innerWidth - 330, Math.max(20, x - 150))}px`;
    el.style.top = `${y + 64}px`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.speechT);
    this.speechT = window.setTimeout(() => el.classList.remove('on'), ms);
  }

  /** Balãozinho de uma peça: preso acima do ponto (x, y) da tela. */
  pieceSpeak(x: number, y: number, text: string, ms = 2200) {
    const el = this.pieceSpeechEl;
    el.textContent = text;
    el.style.left = `${Math.min(window.innerWidth - 200, Math.max(10, x - 20))}px`;
    el.style.top = `${Math.max(10, y - 70)}px`;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.pieceSpeechT);
    this.pieceSpeechT = window.setTimeout(() => el.classList.remove('on'), ms);
  }

  // ---------- telas ----------
  /**
   * Transição de tinta: uma mancha escura cresce até cobrir a tela, `mid` troca a cena por baixo
   * (já coberta) e a mancha encolhe revelando a nova. Bloqueia cliques enquanto dura.
   */
  inkWipe(mid: () => void) {
    const el = h('div', 'ink-wipe');
    this.root.append(el);
    const dur = 480;
    const ease = (k: number) => 1 - Math.pow(1 - k, 3);
    const t0 = performance.now();
    const grow = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      el.style.clipPath = `circle(${(ease(k) * 150).toFixed(1)}% at 50% 50%)`;
      if (k < 1) { requestAnimationFrame(grow); return; }
      mid();
      const t1 = performance.now();
      const shrink = (now2: number) => {
        const j = Math.min(1, (now2 - t1) / dur);
        el.style.clipPath = `circle(${((1 - ease(j)) * 150).toFixed(1)}% at 50% 50%)`;
        if (j < 1) requestAnimationFrame(shrink); else el.remove();
      };
      requestAnimationFrame(shrink);
    };
    requestAnimationFrame(grow);
  }

  closeScreen() { this.screenEl?.remove(); this.screenEl = null; }
  private screen(cls = ''): HTMLElement {
    this.closeScreen();
    const s = h('div', `screen ${cls}`);
    this.root.append(s);
    this.screenEl = s;
    return s;
  }
  hasScreen() { return !!this.screenEl; }

  showMenu(hasSave: boolean, on: { play(): void; cont(): void; howto(): void; options(): void }) {
    const s = this.screen('clear');
    // brasas subindo (a mesma luz de vela do jogo, em DOM): só no menu principal
    const embers = h('div', 'embers');
    for (let i = 0; i < 26; i++) {
      const e = h('i', 'ember');
      e.style.left = `${Math.random() * 100}%`;
      e.style.animationDuration = `${7 + Math.random() * 9}s`;
      e.style.animationDelay = `${-Math.random() * 14}s`;
      e.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
      e.style.setProperty('--sz', `${2 + Math.random() * 3}px`);
      embers.append(e);
    }
    s.append(embers);
    const m = h('div', 'menu');
    const logo = h('div', 'logo');
    'DOMINOTION'.split('').forEach((ch, i) => { const sp = h('span', '', ch); sp.style.animationDelay = `${i * 0.12}s`; logo.append(sp); });
    m.append(logo, h('div', 'tagline', 'Monte a corrente. Aperte o gatilho. Derrube o exército.'));
    if (hasSave) m.append(this.btn(`${icon('play')} Continuar run`, 'btn big', on.cont));
    m.append(this.btn(hasSave ? 'Nova run' : `${icon('play')} Jogar`, hasSave ? 'btn teal' : 'btn big', on.play));
    m.append(this.btn('Como jogar', 'btn dark', on.howto), this.btn('Opções', 'btn dark', on.options));
    // versão desktop (Electron/Steam): precisa de um jeito de fechar o jogo
    if (navigator.userAgent.includes('Electron')) m.append(this.btn('Sair do jogo', 'btn red', () => window.close()));
    s.append(m, h('div', 'menu-foot', 'DOMINOTION — ideia original do Gamonga · remake web (Three.js + Rapier) · todo visual e som gerados por código'));
  }

  showHowTo(back: () => void) {
    const s = this.screen();
    const p = h('div', 'panel');
    // a onda de dominós caindo mostra o que o jogo faz antes de ler a lista
    const demo = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    p.innerHTML = `<h1 class="wob">${wob('Como jogar')}</h1><div class="how-demo" aria-hidden="true">${demo}</div><p class="how-cap">trilha → disparar → derrube</p><ol class="howto">
      <li><b>Clique</b> no <b>marcador VERDE</b> e mova o mouse: aparece uma <b>trilha fantasma</b>. <b>Clique no chão</b> para colocar as peças de uma vez. Depois, continue de qualquer <b>ponta brilhante</b>.</li>
      <li>Embaixo fica a sua <b>mão</b>: ${RULES.handSize} peças tiradas da <b>caixa</b>, sem olhar. Clique numa peça (ou teclas <b>1–7</b>) para escolher o tipo. Só dá para colocar o que está na mão.</li>
      <li>Usou tudo? Você pega mais da caixa sozinho. Quer trocar? <b>Nova mão</b> (<b>N</b>) joga o resto no <b>pote de descarte</b> e pega mais. Ao pegar, as peças já colocadas <b>ficam fixas</b> na mesa (desfazer só vale para a mão atual). Quando a caixa esvazia, é hora de disparar.</li>
      <li>Aperte <b>DISPARAR</b> (Espaço): a 1ª peça cai e a corrente faz o resto. Derrube <b>todos</b> os inimigos!</li>
      <li><b>3 tentativas</b> por fase. Errou? A fase recomeça do zero com todas as peças <b>misturadas de novo</b> na caixa. Sobrou inimigo de pé no fim? Cada um tira <b>1 ${icon('heart')}</b>.</li>
      <li><b>Brutamontes</b> têm 2 de vida, o <b>General</b> 4. Cada dominó ou inimigo que bate neles tira <b>1</b>; a <b>Pesada</b> e a <b>Explosiva</b> tiram <b>4</b> (derrubam na hora) e a <b>Torre</b> tira 3.</li>
      <li><b>Patrulheiros</b> empurram peças em pé no caminho deles; o <b>Tocheiro</b> queima e faz sumir as que ainda estão de pé (uma peça caindo derruba ele). <b>Muros</b> podem ser retos, em L ou curvos: contorne!</li>
      <li>Vencer dá <b>ouro</b> e peças novas. Entre as fases, às vezes a mesa recebe um <b>evento</b>: a <b>Loja</b>, a <b>Prensa de Selos</b> (carimba um poder numa peça: Guardada, Dupla, Sortuda, Primeira, Dourada — até 2 por peça) ou o <b>Altar Místico</b> (bênçãos que valem a run inteira). Você escolhe comprar ou ir embora. ${icon('star')} extra por usar ≤ par de peças e por vencer de primeira.</li>
      <li>Câmera: <b>botão direito</b> gira, <b>roda</b> dá zoom, <b>WASD</b> move, <b>Q/E</b> giram. Botão direito numa ponta remove a peça.</li></ol>`;
    const b = h('div', 'btns');
    b.append(this.btn('Entendi!', 'btn', back));
    p.append(b);
    s.append(p);
  }

  showOptions(st: { master: number; music: number; sfx: number; shake: number; post: boolean; tilt: boolean; crt: boolean; ao: boolean; ink: boolean; dof: boolean }, change: (k: string, v: number | boolean) => void, back: () => void) {
    const s = this.screen();
    const p = h('div', 'panel');
    p.append(title('Opções'));
    const g = h('div', 'opts');
    const slider = (label: string, k: keyof typeof st) => {
      g.append(h('div', '', label));
      const i = document.createElement('input');
      i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.05'; i.value = String(st[k]);
      i.addEventListener('input', () => change(k, Number(i.value)));
      g.append(i);
    };
    const check = (label: string, k: keyof typeof st) => {
      g.append(h('div', '', label));
      const i = document.createElement('input');
      i.type = 'checkbox'; i.checked = Boolean(st[k]);
      i.addEventListener('change', () => change(k, i.checked));
      g.append(i);
    };
    slider('Volume geral', 'master');
    slider('Música', 'music');
    slider('Efeitos', 'sfx');
    slider('Tremor de tela', 'shake');
    check('Brilho (bloom) e pós-efeitos', 'post');
    check('Sombras de contato (AO, mais pesado)', 'ao');
    check('Estilo gravura (tinta e papel)', 'ink');
    check('Foco cinematográfico (bordas desfocadas na simulação)', 'dof');
    check('Efeito TV antiga (CRT)', 'crt');
    check('Efeito maquete (tilt-shift)', 'tilt');
    p.append(g);
    const b = h('div', 'btns');
    b.append(this.btn('Voltar', 'btn', back));
    p.append(b);
    s.append(p);
  }

  showPause(on: { resume(): void; options(): void; howto(): void; quit(): void }) {
    const s = this.screen();
    const p = h('div', 'panel');
    p.append(title('Pausa'));
    const b = h('div', 'btns');
    b.style.flexDirection = 'column';
    b.append(this.btn('Continuar', 'btn', on.resume), this.btn('Como jogar', 'btn dark', on.howto), this.btn('Opções', 'btn dark', on.options), this.btn('Sair para o menu', 'btn red', on.quit));
    p.append(b);
    s.append(p);
  }

  showDeck(cards: readonly Card[], back: () => void, piles?: { draw: readonly Card[]; hand: readonly Card[]; table: readonly Card[]; discard: readonly Card[] }) {
    const s = this.screen();
    const p = h('div', 'panel');
    p.append(title('Suas peças'), h('p', '', `${cards.length} peças na sua caixa. Em cada fase elas são misturadas e você pega ${RULES.handSize} por vez, sem olhar.`));
    const grid = (list: readonly Card[], cls = '') => {
      const g = h('div', `deck-grid ${cls}`);
      const groups = new Map<Kind, number>();
      for (const c of list) groups.set(kindOf(c), (groups.get(kindOf(c)) ?? 0) + 1);
      for (const k of [...groups.keys()].sort((x, y) => kindRank(x) - kindRank(y))) {
        const t = kindType(k);
        const seals = k.split('+').slice(1) as Card['seals'];
        const card = h('div', 'card', `${pieceSvg(t)}<span class="nm">${PIECES[t].name}</span><span class="cnt">${groups.get(k)}</span>${seals.length ? `<span class="seals">${seals.map((x) => sealImg(x)).join('')}</span>` : ''}`);
        g.append(card);
      }
      return g;
    };
    if (piles) {
      // onde está cada peça agora, nesta tentativa
      const row = h('div', 'deck-piles');
      for (const [name, list, hint] of [
        ['Na caixa', piles.draw, 'você ainda vai pegar (sem saber a ordem)'],
        ['Na mão', piles.hand, 'prontas para colocar'],
        ['Na mesa', piles.table, 'já colocadas'],
        ['Descartadas', piles.discard, 'fora desta tentativa'],
      ] as const) {
        const col = h('div', 'deck-pile');
        col.append(h('div', 'hd', `${name} <b>${list.length}</b>`), h('div', 'sub', hint));
        col.append(list.length ? grid(list, 'mini') : h('div', 'none', '—'));
        row.append(col);
      }
      p.append(row);
    } else p.append(grid(cards));
    const b = h('div', 'btns');
    b.append(this.btn('Voltar', 'btn', back));
    p.append(b);
    s.append(p);
  }

  private offerCard(o: RewardOption, price: number | null, canAfford: boolean): HTMLElement {
    const c = h('div', `offer ${o.rarity}${price !== null && !canAfford ? ' cant' : ''}`);
    const art = o.items.map((it) => pieceSvg(it.piece)).join('');
    const star = o.items.find((it) => it.piece !== 'common') ?? o.items[0];
    const desc = PIECES[star.piece].desc;
    c.innerHTML = `<div class="rar">${o.rarity}</div><div class="art">${art}</div><div class="lbl">${o.label}</div><div class="desc">${desc}</div>${price !== null ? `<div class="price">${icon('coin')} ${price}</div>` : ''}`;
    c.addEventListener('mouseenter', () => audio.ui('hover'));
    tiltable(c, 18);
    return c;
  }

  showDraft(heading: string, sub: string, opts: RewardOption[], gold: number, rerollCost: number, on: { pick(i: number): void; reroll(): void; skip(): void }) {
    const s = this.screen();
    // a cor do tipo de carta explode por um instante: azul para rara, roxa para épica
    const rar = opts[0]?.rarity;
    if (rar && rar !== 'comum') {
      const fl = h('div', `rar-flash ${rar}`);
      this.root.append(fl);
      setTimeout(() => fl.remove(), 1000);
    }
    const p = h('div', 'panel');
    p.append(title(heading), h('p', '', sub));
    const row = h('div', 'offers');
    opts.forEach((o, i) => {
      const c = this.offerCard(o, null, true);
      c.addEventListener('click', () => { audio.unlock(); audio.ui('pick'); c.style.transform = 'translateY(-30px) scale(1.1)'; setTimeout(() => on.pick(i), 180); });
      row.append(c);
    });
    p.append(row);
    const b = h('div', 'btns');
    const rr = this.btn(`↻ Trocar opções (${icon('coin')} ${rerollCost})`, 'btn dark small', on.reroll) as HTMLButtonElement;
    rr.disabled = gold < rerollCost;
    b.append(rr, this.btn('Pular', 'btn dark small', on.skip));
    p.append(b, h('div', 'gold-line', `${icon('coin')} ${gold}`));
    s.append(p);
  }

  showResult(r: ResultCfg) {
    const s = this.screen();
    const p = h('div', 'panel');
    const t = title(r.title, 'win-title');
    if (!r.win) t.style.color = '#e0543e';
    p.append(t);
    if (r.win) {
      const st = h('div', 'stars');
      for (let i = 0; i < 3; i++) st.append(h('div', 'st', icon('star')));
      p.append(st);
      for (let i = 0; i < r.stars; i++) setTimeout(() => { st.children[i].classList.add('on'); audio.stars(i); }, 350 + i * 300);
    }
    const rows = h('div', 'result-rows');
    for (const [k, v, cls] of r.rows) rows.append(h('div', 'k', k), h('div', `v ${cls ?? ''}`, v));
    p.append(rows);
    if (r.gold > 0) {
      const g = h('div', 'big-gold', `${icon('coin')} +0`);
      p.append(g);
      let n = 0;
      const start = performance.now() + 900;
      const tick = () => {
        const k = Math.min(1, Math.max(0, (performance.now() - start) / 700));
        const v = Math.round(r.gold * k);
        if (v !== n) { n = v; g.innerHTML = `${icon('coin')} +${v}`; g.classList.add('jit'); if (v % 3 === 0) audio.coin(); }
        if (k < 1) requestAnimationFrame(tick);
        else setTimeout(() => g.classList.remove('jit'), 250);
      };
      requestAnimationFrame(tick);
    }
    const b = h('div', 'btns');
    for (const bt of r.buttons) b.append(this.btn(bt.label, bt.cls, bt.fn));
    p.append(b);
    s.append(p);
    setTimeout(() => (b.querySelector('button') as HTMLButtonElement | null)?.focus(), 50);
  }
}
