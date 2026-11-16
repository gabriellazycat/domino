import * as THREE from 'three';
import { laca } from './vilaoLaca';

// Trajes do dono da mesa: o mesmo boneco (T7B) troca de figurino conforme o lugar, como a troca de máscara.
// Tudo em peças simples de laca (a mesma linguagem dos soldadinhos), no espaço do boneco:
//   y = cima (topo do crânio ~1,2; topete até 1,5), z = frente (ponta do nariz ~1,07), olhos em (±0,32, 0,13).
// `hideHair`: o chapéu cobre o topo e o topete (que furaria a copa) some.
// `suit` / `bow`: recolorem o paletó e a gravata assados na textura (shader do material do corpo).

export interface Traje {
  id: string;
  nome: string;
  group: THREE.Group;
  hideHair: boolean;
  suit?: string;
  bow?: string;
}

const GOLD = () => laca('#d6a646', 0.25, 0.85);
const WHITE = () => laca('#efe7d6', 0.4);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, solid = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.userData.solid = solid; // as cordas da marionete desviam (ou saem do topo) destas peças
  parent.add(o);
  return o;
}

/** Copa + aba de chapéu (cartola, coco, coveiro...). `y0` = altura da aba. */
function hat(parent: THREE.Object3D, o: { y0: number; r: number; h: number; brim: number; color: string; band?: string; bandH?: number; dome?: boolean; taper?: number }) {
  const g = new THREE.Group(); g.position.set(0, o.y0, -0.04); parent.add(g);
  const c = laca(o.color, 0.28);
  if (o.dome) {
    const d = mesh(new THREE.SphereGeometry(o.r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), c, g);
    d.scale.y = o.h / o.r;
  } else {
    mesh(new THREE.CylinderGeometry(o.r * (o.taper ?? 1), o.r, o.h, 40), c, g, 0, o.h / 2);
    mesh(new THREE.CircleGeometry(o.r * (o.taper ?? 1), 40).rotateX(-Math.PI / 2), c, g, 0, o.h + 0.001);
  }
  // aba: disco com a borda levemente virada para cima
  const brim = new THREE.CylinderGeometry(o.brim, o.brim, 0.05, 48, 1);
  const p = brim.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, p.getY(i) + Math.max(0, rr - o.r) * 0.35 * Math.abs(p.getX(i) / (rr || 1))); }
  brim.computeVertexNormals();
  mesh(brim, c, g);
  if (o.band) mesh(new THREE.CylinderGeometry(o.r * 1.01, o.r * 1.01, o.bandH ?? 0.12, 40, 1, true), laca(o.band, 0.3), g, 0, (o.bandH ?? 0.12) / 2 + 0.03);
  return g;
}

/** Bigode em tubo (laca preta), de ponta a ponta, com as pontas viradas. */
function mustache(parent: THREE.Object3D, color = '#140c08', curl = 0.1, w = 0.36, thick = 0.05) {
  const pts = [[-w, -0.15 + curl], [-w * 0.6, -0.25], [0, -0.21], [w * 0.6, -0.25], [w, -0.15 + curl]].map(([x, y]) => new THREE.Vector3(x, y, 0.98 - Math.abs(x) * 0.35));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, thick, 10, false);
  const p = g.getAttribute('position') as THREE.BufferAttribute; const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 11) / 40; const k = 0.35 + 0.65 * Math.sin(Math.PI * t); curve.getPoint(t, c); p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k); }
  g.computeVertexNormals();
  return mesh(g, laca(color, 0.3), parent, 0, 0, 0, false);
}

/** Argola de ouro atravessando o lóbulo da orelha (lóbulo medido no modelo: x ±0,88, y -0,12, z -0,1). */
function hoop(parent: THREE.Object3D, x: number, r = 0.11) {
  const o = mesh(new THREE.TorusGeometry(r, 0.022, 8, 24), GOLD(), parent, Math.sign(x) * 0.885, -0.1 - r, -0.1, false);
  o.rotation.y = Math.PI / 2;
  return o;
}

