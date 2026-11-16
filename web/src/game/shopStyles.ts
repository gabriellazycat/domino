import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { glow, std } from './models';
import { crateTexture, woodTexture } from './textures';
import * as P from './props';

// LABORATÓRIO VISUAL DA LOJA: três direções de arte para o mesmo evento (a lógica da loja não muda).
//   A · ANTIQUÁRIO  — tapete persa de lã com franja, expositores de madeira torneada, latão e veludo
//   B · MASCATE     — manta de juta remendada, caixotes com palha, corda, lampião e balança
//   C · TEATRINHO   — passadeira de veludo bordada a ouro, palquinhos com cortina e luzes de ribalta
// Cada direção devolve um "kit": tapete, expositor das peças, os quatro serviços e os enfeites.
// (Sem luzes novas: o número de luzes da cena não pode mudar; brilho é emissivo + halo.)

export type ShopStyle = 'A' | 'B' | 'C';
export const SHOP_STYLES: ShopStyle[] = ['A', 'B', 'C'];
export const SHOP_STYLE_NAME: Record<ShopStyle, string> = { A: 'Antiquário', B: 'Mascate', C: 'Teatrinho' };

export interface ShopKit {
  style: ShopStyle;
  rug: THREE.Group;
  /** expositor de uma oferta; `userData.top` = altura onde as peças ficam de pé */
  stand(w: number): THREE.Group;
  vial(): { g: THREE.Group; cork: THREE.Mesh; liquid: THREE.Mesh };
  candle(): { g: THREE.Group; flame: THREE.Group };
  anvil(): { g: THREE.Group; hammer: THREE.Group; top: THREE.Vector3 };
  bell(): { g: THREE.Group; dome: THREE.Mesh };
  /** enfeites de cena (já posicionados) */
  decor: THREE.Object3D[];
}

/** Direção de arte da Loja. O padrão do jogo é o Teatrinho (C); o laboratório (teclas 1/2/3/0 na Loja) troca. */
export function currentShopStyle(): ShopStyle | null {
  try {
    const s = localStorage.getItem('lab.shop');
    if (s === 'off') return null;
    return s === 'A' || s === 'B' ? s : 'C';
  } catch { return 'C'; }
}

// ---------- utilidades ----------
const M = P.M;
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true; o.receiveShadow = true;
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
const box = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
const cyl = (rt: number, rb: number, h: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);
const lathe = (pts: [number, number][], seg = 28) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Trama do tecido (relevo): fios cruzados, mais grossos na juta e finos no veludo. */
function weaveBump(key: string, pitch: number, rough: number): THREE.CanvasTexture {
  return once(`weave:${key}`, () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    const r = new Rng(31);
    for (let y = 0; y < S; y += pitch) for (let x = 0; x < S; x += pitch) {
      const over = ((x / pitch) + (y / pitch)) % 2 === 0;
      const v = 128 + (over ? 1 : -1) * (40 + r.float() * 40 * rough);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, pitch, pitch);
    }
    for (let i = 0; i < 900 * rough; i++) { const v = r.float() * 255; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(r.float() * S, r.float() * S, 1 + r.float() * 3, 1); }
    const t = tex(c, false);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/**
 * Tapete de verdade: malha fina com espessura, bordas que sobem e descem (rugas de pano solto), um canto
 * levemente dobrado e — se pedir — franja de fios nas pontas. O miolo fica plano para os itens assentarem.
 */
function rugMesh(w: number, d: number, map: THREE.Texture, opts: { tint: string; bump: THREE.Texture; bumpRepeat: number; bumpScale: number; wrinkle: number; curl: number; sheen?: string; fringe?: { color: string; len: number; ends: 'x' | 'all' }; fray?: number }): THREE.Group {
  const g = new THREE.Group();
  const sx = 96, sz = 48;
  const geo = new THREE.PlaneGeometry(w, d, sx, sz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const r = new Rng(9);
  const ph = [r.float() * 6, r.float() * 6, r.float() * 6, r.float() * 6];
  const height = (x: number, z: number): number => {
    const u = x / (w / 2), v = z / (d / 2);
    // 0 no miolo, 1 na borda
    const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 5);
    const wav = Math.sin(x * 2.1 + ph[0]) * Math.sin(z * 2.7 + ph[1]) + 0.6 * Math.sin(x * 5.3 + z * 3.1 + ph[2]);
    let y = 0.04 + edge * opts.wrinkle * (0.5 + 0.5 * wav);
    // canto da frente-direita dobrado para cima
    const cx = u - 0.86, cz = v - 0.8;
    if (cx > 0 && cz > 0) y += opts.curl * Math.pow(Math.min(1, (cx / 0.14) * (cz / 0.2)), 0.8);
    return y;
  };
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    // borda desfiada (manta): a beirada entra e sai
    if (opts.fray) {
      const onX = Math.abs(Math.abs(x) - w / 2) < 1e-4, onZ = Math.abs(Math.abs(z) - d / 2) < 1e-4;
      if (onX) x += Math.sign(x) * (r.float() - 0.6) * opts.fray;
      if (onZ) z += Math.sign(z) * (r.float() - 0.6) * opts.fray;
      pos.setX(i, x); pos.setZ(i, z);
    }
    pos.setY(i, height(x, z));
  }
  geo.computeVertexNormals();
  opts.bump.repeat.set(opts.bumpRepeat * (w / d), opts.bumpRepeat);
  const mat = new THREE.MeshPhysicalMaterial({ map, color: opts.tint, bumpMap: opts.bump, bumpScale: opts.bumpScale, roughness: 0.96, sheen: opts.sheen ? 0.35 : 0.12, sheenColor: new THREE.Color(opts.sheen ?? '#8a7a66'), sheenRoughness: 0.55 });
  const top = new THREE.Mesh(geo, mat);
  top.receiveShadow = true; top.castShadow = false;
  g.add(top);
  // sombra de contato: uma chapa escura um pouco menor por baixo (dá a espessura)
  const under = mesh(box(w - 0.08, 0.016, d - 0.08, 0.006), std('#0c0807', 1), g, 0, 0.009, 0);
  under.castShadow = true;
  // franja: um fio (triângulo fino) por nó, todos numa malha só
  if (opts.fringe) {
    const f = opts.fringe;
    const verts: number[] = [];
    const strand = (x: number, z: number, dx: number, dz: number) => {
      const len = f.len * (0.75 + r.float() * 0.5), wob = (r.float() - 0.5) * 0.05;
      const y0 = height(x, z);
      const px = -dz * 0.012, pz = dx * 0.012; // largura do fio, de lado
      const ex = x + dx * len + pz * wob * 40, ez = z + dz * len + px * wob * 40;
      verts.push(x - px, y0, z - pz, x + px, y0, z + pz, ex, 0.012, ez);
      verts.push(x + px, y0, z + pz, x - px, y0, z - pz, ex, 0.012, ez);
    };
    for (let z = -d / 2 + 0.03; z < d / 2; z += 0.045) { strand(-w / 2, z, -1, 0); strand(w / 2, z, 1, 0); }
    if (f.ends === 'all') for (let x = -w / 2 + 0.03; x < w / 2; x += 0.045) { strand(x, -d / 2, 0, -1); strand(x, d / 2, 0, 1); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: f.color, roughness: 1, side: THREE.DoubleSide }));
    fm.receiveShadow = true;
    g.add(fm);
  }
  return g;
}

