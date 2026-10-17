import * as THREE from 'three';
import { RunState, addItems, addCard, saveRun, removeCard, runRng, saveRng } from '../core/run';
import { PIECES, PieceId, isCursed } from '../core/pieces';
import { RULES, shopPrice } from '../core/rules';
import { draft3, RewardOption } from '../core/rewards';
import { Card, Kind, SealId, SEALS, kindOf, kindsOf, canSeal, kindName } from '../core/cards';
import { BuffId, BUFFS, buffLevel } from '../core/buffs';
import { EventKind, sealOffers, buffOffers, curseOffers } from '../core/events';
import { curseLine } from './curseTalk';
import { audio } from './audio';
import type { Fx } from './fx';
import type { CameraRig } from './camera';
import { makeDomino, glow } from './models';
import { FaceRig, FaceBase } from './faces';
import type { SweepTarget } from './hand';
import type { UI } from '../ui/ui';
import { icon } from '../ui/icons';
import { sealImg, buffImg } from './sigils';
import * as P from './props';

// EVENTOS entre as fases, montados em 3D na mesa vazia (depois que a mão de porcelana varre tudo):
// LOJA, PRENSA DE SELOS e ALTAR MÍSTICO. Cada um é uma cena com itens clicáveis (raio do mouse),
// etiqueta de preço presa no objeto e um letreiro embaixo com "Ir embora".

export interface EventCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  rig: CameraRig;
  run: RunState;
  ui: UI;
  fx: Fx;
  say(lines: string[], force?: boolean): void;
  /** atualiza vida/ouro/tentativas/bênçãos na HUD */
  refresh(): void;
  setCursor(c: string | null): void;
  /** fim do evento: a mão varre e vem a próxima fase */
  leave(): void;
  /** abre o visor com todas as suas peças (para decidir a compra) */
  deck(): void;
  /** humor do dono da mesa (a cabeça de boneco no fundo) */
  watcher?(m: 'watch' | 'angry' | 'amused'): void;
}

interface Item {
  /** o que levanta no hover (e onde a etiqueta fica presa) */
  obj: THREE.Object3D;
  name: string;
  desc: () => string;
  price: () => number;
  /** altura da etiqueta acima da base do objeto */
  tagY: number;
  sold?: boolean;
  /** motivo para não poder usar agora (além de ouro) */
  why?: () => string | null;
  act: () => void;
  icon?: string;
  /** a etiqueta some quando vendido (o objeto sai do lugar: carimbo, emblema) */
  hideSold?: boolean;
  tag?: HTMLElement;
  ring?: THREE.Mesh;
  hoverK: number;
  baseY: number;
  /** pai original do objeto (se mudar, o objeto saiu do lugar e o hover não mexe nele) */
  home: THREE.Object3D | null;
}

const easeOutBack = (k: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const easeInOut = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);
const easeIn = (k: number) => k * k * k;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const lerp = THREE.MathUtils.lerp;

const coin = (n: number) => `${icon('coin')}${n}`;

export abstract class EventScene {
  group = new THREE.Group();
  abstract readonly kind: EventKind;
  abstract readonly title: string;
  abstract readonly subtitle: string;
  protected items: Item[] = [];
  protected hover: Item | null = null;
  /** uma animação/escolha está em andamento: cliques no cenário são ignorados */
  protected busy = false;
  /** escolhendo uma peça no leque (prensa, bigorna) */
  protected choosing = false;
  protected dead = false;
  protected rigs: FaceRig[] = [];
  private layer: HTMLElement;
  private tweens: { t: number; dur: number; fn: (k: number) => void; done: () => void }[] = [];
  private spawns: { o: THREE.Object3D; delay: number; pos: THREE.Vector3; scale: THREE.Vector3; t: number; dust: boolean }[] = [];
  private ray = new THREE.Raycaster();
  protected time = 0;

  constructor(protected ctx: EventCtx) {
    ctx.scene.add(this.group);
    this.layer = document.createElement('div');
    this.layer.className = 'ev-layer';
    ctx.ui.root.append(this.layer);
  }

  protected abstract build(): void;
  protected abstract bar(): string;
  protected abstract intro(): string[];
  protected tick(_dt: number) { /* ambiente da cena */ }

  start() {
    this.build();
    for (const it of this.items) this.attachTag(it);
    // tudo surge da mesa com quique, em onda da esquerda para a direita
    for (const o of this.group.children) {
      this.spawns.push({ o, delay: 0.15 + ((o.position.x + 6) / 12) * 0.5 + Math.random() * 0.08, pos: o.position.clone(), scale: o.scale.clone(), t: 0, dust: true });
      o.scale.setScalar(0.0001);
    }
    this.ctx.ui.eventStart(this.title, this.subtitle);
    this.refreshBar();
    this.ctx.rig.frame(new THREE.Vector3(0, 0.9, 0.4), 13.5, 0, 0.98);
    setTimeout(() => { if (!this.dead) this.ctx.say(this.intro(), true); }, 1300);
  }

  protected buttons(): { label: string; cls: string; fn: () => void }[] {
    return [
      { label: `${icon('deck')} Suas peças`, cls: 'btn dark', fn: () => this.ctx.deck() },
      { label: 'Ir embora →', cls: 'btn', fn: () => this.leave() },
    ];
  }

  protected refreshBar() {
    this.ctx.ui.eventBar(this.bar(), this.buttons());
    for (const it of this.items) this.renderTag(it);
  }

  leave() {
    if (this.busy || this.dead) return;
    this.ctx.ui.hand.hide(true);
    this.ctx.leave();
  }

  /** O que a mão de porcelana varre ao sair. */
  sweepTargets(): SweepTarget[] {
    this.layer.remove();
    this.ctx.ui.eventBar(null);
    this.ctx.setCursor(null);
    return this.group.children.filter((o) => o.visible).map((o) => ({ o, kind: 'fly' as const }));
  }

  dispose() {
    this.dead = true;
    P.returnLight();
    this.ctx.scene.remove(this.group);
    this.layer.remove();
    this.ctx.ui.eventBar(null);
    this.ctx.ui.eventEnd();
  }

