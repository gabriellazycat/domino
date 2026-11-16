import * as THREE from 'three';
import type { Backdrop } from './backdrop';

// Marionete (laboratório ?vilao=T5A|T5B|T5C): cabeça brinquedo sem sobrancelha pintada +
//   - sobrancelhas 3D de madeira laqueada que mexem (raiva, susto, deboche), cada uma presa num fio;
//   - cordas de barbante que saem de pontos na SUPERFÍCIE (achados por raio) e sobem para uma cruzeta fora
//     do quadro, inclinadas para longe da cabeça: nenhuma atravessa o boneco;
//   - olho 2D de vórtice com partículas desenhadas que escapam do olho (3 estilos: A tinta, B faíscas, C rabiscos).

type Priv = {
  strings: THREE.Object3D; head: THREE.Group;
  eyes: { ball: THREE.Object3D; lid: THREE.Object3D }[];
  look: THREE.Vector2; mood: string; anger: number; wide: number; squint: number; talkLeft: number;
};

const UP = new THREE.Vector3(0, 1, 0);

/** Primeiro ponto da superfície do modelo ao longo de um raio (coordenadas locais do `root`). */
function hitLocal(root: THREE.Object3D, meshes: THREE.Object3D[], from: THREE.Vector3, dir: THREE.Vector3) {
  root.updateMatrixWorld(true);
  const o = root.localToWorld(from.clone());
  const d = root.localToWorld(from.clone().add(dir)).sub(o).normalize();
  const hit = new THREE.Raycaster(o, d).intersectObjects(meshes, false)[0];
  return hit ? root.worldToLocal(hit.point.clone()) : null;
}

// ---------------------------------------------------------------- cordas
interface Str { mesh: THREE.Mesh; anchor: THREE.Object3D; top: THREE.Vector3; top0: THREE.Vector3; ring: THREE.Mesh }

function makeStrings(root: THREE.Object3D) {
  const twine = new THREE.MeshStandardMaterial({ color: '#d9c9a4', roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9973e', roughness: 0.35, metalness: 0.8 });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const ringGeo = new THREE.TorusGeometry(0.035, 0.009, 6, 14);
  const list: Str[] = [];
  const add = (anchor: THREE.Object3D, top: THREE.Vector3) => {
    const mesh = new THREE.Mesh(geo, twine);
    const ring = new THREE.Mesh(ringGeo, brass); // ilhós de latão onde o fio amarra
    root.add(mesh); anchor.add(ring);
    mesh.frustumCulled = false;
    mesh.userData.string = true;
    list.push({ mesh, anchor, top: top.clone(), top0: top.clone(), ring });
  };
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  const update = () => {
    for (const s of list) {
      root.updateMatrixWorld();
      const a = root.worldToLocal(s.anchor.getWorldPosition(tmp));
      dir.copy(s.top).sub(a);
      const len = dir.length();
      s.mesh.position.copy(a);
      s.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
      s.mesh.scale.set(0.007, len, 0.007);
    }
  };
  return { add, update, list };
}

// ---------------------------------------------------------------- sobrancelhas
function makeBrow(side: number) {
  // arco de madeira laqueada preta, mais grosso no meio (traço de pincel esculpido)
  const pts = [-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * 0.26, 0.07 * (1 - u * u) - 0.02 * u * side, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 24, 0.045, 10, false);
  // afina as pontas
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 11) / 24;
    const k = 0.45 + 0.55 * Math.sin(Math.PI * t);
    curve.getPoint(t, c);
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k * 0.7);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#1c100a', roughness: 0.3 }));
  const pivot = new THREE.Group();
  pivot.add(m);
  // ponta de fora (onde o fio amarra)
  const tip = new THREE.Object3D();
  tip.position.set(side * 0.23, 0.05, 0.03);
  pivot.add(tip);
  return { pivot, tip };
}

// ---------------------------------------------------------------- partículas do olho
const PART_VERT = `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function partFrag(style: 'A' | 'B' | 'C') {
  return `