// =====================================================================================
// A · ANTIQUÁRIO
// =====================================================================================
function persianMap(): THREE.CanvasTexture {
  return once('persian', () => {
    const W = 2048, H = 1024;
    const [c, g] = canvas(W, H);
    const r = new Rng(12);
    const red = '#6e1420', navy = '#152238', cream = '#d8c59a', gold = '#b8893a', teal = '#2c5a5a';
    g.fillStyle = navy; g.fillRect(0, 0, W, H);
    // faixas da borda (de fora para dentro): creme fina, azul com losangos, ouro fina, vermelha com flores
    const band = (inset: number, color: string) => { g.fillStyle = color; g.fillRect(inset, inset, W - inset * 2, H - inset * 2); };
    band(14, cream); band(26, navy); band(96, gold); band(106, red); band(170, cream); band(178, '#571019');
    // losangos na faixa azul
    const diamonds = (inset: number, size: number, step: number, a: string, b: string) => {
      const row = (x0: number, y0: number, dx: number, dy: number, n: number) => {
        for (let i = 0; i < n; i++) {
          const x = x0 + dx * i, y = y0 + dy * i;
          g.fillStyle = i % 2 ? a : b;
          g.beginPath(); g.moveTo(x, y - size); g.lineTo(x + size * 0.8, y); g.lineTo(x, y + size); g.lineTo(x - size * 0.8, y); g.closePath(); g.fill();
          g.fillStyle = navy; g.beginPath(); g.arc(x, y, size * 0.22, 0, Math.PI * 2); g.fill();
        }
      };
      const nx = Math.floor((W - inset * 2) / step), ny = Math.floor((H - inset * 2) / step);
      const ox = (W - nx * step) / 2 + step / 2, oy = (H - ny * step) / 2 + step / 2;
      row(ox, inset, step, 0, nx); row(ox, H - inset, step, 0, nx);
      row(inset, oy, 0, step, ny); row(W - inset, oy, 0, step, ny);
    };
    diamonds(61, 24, 62, cream, gold);
    diamonds(138, 17, 44, gold, teal);
    // campo: treliça de ramos
    g.strokeStyle = 'rgba(216,197,154,0.33)'; g.lineWidth = 3;
    for (let k = -20; k < 40; k++) {
      g.beginPath(); g.moveTo(178 + k * 86, 178); g.lineTo(178 + k * 86 + (H - 356), H - 178); g.stroke();
      g.beginPath(); g.moveTo(178 + k * 86, H - 178); g.lineTo(178 + k * 86 + (H - 356), 178); g.stroke();
    }
    g.save();
    g.beginPath(); g.rect(178, 178, W - 356, H - 356); g.clip();
    // florzinhas nos cruzamentos da treliça
    for (let i = 0; i < 26; i++) for (let j = 0; j < 9; j++) {
      const x = 178 + i * 86 - 20 + (j % 2) * 43, y = 200 + j * 86;
      g.fillStyle = (i + j) % 3 ? gold : teal;
      for (let p = 0; p < 4; p++) { const a = p * Math.PI / 2 + 0.78; g.beginPath(); g.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 8, 4.5, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = cream; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // medalhão central em camadas (estrela de 16 pontas)
    const star = (rad: number, inner: number, n: number, color: string) => {
      g.fillStyle = color; g.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? inner : rad; g.lineTo(W / 2 + Math.cos(a) * rr * 1.55, H / 2 + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    };
    star(250, 196, 16, navy); star(226, 180, 16, cream); star(206, 160, 16, '#8a1a26'); star(150, 96, 8, gold); star(108, 70, 8, navy); star(64, 34, 8, cream);
    g.fillStyle = red; g.beginPath(); g.ellipse(W / 2, H / 2, 30, 20, 0, 0, Math.PI * 2); g.fill();
    // pingentes do medalhão
    for (const s of [-1, 1]) { star(0, 0, 4, gold); g.fillStyle = gold; g.beginPath(); g.ellipse(W / 2 + s * 470, H / 2, 46, 26, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = navy; g.beginPath(); g.ellipse(W / 2 + s * 470, H / 2, 26, 13, 0, 0, Math.PI * 2); g.fill(); }
    // cantoneiras
    for (const [cx, cy] of [[178, 178], [W - 178, 178], [178, H - 178], [W - 178, H - 178]]) {
      g.fillStyle = navy; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 170, 0, Math.PI * 2); g.fill();
      g.fillStyle = gold; g.beginPath(); g.arc(cx, cy, 150, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a1a26'; g.beginPath(); g.arc(cx, cy, 132, 0, Math.PI * 2); g.fill();
      g.fillStyle = cream; g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.fill();
    }
    // refaz as faixas por cima das cantoneiras (elas só aparecem dentro do campo)
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.rect(178, 178, W - 356, H - 356); g.clip('evenodd');
    band(0, navy); band(14, cream); band(26, navy); band(96, gold); band(106, red); band(170, cream);
    diamonds(61, 24, 62, cream, gold); diamonds(138, 17, 44, gold, teal);
    g.restore();
    // fios da lã: riscos finos na direção da urdidura + desgaste no meio (onde se pisa)
    for (let i = 0; i < 26000; i++) { const v = r.float(); g.fillStyle = v > 0.5 ? 'rgba(255,235,200,0.06)' : 'rgba(0,0,0,0.09)'; g.fillRect(r.float() * W, r.float() * H, 1, 3 + r.float() * 7); }
    for (let i = 0; i < 40; i++) {
      const x = W * (0.2 + r.float() * 0.6), y = H * (0.25 + r.float() * 0.5), rad = 60 + r.float() * 160;
      const s = g.createRadialGradient(x, y, 0, x, y, rad);
      s.addColorStop(0, 'rgba(190,160,120,0.10)'); s.addColorStop(1, 'rgba(190,160,120,0)');
      g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return tex(c);
  });
}

function turnedPost(h: number, m: THREE.Material): THREE.Mesh {
  return mesh(lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.03, 0.05], [0.042, h * 0.3], [0.025, h * 0.45], [0.04, h * 0.7], [0.028, h * 0.86], [0.045, h * 0.9], [0.045, h * 0.94], [0, h]], 14), m);
}

function antiqueStand(w: number): THREE.Group {
  const g = new THREE.Group();
  const wood = once('mahogany', () => new THREE.MeshStandardMaterial({ map: woodTexture('#5c2c1a', '#200c06', 21), roughness: 0.38 }));
  // pés de bola de latão
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.055, 14, 10), M.brass(), g, sx * (w / 2 - 0.1), 0.05, sz * 0.3);
  // base com moldura em degraus
  mesh(box(w + 0.1, 0.05, 0.86, 0.02), wood, g, 0, 0.115, 0);
  mesh(box(w, 0.14, 0.76, 0.03), wood, g, 0, 0.2, 0);
  mesh(box(w + 0.06, 0.035, 0.82, 0.015), wood, g, 0, 0.285, 0);
  // filete de latão na frente
  mesh(box(w - 0.2, 0.018, 0.012, 0.004), M.brass(), g, 0, 0.2, 0.386);
  // almofada de veludo com botões
  const cushion = mesh(box(w - 0.14, 0.07, 0.6, 0.035), M.velvet(), g, 0, 0.33, 0.02);
  cushion.castShadow = false;
  for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.018, 8, 6), M.gold(), g, (i - 1.5) * (w - 0.5) / 3, 0.366, 0.24);
  // balaustrada torneada atrás
  const n = Math.max(3, Math.round(w / 0.42));
  for (let i = 0; i <= n; i++) { const p = turnedPost(0.34, wood); p.position.set(-w / 2 + 0.08 + (i / n) * (w - 0.16), 0.3, -0.33); g.add(p); }
  mesh(box(w, 0.04, 0.07, 0.015), wood, g, 0, 0.655, -0.33);
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.045, 12, 10), M.brass(), g, sx * (w / 2 - 0.08), 0.71, -0.33);
  g.userData.top = 0.365;
  return g;
}

