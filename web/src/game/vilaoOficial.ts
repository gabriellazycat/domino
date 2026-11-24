import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import vilaoUrl from '../assets/vilao.glb?url';
import type { Backdrop } from './backdrop';
import { buildMarionete } from './vilaoMarionete';
import { buildOlho2d } from './vilaoOlho2d';
import { madeira } from './vilaoLaca';
import { buildTraje } from './vilaoTrajes';

// Vilão oficial do dono da mesa (escolhido no laboratório: T7B). Boneco de ventríloquo em linguagem de brinquedo
// (tools/vilao2, exportado leve por tools/vilao2/export_jogo.py), com:
//   - sobrancelhas 3D que mexem presas em fio e cordas que não atravessam o boneco (vilaoMarionete.ts);
//   - olho 2D de vórtice preto, rente ao rosto, que nunca fecha (vilaoOlho2d.ts);
//   - contorno de luz igual ao dos inimigos e rachaduras por fase (setCrack) em shader.
// Enquanto o GLB carrega, a cabeça antiga (backdrop.ts) continua na mesa.

type CrackState = { crack: number; crackFlash: number };

/** Rachaduras na laca: bordas de células (voronoi 3D no espaço do objeto) que aparecem conforme o nível sobe.
 *  No momento em que racha mais, as rachaduras brilham em laranja (como o clarão da cabeça antiga). */
function addCrack(m: THREE.MeshStandardMaterial, u: { uCrack: { value: number }; uCrackFlash: { value: number } }) {
  m.userData.crack = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vCrackP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrackP = position;');
    sh.fragmentShader = `varying vec3 vCrackP; uniform float uCrack, uCrackFlash;
vec3 ckH3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float ckH(vec3 p) { return fract(sin(dot(p, vec3(41.3, 289.1, 97.7))) * 43758.5453); }
float crackLine(vec3 x) {
  vec3 n = floor(x), f = fract(x); float f1 = 8.0, f2 = 8.0; vec3 id = n;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec3 g = vec3(float(i), float(j), float(k)); vec3 r = g + ckH3(n + g) - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = n + g; } else if (d < f2) f2 = d;
  }
  float e = sqrt(f2) - sqrt(f1);
  return (1.0 - smoothstep(0.015, 0.045, e)) * step(ckH(id), uCrack * 0.9);
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float ck = uCrack > 0.001 ? crackLine(vCrackP * 3.2) : 0.0;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.05, 0.03), ck * 0.92);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.54, 0.25) * ck * uCrackFlash * 2.5;`);
  };
  m.needsUpdate = true;
}

