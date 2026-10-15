import { PIECES, PIECE_ORDER, PieceId, Deck } from '../core/pieces';
import { PhaseSpec } from '../core/mapgen';
import { RewardOption } from '../core/rewards';
import { audio } from '../game/audio';

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

/** Ilustração SVG de cada peça (cartas, bandeja, loja). */
export function pieceSvg(id: PieceId): string {
  const d = PIECES[id];
  const W = 40, H = id === 'tower' ? 88 : id === 'big' ? 80 : 72;
  const vb = `0 0 46 92`;
  const x = (46 - W) / 2, y = 92 - H - 2;
  const pip = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${d.pip}"/>`;
  const half = (n: number, top: boolean) => (PIPS[n] || []).map(([px, py]) => pip(x + 4 + px * (W - 8), y + (top ? 4 : H / 2 + 2) + py * (H / 2 - 6))).join('');
  let deco = '';
  if (id === 'blast') deco = `<path d="M${x + W / 2 + 6} ${y + 2} q 6 -8 12 -6" stroke="#333" stroke-width="2.5" fill="none"/><circle cx="${x + W / 2 + 18}" cy="${y - 4}" r="3.5" fill="#ffb347"/><circle cx="${x + W / 2}" cy="${y + H * 0.58}" r="9" fill="${d.pip}"/><text x="${x + W / 2}" y="${y + H * 0.33}" text-anchor="middle" font-size="9" font-family="Silkscreen" font-weight="700" fill="${d.pip}">TNT</text>`;
  else if (id === 'runner') deco = `<path d="M${x + 8} ${y + H * 0.45} l ${W / 2 - 8} -12 l ${W / 2 - 8} 12" stroke="${d.pip}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x + 8} ${y + H * 0.7} l ${W / 2 - 8} -12 l ${W / 2 - 8} 12" stroke="${d.pip}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="${x - 4}" y="${y + H - 22}" width="5" height="18" rx="2" fill="#d23a2a"/><rect x="${x + W - 1}" y="${y + H - 22}" width="5" height="18" rx="2" fill="#d23a2a"/>`;
  else if (id === 'fork') {
    const hw = 16;
    return `<svg viewBox="${vb}"><rect x="${x - 1}" y="${y + 8}" width="${hw}" height="${H - 8}" rx="4" fill="${d.color}" stroke="#2a1d16" stroke-width="2"/><rect x="${x + W - hw + 1}" y="${y + 8}" width="${hw}" height="${H - 8}" rx="4" fill="${d.color}" stroke="#2a1d16" stroke-width="2"/>${pip(x + 7, y + 22)}${pip(x + 7, y + 50)}${pip(x + W - 7, y + 30)}${pip(x + W - 7, y + 60)}<path d="M23 4 v8 M23 8 l -8 6 M23 8 l 8 6" stroke="#f08a3c" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  } else {
    const b = id === 'heavy' ? 6 : id === 'tower' ? 6 : id === 'big' ? 2 : 5;
    // rosto na metade de cima (igual à peça 3D), pips embaixo
    const cy = y + H * 0.24, ex = W * 0.2, c = d.pip;
    const face = `<circle cx="${x + W / 2 - ex}" cy="${cy}" r="4.4" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${x + W / 2 + ex}" cy="${cy}" r="4.4" fill="none" stroke="${c}" stroke-width="2"/>`
      + `<circle cx="${x + W / 2 - ex}" cy="${cy + 0.5}" r="1.9" fill="${c}"/><circle cx="${x + W / 2 + ex}" cy="${cy + 0.5}" r="1.9" fill="${c}"/>`
      + `<path d="M${x + W / 2 - 5} ${cy + 10} q 5 2 10 0" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    deco = face + half(b, false) + `<line x1="${x + 5}" y1="${y + H / 2}" x2="${x + W - 5}" y2="${y + H / 2}" stroke="${d.pip}" stroke-width="2"/>`;
  }
  const shine = id === 'heavy' ? `<rect x="${x + 4}" y="${y + 4}" width="6" height="${H - 8}" rx="3" fill="rgba(255,255,255,.18)"/>` : `<rect x="${x + 4}" y="${y + 4}" width="5" height="${H - 8}" rx="2.5" fill="rgba(255,255,255,.35)"/>`;
  return `<svg viewBox="${vb}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="${d.color}" stroke="#2a1d16" stroke-width="2.5"/>${shine}${deco}</svg>`;
}

export interface HudCallbacks {
  select(id: PieceId): void;
  fire(): void;
  undo(): void;
  clear(): void;
  pause(): void;
  deck(): void;
  speed(): void;
  skipSim(): void;
  fireHover?(on: boolean): void;
}

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
  private tray = h('div', 'tray');
  private actions = h('div', 'actions');
  private fireBtn!: HTMLButtonElement;
  private coachEl = h('div', 'coach off');
  private toastEl = h('div', 'toast');
  private tipEl = h('div', 'tip');
  private simbar = h('div', 'simbar hidden');
  private speedBtn!: HTMLButtonElement;
  private comboEl = h('div', 'combo');
  private leftActions = h('div', 'left-actions');
  private screenEl: HTMLElement | null = null;
  private toastT = 0;
  private comboT = 0;
  private cards = new Map<PieceId, HTMLElement>();

  constructor(private cb: HudCallbacks) {
    this.root.append(this.hud, this.comboEl);
    const tl = h('div', 'top-left');
    this.obj.append(h('div', 'row', '<span>Inimigos</span>'), this.enemyIcons, this.piecesPar);
    tl.append(this.phaseBadge, this.obj);
    const tr = h('div', 'top-right');
    const pauseBtn = this.btn('⏸', 'btn dark icon-btn', () => cb.pause());
    pauseBtn.title = 'Pausa (Esc)';
    tr.append(this.lifeEl, this.goldEl, this.attEl, pauseBtn);
    this.fireBtn = this.btn('DISPARAR!', 'btn red fire', () => cb.fire()) as HTMLButtonElement;
    this.fireBtn.addEventListener('mouseenter', () => cb.fireHover?.(true));
    this.fireBtn.addEventListener('mouseleave', () => cb.fireHover?.(false));
    const row = h('div', 'row');
    row.append(
      this.btn('↶ Desfazer<span class="kbd">Ctrl+Z</span>', 'btn dark small', () => cb.undo()),
      this.btn('✕ Limpar<span class="kbd">R</span>', 'btn dark small', () => cb.clear()),
    );
    this.actions.append(row, this.fireBtn);
    this.leftActions.append(this.btn('🂠 Baralho', 'btn dark small', () => cb.deck()));
    this.speedBtn = this.btn('⏩ 1×', 'btn dark small', () => cb.speed()) as HTMLButtonElement;
    this.simbar.append(this.speedBtn, this.btn('⏭ Pular', 'btn dark small', () => cb.skipSim()));
    this.hud.append(tl, tr, this.tray, this.actions, this.leftActions, this.coachEl, this.toastEl, this.tipEl);
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
    this.tray.style.display = on ? 'none' : '';
    this.actions.style.display = on ? 'none' : '';
    this.leftActions.style.display = on ? 'none' : '';
    this.simbar.classList.toggle('hidden', !on);
    if (on) this.coach(null);
  }
  setSpeed(x: number) { this.speedBtn.innerHTML = `⏩ ${x}×`; }

  setPhase(spec: PhaseSpec) {
    this.phaseBadge.className = `phase-badge box hit${spec.boss ? ' boss' : ''}`;
    this.phaseBadge.innerHTML = `<div class="t wob">${wob(spec.title)}</div><div class="s">${spec.subtitle}${spec.shop ? ' · próxima: ★ LOJA' : ''}</div>`;
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
    this.lifeEl.innerHTML = `<span class="ico">❤</span>${life}<small style="opacity:.5;font-size:15px">/${maxLife}</small>`;
    bump(this.lifeEl, String(life));
    this.goldEl.innerHTML = `<span class="ico">◉</span>${gold}`;
    bump(this.goldEl, String(gold));
    this.attEl.innerHTML = `<div class="att-pips" title="Tentativas">${Array.from({ length: attMax }, (_, i) => `<i class="${i < attMax - attLeft ? 'used' : ''}"></i>`).join('')}</div>`;
    this.attEl.title = `${attLeft} tentativa(s) restante(s)`;
  }
  setHand(hand: Deck, start: Deck, selected: PieceId) {
    const ids = PIECE_ORDER.filter((k) => start[k] > 0);
    const key = ids.join(',');
    if (this.tray.dataset.k !== key) {
      this.tray.dataset.k = key;
      this.tray.innerHTML = '';
      this.cards.clear();
      ids.forEach((id, i) => {
        const c = h('div', 'card hit', `<span class="key">${i + 1}</span>${pieceSvg(id)}<span class="nm">${PIECES[id].name}</span><span class="cnt"></span>`);
        c.style.setProperty('--i', String(i));
        tiltable(c, 24);
        c.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); this.cb.select(id); });
        c.addEventListener('mouseenter', () => { audio.ui('hover'); this.tip(id); });
        c.addEventListener('mouseleave', () => this.tip(null));
        c.dataset.id = id;
        this.tray.append(c);
        this.cards.set(id, c);
      });
    }
    for (const [id, c] of this.cards) {
      c.classList.toggle('sel', id === selected);
      c.classList.toggle('empty', hand[id] <= 0);
      const cnt = c.querySelector('.cnt')!;
      if (cnt.textContent !== String(hand[id])) {
        cnt.textContent = String(hand[id]);
      }
    }
  }
  trayIds(): PieceId[] { return [...this.cards.keys()]; }
  flashCard(id: PieceId) { const c = this.cards.get(id); if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } }
  private tip(id: PieceId | null) {
    if (!id) { this.tipEl.classList.remove('on'); return; }
    this.tipEl.innerHTML = `<b>${PIECES[id].name}</b>${PIECES[id].desc}`;
    this.tipEl.classList.add('on');
  }
  setFireEnabled(on: boolean) { this.fireBtn.disabled = !on; }

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
    clearTimeout(this.comboT);
    this.comboT = window.setTimeout(() => this.comboEl.classList.remove('on'), 1600);
  }

  // ---------- telas ----------
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
    const m = h('div', 'menu');
    const logo = h('div', 'logo');
    'TOPPLE'.split('').forEach((ch, i) => { const sp = h('span', '', ch); sp.style.animationDelay = `${i * 0.12}s`; logo.append(sp); });
    m.append(logo, h('div', 'tagline', 'Monte a corrente. Aperte o gatilho. Derrube o exército.'));
    if (hasSave) m.append(this.btn('▶ Continuar run', 'btn big', on.cont));
    m.append(this.btn(hasSave ? 'Nova run' : '▶ Jogar', hasSave ? 'btn teal' : 'btn big', on.play));
    m.append(this.btn('Como jogar', 'btn dark', on.howto), this.btn('Opções', 'btn dark', on.options));
    s.append(m, h('div', 'menu-foot', 'TOPPLE — ideia original do Gamonga · remake web (Three.js + Rapier) · todo visual e som gerados por código'));
  }

  showHowTo(back: () => void) {
    const s = this.screen();
    const p = h('div', 'panel');
    p.innerHTML = `<h1 class="wob">${wob('Como jogar')}</h1><ol class="howto">
      <li><b>Clique</b> no <b>marcador VERDE</b> e mova o mouse: aparece uma <b>trilha fantasma</b>. <b>Clique no chão</b> para colocar as peças de uma vez. Depois, continue de qualquer <b>ponta brilhante</b>.</li>
      <li>Escolha a peça nas <b>cartas</b> de baixo (teclas <b>1–7</b>). Cada carta é uma peça; a mão volta cheia a cada fase.</li>
      <li>Aperte <b>DISPARAR</b> (Espaço): a 1ª peça cai e a corrente faz o resto. Derrube <b>todos</b> os inimigos!</li>
      <li><b>3 tentativas</b> por fase — o desenho fica salvo entre tentativas. Sobrou inimigo de pé no fim? Cada um tira <b>1 ❤</b>.</li>
      <li><b>Brutamontes</b> aguentam 2 golpes, o <b>General</b> 4 — <b>Pesada/Torre</b> derrubam na hora; <b>Explosiva</b> derruba tudo em volta.</li>
      <li><b>Lava</b>: só uma <b>Grande</b> ou <b>Torre</b> logo antes do poço consegue pular. <b>Patrulheiros</b> empurram peças em pé no caminho deles.</li>
      <li>Vencer dá <b>ouro</b> e uma carta nova. A cada 3 fases tem <b>LOJA</b>. ★ extra por usar ≤ par de peças e por vencer de primeira.</li>
      <li>Câmera: <b>botão direito</b> gira, <b>roda</b> dá zoom, <b>WASD</b> move, <b>Q/E</b> giram. Botão direito numa ponta remove a peça.</li></ol>`;
    const b = h('div', 'btns');
    b.append(this.btn('Entendi!', 'btn', back));
    p.append(b);
    s.append(p);
  }

  showOptions(st: { master: number; music: number; sfx: number; shake: number; post: boolean; tilt: boolean; crt: boolean }, change: (k: string, v: number | boolean) => void, back: () => void) {
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

  showDeck(deck: Deck, back: () => void) {
    const s = this.screen();
    const p = h('div', 'panel');
    const total = PIECE_ORDER.reduce((a, k) => a + deck[k], 0);
    p.append(title('Seu baralho'), h('p', '', `${total} cartas — a mão de cada fase é o baralho inteiro.`));
    const g = h('div', 'deck-grid');
    for (const id of PIECE_ORDER) {
      if (!deck[id]) continue;
      g.append(h('div', 'card', `${pieceSvg(id)}<span class="nm">${PIECES[id].name}</span><span class="cnt">${deck[id]}</span>`));
    }
    p.append(g);
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
    c.innerHTML = `<div class="rar">${o.rarity}</div><div class="art">${art}</div><div class="lbl">${o.label}</div><div class="desc">${desc}</div>${price !== null ? `<div class="price">◉ ${price}</div>` : ''}`;
    c.addEventListener('mouseenter', () => audio.ui('hover'));
    tiltable(c, 18);
    return c;
  }

  showDraft(heading: string, sub: string, opts: RewardOption[], gold: number, rerollCost: number, on: { pick(i: number): void; reroll(): void; skip(): void }) {
    const s = this.screen();
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
    const rr = this.btn(`↻ Trocar opções (◉ ${rerollCost})`, 'btn dark small', on.reroll) as HTMLButtonElement;
    rr.disabled = gold < rerollCost;
    b.append(rr, this.btn('Pular', 'btn dark small', on.skip));
    p.append(b, h('div', 'gold-line', `◉ ${gold}`));
    s.append(p);
  }

  showShop(data: { gold: number; offers: { opt: RewardOption; price: number; sold: boolean }[]; rerollCost: number; healCost: number; healAmt: number; canHeal: boolean; attemptCost: number; canAttempt: boolean; life: number; maxLife: number },
    on: { buy(i: number): void; reroll(): void; heal(): void; attempt(): void; leave(): void }) {
    const s = this.screen();
    const p = h('div', 'panel');
    p.style.borderColor = '#b8913e';
    p.append(title('★ LOJA ★'), h('div', 'gold-line', `◉ ${data.gold} ouro`));
    const row = h('div', 'offers');
    data.offers.forEach((o, i) => {
      const c = this.offerCard(o.opt, o.price, data.gold >= o.price);
      if (o.sold) c.classList.add('sold');
      c.addEventListener('click', () => { audio.unlock(); if (data.gold >= o.price && !o.sold) on.buy(i); else audio.ui('deny'); });
      row.append(c);
    });
    p.append(row);
    const ex = h('div', 'shop-extras');
    const heal = this.btn(`❤ +${data.healAmt} vida (◉ ${data.healCost}) — ${data.life}/${data.maxLife}`, 'btn teal small', on.heal) as HTMLButtonElement;
    heal.disabled = !data.canHeal || data.gold < data.healCost;
    const att = this.btn(`+1 tentativa na próxima (◉ ${data.attemptCost})`, 'btn teal small', on.attempt) as HTMLButtonElement;
    att.disabled = !data.canAttempt || data.gold < data.attemptCost;
    const rr = this.btn(`↻ Novas ofertas (◉ ${data.rerollCost})`, 'btn dark small', on.reroll) as HTMLButtonElement;
    rr.disabled = data.gold < data.rerollCost;
    ex.append(heal, att, rr);
    p.append(ex);
    const b = h('div', 'btns');
    b.append(this.btn('Seguir viagem →', 'btn', on.leave));
    p.append(b);
    s.append(p);
  }

  showResult(r: { win: boolean; title: string; stars: number; rows: [string, string, string?][]; gold: number; buttons: { label: string; cls: string; fn: () => void }[] }) {
    const s = this.screen();
    const p = h('div', 'panel');
    const t = title(r.title, r.win ? 'win-title' : '');
    if (!r.win) t.style.color = '#e0543e';
    p.append(t);
    if (r.win) {
      const st = h('div', 'stars');
      for (let i = 0; i < 3; i++) st.append(h('div', 'st', '★'));
      p.append(st);
      for (let i = 0; i < r.stars; i++) setTimeout(() => { st.children[i].classList.add('on'); audio.stars(i); }, 350 + i * 300);
    }
    const rows = h('div', 'result-rows');
    for (const [k, v, cls] of r.rows) rows.append(h('div', 'k', k), h('div', `v ${cls ?? ''}`, v));
    p.append(rows);
    if (r.gold > 0) {
      const g = h('div', 'big-gold', '◉ +0');
      p.append(g);
      let n = 0;
      const start = performance.now() + 900;
      const tick = () => {
        const k = Math.min(1, Math.max(0, (performance.now() - start) / 700));
        const v = Math.round(r.gold * k);
        if (v !== n) { n = v; g.textContent = `◉ +${v}`; g.classList.add('jit'); if (v % 3 === 0) audio.coin(); }
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