/** Bandejinha de latão com borda (base dos serviços no Antiquário). */
function brassTray(rad: number): THREE.Mesh {
  return mesh(lathe([[0, 0], [rad, 0], [rad * 1.08, 0.012], [rad * 1.1, 0.04], [rad * 1.04, 0.045], [rad * 0.98, 0.02], [0, 0.02]], 36), M.brass());
}

function bookStack(): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#4a1a18', '#1e2e3a', '#3a3418'];
  let y = 0;
  cols.forEach((c, i) => {
    const w = 0.62 - i * 0.06, h = 0.09 + (i % 2) * 0.03;
    const b = new THREE.Group();
    mesh(box(w, h, 0.44, 0.012), std(c, 0.6), b, 0, h / 2, 0);
    mesh(box(w - 0.03, h - 0.03, 0.42, 0.004), std('#d9cba8', 0.9), b, 0.02, h / 2, 0.012);
    mesh(box(0.012, h + 0.002, 0.06, 0.002), M.gold(), b, -w / 2, h / 2, 0.1);
    b.position.y = y; b.rotation.y = (i - 1) * 0.22;
    g.add(b); y += h;
  });
  g.userData.top = y;
  return g;
}

function coinStack(n: number): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(n * 7 + 3);
  for (let i = 0; i < n; i++) { const c = mesh(cyl(0.075, 0.075, 0.018, 20), M.gold(), g, (r.float() - 0.5) * 0.02, 0.009 + i * 0.019, (r.float() - 0.5) * 0.02); c.castShadow = i === n - 1; }
  return g;
}

/** Lamparina a óleo acesa (só emissivo + halo). */
function oilLamp(): THREE.Group {
  const g = new THREE.Group();
  mesh(lathe([[0, 0], [0.16, 0], [0.17, 0.03], [0.06, 0.07], [0.05, 0.12], [0.15, 0.2], [0.17, 0.3], [0.1, 0.38], [0.07, 0.4], [0, 0.4]]), M.brass(), g);
  const glass = mesh(lathe([[0.07, 0.4], [0.13, 0.5], [0.14, 0.62], [0.08, 0.78], [0.06, 0.92]], 24), new THREE.MeshPhysicalMaterial({ color: '#ffe2b0', roughness: 0.08, transmission: 0.9, thickness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), g);
  glass.castShadow = false;
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glow('#ffb45a', 6));
  fl.scale.set(0.8, 1.9, 0.8); fl.position.y = 0.52;
  g.add(fl);
  const halo = P.glowSprite('#ff9a40', 1.5, 0.5);
  halo.position.y = 0.56;
  g.add(halo);
  return g;
}

function kitA(): ShopKit {
  const rug = rugMesh(11.2, 5.5, persianMap(), { tint: '#8f8880', bump: weaveBump('wool', 4, 0.6), bumpRepeat: 16, bumpScale: 1.4, wrinkle: 0.07, curl: 0.16, fringe: { color: '#cdbb92', len: 0.28, ends: 'x' } });
  const decor: THREE.Object3D[] = [];
  const books = bookStack(); books.position.set(-5.0, 0, -1.25); books.rotation.y = 0.35; decor.push(books);
  const lamp = oilLamp(); lamp.position.set(-5.0, books.userData.top, -1.25); decor.push(lamp);
  for (const [x, z, n] of [[5.05, -1.5, 9], [4.8, -1.32, 5], [5.15, -1.2, 3]] as const) { const c = coinStack(n); c.position.set(x, 0.03, z); decor.push(c); }
  return {
    style: 'A', rug, stand: antiqueStand, decor,
    vial() { const v = P.vial(); const tray = brassTray(0.34); v.g.add(tray); tray.position.y = 0; v.g.children.forEach((c) => { if (c !== tray) c.position.y += 0.03; }); v.g.scale.setScalar(1.25); return v; },
    candle() { const c = P.candle(0.55, 0.1, false); chamberstick(c.g, M.brass()); c.g.scale.setScalar(1.2); return c; },
    anvil() { return anvilOn(stump(0.56, 0.2, once('stumpA', () => new THREE.MeshStandardMaterial({ map: woodTexture('#5a3a22', '#1e1008', 11), roughness: 0.8 })), M.brassDark())); },
    bell() { const b = P.deskBell(); b.g.scale.setScalar(1.35); const cloth = mesh(box(0.8, 0.02, 0.8, 0.008), M.velvet(), b.g, 0, -0.005, 0); cloth.rotation.y = Math.PI / 4; cloth.castShadow = false; return b; },
  };
}