  // ---------- entrada do jogador ----------
  pointer(ndc: THREE.Vector2) {
    let hit: Item | null = null;
    if (!this.busy && !this.choosing) {
      this.ray.setFromCamera(ndc, this.ctx.camera);
      const objs = this.items.filter((i) => !i.sold && i.obj.visible).map((i) => i.obj);
      const hits = this.ray.intersectObjects(objs, true);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && !this.items.some((i) => i.obj === o)) o = o.parent;
        const it = o && this.items.find((i) => i.obj === o);
        if (it) { hit = it; break; }
      }
    }
    if (hit !== this.hover) {
      if (this.hover?.tag) this.hover.tag.classList.remove('hover');
      this.hover = hit;
      if (hit) {
        audio.ui('hover');
        hit.tag?.classList.add('hover');
        this.ctx.ui.tip(`<b>${hit.icon ?? ''}${hit.name}</b>${hit.desc()}`);
      } else this.ctx.ui.tip(null);
      this.ctx.setCursor(hit ? 'pointer' : null);
    }
  }

  click() {
    const it = this.hover;
    if (!it || this.busy || this.choosing || it.sold) return;
    const why = it.why?.();
    if (why) { this.deny(it, why); return; }
    if (this.ctx.run.gold < it.price()) { this.deny(it, 'Ouro insuficiente'); return; }
    audio.ui('click');
    it.act();
  }

  /** Escolha no leque (eventos que pedem uma peça). */
  pickKind(_kind: Kind) { /* sobrescrito */ }

  // ---------- utilidades ----------
  protected deny(it: Item | null, why: string) {
    audio.ui('deny');
    this.ctx.ui.toast(why);
    if (it?.tag) { it.tag.classList.remove('shake'); void it.tag.offsetWidth; it.tag.classList.add('shake'); }
  }

  /** Cobra; devolve false se não tem ouro. */
  protected charge(price: number): boolean {
    const run = this.ctx.run;
    if (run.gold < price) { this.deny(null, 'Ouro insuficiente'); return false; }
    run.gold -= price;
    audio.coin(); audio.coin(1);
    this.ctx.refresh();
    saveRun(run);
    for (const it of this.items) this.renderTag(it);
    return true;
  }

  protected tween(dur: number, fn: (k: number) => void, ease: (k: number) => number = easeInOut): Promise<void> {
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn: (k) => fn(ease(k)), done: res }));
  }
  protected wait(sec: number): Promise<void> { return this.tween(sec, () => { /* espera */ }); }

  protected addItem(it: Omit<Item, 'hoverK' | 'baseY' | 'home'>): Item {
    const full: Item = { ...it, hoverK: 0, baseY: it.obj.position.y, home: it.obj.parent };
    const ring = P.hoverRing(0.75);
    ring.position.set(it.obj.position.x, 0.03, it.obj.position.z);
    this.group.add(ring);
    full.ring = ring;
    this.items.push(full);
    return full;
  }

  protected removeItem(it: Item) {
    it.tag?.remove();
    it.ring && this.group.remove(it.ring);
    this.items = this.items.filter((i) => i !== it);
    if (this.hover === it) { this.hover = null; this.ctx.ui.tip(null); this.ctx.setCursor(null); }
  }

  protected attachTag(it: Item) {
    const t = document.createElement('div');
    t.className = 'ev-tag';
    this.layer.append(t);
    it.tag = t;
    this.renderTag(it);
  }

  protected renderTag(it: Item) {
    if (!it.tag) return;
    const price = it.price();
    const cant = !it.sold && (this.ctx.run.gold < price || !!it.why?.());
    it.tag.classList.toggle('sold', !!it.sold);
    it.tag.classList.toggle('gone', !!it.sold && !!it.hideSold);
    it.tag.classList.toggle('cant', cant);
    it.tag.innerHTML = `<span class="nm">${it.icon ?? ''}${it.name}</span><span class="pr">${it.sold ? 'vendido' : coin(price)}</span>`;
  }

  /** Ponto do mundo → pixels de tela. */
  protected toScreen(v: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const p = v.clone().project(this.ctx.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, behind: p.z > 1 };
  }

  /** Um dominó de verdade (com rosto), para expor/animar no evento. */
  protected domino(card: { type: Card['type']; seals: SealId[] }, id: number, face: FaceBase = 'worried'): THREE.Mesh {
    const m = makeDomino(card.type, id, card.seals);
    const rig = new FaceRig(card.type, Math.random() < 0.4);
    rig.base = face;
    m.add(rig.mesh);
    m.userData.rig = rig;
    this.rigs.push(rig);
    return m;
  }

  /** A peça voa para fora da tela, para baixo (de volta para a caixa do jogador). */
  protected async flyToBox(o: THREE.Object3D, delay = 0) {
    if (delay) await this.wait(delay);
    const from = new THREE.Vector3();
    o.getWorldPosition(from);
    this.group.attach(o);
    const cam = this.ctx.camera.position;
    const to = new THREE.Vector3(cam.x * 0.6, 1.2, cam.z * 0.62);
    const s0 = o.scale.x, r0 = o.rotation.z;
    await this.tween(0.55, (k) => {
      o.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 1.6, lerp(from.z, to.z, k));
      o.rotation.z = r0 + k * 6;
      o.scale.setScalar(s0 * (1 - k * 0.6));
    }, easeIn);
    o.visible = false;
  }

  update(dt: number) {
    this.time += dt;
    // surgir
    for (const s of this.spawns) {
      s.t += dt;
      const k = THREE.MathUtils.clamp((s.t - s.delay) / 0.55, 0, 1);
      s.o.scale.copy(s.scale).multiplyScalar(Math.max(0.0001, k <= 0 ? 0 : easeOutBack(k)));
      s.o.position.set(s.pos.x, s.pos.y + Math.pow(1 - k, 3) * 1.2, s.pos.z);
      if (k >= 1 && s.dust) { s.dust = false; if (s.scale.x > 0.5) this.ctx.fx.dust(s.pos.x, s.pos.z, 0.5); }
    }
    this.spawns = this.spawns.filter((s) => s.t < s.delay + 0.6);
    // tweens
    const list = this.tweens;
    this.tweens = [];
    for (const tw of list) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) tw.done(); else this.tweens.push(tw);
    }
    for (const r of this.rigs) r.update(dt);
    // hover: o item sobe um pouco e acende o anel
    for (const it of this.items) {
      const want = it === this.hover ? 1 : 0;
      it.hoverK += (want - it.hoverK) * Math.min(1, dt * 12);
      // objeto que saiu do lugar (ex.: carimbo levado para a prensa) é animado pela cena, não pelo hover
      const away = it.obj.parent !== it.home;
      if (!away &&!this.spawns.some((s) => s.o === it.obj)) it.obj.position.y = it.baseY + it.hoverK * 0.14;
      if (it.ring) (it.ring.material as THREE.MeshBasicMaterial).opacity = it.hoverK * 0.85;
      // etiqueta presa no objeto
      if (it.tag) {
        const w = new THREE.Vector3();
        it.obj.getWorldPosition(w);
        w.y = it.baseY + it.tagY;
        const s = this.toScreen(w);
        it.tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
        it.tag.style.opacity = s.behind || !it.obj.visible ? '0' : '';
      }
    }
    this.tick(dt);
  }
}

