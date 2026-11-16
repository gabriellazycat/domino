import * as THREE from 'three';

/** Mesmo contorno de luz dos inimigos (toon.ts): borda macia que acende só na silhueta. Cor de vela. */
export function addRim(m: THREE.MeshStandardMaterial, color = '#ffb070', k = 0.45) {
  const u = { uRim: { value: new THREE.Color(color) }, uRimK: { value: k } };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * (pow(rimF, 4.5) * uRimK); }`,
    );
  };
  m.customProgramCacheKey = () => 'vilao-rim' + (m.userData.crack ? '-crack' : '') + (m.userData.recolor ? '-rc' : '') + (m.userData.wood ? '-wood' : '');
  m.needsUpdate = true;
}


/** Tinta acetinada sobre madeira: tira o brilho de bola de bilhar e deixa o veio aparecer de leve por baixo.
 *  Veio no espaço do objeto (anéis em volta do eixo vertical, como um tronco torneado, + fibras finas), escurece
 *  pouco a cor e deixa a tinta mais fosca nos sulcos. `k` = quanto o veio aparece (0..1). Metal só perde brilho. */
export function addWood(m: THREE.MeshStandardMaterial, k = 1) {
  m.userData.wood = true;
  const metal = m.metalness > 0.5 && !m.metalnessMap;
  const u = { uWoodK: { value: metal ? 0 : k }, uWoodRough: { value: metal ? 0.42 : 0.62 } };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vWoodP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodP = position;');
    sh.fragmentShader = `varying vec3 vWoodP; uniform float uWoodK, uWoodRough;
float wdH(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.3, 71.7))) * 43758.5453); }
float wdN(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wdH(i), wdH(i + vec3(1, 0, 0)), f.x), mix(wdH(i + vec3(0, 1, 0)), wdH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wdH(i + vec3(0, 0, 1)), wdH(i + vec3(1, 0, 1)), f.x), mix(wdH(i + vec3(0, 1, 1)), wdH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float woodGrain(vec3 p) {
  // anéis do tronco (deformados por ruído) + fibras compridas no sentido vertical
  float r = length(p.xz * vec2(1.0, 0.8)) + wdN(p * vec3(1.6, 0.5, 1.6)) * 0.35;
  float ring = smoothstep(0.5, 0.95, abs(fract(r * 4.5) * 2.0 - 1.0));
  float fib = wdN(vec3(p.x * 38.0, p.y * 2.2, p.z * 38.0));
  return clamp(ring * 0.75 + (fib - 0.5) * 0.6, 0.0, 1.0);
}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      float wg = woodGrain(vWoodP) * uWoodK;
      diffuseColor.rgb *= 1.0 - wg * 0.24;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = max(roughnessFactor, uWoodRough) + woodGrain(vWoodP) * uWoodK * 0.18;`);
  };
  m.needsUpdate = true;
}

const preparados = new WeakSet<THREE.Material>();
/** Deixa qualquer material do boneco/traje no acabamento da casa (contorno de luz + madeira acetinada), uma vez só. */
export function madeira(mat: THREE.Material, k = 1) {
  if (preparados.has(mat) || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
  preparados.add(mat);
  const m = mat as THREE.MeshStandardMaterial;
  addWood(m, k);
  addRim(m);
}

const lacas = new Map<string, THREE.MeshStandardMaterial>();
/** Laca de brinquedo (como os soldadinhos) em tinta acetinada sobre madeira, contorno de luz. Cacheada por cor. */
export function laca(color: string, rough = 0.5, metal = 0): THREE.MeshStandardMaterial {
  const key = `${color}:${rough}:${metal}`;
  let m = lacas.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); madeira(m); lacas.set(key, m); }
  return m;
}