// ---------- serviços (compartilhados, com base diferente em cada direção) ----------
/** Castiçal de mão: pratinho com aba e argola (a vela fica em cima). */
function chamberstick(candle: THREE.Group, m: THREE.Material) {
  for (const c of candle.children) c.position.y += 0.07;
  mesh(lathe([[0, 0], [0.2, 0], [0.26, 0.03], [0.27, 0.055], [0.22, 0.04], [0.13, 0.03], [0.13, 0.09], [0.12, 0.1], [0, 0.1]], 32), m, candle);
  const ring = mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20), m, candle, 0.31, 0.06, 0);
  ring.rotation.x = Math.PI / 2;
}

/** Toco/base debaixo da bigorna. */
function stump(rad: number, h: number, m: THREE.Material, band: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(rad * 0.96, rad, h, 22), m, g, 0, h / 2, 0);
  mesh(cyl(rad * 0.985, rad * 0.985, 0.04, 22, ), band, g, 0, h * 0.72, 0);
  g.userData.top = h;
  return g;
}
function anvilOn(base: THREE.Group): { g: THREE.Group; hammer: THREE.Group; top: THREE.Vector3 } {
  const a = P.anvilAndHammer();
  const h = base.userData.top as number;
  for (const c of a.g.children) c.position.y += h;
  a.g.add(base);
  a.top.y += h;
  return a;
}

// =====================================================================================
// B · MASCATE
// =====================================================================================
function patchworkMap(): THREE.CanvasTexture {
  return once('patchwork', () => {
    const W = 2048, H = 1024;
    const [c, g] = canvas(W, H);
    const r = new Rng(44);
    g.fillStyle = '#8f7650'; g.fillRect(0, 0, W, H);
    // juta: fios cruzados irregulares
    for (let y = 0; y < H; y += 5) { g.fillStyle = `rgba(${40 + r.float() * 40},${28 + r.float() * 30},10,${0.12 + r.float() * 0.14})`; g.fillRect(0, y, W, 2); }
    for (let x = 0; x < W; x += 5) { g.fillStyle = `rgba(${200 + r.float() * 40},${180 + r.float() * 30},130,${0.05 + r.float() * 0.1})`; g.fillRect(x, 0, 2, H); }
    // listras largas desbotadas (manta de carroça)
    for (const [y, h, col] of [[120, 70, 'rgba(110,30,28,0.55)'], [205, 22, 'rgba(30,50,60,0.5)'], [H - 190, 70, 'rgba(110,30,28,0.55)'], [H - 227, 22, 'rgba(30,50,60,0.5)']] as const) { g.fillStyle = col; g.fillRect(0, y, W, h); }
    // remendos costurados
    const cols = ['#5d6b3a', '#7a3326', '#3d4f5c', '#b08a3c', '#6a4a6a', '#9a8f78', '#4a3020'];
    const patches: [number, number, number, number, number][] = [[250, 300, 300, 220, -0.08], [760, 560, 260, 240, 0.1], [1250, 250, 340, 200, 0.05], [1640, 610, 250, 250, -0.12], [1050, 700, 180, 150, 0.2], [420, 690, 210, 170, -0.15], [1750, 260, 170, 150, 0.12]];
    patches.forEach(([x, y, pw, ph, rot], i) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-pw / 2 + 5, -ph / 2 + 7, pw, ph);
      g.fillStyle = cols[i % cols.length]; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      // estampa do retalho
      g.globalAlpha = 0.28; g.fillStyle = '#f0e0c0';
      if (i % 3 === 0) for (let k = -pw; k < pw; k += 26) g.fillRect(k, -ph / 2, 9, ph);
      else if (i % 3 === 1) for (let a = -pw / 2 + 20; a < pw / 2; a += 40) for (let b = -ph / 2 + 20; b < ph / 2; b += 40) { g.beginPath(); g.arc(a, b, 7, 0, Math.PI * 2); g.fill(); }
      else { for (let k = -ph; k < ph; k += 30) g.fillRect(-pw / 2, k, pw, 8); for (let k = -pw; k < pw; k += 30) g.fillRect(k, -ph / 2, 8, ph); }
      g.globalAlpha = 1;
      for (let k = 0; k < 500; k++) { g.fillStyle = r.float() > 0.5 ? 'rgba(255,240,210,0.07)' : 'rgba(0,0,0,0.1)'; g.fillRect(-pw / 2 + r.float() * pw, -ph / 2 + r.float() * ph, 2, 5); }
      // pontos de costura grossos (linha crua), tortos
      g.strokeStyle = '#e8dcc0'; g.lineWidth = 5; g.lineCap = 'round';
      const st = (x0: number, y0: number, x1: number, y1: number) => {
        const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 30);
        for (let k = 0; k < n; k++) {
          const t0 = (k + 0.2) / n, t1 = (k + 0.75) / n, j = (r.float() - 0.5) * 7;
          g.beginPath(); g.moveTo(x0 + (x1 - x0) * t0 + j, y0 + (y1 - y0) * t0 + j); g.lineTo(x0 + (x1 - x0) * t1 - j, y0 + (y1 - y0) * t1 - j); g.stroke();
        }
      };
      const ix = pw / 2 - 12, iy = ph / 2 - 12;
      st(-ix, -iy, ix, -iy); st(ix, -iy, ix, iy); st(ix, iy, -ix, iy); st(-ix, iy, -ix, -iy);
      g.restore();
    });
    // manchas e sujeira de estrada
    for (let i = 0; i < 90; i++) {
      const x = r.float() * W, y = r.float() * H, rad = 30 + r.float() * 140;
      const s = g.createRadialGradient(x, y, 0, x, y, rad);
      s.addColorStop(0, `rgba(40,26,12,${0.06 + r.float() * 0.1})`); s.addColorStop(1, 'rgba(40,26,12,0)');
      g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return tex(c);
  });
}

