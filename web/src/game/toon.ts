import * as THREE from 'three';

// "Brinquedo pintado": materiais dos inimigos com luz de contorno (fresnel) e clarão de golpe.
// Cada inimigo tem o próprio conjunto de uniforms (o clarão é individual), mas o programa de shader
// é um só para todos (mesma chave de cache).

export interface LookUniforms {
  uRim: { value: THREE.Color };
  uRimK: { value: number };
  uFlash: { value: number };
}

const RIM_GLSL_HEAD = `
uniform vec3 uRim; uniform float uRimK; uniform float uFlash;
`;
const RIM_GLSL_BODY = `
#include <emissivemap_fragment>
{
  float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  // contorno macio: sobe só bem na borda (silhueta legível no escuro, sem lavar a cor)
  totalEmissiveRadiance += uRim * (pow(rimF, 4.5) * uRimK);
  totalEmissiveRadiance += vec3(1.0, 0.94, 0.82) * uFlash * 2.4;
}
`;

/** Conjunto de materiais de um inimigo (todos compartilham o contorno e o clarão). */
export class EnemyLook {
  u: LookUniforms;
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  constructor(rim: string, rimK = 0.9) {
    this.u = { uRim: { value: new THREE.Color(rim) }, uRimK: { value: rimK }, uFlash: { value: 0 } };
  }

  mat(color: string, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
    const key = `${color}:${rough}:${metal}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const u = this.u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = RIM_GLSL_HEAD + sh.fragmentShader.replace('#include <emissivemap_fragment>', RIM_GLSL_BODY);
    };
    m.customProgramCacheKey = () => 'enemy-rim';
    this.cache.set(key, m);
    return m;
  }

  /** Materiais criados (para trocar o lado da capa etc.). */
  all(): THREE.MeshStandardMaterial[] { return [...this.cache.values()]; }
}