function stripesTex(a: string, b: string, n = 8, vertical = true) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; if (vertical) g.fillRect((i * 128) / n, 0, 128 / n + 1, 128); else g.fillRect(0, (i * 128) / n, 128, 128 / n + 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function spotsTex() { // arminho: branco com pintinhas pretas
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#111';
  for (let i = 0; i < 10; i++) { const x = (i * 53) % 128, y = (i * 37 + 20) % 128; g.beginPath(); g.ellipse(x, y, 4, 8, 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1);
  return t;
}

function texLaca(map: THREE.Texture, rough = 0.4) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: rough });
  return m;
}

type Builder = (g: THREE.Group) => Omit<Traje, 'id' | 'nome' | 'group'>;

export const TRAJES: Record<string, { nome: string; build: Builder }> = {
  banqueiro: {
    nome: 'Banqueiro',
    build: (g) => {
      hat(g, { y0: 0.76, r: 0.82, h: 0.62, brim: 1.04, color: '#141016', band: '#c9973e' });
      // monóculo de ouro no olho esquerdo do boneco, com corrente descendo até o paletó
      const mono = mesh(new THREE.TorusGeometry(0.21, 0.028, 10, 32), GOLD(), g, 0.32, 0.13, 0.95, false);
      mono.rotation.y = 0.25;
      const chain = new THREE.CatmullRomCurve3([new THREE.Vector3(0.52, 0.06, 0.88), new THREE.Vector3(0.78, -0.5, 0.62), new THREE.Vector3(0.7, -1.3, 0.55)]);
      mesh(new THREE.TubeGeometry(chain, 30, 0.012, 6, false), GOLD(), g, 0, 0, 0, false);
      mustache(g, '#120c08', 0.14);
      return { hideHair: true, suit: '#1d3a2a', bow: '#c9973e' };
    },
  },
  vidente: {
    nome: 'Vidente',
    build: (g) => {
      // turbante: três voltas de pano + domo, joia vermelha com pena na frente
      const cloth = laca('#5a2a7a', 0.55);
      for (const [y, r, s] of [[0.72, 0.84, 1], [0.94, 0.8, 0.96], [1.14, 0.7, 0.9]] as const) {
        const t = mesh(new THREE.TorusGeometry(r, 0.19, 14, 40), cloth, g, 0, y, -0.04);
        t.rotation.x = Math.PI / 2; t.rotation.z = (y - 0.9) * 0.6; t.scale.set(s, s, 1);
      }
      const dome = mesh(new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), cloth, g, 0, 1.12, -0.04);
      dome.scale.y = 0.55;
      mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 24), GOLD(), g, 0, 0.98, 0.99, false);
      mesh(new THREE.SphereGeometry(0.1, 20, 14), laca('#c0182a', 0.15), g, 0, 0.98, 1.0, false);
      const plume = mesh(new THREE.SphereGeometry(0.1, 16, 12), laca('#efe7d6', 0.6), g, 0.06, 1.38, 0.86, false);
      plume.scale.set(0.7, 3.2, 0.5); plume.rotation.z = -0.25;
      hoop(g, 1); hoop(g, -1);
      return { hideHair: true, suit: '#4a1532', bow: '#d6a646' };
    },
  },
  magico: {
    nome: 'Mágico',
    build: (g) => {
      hat(g, { y0: 0.74, r: 0.74, h: 1.15, brim: 0.98, color: '#0e0c12', band: '#a81c26', bandH: 0.16 });
      mustache(g, '#0e0808', 0.02, 0.3, 0.03);
      // capa com gola alta atrás da cabeça (vermelha por dentro)
      const cape = new THREE.CylinderGeometry(1.25, 1.45, 1.5, 40, 1, true, Math.PI * 0.62, Math.PI * 0.76);
      mesh(cape, new THREE.MeshStandardMaterial({ color: '#8e1620', roughness: 0.5, side: THREE.DoubleSide }), g, 0, -0.95, -0.25, false);
      return { hideHair: true, suit: '#141218', bow: '#efe7d6' };
    },
  },
  palhaco: {
    nome: 'Palhaço',
    build: (g) => {
      // peruca de tufos laranja dos lados, chapeuzinho listrado com pompom, nariz de bola e gola de babados
      const wig = laca('#e0641c', 0.6);
      for (const s of [-1, 1]) for (const [dy, dz, r] of [[0.35, -0.1, 0.36], [0.05, -0.2, 0.32], [0.62, -0.25, 0.3]] as const) mesh(new THREE.SphereGeometry(r, 18, 14), wig, g, s * 0.86, dy, dz);
      // chapeuzinho assentado no alto do crânio (base afundada no topo, inclinado de lado), babado na borda
      // escondendo a junta e pompom na ponta, tudo filho do cone (anda junto)
      const cone = mesh(new THREE.ConeGeometry(0.42, 0.9, 32), texLaca(stripesTex('#e8d24a', '#2a5ad0', 6)), g, 0.2, 1.47, -0.05);
      cone.rotation.z = -0.22;
      mesh(new THREE.SphereGeometry(0.12, 16, 12), WHITE(), cone, 0, 0.47, 0, false);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const f = mesh(new THREE.SphereGeometry(0.1, 12, 10), WHITE(), cone, Math.cos(a) * 0.42, -0.43, Math.sin(a) * 0.42, false);
        f.scale.set(1, 0.6, 1);
      }
      mesh(new THREE.SphereGeometry(0.2, 24, 16), laca('#d01a22', 0.18), g, 0, -0.08, 0.98, false);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const b = mesh(new THREE.SphereGeometry(0.2, 12, 10), WHITE(), g, Math.cos(a) * 0.62, -1.16, Math.sin(a) * 0.5 + 0.05);
        b.scale.set(1, 0.55, 1);
      }
      return { hideHair: true, suit: '#d9a420', bow: '#2a5ad0' };
    },
  },
  juiz: {
    nome: 'Juiz',
    build: (g) => {
      // peruca branca: touca + três fileiras de cachos de cada lado e atrás
      const wig = laca('#ebe5d8', 0.6);
      const cap = mesh(new THREE.SphereGeometry(0.92, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), wig, g, 0, 0.62, -0.08);
      cap.scale.y = 0.95;
      for (const s of [-1, 1]) for (let row = 0; row < 3; row++) {
        const c = mesh(new THREE.TorusGeometry(0.2, 0.09, 10, 20), wig, g, s * 0.9, 0.42 - row * 0.3, -0.25);
        c.rotation.y = Math.PI / 2;
      }
      for (let row = 0; row < 3; row++) mesh(new THREE.TorusGeometry(0.24, 0.1, 10, 20), wig, g, 0, 0.4 - row * 0.3, -0.92);
      // babado branco (jabô) no peito
      const jab = mesh(new THREE.ConeGeometry(0.2, 0.42, 16), WHITE(), g, 0, -1.48, 0.5, false);
      jab.rotation.x = Math.PI;
      return { hideHair: true, suit: '#0f0d12', bow: '#ebe5d8' };
    },
  },
  coveiro: {
    nome: 'Coveiro',
    build: (g) => {
      hat(g, { y0: 0.8, r: 0.78, h: 1.3, brim: 1.0, color: '#0b0a0d', taper: 0.9 }); // largo o bastante para o crânio não furar a copa
      // fita de crepe caindo atrás do chapéu
      // (sai da fita do chapéu na nuca e cai por fora da cabeça: nuca medida em z ≈ -0,93 na altura 0,5)
      const crepe = mesh(new THREE.PlaneGeometry(0.22, 0.95), new THREE.MeshStandardMaterial({ color: '#16141a', roughness: 0.8, side: THREE.DoubleSide }), g, 0.22, 0.4, -1.0, false);
      crepe.rotation.set(0.12, 0.25, 0.06);
      // lírio branco na lapela
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; mesh(new THREE.SphereGeometry(0.06, 10, 8), WHITE(), g, 0.62 + Math.cos(a) * 0.06, -1.5 + Math.sin(a) * 0.06, 0.5, false); }
      return { hideHair: true, suit: '#0d0b10', bow: '#1a1a1e' };
    },
  },
  pirata: {
    nome: 'Capitão',
    build: (g) => {
      // tricórnio: copa em domo + aba com três pontas viradas para cima, debrum dourado e caveirinha
      const c = laca('#141016', 0.32);
      const gg = new THREE.Group(); gg.position.set(0, 0.74, -0.04); g.add(gg);
      const d = mesh(new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), c, gg); d.scale.y = 0.75;
      const brim = new THREE.CylinderGeometry(1.08, 1.08, 0.05, 72, 1);
      const p = brim.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i); const rr = Math.hypot(x, z); const a = Math.atan2(x, z);
        p.setY(i, p.getY(i) + Math.max(0, rr - 0.7) * 1.3 * (0.5 + 0.5 * Math.cos(3 * a + Math.PI)));
      }
      brim.computeVertexNormals();
      mesh(brim, c, gg);
      mesh(new THREE.SphereGeometry(0.09, 14, 10), WHITE(), gg, 0, 0.42, 0.74, false);
      hoop(g, 1, 0.13);
      return { hideHair: true, suit: '#8a1820', bow: '#141016' };
    },
  },
  chef: {
    nome: 'Chef',
    build: (g) => {
      // touca branca: faixa + nuvem de bolotas no alto
      mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 40, 1, true), WHITE(), g, 0, 0.98, -0.04);
      for (const [x, y, z, r] of [[0, 1.55, -0.04, 0.55], [-0.45, 1.45, 0.1, 0.42], [0.45, 1.45, 0.1, 0.42], [0, 1.45, 0.42, 0.42], [-0.3, 1.45, -0.4, 0.42], [0.3, 1.45, -0.4, 0.42]] as const) mesh(new THREE.SphereGeometry(r, 20, 14), WHITE(), g, x, y, z);
      mustache(g, '#2a1408', 0.18, 0.4, 0.055);
      return { hideHair: true, suit: '#e6e0d2', bow: '#c41e24' };
    },
  },
  inventor: {
    nome: 'Inventor',
    build: (g) => {
      // óculos de proteção puxados para a testa (aros de latão, lentes verdes) com tira de couro
      for (const s of [-1, 1]) {
        const rim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 28, 1, true), laca('#b8862e', 0.3, 0.8), g, s * 0.3, 0.72, 0.84, false);
        rim.rotation.x = Math.PI / 2 - 0.35;
        const lens = mesh(new THREE.CircleGeometry(0.19, 28), laca('#2f6e4a', 0.08), g, s * 0.3, 0.75, 0.92, false);
        lens.rotation.x = -0.35;
      }
      const strap = mesh(new THREE.TorusGeometry(0.93, 0.05, 8, 48), laca('#3a2214', 0.6), g, 0, 0.66, -0.02, false);
      strap.rotation.x = Math.PI / 2 - 0.2;
      return { hideHair: false, suit: '#dcd8cc', bow: '#2a8a4a' };
    },
  },
  rei: {
    nome: 'Rei',
    build: (g) => {
      // coroa de ouro com pontas e joias, forro de veludo vermelho; manto com gola de arminho
      const gg = new THREE.Group(); gg.position.set(0, 0.74, -0.04); g.add(gg);
      mesh(new THREE.CylinderGeometry(0.82, 0.8, 0.4, 40, 1, true), laca('#d6a646', 0.22, 0.9), gg, 0, 0.2);
      const vel = mesh(new THREE.SphereGeometry(0.78, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), laca('#8a1424', 0.6), gg, 0, 0.3); vel.scale.y = 0.6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const sp = mesh(new THREE.ConeGeometry(0.11, 0.32, 12), laca('#d6a646', 0.22, 0.9), gg, Math.sin(a) * 0.8, 0.55, Math.cos(a) * 0.8);
        sp.rotation.set(Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15);
        mesh(new THREE.SphereGeometry(0.05, 10, 8), laca('#efe7d6', 0.3), gg, Math.sin(a) * 0.82, 0.73, Math.cos(a) * 0.82, false);
        mesh(new THREE.SphereGeometry(0.065, 12, 10), laca(i % 2 ? '#1c5ad0' : '#c0182a', 0.12), gg, Math.sin(a) * 0.835, 0.18, Math.cos(a) * 0.835, false);
      }
      const ermine = mesh(new THREE.TorusGeometry(1.0, 0.24, 14, 48), texLaca(spotsTex(), 0.7), g, 0, -1.3, -0.05, false);
      ermine.rotation.x = Math.PI / 2; ermine.scale.set(1, 0.8, 1);
      return { hideHair: true, suit: '#7a1420', bow: '#d6a646' };
    },
  },
};

export const TRAJE_IDS = Object.keys(TRAJES);

export function buildTraje(id: string): Traje | null {
  const t = TRAJES[id];
  if (!t) return null;
  const group = new THREE.Group();
  group.name = `traje-${id}`;
  const r = t.build(group);
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  return { id, nome: t.nome, group, ...r };
}