// =====================================================================================
// LOJA
// =====================================================================================
interface Offer { opt: RewardOption; price: number; stand: THREE.Group; pieces: THREE.Mesh[]; item?: Item; x: number }

class ShopScene extends EventScene {
  readonly kind = 'shop' as const;
  readonly title = 'Loja';
  readonly subtitle = 'Peças, remédio e serviços do dono da mesa';
  private offers: Offer[] = [];
  private rerolls = 0;
  private candleFx: { flame: THREE.Group; light: THREE.PointLight } | null = null;
  private hammer: THREE.Group | null = null;
  private anvilTop = new THREE.Vector3();
  private anvil: THREE.Group | null = null;

  protected intro() { return ['Veio fazer compras? Tudo aqui tem preço.', 'Meu estoque é pequeno. Minha paciência também.']; }
  protected bar() {
    return this.choosing
      ? `<b>Bigorna</b> — escolha no leque a peça que vai ser <b>quebrada</b> (sai da sua caixa para sempre).`
      : `<b>Loja do dono da mesa</b> — clique num item para comprar. Você tem ${coin(this.ctx.run.gold)}.`;
  }
  protected buttons() {
    if (this.choosing) return [{ label: 'Cancelar', cls: 'btn dark', fn: () => this.cancelChoose() }];
    return super.buttons();
  }

  private roll(): RewardOption[] {
    const r = runRng(this.ctx.run);
    const opts = draft3(r, this.ctx.run.depth + 2);
    saveRng(this.ctx.run, r);
    return opts;
  }

  protected build() {
    const g = this.group;
    const c = P.cloth(11.6, 5.6);
    c.position.set(0, 0, 0.5);
    g.add(c);
    this.roll().forEach((opt, i) => this.makeOffer(opt, (i - 1) * 3.6));
    this.makeServices();
  }

  private makeOffer(opt: RewardOption, x: number) {
    const stand = P.plinth(2.6);
    stand.position.set(x, 0, -0.7);
    this.group.add(stand);
    const pieces: THREE.Mesh[] = [];
    const flat = opt.items.flatMap((it) => Array.from({ length: it.count }, () => it.piece));
    const shown = flat.slice(0, 6);
    shown.forEach((type, k) => {
      const d = this.domino({ type, seals: [] }, 500 + k * 13 + Math.round(x * 7));
      const n = shown.length;
      d.position.set((k - (n - 1) / 2) * 0.4, 0.23 + PIECES[type].h / 2, 0);
      d.rotation.y = (k - (n - 1) / 2) * 0.05;
      stand.add(d);
      pieces.push(d);
    });
    const price = opt.items.reduce((s, it) => s + shopPrice(it.piece, it.count), 0);
    const off: Offer = { opt, price, stand, pieces, x };
    const star = opt.items.find((it) => it.piece !== 'common') ?? opt.items[0];
    off.item = this.addItem({
      obj: stand, name: opt.label, tagY: 1.65,
      desc: () => `${PIECES[star.piece].desc}<br><small>vai para a sua caixa de peças</small>`,
      price: () => off.price,
      act: () => this.buyOffer(off),
    });
    this.offers.push(off);
  }

  private makeServices() {
    const run = this.ctx.run;
    // remédio
    const v = P.vial();
    v.g.position.set(-4.0, 0, 2.15);
    this.group.add(v.g);
    const heal = this.addItem({
      obj: v.g, name: 'Remédio', tagY: 0.95,
      desc: () => `Cura ${RULES.shopHealLife} de vida (você tem ${run.life}/${run.maxLife}).`,
      price: () => RULES.shopHealCost,
      why: () => (run.life >= run.maxLife ? 'Sua vida já está cheia' : null),
      act: async () => {
        if (!this.charge(RULES.shopHealCost)) return;
        this.busy = true;
        heal.sold = true; this.renderTag(heal);
        await this.tween(0.35, (k) => { v.cork.position.y = 0.64 + k * 0.5; v.cork.rotation.x = k * 3; }, easeOut);
        v.cork.visible = false;
        await this.tween(0.5, (k) => { v.g.position.y = heal.baseY + k * 0.8; v.g.rotation.z = Math.sin(k * 9) * 0.2; });
        this.ctx.fx.sparkBurst(v.g.position.x, 1.2, v.g.position.z, 26, '#ff4a5a', 2.2);
        this.ctx.fx.text(v.g.position.x, 1.6, v.g.position.z, `+${RULES.shopHealLife} ❤`, 'heal');
        run.life = Math.min(run.maxLife, run.life + RULES.shopHealLife);
        this.ctx.refresh();
        saveRun(run);
        audio.chime();
        await this.tween(0.3, (k) => v.g.scale.setScalar(1 - k), easeIn);
        v.g.visible = false;
        this.removeItem(heal);
        this.busy = false;
        this.refreshBar();
      },
    });
    // vela extra
    const cd = P.candle(0.6, 0.11, false);
    cd.g.position.set(-1.35, 0, 2.2);
    this.group.add(cd.g);
    const candleLight = P.borrowLight(cd.g, '#ff8a3a', 0, 4, 1.8, new THREE.Vector3(0, 0.9, 0));
    this.candleFx = { flame: cd.flame, light: candleLight };
    const candleItem = this.addItem({
      obj: cd.g, name: 'Vela extra', tagY: 1.05,
      desc: () => `+1 tentativa na próxima fase.${run.extraAttemptsNext ? ` (já tem ${run.extraAttemptsNext})` : ''}`,
      price: () => RULES.shopAttemptCost,
      why: () => (run.extraAttemptsNext >= RULES.shopMaxExtraAttempts ? 'Já tem velas demais para a próxima fase' : null),
      act: async () => {
        if (!this.charge(RULES.shopAttemptCost)) return;
        candleItem.sold = true; this.renderTag(candleItem);
        run.extraAttemptsNext++;
        saveRun(run);
        cd.flame.visible = true;
        cd.flame.scale.setScalar(0.01);
        audio.whoosh();
        await this.tween(0.4, (k) => { cd.flame.scale.setScalar(Math.max(0.01, k)); this.candleFx!.light.intensity = k * 3; }, easeOutBack);
        this.ctx.ui.toast('+1 tentativa na próxima fase', true);
        this.refreshBar();
      },
    });
    // bigorna e martelo
    const a = P.anvilAndHammer();
    a.g.position.set(1.35, 0, 2.2);
    a.g.rotation.y = -0.15;
    this.group.add(a.g);
    this.hammer = a.hammer;
    this.anvil = a.g;
    this.anvilTop.copy(a.top);
    this.addItem({
      obj: a.g, name: 'Quebrar peça', tagY: 1.05,
      desc: () => 'Escolha uma peça da sua caixa e ela é quebrada para sempre: caixa mais enxuta, mãos melhores.'
        + (run.cards.some((c) => isCursed(c.type)) ? '<br><b>Quebra peças malditas também</b> (mesmo com a caixa pequena).' : ''),
      price: () => 8,
      why: () => (run.cards.length <= 10 && !run.cards.some((c) => isCursed(c.type)) ? 'Sua caixa já está pequena demais (mínimo 10 peças)' : null),
      act: () => this.startChoose(),
    });
    // sininho (mercadoria nova)
    const b = P.deskBell();
    b.g.position.set(4.0, 0, 2.15);
    this.group.add(b.g);
    this.addItem({
      obj: b.g, name: 'Tocar o sino', tagY: 0.65,
      desc: () => 'Troca a mercadoria das prateleiras.',
      price: () => RULES.shopRerollBase + RULES.shopRerollStep * this.rerolls,
      act: async () => {
        if (!this.charge(RULES.shopRerollBase + RULES.shopRerollStep * this.rerolls)) return;
        this.rerolls++;
        this.busy = true;
        audio.ding();
        this.tween(0.5, (k) => { b.dome.rotation.z = Math.sin(k * 30) * 0.12 * (1 - k); }, (k) => k);
        // as prateleiras afundam e voltam com mercadoria nova
        const old = this.offers;
        this.offers = [];
        await this.tween(0.35, (k) => { for (const o of old) { o.stand.position.y = -k * 0.9; o.stand.scale.setScalar(1 - k * 0.6); } }, easeIn);
        for (const o of old) { this.group.remove(o.stand); if (o.item) this.removeItem(o.item); }
        const fresh = this.roll();
        fresh.forEach((opt, i) => this.makeOffer(opt, (i - 1) * 3.6));
        for (const o of this.offers) {
          if (o.item) this.attachTag(o.item);
          o.stand.scale.setScalar(0.0001);
        }
        await this.tween(0.45, (k) => { for (const o of this.offers) o.stand.scale.setScalar(Math.max(0.0001, easeOutBack(k))); }, (k) => k);
        this.busy = false;
        this.refreshBar();
      },
    });
  }