/** Recolorir paletó e gravata assados na textura do corpo (um material só, uniforms globais: um boneco por vez). */
const recolor = {
  uSuit: { value: new THREE.Color('#2c1f3a') }, uSuitOn: { value: 0 },
  uBow: { value: new THREE.Color('#a81c26') }, uBowOn: { value: 0 },
};
function addRecolor(m: THREE.MeshStandardMaterial) {
  m.userData.recolor = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, recolor);
    sh.fragmentShader = 'uniform vec3 uSuit, uBow; uniform float uSuitOn, uBowOn;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec3 cc = diffuseColor.rgb; float lum = dot(cc, vec3(0.3, 0.59, 0.11));
      // paletó/lapela: roxo escuro; gravata: vermelho saturado (o resto — camisa, botões, pescoço — fica)
      float suitM = (1.0 - smoothstep(0.035, 0.07, lum)) * step(cc.r * 0.9, cc.b) * uSuitOn;
      float bowM = step(cc.g * 3.0, cc.r) * step(cc.b * 2.5, cc.r) * step(0.05, cc.r) * uBowOn;
      diffuseColor.rgb = mix(cc, uSuit * clamp(lum / 0.019, 0.3, 2.6), suitM);
      diffuseColor.rgb = mix(diffuseColor.rgb, uBow * clamp(lum / 0.126, 0.3, 1.8), bowM);
    }`);
  };
  m.needsUpdate = true;
}

const prepared = new WeakSet<THREE.Material>();
const cu = { uCrack: { value: 0 }, uCrackFlash: { value: 0 } };

/** Prepara os materiais do GLB uma vez (são compartilhados por todas as montagens). */
function prepare(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
      if (prepared.has(mat)) continue;
      prepared.add(mat);
      const s = mat as THREE.MeshStandardMaterial;
      if (s.map) s.map.anisotropy = 8;
      if (s.name.startsWith('face')) addCrack(s, cu);       // o rosto (cabeça, queixo, cabelo) racha; roupa não
      if (s.name.startsWith('body')) addRecolor(s);
      madeira(s, s.name.startsWith('face') ? 0.75 : 1); // tinta acetinada sobre madeira (antes: laca de bola de bilhar)
    }
  });
}

/** Monta o boneco (com o traje `id`, ou o de sempre) no lugar da cabeça do dono da mesa. */
function mount(backdrop: Backdrop, base: THREE.Object3D, id: string | null) {
  const bd = backdrop as unknown as CrackState;
  const root = base.clone(true);
  const traje = id ? buildTraje(id) : null;
  if (traje) {
    traje.group.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const x of ([] as THREE.Material[]).concat(m)) madeira(x); });
    root.add(traje.group);
    if (traje.hideHair) { const h = root.getObjectByName('Hair'); if (h) h.visible = false; }
  }
  recolor.uSuitOn.value = traje?.suit ? 1 : 0; if (traje?.suit) recolor.uSuit.value.set(traje.suit);
  recolor.uBowOn.value = traje?.bow ? 1 : 0; if (traje?.bow) recolor.uBow.value.set(traje.bow);
  backdrop.adoptModel(root);
  buildMarionete(backdrop, root);
  buildOlho2d(backdrop, root);
  // rachaduras seguem o nível da cabeça antiga (setCrack continua sendo chamado pelo jogo)
  const head = root.getObjectByName('Head') as THREE.Mesh;
  const prev = head.onBeforeRender;
  head.onBeforeRender = (...a) => {
    cu.uCrack.value = Math.max(0, bd.crack);
    cu.uCrackFlash.value = bd.crackFlash;
    prev.apply(head, a);
  };
  (window as unknown as { __vilaoRoot?: THREE.Object3D }).__vilaoRoot = root;
  return root;
}

/** Troca de traje como a troca de máscara: as cordas do boneco que está na mesa afrouxam e ele despenca para baixo
 *  da mesa (os fios caem junto); em seguida o outro desce do escuro pendurado nas cordas e quica na ponta delas. */
let busy = false, mountedId: string | null = null, current: THREE.Object3D | null = null;
function swap(backdrop: Backdrop, base: THREE.Object3D) {
  if (busy) return; // a troca em andamento pega o traje mais recente na hora de montar
  busy = true;
  const G = 30, FLOOR = -11, UP = 7, T_SLACK = 0.14, T_DOWN = 0.95;
  // tempo da animação contado quadro a quadro, com teto por quadro: um quadro travado (o evento compilando
  // shaders ao abrir) não pode engolir a queda inteira de uma vez
  let t = 0, last = performance.now(), phase: 'fall' | 'down' = current ? 'fall' : 'down';
  const tilt = (Math.random() < 0.5 ? -1 : 1) * 0.5;
  const enterDown = () => {
    mountedId = backdrop.costume;
    current = mount(backdrop, base, mountedId);
    backdrop.lift = UP; phase = 'down'; t = 0;
  };
  if (phase === 'down') enterDown();
  const step = () => {
    const now = performance.now();
    t += Math.min(1 / 30, (now - last) / 1000); last = now;
    if (phase === 'fall') {
      const slack = current?.userData.slack as ((k: number, t: number) => void) | undefined;
      // um tranco para cima quando soltam as cordas, depois queda livre girando de leve
      slack?.(Math.min(1, t / T_SLACK), t);
      const tf = Math.max(0, t - T_SLACK);
      backdrop.lift = t < T_SLACK ? 0.12 * Math.sin((t / T_SLACK) * Math.PI) : -0.5 * G * tf * tf;
      if (current) current.rotation.z = tilt * Math.min(1, tf * 1.6);
      if (backdrop.lift <= FLOOR) enterDown();
    } else {
      const k = Math.min(1, t / T_DOWN);
      // desce do alto e quica de leve na ponta das cordas
      const e = 1 - k;
      backdrop.lift = UP * e * e * e + Math.sin(k * Math.PI * 3) * 0.22 * e;
      if (k >= 1) { backdrop.lift = 0; busy = false; if (backdrop.costume !== mountedId) swap(backdrop, base); return; }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function loadOfficialVillain(backdrop: Backdrop) {
  const gltf = await new GLTFLoader().loadAsync(vilaoUrl);
  const base = gltf.scene; // nunca vai para a cena: cada montagem é um clone
  prepare(base);
  // só no servidor local: ?traje=<id> trava um traje (prints do e2e/lab.mjs giro); senão o jogo escolhe pelo lugar
  const fixed = import.meta.env.DEV ? new URLSearchParams(location.search).get('traje') : null;
  if (fixed) { current = mount(backdrop, base, fixed); return; }
  mountedId = backdrop.costume;
  current = mount(backdrop, base, mountedId);
  backdrop.costumeHook = () => swap(backdrop, base);
}
