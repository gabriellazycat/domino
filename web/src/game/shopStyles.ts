import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { glow, std } from './models';
import { woodTexture } from './textures';
import * as P from './props';

// Cenário da Loja (TEATRINHO): passadeira de veludo bordada a ouro, palquinhos com cortina e luzes de ribalta.
// O "kit" traz o tapete, o expositor das peças, os quatro serviços e os enfeites.
// (Sem luzes novas: o número de luzes da cena não pode mudar; brilho é emissivo + halo.)

export interface ShopKit {
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

// ---------- serviços ----------
/** Castiçal de mão: pratinho com aba e argola (a vela fica em cima). */
function chamberstick(candle: THREE.Group, m: THREE.Material) {
  for (const c of candle.children) c.position.y += 0.07;
  mesh(lathe([[0, 0], [0.2, 0], [0.26, 0.03], [0.27, 0.055], [0.22, 0.04], [0.13, 0.03], [0.13, 0.09], [0.12, 0.1], [0, 0.1]], 32), m, candle);
  const ring = mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 20), m, candle, 0.31, 0.06, 0);
  ring.rotation.x = Math.PI / 2;
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
    // larguras que não se cruzam no centro (antes 0.5w a ±0.235w: sobrepunha 0.03w, ondas quase coplanares)
    const dr = drape(w * 0.47, AH - 0.06, s, curtain);
    dr.position.set(s * w * 0.255, 0.27 + AH / 2 - 0.03, -0.33);
    dr.receiveShadow = false; // pano de dupla face + spot que balança = acne tremendo; não recebe sombra
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
    const sc = mesh(new THREE.CylinderGeometry(w / ns / 2, w / ns / 2, 0.03, 16, 1, false, 0, Math.PI), curtain, g, -w / 2 + (i + 0.5) * (w / ns), 0.27 + AH - 0.1, -0.262);
    // z=-0.262 (meia espessura 0.015): a face de trás fica dentro da caixa do lambrequim (frente em -0.285),
    // em vez de coincidir com ela como em -0.30
    sc.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    sc.receiveShadow = false;
    mesh(new THREE.SphereGeometry(0.022, 8, 6), M.gold(), g, -w / 2 + (i + 0.5) * (w / ns), 0.27 + AH - 0.1 - w / ns / 2 - 0.01, -0.25);
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

export function shopKit(): ShopKit {
  const rug = theatreRug(11.2, 5.5);
  const decor: THREE.Object3D[] = [];
  const tk = ticketRoll(); tk.position.set(-5.2, 0.04, -1.45); tk.rotation.y = 0.3; decor.push(tk);
  const jb = juggleBalls(); jb.position.set(5.05, 0.04, -1.4); decor.push(jb);
  return {
    rug, stand: stageStand, decor,
    vial() { const v = P.vial(); const d = drum(0.36, 0.2); const h = d.userData.top as number; v.g.children.forEach((c) => { c.position.y += h; }); v.g.add(d); v.g.scale.setScalar(1.2); return v; },
    candle() { const c = P.candle(0.5, 0.1, false); chamberstick(c.g, M.gold()); const d = drum(0.36, 0.2); const h = d.userData.top as number; c.g.children.forEach((x) => { x.position.y += h; }); c.g.add(d); c.g.scale.setScalar(1.15); return c; },
    anvil() { const d = drum(0.6, 0.22); return anvilOn(d); },
    bell() { const b = P.deskBell(); const d = drum(0.36, 0.2); const h = d.userData.top as number; b.g.children.forEach((c) => { c.position.y += h; }); b.g.add(d); b.g.scale.setScalar(1.25); return b; },
  };
}
