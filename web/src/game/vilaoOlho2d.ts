import * as THREE from 'three';
import type { Backdrop } from './backdrop';

// Olho 2D de vórtice do dono da mesa (vilaoOficial.ts). Sem bola 3D e sem pálpebra: o olho NUNCA fecha.
// O olho e as partículas são a mesma coisa: partículas de tinta correm em espiral PARA o centro e, ao
// cruzar a borda, viram o próprio olho (a borda é feita delas). A expressão vem da forma do desenho:
//   raiva → corte inclinado, canto de dentro baixo (o deboche não cerra o olho);
//   susto → olho cresce e o redemoinho acelera; olhar → o centro do redemoinho anda dentro do olho.
//   Pintado NA superfície (película que acompanha a órbita), miolo preto.

type Priv = { eyes: { ball: THREE.Object3D; lid: THREE.Object3D }[]; look: THREE.Vector2; mood: string; anger: number; wide: number };

function frag() {
  return `
uniform float uTime, uAnger, uWide, uAmused, uSide;
uniform vec2 uLook;
varying vec2 vUv;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
// forma do olho (distância com sinal): círculo cortado em cima pelo humor
float eyeD(vec2 q, float e) {
  float d = length(q) - e;
  float topY = mix(e * 1.3, e * 0.22, 0.0);
  topY -= uAnger * (0.12 * e + max(0.0, -q.x * uSide) * 0.85);   // canto de dentro desce
  return max(d, q.y - topY);
}
vec4 eyePaint(vec2 q) {
  float e = 0.34 * (1.0 + 0.22 * uWide); // tamanho de olho normal
  vec2 c = uLook * vec2(0.13, 0.10);                 // centro do redemoinho segue o olhar
  vec2 qc = q - c;
  float r = length(qc), a = atan(qc.y, qc.x);
  // borda viva: ondula com o giro, como se estivesse sendo sugada
  float spin = uTime;
  float d = eyeD(q, e) + 0.018 * sin(a * 7.0 + spin * 3.0) + 0.012 * sin(a * 13.0 - spin * 5.0);
  float inside = 1.0 - smoothstep(-0.006, 0.006, d);
  vec3 hot = vec3(0.9, 0.16, 0.1);
  vec3 cold = vec3(0.42, 0.18, 0.72);
  vec3 glow = mix(cold, hot, uAnger);
  vec3 col = vec3(0.0); float alpha = 0.0;

  
  // miolo: vazio preto puro (pedido do dono: nada colorido dentro)
  col = vec3(0.0); alpha = inside;

  // partículas: nascem longe, giram e caem no centro; fora do olho são tinta, dentro viram brilho
  const int N = 34;
  for (int k = 0; k < N; k++) {
    float fk = float(k);
    float s = h1(fk + 1.0), s2 = h1(fk + 9.7);
    float l = fract(uTime * 0.22 * (0.7 + 0.6 * s2) + s);           // 0 = longe, 1 = no centro
    float rr = 0.62 * pow(1.0 - l, 0.85);
    float ang = floor(s * 3.0) / 3.0 * 6.2832 + (s2 - 0.5) * 0.6 - uSide * (l * 4.0 + uTime * 0.4);
    vec2 p = c * l + rr * vec2(cos(ang), sin(ang));
    vec2 tg = normalize(vec2(-sin(ang), cos(ang)));
    vec2 dd = q - p;
    float along = dot(dd, tg), across = dot(dd, vec2(-tg.y, tg.x));
    float sz = mix(0.026, 0.010, l) * (1.0 + 0.4 * uWide);
    float stretch = 1.5 + 3.5 * l;                                    // esticam ao serem sugadas
    float blob = 1.0 - smoothstep(0.55, 1.0, length(vec2(along / (sz * stretch), across / sz)));
    float fade = smoothstep(0.0, 0.18, l);
    float inP = 1.0 - smoothstep(-0.01, 0.01, eyeD(p, e));
    
    // fora: tinta preta sobre a pele; dentro: brilho (a partícula continua, só muda de cor no vazio)
    col = mix(col, vec3(0.0), blob * fade); // tinta preta: dentro some no vazio
    alpha = max(alpha, blob * fade);
  }
  
  // coisas sendo engolidas (buraco negro): poucas lascas brancas pequenas, sem contorno, que vêm de fora,
  // aceleram, esticam e somem no centro. Dentro do preto aparecem em branco puro.
  for (int k = 0; k < 7; k++) {
    float fk = float(k) + 40.0;
    float s = h1(fk + 1.0), s2 = h1(fk + 5.1);
    float l = fract(uTime * 0.16 * (0.75 + 0.5 * s2) + s);
    float rr = 0.78 * pow(1.0 - l, 1.6);                              // demora lá fora, cai rápido no fim
    float ang = s * 6.2832 - uSide * (pow(l, 1.5) * 5.0 + uTime * 0.3);
    vec2 p = c * l + rr * vec2(cos(ang), sin(ang));
    vec2 tg = normalize(vec2(-sin(ang), cos(ang)));
    vec2 dd = q - p;
    float along = dot(dd, tg), across = dot(dd, vec2(-tg.y, tg.x));
    float sz = mix(0.022, 0.004, pow(l, 1.3));
    float stretch = 1.2 + 4.0 * l * l;
    float k2 = length(vec2(along / (sz * stretch), across / sz));
    float body = 1.0 - smoothstep(0.75, 0.9, k2);
    float fade = smoothstep(0.0, 0.1, l) * (1.0 - smoothstep(0.9, 1.0, l));
    col = mix(col, vec3(0.97, 0.95, 0.9), body * fade);
    alpha = max(alpha, body * fade);
  }
  alpha *= 1.0 - smoothstep(0.9, 1.0, max(abs(q.x), abs(q.y)));
  return vec4(col, alpha);
}
`;
}

