import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Backdrop } from './backdrop';

// Laboratório de vilões: ?vilao=<id> troca a cabeça do dono da mesa por uma variação, sem mudar o padrão.
//   A, B         → esculpidos no Blender (tools/vilao2), GLB em e2e/vilao-lab/ (só no servidor de dev)
//   IA-A, IA-B   → malhas de IA (TRELLIS) limpas no Blender, mesmo lugar
//   C1, C2       → feitos no código (vilaoCodigo.ts)
// Sem o parâmetro, nada aqui roda.

export function vilaoParam(): string | null {
  try { return new URLSearchParams(location.search).get('vilao'); } catch { return null; }
}

// Mesmo contorno de luz dos inimigos (toon.ts): borda macia que acende só na silhueta. Cor de vela.
function addRim(m: THREE.MeshStandardMaterial, color = '#ffb070', k = 0.45) {
  const u = { uRim: { value: new THREE.Color(color) }, uRimK: { value: k } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * (pow(rimF, 4.5) * uRimK); }`,
    );
  };
  m.customProgramCacheKey = () => 'vilao-rim';
  m.needsUpdate = true;
}

// Olho 2D de vórtice (T4): o olho não gira mais; é um buraco preto chapado com um redemoinho que reage.
//   olhar → o centro do vórtice anda; deboche → gira devagar e acende um pontinho; raiva → gira rápido e
//   as espirais esquentam (vermelho); susto → o vórtice se fecha e aparece uma pupila branca pequena.
const VORTEX_VERT = `
varying vec3 vP;
void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VORTEX_FRAG = `
uniform float uR, uTime, uSpin, uAnger, uAmused, uWide, uSide;
uniform vec2 uLook;
varying vec3 vP;
void main() {
  vec3 n = vP / uR;
  vec2 q = n.xy - uLook * vec2(0.32, 0.26);
  q.x *= uSide;                                  // os dois olhos giram espelhados
  float r = length(q);
  float a = atan(q.y, q.x);
  float zoom = 1.0 + uWide * 1.6;                // susto: o redemoinho encolhe para o centro
  float arms = sin(a * 3.0 + log(r * zoom + 1e-3) * 5.5 - uTime * uSpin);
  float band = smoothstep(0.35, 1.0, arms) * smoothstep(0.04, 0.22, r * zoom) * (1.0 - smoothstep(0.55, 0.95, r));
  vec3 cold = vec3(0.30, 0.10, 0.48);            // roxo do fundo
  vec3 hot = vec3(0.85, 0.12, 0.10);             // brasa
  vec3 col = mix(cold, hot, uAnger) * band * (0.55 + 0.6 * uAnger);
  // centro: no deboche/raiva um ponto aceso; no susto uma pupila branca
  float dotR = mix(0.0, 0.05, max(uAmused, uAnger));
  col += mix(vec3(1.0, 0.85, 0.6), hot * 1.6, uAnger) * (1.0 - smoothstep(dotR * 0.6, dotR, r)) * step(0.001, dotR);
  col = mix(col, vec3(0.96, 0.93, 0.86), (1.0 - smoothstep(0.07, 0.09, r)) * uWide);
  gl_FragColor = vec4(col, 1.0);
}`;

function vortexEyes(backdrop: Backdrop, root: THREE.Object3D) {
  const bd = backdrop as unknown as {
    eyes: { ball: THREE.Object3D }[]; look: THREE.Vector2; mood: string; anger: number; wide: number; squint: number;
  };
  const clock = new THREE.Clock();
  (['R', 'L'] as const).forEach((s, i) => {
    let spin = 1.2, phase = 0;
    const eye = root.getObjectByName(`Eye_${s}`) as THREE.Mesh | undefined;
    if (!eye) return;
    eye.geometry.computeBoundingSphere();
    const u = {
      uR: { value: eye.geometry.boundingSphere!.radius }, uTime: { value: 0 }, uSpin: { value: 1.2 },
      uAnger: { value: 0 }, uAmused: { value: 0 }, uWide: { value: 0 }, uSide: { value: s === 'L' ? 1 : -1 },
      uLook: { value: new THREE.Vector2() },
    };
    eye.material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VORTEX_VERT, fragmentShader: VORTEX_FRAG });
    // o jogo continua girando um "olho" invisível; o desenho lê o olhar e o humor a cada quadro
    bd.eyes[i].ball = new THREE.Object3D();
    eye.rotation.set(0, 0, 0);
    let last = 0;
    eye.onBeforeRender = () => {
      const t = clock.getElapsedTime();
      const dt = Math.min(0.1, t - last); last = t;
      const amused = bd.mood === 'amused' ? 1 : 0;
      const goal = 1.2 + bd.anger * 5 - amused * 0.7 + bd.wide * 3;
      spin += (goal - spin) * (1 - Math.exp(-dt * 3));
      phase += spin * dt; // fase acumulada: mudar a velocidade não dá tranco no desenho
      u.uTime.value = phase; u.uSpin.value = 1;
      u.uAnger.value = bd.anger; u.uWide.value = Math.min(1, bd.wide);
      u.uAmused.value += (amused - u.uAmused.value) * (1 - Math.exp(-dt * 3));
      u.uLook.value.copy(bd.look);
    };
  });
}

export async function applyVilaoLab(backdrop: Backdrop) {
  const id = vilaoParam();
  if (!id) return;
  const up = id.toUpperCase();
  if (up === 'ATUAL') return; // cabeça antiga (procedural), para comparar
  if (up === 'C1' || up === 'C2') {
    const { buildCodeVilao } = await import('./vilaoCodigo');
    const { root, jawCorners } = buildCodeVilao(up);
    backdrop.adoptModel(root, jawCorners);
    return;
  }
  const mari = /^T5[ABC]$/.test(up) ? (up[2] as 'A' | 'B' | 'C') : null; // T5A/B/C = marionete com vórtice de partículas
  const vortex = up === 'T4' || !!mari; // T4 = corpo do T1 com olhos 2D de vórtice
  const hairOpt = /^T7[ABC]$/.test(up); // T7A/B/C = T6A com outro cabelo (GLB próprio)
  const olho2d = /^T6[AB]$/.test(up) ? (up[2] as 'A' | 'B') : hairOpt ? 'A' : null; // T6A/B = olho 2D sem pálpebra, vórtice entrando
  const file = hairOpt ? up : mari || olho2d ? 'T5' : up === 'T4' ? 'T1' : up;
  const gltf = await new GLTFLoader().loadAsync(`./e2e/vilao-lab/${file}.glb`);
  const root = gltf.scene;
  const toy = up.startsWith('T');
  root.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
      const s = mat as THREE.MeshStandardMaterial;
      if (s.map) s.map.anisotropy = 8;
      // o relevo assado (goiva/craquelê) some sob a luz de vela do jogo na força 1
      if (s.normalMap && (up === 'A' || up === 'B' || up === 'T3')) s.normalScale.set(2, 2);
      if (toy) addRim(s);
    }
  });
  backdrop.adoptModel(root);
  if (vortex) vortexEyes(backdrop, root);
  if (olho2d) {
    const m = await import('./vilaoMarionete');
    m.buildMarionete(backdrop, root, null);
    (await import('./vilaoOlho2d')).buildOlho2d(backdrop, root, olho2d);
  }
  if (mari) {
    const m = await import('./vilaoMarionete');
    m.buildMarionete(backdrop, root, mari);
    (window as unknown as { __vilaoRoot: THREE.Object3D; __vilaoMari: typeof m }).__vilaoRoot = root;
    (window as unknown as { __vilaoMari: typeof m }).__vilaoMari = m;
  }
}