  private async buyOffer(off: Offer) {
    if (!this.charge(off.price)) return;
    this.busy = true;
    if (off.item) { off.item.sold = true; this.renderTag(off.item); }
    this.ctx.say(['Bom negócio… para mim.', 'Leve. Elas não vão durar mesmo.']);
    addItems(this.ctx.run, off.opt.items);
    saveRun(this.ctx.run);
    off.pieces.forEach((d, k) => {
      (d.userData.rig as FaceRig).base = 'scared';
      this.flyToBox(d, k * 0.08);
    });
    audio.card();
    await this.wait(0.55 + off.pieces.length * 0.08);
    this.ctx.ui.toast(`+${off.opt.label} na sua caixa`, true);
    this.busy = false;
    this.refreshBar();
  }

  // ---------- quebrar peça ----------
  private startChoose() {
    const run = this.ctx.run;
    this.choosing = true;
    this.hover = null;
    this.ctx.ui.tip(null);
    this.ctx.setCursor(null);
    this.ctx.ui.hand.hide(false);
    // caixa no mínimo: só dá para quebrar as malditas
    this.ctx.ui.hand.chooseStart(kindsOf(run.cards, (c) => run.cards.length > 10 || isCursed(c.type)));
    this.refreshBar();
  }

  private cancelChoose() {
    if (!this.choosing || this.busy) return;
    this.choosing = false;
    this.ctx.ui.hand.chooseEnd();
    setTimeout(() => { if (!this.choosing) this.ctx.ui.hand.hide(true); }, 450);
    this.refreshBar();
  }

  async pickKind(kind: Kind) {
    if (!this.choosing || this.busy) return;
    const run = this.ctx.run;
    const card = run.cards.find((c) => kindOf(c) === kind);
    if (!card || !this.charge(8)) return;
    this.busy = true;
    const anvil = this.anvil!, hammer = this.hammer!;
    const top = anvil.localToWorld(this.anvilTop.clone());
    this.ctx.ui.hand.takeOut(card.uid, this.toScreen(top));
    this.ctx.ui.hand.chooseEnd();
    this.choosing = false;
    this.refreshBar();
    await this.wait(0.4);
    this.ctx.ui.hand.hide(true);
    // a peça cai deitada na bigorna, apavorada
    const d = this.domino(card, card.uid, 'scared');
    d.rotation.set(-Math.PI / 2, 0, 0.3);
    this.group.add(d);
    const bed = top.clone().add(new THREE.Vector3(0, PIECES[card.type].t / 2, 0));
    await this.tween(0.35, (k) => d.position.set(bed.x, bed.y + (1 - k) * 1.2, bed.z), easeIn);
    audio.card(0, true);
    await this.wait(0.25);
    // martelada
    const r0 = hammer.rotation.z;
    await this.tween(0.3, (k) => { hammer.rotation.z = r0 + k * 0.5; }, easeOut);
    await this.tween(0.12, (k) => { hammer.rotation.z = r0 + 0.5 - k * 2.05; }, easeIn);
    audio.crunch();
    this.ctx.rig.addTrauma(0.5);
    this.ctx.fx.knockBurst(bed.x, bed.y + 0.1, bed.z, PIECES[card.type].color, true);
    this.ctx.fx.sparkBurst(bed.x, bed.y + 0.1, bed.z, 30, '#ffd27a', 3);
    d.visible = false;
    // cacos
    const shards: THREE.Mesh[] = [];
    const m = new THREE.MeshStandardMaterial({ color: PIECES[card.type].color, roughness: 0.6 });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08 + Math.random() * 0.1, 0.05, 0.08 + Math.random() * 0.12), m);
      s.position.copy(bed);
      s.castShadow = true;
      s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.group.add(s);
      shards.push(s);
    }
    removeCard(run, card.uid);
    saveRun(run);
    await this.tween(0.9, (k) => {
      for (const s of shards) {
        const v = s.userData.v as THREE.Vector3;
        v.y -= 9.8 * 0.016;
        s.position.addScaledVector(v, 0.016);
        if (s.position.y < 0.03) { s.position.y = 0.03; v.set(v.x * 0.5, Math.abs(v.y) * 0.3, v.z * 0.5); }
        s.rotation.x += 0.2; s.rotation.y += 0.15;
        s.scale.setScalar(1 - Math.max(0, k - 0.6) * 2.4);
      }
    }, (k) => k);
    for (const s of shards) this.group.remove(s);
    await this.tween(0.3, (k) => { hammer.rotation.z = r0 - 1.55 + k * 1.55; });
    this.ctx.ui.toast(`${kindName(kind)} quebrada — sua caixa tem ${run.cards.length} peças`, true);
    this.ctx.say(isCursed(card.type) ? ['Quebrou meu presente? Que falta de educação.', 'Tudo bem. Eu tenho mais.'] : ['Uma a menos. Ninguém vai sentir falta.', 'Crec. Adoro esse barulho.']);
    this.busy = false;
    this.refreshBar();
  }

  protected tick() {
    if (this.candleFx?.flame.visible) {
      const f = 1 + Math.sin(this.time * 17) * 0.06 + Math.sin(this.time * 7.3) * 0.05;
      this.candleFx.flame.scale.set(f, f * (1 + Math.sin(this.time * 11) * 0.08), f);
    }
  }
}

