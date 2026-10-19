import * as THREE from 'three';
import { Rng } from '../core/rng';
import { carvedBlock } from './hand';
import { wornWoodTextures } from './textures';

// Fundo vivo: redemoinho de tinta (à la Balatro) em tela cheia atrás de tudo, bem escuro,
// e o "dono da mesa": a cabeça de um boneco de ventríloquo, pendurada por cordas no breu do outro lado
// da mesa. Os olhos de bola acompanham o cursor e a cascata, as pálpebras se arregalam nos sustos,
// fecham a cara quando você vence e "riem" quando você perde; o queixo bate quando ele fala.
// A tinta do rosto descasca e racha a cada vitória.

/** Redemoinho de tinta (função GLSL compartilhada com o pós-processamento, que pinta o breu da cena). */
export const SWIRL_GLSL = `
  vec3 swirl(vec2 uv, float t, float pulse, float tension){
    float len = length(uv);
    // giro em espiral: quanto mais longe do centro, mais torce (e gira mais rápido com a tensão)
    float spin = t * (0.06 + tension * 0.1);
    float ang = atan(uv.y, uv.x) + spin - len * (3.0 + pulse * 2.2 + tension * 0.8);
    uv = vec2(cos(ang), sin(ang)) * len * 9.0;
    vec2 uv2 = vec2(uv.x + uv.y);
    float sp = t * (0.35 + tension * 0.45);
    for (int i = 0; i < 5; i++) {
      uv2 += sin(max(uv.x, uv.y)) + uv;
      uv += 0.5 * vec2(cos(5.1123 + 0.353 * uv2.y + sp * 0.131), sin(uv2.x - 0.113 * sp));
      uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
    }
    float paint = clamp(length(uv) * 0.045, 0.0, 2.0);
    float c1 = max(0.0, 1.0 - 1.6 * abs(1.0 - paint));
    float c2 = max(0.0, 1.0 - 1.6 * abs(paint));
    float c3 = 1.0 - min(1.0, c1 + c2);
    // filetes de brasa onde as duas tintas se encontram (aparecem mais na tensão e nos sustos)
    float seam = pow(max(0.0, 1.0 - 4.0 * abs(paint - 0.55)), 3.0);
    vec3 wine = mix(vec3(0.26, 0.03, 0.05), vec3(0.42, 0.04, 0.03), tension);
    vec3 violet = mix(vec3(0.08, 0.02, 0.10), vec3(0.14, 0.02, 0.08), tension);
    vec3 black = vec3(0.012, 0.008, 0.016);
    vec3 ember = vec3(0.9, 0.36, 0.08);
    vec3 col = wine * c1 + violet * c2 + black * c3 + ember * seam * (0.08 + tension * 0.22 + pulse * 0.35);
    return col * (0.85 + pulse * 1.3 + tension * 0.35);
  }`;

const SwirlShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform float uAz; uniform float uPulse; uniform float uTension; uniform vec2 uRes;
    varying vec2 vUv;
    ${SWIRL_GLSL}
    void main(){
      vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      uv.x += uAz * 0.25;
      vec3 col = swirl(uv, uTime, uPulse, uTension);
      // escurece no centro (onde a mesa costuma estar)
      col *= smoothstep(0.0, 0.9, length(uv) + 0.15);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export type WatcherMood = 'watch' | 'angry' | 'amused';

/** Onde o dono da mesa fica: logo atrás da borda de trás da mesa (z = -7,5), saindo de trás do tampo. */
export const MASK_POS = new THREE.Vector3(0, 1.2, -8.8);
/** Escala da cabeça (modelada com ~1 m de raio): fica do tamanho da mão gigante. */
const HEAD_S = 1.25;
/** Crânio: esfera achatada nos lados, centro um pouco acima da origem da cabeça. */
const SKULL_Y = 0.15, SKULL_SX = 0.86;

// ---------- pintura do rosto (textura equirretangular da esfera: frente = u 0,25) ----------
const FACE_W = 1024, FACE_H = 512;
/** Ponto do rosto (ângulo para o lado α, positivo = direita do boneco vista de frente; elevação e) → pixel. */
const fp = (a: number, e: number): [number, number] => [(0.25 + a / (Math.PI * 2)) * FACE_W, (0.5 - e / Math.PI) * FACE_H];

/** Camadas de estrago (rachaduras + tinta descascada) que aparecem conforme o nível de rachadura. */
const DAMAGE: { at: number; cracks: [number, number][][]; flakes: [number, number, number][] }[] = [
  { at: 0.05, cracks: [[[-0.36, 0.3], [-0.44, 0.5], [-0.38, 0.68], [-0.46, 0.86]]], flakes: [] },
  { at: 0.2, cracks: [[[0.4, 0.02], [0.52, -0.14], [0.47, -0.32]], [[0.52, -0.14], [0.66, -0.2]]], flakes: [[0.53, -0.16, 18]] },
  { at: 0.35, cracks: [[[0.02, 0.95], [0.08, 0.72], [-0.03, 0.55], [0.04, 0.42]]], flakes: [[0.06, 0.74, 34]] },
  { at: 0.5, cracks: [[[-0.3, -0.06], [-0.46, -0.26], [-0.38, -0.46]], [[-0.46, -0.26], [-0.68, -0.32]]], flakes: [[-0.5, -0.28, 26], [-0.66, -0.34, 14]] },
  { at: 0.7, cracks: [[[0.62, 0.66], [0.76, 0.48], [0.9, 0.42]]], flakes: [[0.78, 0.5, 30]] },
  { at: 0.85, cracks: [[[-0.14, -0.4], [-0.06, -0.62], [-0.2, -0.82]], [[0.24, 0.3], [0.12, 0.2]]], flakes: [[0.0, 0.16, 16], [-0.1, -0.66, 22]] },
];

function paintFace(g: CanvasRenderingContext2D, wood: HTMLCanvasElement | null, crack: number) {
  const r = new Rng(77);
  // tinta de pele (bege desbotado), mais escura embaixo e encardida nas bordas
  const grd = g.createLinearGradient(0, 0, 0, FACE_H);
  grd.addColorStop(0, '#e6c9a6'); grd.addColorStop(0.55, '#ddb994'); grd.addColorStop(1, '#a98564');
  g.fillStyle = grd;
  g.fillRect(0, 0, FACE_W, FACE_H);
  for (let i = 0; i < 60; i++) {
    const [x, y] = [r.float() * FACE_W, r.float() * FACE_H];
    const rad = 20 + r.float() * 90;
    const s = g.createRadialGradient(x, y, 0, x, y, rad);
    s.addColorStop(0, `rgba(70,45,25,${0.05 + r.float() * 0.08})`); s.addColorStop(1, 'rgba(70,45,25,0)');
    g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // bochechas rosadas pintadas
  for (const side of [-1, 1]) {
    const [x, y] = fp(side * 0.56, -0.2);
    const s = g.createRadialGradient(x, y, 0, x, y, 62);
    s.addColorStop(0, 'rgba(214,92,86,0.55)'); s.addColorStop(1, 'rgba(214,92,86,0)');
    g.fillStyle = s; g.fillRect(x - 62, y - 62, 124, 124);
  }
  // sardas
  g.fillStyle = 'rgba(120,60,40,0.35)';
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1;
    const [x, y] = fp(side * (0.4 + r.float() * 0.3), -0.08 - r.float() * 0.2);
    g.beginPath(); g.arc(x, y, 1.5 + r.float() * 2, 0, Math.PI * 2); g.fill();
  }
  // vincos que descem do nariz até os cantos da boca (as "costuras" de boneco)
  g.strokeStyle = 'rgba(70,40,25,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const a = fp(side * 0.17, -0.04), b = fp(side * 0.27, -0.2), c = fp(side * 0.3, -0.36);
    g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(...b, ...c); g.stroke();
  }
  // arranhões finos no verniz
  g.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const [x, y] = [r.float() * FACE_W, r.float() * FACE_H];
    const ang = r.float() * Math.PI, len = 4 + r.float() * 18;
    g.strokeStyle = r.chance(0.5) ? 'rgba(255,240,220,0.25)' : 'rgba(60,35,20,0.25)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
  // estrago acumulado: lascas de tinta (madeira aparecendo, borda escura) e rachaduras pretas
  for (const d of DAMAGE) {
    if (crack < d.at) continue;
    for (const [a, e, rad] of d.flakes) {
      const [x, y] = fp(a, e);
      g.save();
      g.beginPath();
      for (let k = 0; k <= 11; k++) {
        const t = (k / 11) * Math.PI * 2, rr = rad * (0.6 + r.float() * 0.55);
        const px = x + Math.cos(t) * rr * 1.3, py = y + Math.sin(t) * rr;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.strokeStyle = 'rgba(40,22,10,0.8)'; g.lineWidth = 3; g.stroke();
      g.clip();
      if (wood) g.drawImage(wood, x * 0.7, y * 0.9, 200, 200, x - rad * 1.5, y - rad * 1.2, rad * 3, rad * 2.4);
      else { g.fillStyle = '#7e6448'; g.fill(); }
      g.restore();
      // borda da tinta levantada (clara)
      g.strokeStyle = 'rgba(250,230,200,0.5)'; g.lineWidth = 1; g.stroke();
    }
    for (const line of d.cracks) {
      g.strokeStyle = '#140a04'; g.lineJoin = 'round';
      for (let k = 0; k < line.length - 1; k++) {
        const [x0, y0] = fp(...line[k]), [x1, y1] = fp(...line[k + 1]);
        g.lineWidth = Math.max(1, 3.4 - k * 0.8);
        g.beginPath(); g.moveTo(x0, y0);
        // traço quebrado em zigue-zague
        const n = 4;
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          const jx = s < n ? (r.float() - 0.5) * 6 : 0, jy = s < n ? (r.float() - 0.5) * 6 : 0;
          g.lineTo(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy);
        }
        g.stroke();
      }
    }
  }
}

