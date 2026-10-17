import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SealId, SEAL_ORDER } from '../core/cards';
import { BuffId, BUFFS } from '../core/buffs';
import { makeDomino, glow } from './models';
import { sealAtlas } from './sigils';
import { woodTexture, stoneTexture, softDot } from './textures';

// Objetos 3D dos eventos entre as fases (tudo procedural, no clima da mesa): a bancada da LOJA,
// a PRENSA DE SELOS de ferro fundido com seus carimbos e o ALTAR MÍSTICO com a bola de cristal.
// Unidades em metros, como o resto da mesa (um dominó comum tem 0,8 de altura).

// ---------- materiais ----------
const mats = new Map<string, THREE.Material>();
function mat<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = mats.get(key);
  if (hit) return hit as T;
  const m = make();
  mats.set(key, m);
  return m;
}
export const M = {
  iron: () => mat('iron', () => new THREE.MeshStandardMaterial({ color: '#2e3036', metalness: 0.85, roughness: 0.42 })),
  ironDark: () => mat('ironDark', () => new THREE.MeshStandardMaterial({ color: '#17181c', metalness: 0.8, roughness: 0.55 })),
  brass: () => mat('brass', () => new THREE.MeshStandardMaterial({ color: '#b48a45', metalness: 0.92, roughness: 0.3 })),
  brassDark: () => mat('brassDark', () => new THREE.MeshStandardMaterial({ color: '#7a5a2a', metalness: 0.9, roughness: 0.42 })),
  gold: () => mat('gold', () => new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.22, emissive: '#3a2604', emissiveIntensity: 0.6 })),
  wood: () => mat('wood', () => new THREE.MeshStandardMaterial({ map: woodTexture('#5a3a22', '#1e1008', 11), roughness: 0.7 })),
  woodDark: () => mat('woodDark', () => new THREE.MeshStandardMaterial({ map: woodTexture('#2e1c10', '#0e0703', 12), roughness: 0.75 })),
  velvet: () => mat('velvet', () => new THREE.MeshPhysicalMaterial({ color: '#2a070e', roughness: 0.95, sheen: 0.8, sheenColor: new THREE.Color('#b04a5c'), sheenRoughness: 0.5 })),
  velvetDark: () => mat('velvetDark', () => new THREE.MeshPhysicalMaterial({ color: '#140c10', roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color('#6a4a58'), sheenRoughness: 0.6 })),
  parchment: () => mat('parchment', () => new THREE.MeshStandardMaterial({ color: '#8f8166', roughness: 1 })),
  stone: () => mat('stone', () => new THREE.MeshStandardMaterial({ map: stoneTexture(), color: '#8a847a', roughness: 0.95 })),
  wax: () => mat('wax', () => new THREE.MeshStandardMaterial({ color: '#cfc3a4', roughness: 0.55 })),
  glass: () => mat('glass', () => new THREE.MeshPhysicalMaterial({ color: '#dfe8ff', roughness: 0.04, transmission: 1, thickness: 0.4, ior: 1.45, transparent: true, opacity: 1 })),
  cork: () => mat('cork', () => new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 })),
  dark: () => mat('dark', () => new THREE.MeshStandardMaterial({ color: '#0b0907', roughness: 0.9 })),
};