// =====================================================================================
// PRENSA DE SELOS
// =====================================================================================
class PressScene extends EventScene {
  readonly kind = 'press' as const;
  readonly title = 'Prensa de Selos';
  readonly subtitle = 'Carimbe um poder numa das suas peças';
  private press!: P.Press;
  private dies: { seal: SealId; die: THREE.Group; paper: THREE.Group; item: Item }[] = [];
  private loaded: { seal: SealId; die: THREE.Group; item: Item; home: THREE.Vector3; homeParent: THREE.Object3D } | null = null;

  protected intro() { return ['A prensa marca para sempre. Escolha bem.', 'Carimbo não sai. Nem com reza.']; }
  protected bar() {
    if (this.choosing && this.loaded) return `<b>${SEALS[this.loaded.seal].name}</b> — escolha no leque a peça que vai receber o selo (cada peça aguenta até 2).`;
    return `<b>Prensa de selos</b> — escolha um carimbo. Você tem ${coin(this.ctx.run.gold)}.`;
  }
  protected buttons() {
    if (this.choosing) return [{ label: 'Cancelar', cls: 'btn dark', fn: () => this.cancelChoose() }];
    return super.buttons();
  }

  protected build() {
    const g = this.group;
    const c = P.cloth(11, 5.2, P.M.velvetDark());
    c.position.set(0, 0, 0.4);
    g.add(c);
    this.press = P.press();
    this.press.g.position.set(-2.0, 0, -0.3);
    this.press.g.rotation.y = 0.2;
    this.press.g.scale.setScalar(0.82);
    g.add(this.press.g);
    const rack = P.dieRack(3, 1.3);
    rack.position.set(2.4, 0, 0.9);
    rack.rotation.y = -0.12;
    g.add(rack);
    const r = runRng(this.ctx.run);
    const seals = sealOffers(r);
    saveRng(this.ctx.run, r);
    seals.forEach((seal, i) => {
      const paper = P.proofPaper(seal);
      paper.position.set((i - 1) * 1.3, 0.12, 0.12);
      rack.add(paper);
      const die = P.stampDie(seal);
      die.position.set((i - 1) * 1.3, 0.13, -0.22);
      rack.add(die);
      // o item é o par carimbo + papel (o hover levanta só o carimbo)
      const item = this.addItem({
        obj: die, name: SEALS[seal].name, icon: sealImg(seal, 'seal-ico tag'), tagY: 0.95, hideSold: true,
        desc: () => `${SEALS[seal].desc}<br><small>escolha a peça depois de comprar · cada peça aguenta até 2 selos</small>`,
        price: () => SEALS[seal].price,
        why: () => (this.ctx.run.cards.some((c2) => canSeal(c2, seal)) ? null : 'Nenhuma peça pode receber este selo'),
        act: () => this.loadDie(seal),
      });
      item.ring!.position.set(rack.position.x + (i - 1) * 1.3, 0.03, rack.position.z);
      this.dies.push({ seal, die, paper, item });
    });
  }

  /** Carimbo comprado: voa para baixo do cabeçote e o leque mostra as peças que podem recebê-lo. */
  private async loadDie(seal: SealId) {
    const d = this.dies.find((x) => x.seal === seal);
    if (!d || !this.charge(SEALS[seal].price)) return;
    this.busy = true;
    d.item.sold = true;
    this.renderTag(d.item);
    this.hover = null;
    this.ctx.ui.tip(null);
    this.ctx.setCursor(null);
    const home = d.die.position.clone();
    const homeParent = d.die.parent!;
    const from = new THREE.Vector3();
    d.die.getWorldPosition(from);
    this.group.attach(d.die);
    // o carimbo continua EM PÉ (face de latão para baixo): voa até logo abaixo do soquete, girando no eixo
    // do cabo, e depois sobe encaixando o cabo no cabeçote
    this.press.ram.attach(d.die);
    const start = d.die.position.clone(), r0 = d.die.rotation.y;
    const slot = this.press.dieSlot.clone();
    const below = slot.clone().setY(slot.y - 0.55);
    await this.tween(0.55, (k) => {
      d.die.position.lerpVectors(start, below, k);
      d.die.position.y += Math.sin(k * Math.PI) * 1.2;
      d.die.rotation.set(Math.sin(k * Math.PI) * 0.35, lerp(r0, Math.PI * 2, k), 0);
    }, easeInOut);
    d.die.rotation.set(0, 0, 0);
    await this.tween(0.14, (k) => d.die.position.lerpVectors(below, slot, k), easeIn);
    audio.clang();
    this.ctx.rig.addTrauma(0.12);
    this.loaded = { seal, die: d.die, item: d.item, home, homeParent };
    this.ctx.ui.hand.hide(false);
    this.ctx.ui.hand.chooseStart(kindsOf(this.ctx.run.cards, (c) => canSeal(c, seal)));
    this.choosing = true;
    this.busy = false;
    this.refreshBar();
  }

