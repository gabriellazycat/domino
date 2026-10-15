import * as THREE from 'three';
import { World } from './world';
import { CameraRig } from './camera';
import { Board } from './board';
import { Fx } from './fx';
import { audio } from './audio';
import { Sim, SimEnemy, Cause } from './sim';
import { UI } from '../ui/ui';
import { generatePhase, PhaseSpec, ENEMY_HP } from '../core/mapgen';
import { Layout, Stroke, FAIL_TEXT, Fail } from '../core/layout';
import { PIECES, PieceId, PIECE_ORDER, emptyDeck } from '../core/pieces';
import { RunState, newRun, saveRun, loadRun, clearSave, runRng, saveRng, addItems, damage } from '../core/run';
import { RULES, starsFor, goldFor, shopPrice } from '../core/rules';
import { draft3, RewardOption } from '../core/rewards';
import { autoPlan } from '../core/bot';
import { solve } from './solver';

type Mode = 'menu' | 'planning' | 'sim' | 'result' | 'screen';

interface Settings { master: number; music: number; sfx: number; shake: number; post: boolean; tilt: boolean }
const SETTINGS_KEY = 'topple.settings.v1';

const ENEMY_COLORS: Record<string, string> = { soldier: '#e5493a', brute: '#9a9ca6', patroller: '#f2a93a', general: '#f2c14e' };