function strawTexture(): THREE.CanvasTexture {
  return once('straw', () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = new Rng(8);
    g.fillStyle = '#6e5a26'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const x = r.float() * S, y = r.float() * S, a = r.float() * Math.PI, len = 14 + r.float() * 40;
      g.strokeStyle = `rgb(${170 + r.float() * 70},${140 + r.float() * 60},${50 + r.float() * 50})`;
      g.lineWidth = 1 + r.float() * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    return tex(c);
  });
}

function crateStand(w: number): THREE.Group {
  const g = new THREE.Group();
  const wood = once('crateM', () => new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 }));
  const plank = once('plankM', () => new THREE.MeshStandardMaterial({ map: woodTexture('#6a5236', '#2a1c10', 14), roughness: 0.9 }));
  const H = 0.34, D = 0.84, T = 0.05;
  mesh(box(w, 0.04, D, 0.01), plank, g, 0, 0.02, 0);
  // ripas dos lados (duas por lado, com fresta)
  for (const [y, hh] of [[0.11, 0.12], [0.26, 0.12]] as const) {
    mesh(box(w, hh, T, 0.012), plank, g, 0, y, D / 2 - T / 2).rotation.z = (y > 0.2 ? 0.006 : -0.004);
    mesh(box(w, hh, T, 0.012), plank, g, 0, y, -D / 2 + T / 2);
    for (const sx of [-1, 1]) mesh(box(T, hh, D - T * 2, 0.012), plank, g, sx * (w / 2 - T / 2), y, 0);
  }
  // cantoneiras e pregos
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesh(box(0.07, H, 0.07, 0.012), wood, g, sx * (w / 2 - 0.02), H / 2, sz * (D / 2 - 0.02));
    for (const y of [0.11, 0.26]) mesh(new THREE.SphereGeometry(0.012, 6, 5), M.ironDark(), g, sx * (w / 2 - 0.02), y, sz * (D / 2 + 0.016));
  }
  // palha transbordando
  const straw = new THREE.MeshStandardMaterial({ map: strawTexture(), color: '#8a8070', roughness: 1 });
  const bed = mesh(box(w - 0.12, 0.1, D - 0.12, 0.04), straw, g, 0, 0.27, 0);
  bed.castShadow = false;
  const r = new Rng(Math.round(w * 100));
  const tuft = new THREE.ConeGeometry(0.012, 0.3, 4);
  const tufts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const t = tuft.clone();
    t.rotateZ((r.float() - 0.5) * 2.6); t.rotateY(r.float() * 6);
    const edge = r.float() > 0.5;
    t.translate((r.float() - 0.5) * (w - 0.1), 0.33 + r.float() * 0.05, edge ? (r.float() > 0.5 ? 1 : -1) * (D / 2 - 0.04) : (r.float() - 0.5) * D * 0.8);
    tufts.push(t);
  }
  const tm = new THREE.Mesh(mergeGeometries(tufts), new THREE.MeshStandardMaterial({ color: '#8f7636', roughness: 1 }));
  tm.castShadow = false; tm.receiveShadow = true;
  g.add(tm);
  // alça de corda na frente
  const rope = mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 16, Math.PI), ropeMat(), g, 0, 0.2, D / 2 + 0.012);
  rope.rotation.z = Math.PI;
  g.userData.top = 0.315;
  return g;
}

const ropeMat = () => once('rope', () => new THREE.MeshStandardMaterial({ color: '#a88a55', roughness: 1 }));

function ropeCoil(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const t = mesh(new THREE.TorusGeometry(0.3 - i * 0.02, 0.035, 8, 28), ropeMat(), g, (i % 2) * 0.02, 0.035 + i * 0.06, 0); t.rotation.x = Math.PI / 2 + (i % 2 ? 0.05 : -0.04); }
  return g;
}

/** Lampião de ferro com vidro e chama (emissivo). */
function lantern(): THREE.Group {
  const g = new THREE.Group();
  const iron = M.ironDark();
  mesh(cyl(0.2, 0.22, 0.06, 6), iron, g, 0, 0.03, 0);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; mesh(cyl(0.012, 0.012, 0.5, 5), iron, g, Math.cos(a) * 0.18, 0.31, Math.sin(a) * 0.18); }
  const glass = mesh(cyl(0.16, 0.16, 0.5, 6, ), new THREE.MeshPhysicalMaterial({ color: '#ffd9a0', roughness: 0.15, transmission: 0.85, thickness: 0.05, transparent: true, opacity: 0.4 }), g, 0, 0.31, 0);
  glass.castShadow = false;
  mesh(new THREE.ConeGeometry(0.25, 0.18, 6), iron, g, 0, 0.65, 0);
  const ring = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14), iron, g, 0, 0.8, 0);
  void ring;
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glow('#ffb45a', 6));
  fl.scale.set(0.8, 2, 0.8); fl.position.y = 0.22;
  g.add(fl);
  const halo = P.glowSprite('#ff9a40', 1.7, 0.5);
  halo.position.y = 0.3;
  g.add(halo);
  return g;
}

/** Balança de pratos (enfeite). */
function scale(): THREE.Group {
  const g = new THREE.Group();
  const br = M.brassDark();
  mesh(lathe([[0, 0], [0.2, 0], [0.21, 0.03], [0.06, 0.06], [0.03, 0.1], [0.03, 0.72], [0.05, 0.75], [0, 0.78]], 18), br, g);
  const beam = new THREE.Group();
  beam.position.y = 0.72; beam.rotation.z = 0.12;
  g.add(beam);
  mesh(box(0.86, 0.025, 0.03, 0.008), br, beam);
  for (const s of [-1, 1]) {
    const pan = new THREE.Group();
    pan.position.set(s * 0.41, 0, 0); pan.rotation.z = -0.12;
    beam.add(pan);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const l = mesh(cyl(0.004, 0.004, 0.36, 4), br, pan, Math.cos(a) * 0.07, -0.17, Math.sin(a) * 0.07); l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
    mesh(lathe([[0, 0], [0.12, 0.01], [0.15, 0.04], [0.14, 0.045], [0, 0.02]], 20), M.brass(), pan, 0, -0.38, 0);
    if (s < 0) for (let k = 0; k < 3; k++) mesh(cyl(0.04, 0.04, 0.014, 12), M.gold(), pan, (k - 1) * 0.03, -0.35 + k * 0.015, 0);
  }
  return g;
}