  /** Desistiu da peça: o carimbo volta para o suporte e o ouro é devolvido. */
  private async cancelChoose() {
    if (!this.choosing || this.busy || !this.loaded) return;
    const L = this.loaded;
    this.choosing = false;
    this.busy = true;
    this.ctx.ui.hand.chooseEnd();
    setTimeout(() => this.ctx.ui.hand.hide(true), 450);
    this.ctx.run.gold += SEALS[L.seal].price;
    this.ctx.refresh();
    saveRun(this.ctx.run);
    L.homeParent.attach(L.die);
    const from = L.die.position.clone();
    await this.tween(0.5, (k) => {
      L.die.position.lerpVectors(from, L.home, k);
      L.die.position.y += Math.sin(k * Math.PI) * 1.2;
      L.die.rotation.set(Math.sin(k * Math.PI) * 0.35, 0, 0);
    });
    L.die.rotation.set(0, 0, 0);
    L.item.sold = false;
    L.item.baseY = L.home.y;
    this.loaded = null;
    this.busy = false;
    this.refreshBar();
  }

  async pickKind(kind: Kind) {
    if (!this.choosing || this.busy || !this.loaded) return;
    const L = this.loaded;
    const run = this.ctx.run;
    const card = run.cards.find((c) => kindOf(c) === kind && canSeal(c, L.seal));
    if (!card) return;
    this.busy = true;
    const pr = this.press;
    const bedW = pr.g.localToWorld(pr.bed.clone());
    this.ctx.ui.hand.takeOut(card.uid, this.toScreen(bedW));
    this.ctx.ui.hand.chooseEnd();
    this.choosing = false;
    this.refreshBar();
    this.ctx.ui.eventBar(`<b>${SEALS[L.seal].name}</b> — prensando…`, []);
    await this.wait(0.4);
    this.ctx.ui.hand.hide(true);
    // a peça cai deitada na mesa da prensa (de barriga para cima, olhando o cabeçote)
    let d = this.domino(card, card.uid, 'scared');
    d.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    pr.g.add(d);
    const bed = pr.bed.clone().add(new THREE.Vector3(0, PIECES[card.type].t / 2 + 0.005, 0));
    await this.tween(0.35, (k) => d.position.set(bed.x, bed.y + (1 - k) * 1.4, bed.z), easeIn);
    audio.card(0, true);
    await this.wait(0.3);
    // armando: o cabeçote sobe um pouco e o volante gira para trás (antecipação)
    const up = pr.ramUp;
    const cock = up + 0.22;
    await this.tween(0.22, (k) => {
      pr.ram.position.y = lerp(up, cock, k);
      pr.wheel.rotation.y = -k * 0.6;
      pr.needle.rotation.z = k * 0.4;
    }, easeOut);
    await this.wait(0.08);
    // DESCE: rápido e acelerando até bater
    await this.tween(0.13, (k) => {
      pr.ram.position.y = lerp(cock, pr.ramDown, k);
      pr.wheel.rotation.y = -0.6 + k * Math.PI * 4;
      pr.needle.rotation.z = 0.4 - k * 2.8;
    }, (k) => k * k * k);
    // TUM
    audio.stamp();
    audio.thud();
    this.ctx.rig.addTrauma(0.9);
    this.ctx.fx.flash = Math.min(0.3, this.ctx.fx.flash + 0.18);
    const bw = pr.g.localToWorld(bed.clone());
    const ink = SEALS[L.seal].ink;
    this.ctx.fx.sparkBurst(bw.x, bw.y + 0.05, bw.z, 46, ink, 4.2);
    this.ctx.fx.sparkBurst(bw.x, bw.y + 0.05, bw.z, 18, '#fff3d0', 3);
    this.ctx.fx.ring(bw.x, bw.z, 1.6, ink, 0.35);
    this.ctx.fx.ring(bw.x, bw.z, 0.9, '#fff3d0', 0.22);
    this.ctx.fx.dust(bw.x, bw.z, 0.9);
    this.ctx.fx.text(bw.x, bw.y + 1.1, bw.z, 'TUM!', 'boom', 1.1);
    if (canSeal(card, L.seal)) card.seals.push(L.seal);
    // a peça achata com a pancada (na espessura) e a prensa inteira treme
    const base = pr.g.position.clone();
    const squash = (k: number) => {
      const s = Math.sin(k * Math.PI) * Math.exp(-k * 2.5);
      d.scale.set(1 + 0.12 * s, 1 + 0.12 * s, 1 - 0.45 * s);
      pr.g.position.set(base.x + (Math.random() - 0.5) * 0.06 * (1 - k), base.y, base.z + (Math.random() - 0.5) * 0.04 * (1 - k));
    };
    saveRun(run);
    // troca a peça pela versão carimbada (mesmo lugar)
    const stamped = this.domino(card, card.uid, 'dizzy');
    stamped.position.copy(d.position);
    stamped.rotation.copy(d.rotation);
    pr.g.add(stamped);
    pr.g.remove(d);
    d = stamped;
    // quique do cabeçote + peça achatando, prensa tremendo
    await this.tween(0.32, (k) => {
      pr.ram.position.y = pr.ramDown + Math.sin(k * Math.PI) * Math.exp(-k * 3) * 0.06;
      squash(k);
    });
    d.scale.set(1, 1, 1);
    pr.g.position.copy(base);
    await this.wait(0.2);
    // o cabeçote sobe devagar (o peso já foi) e o carimbo usado some
    await this.tween(0.6, (k) => {
      pr.ram.position.y = lerp(pr.ramDown, up, k);
      pr.wheel.rotation.y = -0.6 + Math.PI * 4 * (1 - k);
      pr.needle.rotation.z = -2.4 * (1 - k);
    }, easeOut);
    await this.tween(0.25, (k) => L.die.scale.setScalar(Math.max(0.0001, 1 - k)), easeIn);
    L.die.visible = false;
    this.removeItem(L.item);
    this.loaded = null;
    // a peça mostra o selo novo e pula de volta para a caixa
    await this.tween(0.45, (k) => { d.position.y = bed.y + Math.sin(k * Math.PI) * 0.9; d.rotation.x = -Math.PI / 2 + k * (Math.PI / 2 - 0.25); }, easeOut);
    (d.userData.rig as FaceRig).base = 'happy';
    await this.wait(0.55);
    await this.flyToBox(d);
    this.ctx.ui.toast(`${PIECES[card.type].name} ganhou o selo ${SEALS[L.seal].name}`, true);
    this.ctx.say(['Pronto. Agora ela é especial. Como você.', 'Marcada para sempre.']);
    this.busy = false;
    this.refreshBar();
  }

  protected tick() {
    // o volante balança de leve (a prensa "respira")
    if (!this.busy && this.press) this.press.needle.rotation.z = Math.sin(this.time * 2.3) * 0.08 - 0.1;
  }
}

