import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PIECES, PieceId, FORK_OFFSET } from '../core/pieces';
import type { SealId } from '../core/cards';
import { makeDomino } from './models';
import { FaceRig, FaceBase } from './faces';

// A mão em 3D: os MESMOS dominós (e rostos) do tabuleiro, desenhados numa camada WebGL própria por cima
// da interface. Quem manda é o HTML da mão (ui/handview.ts): cada peça lá é uma "procuração"
// invisível — clique, layout e animações continuam em CSS — e aqui, a cada quadro, cada dominó 3D
// copia a posição, o giro e o tamanho dela (lidos de dois marcadores: base e topo da peça).
// A caixa também é 3D, então a parede dela tampa de verdade a peça que
// ainda está lá dentro. O descarte é só um retângulo pontilhado (HTML).

interface View {
  outer: THREE.Group;   // posição na tela (px), giro no plano e escala
  faces: FaceRig[];
  outlines: THREE.Mesh[];
  type: PieceId | null;
  h: number;            // altura do modelo (m)
  look: FaceBase;       // "olhadela" própria desta peça para as caras curiosas
}

interface Box { left: number; top: number; width: number; height: number; bottom: number; el: HTMLElement }

/** Altura que a peça ocupa na procuração (as altas — torre, grande — são encolhidas um pouco). */
const fillFor = (h: number) => 0.98 / Math.max(0.8, h * 0.7);

const OUTLINE = {
  use: new THREE.MeshBasicMaterial({ color: '#c08a3a', side: THREE.BackSide, transparent: true, opacity: 0.7 }),
  sel: new THREE.MeshBasicMaterial({ color: '#b08040', side: THREE.BackSide, transparent: true, opacity: 0.6 }),
  doomed: new THREE.MeshBasicMaterial({ color: '#3a0c08', side: THREE.BackSide, transparent: true, opacity: 0.75 }),
};

/** Expressões da mão (data-face do HTML) → expressões do atlas de rostos 3D. */
function faceFor(name: string | undefined, v: View): FaceBase {
  switch (name) {
    case 'bored': return 'neutral';     // indiferente (pisca e olha para os lados)
    case 'smug': return v.look;         // olhando de lado, sem interesse
    case 'curious': return v.look;
    case 'sleepy': return 'blink';
    case 'worried': return 'worried';   // olhos correndo de um lado pro outro
    case 'nervous': return 'nervous';
    case 'sad': return 'sad';
    case 'scared': case 'wow': return 'scared';
    case 'scream': return 'scream';
    default: return 'neutral';
  }
}