function sack(): THREE.Group {
  const g = new THREE.Group();
  const jute = once('juteM', () => new THREE.MeshStandardMaterial({ color: '#9a7f52', roughness: 1, bumpMap: weaveBump('jute', 8, 1), bumpScale: 2 }));
  const body = mesh(lathe([[0, 0], [0.24, 0.02], [0.3, 0.16], [0.27, 0.34], [0.12, 0.45], [0.08, 0.47], [0.14, 0.56], [0.12, 0.6], [0, 0.56]], 18), jute, g);
  body.scale.set(1, 1, 0.85);
  const tie = mesh(new THREE.TorusGeometry(0.085, 0.016, 6, 14), ropeMat(), g, 0, 0.46, 0);
  tie.rotation.x = Math.PI / 2;
  return g;
}

function kitB(): ShopKit {
  const rug = rugMesh(11.4, 5.6, patchworkMap(), { tint: '#7d7468', bump: weaveBump('jute', 8, 1), bumpRepeat: 22, bumpScale: 2.6, wrinkle: 0.11, curl: 0.2, fray: 0.07, fringe: { color: '#a48a5c', len: 0.1, ends: 'all' } });
  const decor: THREE.Object3D[] = [];
  const ln = lantern(); ln.position.set(-5.05, 0.04, -1.35); decor.push(ln);
  const coil = ropeCoil(); coil.position.set(5.0, 0.04, -1.4); decor.push(coil);
  const sc = scale(); sc.position.set(5.05, 0.04, 0.55); sc.rotation.y = -0.5; sc.scale.setScalar(1.15); decor.push(sc);
  const sk = sack(); sk.position.set(-5.05, 0.04, 0.5); sk.scale.setScalar(1.3); decor.push(sk);
  const plank = () => once('plankM2', () => new THREE.MeshStandardMaterial({ map: woodTexture('#6a5236', '#2a1c10', 14), roughness: 0.9 }));
  /** tampa de caixote (base dos serviços) */
  const lid = (s: number) => { const l = new THREE.Group(); for (let i = -1; i <= 1; i++) mesh(box(s * 0.31, 0.035, s, 0.008), plank(), l, i * s * 0.33, 0.018, 0); for (const z of [-1, 1]) mesh(box(s, 0.03, 0.07, 0.008), M.woodDark(), l, 0, 0.045, z * s * 0.33); return l; };
  return {
    style: 'B', rug, stand: crateStand, decor,
    vial() { const v = P.vial(); const l = lid(0.72); v.g.children.forEach((c) => { c.position.y += 0.035; }); v.g.add(l); const tag = mesh(box(0.16, 0.004, 0.1, 0.002), M.parchment(), v.g, 0.2, 0.45, 0.12); tag.rotation.set(0.3, 0.4, 1.2); v.g.scale.setScalar(1.25); return v; },
    candle() { const c = P.candle(0.5, 0.1, false); chamberstick(c.g, M.ironDark()); c.g.scale.setScalar(1.2); return c; },
    anvil() { return anvilOn(stump(0.52, 0.3, once('stumpB', () => new THREE.MeshStandardMaterial({ map: woodTexture('#7a5a36', '#2e1c0e', 5), roughness: 0.95 })), M.ironDark())); },
    bell() { const b = P.deskBell(); b.g.children.forEach((c) => { c.position.y += 0.035; }); b.g.add(lid(0.7)); b.g.scale.setScalar(1.3); return b; },
  };
}

// =====================================================================================
// C · TEATRINHO
// =====================================================================================
function theatreMap(): THREE.CanvasTexture {
  return once('theatre', () => {
    const W = 2048, H = 1024;
    const [c, g] = canvas(W, H);
    const r = new Rng(71);
    const grd = g.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.62);
    grd.addColorStop(0, '#3a1244'); grd.addColorStop(1, '#170819');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const gold = '#d9a94a', gold2 = '#8f6a26';
    // xadrez de arlequim bem apagado no campo
    g.save(); g.beginPath(); g.rect(120, 120, W - 240, H - 240); g.clip();
    for (let i = -4; i < 30; i++) for (let j = -2; j < 14; j++) {
      if ((i + j) % 2) continue;
      const x = i * 80 + (j % 2) * 0, y = j * 80;
      g.fillStyle = 'rgba(120,40,110,0.16)';
      g.beginPath(); g.moveTo(x, y + 80); g.lineTo(x + 80, y); g.lineTo(x + 160, y + 80); g.lineTo(x + 80, y + 160); g.closePath(); g.fill();
    }
    g.restore();
    // barra bordada: duas linhas e uma grega de arcos (lambrequim)
    g.strokeStyle = gold; g.lineWidth = 10; g.strokeRect(40, 40, W - 80, H - 80);
    g.strokeStyle = gold2; g.lineWidth = 4; g.strokeRect(62, 62, W - 124, H - 124);
    g.strokeStyle = gold; g.lineWidth = 5;
    const scallop = (x0: number, y0: number, dx: number, dy: number, n: number, flip: number) => {
      for (let i = 0; i < n; i++) {
        const cx = x0 + dx * (i + 0.5), cy = y0 + dy * (i + 0.5);
        g.beginPath();
        if (dx) g.arc(cx, cy, dx / 2, flip > 0 ? 0 : Math.PI, flip > 0 ? Math.PI : Math.PI * 2);
        else g.arc(cx, cy, dy / 2, flip > 0 ? -Math.PI / 2 : Math.PI / 2, flip > 0 ? Math.PI / 2 : Math.PI * 1.5);
        g.stroke();
        g.fillStyle = gold; g.beginPath(); g.arc(cx + (dx ? 0 : flip * dy * 0.5), cy + (dx ? flip * dx * 0.5 : 0), 6, 0, Math.PI * 2); g.fill();
      }
    };
    const n = 26, step = (W - 124) / n, m = Math.round((H - 124) / step), stepY = (H - 124) / m;
    scallop(62, 62, step, 0, n, 1); scallop(62, H - 62, step, 0, n, -1);
    scallop(62, 62, 0, stepY, m, 1); scallop(W - 62, 62, 0, stepY, m, -1);
    // estrelas bordadas espalhadas
    const star = (x: number, y: number, rad: number, alpha: number) => {
      g.fillStyle = `rgba(217,169,74,${alpha})`; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? rad * 0.42 : rad; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    };
    for (let i = 0; i < 70; i++) star(170 + r.float() * (W - 340), 170 + r.float() * (H - 340), 5 + r.float() * 13, 0.35 + r.float() * 0.5);
    // sol/olho no centro (o dono está sempre olhando)
    g.strokeStyle = gold; g.lineWidth = 6;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r0 = 120, r1 = i % 2 ? 165 : 200; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r0 * 1.5, H / 2 + Math.sin(a) * r0); g.lineTo(W / 2 + Math.cos(a) * r1 * 1.5, H / 2 + Math.sin(a) * r1); g.stroke(); }
    g.beginPath(); g.ellipse(W / 2, H / 2, 150, 100, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(W / 2 - 110, H / 2); g.quadraticCurveTo(W / 2, H / 2 - 82, W / 2 + 110, H / 2); g.quadraticCurveTo(W / 2, H / 2 + 82, W / 2 - 110, H / 2); g.stroke();
    g.fillStyle = gold; g.beginPath(); g.arc(W / 2, H / 2, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#170819'; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, Math.PI * 2); g.fill();
    // pelo do veludo: manchas claras/escuras de "passar a mão"
    for (let i = 0; i < 120; i++) {
      const x = r.float() * W, y = r.float() * H, rad = 40 + r.float() * 160;
      const s = g.createRadialGradient(x, y, 0, x, y, rad);
      const lightUp = r.float() > 0.5;
      s.addColorStop(0, lightUp ? 'rgba(200,120,210,0.07)' : 'rgba(0,0,0,0.13)'); s.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return tex(c);
  });
}