// =====================================================================================
// ALTAR MÍSTICO
// =====================================================================================
class MysticScene extends EventScene {
  readonly kind = 'mystic' as const;
  readonly title = 'Altar Místico';
  readonly subtitle = 'Bênçãos que duram a run inteira';
  private altar!: P.Altar;
  private emblems: { id: BuffId; em: THREE.Group; ped: THREE.Group; item: Item; phase: number }[] = [];
  private flash = 0;

  protected intro() { return ['O altar escuta. Pague, e ele responde.', 'Bênção tem preço. Maldição sai de graça.']; }
  protected bar() { return `<b>Altar místico</b> — escolha uma bênção para a run inteira. Você tem ${coin(this.ctx.run.gold)}.`; }

  protected build() {
    const g = this.group;
    // a bola de cristal fica no fundo do círculo; as oferendas, na frente
    this.altar = P.altar(-1.5);
    this.altar.g.position.set(0, 0, 0.2);
    g.add(this.altar.g);
    const r = runRng(this.ctx.run);
    const offers = buffOffers(r, this.ctx.run.buffs);
    saveRng(this.ctx.run, r);
    const xs = offers.length === 1 ? [0] : offers.length === 2 ? [-1.4, 1.4] : [-2.5, 0, 2.5];
    offers.forEach((id, i) => {
      const ped = P.pedestal();
      ped.position.set(xs[i], 0, i === 1 && offers.length === 3 ? 1.35 : 0.95);
      g.add(ped);
      const em = P.emblem(id);
      em.scale.setScalar(1.45);
      em.position.set(0, (ped.userData.top as number) + 0.7, 0);
      ped.add(em);
      const run = this.ctx.run;
      const item = this.addItem({
        obj: ped, name: BUFFS[id].name, icon: buffImg(id, 'buff-ico tag'), tagY: 2.15, hideSold: true,
        desc: () => `${BUFFS[id].desc}${BUFFS[id].max > 1 ? `<br><small>você tem ${buffLevel(run.buffs, id)}/${BUFFS[id].max}</small>` : ''}`,
        price: () => BUFFS[id].price,
        act: () => this.bless(id),
      });
      this.emblems.push({ id, em, ped, item, phase: i * 2.1 });
    });
  }

  private async bless(id: BuffId) {
    const e = this.emblems.find((x) => x.id === id);
    if (!e || !this.charge(BUFFS[id].price)) return;
    this.busy = true;
    e.item.sold = true;
    this.renderTag(e.item);
    this.hover = null;
    this.ctx.ui.tip(null);
    this.ctx.setCursor(null);
    const em = e.em;
    // sobe girando...
    const y0 = em.position.y;
    await this.tween(0.6, (k) => { em.position.y = y0 + k * 0.9; em.rotation.y += 0.05 + k * 0.4; }, easeOut);
    // ...e voa para dentro da bola de cristal
    const from = new THREE.Vector3();
    em.getWorldPosition(from);
    this.group.attach(em);
    const ball = new THREE.Vector3();
    this.altar.ball.getWorldPosition(ball);
    await this.tween(0.5, (k) => {
      em.position.lerpVectors(from, ball, k);
      em.position.y += Math.sin(k * Math.PI) * 0.6;
      em.scale.setScalar(Math.max(0.0001, 1 - k * 0.9));
      em.rotation.y += 0.5;
    }, easeIn);
    em.visible = false;
    this.flash = 1;
    audio.chime();
    this.ctx.rig.addTrauma(0.2);
    this.ctx.fx.sparkBurst(ball.x, ball.y, ball.z, 40, BUFFS[id].color, 2.4);
    // a bênção vale na hora
    const run = this.ctx.run;
    run.buffs[id] = buffLevel(run.buffs, id) + 1;
    if (id === 'vigor') { run.maxLife += 3; run.life += 3; }
    saveRun(run);
    this.ctx.refresh();
    this.removeItem(e.item);
    this.ctx.ui.toast(`Bênção: ${BUFFS[id].name} — ${BUFFS[id].desc}`, true);
    await this.wait(0.6);
    this.ctx.say(['Ele aceitou. Por enquanto.', 'Agora você deve um favor ao altar.']);
    this.busy = false;
    this.refreshBar();
  }

  protected tick(dt: number) {
    const t = this.time;
    const a = this.altar;
    if (!a) return;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    a.ballLight.intensity = 5 + Math.sin(t * 1.7) * 1.2 + this.flash * 30;
    a.core.scale.setScalar(0.85 + Math.sin(t * 2.3) * 0.08 + this.flash * 0.6);
    a.core.rotation.y += dt * 0.6;
    for (const f of a.flames) {
      const k = 1 + Math.sin(t * 17 + f.id) * 0.07 + Math.sin(t * 6.1 + f.id * 2) * 0.05;
      f.scale.set(k, k * (1 + Math.sin(t * 11 + f.id) * 0.08), k);
    }
    for (const e of this.emblems) {
      if (!e.em.visible || e.item.sold) continue;
      e.em.position.y = (e.ped.userData.top as number) + 0.7 + Math.sin(t * 1.6 + e.phase) * 0.08;
      e.em.rotation.y += dt * 0.6;
      const eye = e.em.getObjectByName('eye');
      if (eye) { e.em.rotation.y = 0; eye.lookAt(this.ctx.camera.position); }
    }
  }
}

// =====================================================================================
// PRESENTE DO DONO (evento ruim): duas peças malditas acorrentadas; uma vai para a caixa, à força
// =====================================================================================
class CurseScene extends EventScene {
  readonly kind = 'curse' as const;
  readonly title = 'Presente do Dono';
  readonly subtitle = 'Um presentinho que você não pode recusar';
  private gifts: { type: PieceId; ped: THREE.Group; d: THREE.Mesh; item: Item; chain: THREE.LineSegments; phase: number }[] = [];
  private flames: THREE.Group[] = [];
  private light: THREE.PointLight | null = null;
  private nextChat = 3;

  protected intro() { return ['Trouxe um presentinho. Você não pode recusar.', 'Escolha. As duas querem muito ir com você.']; }
  protected bar() { return `<b>Presente do Dono</b> — escolha <b>uma</b> peça maldita: ela vai para a sua caixa. Enquanto estiver na mão, a <b>Nova mão</b> fica travada até você colocá-la na mesa.`; }
  protected buttons() { return [{ label: `${icon('deck')} Suas peças`, cls: 'btn dark', fn: () => this.ctx.deck() }]; }