export class Game {
  world: World;
  rig: CameraRig;
  board: Board;
  fx: Fx;
  ui: UI;
  mode: Mode = 'menu';
  run: RunState | null = null;
  spec!: PhaseSpec;
  layout!: Layout;
  sim: Sim | null = null;
  selected: PieceId = 'common';
  attemptsLeft = 3;
  attemptsMax = 3;
  patrolT = 0;
  speed = 1;
  timeScale = 1;
  slowmoUntil = 0;
  hitstop = 0;
  simEndAt = -1;
  paused = false;
  settings: Settings = { master: 0.8, music: 0.5, sfx: 0.9, shake: 1, post: true, tilt: true };
  private stroke: Stroke | null = null;
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
  private shopState: { offers: { opt: RewardOption; price: number; sold: boolean }[]; rerolls: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.loadSettings();
    this.world = new World(canvas);
    this.rig = new CameraRig(this.world.camera, canvas);
    this.board = new Board(this.world.scene);
    this.fx = new Fx(this.world.scene, this.world.camera, document.getElementById('fx-layer')!);
    this.ui = new UI({
      select: (id) => this.select(id),
      fire: () => this.fire(),
      undo: () => this.undo(),
      clear: () => this.clearLayout(),
      pause: () => this.openPause(),
      deck: () => this.openDeck(),
      speed: () => this.toggleSpeed(),
      skipSim: () => this.skipSim(),
    });
    this.applySettings();
    this.bindInput(canvas);
    this.enterMenu();
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
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
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ok */ }
  }

  // ================= entrada =================
  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      audio.unlock();
      this.setPointer(e);
      if (e.button === 2) { this.rightDown = { x: e.clientX, y: e.clientY }; return; }
      if (e.button !== 0 || this.mode !== 'planning' || this.paused) return;
      canvas.setPointerCapture(e.pointerId);
      this.beginStroke();
    });
    canvas.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      if (this.stroke) this.extendStroke();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this.rightDown) {
        if (Math.hypot(e.clientX - this.rightDown.x, e.clientY - this.rightDown.y) < 6 && this.mode === 'planning') this.removeAtPointer();
        this.rightDown = null;
      }
      if (e.button === 0 && this.stroke) this.endStroke();
    });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (this.paused || (this.mode === 'screen' && this.ui.hasScreen())) { this.closeOverlay(); return; }
        if (this.mode === 'planning' && this.stroke) { this.endStroke(); return; }
        if (this.mode === 'planning' || this.mode === 'sim') this.openPause();
        return;
      }
      if (this.paused) return;
      if (this.mode === 'planning') {
        if (e.ctrlKey && k === 'z') { e.preventDefault(); this.undo(); return; }
        if (k === ' ' || k === 'enter') { e.preventDefault(); this.fire(); return; }
        if (k === 'r' && !e.ctrlKey) { this.clearLayout(); return; }
        const n = Number(k);
        if (n >= 1 && n <= 9) { const id = this.ui.trayIds()[n - 1]; if (id) this.select(id); }
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
  select(id: PieceId) {
    if (this.mode !== 'planning') return;
    if (this.layout.hand[id] <= 0) { audio.ui('deny'); this.ui.toast(`Sem ${PIECES[id].plural} na mão`); return; }
    this.selected = id;
    audio.ui('click');
    this.ui.flashCard(id);
    this.refreshHud();
  }

  private ensureSelection() {
    if (this.layout.hand[this.selected] > 0) return;
    const prefer: PieceId[] = ['common', ...PIECE_ORDER];
    const next = prefer.find((k) => this.layout.hand[k] > 0 && k !== 'fork') ?? prefer.find((k) => this.layout.hand[k] > 0);
    if (next) this.selected = next;
  }

  private beginStroke() {
    const g = this.groundPoint();
    if (!g) return;
    this.ensureSelection();
    const r = this.layout.begin(g.x, g.z, this.selected);
    if (r.fail) { this.failFeedback(r.fail, null); return; }
    this.stroke = r.stroke!;
    if (r.placed) this.onPlaced(r.placed);
    this.extendStroke();
  }

  private extendStroke() {
    if (!this.stroke) return;
    const g = this.groundPoint();
    if (!g) return;
    this.ensureSelection();
    const r = this.layout.extend(this.stroke, g.x, g.z, this.selected);
    if (r.placed.length) this.onPlaced(r.placed);
    if (r.fail) this.failFeedback(r.fail, r.ghost ?? null);
    else this.board.showGhost(null);
    if (this.stroke.done && this.selected === 'fork') {
      this.ui.toast('Bifurcou! Continue de cada ponta brilhante', true);
      this.stroke = null;
      this.ensureSelection();
      this.refreshHud();
    }
  }

  private endStroke() {
    this.stroke = null;
    this.board.showGhost(null);
    this.refreshHud();
  }

  private onPlaced(list: { id: number }[]) {
    for (const p of list) {
      const placed = this.layout.get(p.id)!;
      this.board.addPiece(placed);
      audio.place(this.layout.pieces.length);
      if (placed.jump) { this.fx.text(placed.x, 0.8, placed.z, 'PULO!', 'small'); }
    }
    this.refreshHud();
  }

  private failFeedback(f: Fail, ghost: { x: number; z: number; yaw: number } | null) {
    this.board.showGhost(ghost, this.selected === 'fork' ? 'common' : this.selected);
    const now = this.realT;
    if (f !== this.lastFail || now - this.lastFailT > 1.2) {
      this.ui.toast(FAIL_TEXT[f]);
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
    const ids = this.layout.removeHead(h.id);
    for (const id of ids) this.board.removePiece(id);
    if (ids.length) { audio.ui('click'); this.refreshHud(); }
  }

  undo() {
    if (this.mode !== 'planning') return;
    const ids = this.layout.undoStroke();
    for (const id of ids) this.board.removePiece(id);
    if (ids.length) audio.ui('click');
    this.refreshHud();
  }

  clearLayout() {
    if (this.mode !== 'planning' || !this.layout.pieces.length) return;
    this.layout.clear();
    this.board.clearPieces();
    audio.whoosh();
    this.refreshHud();
  }

  private refreshHud() {
    if (!this.run) return;
    this.ui.setHand(this.layout.hand, this.layout.startHand, this.selected);
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
      if (n === 0) this.ui.coach('① Segure o botão esquerdo no marcador VERDE e arraste até os soldados.');
      else if (n < 9) this.ui.coach('② Solte e continue arrastando da ponta brilhante. Botão direito numa ponta remove.');
      else this.ui.coach('③ Chegou perto? Aperte DISPARAR! (Espaço)');
    } else if (this.coachStep === 0 && this.spec.hint) {
      this.ui.coach(this.spec.hint);
    } else this.ui.coach(null);
  }

  // ================= run / fases =================
  newRun(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.stopDemo();
    this.run = newRun(seed);
    this.startPhase();
  }

  continueRun() {
    const r = loadRun();
    if (!r) return this.newRun();
    this.stopDemo();
    this.run = r;
    this.startPhase();
  }

  startPhase() {
    const run = this.run!;
    saveRun(run);
    this.disposeSim();
    this.ui.closeScreen();
    this.fx.clear();
    this.spec = generatePhase(run.seed, run.depth, run.deck);
    this.layout = new Layout(this.spec, run.deck);
    this.attemptsMax = RULES.attemptsPerPhase + run.extraAttemptsNext;
    run.extraAttemptsNext = 0;
    this.attemptsLeft = this.attemptsMax;
    this.attemptsUsed = 0;
    this.patrolT = 0;
    this.coachStep = 0;
    this.selected = 'common';
    this.ensureSelection();
    this.board.build(this.spec);
    this.mode = 'planning';
    this.ui.setVisible(true);
    this.ui.setSimMode(false);
    this.ui.setPhase(this.spec);
    this.frameBoard();
    this.rig.snap();
    this.refreshHud();
    audio.setMusic(true, 0);
    if (this.spec.hint && run.depth > 0) setTimeout(() => { if (this.mode === 'planning') { this.coachStep = 1; this.ui.coach(null); } }, 9000);
  }

  /** Enquadra o conteúdo da fase (gatilho, inimigos, muros, lava) com folga para a HUD. */
  private frameBoard() {
    const s = this.spec;
    let x0 = s.trigger.x, x1 = s.trigger.x, z0 = s.trigger.z, z1 = s.trigger.z;
    const add = (x: number, z: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const e of s.enemies) { add(e.x, e.z); e.patrol?.pts.forEach((p) => add(p.x, p.z)); }
    for (const w of s.walls) { add(w.x - w.w / 2, w.z - w.d / 2); add(w.x + w.w / 2, w.z + w.d / 2); }
    for (const l of s.lava) { add(l.x - l.r, l.z - l.r); add(l.x + l.r, l.z + l.r); }
    const aspect = window.innerWidth / window.innerHeight;
    const w = x1 - x0 + 3, d = z1 - z0 + 3;
    const dist = THREE.MathUtils.clamp(Math.max(d / (1.06 * 0.7), w / (0.69 * aspect * 0.88)), 8, 21);
    this.rig.frame(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2 + 0.5), dist, 0, 0.86);
  }

  fire() {
    if (this.mode !== 'planning' || this.paused) return;
    if (!this.layout.pieces.length) { this.ui.toast('Desenhe uma corrente primeiro!'); audio.ui('deny'); return; }
    if (this.stroke) this.endStroke();
    this.attemptsLeft--;
    this.attemptsUsed++;
    this.mode = 'sim';
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
    audio.fire();
    audio.setMusic(true, 0.5);
    this.rig.userMoved = false;
    setTimeout(() => this.sim?.fire(), 140);
  }

  private makeSim(spec: PhaseSpec, layout: Layout, patrolT: number): Sim {
    const sim = new Sim(spec, layout.pieces, patrolT, {
      pieceFall: (i, x, _y, z, chain) => {
        const p = sim.pieces[i].p;
        audio.clack(chain, p.type === 'heavy' || p.type === 'tower' ? 1.3 : 1);
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
        audio.boom();
        this.fx.explosion(x, y, z, r);
        this.fx.text(x, y + 1.2, z, 'KABUM!', 'boom', 1.1);
        this.rig.addTrauma(0.75);
        this.hitstop = Math.max(this.hitstop, 0.09);
        this.world.lamp.position.set(x, 1.5, z);
        this.world.lamp.intensity = 60;
      },
      bulldoze: (x, z) => { if (this.mode === 'sim') { this.fx.text(x, 1, z, 'EMPURRÃO!', 'small'); audio.ui('deny'); } },
      runner: () => audio.whoosh(),
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

  private onKnock(e: SimEnemy, cause: Cause, combo: number) {
    const p = e.body.translation();
    const big = e.spec.kind === 'brute' || e.spec.kind === 'general';
    audio.knock(combo, big);
    this.fx.knockBurst(p.x, p.y, p.z, ENEMY_COLORS[e.spec.kind], big);
    this.rig.addTrauma(big ? 0.45 : 0.22);
    this.hitstop = Math.max(this.hitstop, big ? 0.08 : 0.035);
    if (this.mode !== 'sim') return;
    this.phaseKnocked++;
    this.ui.enemyDown(e.idx);
    const word = cause === 'blast' ? 'VOOU!' : cause === 'splash' ? 'DOMINÓ!' : this.fx.knockWord();
    this.fx.text(p.x, p.y + 0.9, p.z, word, big ? 'gold' : 'red', big ? 1.3 : 1);
    if (combo >= 2) {
      this.ui.combo(combo);
      if (combo % 5 === 0) this.fx.text(p.x, p.y + 1.6, p.z, `COMBO ×${combo}!`, 'gold', 1.2);
    }
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
    run.stats.bestCombo = Math.max(run.stats.bestCombo, sim.bestCombo);
    run.stats.explosions += sim.explosions;
    run.stats.knocked += sim.enemies.filter((e) => !e.alive).length;
    this.mode = 'result';
    if (sim.win) {
      const used = this.layout.cardsUsed();
      const efficient = used <= this.spec.par;
      const firstTry = this.attemptsUsed === 1;
      const stars = starsFor(true, efficient, firstTry);
      const gold = goldFor(stars, this.spec.boss, sim.bestCombo);
      run.gold += gold;
      run.stats.phasesWon++;
      run.stats.stars += stars;
      audio.win();
      this.ui.showResult({
        win: true, title: this.spec.boss ? 'GENERAL DERRUBADO!' : 'VITÓRIA!', stars,
        rows: [
          ['Inimigos derrubados', `${sim.enemies.length}/${sim.enemies.length}`, 'good'],
          ['Peças usadas', `${used} (par ${this.spec.par})`, efficient ? 'good' : ''],
          ['Tentativa', `${this.attemptsUsed}ª`, firstTry ? 'good' : ''],
          ['Maior combo', `×${sim.bestCombo}`],
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
      this.ui.showResult({
        win: false, title: 'Corrente quebrada!', stars: 0,
        rows: [
          ['Ainda de pé', `${survivors}`, 'bad'],
          ['Tentativas restantes', `${this.attemptsLeft}`],
          ['Dica', survivors === sim.enemies.length ? 'a onda nem chegou lá' : 'quase! ajuste o final'],
        ],
        gold: 0,
        buttons: [
          { label: '↺ Ajustar e tentar de novo', cls: 'btn big', fn: () => this.retry() },
          { label: `Desistir (−${survivors} ❤)`, cls: 'btn dark small', fn: () => this.acceptDamage(survivors) },
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
      rows: [['Sobreviventes', `${survivors}`, 'bad'], ['Dano', `−${dmg} ❤`, 'bad'], ['Vida', `${run.life}/${run.maxLife}`]],
      gold: 6,
      buttons: [{ label: 'Recompensa de consolo →', cls: 'btn', fn: () => this.openDraft(true) }],
    });
  }

  retry() {
    this.disposeSim();
    this.ui.closeScreen();
    this.fx.clear();
    this.board.resetPieces();
    this.board.resetEnemies(this.patrolT);
    this.mode = 'planning';
    this.ui.setSimMode(false);
    this.ui.resetEnemyIcons();
    this.frameBoard();
    this.refreshHud();
  }

  private openDraft(consolation: boolean) {
    const run = this.run!;
    this.mode = 'screen';
    const rng = runRng(run);
    let opts = draft3(rng, run.depth);
    saveRng(run, rng);
    const show = () => this.ui.showDraft(consolation ? 'Consolo' : 'Recompensa', 'Escolha 1 de 3 — vai para o seu baralho', opts, run.gold, RULES.draftRerollCost, {
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
    if (this.spec.shop) this.openShop();
    else this.nextPhase();
  }

  private openShop() {
    const run = this.run!;
    this.mode = 'screen';
    const roll = () => {
      const r = runRng(run);
      const opts = draft3(r, run.depth + 2);
      saveRng(run, r);
      return opts.map((opt) => ({ opt, price: opt.items.reduce((s, it) => s + shopPrice(it.piece, it.count), 0), sold: false }));
    };
    this.shopState = { offers: roll(), rerolls: 0 };
    const show = () => {
      const s = this.shopState!;
      this.ui.showShop({
        gold: run.gold, offers: s.offers,
        rerollCost: RULES.shopRerollBase + RULES.shopRerollStep * s.rerolls,
        healCost: RULES.shopHealCost, healAmt: RULES.shopHealLife, canHeal: run.life < run.maxLife,
        attemptCost: RULES.shopAttemptCost, canAttempt: run.extraAttemptsNext < RULES.shopMaxExtraAttempts,
        life: run.life, maxLife: run.maxLife,
      }, {
        buy: (i) => {
          const o = s.offers[i];
          if (o.sold || run.gold < o.price) return;
          run.gold -= o.price; o.sold = true; addItems(run, o.opt.items);
          audio.coin(); audio.coin(1); show();
        },
        reroll: () => {
          const c = RULES.shopRerollBase + RULES.shopRerollStep * s.rerolls;
          if (run.gold < c) return;
          run.gold -= c; s.rerolls++; s.offers = roll(); show();
        },
        heal: () => {
          if (run.gold < RULES.shopHealCost || run.life >= run.maxLife) return;
          run.gold -= RULES.shopHealCost; run.life = Math.min(run.maxLife, run.life + RULES.shopHealLife);
          audio.ui('pick'); show();
        },
        attempt: () => {
          if (run.gold < RULES.shopAttemptCost || run.extraAttemptsNext >= RULES.shopMaxExtraAttempts) return;
          run.gold -= RULES.shopAttemptCost; run.extraAttemptsNext++;
          audio.ui('pick'); show();
        },
        leave: () => this.nextPhase(),
      });
      this.refreshTopStats();
    };
    show();
  }

  private nextPhase() {
    this.run!.depth++;
    this.startPhase();
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
        ['Estrelas', `${run.stats.stars} ★`],
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
    this.disposeSim();
    this.run = null;
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
    if (this.mode !== 'planning' && this.mode !== 'sim') return;
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
    if (!this.run || this.mode !== 'planning') return;
    this.paused = true;
    this.ui.showDeck(this.run.deck, () => this.closeOverlay());
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
      if (d.endAt < 0) d.endAt = this.realT;
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
    if (planning && !this.stroke && this.pointer.inside) {
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
      this.world.canvas.style.cursor = target ? 'pointer' : 'default';
    } else {
      this.board.hoverRing.visible = false;
      this.world.canvas.style.cursor = this.stroke ? 'crosshair' : 'default';
    }
    this.board.update(dt, planning || (this.mode === 'menu' && !this.sim), this.patrolT);
    this.fx.update(dt);
    this.world.lamp.intensity *= Math.exp(-dt * 6);
    this.rig.update(dt, !this.paused && this.mode !== 'menu' && !this.ui.hasScreen());
    this.world.render(dt, this.fx.flash);
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
        this.board.enemyHit(e.idx);
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
      autoPlan: () => { const r = autoPlan(this.layout); this.board.clearPieces(); for (const p of this.layout.pieces) this.board.addPiece(p, false); this.refreshHud(); return r; },
      state: () => ({ mode: this.mode, depth: this.run?.depth, life: this.run?.life, gold: this.run?.gold, pieces: this.layout?.pieces.length, alive: this.sim?.alive, win: this.sim?.win, attemptsLeft: this.attemptsLeft }),
    };
  }
}
