import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIECES, PieceId } from '../core/pieces';
import { EnemyKind, WallSpec, GateSpec } from '../core/mapgen';
import { ATLAS_CELLS, pipAtlas, hedgeTexture, crateTexture, softDot } from './textures';
import { ENEMY_HEIGHT } from './sim';
import { SealId, SEAL_ORDER } from '../core/cards';
import { sealAtlas } from './sigils';
import { EnemyFaceRig } from './enemyFaces';
import { EnemyLook } from './toon';

// Modelos procedurais: dominós (caixa arredondada + decalque de pips), soldadinhos de brinquedo,
// muros, gatilho. Geometrias e materiais são cacheados e compartilhados.

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
  const metal = type === 'heavy' || type === 'metal';
  // marfim/tinta velhos: um pouco mais escuros e foscos que as cores do catálogo
  // verniz fraco: com o clearcoat alto, a luz da lâmpada estourava o topo branco de todo dominó
  const body = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(d.color).multiplyScalar(metal ? 0.78 : 0.68),
    roughness: metal ? 0.42 : 0.6,
    metalness: metal ? 0.65 : 0.0,
    clearcoat: metal ? 0.25 : 0.1,
    clearcoatRoughness: 0.5,
    transparent: ghost, opacity: ghost ? 0.38 : 1, depthWrite: !ghost,
  });
  if (type === 'blast') { body.emissive = new THREE.Color('#ff2a10'); body.emissiveIntensity = 0.18; }
  if (type === 'tower') { body.emissive = new THREE.Color('#3a1f80'); body.emissiveIntensity = 0.15; }
  // malditas: brilho roxo fraquinho, como se respirassem
  if (d.cursed) { body.emissive = new THREE.Color('#6a1a9a'); body.emissiveIntensity = 0.22; }
  const pip = new THREE.MeshStandardMaterial({
    map: pipAtlas(), color: new THREE.Color(d.pip), alphaTest: 0.45, roughness: 0.4,
    metalness: metal ? 0.9 : 0, transparent: ghost, opacity: ghost ? 0.5 : 1,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  if (metal) { pip.emissive = new THREE.Color('#f2a93a'); pip.emissiveIntensity = 0.35; }
  if (d.cursed) { pip.emissive = new THREE.Color(d.pip); pip.emissiveIntensity = 0.5; pip.metalness = 0; }
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
  if (type === 'jumper') return [2, 2];
  const h = (id * 2654435761) >>> 0;
  return [(h >>> 3) % 7, (h >>> 9) % 7];
}

// ---------- selos carimbados ----------
/** Carimbos na metade de baixo da peça (frente e verso); dois selos ficam na diagonal, menores. */
function stampGeometry(type: PieceId, seals: SealId[]): THREE.BufferGeometry {
  const key = `stamp:${type}:${seals.join(',')}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const d = PIECES[type];
  const fh = (d.h * 0.92) / 2;
  const z = d.t / 2 + 0.0025;
  const two = seals.length > 1;
  const narrow = d.w < 0.3;
  // logo abaixo da linha do meio (na mão, a ponta de baixo da peça fica escondida na borda da tela);
  // dois selos ficam lado a lado (nas peças estreitas, um em cima do outro)
  const size = two ? (narrow ? Math.min(d.w * 0.92, fh * 0.42) : Math.min(d.w * 0.47, fh * 0.5)) : Math.min(d.w * (narrow ? 0.95 : 0.74), fh * 0.72);
  const spots: [number, number][] = two
    ? (narrow ? [[0, -fh * 0.25], [0, -fh * 0.67]] : [[-d.w * 0.235, -fh * 0.34], [d.w * 0.235, -fh * 0.34]])
    : [[0, -fh * 0.4]];
  const parts: THREE.BufferGeometry[] = [];
  seals.slice(0, 2).forEach((sid, i) => {
    const cell = SEAL_ORDER.indexOf(sid);
    for (const flip of [false, true]) {
      const g = new THREE.PlaneGeometry(size, size);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (cell + uv.getX(k)) / SEAL_ORDER.length);
      if (flip) g.rotateY(Math.PI);
      const [x, y] = spots[i];
      g.translate(flip ? -x : x, y, flip ? -z : z);
      parts.push(g);
    }
  });
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingSphere();
  geoCache.set(key, geo);
  return geo;
}

function stampMaterial(): THREE.Material {
  const hit = matCache.get('stamp');
  if (hit) return hit as THREE.Material;
  // tinta com um brilho próprio fraco: o carimbo continua legível nas peças escuras (Pesada)
  const m = new THREE.MeshStandardMaterial({
    map: sealAtlas(), emissiveMap: sealAtlas(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.22,
    transparent: true, alphaTest: 0.3, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4,
  });
  matCache.set('stamp', m);
  return m;
}

/** Malha dos carimbos de uma peça (null se não tem selo). */
export function sealStamps(type: PieceId, seals: readonly SealId[]): THREE.Mesh | null {
  if (!seals.length) return null;
  const m = new THREE.Mesh(stampGeometry(type, [...seals]), stampMaterial());
  m.name = 'stamps';
  return m;
}

/** Dominó; com `seals`, a metade de baixo fica lisa (sem pips) e recebe os carimbos. */
export function makeDomino(type: PieceId, id: number, seals: readonly SealId[] = []): THREE.Mesh {
  const [a, b0] = pipsFor(type, id);
  const b = seals.length ? 0 : b0;
  const m = new THREE.Mesh(dominoGeometry(type, a, b), dominoMaterials(type));
  m.castShadow = true;
  m.receiveShadow = true;
  const st = sealStamps(type, seals);
  if (st) m.add(st);
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
  if (type === 'jumper') {
    // molas espiraladas dos dois lados, na base: ela é a que pula
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14), std('#c8d0c0', 0.35, 0.8));
        coil.rotation.x = Math.PI / 2;
        coil.position.set(s * (PIECES.jumper.w / 2 + 0.035), -PIECES.jumper.h / 2 + 0.03 + k * 0.032, 0);
        coil.castShadow = true;
        m.add(coil);
      }
    }
  }
  if (type === 'metal') {
    // rebites nos quatro cantos, frente e verso
    const d = PIECES.metal;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std('#9aa0aa', 0.3, 0.9));
      r.position.set(sx * (d.w / 2 - 0.045), sy * (d.h / 2 - 0.05), sz * (d.t / 2));
      m.add(r);
    }
  }
  if (type === 'minion') {
    // chifrinhos de capanga
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 8), std('#e8d8c0', 0.5));
      horn.position.set(s * 0.12, PIECES.minion.h / 2 + 0.05, 0);
      horn.rotation.z = -s * 0.35;
      horn.castShadow = true;
      m.add(horn);
    }
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
  torcher: { coat: '#3a2a22', pants: '#1a1210', hat: '#2a1c16', skin: '#a89a86', trim: '#8a3a1a', glint: '#ff8a2a' },
  brute: { coat: '#34363c', pants: '#1e1614', hat: '#25272c', skin: '#6c8556', trim: '#6a5a3a', glint: '#ff4a2a' },
  general: { coat: '#3e0f20', pants: '#121218', hat: '#8a6a2a', skin: '#c4bdac', trim: '#8a6a2a', glint: '#ff2a2a' },
  ogre: { coat: '#4a3a24', pants: '#2a2016', hat: '#3a2a1a', skin: '#6f8a4a', trim: '#5a4a32', glint: '#ffb02a' },
  archer: { coat: '#24402a', pants: '#1a1e16', hat: '#1c2e1e', skin: '#b0a894', trim: '#7a6a42', glint: '#ffd27a' },
};

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

let haloTex: THREE.Texture | undefined;

/** Cor do contorno (luz de borda) de cada tipo: frio para a tropa, quente/agressivo para os grandes. */
const RIM: Record<EnemyKind, string> = {
  soldier: '#7f8cff', patroller: '#c9a25a', torcher: '#ff7a2a', brute: '#ff6a4a', general: '#ff3a3a', ogre: '#9cff5a', archer: '#7fffb0',
};

/**
 * Pivô no centro do corpo (igual ao corpo físico). Dentro dele, o grupo `anim` (base do boneco, para o
 * balanço de brinquedo e os pulinhos) e o modelo. Frente = +Z.
 */
export function makeEnemy(kind: EnemyKind): THREE.Group {
  const pal = PALETTE[kind];
  const H = ENEMY_HEIGHT[kind];
  const pivot = new THREE.Group();
  const anim = new THREE.Group();
  anim.name = 'anim';
  anim.position.y = -H / 2;
  pivot.add(anim);
  const g = new THREE.Group();
  anim.add(g);
  const look = new EnemyLook(RIM[kind], kind === 'general' || kind === 'ogre' ? 0.55 : 0.42);
  pivot.userData.look = look;
  const M = (c: string, r = 0.6, m = 0) => look.mat(c, r, m);
  const s = kind === 'brute' ? 1.32 : kind === 'general' ? 1.5 : kind === 'ogre' ? 1.6 : 1;
  const wide = kind === 'brute' ? 1.25 : kind === 'ogre' ? 1.45 : 1;
  const coat = M(pal.coat, 0.62), pants = M(pal.pants, 0.7), skin = M(pal.skin, 0.75);
  const hat = M(pal.hat, kind === 'general' ? 0.4 : 0.6, kind === 'general' ? 0.7 : 0);
  const trim = M(pal.trim, 0.45, 0.6);
  const strap = M('#d9cfb4', 0.7);
  const gold = M('#b8913e', 0.35, 0.85);
  // base de brinquedo (pedestal com filete)
  part(new THREE.CylinderGeometry(0.2 * s * wide, 0.23 * s * wide, 0.06, 24), M('#17130f', 0.7), 0, 0.03, 0, g);
  part(new THREE.TorusGeometry(0.215 * s * wide, 0.012, 6, 28), gold, 0, 0.06, 0, g).rotation.x = Math.PI / 2;
  // pernas (duas, com botas)
  for (const sx of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.052 * s * wide, 0.058 * s * wide, 0.28 * s, 10), pants, sx * 0.06 * s * wide, 0.06 + 0.14 * s, 0, g);
    part(new THREE.CylinderGeometry(0.062 * s * wide, 0.066 * s * wide, 0.08 * s, 10), M('#0c0a0a', 0.45), sx * 0.06 * s * wide, 0.06 + 0.04 * s, 0.006, g);
  }
  // corpo
  const bodyY = 0.06 + 0.28 * s + 0.16 * s;
  part(new THREE.CylinderGeometry(0.13 * s * wide, 0.155 * s * wide, 0.34 * s, 18), coat, 0, bodyY, 0, g);
  part(new THREE.CylinderGeometry(0.158 * s * wide, 0.158 * s * wide, 0.04 * s, 18), trim, 0, bodyY - 0.1 * s, 0, g);
  // fivela do cinto
  part(new THREE.BoxGeometry(0.05 * s, 0.035 * s, 0.02 * s), gold, 0, bodyY - 0.1 * s, 0.158 * s * wide, g);
  // barra rasgada do casaco (tiras penduradas)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = (0.05 + ((i * 5) % 4) * 0.025) * s;
    const strip = part(new THREE.BoxGeometry(0.05 * s, len, 0.012 * s), coat, Math.sin(a) * 0.15 * s * wide, bodyY - 0.17 * s - len / 2, Math.cos(a) * 0.15 * s * wide, g);
    strip.rotation.y = a;
    strip.rotation.x = 0.15;
  }
  // tropa: faixas cruzadas no peito (o "X" branco do soldadinho de chumbo)
  if (kind === 'soldier' || kind === 'patroller' || kind === 'archer') {
    for (const sx of [-1, 1]) {
      const b = part(new THREE.BoxGeometry(0.035 * s, 0.32 * s, 0.012), strap, 0, bodyY + 0.02 * s, 0.142 * s * wide, g);
      b.rotation.z = sx * 0.62;
    }
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), gold, 0, bodyY + 0.02 * s, 0.15 * s * wide, g).rotation.x = Math.PI / 2;
  } else {
    // botões
    for (let i = 0; i < 2; i++) part(new THREE.SphereGeometry(0.018 * s, 6, 4), trim, 0, bodyY + 0.02 * s + i * 0.08 * s, 0.142 * s * wide, g);
  }
  // braços
  for (const sx of [-1, 1]) {
    const arm = part(new THREE.CapsuleGeometry(0.045 * s, 0.2 * s, 4, 8), coat, sx * 0.17 * s * wide, bodyY, 0, g);
    arm.rotation.z = sx * 0.12;
    part(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.03 * s, 10), trim, sx * 0.182 * s * wide, bodyY - 0.11 * s, 0, g);
    part(new THREE.SphereGeometry(0.048 * s, 8, 6), skin, sx * 0.185 * s * wide, bodyY - 0.15 * s, 0.01, g);
    // dragonas douradas nos ombros
    if (kind !== 'ogre' && kind !== 'torcher') {
      const ep = part(new THREE.SphereGeometry(0.06 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), kind === 'brute' ? hat : gold, sx * 0.165 * s * wide, bodyY + 0.13 * s, 0, g);
      ep.scale.set(1.15, 0.7, 1);
    }
  }
  // cabeça
  const headY = bodyY + 0.17 * s + 0.1 * s;
  part(new THREE.SphereGeometry(0.105 * s, 20, 16), skin, 0, headY, 0, g);
  // rosto expressivo (olhos ocos + boca costurada) numa calota na frente da cabeça; o Board controla as reações
  const face = new EnemyFaceRig(kind, 0.105 * s, pal.glint);
  face.mesh.position.set(0, headY, 0);
  g.add(face.mesh);
  pivot.userData.face = face;
  // mosquete com baioneta (tropa): segurado em pé ao lado do braço direito
  const musket = (x: number) => {
    const gun = new THREE.Group();
    gun.position.set(x, bodyY - 0.2 * s, 0.07);
    gun.rotation.z = -0.06;
    g.add(gun);
    part(new THREE.BoxGeometry(0.04, 0.2, 0.05), M('#3a2416', 0.7), 0, 0.1, 0, gun);
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), M('#4a4e58', 0.3, 0.85), 0, 0.42, 0.005, gun);
    part(new THREE.ConeGeometry(0.012, 0.13, 6), M('#c8ccd4', 0.25, 0.9), 0, 0.73, 0.005, gun);
  };
  // chapéus e acessórios
  if (kind === 'soldier') {
    part(new THREE.CylinderGeometry(0.085, 0.095, 0.17, 18), hat, 0, headY + 0.13, 0, g);
    part(new THREE.CylinderGeometry(0.098, 0.098, 0.02, 18), gold, 0, headY + 0.05, 0, g);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 10), gold, 0, headY + 0.13, 0.088, g).rotation.x = Math.PI / 2;
    // penacho: pena branca com ponta vermelha
    const plume = part(new THREE.SphereGeometry(0.03, 10, 8), M('#e8e0cc', 0.8), 0, headY + 0.25, 0.01, g);
    plume.scale.set(1, 1.9, 1);
    part(new THREE.SphereGeometry(0.022, 8, 6), M('#b3261c', 0.7), 0, headY + 0.3, 0.012, g).scale.set(1, 1.4, 1);
    musket(0.2);
  } else if (kind === 'patroller') {
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18), hat, 0, headY + 0.07, 0, g);
    part(new THREE.CylinderGeometry(0.07, 0.085, 0.09, 14), hat, 0, headY + 0.12, 0, g);
    part(new THREE.CylinderGeometry(0.087, 0.087, 0.018, 14), gold, 0, headY + 0.09, 0, g);
    // lanterna
    const pole = part(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), M('#2a1d12', 0.8), 0.2, bodyY + 0.05, 0.08, g);
    pole.rotation.x = 0.2;
    part(new THREE.SphereGeometry(0.045, 10, 8), glow('#ffb347', 6), 0.2, bodyY + 0.3, 0.12, g);
    part(new THREE.CylinderGeometry(0.055, 0.04, 0.02, 10), gold, 0.2, bodyY + 0.35, 0.13, g);
  } else if (kind === 'torcher') {
    // capuz pontudo de piromaníaco + lenço queimado no pescoço
    part(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hat, 0, headY + 0.005, -0.008, g);
    const tip = part(new THREE.ConeGeometry(0.075, 0.2, 12), hat, 0, headY + 0.14, -0.04, g);
    tip.rotation.x = -0.45;
    part(new THREE.TorusGeometry(0.1, 0.028, 6, 16), trim, 0, headY - 0.1, 0, g).rotation.x = Math.PI / 2;
    // marcas de fuligem no casaco
    for (const [x, y] of [[0.06, 0.04], [-0.07, -0.06]]) {
      const soot = part(new THREE.CircleGeometry(0.035, 8), M('#0e0a08', 1), x, bodyY + y, 0.152, g);
      soot.castShadow = false;
    }
    // tocha erguida na mão direita: cabo de madeira, trapo enrolado e a chama (bloom)
    const torch = new THREE.Group();
    torch.name = 'torch';
    torch.position.set(0.2, bodyY - 0.13, 0.07);
    torch.rotation.set(0.35, 0, -0.18);
    g.add(torch);
    part(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 8), M('#3a2414', 0.85), 0, 0.15, 0, torch);
    part(new THREE.CylinderGeometry(0.032, 0.026, 0.07, 10), M('#4a3a2a', 0.95), 0, 0.33, 0, torch);
    const flame = new THREE.Group();
    flame.name = 'flame';
    flame.position.y = 0.4;
    torch.add(flame);
    const blob = (r: number, sy: number, y: number, color: string, k: number, x = 0) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glow(color, k));
      m.scale.y = sy;
      m.position.set(x, y, 0);
      flame.add(m);
      return m;
    };
    blob(0.05, 1.7, 0.04, '#ff4a10', 3.5);
    blob(0.032, 1.6, 0.03, '#ffb347', 5);
    blob(0.018, 1.4, 0.02, '#fff0b0', 7);
    blob(0.022, 2.2, 0.1, '#ff6a1a', 4, 0.022).rotation.z = -0.4;
    blob(0.018, 2.0, 0.09, '#ff6a1a', 4, -0.024).rotation.z = 0.5;
    haloTex ??= softDot();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: new THREE.Color('#ff7a2a').multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.name = 'halo';
    halo.scale.setScalar(0.42);
    halo.position.y = 0.05;
    flame.add(halo);
  } else if (kind === 'ogre') {
    // careca de orelhas de abano, presas para fora e um porrete de tronco na mão
    for (const sx of [-1, 1]) {
      const ear = part(new THREE.SphereGeometry(0.045 * s, 8, 6), skin, sx * 0.11 * s, headY + 0.01 * s, -0.01, g);
      ear.scale.set(0.6, 1.3, 1);
      const tusk = part(new THREE.ConeGeometry(0.014 * s, 0.06 * s, 6), M('#e8dcc0', 0.5), sx * 0.04 * s, headY - 0.06 * s, 0.09 * s, g);
      tusk.rotation.x = Math.PI;
    }
    part(new THREE.SphereGeometry(0.09 * s, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#3a2a1a', 0.9), 0, bodyY - 0.02 * s, 0.05 * s, g).rotation.x = -Math.PI / 2;
    const club = new THREE.Group();
    club.position.set(0.21 * s * wide, bodyY - 0.15 * s, 0.06);
    club.rotation.set(0.6, 0, -0.35);
    g.add(club);
    part(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.42 * s, 8), M('#4a3220', 0.9), 0, 0.2 * s, 0, club);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      part(new THREE.ConeGeometry(0.014 * s, 0.04 * s, 5), M('#9a9a9a', 0.4, 0.6), Math.sin(a) * 0.052 * s, 0.36 * s, Math.cos(a) * 0.052 * s, club).rotation.set(Math.cos(a) * 1.5, 0, -Math.sin(a) * 1.5);
    }
  } else if (kind === 'archer') {
    // capuz verde, arco na mão esquerda e aljava cheia nas costas
    part(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hat, 0, headY + 0.004, -0.01, g);
    const tip = part(new THREE.ConeGeometry(0.06, 0.16, 10), hat, 0, headY + 0.1, -0.07, g);
    tip.rotation.x = -0.9;
    const bow = part(new THREE.TorusGeometry(0.2, 0.012, 6, 20, Math.PI * 0.9), M('#5a3a1c', 0.7), -0.2, bodyY + 0.02, 0.1, g);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.45);
    part(new THREE.CylinderGeometry(0.003, 0.003, 0.39, 4), M('#d8d0b8', 0.6), -0.2, bodyY + 0.02, 0.1 + 0.02, g);
    const quiver = part(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 10), M('#3a2414', 0.85), 0.06, bodyY + 0.05, -0.15, g);
    quiver.rotation.x = -0.35;
    for (let i = 0; i < 3; i++) {
      part(new THREE.ConeGeometry(0.018, 0.05, 5), glow('#ff7a2a', 3), 0.06 + (i - 1) * 0.022, bodyY + 0.22, -0.2, g);
    }
  } else if (kind === 'brute') {
    part(new THREE.SphereGeometry(0.12 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, headY + 0.02, 0, g);
    for (const sx of [-1, 1]) {
      const horn = part(new THREE.ConeGeometry(0.03 * s, 0.14 * s, 8), M('#b8ab8c', 0.6), sx * 0.12 * s, headY + 0.08 * s, 0, g);
      horn.rotation.z = -sx * 0.9;
    }
    // escudo redondo no braço esquerdo: madeira, aro de ferro e cravo no meio
    const shield = new THREE.Group();
    shield.position.set(-0.2 * s * wide, bodyY - 0.03 * s, 0.07 * s);
    shield.rotation.set(0, -0.5, 0);
    g.add(shield);
    part(new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.03 * s, 22), M('#4a2e1c', 0.75), 0, 0, 0, shield).rotation.x = Math.PI / 2;
    part(new THREE.TorusGeometry(0.15 * s, 0.014 * s, 6, 26), M('#6a6e78', 0.35, 0.85), 0, 0, 0.002, shield);
    part(new THREE.SphereGeometry(0.035 * s, 10, 8), M('#8a8e98', 0.3, 0.9), 0, 0, 0.02 * s, shield);
    for (const a of [0, Math.PI / 2]) {
      const band = part(new THREE.BoxGeometry(0.3 * s, 0.022 * s, 0.01), M('#6a6e78', 0.35, 0.85), 0, 0, 0.017 * s, shield);
      band.rotation.z = a + 0.4;
    }
  } else {
    // general: coroa + capa + sabre erguido
    part(new THREE.CylinderGeometry(0.1 * s, 0.09 * s, 0.07 * s, 16, 1, true), hat, 0, headY + 0.12 * s, 0, g);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(new THREE.ConeGeometry(0.022 * s, 0.07 * s, 6), hat, Math.sin(a) * 0.095 * s, headY + 0.18 * s, Math.cos(a) * 0.095 * s, g);
    }
    part(new THREE.SphereGeometry(0.025 * s, 8, 6), glow('#ff2a2a', 4), 0, headY + 0.13 * s, 0.1 * s, g);
    const cape = part(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 0.5 * s, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8), M('#1c0a24', 0.85), 0, bodyY - 0.05 * s, 0, g);
    cape.rotation.y = Math.PI;
    (cape.material as THREE.Material).side = THREE.DoubleSide;
    // medalha que brilha no peito
    part(new THREE.CylinderGeometry(0.022 * s, 0.022 * s, 0.01, 12), glow('#ffcf6a', 2.2), -0.06 * s, bodyY + 0.07 * s, 0.14 * s, g).rotation.x = Math.PI / 2;
    const sabre = new THREE.Group();
    sabre.position.set(0.2 * s, bodyY - 0.14 * s, 0.08 * s);
    sabre.rotation.set(0.25, 0, -0.32);
    g.add(sabre);
    part(new THREE.CylinderGeometry(0.012 * s, 0.014 * s, 0.07 * s, 8), M('#3a2416', 0.7), 0, 0, 0, sabre);
    part(new THREE.BoxGeometry(0.08 * s, 0.012 * s, 0.02 * s), gold, 0, 0.04 * s, 0, sabre);
    const blade = part(new THREE.BoxGeometry(0.022 * s, 0.34 * s, 0.006 * s), M('#d8dce6', 0.18, 0.95), 0.004 * s, 0.215 * s, 0, sabre);
    blade.rotation.z = -0.04;
  }
  // ajusta a altura visual à física (o modelo fica com a base na origem do grupo `anim`)
  const box = new THREE.Box3().setFromObject(g);
  const k = H / (box.max.y - box.min.y);
  g.scale.setScalar(k);
  g.position.y = -box.min.y * k;
  return pivot;
}

// ---------- cenário ----------
let hedgeMat: THREE.Material, crateMat: THREE.Material;
export function makeWall(w: WallSpec): THREE.Object3D {
  hedgeMat ??= new THREE.MeshStandardMaterial({ map: hedgeTexture(), roughness: 0.95 });
  crateMat ??= new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 });
  const grp = new THREE.Group();
  grp.position.set(w.x, 0, w.z);
  grp.rotation.y = w.yaw ?? 0; // segmentos de L/curva vêm girados
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

/** Porteira: dois mourões de pedra e a GRADE de ferro (filha `grate`, que afunda no chão quando abre). */
export function makeGate(gs: GateSpec): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(gs.x, 0, gs.z);
  grp.rotation.y = gs.yaw ?? 0;
  const iron = std('#8a8f9c', 0.35, 0.85), rust = std('#8a5a34', 0.7, 0.4);
  const grate = new THREE.Group();
  grate.name = 'grate';
  grp.add(grate);
  const n = Math.max(3, Math.round(gs.w / 0.1));
  for (let i = 0; i <= n; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, gs.h, 8), iron);
    bar.position.set(-gs.w / 2 + (i / n) * gs.w, gs.h / 2, 0);
    bar.castShadow = true;
    grate.add(bar);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), iron);
    spike.position.set(bar.position.x, gs.h + 0.03, 0);
    grate.add(spike);
  }
  for (const y of [0.12, gs.h - 0.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(gs.w, 0.05, 0.06), rust);
    rail.position.set(0, y, 0);
    rail.castShadow = true;
    grate.add(rail);
  }
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.16, gs.h + 0.22, 0.2, 2, 0.03), std('#3d3934', 0.9));
    post.position.set(sx * (gs.w / 2 + 0.08), (gs.h + 0.22) / 2, 0);
    post.castShadow = post.receiveShadow = true;
    grp.add(post);
  }
  return grp;
}

/** Alavanca da porteira: base, braço (filho `arm`, tomba quando a corrente cai nela) e anel no chão. */
export function makeLever(x: number, z: number, faceYaw: number): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = faceYaw;
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.1, 0.16, 2, 0.03), std('#3d3934', 0.9));
  base.position.y = 0.05;
  base.castShadow = base.receiveShadow = true;
  grp.add(base);
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.y = 0.1;
  arm.rotation.x = -0.5;
  grp.add(arm);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), std('#2a2c33', 0.45, 0.8));
  stick.position.y = 0.21;
  stick.castShadow = true;
  arm.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), glow('#ffd36b', 2.2));
  knob.position.y = 0.43;
  arm.add(knob);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.4), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.name = 'leverRing';
  grp.add(ring);
  return grp;
}

export function makeTrigger(): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.03, 40), std('#14201a', 0.6));
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), glow('#7dffc0', 2.4));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  ring.name = 'ring';
  g.add(ring);
  // seta no chão para a direção inicial (+Z local)
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, -0.1); shape.lineTo(0.09, -0.1); shape.lineTo(0.09, 0.15); shape.lineTo(0.2, 0.15);
  shape.lineTo(0, 0.38); shape.lineTo(-0.2, 0.15); shape.lineTo(-0.09, 0.15); shape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow('#7dffc0', 1.6));
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
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.76), toneMapped: false, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 32), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}
