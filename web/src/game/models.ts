import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIECES, PieceId } from '../core/pieces';
import { EnemyKind, WallSpec } from '../core/mapgen';
import { ATLAS_CELLS, pipAtlas, hedgeTexture, crateTexture } from './textures';
import { ENEMY_HEIGHT } from './sim';

// Modelos procedurais: dominós (caixa arredondada + decalque de pips), soldadinhos de brinquedo,
// muros, lava, gatilho. Geometrias e materiais são cacheados e compartilhados.

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material | THREE.Material[]>();

function faceQuad(w: number, h: number, y0: number, z: number, cell: number, flip: boolean): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (cell + u) / ATLAS_CELLS, v);
  }
  if (flip) g.rotateY(Math.PI);
  g.translate(0, y0, z);
  return g;
}

/** Geometria do dominó com 2 grupos: 0 = corpo, 1 = pips (só na metade de baixo; em cima vai o rosto). Cacheada por (tipo, b). */
export function dominoGeometry(type: PieceId, _a: number, b: number): THREE.BufferGeometry {
  const key = `${type}:${b}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const d = PIECES[type];
  const r = Math.min(0.035, d.t * 0.3);
  const body = new RoundedBoxGeometry(d.w, d.h, d.t, 3, r).toNonIndexed();
  body.clearGroups();
  const fw = d.w * 0.86, fh = (d.h * 0.92) / 2;
  const z = d.t / 2 + 0.0015;
  const quads: THREE.BufferGeometry[] = [];
  for (const flip of [false, true]) quads.push(faceQuad(fw, fh, -fh / 2, flip ? -z : z, b, flip).toNonIndexed());
  const decal = mergeGeometries(quads, false)!;
  const merged = mergeGeometries([body, decal], true)!;
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
  return merged;
}

export function dominoMaterials(type: PieceId, ghost = false): THREE.Material[] {
  const key = `dom:${type}:${ghost}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.Material[];
  const d = PIECES[type];
  const metal = type === 'heavy';
  // marfim/tinta velhos: um pouco mais escuros e foscos que as cores do catálogo
  const body = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(d.color).multiplyScalar(0.78),
    roughness: metal ? 0.42 : 0.5,
    metalness: metal ? 0.65 : 0.0,
    clearcoat: metal ? 0.25 : 0.35,
    clearcoatRoughness: 0.4,
    transparent: ghost, opacity: ghost ? 0.38 : 1, depthWrite: !ghost,
  });
  if (type === 'blast') { body.emissive = new THREE.Color('#ff2a10'); body.emissiveIntensity = 0.18; }
  if (type === 'tower') { body.emissive = new THREE.Color('#3a1f80'); body.emissiveIntensity = 0.15; }
  const pip = new THREE.MeshStandardMaterial({
    map: pipAtlas(), color: new THREE.Color(d.pip), alphaTest: 0.45, roughness: 0.4,
    metalness: metal ? 0.9 : 0, transparent: ghost, opacity: ghost ? 0.5 : 1,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  if (metal) { pip.emissive = new THREE.Color('#f2a93a'); pip.emissiveIntensity = 0.35; }
  const arr = [body, pip];
  matCache.set(key, arr);
  return arr;
}

export function ghostMaterial(ok: boolean): THREE.Material {
  const key = `ghost:${ok}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.Material;
  const m = new THREE.MeshBasicMaterial({ color: ok ? '#7dffb0' : '#ff4d4d', transparent: true, opacity: 0.45, depthWrite: false });
  matCache.set(key, m);
  return m;
}

export function pipsFor(type: PieceId, id: number): [number, number] {
  if (type === 'runner') return [7, 7];
  if (type === 'blast') return [8, 8];
  if (type === 'heavy') return [6, 6];
  const h = (id * 2654435761) >>> 0;
  return [(h >>> 3) % 7, (h >>> 9) % 7];
}

export function makeDomino(type: PieceId, id: number): THREE.Mesh {
  const [a, b] = pipsFor(type, id);
  const m = new THREE.Mesh(dominoGeometry(type, a, b), dominoMaterials(type));
  m.castShadow = true;
  m.receiveShadow = true;
  if (type === 'blast') {
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), std('#2a2a2a'));
    fuse.position.set(0.08, PIECES.blast.h / 2 + 0.05, 0);
    fuse.rotation.z = -0.3;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow('#ffb347', 6));
    spark.position.set(0.105, 0.1, 0);
    spark.name = 'spark';
    fuse.add(spark);
    m.add(fuse);
  }
  if (type === 'runner') {
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.1), std('#d23a2a'));
      fin.position.set(s * (PIECES.runner.w / 2 + 0.02), -PIECES.runner.h / 2 + 0.12, -0.02);
      fin.castShadow = true;
      m.add(fin);
    }
  }
  return m;
}

// ---------- materiais utilitários ----------
export function std(color: string, rough = 0.6, metal = 0): THREE.MeshStandardMaterial {
  const key = `std:${color}:${rough}:${metal}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  matCache.set(key, m);
  return m;
}
export function glow(color: string, intensity = 3): THREE.MeshBasicMaterial {
  const key = `glow:${color}:${intensity}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  matCache.set(key, m);
  return m;
}

// ---------- inimigos: soldadinhos de brinquedo (versão assombrada) ----------
// Mesmas pessoinhas, com cores desbotadas, pele pálida, olhos ocos com um ponto de luz e roupa rasgada.
const PALETTE: Record<EnemyKind, { coat: string; pants: string; hat: string; skin: string; trim: string; glint: string }> = {
  soldier: { coat: '#6a1f1b', pants: '#1c2232', hat: '#0d0d10', skin: '#b8b3a3', trim: '#7d6b3c', glint: '#ffe6b0' },
  patroller: { coat: '#6a4a22', pants: '#211910', hat: '#2a1a0c', skin: '#aaa594', trim: '#8a7a5a', glint: '#ffe6b0' },
  brute: { coat: '#34363c', pants: '#1e1614', hat: '#25272c', skin: '#6c8556', trim: '#6a5a3a', glint: '#ff4a2a' },
  general: { coat: '#3e0f20', pants: '#121218', hat: '#8a6a2a', skin: '#c4bdac', trim: '#8a6a2a', glint: '#ff2a2a' },
};

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Pivô no centro do corpo (igual ao corpo físico); modelo desce h/2. Frente = +Z. */
export function makeEnemy(kind: EnemyKind): THREE.Group {
  const pal = PALETTE[kind];
  const H = ENEMY_HEIGHT[kind];
  const pivot = new THREE.Group();
  const g = new THREE.Group();
  g.position.y = -H / 2;
  pivot.add(g);
  const s = kind === 'brute' ? 1.32 : kind === 'general' ? 1.5 : 1;
  const wide = kind === 'brute' ? 1.25 : 1;
  const coat = std(pal.coat, 0.7), pants = std(pal.pants, 0.75), skin = std(pal.skin, 0.8);
  const hat = std(pal.hat, kind === 'general' ? 0.45 : 0.7, kind === 'general' ? 0.7 : 0);
  const trim = std(pal.trim, 0.55, 0.5);
  const hollow = std('#020202', 0.95);
  // base
  part(new THREE.CylinderGeometry(0.2 * s * wide, 0.22 * s * wide, 0.05, 20), std('#17130f', 0.8), 0, 0.025, 0, g);
  // pernas
  part(new THREE.CylinderGeometry(0.11 * s * wide, 0.12 * s * wide, 0.28 * s, 14), pants, 0, 0.05 + 0.14 * s, 0, g);
  // corpo
  const bodyY = 0.05 + 0.28 * s + 0.16 * s;
  part(new THREE.CylinderGeometry(0.13 * s * wide, 0.155 * s * wide, 0.34 * s, 16), coat, 0, bodyY, 0, g);
  part(new THREE.CylinderGeometry(0.158 * s * wide, 0.158 * s * wide, 0.04 * s, 16), trim, 0, bodyY - 0.1 * s, 0, g);
  // barra rasgada do casaco (tiras penduradas)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = (0.05 + ((i * 5) % 4) * 0.025) * s;
    const strip = part(new THREE.BoxGeometry(0.05 * s, len, 0.012 * s), coat, Math.sin(a) * 0.15 * s * wide, bodyY - 0.17 * s - len / 2, Math.cos(a) * 0.15 * s * wide, g);
    strip.rotation.y = a;
    strip.rotation.x = 0.15;
  }
  // botões
  for (let i = 0; i < 2; i++) part(new THREE.SphereGeometry(0.018 * s, 6, 4), trim, 0, bodyY + 0.02 * s + i * 0.08 * s, 0.142 * s * wide, g);
  // braços
  for (const sx of [-1, 1]) {
    const arm = part(new THREE.CapsuleGeometry(0.045 * s, 0.2 * s, 4, 8), coat, sx * 0.17 * s * wide, bodyY, 0, g);
    arm.rotation.z = sx * 0.12;
    part(new THREE.SphereGeometry(0.048 * s, 8, 6), skin, sx * 0.185 * s * wide, bodyY - 0.15 * s, 0.01, g);
  }
  // cabeça
  const headY = bodyY + 0.17 * s + 0.1 * s;
  part(new THREE.SphereGeometry(0.105 * s, 18, 14), skin, 0, headY, 0, g);
  // olhos ocos (órbitas pretas fundas) com um pontinho de luz no fundo
  for (const sx of [-1, 1]) {
    const socket = part(new THREE.SphereGeometry(0.03 * s, 10, 8), hollow, sx * 0.042 * s, headY + 0.012 * s, 0.084 * s, g);
    socket.scale.set(1, 1.25, 0.55);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008 * s, 6, 4), glow(pal.glint, kind === 'brute' || kind === 'general' ? 6 : 4));
    dot.position.set(sx * 0.042 * s, headY + 0.008 * s, 0.1 * s);
    g.add(dot);
  }
  // boca: fenda costurada
  const mouth = part(new THREE.BoxGeometry(0.06 * s, 0.008 * s, 0.01 * s), hollow, 0, headY - 0.05 * s, 0.098 * s, g);
  mouth.rotation.x = -0.4;
  for (let i = 0; i < 3; i++) part(new THREE.BoxGeometry(0.004 * s, 0.022 * s, 0.006 * s), hollow, (i - 1) * 0.02 * s, headY - 0.05 * s, 0.101 * s, g).rotation.x = -0.4;
  // chapéus
  if (kind === 'soldier') {
    part(new THREE.CylinderGeometry(0.085, 0.095, 0.17, 16), hat, 0, headY + 0.13, 0, g);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 10), trim, 0, headY + 0.13, 0.088, g).rotation.x = Math.PI / 2;
    part(new THREE.SphereGeometry(0.035, 8, 6), std('#5a5348', 0.8), 0, headY + 0.235, 0, g);
  } else if (kind === 'patroller') {
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18), hat, 0, headY + 0.07, 0, g);
    part(new THREE.CylinderGeometry(0.07, 0.085, 0.09, 14), hat, 0, headY + 0.12, 0, g);
    // lanterna
    const pole = part(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), std('#2a1d12', 0.8), 0.2, bodyY + 0.05, 0.08, g);
    pole.rotation.x = 0.2;
    part(new THREE.SphereGeometry(0.045, 10, 8), glow('#ffb347', 6), 0.2, bodyY + 0.3, 0.12, g);
  } else if (kind === 'brute') {
    part(new THREE.SphereGeometry(0.12 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, headY + 0.02, 0, g);
    for (const sx of [-1, 1]) {
      const horn = part(new THREE.ConeGeometry(0.03 * s, 0.14 * s, 8), std('#b8ab8c', 0.7), sx * 0.12 * s, headY + 0.08 * s, 0, g);
      horn.rotation.z = -sx * 0.9;
    }
    // ombreiras
    for (const sx of [-1, 1]) part(new THREE.SphereGeometry(0.08 * s, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, sx * 0.17 * s * wide, bodyY + 0.13 * s, 0, g);
  } else {
    // general: coroa + capa
    part(new THREE.CylinderGeometry(0.1 * s, 0.09 * s, 0.07 * s, 16, 1, true), hat, 0, headY + 0.12 * s, 0, g);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(new THREE.ConeGeometry(0.022 * s, 0.07 * s, 6), hat, Math.sin(a) * 0.095 * s, headY + 0.18 * s, Math.cos(a) * 0.095 * s, g);
    }
    part(new THREE.SphereGeometry(0.025 * s, 8, 6), glow('#ff2a2a', 4), 0, headY + 0.13 * s, 0.1 * s, g);
    // meia-máscara de porcelana rachada
    const mask = part(new THREE.SphereGeometry(0.11 * s, 16, 10, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.25, Math.PI * 0.32), std('#d8d0bc', 0.35), 0, headY, 0.008 * s, g);
    (mask.material as THREE.Material).side = THREE.DoubleSide;
    const cape = part(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 0.5 * s, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8), std('#1c0a24', 0.85), 0, bodyY - 0.05 * s, 0, g);
    cape.rotation.y = Math.PI;
    (cape.material as THREE.Material).side = THREE.DoubleSide;
  }
  // ajusta a altura visual à física
  const box = new THREE.Box3().setFromObject(g);
  const vh = box.max.y - box.min.y;
  const k = H / vh;
  g.scale.setScalar(k);
  g.position.y = -H / 2;
  return pivot;
}

// ---------- cenário ----------
let hedgeMat: THREE.Material, crateMat: THREE.Material;
export function makeWall(w: WallSpec): THREE.Object3D {
  hedgeMat ??= new THREE.MeshStandardMaterial({ map: hedgeTexture(), roughness: 0.95 });
  crateMat ??= new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 });
  const grp = new THREE.Group();
  grp.position.set(w.x, 0, w.z);
  if (w.style === 'crate') {
    const long = Math.max(w.w, w.d), along = w.w > w.d;
    const n = Math.max(1, Math.round(long / 0.42));
    const size = long / n;
    for (let i = 0; i < n; i++) {
      const s = Math.min(size, Math.min(w.w, w.d) + 0.12) * 0.96;
      const off = -long / 2 + size * (i + 0.5);
      const hh = w.h * (i % 2 ? 0.85 : 1);
      const m = new THREE.Mesh(new RoundedBoxGeometry(along ? size * 0.96 : s, hh, along ? s : size * 0.96, 2, 0.02), crateMat);
      m.position.set(along ? off : 0, hh / 2, along ? 0 : off);
      m.rotation.y = ((i * 37) % 7 - 3) * 0.03;
      m.castShadow = m.receiveShadow = true;
      grp.add(m);
    }
    return grp;
  }
  if (w.style === 'stone') {
    // muro de tijolinhos (instanciado), fiadas desencontradas + capa
    const along = w.w >= w.d;
    const L = along ? w.w : w.d, T = along ? w.d : w.w;
    const rows = 4, bh = (w.h - 0.06) / rows, blen = 0.26;
    const bricks: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) {
      let s = -L / 2 + (r % 2 ? -blen / 2 : 0);
      while (s < L / 2 - 0.01) {
        const a = Math.max(s, -L / 2), b = Math.min(s + blen, L / 2);
        if (b - a > 0.05) bricks.push([(a + b) / 2, b - a, r]);
        s += blen;
      }
    }
    const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), bricks.length);
    const m4 = new THREE.Object3D();
    bricks.forEach(([c, len, r], i) => {
      const jitter = ((i * 7919) % 13) / 13;
      m4.position.set(along ? c : 0, bh * (r + 0.5), along ? 0 : c);
      m4.scale.set(along ? len - 0.02 : T, bh - 0.015, along ? T : len - 0.02);
      m4.rotation.y = (jitter - 0.5) * 0.03;
      m4.updateMatrix();
      inst.setMatrixAt(i, m4.matrix);
      inst.setColorAt(i, new THREE.Color().setHSL(0.06 + jitter * 0.03, 0.08 + jitter * 0.06, 0.16 + jitter * 0.09));
    });
    inst.castShadow = inst.receiveShadow = true;
    grp.add(inst);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(w.w + 0.06, 0.07, w.d + 0.06, 2, 0.02), std('#3d3934', 0.9));
    cap.position.y = w.h - 0.025;
    cap.castShadow = cap.receiveShadow = true;
    grp.add(cap);
    return grp;
  }
  // cerca-viva: bloco + copa fofa
  const geo = new RoundedBoxGeometry(w.w, w.h, w.d, 3, 0.1);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const scale = Math.max(w.w, w.d) / 0.8; // textura não estica
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * scale);
  const m = new THREE.Mesh(geo, hedgeMat);
  m.position.y = w.h / 2;
  m.castShadow = m.receiveShadow = true;
  grp.add(m);
  const n = Math.max(2, Math.round(Math.max(w.w, w.d) / 0.3));
  const along = w.w > w.d;
  const thorn = std('#120d09', 0.9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const b = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w.w, w.d) * 0.52, 10, 8), hedgeMat);
    b.position.set(along ? t * w.w : 0, w.h - 0.02, along ? 0 : t * w.d);
    b.scale.set(1.15, 0.55, 1.15);
    b.castShadow = true;
    grp.add(b);
    // galhos secos espetados para cima
    for (let k = 0; k < 2; k++) {
      const len = 0.18 + ((i * 7 + k * 3) % 5) * 0.04;
      const twig = new THREE.Mesh(new THREE.ConeGeometry(0.018, len, 5), thorn);
      const off = (k - 0.5) * 0.12;
      twig.position.set(along ? t * w.w + off : off * 0.5, w.h + len * 0.35, along ? off * 0.5 : t * w.d + off);
      twig.rotation.set(((i + k) % 3 - 1) * 0.5, 0, ((i * 2 + k) % 3 - 1) * 0.5);
      twig.castShadow = true;
      grp.add(twig);
    }
  }
  return grp;
}

export const lavaUniforms = { uTime: { value: 0 } };
let lavaMat: THREE.ShaderMaterial | null = null;
export function makeLava(r: number): THREE.Object3D {
  lavaMat ??= new THREE.ShaderMaterial({
    uniforms: lavaUniforms,
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = (vUv-0.5)*6.0;
        float t = uTime*0.35;
        float v = n(p + vec2(t, -t*0.7)) * 0.6 + n(p*2.1 - vec2(t*1.3, t)) * 0.4;
        float crust = smoothstep(0.55, 0.75, v);
        float d = length(vUv-0.5)*2.0;
        vec3 hot = mix(vec3(3.2,1.1,0.15), vec3(4.0,2.4,0.6), n(p*3.0+t));
        vec3 col = mix(hot, vec3(0.18,0.05,0.02), crust*0.85);
        col *= 1.0 - smoothstep(0.75, 1.0, d) * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lavaMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.012;
  grp.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.06, 8, 40), std('#2a211d', 0.95));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  rim.scale.z = 0.6;
  rim.receiveShadow = true;
  grp.add(rim);
  // pedrinhas
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 + (i % 3) * 0.015), std('#3a302b', 0.9));
    s.position.set(Math.cos(a) * (r + 0.1), 0.02, Math.sin(a) * (r + 0.1));
    s.castShadow = true;
    grp.add(s);
  }
  return grp;
}

export function makeTrigger(): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.03, 40), std('#14201a', 0.6));
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), glow('#7dffc0', 3));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  ring.name = 'ring';
  g.add(ring);
  // seta no chão para a direção inicial (+Z local)
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, -0.1); shape.lineTo(0.09, -0.1); shape.lineTo(0.09, 0.15); shape.lineTo(0.2, 0.15);
  shape.lineTo(0, 0.38); shape.lineTo(-0.2, 0.15); shape.lineTo(-0.09, 0.15); shape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow('#7dffc0', 2));
  arrow.rotation.set(-Math.PI / 2, 0, Math.PI); // forma aponta +Y → no chão aponta +Z (frente)
  arrow.position.set(0, 0.04, 0.45);
  arrow.name = 'arrow';
  g.add(arrow);
  // bandeirinha verde de largada atrás do pad
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), std('#cbbf9f', 0.75));
  pole.position.y = 0.45;
  flag.add(pole);
  // trapo rasgado (recorte em zigue-zague na ponta)
  const rag = new THREE.Shape();
  rag.moveTo(0, 0.11); rag.lineTo(0.34, 0.1); rag.lineTo(0.28, 0.04); rag.lineTo(0.34, -0.01); rag.lineTo(0.26, -0.05); rag.lineTo(0.3, -0.11); rag.lineTo(0, -0.11); rag.closePath();
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(rag), new THREE.MeshStandardMaterial({ color: '#5a1414', emissive: '#2a0404', emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.set(0, 0.78, 0);
  cloth.name = 'cloth';
  flag.add(cloth);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#cbbf9f', 0.7));
  knob.position.y = 0.91;
  flag.add(knob);
  flag.position.set(-0.36, 0, -0.32);
  flag.name = 'finger';
  flag.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  g.add(flag);
  return g;
}

export function makeHeadRing(): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(2.2), toneMapped: false, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 32), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}
