import * as THREE from 'three';
import { World } from './world';
import { CameraRig } from './camera';
import { Board } from './board';
import { Fx } from './fx';
import { Decals } from './decals';
import { audio } from './audio';
import { Sim, SimEnemy, Cause } from './sim';
import { UI } from '../ui/ui';
import { generatePhase, PhaseSpec, ENEMY_HP, wallExtents } from '../core/mapgen';
import { Layout, FAIL_TEXT, Fail, Placed } from '../core/layout';
import { CardMove, ScreenPt } from '../ui/handview';
import { DrawPile } from '../core/draw';
import { Rng, hash2 } from '../core/rng';
import { PIECES, emptyDeck } from '../core/pieces';
import { RunState, newRun, saveRun, loadRun, clearSave, runRng, saveRng, addItems, damage, runDeck } from '../core/run';
import { Card, Kind, kindType, kindName, kindRank } from '../core/cards';
import { buffLevel, buffMaxed, BUFF_ORDER } from '../core/buffs';
import { EventKind, rollEvent } from '../core/events';
import { EventScene, createEvent } from './events';
import type { SweepTarget } from './hand';
import { RULES, starsFor, goldFor } from '../core/rules';
import { draft3 } from '../core/rewards';
import { autoPlan } from '../core/bot';
import { solve } from './solver';
import { Hand } from './hand';
import { icon } from '../ui/icons';

type Mode = 'menu' | 'planning' | 'sim' | 'result' | 'screen' | 'transition' | 'event';

interface Settings { master: number; music: number; sfx: number; shake: number; post: boolean; tilt: boolean; crt: boolean; ao: boolean; ink: boolean; dof: boolean }
const SETTINGS_KEY = 'topple.settings.v1';

