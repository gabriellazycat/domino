import * as THREE from 'three';
import { softDot } from './textures';

// Efeitos: lascas/confete (instanced), faíscas que brilham (bloom), fumaça, ondas de choque,
// textos de impacto em DOM (estilo gibi) e flash de tela.
interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  s: number; life: number; max: number; g: number; drag: number;
}

class Pool {
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private next = 0;
  private dummy = new THREE.Object3D();
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public cap: number, shadow: boolean) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadow;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, s: 0, life: 0, max: 1, g: 0, drag: 0 });
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
  }
  spawn(o: Partial<P>, color: THREE.Color) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const p = this.ps[i];
    Object.assign(p, { alive: true, life: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6 }, o);
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor!.needsUpdate = true;
  }
  clear() {
    const d = this.dummy;
    d.scale.setScalar(0); d.updateMatrix();
    for (let i = 0; i < this.cap; i++) { this.ps[i].alive = false; this.mesh.setMatrixAt(i, d.matrix); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt: number) {
    const d = this.dummy;
    for (let i = 0; i < this.cap; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        d.scale.setScalar(0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      p.vy += p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.g < 0) { p.y = 0.02; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; p.wx *= 0.5; p.wz *= 0.5; }
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const fade = 1 - Math.pow(p.life / p.max, 3);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, p.rz);
      d.scale.setScalar(p.s * fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Puff { sp: THREE.Sprite; life: number; max: number; grow: number; vy: number; base: number }
interface Ring { m: THREE.Mesh; life: number; max: number; r: number }

const WORDS_KNOCK = ['POW!', 'BAM!', 'CRASH!', 'TOMBO!', 'PLOFT!', 'BONK!', 'KABUM!', 'ZÁS!'];

export class Fx {
  chips: Pool;
  sparks: Pool;
  puffs: Puff[] = [];
  rings: Ring[] = [];
  flash = 0;
  private dot = softDot();
  constructor(public scene: THREE.Scene, public cam: THREE.Camera, public layer: HTMLElement) {
    this.chips = new Pool(new THREE.BoxGeometry(1, 0.4, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 900, true);
    this.sparks = new Pool(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 700, false);
    scene.add(this.chips.mesh, this.sparks.mesh);
  }

  /** Lascas coloridas + faíscas no tombo de inimigo. */
  knockBurst(x: number, y: number, z: number, color: string, big: boolean) {
    const c = new THREE.Color(color);
    const n = big ? 34 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * (big ? 4 : 2.8);
      const col = Math.random() < 0.3 ? new THREE.Color('#cbbf9f') : c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      this.chips.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 3.5, vz: Math.sin(a) * sp, wx: 10 * Math.random(), wy: 8, wz: 10 * Math.random(), s: 0.04 + Math.random() * 0.05, max: 1.2 + Math.random() * 0.8, g: -12, drag: 0.6 }, col);
    }
    this.sparkBurst(x, y, z, big ? 26 : 14, '#ff9a4a', 3.5);
    this.puff(x, 0.15, z, big ? 1.3 : 0.8, '#5a4e44', 0.5);
    this.ring(x, z, big ? 1.4 : 0.9, '#ff7a4a');
  }

  sparkBurst(x: number, y: number, z: number, n: number, color: string, speed: number) {
    const c = new THREE.Color(color).multiplyScalar(4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const sp = speed * (0.5 + Math.random());
      this.sparks.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1, vz: Math.sin(a) * Math.cos(e) * sp, wx: 20, wy: 20, wz: 0, s: 0.03 + Math.random() * 0.04, max: 0.3 + Math.random() * 0.4, g: -6, drag: 2.5 }, c);
    }
  }

  /** Poeirinha da peça batendo no chão. */
  dust(x: number, z: number, scale = 1) {
    this.puff(x, 0.08, z, 0.45 * scale, '#7d7262', 0.35);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.chips.spawn({ x, y: 0.05, z, vx: Math.cos(a) * 0.8, vy: 1.2 + Math.random(), vz: Math.sin(a) * 0.8, wx: 6, wy: 6, wz: 6, s: 0.025, max: 0.6, g: -10, drag: 1 }, new THREE.Color('#6a5e4c'));
    }
  }

  explosion(x: number, y: number, z: number, r: number) {
    this.flash = Math.min(0.55, this.flash + 0.45);
    this.ring(x, z, r * 1.4, '#ffb347', 0.55);
    this.ring(x, z, r * 0.9, '#fff1c4', 0.35);
    this.sparkBurst(x, y + 0.2, z, 70, '#ffb347', 7);
    this.sparkBurst(x, y + 0.2, z, 30, '#fff3d0', 4);
    for (let i = 0; i < 6; i++) this.puff(x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8, 1.3 + Math.random() * 0.8, i < 3 ? '#ff8a3c' : '#3a2c26', 0.9 + Math.random() * 0.5, 0.8);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
      this.chips.spawn({ x, y: y + 0.2, z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 5, vz: Math.sin(a) * sp, wx: 15, wy: 15, wz: 15, s: 0.04 + Math.random() * 0.06, max: 1.6, g: -12, drag: 0.4 }, new THREE.Color(Math.random() < 0.5 ? '#2a1d18' : '#e5493a'));
    }
  }

  confetti(x: number, z: number, n = 140) {
    // brasas e cinzas (em vez de confete colorido)
    const cols = ['#ff8a3c', '#ffb347', '#ff5a2a', '#3a302a', '#6a5a4a', '#cbbf9f'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      this.chips.spawn({ x: x + (Math.random() - 0.5) * 2, y: 3 + Math.random() * 2, z: z + (Math.random() - 0.5) * 2, vx: Math.cos(a) * sp, vy: Math.random() * 2, vz: Math.sin(a) * sp, wx: 12 * Math.random(), wy: 12, wz: 12 * Math.random(), s: 0.07, max: 3 + Math.random() * 1.5, g: -4, drag: 1.4 }, new THREE.Color(cols[i % cols.length]));
    }
  }

  trail(x: number, y: number, z: number) {
    this.sparks.spawn({ x, y, z, vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), wx: 10, wy: 10, wz: 0, s: 0.05, max: 0.35, g: 0, drag: 3 }, new THREE.Color('#ffb347').multiplyScalar(4));
    if (Math.random() < 0.4) this.puff(x, y, z, 0.3, '#cfc3b0', 0.4);
  }

  puff(x: number, y: number, z: number, size: number, color: string, life: number, opacity = 0.55) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color, transparent: true, opacity, depthWrite: false }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(size * 0.4);
    this.scene.add(sp);
    this.puffs.push({ sp, life: 0, max: life, grow: size, vy: 0.4, base: opacity });
  }

  ring(x: number, z: number, r: number, color: string, life = 0.4) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.scene.add(m);
    this.rings.push({ m, life: 0, max: life, r });
  }

  /** Texto de impacto flutuando sobre um ponto 3D. */
  text(x: number, y: number, z: number, txt: string, cls = '', scale = 1) {
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = txt;
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v.y) / 2) * 100}%`;
    el.style.setProperty('--s', String(scale));
    el.style.setProperty('--r', `${(Math.random() - 0.5) * 18}deg`);
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  knockWord(): string { return WORDS_KNOCK[Math.floor(Math.random() * WORDS_KNOCK.length)]; }

  update(dt: number) {
    this.chips.update(dt);
    this.sparks.update(dt);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        this.scene.remove(p.sp);
        p.sp.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      p.sp.scale.setScalar(p.grow * (0.4 + 0.6 * Math.sqrt(t)));
      p.sp.position.y += p.vy * dt;
      p.sp.material.opacity = p.base * (1 - t);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        (r.m.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      r.m.scale.setScalar(Math.max(0.01, r.r * e));
      (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  clear() {
    for (const p of this.puffs) { this.scene.remove(p.sp); p.sp.material.dispose(); }
    this.puffs = [];
    for (const r of this.rings) { this.scene.remove(r.m); }
    this.rings = [];
    this.chips.clear();
    this.sparks.clear();
    this.layer.innerHTML = '';
  }
}