/** Meia cortina franzida (painel ondulado que se abre para um lado). */
function drape(w: number, h: number, side: number, m: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, 24, 10);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const v = THREE.MathUtils.clamp((y + h / 2) / h, 0, 1); // 0 embaixo, 1 em cima
    const u = THREE.MathUtils.clamp((x * side + w / 2) / w, 0, 1); // 0 na borda de fora, 1 na de dentro
    // presa em cima, puxada para o lado de fora embaixo (amarrada)
    const pull = Math.pow(1 - v, 1.4) * u * 0.62;
    pos.setX(i, x - side * pull * w);
    pos.setZ(i, Math.sin(u * 16) * 0.035 * (0.5 + v * 0.5) + 0.02);
  }
  geo.computeVertexNormals();
  return mesh(geo, m);
}

function stageStand(w: number): THREE.Group {
  const g = new THREE.Group();
  const red = once('stageRed', () => new THREE.MeshStandardMaterial({ color: '#7a1220', roughness: 0.5 }));
  const curtain = once('curtainM', () => new THREE.MeshPhysicalMaterial({ color: '#8a1424', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ff7a8a'), sheenRoughness: 0.4, side: THREE.DoubleSide }));
  const boards = once('stageBoards', () => new THREE.MeshStandardMaterial({ map: woodTexture('#6a4426', '#22130a', 33), roughness: 0.55 }));
  // palco: caixa vermelha com moldura dourada e tablado de madeira
  mesh(box(w, 0.24, 0.84, 0.02), red, g, 0, 0.12, 0);
  mesh(box(w + 0.05, 0.03, 0.89, 0.012), M.gold(), g, 0, 0.018, 0);
  mesh(box(w + 0.05, 0.03, 0.89, 0.012), M.gold(), g, 0, 0.245, 0);
  mesh(box(w - 0.04, 0.02, 0.8, 0.006), boards, g, 0, 0.268, 0);
  // losangos dourados na frente
  for (let i = 0; i < Math.round(w / 0.36); i++) { const d = mesh(box(0.09, 0.09, 0.012, 0.004), M.gold(), g, -w / 2 + 0.2 + i * 0.36, 0.13, 0.422); d.rotation.z = Math.PI / 4; }
  // luzes de ribalta: conchas de latão com lâmpada acesa (emissivo)
  const nb = Math.max(4, Math.round(w / 0.3));
  for (let i = 0; i < nb; i++) {
    const x = -w / 2 + 0.16 + (i / (nb - 1)) * (w - 0.32);
    const shell = mesh(new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI), M.brass(), g, x, 0.3, 0.37);
    shell.rotation.y = Math.PI;
    shell.castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow('#ffd88a', 5));
    bulb.position.set(x, 0.3, 0.355);
    g.add(bulb);
  }
  const wash = P.glowSprite('#ffb860', w * 0.9, 0.16);
  wash.position.set(0, 0.5, 0.3);
  g.add(wash);
  // boca de cena: duas colunas, arco e cortinas
  const AH = 1.55;
  for (const s of [-1, 1]) {
    mesh(cyl(0.05, 0.06, AH, 12), M.gold(), g, s * (w / 2 - 0.07), 0.27 + AH / 2, -0.34);
    mesh(new THREE.SphereGeometry(0.075, 12, 10), M.gold(), g, s * (w / 2 - 0.07), 0.27 + AH + 0.06, -0.34);
    const dr = drape(w * 0.5, AH - 0.06, s, curtain);
    dr.position.set(s * w * 0.235, 0.27 + AH / 2 - 0.03, -0.33);
    g.add(dr);
    const tie = mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 12), M.gold(), g, s * (w / 2 - 0.13), 0.62, -0.3);
    tie.rotation.y = Math.PI / 2;
  }
  // fundo escuro estrelado (dá contraste para as peças)
  const back = mesh(new THREE.PlaneGeometry(w - 0.16, AH), std('#0d0612', 1), g, 0, 0.27 + AH / 2, -0.36);
  back.castShadow = false;
  // lambrequim: barra em cima com arcos
  mesh(box(w + 0.02, 0.16, 0.09, 0.02), red, g, 0, 0.27 + AH - 0.02, -0.33);
  mesh(box(w + 0.06, 0.03, 0.12, 0.01), M.gold(), g, 0, 0.27 + AH + 0.07, -0.33);
  const ns = Math.max(3, Math.round(w / 0.42));
  for (let i = 0; i < ns; i++) {
    const sc = mesh(new THREE.CylinderGeometry(w / ns / 2, w / ns / 2, 0.03, 16, 1, false, 0, Math.PI), curtain, g, -w / 2 + (i + 0.5) * (w / ns), 0.27 + AH - 0.1, -0.3);
    sc.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    mesh(new THREE.SphereGeometry(0.022, 8, 6), M.gold(), g, -w / 2 + (i + 0.5) * (w / ns), 0.27 + AH - 0.1 - w / ns / 2 - 0.01, -0.285);
  }
  g.userData.top = 0.278;
  g.userData.tagY = 2.12;
  return g;
}