/** Grade NxN de frente (+Z) sobre a pele, no espaço do `root`. Pontos dentro de `rimR` usam a altura da borda
 *  da órbita no mesmo ângulo, misturada para o centro: a película cobre o buraco em vez de afundar nele. */
/** A película só depende da geometria da cabeça (igual em todas as montagens: os clones dividem a geometria) e de
 *  onde fica o olho: calcula uma vez e reaproveita. Calcular de novo custava ~9 s de raios a cada troca de traje. */
const patchCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
function skinPatch(root: THREE.Object3D, head: THREE.Mesh, c: THREE.Vector3, size: number, rimR: number) {
  let byEye = patchCache.get(head.geometry);
  if (!byEye) { byEye = new Map(); patchCache.set(head.geometry, byEye); }
  const key = [c.x, c.y, c.z, size, rimR].map((v) => v.toFixed(4)).join(',');
  let g = byEye.get(key);
  if (!g) { g = buildSkinPatch(root, head, c, size, rimR); byEye.set(key, g); }
  return g;
}
function buildSkinPatch(root: THREE.Object3D, head: THREE.Mesh, c: THREE.Vector3, size: number, rimR: number) {
  const N = 28;
  root.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const zAt = (x: number, y: number) => {
    const o = root.localToWorld(new THREE.Vector3(x, y, c.z + 3));
    const t = root.localToWorld(new THREE.Vector3(x, y, c.z - 3));
    rc.set(o, t.sub(o).normalize());
    const h = rc.intersectObject(head, false)[0];
    return h ? root.worldToLocal(h.point.clone()).z : null;
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const rimCache = new Map<number, number>();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const dx = (i / N - 0.5) * size, dy = (j / N - 0.5) * size;
    const rho = Math.hypot(dx, dy);
    let z: number | null;
    if (rho < rimR) {
      // altura na borda, no mesmo ângulo (cacheada por ângulo), com leve abaulado para o centro
      const ang = Math.round(Math.atan2(dy, dx) * 24) / 24;
      let zr = rimCache.get(ang);
      if (zr === undefined) {
        zr = zAt(c.x + Math.cos(ang) * rimR, c.y + Math.sin(ang) * rimR) ?? c.z;
        rimCache.set(ang, zr);
      }
      z = zr + 0.02 * (1 - (rho / rimR) ** 2);
    } else z = zAt(c.x + dx, c.y + dy);
    pos.push(c.x + dx, c.y + dy, (z ?? c.z) + 0.006);
    uv.push(i / N, j / N);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
    idx.push(a, b, e, a, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A: película com LUZ (MeshStandard) — a órbita é preenchida com a cor da pele e o olho é pintado por cima,
 *  assim um olho de tamanho normal não deixa o buraco da órbita aparecer em volta. */
function litPaint(u: Record<string, { value: unknown }>) {
  // aspereza igual à da tinta acetinada do rosto (vilaoLaca.addWood): a pele da película não pode brilhar mais
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // tira a 1a linha de uniforms do desenho (o material declara as suas, com uRim/uSkin)
  const lib = frag().replace('varying vec2 vUv;', 'varying vec2 vEyeUv;').replace('uniform float uTime, uAnger, uWide, uAmused, uSide;', '');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec2 vEyeUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvEyeUv = uv * 2.0 - 1.0;');
    sh.fragmentShader = 'uniform float uTime, uAnger, uWide, uAmused, uSide, uRim;\nuniform vec3 uSkin;\n' + lib + '\n' +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec4 ep = eyePaint(vEyeUv);
      float skin = 1.0 - smoothstep(uRim - 0.12, uRim, length(vEyeUv));   // tampa a órbita com pele (emenda larga)
      diffuseColor.rgb = mix(uSkin, ep.rgb, ep.a);
      diffuseColor.a = max(ep.a, skin);`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 1.0, ep.a);   // o preto é fosco: sem reflexo dentro do olho`);
  };
  m.customProgramCacheKey = () => 'olho2d-lit';
  return m;
}

export function buildOlho2d(backdrop: Backdrop, root: THREE.Object3D) {
  const bd = backdrop as unknown as Priv;
  const head = root.getObjectByName('Head') as THREE.Mesh;
  root.updateMatrixWorld(true);
  const unis: Record<string, { value: unknown }>[] = [];
  (['R', 'L'] as const).forEach((s, i) => {
    const eye = root.getObjectByName(`Eye_${s}`) as THREE.Mesh;
    const lid = root.getObjectByName(`Lid_${s}`);
    eye.geometry.computeBoundingSphere();
    const R = eye.geometry.boundingSphere!.radius;
    eye.visible = false; if (lid) lid.visible = false;
    bd.eyes[i].ball = new THREE.Object3D();
    const u = {
      uTime: { value: 0 }, uAnger: { value: 0 }, uWide: { value: 0 }, uAmused: { value: 0 },
      uSide: { value: s === 'L' ? 1 : -1 }, uLook: { value: new THREE.Vector2() },
      uSkin: { value: new THREE.Color('#e3b88d') }, uRim: { value: 0.56 },
    };
    unis.push(u);
    const mat = litPaint(u);
    const size = R * 5.2;
    // película colada na pele: grade projetada de frente na cabeça; dentro da órbita ela NÃO afunda,
    // estica reta de borda a borda (o olho fica rente ao rosto, como pintado numa tampa lisa)
    const g = skinPatch(root, head, eye.position, size, R * 1.35);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.noAO = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  });

  const clock = new THREE.Clock();
  let last = 0, phase = 0, spin = 1, amused = 0;
  const tick = () => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last); last = t;
    if (dt <= 0) return;
    const am = bd.mood === 'amused' ? 1 : 0;
    const wide = Math.min(1, bd.wide);
    amused += (am - amused) * (1 - Math.exp(-dt * 4));
    spin += ((1 + bd.anger * 2.2 + wide * 2.5 - am * 0.4) - spin) * (1 - Math.exp(-dt * 3));
    phase += spin * dt;
    for (const u of unis) {
      u.uTime.value = phase;
      u.uAnger.value = bd.anger; u.uWide.value = wide; u.uAmused.value = amused;
      (u.uLook.value as THREE.Vector2).copy(bd.look);
    }
  };
  const holder = root.getObjectByName('Head') as THREE.Mesh;
  const prev = holder.onBeforeRender;
  holder.onBeforeRender = (...args) => { tick(); prev.apply(holder, args); };
}