const ENEMY_COLORS: Record<string, string> = { soldier: '#8a2a24', brute: '#5a5c64', patroller: '#8a6a32', general: '#7a2a3a' };
/** Cursores de tinta (SVG inline): pena para navegar, anel verde sobre a ponta, mira enquanto traça. */
const cursorSvg = (body: string, hot: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>${body}</svg>`)}") ${hot} ${hot}, ${fallback}`;
const CURSOR_QUILL = cursorSvg("<path d='M4 3L4 22 9.5 17.2 13 25 16.2 23.6 12.8 16.2 20 16Z' fill='#f3e3c8' stroke='#140e0a' stroke-width='1.6' stroke-linejoin='round'/>", 4, 'default');
const CURSOR_RING = cursorSvg("<circle cx='14' cy='14' r='7' fill='none' stroke='#7dffc0' stroke-width='2.5'/><circle cx='14' cy='14' r='2' fill='#7dffc0'/>", 14, 'pointer');
const CURSOR_CROSS = cursorSvg("<path d='M14 4v8M14 16v8M4 14h8M16 14h8' stroke='#ffb347' stroke-width='2' stroke-linecap='round'/><circle cx='14' cy='14' r='2' fill='#ffb347'/>", 14, 'crosshair');

/** Tinta escura que fica na mesa onde o inimigo tomba (mais fechada que a cor do soldadinho). */
const ENEMY_INK: Record<string, string> = { soldier: '#2c0604', brute: '#15171b', patroller: '#221605', general: '#24040e' };

export class Game {
  world: World;
  rig: CameraRig;
  board: Board;
  fx: Fx;
  decals: Decals;
  ui: UI;
  hand: Hand;
  mode: Mode = 'menu';
  run: RunState | null = null;
  spec!: PhaseSpec;
  layout!: Layout;
  sim: Sim | null = null;
  /** o que está escolhido na mão: tipo + selos */
  selected: Kind = 'common';
  attemptsLeft = 3;
  attemptsMax = 3;
  patrolT = 0;
  speed = 1;
  timeScale = 1;
  slowmoUntil = 0;
  hitstop = 0;
  simEndAt = -1;
  paused = false;
  settings: Settings = { master: 0.8, music: 0.5, sfx: 0.9, shake: 1, post: true, tilt: true, crt: true, ao: true, ink: false, dof: false };
  /** modo leve automático: decidido nos primeiros segundos, se a máquina não aguentar a cena */
  private autoLow = false;
  private perfT = 0;
  private perfFrames = 0;
  private perfDone = false;
  private perfLast = 0;
  private trailAnchor: { x: number; z: number } | null = null; // trilha fantasma ativa (clicou no começo/ponta)
  private lastFailT = 0;
  private lastFail: Fail | null = null;
  private realT = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer = { x: 0, y: 0, inside: false };
  private rightDown: { x: number; y: number } | null = null;
  private attemptsUsed = 0;
  private demo: { loops: number; waitUntil: number; seed: number; endAt: number } | null = null;
  private phaseKnocked = 0;
  private alarmed = new Set<number>();
  private coachStep = 0;
  /** evento entre as fases em andamento (loja, prensa, altar) */
  event: EventScene | null = null;
  /** evento sorteado para depois da varredura */
  private pendingEvent: EventKind | null = null;
  private handDt = -1;
  private impactBudget = 6;
  private cursorNow = '';
  private lastSparkT = -1;
  private lastSayT = -99;

  constructor(canvas: HTMLCanvasElement) {
    this.loadSettings();
    this.world = new World(canvas);
    this.rig = new CameraRig(this.world.camera, canvas);
    this.board = new Board(this.world.scene);
    this.hand = new Hand(this.world.scene);
    this.fx = new Fx(this.world.scene, this.world.camera, document.getElementById('fx-layer')!);
    this.decals = new Decals(this.world.scene);
    this.ui = new UI({
      select: (id) => this.select(id),
      fire: () => this.fire(),
      undo: () => this.undo(),
      newHand: () => this.newHand(),
      clear: () => this.clearLayout(),
      pause: () => this.openPause(),
      deck: () => this.openDeck(),
      speed: () => this.toggleSpeed(),
      skipSim: () => this.skipSim(),
      fireHover: (on) => {
        if (this.mode === 'planning') this.board.mood = on ? 'nervous' : 'calm';
        // o coração acelera enquanto o dedo está em cima do DISPARAR
        audio.setHeartbeat(on && this.mode === 'planning');
      },
    });
    this.applySettings();
    this.bindInput(canvas);
    this.enterMenu();
    let last = performance.now();
    const loop = (now: number) => {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, raw);
      last = now;
      // a cena da mão e o "surgir" da fase andam em tempo real (máquina lenta não arrasta a transição)
      this.handDt = Math.min(0.5, raw);
      this.update(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ================= configurações =================
  private loadSettings() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* padrão */ }
  }
  private applySettings() {
    audio.volumes.master = this.settings.master;
    audio.volumes.music = this.settings.music;
    audio.volumes.sfx = this.settings.sfx;
    audio.applyVolumes();
    this.rig.shakeScale = this.settings.shake;
    this.world.postFx = this.settings.post;
    this.world.setTiltShift(this.settings.tilt);
    this.world.setCrt(this.settings.crt);
    this.world.setAO(this.settings.ao);
    this.world.setInk(this.settings.ink);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ok */ }
  }

  // ================= entrada =================
  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      audio.unlock();
      this.setPointer(e);
      if (this.mode === 'transition') { this.hand.skip(); return; }
      if (e.button === 2) { this.rightDown = { x: e.clientX, y: e.clientY }; return; }
      if (e.button === 0 && this.mode === 'event' && !this.paused) { this.event?.pointer(new THREE.Vector2(this.pointer.x, this.pointer.y)); this.event?.click(); return; }
      if (e.button !== 0 || this.mode !== 'planning' || this.paused) return;
      this.clickTrail();
    });
    canvas.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      if (this.trailAnchor) this.previewTrail();
      if (this.mode === 'event' && !this.paused) this.event?.pointer(new THREE.Vector2(this.pointer.x, this.pointer.y));
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this.rightDown) {
        if (Math.hypot(e.clientX - this.rightDown.x, e.clientY - this.rightDown.y) < 6 && this.mode === 'planning') {
          if (this.trailAnchor) this.cancelTrail();
          else this.removeAtPointer();
        }
        this.rightDown = null;
      }
    });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (this.mode === 'transition') {
        if (k === 'escape' || k === ' ' || k === 'enter') { e.preventDefault(); this.hand.skip(); }
        return;
      }
      if (k === 'escape') {
        if (this.paused || (this.mode === 'screen' && this.ui.hasScreen())) { this.closeOverlay(); return; }
        if (this.mode === 'planning' && this.trailAnchor) { this.cancelTrail(); return; }
        if (this.mode === 'planning' || this.mode === 'sim' || this.mode === 'event') this.openPause();
        return;
      }
      if (this.paused) return;
      if (this.mode === 'planning') {
        if (e.ctrlKey && k === 'z') { e.preventDefault(); this.undo(); return; }
        if (k === ' ' || k === 'enter') { e.preventDefault(); this.fire(); return; }
        if (k === 'r' && !e.ctrlKey) { this.clearLayout(); return; }
        if (k === 'd' && !e.ctrlKey) { this.newHand(); return; }
        const n = Number(k);
        if (n >= 1 && n <= 9) { const id = this.ui.hand.kinds()[n - 1]; if (id) this.select(id); }
      } else if (this.mode === 'sim') {
        if (k === ' ' || k === 'f') { e.preventDefault(); this.toggleSpeed(); }
      }
    });
  }

  private setPointer(e: PointerEvent) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.pointer.inside = true;
  }

  private groundPoint(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(this.pointer.x, this.pointer.y), this.world.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, p) ? p : null;
  }

  // ================= planejamento =================
  select(kind: Kind) {
    if (this.mode === 'event') { this.event?.pickKind(kind); return; }
    if (this.mode !== 'planning') return;
    if (!this.layout.has(kind)) { audio.ui('deny'); this.ui.toast(`Sem ${kindName(kind)} na mão`); return; }
    this.selected = kind;
    audio.ui('click');
    this.ui.hand.flash(kind);
    this.refreshHud();
  }

  /** Peças por mão (regra + bênção Mão Grande). */
  private handSize(): number { return RULES.handSize + buffLevel(this.run?.buffs, 'bighand'); }

  /** Layout novo para a tentativa: caixa misturada com as peças da run + bênçãos. */
  private makeLayout(attempt: number): Layout {
    const run = this.run!;
    const L = new Layout(this.spec, runDeck(run), DrawPile.fromCards(run.cards, this.shuffleRng(run.depth, attempt)));
    L.recycle = buffLevel(run.buffs, 'recycle') > 0;
    return L;
  }

  /** Embaralhamento da fase: depende só da seed da run, da profundidade e da tentativa. */
  private shuffleRng(depth: number, attempt: number): Rng {
    return new Rng(hash2(this.run!.seed, depth * 7919 + attempt * 104729 + 31));
  }

  /** Botão "Nova mão": o que sobrou na mão vai para o pote de descarte e chegam peças novas da caixa. */
  newHand() {
    if (this.mode !== 'planning') return;
    this.cancelTrail();
    const keep = new Set(this.layout.entries.filter((e) => e.card.seals.includes('guard')).map((e) => e.card.uid));
    const recycling = this.layout.recycle && this.layout.entries.length > keep.size;
    const drawn = this.layout.newHand(this.handSize());
    if (!drawn) { audio.ui('deny'); this.ui.toast('A caixa está vazia — use a mão e dispare!'); this.ui.hand.nudge(); return; }
    const pile = this.layout.pile!;
    const t = this.ui.hand.discard(pile.discard.length, keep, recycling);
    this.ui.hand.deal(drawn, pile.size, t * 0.55 + 140);
    if (recycling) this.ui.toast('Reciclagem: as sobras voltaram para a caixa', true);
    else if (keep.size) this.ui.toast(keep.size === 1 ? 'A Guardada ficou na mão' : `${keep.size} Guardadas ficaram na mão`, true);
    this.selected = 'common';
    this.ensureSelection();
    this.refreshHud();
  }

  /** Mão esvaziada pelo jogador: pega mais sozinho (depois que as peças jogadas chegam na mesa). */
  private autoDraw() {
    const pile = this.layout.pile;
    if (this.layout.handCount() > 0 || !pile || pile.size === 0) return;
    const drawn = this.layout.newHand(this.handSize()) ?? [];
    this.ui.hand.deal(drawn, pile.size, 480);
    this.ui.toast('Mão vazia — pegando mais peças da caixa', true);
    this.ensureSelection();
    this.refreshHud();
  }

  /** Ponto da mesa em pixels de tela (de onde as peças da mão saem / para onde voam). */
  private screenAt(x: number, y: number, z: number): ScreenPt {
    const v = new THREE.Vector3(x, y, z).project(this.world.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** Um movimento por peça da mão: a bifurcação são 2 meias-peças na mesa e 1 peça só na mão (no meio das duas). */
  private cardMoves(list: Placed[]): CardMove[] {
    const out: CardMove[] = [];
    for (const p of list) {
      if (p.pair && p.pair < p.id) continue;
      const mate = p.pair ? list.find((q) => q.id === p.pair) : undefined;
      const x = mate ? (p.x + mate.x) / 2 : p.x, z = mate ? (p.z + mate.z) / 2 : p.z;
      out.push({ card: p.card ?? { uid: -p.id, type: p.type, seals: [] }, at: this.screenAt(x, PIECES[p.type].h / 2, z) });
    }
    return out;
  }

  /** Texto quando a trilha esbarra no fim das peças da mão. */
  private emptyText(): string {
    const k = this.layout.uses(this.selected);
    const pile = this.layout.pile?.size ?? 0;
    if (k <= 0) return pile ? 'Mão vazia — Nova mão (D) compra mais' : 'Acabaram as peças — DISPARE!';
    const t = kindType(this.selected);
    const what = `${k} ${k === 1 ? PIECES[t].name : PIECES[t].plural}`;
    return pile ? `Sua mão só tem ${what} — coloque e pegue mais` : `Só restam ${what} — a caixa acabou`;
  }

  private ensureSelection() {
    if (this.layout.has(this.selected)) return;
    // prefere o mesmo tipo (sem selo primeiro), depois qualquer peça que não seja bifurcação
    const kinds = this.layout.kinds().sort((a, b) => kindRank(a) - kindRank(b));
    const t = kindType(this.selected);
    const next = kinds.find((k) => kindType(k) === t) ?? kinds.find((k) => kindType(k) !== 'fork') ?? kinds[0];
    if (next) this.selected = next;
  }

  // Traço em duas etapas: clicar no começo (ou numa ponta) abre uma trilha FANTASMA que segue o mouse;
  // o clique no chão coloca de uma vez tudo que a trilha mostra e encerra o traço (volta a clicar na ponta).
  private clickTrail() {
    const g = this.groundPoint();
    if (!g) return;
    this.ensureSelection();
    if (this.trailAnchor) {
      const r = this.layout.trail(null, this.trailAnchor, g, this.selected);
      if (r.placed.length) this.onPlaced(r.placed);
      if (r.fail) this.failFeedback(r.fail, r.ghost ?? null);
      // o clique coloca a trilha e encerra o traço: para continuar, clica-se de novo na ponta
      this.cancelTrail();
      this.autoDraw();
      if (r.stroke?.done && kindType(this.selected) === 'fork') {
        this.ui.toast('Bifurcou! Continue de cada ponta brilhante', true);
        this.ensureSelection();
      }
      return;
    }
    // primeiro clique: só marca de onde a trilha sai (nada é colocado ainda)
    const r = this.layout.preview(null, g, g, this.selected);
    if (r.fail && (r.fail === 'trigger' || r.fail === 'nohead' || r.fail === 'empty')) { this.failFeedback(r.fail, null); return; }
    this.trailAnchor = { x: g.x, z: g.z };
    this.previewTrail();
    this.refreshHud();
  }

  /** Troca o cursor só quando muda (evita reescrever o estilo a cada quadro). */
  private setCursor(c: string) {
    if (this.cursorNow === c) return;
    this.cursorNow = c;
    this.world.canvas.style.cursor = c;
  }

  /** Recalcula a trilha fantasma até o cursor (não coloca nada). */
  private previewTrail() {
    const g = this.groundPoint();
    if (!this.trailAnchor || !g) return;
    this.ensureSelection();
    const r = this.layout.preview(null, this.trailAnchor, g, this.selected);
    // a tinta da trilha solta faíscas enquanto o mouse anda (no máximo uma a cada 40 ms)
    if (this.realT - this.lastSparkT > 0.04) {
      this.lastSparkT = this.realT;
      this.fx.sparkBurst(g.x, 0.12, g.z, 1, '#ffb347', 0.6);
    }
    this.board.setTrail(r.placed);
    this.ui.hand.preview(this.selected, r.placed.filter((p) => !(p.pair && p.pair < p.id)).length);
    if (r.fail) this.failFeedback(r.fail, r.ghost ?? null);
    else this.board.showGhost(null);
  }

  private cancelTrail() {
    this.trailAnchor = null;
    this.board.setTrail([]);
    this.board.showGhost(null);
    this.ui.hand.preview(null, 0);
    this.refreshHud();
  }

  private onPlaced(list: Placed[]) {
    for (const p of list) {
      this.board.addPiece(p);
      audio.place(this.layout.pieces.length);
    }
    // a Dupla continua na mão até a segunda peça sair dela
    const moves = this.cardMoves(list);
    const seen = new Map<number, number>();
    for (const m of moves) seen.set(m.card.uid, (seen.get(m.card.uid) ?? 0) + 1);
    const out: CardMove[] = [];
    for (const m of moves) {
      const left = (seen.get(m.card.uid) ?? 1) - 1;
      seen.set(m.card.uid, left);
      out.push({ ...m, stay: left > 0 || this.layout.inHand(m.card.uid) });
    }
    this.ui.hand.play(out);
    this.refreshHud();
  }

  private failFeedback(f: Fail, ghost: { x: number; z: number; yaw: number } | null) {
    const st = kindType(this.selected);
    this.board.showGhost(ghost, st === 'fork' ? 'common' : st);
    const now = this.realT;
    if (f !== this.lastFail || now - this.lastFailT > 1.2) {
      this.ui.toast(f === 'empty' ? this.emptyText() : FAIL_TEXT[f]);
      if (f === 'empty') this.ui.hand.nudge();
      if (f === 'trigger' || f === 'nohead' || f === 'empty') audio.ui('deny');
      this.lastFail = f;
      this.lastFailT = now;
    }
  }

  private removeAtPointer() {
    const g = this.groundPoint();
    if (!g) return;
    const h = this.layout.nearestHead(g.x, g.z, 0.5);
    if (!h) return;
    const before = new Map(this.layout.pieces.map((p) => [p.id, p]));
    if (this.layout.locked(h)) { this.lockedFeedback(); return; }
    const ids = this.layout.removeHead(h.id);
    for (const id of ids) this.board.removePiece(id);
    if (ids.length) {
      this.ui.hand.give(this.cardMoves(ids.map((id) => before.get(id)!)));
      audio.ui('click');
      this.refreshHud();
    }
  }

  undo() {
    if (this.mode !== 'planning') return;
    this.cancelTrail();
    const before = new Map(this.layout.pieces.map((p) => [p.id, p]));
    const ids = this.layout.undoStroke();
    for (const id of ids) this.board.removePiece(id);
    if (ids.length) { this.ui.hand.give(this.cardMoves(ids.map((id) => before.get(id)!))); audio.ui('click'); }
    else if (this.layout.pieces.length) this.lockedFeedback();
    this.refreshHud();
  }

  clearLayout() {
    if (this.mode !== 'planning' || !this.layout.pieces.length) return;
    this.cancelTrail();
    const before = new Map(this.layout.pieces.map((p) => [p.id, p]));
    const ids = this.layout.clear();
    if (!ids.length) { this.lockedFeedback(); return; }
    for (const id of ids) this.board.removePiece(id);
    this.ui.hand.give(this.cardMoves(ids.map((id) => before.get(id)!)));
    this.ensureSelection();
    audio.whoosh();
    this.refreshHud();
  }

  /** Tentou tirar uma peça de uma mão anterior. */
  private lockedFeedback() {
    audio.ui('deny');
    this.ui.toast('Peças de mãos anteriores ficam na mesa');
  }


  private refreshHud() {
    if (!this.run) return;
    const pile = this.layout.pile;
    this.ui.hand.handSize = this.handSize();
    this.ui.hand.select(this.selected);
    this.ui.hand.sync(this.layout.entries);
    if (pile) this.ui.hand.setPiles(pile.size, pile.discard.length, pile.composition(), buffLevel(this.run.buffs, 'seer') ? pile.peek() : null);
    this.ui.setBuffs(this.run.buffs);
    this.ui.setFireReady(this.mode === 'planning' && this.layout.pieces.length > 0 && this.layout.handCount() === 0 && !pile?.size);
    this.ui.setStats(this.run.life, this.run.maxLife, this.run.gold, this.attemptsLeft, this.attemptsMax);
    this.ui.setPieces(this.layout.cardsUsed(), this.spec.par);
    this.ui.setFireEnabled(this.layout.pieces.length > 0);
    this.board.setHeads(this.mode === 'planning' ? this.layout.heads() : [], this.layout.pieces.length === 0 && this.mode === 'planning');
    this.driveCoach();
  }

  private driveCoach() {
    if (!this.run || this.mode !== 'planning') return;
    if (this.run.depth === 0) {
      const n = this.layout.pieces.length;
      if (n === 0) this.ui.coach(this.trailAnchor ? '① Clique no chão: as peças saem da sua mão e vão para a mesa.' : '① Embaixo estão as peças da sua mão. Clique no marcador VERDE e mova o mouse.');
      else if (n < 9) this.ui.coach('② Mão vazia? Você pega mais da CAIXA. Continue de uma ponta brilhante.');
      else this.ui.coach('③ Chegou perto? Aperte DISPARAR! (Espaço)');
    } else if (this.coachStep === 0 && this.spec.hint) {
      this.ui.coach(this.spec.hint);
    } else this.ui.coach(null);
  }

  // ================= run / fases =================
  newRun(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.stopDemo();
    this.run = newRun(seed);
    // a mancha de tinta cobre a tela, a fase nova entra por baixo e ela se desfaz
    this.ui.inkWipe(() => this.startPhase(true));
  }

  continueRun() {
    const r = loadRun();
    if (!r) return this.newRun();
    this.stopDemo();
    this.run = r;
    this.ui.inkWipe(() => this.startPhase(true));
  }

  /** `animate`: a fase surge peça por peça; `glide`: a câmera desliza até ela (em vez de cortar). */
  startPhase(animate = false, glide = false) {
    const run = this.run!;
    if (this.event) { this.event.dispose(); this.event = null; }
    saveRun(run);
    this.disposeSim();
    this.ui.closeScreen();
    this.ui.setSkipHint(false);
    this.fx.clear();
    this.spec = generatePhase(run.seed, run.depth, runDeck(run));
    this.decals.clear();
    this.layout = this.makeLayout(0);
    const firstHand = this.layout.newHand(this.handSize()) ?? [];
    this.ui.hand.reset(run.cards.length);
    this.ui.hand.deal(firstHand, this.layout.pile!.size, animate ? 750 : 200);
    this.attemptsMax = RULES.attemptsPerPhase + run.extraAttemptsNext + buffLevel(run.buffs, 'breath');
    run.extraAttemptsNext = 0;
    this.attemptsLeft = this.attemptsMax;
    this.attemptsUsed = 0;
    this.patrolT = 0;
    this.coachStep = 0;
    this.selected = 'common';
    this.ensureSelection();
    this.board.build(this.spec);
    this.board.mood = 'calm';
    this.world.backdrop.mood = 'watch';
    this.world.backdrop.setCrack(this.crackLevel());
    this.mode = 'planning';
    this.ui.setVisible(true);
    this.ui.setSimMode(false);
    this.ui.setPhase(this.spec);
    audio.setBoss(!!this.spec.boss);
    audio.setTension(this.spec.boss ? 0.35 : 0.1);
    if (this.spec.boss && animate) {
      audio.bossStinger();
      // o chefe fala depois que a faixa de entrada passa, para não brigar com o título
      setTimeout(() => { if (this.mode === 'planning') this.say(['Você chegou até aqui. Que pena.'], true); }, 2400);
    }
    this.frameBoard();
    if (animate) { this.board.spawnIn(); this.ui.phaseBanner(this.spec); }
    if (!glide) this.rig.snap();
    this.refreshHud();
    audio.setMusic(true, 0);
    if (this.spec.hint && run.depth > 0) setTimeout(() => { if (this.mode === 'planning') { this.coachStep = 1; this.ui.coach(null); } }, 9000);
  }

  /** A máscara do dono da mesa racha um pouco a cada fase vencida (inteira rachada lá pela 10ª). */
  private crackLevel(): number { return Math.min(1, (this.run?.stats.phasesWon ?? 0) / 10); }

  /** Enquadra o conteúdo da fase (gatilho, inimigos, muros) com folga para a HUD. */
  private frameBoard() {
    const s = this.spec;
    let x0 = s.trigger.x, x1 = s.trigger.x, z0 = s.trigger.z, z1 = s.trigger.z;
    const add = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const e of s.enemies) { add(e.x, e.z); e.patrol?.pts.forEach((p) => add(p.x, p.z)); }
    for (const w of s.walls) { const { ex, ez } = wallExtents(w); add(w.x - ex, w.z - ez); add(w.x + ex, w.z + ez); }
    const aspect = window.innerWidth / window.innerHeight;
    const w = x1 - x0 + 3, d = z1 - z0 + 3;
    const dist = THREE.MathUtils.clamp(Math.max(d / (1.06 * 0.7), w / (0.69 * aspect * 0.88)), 8, 21);
    this.rig.frame(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2 + 0.5), dist, 0, 0.86);
  }

  fire() {
    if (this.mode !== 'planning' || this.paused) return;
    if (!this.layout.pieces.length) { this.ui.toast('Desenhe uma corrente primeiro!'); audio.ui('deny'); return; }
    if (this.trailAnchor) this.cancelTrail();
    this.attemptsLeft--;
    this.attemptsUsed++;
    this.mode = 'sim';
    this.board.mood = 'calm';
    this.phaseKnocked = 0;
    this.alarmed.clear();
    this.board.hideHeads();
    this.board.setHeads([], false);
    this.board.showGhost(null);
    this.ui.setSimMode(true);
    this.ui.setStats(this.run!.life, this.run!.maxLife, this.run!.gold, this.attemptsLeft, this.attemptsMax);
    this.ui.resetEnemyIcons();
    this.sim = this.makeSim(this.spec, this.layout, this.patrolT);
    this.simEndAt = -1;
    this.timeScale = 1;
    audio.setHeartbeat(false);
    audio.setTension(0.75);
    this.rig.punchIn();
    audio.fire();
    audio.setMusic(true, 0.5);
    this.rig.userMoved = false;
    setTimeout(() => this.sim?.fire(), 140);
  }

  private makeSim(spec: PhaseSpec, layout: Layout, patrolT: number): Sim {
    const sim = new Sim(spec, layout.pieces, patrolT, {
      pieceFall: (i, x, _y, z, chain) => {
        const p = sim.pieces[i].p;
        audio.clack(chain, p.type === 'heavy' || p.type === 'tower' ? 1.3 : 1, x);
        this.fx.dust(x, z, PIECES[p.type].h / 0.8);
        this.rig.addTrauma(p.type === 'tower' ? 0.18 : p.type === 'heavy' ? 0.1 : 0.035);
        if (chain > 0 && chain % 15 === 0 && this.mode === 'sim') this.fx.text(x, 1.2, z, `${chain}!`, 'small', 0.9);
      },
      enemyKnock: (e, cause, combo) => this.onKnock(e, cause, combo),
      enemyHit: (e, hp) => {
        this.board.enemyHit(e.idx);
        this.board.setHp(e.idx, hp, ENEMY_HP[e.spec.kind]);
        const p = e.body.translation();
        if (this.mode === 'sim') {
          audio.clang();
          this.fx.text(p.x, p.y + 0.9, p.z, 'TUM!', 'hit');
          this.fx.sparkBurst(p.x, p.y + 0.3, p.z, 12, '#cfd6ff', 3);
          this.rig.addTrauma(0.2);
        }
      },
      explosion: (x, y, z, r) => {
        if (this.mode !== 'sim' && !this.demo) return;
        audio.boom(x);
        this.fx.explosion(x, y, z, r);
        this.fx.text(x, y + 1.2, z, 'KABUM!', 'boom', 1.1);
        this.rig.addTrauma(0.75);
        this.hitstop = Math.max(this.hitstop, 0.09);
        this.world.lamp.position.set(x, 1.5, z);
        this.world.lamp.intensity = 60;
        this.world.backdrop.startle(1);
        this.world.shockAt(x, y + 0.2, z);
        this.decals.scorch(x, z, r);
      },
      bulldoze: (x, z) => { if (this.mode === 'sim') { this.fx.text(x, 1, z, 'EMPURRÃO!', 'small'); audio.ui('deny'); } },
      runner: () => audio.whoosh(),
      impact: (speed, x, y, z, material) => this.onImpact(speed, x, y, z, material),
      allDown: () => {
        this.slowmoUntil = this.realT + 1.1;
        if (this.mode === 'sim') {
          const c = this.sim?.enemies.at(-1)?.body.translation();
          this.fx.confetti(c?.x ?? 0, c?.z ?? 0);
        }
      },
    });
    return sim;
  }

  /**
   * Modo leve automático: nos primeiros ~6 s (menu/primeira fase) mede o quadro. Se a média ficar
   * abaixo de 30 fps, desliga o que é mais pesado (AO, brasas, feixe). Decidido uma vez por sessão.
   */
  private checkPerformance() {
    if (this.perfDone) return;
    // tempo de parede (o dt do jogo é limitado a 50 ms por quadro, o que esconderia máquina lenta)
    const now = performance.now();
    const raw = this.perfLast > 0 ? (now - this.perfLast) / 1000 : 0;
    this.perfLast = now;
    if (raw <= 0 || raw > 2) return; // primeiro quadro ou aba escondida (pausa longa): não conta
    this.perfT += raw;
    if (this.perfT < 1.5) return; // aquecimento: a primeira leva de shaders costuma engasgar
    this.perfFrames++;
    if (this.perfT >= 6.5) {
      const fps = this.perfFrames / (this.perfT - 1.5);
      this.perfDone = true;
      if (fps < 30 && !this.autoLow) { this.autoLow = true; this.world.setLowQuality(true); }
    }
  }

  /** O "dono da mesa" comenta num balão de tinta. No máximo um comentário a cada 4 s (sem virar ruído). */
  private say(lines: string[], force = false) {
    if (!force && this.realT - this.lastSayT < 4) return;
    this.lastSayT = this.realT;
    const p = this.world.maskScreenPos();
    this.ui.speak(p.x, p.y, lines[Math.floor(Math.random() * lines.length)]);
  }

  /** Impacto físico entre dois corpos: som de acordo com a velocidade e poeira nos choques fortes (com limite por frame). */
  private onImpact(speed: number, x: number, y: number, z: number, material: 'wood' | 'metal' | 'toy') {
    if (this.impactBudget <= 0 || this.mode !== 'sim') return;
    this.impactBudget--;
    audio.impact(speed, x, material);
    if (speed > 1.8) {
      this.fx.dust(x, z, Math.min(1.2, speed / 2.5));
      this.rig.addTrauma(Math.min(0.08, speed * 0.02));
    }
    void y;
  }

  private onKnock(e: SimEnemy, cause: Cause, combo: number) {
    const p = e.body.translation();
    const big = e.spec.kind === 'brute' || e.spec.kind === 'general';
    audio.knock(combo, big, p.x);
    this.fx.knockBurst(p.x, p.y, p.z, ENEMY_COLORS[e.spec.kind], big);
    this.decals.splat(p.x, p.z, big ? 0.8 : 0.5, ENEMY_INK[e.spec.kind]);
    this.rig.addTrauma(big ? 0.45 : 0.22);
    this.hitstop = Math.max(this.hitstop, big ? 0.08 : 0.035);
    if (this.mode !== 'sim') return;
    this.phaseKnocked++;
    this.ui.enemyDown(e.idx);
    const word = cause === 'blast' ? 'VOOU!' : cause === 'splash' ? 'DOMINÓ!' : this.fx.knockWord();
    this.fx.text(p.x, p.y + 0.9, p.z, word, big ? 'gold' : 'red', big ? 1.3 : 1);
    if (combo >= 2) {
      this.ui.combo(combo);
      if (combo >= 4) this.world.backdrop.startle(0.35);
      if (combo % 5 === 0) this.fx.text(p.x, p.y + 1.6, p.z, `COMBO ×${combo}!`, 'gold', 1.2);
      if (combo >= 6) this.say(['Ahh! Olha isso!', 'Mais uma! Mais uma!']);
    }
    if (e.spec.kind === 'general') this.say(['O General não cai assim!'], true);
  }

  private toggleSpeed() {
    if (this.mode !== 'sim') return;
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.ui.setSpeed(this.speed);
  }

  private skipSim() {
    if (!this.sim || this.mode !== 'sim') return;
    // roda o resto sem render, mas mantém os eventos (contagem de inimigos)
    let guard = 0;
    while (!this.sim.done && guard++ < 40 * 120) this.sim.step();
    this.simEndAt = this.realT;
  }

  private onSimEnd() {
    const sim = this.sim!;
    const run = this.run!;
    this.ui.setSimMode(false);
    this.ui.setVisible(true);
    audio.setMusic(true, 0);
    audio.setTension(0);
    run.stats.bestCombo = Math.max(run.stats.bestCombo, sim.bestCombo);
    run.stats.explosions += sim.explosions;
    run.stats.knocked += sim.enemies.filter((e) => !e.alive).length;
    this.mode = 'result';
    this.board.mood = sim.win ? 'happy' : 'sad';
    // o dono da mesa fecha a cara quando você vence e ri com os olhos quando você perde
    this.world.backdrop.mood = sim.win ? 'angry' : 'amused';
    if (sim.win) {
      const used = this.layout.cardsUsed();
      const efficient = used <= this.spec.par;
      const firstTry = this.attemptsUsed === 1;
      const stars = starsFor(true, efficient, firstTry);
      // selo Dourado: +3 por peça dourada que foi para a mesa; bênção Avareza: +30%
      const golden = new Set(this.layout.pieces.filter((p) => p.card?.seals.includes('gold')).map((p) => p.card!.uid)).size;
      const base = goldFor(stars, this.spec.boss, sim.bestCombo);
      const greed = buffLevel(run.buffs, 'greed') ? Math.round(base * 0.3) : 0;
      const gold = base + greed + golden * 3;
      run.gold += gold;
      run.stats.phasesWon++;
      this.world.backdrop.setCrack(this.crackLevel());
      run.stats.stars += stars;
      audio.win();
      this.say(['Mais uma… e ainda estou de pé.', 'Sorte de principiante.'], true);
      this.ui.showResult({
        win: true, title: this.spec.boss ? 'GENERAL DERRUBADO!' : 'VITÓRIA!', stars,
        rows: [
          ['Inimigos derrubados', `${sim.enemies.length}/${sim.enemies.length}`, 'good'],
          ['Peças usadas', `${used} (par ${this.spec.par})`, efficient ? 'good' : ''],
          ['Tentativa', `${this.attemptsUsed}ª`, firstTry ? 'good' : ''],
          ['Maior combo', `×${sim.bestCombo}`],
          ...(golden ? [['Selos dourados', `+${golden * 3} de ouro`, 'good'] as [string, string, string]] : []),
          ...(greed ? [['Avareza', `+${greed} de ouro`, 'good'] as [string, string, string]] : []),
        ],
        gold,
        buttons: [{ label: 'Escolher recompensa →', cls: 'btn big', fn: () => this.openDraft(false) }],
      });
      this.refreshTopStats();
      return;
    }
    const survivors = sim.alive;
    if (this.attemptsLeft > 0) {
      audio.lose();
      this.say(['Quebrou. Como sempre.', 'A corrente sempre quebra no pior lugar.'], true);
      this.ui.showResult({
        win: false, title: 'Corrente quebrada!', stars: 0,
        rows: [
          ['Ainda de pé', `${survivors}`, 'bad'],
          ['Tentativas restantes', `${this.attemptsLeft}`],
          ['Dica', survivors === sim.enemies.length ? 'a onda nem chegou lá' : 'quase! tente outra ordem'],
        ],
        gold: 0,
        buttons: [
          { label: '↺ Recomeçar a fase (reembaralha)', cls: 'btn big', fn: () => this.retry() },
          { label: `Desistir (−${survivors} ${icon('heart')})`, cls: 'btn dark small', fn: () => this.acceptDamage(survivors) },
        ],
      });
    } else this.acceptDamage(survivors);
  }

  private refreshTopStats() {
    if (this.run) this.ui.setStats(this.run.life, this.run.maxLife, this.run.gold, this.attemptsLeft, this.attemptsMax);
  }

  private acceptDamage(survivors: number) {
    const run = this.run!;
    const dmg = damage(run, survivors);
    audio.lose();
    this.rig.addTrauma(0.5);
    this.refreshTopStats();
    if (run.life <= 0) return this.gameOver();
    run.gold += 6;
    this.mode = 'result';
    this.ui.showResult({
      win: false, title: 'Fase perdida', stars: 0,
      rows: [['Sobreviventes', `${survivors}`, 'bad'], ['Dano', `−${dmg} ${icon('heart')}`, 'bad'], ['Vida', `${run.life}/${run.maxLife}`]],
      gold: 6,
      buttons: [{ label: 'Recompensa de consolo →', cls: 'btn', fn: () => this.openDraft(true) }],
    });
  }

  retry() {
    this.disposeSim();
    // recomeça a fase: corrente apagada, TODAS as peças de volta na caixa e misturadas, mão nova
    const run = this.run!;
    const from = this.cardMoves(this.layout.pieces).map((m) => m.at!);
    this.layout = this.makeLayout(this.attemptsUsed);
    const drawn = this.layout.newHand(this.handSize()) ?? [];
    this.board.clearPieces();
    this.selected = 'common';
    this.ensureSelection();
    this.ui.closeScreen();
    this.fx.clear();
    this.decals.clear();
    this.board.resetEnemies(this.patrolT);
    this.board.mood = 'calm';
    this.world.backdrop.mood = 'watch';
    this.mode = 'planning';
    this.ui.setSimMode(false);
    this.ui.resetEnemyIcons();
    const t = this.ui.hand.gather(run.cards.length, from);
    this.ui.hand.deal(drawn, this.layout.pile!.size, t);
    this.ui.toast('Fase recomeçou — peças misturadas na caixa', true);
    this.frameBoard();
    this.refreshHud();
  }


  private openDraft(consolation: boolean) {
    const run = this.run!;
    this.mode = 'screen';
    const rng = runRng(run);
    let opts = draft3(rng, run.depth);
    saveRng(run, rng);
    // as três opções têm a mesma raridade: o título já anuncia
    const tierTitle = () => (opts[0]?.rarity === 'épica' ? ' épica!' : opts[0]?.rarity === 'rara' ? ' rara!' : '');
    const show = () => this.ui.showDraft((consolation ? 'Consolo' : 'Recompensa') + tierTitle(), 'Escolha 1 de 3 — vai para a sua caixa de peças', opts, run.gold, RULES.draftRerollCost, {
      pick: (i) => { addItems(run, opts[i].items); this.afterDraft(); },
      reroll: () => {
        if (run.gold < RULES.draftRerollCost) return;
        run.gold -= RULES.draftRerollCost;
        const r = runRng(run); opts = draft3(r, run.depth); saveRng(run, r);
        show();
      },
      skip: () => this.afterDraft(),
    });
    show();
  }

  private afterDraft() {
    const run = this.run!;
    const r = runRng(run);
    const canMystic = BUFF_ORDER.some((id) => !buffMaxed(run.buffs, id));
    this.pendingEvent = rollEvent(run.events, run.depth, r, canMystic);
    saveRng(run, r);
    this.nextPhase();
  }

  private nextPhase() {
    this.run!.depth++;
    const ev = this.pendingEvent;
    this.pendingEvent = null;
    this.startTransition(() => (ev ? this.startEvent(ev) : this.startPhase(true, true)));
  }

  // ================= eventos entre as fases =================
  /** A mesa vazia recebe o evento (loja, prensa, altar), montado em 3D. */
  private startEvent(kind: EventKind) {
    const run = this.run!;
    saveRun(run);
    this.disposeSim();
    this.board.clear();
    this.decals.clear();
    this.fx.clear();
    this.ui.closeScreen();
    this.ui.setSkipHint(false);
    this.ui.setVisible(true);
    this.ui.setSimMode(false);
    this.mode = 'event';
    this.board.mood = 'calm';
    this.world.backdrop.mood = 'watch';
    this.refreshTopStats();
    this.ui.setBuffs(run.buffs);
    this.event = createEvent(kind, {
      scene: this.world.scene, camera: this.world.camera, rig: this.rig, run, ui: this.ui, fx: this.fx,
      say: (lines, force) => this.say(lines, force),
      refresh: () => { this.refreshTopStats(); this.ui.setBuffs(run.buffs); },
      setCursor: (c) => this.setCursor(c === 'pointer' ? 'pointer' : CURSOR_QUILL),
      leave: () => this.leaveEvent(),
      deck: () => this.openDeck(),
    });
    this.event.start();
    audio.setMusic(true, 0);
    audio.setTension(0.05);
  }

  /** Ir embora: a mão varre o evento e monta a fase. */
  private leaveEvent() {
    const ev = this.event;
    if (!ev) return;
    const targets = ev.sweepTargets();
    this.startTransition(() => { ev.dispose(); this.event = null; this.startPhase(true, true); }, targets);
  }

  /** A mão sai do escuro, varre o tabuleiro e some; `after` monta a fase seguinte. */
  private startTransition(after: () => void, extra: SweepTarget[] = []) {
    this.mode = 'transition';
    this.paused = false;
    this.trailAnchor = null;
    this.disposeSim();
    this.fx.clear();
    this.ui.closeScreen();
    this.ui.setVisible(false);
    this.ui.coach(null);
    this.ui.setSkipHint(true);
    this.board.mood = 'calm';
    this.rig.frame(new THREE.Vector3(0, 0, 0.6), 19.5, 0, 0.92);
    this.world.flicker(0.9);
    this.world.backdrop.mood = 'watch';
    this.world.backdrop.startle(0.8);
    audio.whoosh();
    this.hand.onLand = () => {
      audio.thud();
      this.rig.addTrauma(0.4);
      this.fx.dust(this.hand.palm.x + 0.5, 1, 2.5);
      this.fx.dust(this.hand.palm.x + 0.5, -2.5, 2.5);
    };
    this.hand.onSweep = () => audio.scrape(1.1);
    this.hand.start([...this.board.sweepTargets(), ...extra], after);
  }

  private gameOver() {
    const run = this.run!;
    clearSave();
    this.mode = 'result';
    let best = 0;
    try { best = Number(localStorage.getItem('topple.best') || 0); } catch { /* ok */ }
    const reached = run.depth + 1;
    const record = reached > best;
    if (record) try { localStorage.setItem('topple.best', String(reached)); } catch { /* ok */ }
    this.ui.showResult({
      win: false, title: 'FIM DA RUN', stars: 0,
      rows: [
        ['Fase alcançada', `${reached}${record ? ' — RECORDE!' : ''}`, record ? 'good' : ''],
        ['Fases vencidas', `${run.stats.phasesWon}`],
        ['Inimigos derrubados', `${run.stats.knocked}`],
        ['Maior combo', `×${run.stats.bestCombo}`],
        ['Explosões', `${run.stats.explosions}`],
        ['Estrelas', `${run.stats.stars} ${icon('star')}`],
      ],
      gold: 0,
      buttons: [
        { label: 'Nova run', cls: 'btn big', fn: () => this.newRun() },
        { label: 'Menu', cls: 'btn dark', fn: () => this.enterMenu() },
      ],
    });
  }

  // ================= menus =================
  enterMenu() {
    this.hand.cancel();
    if (this.event) { this.event.dispose(); this.event = null; }
    this.ui.setSkipHint(false);
    this.disposeSim();
    this.run = null;
    this.world.backdrop.setCrack(0);
    this.mode = 'menu';
    this.paused = false;
    this.ui.setVisible(false);
    this.ui.setSimMode(false);
    this.ui.coach(null);
    (document.querySelector('.simbar') as HTMLElement | null)?.classList.add('hidden');
    this.showMenuScreen();
    this.startDemo();
    audio.setMusic(true, 0);
  }

  private showMenuScreen() {
    this.ui.showMenu(!!loadRun(), {
      play: () => this.newRun(),
      cont: () => this.continueRun(),
      howto: () => this.ui.showHowTo(() => this.showMenuScreen()),
      options: () => this.openOptions(() => this.showMenuScreen()),
    });
  }

  private openOptions(back: () => void) {
    this.ui.showOptions({ ...this.settings }, (k, v) => {
      (this.settings as any)[k] = v;
      this.applySettings();
    }, back);
  }

  private openPause() {
    if (this.mode !== 'planning' && this.mode !== 'sim' && this.mode !== 'event') return;
    this.paused = true;
    const back = () => this.openPause();
    this.ui.showPause({
      resume: () => this.closeOverlay(),
      options: () => this.openOptions(back),
      howto: () => this.ui.showHowTo(back),
      quit: () => { this.paused = false; this.enterMenu(); },
    });
  }

  private openDeck() {
    if (!this.run || (this.mode !== 'planning' && this.mode !== 'event')) return;
    this.paused = true;
    if (this.mode === 'event') { this.ui.showDeck(this.run.cards, () => this.closeOverlay()); return; }
    const L = this.layout, pile = L.pile;
    const table = new Map<number, Card>();
    for (const p of L.pieces) if (p.card) table.set(p.card.uid, p.card);
    this.ui.showDeck(this.run.cards, () => this.closeOverlay(), {
      draw: pile?.pile ?? [], hand: L.entries.map((e) => e.card), table: [...table.values()], discard: pile?.discard ?? [],
    });
  }


  private closeOverlay() {
    if (this.mode === 'menu') { this.showMenuScreen(); return; }
    if (!this.paused) return;
    this.paused = false;
    this.ui.closeScreen();
  }

  // ================= demo do menu (modo atração) =================
  private startDemo() {
    this.demo = { loops: 0, waitUntil: this.realT + 1.5, seed: 4242, endAt: -1 };
    this.buildDemo();
  }

  private buildDemo() {
    const d = this.demo!;
    this.decals.clear();
    const deck = emptyDeck();
    deck.common = 80; deck.fork = 3; deck.heavy = 4; deck.blast = 3;
    // procura (headless) uma fase que o bot vence: a demo sempre termina em festa
    for (let tries = 0; tries < 4; tries++) {
      const spec = generatePhase(d.seed, 4 + (d.seed % 5), deck);
      const r = solve(spec, deck);
      this.spec = spec;
      this.layout = r.layout;
      if (r.win) break;
      d.seed += 31;
    }
    this.board.build(this.spec);
    this.board.mood = 'calm';
    this.world.backdrop.mood = 'watch';
    for (const p of this.layout.pieces) this.board.addPiece(p, false);
    this.board.setHeads([], false);
    this.sim = null;
    this.rig.frame(new THREE.Vector3(0, 0, 0.5), 15, this.rig.goalAz, 0.9);
  }

  private stopDemo() {
    this.demo = null;
    this.disposeSim();
    this.fx.clear();
  }

  private updateDemo() {
    const d = this.demo!;
    this.rig.goalAz += 0.0006;
    if (!this.sim && this.realT > d.waitUntil) {
      this.sim = this.makeSim(this.spec, this.layout, 0);
      this.sim.fire();
      d.endAt = -1;
    }
    if (this.sim?.done) {
      if (d.endAt < 0) {
        d.endAt = this.realT;
        this.board.mood = this.sim.win ? 'happy' : 'sad';
        this.world.backdrop.mood = this.sim.win ? 'angry' : 'amused';
      }
      else if (this.realT - d.endAt > 2.5) {
        d.loops++;
        d.seed += 17;
        this.disposeSim();
        this.fx.clear();
        this.buildDemo();
        d.waitUntil = this.realT + 1.2;
      }
    }
  }

  private disposeSim() {
    if (this.sim) { this.sim.dispose(); this.sim = null; }
  }

  // ================= loop =================
  update(dt: number) {
    this.realT += dt;
    this.impactBudget = 6;
    this.checkPerformance();
    this.world.setLensTarget(this.settings.dof && this.mode === 'sim' ? 1 : 0);
    // música reage ao jogo: tensão sobe com os inimigos vivos, percussão acompanha o combo
    if (this.mode === 'sim' && this.sim) {
      audio.setTension(0.45 + 0.4 * (this.sim.alive / Math.max(1, this.sim.enemies.length)));
      audio.setPerc(Math.min(1, this.sim.combo / 6));
    } else audio.setPerc(0);
    const planning = this.mode === 'planning' && !this.paused;
    if (planning) this.patrolT += dt;

    // tempo da simulação: velocidade × câmera lenta × hitstop
    let simDt = dt * this.speed;
    if (this.realT < this.slowmoUntil) simDt *= 0.3;
    if (this.hitstop > 0) { this.hitstop -= dt; simDt = 0; }
    if (this.paused) simDt = 0;

    if (this.demo) this.updateDemo();
    if (this.sim) {
      this.sim.advance(simDt);
      this.board.syncSim(this.sim);
      // rastro dos foguetes
      for (const s of this.sim.pieces) if (s.launched >= 0) { const t = s.body.translation(); this.fx.trail(t.x, t.y, t.z); }
      // faísca das explosivas acesas
      if (this.mode === 'sim' && !this.rig.userMoved) this.followCascade();
      if (this.mode === 'sim') this.alarmCheck();
      if (this.mode === 'sim' && this.sim.done && this.simEndAt < 0) this.simEndAt = this.realT;
      if (this.mode === 'sim' && this.simEndAt >= 0 && this.realT - this.simEndAt > 0.7) {
        this.simEndAt = -1;
        this.onSimEnd();
      }
    }
    // hover
    if (planning && !this.trailAnchor && this.pointer.inside) {
      const g = this.groundPoint();
      let target: { x: number; z: number } | null = null;
      if (g) {
        if (!this.layout.pieces.length) {
          const t = this.spec.trigger;
          if (Math.hypot(g.x - t.x, g.z - t.z) < 0.8) target = t;
        } else {
          const hd = this.layout.nearestHead(g.x, g.z, 0.65);
          if (hd) target = hd;
        }
      }
      this.board.hoverRing.visible = !!target;
      if (target) this.board.hoverRing.position.set(target.x, 0.025, target.z);
      this.setCursor(target ? CURSOR_RING : CURSOR_QUILL);
    } else {
      this.board.hoverRing.visible = false;
      if (this.mode !== 'event') this.setCursor(this.trailAnchor ? CURSOR_CROSS : CURSOR_QUILL);
    }
    if (this.mode === 'event' && this.event && !this.paused) this.event.update(dt);
    const realDt = this.handDt >= 0 ? this.handDt : dt;
    this.handDt = -1;
    this.hand.update(realDt);
    if (this.mode === 'transition') this.decals.fade(realDt);
    this.board.updateSpawn(realDt);
    this.board.update(dt, planning || (this.mode === 'menu' && !this.sim), this.patrolT);
    this.fx.update(dt);
    this.world.lamp.intensity *= Math.exp(-dt * 6);
    this.rig.update(dt, !this.paused && this.mode !== 'menu' && this.mode !== 'transition' && !this.ui.hasScreen());
    this.updateGaze(dt);
    this.world.impact = Math.min(1, this.rig.trauma * this.rig.trauma * (0.4 + 0.6 * this.settings.shake));
    this.world.render(dt, this.fx.flash);
  }

  /** Para onde os olhos do fundo olham: cursor no planejamento, a cascata na simulação. */
  private gazeGoal = new THREE.Vector3();
  private updateGaze(dt: number) {
    const sim = this.sim;
    if (this.hand.active) {
      this.gazeGoal.copy(this.hand.palm);
    } else if (sim && sim.recentFalls.length) {
      const f = sim.recentFalls[sim.recentFalls.length - 1];
      this.gazeGoal.set(f.x, 0.4, f.z);
    } else if ((this.mode === 'planning' || this.mode === 'event') && this.pointer.inside) {
      const g = this.groundPoint();
      if (g) this.gazeGoal.copy(g);
    } else {
      this.gazeGoal.set(Math.sin(this.realT * 0.3) * 4, 0, Math.cos(this.realT * 0.21) * 2);
    }
    this.world.backdrop.target.lerp(this.gazeGoal, 1 - Math.exp(-dt * 4));
  }

  /** Inimigo vê a onda chegando: '!' + pulinho (antecipação antes do impacto). */
  private alarmCheck() {
    const sim = this.sim!;
    const recent = sim.recentFalls.filter((f) => sim.t - f.t < 0.4);
    if (!recent.length) return;
    for (const e of sim.enemies) {
      if (!e.alive || this.alarmed.has(e.idx)) continue;
      const p = e.body.translation();
      if (recent.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 1.8)) {
        this.alarmed.add(e.idx);
        this.fx.text(p.x, p.y + 0.8, p.z, '!', 'alarm');
        this.board.enemyAlarm(e.idx);
        audio.alarm();
      }
    }
  }

  private followCascade() {
    const sim = this.sim!;
    const recent = sim.recentFalls.filter((f) => sim.t - f.t < 1.2);
    if (!recent.length) return;
    let x = 0, z = 0;
    for (const f of recent) { x += f.x; z += f.z; }
    x /= recent.length; z /= recent.length;
    const k = 0.35;
    this.rig.goalTarget.set(x * k, 0, 0.9 + (z - 0.9) * k);
  }

  /** API de depuração/testes (window.__topple). */
  debugApi() {
    return {
      game: this,
      newRun: (seed: number) => this.newRun(seed),
      /** repete a cena da mão varrendo a fase atual (e remonta a mesma fase) */
      transition: () => { if (this.run) this.startTransition(() => this.startPhase(true, true)); },
      autoPlan: () => { const r = autoPlan(this.layout); this.board.clearPieces(); for (const p of this.layout.pieces) this.board.addPiece(p, false); this.refreshHud(); return r; },
      event: () => this.event,
      /** abre um evento na hora (testes): 'shop' | 'press' | 'mystic' */
      openEvent: (k: EventKind) => { if (this.run) this.startTransition(() => this.startEvent(k)); },
      state: () => ({ mode: this.mode, depth: this.run?.depth, life: this.run?.life, gold: this.run?.gold, pieces: this.layout?.pieces.length, alive: this.sim?.alive, win: this.sim?.win, attemptsLeft: this.attemptsLeft }),
    };
  }
}