  protected build() {
    const g = this.group;
    const c = P.cloth(8.4, 4.6, P.M.velvetDark());
    c.position.set(0, 0, 0.5);
    g.add(c);
    this.ctx.watcher?.('amused');
    this.light = P.borrowLight(g, '#a050ff', 5, 7, 1.6, new THREE.Vector3(0, 2.2, 1));
    // velas de chama verde nos cantos
    for (const [x, z, h] of [[-3.4, -0.6, 0.7], [3.4, -0.6, 0.55], [-3.0, 2.2, 0.45], [3.0, 2.2, 0.6]] as const) {
      const cd = P.candle(h, 0.1, true);
      cd.flame.children.forEach((m, i) => { (m as THREE.Mesh).material = glow(i ? '#e8ffd0' : '#7dff5a', i ? 6 : 4); });
      cd.g.position.set(x, 0, z);
      g.add(cd.g);
      this.flames.push(cd.flame);
    }
    const r = runRng(this.ctx.run);
    const offers = curseOffers(r);
    saveRng(this.ctx.run, r);
    offers.forEach((type, i) => {
      const ped = P.pedestal();
      ped.position.set(i ? 1.7 : -1.7, 0, 0.9);
      g.add(ped);
      const top = ped.userData.top as number;
      const d = this.domino({ type, seals: [] }, 900 + i * 7);
      d.position.set(0, top + PIECES[type].h / 2 + 0.25, 0);
      ped.add(d);
      // correntes: do alto do escuro até a peça (como os fios da mão-marionete)
      const pts: number[] = [];
      for (const sx of [-1, 1]) pts.push(sx * 0.12, top + PIECES[type].h + 0.2, 0, sx * 0.5, top + 4, 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const chain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#8a7a9a', transparent: true, opacity: 0.7 }));
      ped.add(chain);
      const item = this.addItem({
        obj: ped, name: PIECES[type].name, tagY: 2.3, hideSold: true,
        icon: '☠ ',
        desc: () => `${PIECES[type].desc}<br><small>de graça — e não tem volta (só quebrando na bigorna da Loja)</small>`,
        price: () => 0,
        act: () => this.take(type),
      });
      this.gifts.push({ type, ped, d, item, chain, phase: i * 1.7 });
    });
  }

  protected renderTag(it: Item) {
    super.renderTag(it);
    const pr = it.tag?.querySelector('.pr');
    if (pr && !it.sold) pr.textContent = 'grátis';
  }

  private async take(type: PieceId) {
    const gift = this.gifts.find((x) => x.type === type);
    if (!gift || this.busy) return;
    this.busy = true;
    for (const x of this.gifts) { x.item.sold = true; this.renderTag(x.item); }
    this.hover = null;
    this.ctx.ui.tip(null);
    this.ctx.setCursor(null);
    addCard(this.ctx.run, type);
    saveRun(this.ctx.run);
    const other = this.gifts.find((x) => x !== gift);
    // as correntes se soltam, a escolhida pula de alegria e voa para a caixa; a outra afunda na mesa
    gift.chain.visible = false;
    const line = curseLine(type, 'placed');
    if (line) { const s = this.toScreen(gift.d.getWorldPosition(new THREE.Vector3())); this.ctx.ui.pieceSpeak(s.x, s.y, line); }
    audio.whoosh();
    if (other) {
      this.removeItem(other.item); // sai do hover (senão o hover segura a altura do pedestal)
      const o = other.ped;
      const p = o.position;
      this.ctx.fx.sparkBurst(p.x, 1.2, p.z, 30, '#a050ff', 1.6);
      this.ctx.fx.dust(p.x, p.z, 1.2);
      this.tween(0.8, (k) => { o.position.y = -k * 2.2; o.rotation.y = k * 2; }, easeIn).then(() => { o.visible = false; });
    }
    const d = gift.d, y0 = d.position.y;
    await this.tween(0.45, (k) => { d.position.y = y0 + Math.sin(k * Math.PI) * 0.6; d.rotation.y = k * Math.PI * 2; });
    const w = d.getWorldPosition(new THREE.Vector3());
    this.ctx.fx.sparkBurst(w.x, w.y, w.z, 24, '#9dff5a', 2);
    audio.card();
    await this.flyToBox(d);
    this.ctx.ui.toast(`${PIECES[type].name} (maldita) entrou na sua caixa`);
    this.ctx.say(['Cuide bem dela. Ela vai cuidar de você.', 'Hehehe. Boa escolha… para mim.'], true);
    await this.wait(1.6);
    this.busy = false;
    this.leave();
  }

  protected tick(dt: number) {
    const t = this.time;
    if (this.light) this.light.intensity = 4 + Math.sin(t * 1.3) * 1.5;
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 15 + f.id) * 0.08;
      f.scale.set(k, k * (1 + Math.sin(t * 9 + f.id) * 0.1), k);
    }
    for (const x of this.gifts) {
      if (x.item.sold) continue;
      // pendurada balançando nas correntes; no hover treme de vontade
      const hov = this.hover === x.item;
      x.d.rotation.z = Math.sin(t * 1.4 + x.phase) * 0.08 + (hov ? (Math.random() - 0.5) * 0.12 : 0);
      x.d.rotation.y = Math.sin(t * 0.9 + x.phase) * 0.25;
    }
    // de vez em quando uma delas fala
    this.nextChat -= dt;
    if (this.nextChat <= 0 && !this.busy) {
      this.nextChat = 4 + Math.random() * 4;
      const x = this.gifts[Math.floor(Math.random() * this.gifts.length)];
      const line = x && !x.item.sold ? curseLine(x.type, 'idle') : null;
      if (line) { const s = this.toScreen(x.d.getWorldPosition(new THREE.Vector3())); this.ctx.ui.pieceSpeak(s.x, s.y - 30, line); }
    }
  }

  dispose() {
    this.ctx.watcher?.('watch');
    super.dispose();
  }
}

export function createEvent(kind: EventKind, ctx: EventCtx): EventScene {
  if (kind === 'shop') return new ShopScene(ctx);
  if (kind === 'curse') return new CurseScene(ctx);
  if (kind === 'press') return new PressScene(ctx);
  return new MysticScene(ctx);
}

/** Nome e frase curta de cada evento (anúncio no fim da fase). */
export const EVENT_INFO: Record<EventKind, { name: string; hint: string }> = {
  shop: { name: 'Loja', hint: 'peças, remédio e serviços' },
  press: { name: 'Prensa de Selos', hint: 'carimbe um poder numa peça' },
  mystic: { name: 'Altar Místico', hint: 'uma bênção para a run inteira' },
  curse: { name: 'Presente do Dono', hint: 'ele tem um presentinho para você…' },
};
