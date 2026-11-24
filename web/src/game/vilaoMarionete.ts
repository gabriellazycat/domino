import * as THREE from 'three';
import type { Backdrop } from './backdrop';

// Marionete do dono da mesa (vilaoOficial.ts): cabeça brinquedo sem sobrancelha pintada +
//   - sobrancelhas 3D de madeira laqueada que mexem (raiva, susto, deboche), cada uma presa num fio;
//   - cordas de barbante que saem de pontos na SUPERFÍCIE (achados por raio) e sobem para uma cruzeta fora
//     do quadro, inclinadas para longe da cabeça: nenhuma atravessa o boneco.

type Priv = {
  strings: THREE.Object3D; head: THREE.Group;
  eyes: { ball: THREE.Object3D; lid: THREE.Object3D }[];
  look: THREE.Vector2; mood: string; anger: number; wide: number; squint: number; talkLeft: number;
};

const UP = new THREE.Vector3(0, 1, 0);

/** Primeiro ponto da superfície do modelo ao longo de um raio (coordenadas locais do `root`). */
function hitLocal(root: THREE.Object3D, meshes: THREE.Object3D[], from: THREE.Vector3, dir: THREE.Vector3) {
  root.updateMatrixWorld(true);
  const o = root.localToWorld(from.clone());
  const d = root.localToWorld(from.clone().add(dir)).sub(o).normalize();
  const hit = new THREE.Raycaster(o, d).intersectObjects(meshes, false)[0];
  return hit ? root.worldToLocal(hit.point.clone()) : null;
}

// ---------------------------------------------------------------- cordas
interface Str { mesh: THREE.Mesh; anchor: THREE.Object3D; top: THREE.Vector3; top0: THREE.Vector3; ring: THREE.Mesh }

function makeStrings(root: THREE.Object3D) {
  const twine = new THREE.MeshStandardMaterial({ color: '#d9c9a4', roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9973e', roughness: 0.35, metalness: 0.8 });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const ringGeo = new THREE.TorusGeometry(0.035, 0.009, 6, 14);
  const list: Str[] = [];
  const add = (anchor: THREE.Object3D, top: THREE.Vector3) => {
    const mesh = new THREE.Mesh(geo, twine);
    const ring = new THREE.Mesh(ringGeo, brass); // ilhós de latão onde o fio amarra
    root.add(mesh); anchor.add(ring);
    mesh.frustumCulled = false;
    mesh.userData.string = true;
    list.push({ mesh, anchor, top: top.clone(), top0: top.clone(), ring });
  };
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  const update = () => {
    for (const s of list) {
      root.updateMatrixWorld();
      const a = root.worldToLocal(s.anchor.getWorldPosition(tmp));
      dir.copy(s.top).sub(a);
      const len = dir.length();
      s.mesh.position.copy(a);
      s.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
      s.mesh.scale.set(0.007, len, 0.007);
    }
  };
  return { add, update, list };
}

// ---------------------------------------------------------------- sobrancelhas
function makeBrow(side: number) {
  // arco de madeira laqueada preta, mais grosso no meio (traço de pincel esculpido)
  const pts = [-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * 0.26, 0.07 * (1 - u * u) - 0.02 * u * side, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 24, 0.045, 10, false);
  // afina as pontas
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 11) / 24;
    const k = 0.45 + 0.55 * Math.sin(Math.PI * t);
    curve.getPoint(t, c);
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k * 0.7);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#1c100a', roughness: 0.3 }));
  const pivot = new THREE.Group();
  pivot.add(m);
  // ponta de fora (onde o fio amarra)
  const tip = new THREE.Object3D();
  tip.position.set(side * 0.23, 0.05, 0.03);
  pivot.add(tip);
  return { pivot, tip };
}

