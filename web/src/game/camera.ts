import * as THREE from 'three';

// Câmera de diorama: botão direito (ou do meio + Alt) orbita, botão do meio arrasta, roda dá zoom,
// WASD/setas movem. Amortecida; tremor por "trauma" (quadrático).
export class CameraRig {
  target = new THREE.Vector3(0, 0, 0.6);
  goalTarget = new THREE.Vector3(0, 0, 0.6);
  az = 0; goalAz = 0;
  pol = 0.88; goalPol = 0.88;
  dist = 16; goalDist = 16;
  trauma = 0;
  shakeScale = 1;
  /** rapidez com que a câmera chega no alvo (8 = ágil; menor = movimento de cinema). Volta sozinha para 8. */
  ease = 8;
  easeRest = 8;
  /** tempo restante do empurrão de câmera (aproxima e volta no disparo) */
  private punchT = 0;
  userMoved = false;
  keys = new Set<string>();
  private t = 0;

  constructor(public cam: THREE.PerspectiveCamera, el: HTMLElement) {
    let mode: 'orbit' | 'pan' | null = null;
    let lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) mode = 'orbit';
      else if (e.button === 1) mode = 'pan';
      else return;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 0) this.userMoved = true;
      if (mode === 'orbit') {
        this.goalAz -= dx * 0.006;
        this.goalPol = THREE.MathUtils.clamp(this.goalPol - dy * 0.005, 0.25, 1.28);
      } else this.panScreen(dx, dy);
    });
    window.addEventListener('pointerup', () => { mode = null; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goalDist = THREE.MathUtils.clamp(this.goalDist * (1 + Math.sign(e.deltaY) * 0.1), 5, 26);
      this.userMoved = true;
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private panScreen(dx: number, dy: number) {
    const k = this.dist * 0.0016;
    const fwd = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
    const right = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
    this.goalTarget.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
    this.clampTarget();
  }

  private clampTarget() {
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, -9, 9);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, -6, 6);
  }

  frame(center: THREE.Vector3, dist: number, az = 0, pol = 0.88) {
    this.goalTarget.copy(center);
    this.goalDist = dist;
    this.goalAz = az;
    this.goalPol = pol;
    this.userMoved = false;
  }

  snap() {
    this.target.copy(this.goalTarget);
    this.az = this.goalAz; this.pol = this.goalPol; this.dist = this.goalDist;
  }

  addTrauma(a: number) { this.trauma = Math.min(1, this.trauma + a); }

  /** Empurrão no disparo: a câmera aproxima ~8% e volta em 0,6 s (sente-se o peso da corrente). */
  punchIn() { this.punchT = 0.6; }

  update(dt: number, inputEnabled: boolean) {
    this.t += dt;
    if (inputEnabled) {
      const sp = 7 * dt * (this.dist / 14);
      let mx = 0, mz = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
      if (mx || mz) {
        const fwd = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
        const right = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
        this.goalTarget.addScaledVector(right, mx * sp).addScaledVector(fwd, -mz * sp);
        this.clampTarget();
        this.userMoved = true;
      }
      if (this.keys.has('q')) this.goalAz += dt * 1.6;
      if (this.keys.has('e')) this.goalAz -= dt * 1.6;
    }
    this.ease += (this.easeRest - this.ease) * (1 - Math.exp(-dt * 0.9));
    const k = 1 - Math.exp(-dt * this.ease);
    this.target.lerp(this.goalTarget, k);
    this.az += (this.goalAz - this.az) * k;
    this.pol += (this.goalPol - this.pol) * k;
    this.dist += (this.goalDist - this.dist) * k;

    const sinP = Math.sin(this.pol), cosP = Math.cos(this.pol);
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    const pk = this.punchT > 0 ? Math.sin((1 - this.punchT / 0.6) * Math.PI) * 0.08 : 0;
    const d = this.dist * (1 - pk);
    this.cam.position.set(
      this.target.x + d * sinP * Math.sin(this.az),
      this.target.y + d * cosP,
      this.target.z + d * sinP * Math.cos(this.az),
    );
    this.cam.lookAt(this.target);
    // respiração: a câmera nunca fica 100% parada (alguém segurando)
    const b = this.shakeScale;
    this.cam.rotateZ(Math.sin(this.t * 0.41) * 0.004 * b);
    this.cam.rotateX(Math.sin(this.t * 0.53 + 1) * 0.003 * b);
    this.cam.rotateY(Math.sin(this.t * 0.37 + 2) * 0.003 * b);
    // tremor
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma * this.shakeScale;
    if (s > 0.0001) {
      const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 3) * 0.4;
      this.cam.rotateZ(n(37, 1) * 0.035 * s);
      this.cam.rotateX(n(41, 2) * 0.03 * s);
      this.cam.rotateY(n(29, 3) * 0.03 * s);
    }
  }
}