/** Malha com sombra (lança e recebe). */
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  o.receiveShadow = true;
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
const box = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
const cyl = (rt: number, rb: number, h: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Halo luminoso (sprite aditivo). */
export function glowSprite(color: string, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** Anel de destaque no chão (hover dos itens). */
export function hoverRing(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#f2c14e').multiplyScalar(1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.name = 'ring';
  return m;
}

// ---------- coisas da mesa ----------
/** Pano retangular com barra dourada e borlas nos cantos. */
export function cloth(w: number, d: number, m: THREE.Material = M.velvet()): THREE.Group {
  const g = new THREE.Group();
  mesh(box(w, 0.035, d, 0.015), m, g, 0, 0.018, 0);
  const t = 0.05;
  for (const [x, z, ww, dd] of [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]] as const) {
    mesh(box(ww, 0.02, dd, 0.008), M.brassDark(), g, x, 0.04, z);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tassel = mesh(new THREE.ConeGeometry(0.06, 0.2, 10), M.gold(), g, sx * (w / 2 + 0.02), 0.06, sz * (d / 2 + 0.02));
    tassel.rotation.z = sx * 1.2;
  }
  return g;
}

/** Expositor de madeira (onde ficam as peças à venda). */
export function plinth(w: number): THREE.Group {
  const g = new THREE.Group();
  mesh(box(w, 0.2, 0.75, 0.05), M.woodDark(), g, 0, 0.1, 0);
  mesh(box(w - 0.12, 0.03, 0.63, 0.01), M.velvet(), g, 0, 0.215, 0);
  mesh(box(w + 0.04, 0.035, 0.79, 0.015), M.brassDark(), g, 0, 0.02, 0);
  return g;
}

/** Vela (acesa ou apagada). Devolve a vela e a chama (para acender/piscar). */
export function candle(h: number, r = 0.1, lit = true): { g: THREE.Group; flame: THREE.Group; light: THREE.PointLight } {
  const g = new THREE.Group();
  mesh(cyl(r * 0.93, r, h, 18), M.wax(), g, 0, h / 2, 0);
  mesh(cyl(r * 1.5, r * 1.7, 0.04, 20), M.wax(), g, 0, 0.02, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1, len = h * (0.25 + i * 0.12);
    mesh(new THREE.CapsuleGeometry(r * 0.15, len, 3, 8), M.wax(), g, Math.cos(a) * r * 0.93, h - len / 2 - r * 0.1, Math.sin(a) * r * 0.93);
  }
  mesh(cyl(0.008, 0.008, 0.06, 5), M.dark(), g, 0, h + 0.03, 0);
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow('#ff9a3c', 4));
  outer.scale.set(0.75, 1.9, 0.75);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), glow('#fff0c8', 7));
  inner.scale.set(0.8, 1.6, 0.8);
  inner.position.y = -0.02;
  flame.add(outer, inner);
  flame.position.y = h + 0.1;
  flame.visible = lit;
  g.add(flame);
  const light = new THREE.PointLight('#ff8a3a', lit ? 2.5 : 0, 4, 1.8);
  light.position.y = h + 0.3;
  g.add(light);
  return { g, flame, light };
}

/** Frasco de vidro com remédio vermelho e rolha. */
export function vial(): { g: THREE.Group; cork: THREE.Mesh; liquid: THREE.Mesh } {
  const g = new THREE.Group();
  const pts = [
    [0, 0], [0.16, 0], [0.2, 0.05], [0.22, 0.2], [0.2, 0.32], [0.08, 0.42], [0.065, 0.56], [0.08, 0.6], [0, 0.6],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bottle = mesh(new THREE.LatheGeometry(pts, 28), M.glass(), g);
  bottle.castShadow = false;
  const liquid = mesh(cyl(0.17, 0.15, 0.26, 24), new THREE.MeshStandardMaterial({ color: '#b0101c', roughness: 0.2, emissive: '#5a0008', emissiveIntensity: 0.9, transparent: true, opacity: 0.92 }), g, 0, 0.16, 0);
  liquid.castShadow = false;
  const cork = mesh(cyl(0.07, 0.06, 0.12, 14), M.cork(), g, 0, 0.64, 0);
  const label = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.1, 24, 1, true), M.parchment(), g, 0, 0.2, 0);
  label.castShadow = false;
  const shine = glowSprite('#ff3040', 0.8, 0.35);
  shine.position.y = 0.2;
  g.add(shine);
  return { g, cork, liquid };
}

/** Martelo deitado na bigorna (para quebrar uma peça). */
export function anvilAndHammer(): { g: THREE.Group; hammer: THREE.Group; top: THREE.Vector3 } {
  const g = new THREE.Group();
  mesh(box(0.7, 0.18, 0.42, 0.03), M.ironDark(), g, 0, 0.09, 0);
  mesh(box(0.32, 0.2, 0.26, 0.02), M.ironDark(), g, 0, 0.27, 0);
  const top = mesh(box(0.8, 0.14, 0.34, 0.03), M.iron(), g, 0.05, 0.43, 0);
  const horn = mesh(new THREE.ConeGeometry(0.14, 0.42, 18), M.iron(), g, -0.56, 0.44, 0);
  horn.rotation.z = Math.PI / 2;
  void top;
  // martelo: o pivô fica no fim do cabo (para girar a batida)
  const hammer = new THREE.Group();
  const handle = mesh(cyl(0.035, 0.045, 0.85, 10), M.wood(), hammer, 0, 0.425, 0);
  void handle;
  mesh(box(0.34, 0.16, 0.16, 0.025), M.iron(), hammer, 0, 0.86, 0);
  hammer.position.set(0.62, 0.5, 0.16);
  hammer.rotation.set(0, 0, 1.2);
  g.add(hammer);
  return { g, hammer, top: new THREE.Vector3(0.05, 0.5, 0) };
}