// ---------------------------------------------------------------- montagem
export function buildMarionete(backdrop: Backdrop, root: THREE.Object3D) {
  const bd = backdrop as unknown as Priv;
  bd.strings.visible = false; // as cordas de linha antigas (atravessavam a cabeça) saem
  const solid = solidsOf(root);
  const S = makeStrings(root);
  const FAR = 30;

  // pontos de amarração achados na superfície (raio de cima para baixo)
  const down = new THREE.Vector3(0, -1, 0);
  const anchorAt = (x: number, z: number, top: THREE.Vector3) => {
    const p = hitLocal(root, solid, new THREE.Vector3(x, 5, z), down);
    if (!p) return;
    const o = new THREE.Object3D(); o.position.copy(p); root.add(o);
    S.add(o, top);
  };
  for (const s of [-1, 1]) {
    anchorAt(s * 0.28, 0.05, new THREE.Vector3(s * 0.5, FAR, 0.6));     // coroa da cabeça
    anchorAt(s * 1.12, 0.0, new THREE.Vector3(s * 2.2, FAR, 0.4));      // ombros (para fora: não raspa a orelha)
  }

  // sobrancelhas: encostadas na testa (raio de frente para trás), cada uma com fio na ponta de fora
  const eyeL = root.getObjectByName('Eye_L')!, eyeR = root.getObjectByName('Eye_R')!;
  (eyeL as THREE.Mesh).geometry.computeBoundingSphere();
  const R = (eyeL as THREE.Mesh).geometry.boundingSphere!.radius;
  const brows: { pivot: THREE.Group; side: number; base: THREE.Vector3 }[] = [];
  for (const [eye, side] of [[eyeR, -1], [eyeL, 1]] as const) {
    const bx = eye.position.x, by = eye.position.y + R * 1.55;
    const hit = hitLocal(root, solid, new THREE.Vector3(bx, by, 5), new THREE.Vector3(0, 0, -1));
    const b = makeBrow(side);
    b.pivot.position.set(bx, by, (hit ? hit.z : 0.8) + 0.02);
    root.add(b.pivot);
    brows.push({ pivot: b.pivot, side, base: b.pivot.position.clone() });
    // fio da sobrancelha: sobe inclinado para a frente (passa na frente da testa e do topete)
    // com chapéu de aba, o fio inclina mais para a frente até passar livre por fora da aba
    root.updateMatrixWorld(true);
    const tipL = root.worldToLocal(b.tip.getWorldPosition(new THREE.Vector3()));
    const tops = [3.2, 6, 10, 16, 24].map((dz) => new THREE.Vector3(side * 0.6, FAR, b.pivot.position.z + dz));
    S.add(b.tip, tops.find((t) => segmentClear(root, solid, tipL, t)) ?? tops[tops.length - 1]);
  }

  const clock = new THREE.Clock();
  let last = 0;
  const anim = new THREE.Object3D();
  root.add(anim);
  // um único "relógio" por quadro, pendurado num nó invisível
  const tick = () => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last); last = t;
    if (dt <= 0) return;
    const amused = bd.mood === 'amused' ? 1 : 0;
    const wide = Math.min(1, bd.wide);
    const talking = bd.talkLeft > 0 ? 1 : 0;
    // sobrancelhas: raiva junta e abaixa a ponta de dentro; susto sobe; deboche levanta só uma
    brows.forEach((b, i) => {
      const smug = amused * (i === 1 ? 1 : 0);
      b.pivot.position.y = b.base.y + wide * 0.10 - bd.anger * 0.06 + smug * 0.07 + talking * Math.sin(t * 9) * 0.008;
      b.pivot.position.x = b.base.x - b.side * bd.anger * 0.03;
      b.pivot.rotation.z = b.side * (bd.anger * 0.6 - wide * 0.15) + smug * 0.18 * b.side;
    });
    S.update();
  };
  const holder = root.getObjectByName('Head') as THREE.Mesh;
  holder.onBeforeRender = tick;
  void anim;
  S.update();
  // cordas frouxas (o boneco foi solto e cai): o alto de cada fio desce do escuro para logo acima do ponto
  // onde ele amarra e balança um pouco — os fios caem junto, em vez de continuarem esticados até o céu.
  const tmp = new THREE.Vector3();
  root.userData.slack = (k: number, t: number) => {
    root.updateMatrixWorld();
    S.list.forEach((s, i) => {
      const a = root.worldToLocal(s.anchor.getWorldPosition(tmp));
      const loose = a.clone().add(new THREE.Vector3(Math.sin(t * 7 + i * 1.7) * 0.35 + (s.top0.x - a.x) * 0.06, 1.4 + (i % 3) * 0.45, Math.cos(t * 5 + i) * 0.2));
      s.top.copy(s.top0).lerp(loose, k);
    });
    S.update();
  };
  return { strings: S.list.length };
}

/** Peças sólidas do boneco (as visíveis do modelo + acessórios de traje marcados com userData.solid). */
export function solidsOf(root: THREE.Object3D) {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    let vis = true; for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) vis = false;
    if (vis && (['Head', 'Hair', 'Jacket', 'Collar', 'Neck', 'Bow', 'Jaw'].includes(o.name) || o.userData.solid)) out.push(o);
  });
  return out;
}

/** O segmento a→b (espaço do root) passa sem tocar em nenhuma peça sólida? */
function segmentClear(root: THREE.Object3D, solid: THREE.Object3D[], a: THREE.Vector3, b: THREE.Vector3) {
  const wa = root.localToWorld(a.clone()), wb = root.localToWorld(b.clone());
  const dir = wb.clone().sub(wa); const len = dir.length(); dir.normalize();
  const rc = new THREE.Raycaster(wa.addScaledVector(dir, 0.04), dir, 0, len);
  return rc.intersectObjects(solid, false).length === 0;
}