export class HandRender {
  canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(18, 1, 10, 20000);
  private views = new Map<HTMLElement, View>();
  private boxMat = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.7 });
  private boxIn = new THREE.MeshStandardMaterial({ color: '#120b08', roughness: 0.9 });
  private rimMat = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.4, metalness: 0.5 });
  private box = new THREE.Group();
  private boxKey = '';
  private last = performance.now();
  private W = 0;
  private H = 0;
  private seq = 1;

  constructor(private hand: HTMLElement, host: HTMLElement) {
    this.canvas.className = 'hand3d';
    host.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.1;
    // luz quente da lâmpada vinda do alto, preenchimento fraco e um contorno frio por trás
    this.scene.add(new THREE.HemisphereLight('#ffe2b8', '#2a160c', 0.55));
    const key = new THREE.DirectionalLight('#ffd09a', 1.9);
    key.position.set(-0.5, 1, 0.9);
    const rim = new THREE.DirectionalLight('#7f8cff', 0.9);
    rim.position.set(0.8, 0.4, -1);
    this.scene.add(key, rim, this.box);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    requestAnimationFrame(loop);
  }

  private resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.W, this.H, false);
    // câmera que enxerga exatamente W×H "px" no plano z = 0
    this.camera.aspect = this.W / this.H;
    const dist = this.H / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(0, 0, dist);
    this.camera.near = dist * 0.2;
    this.camera.far = dist * 3;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  /** px de tela → mundo (y para cima, origem no centro). */
  private wx(x: number) { return x - this.W / 2; }
  private wy(y: number) { return this.H / 2 - y; }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const hidden = this.hand.classList.contains('away') || !!this.hand.closest('.hidden');
    this.canvas.classList.toggle('off', hidden);
    if (hidden) return;
    this.syncStores();
    // peças: cria/remove/atualiza conforme as procurações do HTML
    const els = Array.from(this.hand.querySelectorAll<HTMLElement>('.hp'));
    const alive = new Set(els);
    for (const [el, v] of this.views) if (!alive.has(el)) { this.scene.remove(v.outer); this.views.delete(el); }
    for (const el of els) {
      let v = this.views.get(el);
      if (!v) { v = this.makeView(el); this.views.set(el, v); this.scene.add(v.outer); }
      this.place(el, v, dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private makeView(el: HTMLElement): View {
    const ghost = el.classList.contains('ghost');
    const type = (ghost ? 'common' : el.dataset.type) as PieceId;
    const seals = ghost ? [] : ((el.dataset.seals || '').split(',').filter(Boolean) as SealId[]);
    const outer = new THREE.Group();
    const pose = new THREE.Group();
    // de frente para quem joga (como uma carta na mão), só um pouco virada para mostrar a espessura
    pose.rotation.set(-0.06, -0.16 + (Math.random() - 0.5) * 0.12, 0);
    outer.add(pose);
    const faces: FaceRig[] = [];
    const outlines: THREE.Mesh[] = [];
    const d = PIECES[type];
    const add = (x: number) => {
      const m = makeDomino(type, this.seq++, seals);
      m.castShadow = m.receiveShadow = false;
      m.position.set(x, d.h / 2, 0);
      if (!ghost) {
        const f = new FaceRig(type, Math.random() < 0.4);
        f.base = 'neutral';
        m.add(f.mesh);
        faces.push(f);
        const o = new THREE.Mesh(m.geometry, OUTLINE.use);
        o.scale.setScalar(1.035);
        o.visible = false;
        m.add(o);
        outlines.push(o);
      }
      pose.add(m);
    };
    if (type === 'fork') { add(-FORK_OFFSET * 0.75); add(FORK_OFFSET * 0.75); } else add(0);
    return { outer, faces, outlines, type: ghost ? null : type, h: d.h, look: Math.random() < 0.5 ? 'lookL' : 'lookR' };
  }

  /** Copia posição/giro/tamanho da procuração (marcadores .mk.a = base e .mk.b = topo). */
  private place(el: HTMLElement, v: View, dt: number) {
    const a = el.querySelector('.mk.a')?.getBoundingClientRect();
    const b = el.querySelector('.mk.b')?.getBoundingClientRect();
    if (!a || !b) return;
    const ax = this.wx(a.left), ay = this.wy(a.top), bx = this.wx(b.left), by = this.wy(b.top);
    const len = Math.hypot(bx - ax, by - ay);
    const cs = getComputedStyle(el);
    const op = Number(cs.opacity);
    v.outer.visible = len > 1 && op > 0.3;
    if (!v.outer.visible) return;
    const z = Number(cs.zIndex) || 0;
    // em voo por cima de tudo (passa na frente da caixa); na mão, uma leve ordem da esquerda p/ a direita
    const depth = z >= 600 ? len * 0.9 : z >= 100 ? len * 0.35 : z * 0.2;
    v.outer.position.set(ax, ay, depth);
    v.outer.rotation.z = Math.atan2(-(bx - ax), by - ay);
    v.outer.scale.setScalar(len * fillFor(v.h));
    const sel = el.classList.contains('sel'), use = el.classList.contains('use'), doomed = el.classList.contains('doomed');
    // contorno: forte em quem a trilha vai gastar, fraco no tipo escolhido, escuro em quem vai para o descarte
    const mat = use ? OUTLINE.use : doomed ? OUTLINE.doomed : sel ? OUTLINE.sel : null;
    for (const o of v.outlines) { o.visible = !!mat; if (mat) o.material = mat; }
    const base = faceFor(el.dataset.face, v);
    for (const f of v.faces) { f.base = base; f.update(dt); }
  }

  // ---------- caixa, pote e suporte (reconstruídos quando mudam de tamanho ou de conteúdo) ----------
  /** Retângulo de layout (sem as animações CSS de tremer/puxar, que entram depois como deslocamento). */
  private rectOf(sel: string): Box | null {
    const e = this.hand.querySelector<HTMLElement>(sel);
    if (!e || !e.offsetWidth) return null;
    const hb = this.hand.getBoundingClientRect();
    const left = hb.left + e.offsetLeft, top = hb.top + e.offsetTop;
    return { left, top, width: e.offsetWidth, height: e.offsetHeight, bottom: top + e.offsetHeight, el: e };
  }

  /** Aplica o translate/rotate animado do HTML (tranco ao puxar, sacudida ao misturar) ao grupo 3D. */
  private jiggle(g: THREE.Group, r: Box) {
    const cs = getComputedStyle(r.el);
    const t = cs.translate && cs.translate !== 'none' ? cs.translate.split(' ').map(parseFloat) : [0, 0];
    const rot = cs.rotate && cs.rotate !== 'none' ? parseFloat(cs.rotate) : 0;
    const base = g.userData.base as THREE.Vector3 | undefined;
    if (!base) return;
    g.position.set(base.x + (t[0] || 0), base.y - (t[1] || 0), base.z);
    g.rotation.z = -THREE.MathUtils.degToRad(rot || 0);
  }

  private syncStores() {
    const br = this.rectOf('.store.box');
    // modo escolha (eventos): a caixa some
    this.box.visible = !!br && !this.hand.classList.contains('choose');
    if (br) {
      const n = Number(br.el.querySelector('.n')?.textContent) || 0;
      const k = `${Math.round(br.left)}:${Math.round(br.top)}:${br.width}:${Math.min(6, Math.ceil(n / 2))}`;
      if (k !== this.boxKey) { this.boxKey = k; this.buildBox(br, n); }
      this.jiggle(this.box, br);
    }
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.own) (o as THREE.Mesh).geometry.dispose(); });
    }
  }

  private plank(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.userData.own = true;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** Caixa lisa e escura (sem tábuas nem textura) com algumas peças de pé aparecendo pela borda. */
  private buildBox(r: Box, n: number) {
    this.clear(this.box);
    const W = r.width, wallH = r.height * 0.72, D = W * 0.7, t = W * 0.05;
    const g = new THREE.Group();
    g.rotation.set(0.18, 0.22, 0);
    this.box.add(g);
    this.box.position.set(this.wx(r.left + W / 2), this.wy(r.bottom), 0);
    this.box.userData.base = this.box.position.clone();
    this.plank(W, t, D, this.boxIn, 0, t / 2, 0, g);
    this.plank(W, wallH, t, this.boxMat, 0, wallH / 2, D / 2 - t / 2, g);
    this.plank(W, wallH, t, this.boxIn, 0, wallH / 2, -D / 2 + t / 2, g);
    this.plank(t, wallH, D, this.boxMat, -W / 2 + t / 2, wallH / 2, 0, g);
    this.plank(t, wallH, D, this.boxMat, W / 2 - t / 2, wallH / 2, 0, g);
    // filete na borda de cima (pega a luz e desenha o contorno)
    this.plank(W * 1.02, t * 0.35, t * 1.2, this.rimMat, 0, wallH, D / 2 - t / 2, g);
    const shown = Math.min(6, Math.ceil(n / 2));
    // altura da peça ≈ parede + um pouquinho; largura limitada ao vão entre as paredes
    const s = (wallH * 1.15) / 0.8;
    const pieceW = 0.4 * s;
    const inner = Math.max(0, W / 2 - t - pieceW / 2 - W * 0.04);
    for (let i = 0; i < shown; i++) {
      const m = makeDomino('common', 100 + i * 7);
      m.castShadow = m.receiveShadow = false;
      m.scale.setScalar(s);
      const k = shown > 1 ? i / (shown - 1) : 0.5;
      m.position.set(-inner + k * 2 * inner, 0.4 * s + t, ((i % 2) - 0.5) * D * 0.25);
      m.rotation.set(0, 0, (k - 0.5) * 0.12);
      g.add(m);
    }
  }
}