uniform float uTime, uAnger, uWide, uAmused, uOpen, uSide, uRate;
uniform vec2 uLook;
varying vec2 vUv;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 q = vUv;
  vec3 col = vec3(0.0); float alpha = 0.0;
  const int N = ${style === 'B' ? 40 : 30};
  for (int k = 0; k < N; k++) {
    float fk = float(k);
    float s = h1(fk + 1.0), s2 = h1(fk + 7.3);
    float l = fract(uTime * uRate * (0.6 + 0.5 * s2) + s);               // vida 0..1
    float r = mix(0.12, ${style === 'B' ? '0.95' : '0.78'} + uWide * 0.3, pow(l, 0.8));                  // sai do olho em espiral
    // A e C seguem 3 braços de espiral (rastro coeso); B (faíscas) espalha livre
    float arm = ${style === 'B' ? 's * 6.2832' : 'floor(s * 3.0) / 3.0 * 6.2832 + (s2 - 0.5) * 0.35'};
    float a = arm + uSide * (l * (3.2 - uAmused * 1.5) + uTime * 0.6);
    vec2 c = r * vec2(cos(a), sin(a)) + uLook * vec2(0.10, 0.08) * (1.0 - l);
    float fade = smoothstep(0.0, 0.12, l) * (1.0 - smoothstep(0.55, 1.0, l));
    vec2 d = q - c;
    ${style === 'A' ? `
    // A · tinta: gotas pretas que esticam ao longo da espiral e se desfazem
    vec2 tg = normalize(vec2(-sin(a), cos(a)) * uSide);
    float along = dot(d, tg), across = dot(d, vec2(-tg.y, tg.x));
    float sz = mix(0.10, 0.03, l);
    float blob = 1.0 - smoothstep(0.0, 1.0, length(vec2(along / (sz * 3.0), across / sz)));
    float rim = smoothstep(0.55, 0.8, 1.0 - length(vec2(along / (sz * 3.0), across / sz))) ;
    vec3 ink = mix(vec3(0.03, 0.01, 0.05), vec3(0.35, 0.05, 0.05), uAnger);
    float aa = blob * fade;
    col = mix(col, ink * (0.6 + 0.4 * rim), aa * (1.0 - alpha * 0.5));
    alpha = max(alpha, aa);` : style === 'B' ? `
    // B · faíscas: tracinhos claros que riscam a espiral (roxo -> brasa na raiva, branco no susto)
    vec2 tg = normalize(vec2(-sin(a), cos(a)) * uSide);
    float along = dot(d, tg), across = dot(d, vec2(-tg.y, tg.x));
    float sz = mix(0.05, 0.015, l);
    float streak = (1.0 - smoothstep(0.0, 1.0, abs(across) / (sz * 0.35))) * (1.0 - smoothstep(0.0, 1.0, abs(along + sz * 1.5) / (sz * 2.5)));
    vec3 c0 = mix(vec3(0.75, 0.45, 1.0), vec3(1.0, 0.45, 0.15), uAnger);
    c0 = mix(c0, vec3(1.0), uWide * 0.7);
    col += c0 * streak * fade * 1.6;
    alpha = max(alpha, streak * fade);` : `
    // C · rabiscos: anéis de nanquim desenhados (como hipnose de quadrinho), crescendo ao sair
    float sz = mix(0.03, 0.10, l);
    float ring = 1.0 - smoothstep(0.0, 0.016, abs(length(d) - sz));
    float fill = 1.0 - smoothstep(sz - 0.01, sz, length(d));
    vec3 paper = mix(vec3(0.62, 0.42, 0.85), vec3(0.95, 0.35, 0.2), uAnger);
    col = mix(col, paper, fill * fade * 0.55);
    col = mix(col, vec3(0.02, 0.01, 0.03), ring * fade);
    alpha = max(alpha, max(ring, fill * 0.55) * fade);`}
  }
  // some fora do quadrado e quando a pálpebra fecha
  alpha *= (1.0 - smoothstep(0.85, 1.0, max(abs(q.x), abs(q.y)))) * uOpen;
  ${style === 'B' ? 'gl_FragColor = vec4(col * uOpen, alpha);' : 'gl_FragColor = vec4(col, alpha);'}
}`;
}

function makeParticles(style: 'A' | 'B' | 'C', R: number, side: number) {
  const u = {
    uTime: { value: 0 }, uAnger: { value: 0 }, uWide: { value: 0 }, uAmused: { value: 0 }, uOpen: { value: 1 },
    uSide: { value: side }, uRate: { value: 0.35 }, uLook: { value: new THREE.Vector2() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: PART_VERT, fragmentShader: partFrag(style), transparent: true,
    depthWrite: false, depthTest: false, blending: style === 'B' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const size = R * 6.5;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = 50;
  m.userData.noAO = true;
  m.frustumCulled = false;
  return { mesh: m, u };
}

// ---------------------------------------------------------------- montagem
export function buildMarionete(backdrop: Backdrop, root: THREE.Object3D, style: 'A' | 'B' | 'C' | null) {
  const bd = backdrop as unknown as Priv;
  bd.strings.visible = false; // as cordas de linha antigas (atravessavam a cabeça) saem
  const solid = solidsOf(root);
  const S = makeStrings(root);
  const FAR = 30;

  // pontos de amarração achados na superfície (raio de cima para baixo)
  const down = new THREE.Vector3(0, -1, 0);
  const anchorAt = (x: number, z: number, top: THREE.Vector3) => {
    const p = hitLocal(root, solid, new THREE.Vector3(x, 5, z), down);
    if (!p) return;
    const o = new THREE.Object3D(); o.position.copy(p); root.add(o);
    S.add(o, top);
  };
  for (const s of [-1, 1]) {
    anchorAt(s * 0.28, 0.05, new THREE.Vector3(s * 0.5, FAR, 0.6));     // coroa da cabeça
    anchorAt(s * 1.12, 0.0, new THREE.Vector3(s * 2.2, FAR, 0.4));      // ombros (para fora: não raspa a orelha)
  }

  // sobrancelhas: encostadas na testa (raio de frente para trás), cada uma com fio na ponta de fora
  const eyeL = root.getObjectByName('Eye_L')!, eyeR = root.getObjectByName('Eye_R')!;
  (eyeL as THREE.Mesh).geometry.computeBoundingSphere();
  const R = (eyeL as THREE.Mesh).geometry.boundingSphere!.radius;
  const brows: { pivot: THREE.Group; side: number; base: THREE.Vector3 }[] = [];
  for (const [eye, side] of [[eyeR, -1], [eyeL, 1]] as const) {
    const bx = eye.position.x, by = eye.position.y + R * 1.55;
    const hit = hitLocal(root, solid, new THREE.Vector3(bx, by, 5), new THREE.Vector3(0, 0, -1));
    const b = makeBrow(side);
    b.pivot.position.set(bx, by, (hit ? hit.z : 0.8) + 0.02);
    root.add(b.pivot);
    brows.push({ pivot: b.pivot, side, base: b.pivot.position.clone() });
    // fio da sobrancelha: sobe inclinado para a frente (passa na frente da testa e do topete)
    // com chapéu de aba, o fio inclina mais para a frente até passar livre por fora da aba
    root.updateMatrixWorld(true);
    const tipL = root.worldToLocal(b.tip.getWorldPosition(new THREE.Vector3()));
    const tops = [3.2, 6, 10, 16, 24].map((dz) => new THREE.Vector3(side * 0.6, FAR, b.pivot.position.z + dz));
    S.add(b.tip, tops.find((t) => segmentClear(root, solid, tipL, t)) ?? tops[tops.length - 1]);
  }

  // partículas que saem dos olhos (planos de frente, presos na cabeça, desenhados por cima)
  const parts = (style ? [eyeR, eyeL] : []).map((eye, i) => {
    const p = makeParticles(style!, R, i === 0 ? -1 : 1);
    p.mesh.position.copy(eye.position).add(new THREE.Vector3(0, 0, R * 1.1));
    root.add(p.mesh);
    return p;
  });

  const clock = new THREE.Clock();
  let last = 0, phase = 0, rate = 0.35;
  const anim = new THREE.Object3D();
  root.add(anim);
  // um único "relógio" por quadro, pendurado num nó invisível
  const tick = () => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last); last = t;
    if (dt <= 0) return;
    const amused = bd.mood === 'amused' ? 1 : 0;
    const wide = Math.min(1, bd.wide);
    const talking = bd.talkLeft > 0 ? 1 : 0;
    // sobrancelhas: raiva junta e abaixa a ponta de dentro; susto sobe; deboche levanta só uma
    brows.forEach((b, i) => {
      const smug = amused * (i === 1 ? 1 : 0);
      b.pivot.position.y = b.base.y + wide * 0.10 - bd.anger * 0.06 + smug * 0.07 + talking * Math.sin(t * 9) * 0.008;
      b.pivot.position.x = b.base.x - b.side * bd.anger * 0.03;
      b.pivot.rotation.z = b.side * (bd.anger * 0.6 - wide * 0.15) + smug * 0.18 * b.side;
    });
    // partículas: mais rápidas e numerosas na raiva/susto, lentas no deboche
    const goal = 0.35 + bd.anger * 0.6 + wide * 0.8 - amused * 0.15;
    rate += (goal - rate) * (1 - Math.exp(-dt * 2));
    phase += rate * dt;
    parts.forEach((p, i) => {
      const lidX = bd.eyes[i]?.lid.rotation.x ?? -0.75;
      p.u.uTime.value = phase / 0.35; p.u.uRate.value = 0.35;
      p.u.uAnger.value = bd.anger; p.u.uWide.value = wide;
      p.u.uAmused.value += (amused - p.u.uAmused.value) * (1 - Math.exp(-dt * 3));
      p.u.uOpen.value = THREE.MathUtils.clamp((0.6 - lidX) / 0.6, 0, 1);
      p.u.uLook.value.copy(bd.look);
    });
    S.update();
  };
  const holder = parts[0]?.mesh ?? (root.getObjectByName('Head') as THREE.Mesh);
  holder.onBeforeRender = tick;
  void anim;
  S.update();
  // cordas frouxas (o boneco foi solto e cai): o alto de cada fio desce do escuro para logo acima do ponto
  // onde ele amarra e balança um pouco — os fios caem junto, em vez de continuarem esticados até o céu.
  const tmp = new THREE.Vector3();
  root.userData.slack = (k: number, t: number) => {
    root.updateMatrixWorld();
    S.list.forEach((s, i) => {
      const a = root.worldToLocal(s.anchor.getWorldPosition(tmp));
      const loose = a.clone().add(new THREE.Vector3(Math.sin(t * 7 + i * 1.7) * 0.35 + (s.top0.x - a.x) * 0.06, 1.4 + (i % 3) * 0.45, Math.cos(t * 5 + i) * 0.2));
      s.top.copy(s.top0).lerp(loose, k);
    });
    S.update();
  };
  return { strings: S.list.length };
}

/** Peças sólidas do boneco (as visíveis do modelo + acessórios de traje marcados com userData.solid). */
export function solidsOf(root: THREE.Object3D) {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    let vis = true; for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) vis = false;
    if (vis && (['Head', 'Hair', 'Jacket', 'Collar', 'Neck', 'Bow', 'Jaw'].includes(o.name) || o.userData.solid)) out.push(o);
  });
  return out;
}

/** O segmento a→b (espaço do root) passa sem tocar em nenhuma peça sólida? */
function segmentClear(root: THREE.Object3D, solid: THREE.Object3D[], a: THREE.Vector3, b: THREE.Vector3) {
  const wa = root.localToWorld(a.clone()), wb = root.localToWorld(b.clone());
  const dir = wb.clone().sub(wa); const len = dir.length(); dir.normalize();
  const rc = new THREE.Raycaster(wa.addScaledVector(dir, 0.04), dir, 0, len);
  return rc.intersectObjects(solid, false).length === 0;
}

/** Diagnóstico: quantas cordas cruzam o boneco (raio do ponto de amarração até a cruzeta). */
export function stringsCrossing(root: THREE.Object3D) {
  const solid = solidsOf(root);
  root.updateMatrixWorld(true);
  const out: string[] = [];
  root.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.userData?.string) return;
    const a = mesh.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    const rc = new THREE.Raycaster(a.clone().addScaledVector(dir, 0.03), dir, 0, 6);
    const hit = rc.intersectObjects(solid, false)[0];
    if (hit) out.push(`${hit.object.name}@${hit.distance.toFixed(2)}`);
  });
  return out;
}