/** Tamborete de circo (base dos serviços no Teatrinho). */
function drum(rad: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const [c, cg] = once('drumTex', () => {
    const [cc, x] = canvas(512, 64);
    x.fillStyle = '#7a1220'; x.fillRect(0, 0, 512, 64);
    x.fillStyle = '#e8dcc0';
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 32, 0); x.closePath(); x.fill(); }
    return [cc, x] as [HTMLCanvasElement, CanvasRenderingContext2D];
  });
  void cg;
  const side = once('drumM', () => { const t = tex(c); t.wrapS = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }); });
  mesh(cyl(rad, rad * 0.86, h, 28), side, g, 0, h / 2, 0);
  mesh(cyl(rad * 1.03, rad * 1.03, 0.03, 28), M.gold(), g, 0, h - 0.015, 0);
  mesh(cyl(rad * 0.89, rad * 0.89, 0.03, 28), M.gold(), g, 0, 0.015, 0);
  const top = mesh(cyl(rad * 0.98, rad * 0.98, 0.012, 28), M.velvet(), g, 0, h + 0.004, 0);
  top.castShadow = false;
  g.userData.top = h + 0.01;
  return g;
}

function ticketRoll(): THREE.Group {
  const g = new THREE.Group();
  const paper = std('#d8b24a', 0.8);
  const roll = mesh(cyl(0.16, 0.16, 0.1, 24), paper, g, 0, 0.16, 0);
  roll.rotation.x = Math.PI / 2;
  mesh(cyl(0.05, 0.05, 0.102, 12), std('#3a2a18', 0.9), g, 0, 0.16, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) { const t = mesh(box(0.22, 0.006, 0.1, 0.002), paper, g, 0.2 + i * 0.215, 0.012 + Math.sin(i * 1.3) * 0.008, 0.01 * i); t.rotation.y = i * 0.07; }
  return g;
}

function juggleBalls(): THREE.Group {
  const g = new THREE.Group();
  const cols = ['#b0202c', '#d9a94a', '#2c6a7a'];
  cols.forEach((c, i) => {
    const b = mesh(new THREE.SphereGeometry(0.13, 18, 14), std(c, 0.45), g, Math.cos(i * 2.1) * 0.16, 0.13 + (i === 2 ? 0.2 : 0), Math.sin(i * 2.1) * 0.16);
    const band = mesh(new THREE.TorusGeometry(0.131, 0.012, 6, 24), M.gold(), b);
    band.rotation.x = Math.PI / 2 + i;
  });
  return g;
}

/**
 * Passadeira de veludo bordada a ouro (o pano de todos os eventos do Teatrinho), com borlas de fio
 * deitadas na mesa ao longo da frente e do fundo.
 */
export function theatreRug(w: number, d: number, tint = '#9a8fa0'): THREE.Group {
  const rug = rugMesh(w, d, theatreMap(), { tint, bump: weaveBump('velvet', 2, 0.35), bumpRepeat: 30, bumpScale: 0.6, wrinkle: 0.05, curl: 0.12, sheen: '#7a3a8a' });
  // borla: cabecinha amarrada + saia de fios que abre (perfil torneado, deitado para fora do pano)
  const tassel = lathe([[0, 0], [0.018, 0], [0.028, 0.02], [0.014, 0.04], [0.03, 0.06], [0.044, 0.2], [0.03, 0.21], [0, 0.2]], 10);
  tassel.rotateX(Math.PI / 2);
  const ts: THREE.BufferGeometry[] = [];
  const n = Math.round(w / 0.42);
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
    const t = tassel.clone();
    if (s < 0) t.rotateY(Math.PI);
    t.rotateY(Math.sin(i * 7.3 + s) * 0.25);
    t.translate(-w / 2 + (i / n) * w, 0.045, s * (d / 2 - 0.02));
    ts.push(t);
  }
  const tm = new THREE.Mesh(mergeGeometries(ts), std('#b08a34', 0.85));
  tm.castShadow = true; tm.receiveShadow = true;
  rug.add(tm);
  return rug;
}

/** Pedestal do Teatrinho: tamborete alto de circo (no lugar do pedestal de pedra). */
export function theatrePedestal(): THREE.Group {
  return drum(0.44, 0.82);
}

function kitC(): ShopKit {
  const rug = theatreRug(11.2, 5.5);
  const decor: THREE.Object3D[] = [];
  const tk = ticketRoll(); tk.position.set(-5.2, 0.04, -1.45); tk.rotation.y = 0.3; decor.push(tk);
  const jb = juggleBalls(); jb.position.set(5.05, 0.04, -1.4); decor.push(jb);
  return {
    style: 'C', rug, stand: stageStand, decor,
    vial() { const v = P.vial(); const d = drum(0.36, 0.2); const h = d.userData.top as number; v.g.children.forEach((c) => { c.position.y += h; }); v.g.add(d); v.g.scale.setScalar(1.2); return v; },
    candle() { const c = P.candle(0.5, 0.1, false); chamberstick(c.g, M.gold()); const d = drum(0.36, 0.2); const h = d.userData.top as number; c.g.children.forEach((x) => { x.position.y += h; }); c.g.add(d); c.g.scale.setScalar(1.15); return c; },
    anvil() { const d = drum(0.6, 0.22); return anvilOn(d); },
    bell() { const b = P.deskBell(); const d = drum(0.36, 0.2); const h = d.userData.top as number; b.g.children.forEach((c) => { c.position.y += h; }); b.g.add(d); b.g.scale.setScalar(1.25); return b; },
  };
}

export function shopKit(style: ShopStyle): ShopKit {
  return style === 'A' ? kitA() : style === 'B' ? kitB() : kitC();
}