/** Olho de vidro pintado: branco, íris azul-acinzentada e pupila (na frente da esfera: u 0,25). */
function eyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe7d6'; g.fillRect(0, 0, 256, 128);
  // veias finas
  g.strokeStyle = 'rgba(170,60,50,0.25)'; g.lineWidth = 1;
  const r = new Rng(5);
  for (let i = 0; i < 10; i++) {
    let x = 64 + (r.float() - 0.5) * 120, y = r.chance(0.5) ? 20 : 108;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (64 - x) * 0.2 + (r.float() - 0.5) * 8; y += (64 - y) * 0.2; g.lineTo(x, y); }
    g.stroke();
  }
  const iris = g.createRadialGradient(64, 64, 6, 64, 64, 24);
  iris.addColorStop(0, '#2c4250'); iris.addColorStop(0.7, '#5a7c88'); iris.addColorStop(1, '#1c2830');
  g.fillStyle = iris;
  g.beginPath(); g.ellipse(64, 64, 22, 24, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#060404';
  g.beginPath(); g.ellipse(64, 64, 9, 10, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface Eye { ball: THREE.Mesh; tilt: THREE.Group; lid: THREE.Mesh; brow: THREE.Mesh; side: number }

export class Backdrop {
  swirl: THREE.Mesh;
  /** a cabeça do boneco (gira para encarar a câmera) */
  head = new THREE.Group();
  /** ponto do mundo que o dono da mesa encara */
  target = new THREE.Vector3(0, 0, 0);
  mood: WatcherMood = 'watch';
  pulse = 0;
  /** 0 = calmo (planejando), 1 = cascata correndo: o redemoinho acelera e esquenta (suavizado) */
  tension = 0;
  tensionGoal = 0;
  private wide = 0;
  private t = 0;
  private az = 0;
  private blinkAt = 3;
  private blink = -1;
  private look = new THREE.Vector2();
  private anger = 0;
  private squint = 0.25;
  private talkLeft = 0;
  private jawOpen = 0;
  private jaw = new THREE.Group();
  private eyes: Eye[] = [];
  private faceMat: THREE.MeshStandardMaterial;
  private faceCanvas: HTMLCanvasElement;
  private faceTex: THREE.CanvasTexture;
  private crack = -1;
  private crackFlash = 0;
  private strings: THREE.LineSegments;
  private jawAnchors: THREE.Object3D[] = [];
  private tmp = new THREE.Vector3();
  private swirlU: { [k: string]: THREE.IUniform };

  constructor(scene: THREE.Scene) {
    this.swirlU = { uTime: { value: 0 }, uAz: { value: 0 }, uPulse: { value: 0 }, uTension: { value: 0 }, uRes: { value: new THREE.Vector2(16, 9) } };
    this.swirl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.swirlU, vertexShader: SwirlShader.vertexShader, fragmentShader: SwirlShader.fragmentShader,
      depthWrite: false, toneMapped: false,
    }));
    this.swirl.frustumCulled = false;
    // o vertex shader dele posiciona o quad em tela cheia; com o material de normais do AO ele viraria um plano 2x2 no centro da mesa
    this.swirl.userData.noAO = true;
    this.swirl.renderOrder = -1000;
    scene.add(this.swirl);

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = FACE_W; this.faceCanvas.height = FACE_H;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 8;
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.42, emissive: '#ff8a40', emissiveIntensity: 0 });
    this.setCrack(0);
    this.strings = this.build();
    this.head.scale.setScalar(HEAD_S);
    scene.add(this.head);
  }

  private build(): THREE.LineSegments {
    const h = this.head;
    const add = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D = h) => { o.traverse((m) => { m.castShadow = false; m.receiveShadow = true; }); parent.add(o); return o; };
    const skin = new THREE.MeshStandardMaterial({ color: '#dcb994', roughness: 0.45 });
    const rosy = new THREE.MeshStandardMaterial({ color: '#d98e78', roughness: 0.4 });
    const lip = new THREE.MeshStandardMaterial({ color: '#8e2a26', roughness: 0.35 });
    const hair = new THREE.MeshStandardMaterial({ color: '#2a170c', roughness: 0.5, metalness: 0.1 });
    const dark = new THREE.MeshBasicMaterial({ color: '#070304' });
    const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.12 });
    const { map, bump } = wornWoodTextures();
    const wood = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2, roughness: 0.8, color: '#e8dccb' });
    const suit = new THREE.MeshStandardMaterial({ color: '#1b1820', roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#d8cfba', roughness: 0.8 });
    const bow = new THREE.MeshStandardMaterial({ color: '#7a1420', roughness: 0.6 });

    // crânio pintado + cabelo laqueado (com risca de lado)
    const skull = add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), this.faceMat));
    skull.scale.set(SKULL_SX, 1, SKULL_SX * 0.98);
    skull.position.y = SKULL_Y;
    // (sem girar: girar um elipsoide muda a forma dele e o crânio furava o cabelo)
    const cap = add(new THREE.Mesh(new THREE.SphereGeometry(1.04, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.35), hair));
    cap.scale.copy(skull.scale);
    cap.position.y = SKULL_Y;
    const part = add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 32, Math.PI * 0.55), dark));
    part.position.set(0.28, SKULL_Y + 0.88, 0.02);
    part.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.5);
    // orelhas e nariz arredondado
    for (const s of [-1, 1]) {
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), skin));
      ear.scale.set(0.45, 1, 0.8);
      ear.position.set(s * 0.86, 0.1, -0.05);
    }
    const nose = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), rosy));
    nose.scale.set(1, 0.9, 1.1);
    nose.position.set(0, 0.0, 0.86);
    // olhos de vidro com pálpebra de cima (a de baixo é fixa) e sobrancelha pintada em relevo
    for (const side of [-1, 1]) {
      const eg = add(new THREE.Group());
      eg.position.set(side * 0.3, 0.24, 0.66);
      const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), eyeMat), eg);
      ball.rotation.order = 'YXZ';
      // órbita escura em volta (dá fundo ao olho)
      const socket = add(new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.035, 10, 32), new THREE.MeshStandardMaterial({ color: '#7a5038', roughness: 0.7 })), eg);
      socket.position.z = 0.04;
      const lower = add(new THREE.Mesh(new THREE.SphereGeometry(0.212, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin), eg);
      lower.rotation.x = 0.95;
      const tilt = add(new THREE.Group(), eg);
      const lid = add(new THREE.Mesh(new THREE.SphereGeometry(0.218, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin), tilt);
      // cílios: aro escuro na borda da pálpebra
      const lash = add(new THREE.Mesh(new THREE.TorusGeometry(0.218, 0.01, 6, 40, Math.PI), dark), lid);
      lash.rotation.set(-Math.PI / 2, 0, 0);
      const brow = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 8, 24, Math.PI * 0.62), hair));
      brow.position.set(side * 0.3, 0.52, 0.74);
      brow.rotation.set(-0.35, 0, Math.PI * 0.19);
      this.eyes.push({ ball, tilt, lid, brow, side });
    }
    // boca: lábio de cima fixo, cavidade escura e o queixo articulado (dobradiça atrás)
    const upperLip = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.34, 4, 12), lip));
    upperLip.rotation.z = Math.PI / 2;
    upperLip.position.set(0, -0.29, 0.83);
    const mouth = add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.34), dark));
    mouth.position.set(0, -0.43, 0.68);
    this.jaw.position.set(0, -0.3, 0.3);
    h.add(this.jaw);
    const chin = add(new THREE.Mesh(carvedBlock(0.62, 0.4, 0.58, 0.12, [6, 4, 6], [], 0.6, 3), this.faceMat), this.jaw);
    chin.position.set(0, -0.23, 0.36);
    // o queixo usa a mesma pintura do rosto: UV apontando para a região do queixo
    const uv = chin.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const cp = chin.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const [px, py] = fp(cp.getX(i) * 0.9, -0.62 + cp.getY(i) * 0.6);
      uv.setXY(i, px / FACE_W, 1 - py / FACE_H);
    }
    const lowerLip = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 12), lip), this.jaw);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.position.set(0, -0.05, 0.64);
    // pescoço de madeira, colarinho e gravata-borboleta
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, 20), wood));
    neck.position.y = -0.95;
    const collar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.28, 24, 1, true), shirt));
    collar.position.y = -1.12;
    const jacket = add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), suit));
    jacket.scale.set(1.5, 0.9, 0.9);
    jacket.position.y = -1.2;
    for (const s of [-1, 1]) {
      const wing = add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), bow));
      wing.rotation.z = s * Math.PI / 2;
      wing.scale.set(1, 1, 0.5);
      wing.position.set(s * 0.15, -1.13, 0.5);
    }
    const knot = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bow));
    knot.position.set(0, -1.13, 0.52);

    // luz de vela vinda de baixo (fica sempre na cena: o número de luzes não muda)
    const under = new THREE.PointLight('#ffb070', 6, 8, 1.4);
    under.position.set(0.6, -1.8, 2.8);
    h.add(under);

    // cordas: topo da cabeça, têmporas e cantos do queixo, subindo até sumir no escuro
    const fixed: [number, number, number][] = [[0, SKULL_Y + 1.0, 0], [-0.78, 0.7, 0.1], [0.78, 0.7, 0.1]];
    for (const s of [-1, 1]) {
      const o = new THREE.Object3D();
      o.position.set(s * 0.27, -0.42, 0.62);
      this.jaw.add(o);
      this.jawAnchors.push(o);
    }
    const n = fixed.length + this.jawAnchors.length;
    const pos = new Float32Array(n * 6);
    fixed.forEach(([x, y, z], i) => pos.set([x, y, z, x * 1.4, 30, z - 2], i * 6));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const strings = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#e8dfc8', transparent: true, opacity: 0.35, depthWrite: false }));
    strings.frustumCulled = false;
    h.add(strings);
    this.fixedStrings = fixed.length;
    return strings;
  }
  private fixedStrings = 0;

  /** Susto: olhos arregalados e queixo caído (explosão, combo grande, a mão descendo). */
  startle(amount = 1) { this.wide = Math.min(1.4, this.wide + amount); this.pulse = Math.min(1, this.pulse + amount * 0.5); }

  /** O boneco fala: o queixo bate por `seconds`. */
  talk(seconds: number) { this.talkLeft = Math.max(this.talkLeft, seconds); }

  /** Nível de rachadura (0..1): repinta o rosto com o estrago. Se aumentou, o rosto brilha um instante. */
  setCrack(level: number) {
    const v = THREE.MathUtils.clamp(level, 0, 1);
    if (Math.abs(v - this.crack) < 1e-3) return;
    if (this.crack >= 0 && v > this.crack) this.crackFlash = 1;
    this.crack = v;
    paintFace(this.faceCanvas.getContext('2d')!, wornWoodTextures().map.image as HTMLCanvasElement, v);
    this.faceTex.needsUpdate = true;
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.t += dt;
    // para onde a câmera olha (azimute): 0 = olhando para -Z, o lado onde ele está sentado
    const fwd = cam.getWorldDirection(this.tmp);
    this.az = Math.atan2(-fwd.x, -fwd.z);
    this.wide = Math.max(0, this.wide - dt * 0.8);
    this.pulse = Math.max(0, this.pulse - dt * 0.7);
    this.swirlU.uTime.value = this.t;
    this.swirlU.uAz.value = this.az;
    this.swirlU.uPulse.value = this.pulse;
    this.tension += (this.tensionGoal - this.tension) * (1 - Math.exp(-dt * 1.5));
    this.swirlU.uTension.value = this.tension;
    (this.swirlU.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);

    // pendurado nas cordas atrás da borda de trás da mesa: balança devagar e vira o rosto para a câmera
    const h = this.head;
    h.position.set(MASK_POS.x + Math.sin(this.t * 0.23) * 0.12, MASK_POS.y + Math.sin(this.t * 0.6) * 0.08, MASK_POS.z);
    h.rotation.order = 'YXZ';
    h.rotation.y = Math.atan2(cam.position.x - h.position.x, cam.position.z - h.position.z) + Math.sin(this.t * 0.17) * 0.05;
    h.rotation.x = 0.12 + Math.sin(this.t * 0.4) * 0.02;
    h.rotation.z = Math.sin(this.t * 0.31) * 0.05; // inclina a cabeça devagar
    h.updateMatrixWorld();

    // piscada (às vezes dupla)
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blink < 0) { this.blink = 0; this.blinkAt = Math.random() < 0.2 ? 0.3 : 3 + Math.random() * 5; }
    let shut = 0;
    if (this.blink >= 0) {
      this.blink += dt;
      shut = Math.max(0, 1 - Math.abs(this.blink - 0.08) / 0.08);
      if (this.blink > 0.18) this.blink = -1;
    }
    const wide = Math.min(1, this.wide);
    const k = 1 - Math.exp(-dt * 3);
    this.anger += ((this.mood === 'angry' ? 1 : 0) * (1 - wide) - this.anger) * k;
    this.squint += ((this.mood === 'amused' ? 0.85 : this.mood === 'angry' ? 0.3 : 0.2) * (1 - wide) - this.squint) * k;
    this.crackFlash = Math.max(0, this.crackFlash - dt * 1.5);
    this.faceMat.emissiveIntensity = this.crackFlash * 0.35;

    // olhar: compara na tela a posição do alvo com a dos olhos (ele olha "para baixo", para a mesa)
    const hp = h.position.clone().project(cam);
    const tp = this.target.clone().project(cam);
    const lx = THREE.MathUtils.clamp((tp.x - hp.x) * 1.3, -1, 1);
    const ly = THREE.MathUtils.clamp((tp.y - hp.y) * 0.9, -1, 0.4);
    // com a tela de tamanho zero (aba escondida) a projeção dá NaN: não deixa contaminar o olhar
    if (Number.isFinite(lx) && Number.isFinite(ly)) this.look.lerp(new THREE.Vector2(lx, ly), 1 - Math.exp(-dt * 5));
    if (!Number.isFinite(this.look.x) || !Number.isFinite(this.look.y)) this.look.set(0, 0);
    // pálpebra: aberta (-0,75), arregalada (-1,15), meio fechada no deboche, fechada na piscada (+0,9)
    let lidX = -0.75 - wide * 0.45 + this.squint * 0.55 + this.anger * 0.25;
    lidX += (0.95 - lidX) * shut;
    for (const e of this.eyes) {
      e.ball.rotation.y = this.look.x * 0.5;
      e.ball.rotation.x = 0.12 - this.look.y * 0.35;
      e.lid.rotation.x = lidX;
      e.tilt.rotation.z = e.side * this.anger * 0.38;
      e.brow.position.y = 0.52 + wide * 0.07 - this.anger * 0.05;
      e.brow.rotation.z = Math.PI * 0.19 + e.side * (this.anger * 0.45 - wide * 0.15) - this.squint * 0.1;
    }

    // queixo: bate enquanto fala; cai no susto; fica entreaberto no deboche
    this.talkLeft = Math.max(0, this.talkLeft - dt);
    let jaw = this.mood === 'amused' ? 0.06 : 0;
    if (this.talkLeft > 0) jaw = 0.08 + 0.32 * Math.abs(Math.sin(this.t * 11) * Math.sin(this.t * 6.3 + 1));
    jaw = Math.max(jaw, wide * 0.35);
    this.jawOpen += (jaw - this.jawOpen) * (1 - Math.exp(-dt * 18));
    this.jaw.rotation.x = this.jawOpen;
    this.jaw.updateMatrixWorld();

    // cordas do queixo acompanham a abertura
    const a = this.strings.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.jawAnchors.forEach((o, i) => {
      const p = h.worldToLocal(o.getWorldPosition(this.tmp));
      const j = this.fixedStrings + i;
      a.setXYZ(j * 2, p.x, p.y, p.z);
      a.setXYZ(j * 2 + 1, p.x * 1.6, 30, p.z - 2);
    });
    a.needsUpdate = true;
  }
}
