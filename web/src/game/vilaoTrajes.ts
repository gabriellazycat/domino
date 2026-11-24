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
};

export function buildTraje(id: string): Traje | null {
  const t = TRAJES[id];
  if (!t) return null;
  const group = new THREE.Group();
  group.name = `traje-${id}`;
  const r = t.build(group);
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  return { id, nome: t.nome, group, ...r };
}