/** Sininho de balcão (pede mercadoria nova). */
export function deskBell(): { g: THREE.Group; dome: THREE.Mesh } {
  const g = new THREE.Group();
  mesh(cyl(0.26, 0.28, 0.06, 32), M.woodDark(), g, 0, 0.03, 0);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * 0.22, Math.sin(a) * 0.18)); }
  const dome = mesh(new THREE.LatheGeometry(pts, 32), M.brass(), g, 0, 0.07, 0);
  mesh(cyl(0.015, 0.015, 0.08, 8), M.brass(), dome, 0, 0.2, 0);
  mesh(new THREE.SphereGeometry(0.035, 12, 8), M.brass(), dome, 0, 0.25, 0);
  return { g, dome };
}

// ---------- prensa de selos ----------
/** Mostrador de pressão (só enfeite). */
function gaugeFace(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1d16'; g.lineWidth = 3;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * (i % 5 ? 54 : 58), 64 + Math.sin(a) * (i % 5 ? 54 : 58)); g.stroke();
  }
  g.strokeStyle = '#a3201c'; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 64, 52, Math.PI * 1.95, Math.PI * 2.25); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Plaqueta com texto gravado. */
function plate(text: string, w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * (h / w));
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#d8b46a'); grd.addColorStop(1, '#8a6528');
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#4a3410'; g.lineWidth = 8; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#3a2408';
  g.font = `bold ${Math.round(c.height * 0.5)}px "IM Fell English SC", Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  for (const x of [26, c.width - 26]) { g.fillStyle = '#5a4012'; g.beginPath(); g.arc(x, c.height / 2, 9, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.35 }));
}

export interface Press {
  g: THREE.Group;
  /** volante (gira quando a prensa desce) */
  wheel: THREE.Group;
  /** cabeçote que desce (o carimbo vai embaixo dele) */
  ram: THREE.Group;
  ramUp: number;
  /** altura do cabeçote encostando na peça deitada na mesa da prensa */
  ramDown: number;
  /** centro da mesa da prensa (onde a peça deita), em coordenadas locais */
  bed: THREE.Vector3;
  /** onde o carimbo encaixa embaixo do cabeçote (local ao cabeçote) */
  dieSlot: THREE.Vector3;
  needle: THREE.Mesh;
}

export function press(): Press {
  const g = new THREE.Group();
  // base pesada com barra de latão
  mesh(box(2.4, 0.34, 1.5, 0.06), M.ironDark(), g, 0, 0.17, 0);
  mesh(box(2.46, 0.05, 1.56, 0.02), M.brassDark(), g, 0, 0.36, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(cyl(0.05, 0.05, 0.05, 8), M.brass(), g, sx * 1.05, 0.38, sz * 0.62);
  // mesa da prensa
  mesh(box(1.1, 0.14, 0.9, 0.03), M.iron(), g, 0, 0.45, 0);
  mesh(box(1.14, 0.03, 0.94, 0.01), M.brass(), g, 0, 0.53, 0);
  const bedTop = 0.545;
  // colunas
  for (const sx of [-1, 1]) {
    mesh(cyl(0.1, 0.12, 2.5, 20), M.iron(), g, sx * 0.85, 1.6, 0);
    mesh(cyl(0.15, 0.15, 0.08, 20), M.brass(), g, sx * 0.85, 0.42, 0);
    mesh(cyl(0.14, 0.14, 0.06, 20), M.brass(), g, sx * 0.85, 2.75, 0);
  }
  // travessa de cima com plaqueta
  mesh(box(2.1, 0.42, 0.56, 0.08), M.ironDark(), g, 0, 2.98, 0);
  const pl = plate('PRENSA', 0.9, 0.2);
  pl.position.set(0, 2.98, 0.285);
  g.add(pl);
  // fuso com "rosca" e volante no topo
  mesh(cyl(0.07, 0.07, 1.2, 14), M.iron(), g, 0, 3.55, 0);
  for (let i = 0; i < 7; i++) mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 18), M.ironDark(), g, 0, 3.22 + i * 0.09, 0).rotation.x = Math.PI / 2;
  const wheel = new THREE.Group();
  wheel.position.set(0, 4.15, 0);
  const rim = mesh(new THREE.TorusGeometry(0.62, 0.045, 10, 48), M.iron(), wheel);
  rim.rotation.x = Math.PI / 2;
  mesh(cyl(0.11, 0.11, 0.12, 16), M.brass(), wheel);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = mesh(cyl(0.025, 0.025, 0.6, 8), M.iron(), wheel, Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31);
    spoke.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2);
    spoke.rotation.order = 'YXZ';
    spoke.rotation.set(0, -a, Math.PI / 2);
    mesh(new THREE.SphereGeometry(0.07, 14, 10), M.brass(), wheel, Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62);
  }
  g.add(wheel);
  // cabeçote que desce
  const ram = new THREE.Group();
  mesh(box(0.66, 0.3, 0.56, 0.05), M.iron(), ram, 0, 0, 0);
  mesh(box(0.7, 0.04, 0.6, 0.015), M.brass(), ram, 0, -0.16, 0);
  for (const sx of [-1, 1]) mesh(cyl(0.13, 0.13, 0.3, 16), M.ironDark(), ram, sx * 0.85, 0, 0);
  mesh(box(1.7, 0.08, 0.16, 0.03), M.ironDark(), ram, 0, 0.05, 0);
  // soquete embaixo do cabeçote: o cabo do carimbo entra nele (face de latão virada para a mesa)
  const SOCKET = 0.15;
  mesh(cyl(0.1, 0.12, SOCKET, 20), M.ironDark(), ram, 0, -0.18 - SOCKET / 2, 0);
  mesh(cyl(0.125, 0.125, 0.025, 20), M.brass(), ram, 0, -0.18 - SOCKET + 0.012, 0);
  const ramUp = 2.45;
  ram.position.set(0, ramUp, 0);
  g.add(ram);
  // manômetro na coluna
  const gauge = new THREE.Group();
  mesh(cyl(0.17, 0.17, 0.07, 24), M.brass(), gauge).rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshStandardMaterial({ map: gaugeFace(), roughness: 0.6 }));
  face.position.z = 0.037;
  gauge.add(face);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.006), new THREE.MeshStandardMaterial({ color: '#a3201c' }));
  needle.geometry.translate(0, 0.045, 0);
  needle.position.z = 0.042;
  gauge.add(needle);
  gauge.position.set(-0.85, 1.55, 0.16);
  g.add(gauge);
  // o carimbo fica EM PÉ: cabo dentro do soquete, colar de latão (topo em 0,13) encostado na boca dele.
  // A origem do carimbo é a face de latão; a peça deitada tem ~0,12 de espessura.
  const dieFace = -0.18 - SOCKET - 0.13;
  return {
    g, wheel, ram, ramUp,
    ramDown: bedTop + 0.12 - dieFace,
    bed: new THREE.Vector3(0, bedTop, 0),
    dieSlot: new THREE.Vector3(0, dieFace, 0),
    needle,
  };
}

/** Plano com a marca de tinta de um selo (para o "papel de prova" e para a base do carimbo). */
export function sealPlane(seal: SealId, size: number): THREE.Mesh {
  const cell = SEAL_ORDER.indexOf(seal);
  const geo = new THREE.PlaneGeometry(size, size);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / SEAL_ORDER.length);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sealAtlas(), color: '#9a9a9a', transparent: true, alphaTest: 0.3, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Carimbo: cabo de madeira, colar de latão e base de latão com o selo em relevo. */
export function stampDie(seal: SealId): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(0.16, 0.17, 0.08, 28), M.brassDark(), g, 0, 0.04, 0);
  mesh(cyl(0.12, 0.15, 0.05, 28), M.brass(), g, 0, 0.105, 0);
  mesh(cyl(0.055, 0.07, 0.36, 14), M.woodDark(), g, 0, 0.31, 0);
  mesh(new THREE.SphereGeometry(0.09, 16, 12), M.woodDark(), g, 0, 0.52, 0);
  // o desenho do selo também aparece na tampa do cabo (para ver de cima)
  const cap = sealPlane(seal, 0.15);
  cap.position.y = 0.612;
  g.add(cap);
  g.userData.h = 0.6;
  return g;
}

/** Papel de prova (onde o carimbo fica de pé e mostra a marca que deixa). */
export function proofPaper(seal: SealId): THREE.Group {
  const g = new THREE.Group();
  mesh(box(0.62, 0.012, 0.62, 0.004), M.parchment(), g, 0, 0.006, 0);
  const mark = sealPlane(seal, 0.5);
  mark.position.set(0, 0.014, 0);
  mark.rotation.z = (Math.random() - 0.5) * 0.4;
  g.add(mark);
  return g;
}

/** Suporte de madeira para os 3 carimbos. */
export function dieRack(n: number, gap: number): THREE.Group {
  const g = new THREE.Group();
  mesh(box(gap * n + 0.3, 0.12, 1.15, 0.03), M.woodDark(), g, 0, 0.06, 0);
  mesh(box(gap * n + 0.34, 0.025, 1.19, 0.01), M.brassDark(), g, 0, 0.012, 0);
  return g;
}

// ---------- altar místico ----------
function arcaneTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#2a1440'); grd.addColorStop(0.7, '#160a22'); grd.addColorStop(1, '#0a0410');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(214, 178, 90, 0.75)';
  for (const [r, w] of [[470, 6], [445, 2], [330, 4], [312, 1.5], [150, 3]] as const) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  // estrela de sete pontas
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 7; i++) { const a = -Math.PI / 2 + ((i * 3) % 7) * ((Math.PI * 2) / 7); g.lineTo(Math.cos(a) * 312, Math.sin(a) * 312); }
  g.stroke();
  // runas no anel
  g.fillStyle = 'rgba(232, 200, 120, 0.85)';
  g.strokeStyle = 'rgba(232, 200, 120, 0.85)';
  g.lineWidth = 3;
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -388);
    g.beginPath();
    const k = Math.floor(r() * 4);
    g.moveTo(-10, 14); g.lineTo(-10, -14);
    if (k === 0) { g.moveTo(-10, -14); g.lineTo(10, 0); g.lineTo(-10, 6); }
    if (k === 1) { g.moveTo(-10, 0); g.lineTo(10, -14); g.moveTo(-10, 0); g.lineTo(10, 14); }
    if (k === 2) { g.moveTo(10, 14); g.lineTo(10, -14); g.moveTo(-10, -4); g.lineTo(10, -4); }
    if (k === 3) { g.arc(0, 0, 10, 0, Math.PI * 2); }
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface Altar {
  g: THREE.Group;
  ball: THREE.Mesh;
  core: THREE.Mesh;
  ballLight: THREE.PointLight;
  /** centro da bola (local) */
  ballPos: THREE.Vector3;
  flames: THREE.Group[];
  circle: THREE.Mesh;
}

export function altar(ballZ = 0): Altar {
  const g = new THREE.Group();
  const tx = arcaneTexture();
  const circle = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18, roughness: 0.95 }));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.012;
  circle.receiveShadow = true;
  g.add(circle);
  // bola de cristal no suporte de garras
  const stand = new THREE.Group();
  mesh(cyl(0.34, 0.42, 0.12, 32), M.brassDark(), stand, 0, 0.06, 0);
  mesh(cyl(0.14, 0.2, 0.3, 24), M.brass(), stand, 0, 0.27, 0);
  for (let i = 0; i < 3; i++) {
    // garra: um arco em pé (plano vertical) que sobe da coluna e abraça a bola
    const piv = new THREE.Group();
    piv.rotation.y = (i / 3) * Math.PI * 2;
    const claw = mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 24, Math.PI * 0.55), M.brass(), piv, 0, 0.98, 0);
    claw.rotation.z = -Math.PI * 0.82;
    stand.add(piv);
  }
  stand.position.z = ballZ;
  g.add(stand);
  const ballPos = new THREE.Vector3(0, 1.02, ballZ);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9a6aff').multiplyScalar(1.6), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.position.copy(ballPos);
  g.add(core);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 32), new THREE.MeshPhysicalMaterial({ color: '#cfd8ff', roughness: 0.02, transmission: 1, thickness: 1.1, ior: 1.5, attenuationColor: new THREE.Color('#7a5acf'), attenuationDistance: 2.2, transparent: true }));
  ball.position.copy(ballPos);
  g.add(ball);
  const halo = glowSprite('#9a6aff', 2.6, 0.35);
  halo.position.copy(ballPos);
  g.add(halo);
  const ballLight = new THREE.PointLight('#9a6aff', 6, 6, 1.6);
  ballLight.position.copy(ballPos);
  g.add(ballLight);
  // velas em volta
  const flames: THREE.Group[] = [];
  for (const [x, z, h] of [[-3.0, -1.4, 0.8], [3.0, -1.4, 0.7], [-2.6, 2.0, 0.5], [2.6, 2.0, 0.6], [0, -2.9, 0.9]] as const) {
    const c = candle(h, 0.1, true);
    c.g.position.set(x, 0, z);
    g.add(c.g);
    flames.push(c.flame);
  }
  return { g, ball, core, ballLight, ballPos, flames, circle };
}

/** Pedestal de pedra. */
export function pedestal(): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(0.42, 0.46, 0.1, 24), M.stone(), g, 0, 0.05, 0);
  mesh(cyl(0.28, 0.32, 0.62, 24), M.stone(), g, 0, 0.41, 0);
  mesh(cyl(0.4, 0.36, 0.1, 24), M.stone(), g, 0, 0.77, 0);
  g.userData.top = 0.82;
  return g;
}

/** Emblema flutuante de cada bênção. */
export function emblem(id: BuffId): THREE.Group {
  const g = new THREE.Group();
  const col = BUFFS[id].color;
  const em = (c: string, k = 0.6, rough = 0.3, metal = 0.2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: rough, metalness: metal });
  switch (id) {
    case 'bighand': {
      for (const a of [-0.4, 0, 0.4]) {
        const d = makeDomino('common', 3 + Math.round(a * 10));
        d.scale.setScalar(0.42);
        const piv = new THREE.Group();
        piv.rotation.z = -a;
        d.position.y = 0.2;
        piv.add(d);
        piv.position.y = -0.12;
        g.add(piv);
      }
      break;
    }
    case 'breath': {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(0.03 + 0.16 * Math.pow(Math.abs(t - 0.5) * 2, 1.6), (t - 0.5) * 0.56)); }
      const glass = mesh(new THREE.LatheGeometry(pts, 24), M.glass(), g);
      glass.castShadow = false;
      const sand = mesh(new THREE.ConeGeometry(0.11, 0.14, 20), em('#e8b860', 0.8), g, 0, -0.2, 0);
      void sand;
      mesh(new THREE.ConeGeometry(0.07, 0.08, 20), em('#e8b860', 0.8), g, 0, 0.1, 0).rotation.x = Math.PI;
      for (const y of [-0.31, 0.31]) mesh(cyl(0.22, 0.22, 0.05, 24), M.brass(), g, 0, y, 0);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; mesh(cyl(0.015, 0.015, 0.62, 6), M.brass(), g, Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19); }
      break;
    }
    case 'vigor': {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.3);
      sh.bezierCurveTo(-0.5, 0.02, -0.32, 0.42, 0, 0.19);
      sh.bezierCurveTo(0.32, 0.42, 0.5, 0.02, 0, -0.3);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 5, curveSegments: 28 });
      geo.center();
      mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#d0182a', emissive: '#5a0010', emissiveIntensity: 0.9, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1 }), g);
      break;
    }
    case 'greed': {
      for (let i = 0; i < 5; i++) mesh(cyl(0.17, 0.17, 0.045, 28), M.gold(), g, (i % 2) * 0.02 - 0.01, -0.18 + i * 0.05, (i % 3) * 0.015);
      const stand = mesh(cyl(0.17, 0.17, 0.045, 28), M.gold(), g, 0.1, 0.12, 0.05);
      stand.rotation.set(Math.PI / 2, 0, 0.3);
      break;
    }
    case 'seer': {
      const eye = new THREE.Group();
      mesh(new THREE.SphereGeometry(0.26, 32, 24), new THREE.MeshStandardMaterial({ color: '#efe6d8', roughness: 0.25 }), eye);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), em('#b98cff', 1.2, 0.3));
      iris.position.z = 0.255;
      eye.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), new THREE.MeshBasicMaterial({ color: '#08040c' }));
      pupil.position.z = 0.258;
      eye.add(pupil);
      eye.name = 'eye';
      g.add(eye);
      break;
    }
    case 'recycle': {
      const m = em(col, 0.9, 0.35, 0.3);
      const arc = mesh(new THREE.TorusGeometry(0.24, 0.055, 12, 48, Math.PI * 1.55), m, g);
      arc.rotation.z = Math.PI * 0.3;
      const head = mesh(new THREE.ConeGeometry(0.11, 0.2, 16), m, g);
      const a = Math.PI * 0.3 + Math.PI * 1.55;
      head.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0);
      head.rotation.z = a;
      break;
    }
  }
  const halo = glowSprite(col, 1.5, 0.45);
  halo.name = 'halo';
  g.add(halo);
  return g;
}
