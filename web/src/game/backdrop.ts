import * as THREE from 'three';

// Fundo vivo: redemoinho de tinta (à la Balatro) em tela cheia atrás de tudo, bem escuro,
// e olhos que flutuam no breu em volta da mesa. Os olhos piscam, abrem e fecham devagar,
// seguem um alvo (cursor/cascata/mão) e arregalam nos sustos.

/** Redemoinho de tinta (função GLSL compartilhada com o pós-processamento, que pinta o breu da cena). */
export const SWIRL_GLSL = `
  vec3 swirl(vec2 uv, float t, float pulse){
    float len = length(uv);
    // giro em espiral: quanto mais longe do centro, mais torce
    float ang = atan(uv.y, uv.x) + t * 0.04 - len * (2.2 + pulse * 1.5);
    uv = vec2(cos(ang), sin(ang)) * len * 9.0;
    vec2 uv2 = vec2(uv.x + uv.y);
    float sp = t * 0.35;
    for (int i = 0; i < 5; i++) {
      uv2 += sin(max(uv.x, uv.y)) + uv;
      uv += 0.5 * vec2(cos(5.1123 + 0.353 * uv2.y + sp * 0.131), sin(uv2.x - 0.113 * sp));
      uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
    }
    float paint = clamp(length(uv) * 0.045, 0.0, 2.0);
    float c1 = max(0.0, 1.0 - 1.6 * abs(1.0 - paint));
    float c2 = max(0.0, 1.0 - 1.6 * abs(paint));
    float c3 = 1.0 - min(1.0, c1 + c2);
    vec3 wine = vec3(0.26, 0.03, 0.05);
    vec3 violet = vec3(0.08, 0.02, 0.10);
    vec3 black = vec3(0.012, 0.008, 0.016);
    return (wine * c1 + violet * c2 + black * c3) * (0.55 + pulse * 0.9);
  }`;

const SwirlShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform float uAz; uniform float uPulse; uniform vec2 uRes;
    varying vec2 vUv;
    ${SWIRL_GLSL}
    void main(){
      vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      uv.x += uAz * 0.25;
      vec3 col = swirl(uv, uTime, uPulse);
      // escurece no centro (onde a mesa costuma estar)
      col *= smoothstep(0.0, 0.9, length(uv) + 0.15);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const EyeShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uOpen; uniform vec2 uLook; uniform float uPupil; uniform vec3 uIris; uniform float uFade; uniform float uSeed;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(2.0, 1.0);          // x -1..1, y -0.5..0.5
      float lid = 0.42 * pow(max(0.0, 1.0 - p.x * p.x), 0.8) * uOpen;
      float d = lid - abs(p.y);
      float inside = smoothstep(0.0, 0.025, d);
      // halo vermelho fraquinho em volta
      float halo = exp(-max(0.0, -d) * 9.0) * 0.35 * step(abs(p.x), 1.0) * (1.0 - inside);
      // esclera amarelada, sombreada nas bordas, com veias
      vec3 col = vec3(0.50, 0.44, 0.34) * (1.0 - 0.7 * length(p * vec2(0.85, 1.9)));
      float vein = smoothstep(0.88, 1.0, sin(atan(p.y, p.x) * 9.0 + h(floor(p * 7.0)) * 6.0) * 0.5 + 0.5) * smoothstep(0.35, 0.9, length(p * vec2(1.0, 2.0)));
      col = mix(col, vec3(0.55, 0.06, 0.05), vein * 0.6);
      vec2 ip = p - uLook * vec2(0.42, 0.12);
      float ir = length(ip);
      float iris = smoothstep(0.29, 0.27, ir);
      // íris brilha um pouco (pega bloom) — o resto do olho fica na penumbra
      vec3 irisCol = uIris * (0.6 + 1.2 * smoothstep(0.3, 0.05, ir)) + uIris * 0.3 * sin(atan(ip.y, ip.x) * 22.0);
      col = mix(col, irisCol, iris);
      float pupil = smoothstep(uPupil, uPupil - 0.02, length(ip * vec2(1.0, 0.9)));
      col = mix(col, vec3(0.0), pupil);
      col += smoothstep(0.05, 0.0, length(ip - vec2(-0.09, 0.07))) * 0.7;
      // borda da pálpebra escura e fundo afundando no breu
      col *= mix(0.08, 1.0, smoothstep(0.0, 0.12, d));
      vec3 outCol = mix(vec3(0.35, 0.02, 0.02), col, inside);
      gl_FragColor = vec4(outCol, (inside + halo) * uFade);
    }`,
};

const IRIS = ['#c9a43a', '#b0201c', '#8aa84a', '#d9d2b0', '#c96a1c'];

interface Eye {
  mesh: THREE.Mesh;
  u: { [k: string]: THREE.IUniform };
  state: 'hidden' | 'opening' | 'open' | 'closing';
  t: number; dur: number;
  blinkAt: number; blink: number;
  /** posição na tela (NDC) — os olhos ficam presos às bordas escuras da tela */
  ndc: THREE.Vector2; depth: number; bob: number;
  size: number;
  look: THREE.Vector2;
}

export class Backdrop {
  swirl: THREE.Mesh;
  eyes: Eye[] = [];
  /** ponto do mundo que os olhos encaram */
  target = new THREE.Vector3(0, 0, 0);
  /** pontos do mundo (inimigos, gatilho) que nenhum olho deve tapar */
  avoid: THREE.Vector3[] = [];
  private cam: THREE.Camera | null = null;
  private wide = 0;
  pulse = 0;
  private t = 0;
  private az = 0;
  private swirlU: { [k: string]: THREE.IUniform };

  constructor(scene: THREE.Scene, count = 9) {
    this.swirlU = { uTime: { value: 0 }, uAz: { value: 0 }, uPulse: { value: 0 }, uRes: { value: new THREE.Vector2(16, 9) } };
    this.swirl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.swirlU, vertexShader: SwirlShader.vertexShader, fragmentShader: SwirlShader.fragmentShader,
      depthWrite: false, toneMapped: false,
    }));
    this.swirl.frustumCulled = false;
    this.swirl.renderOrder = -1000;
    scene.add(this.swirl);

    const geo = new THREE.PlaneGeometry(2, 1);
    for (let i = 0; i < count; i++) {
      const u = {
        uOpen: { value: 0 }, uLook: { value: new THREE.Vector2() }, uPupil: { value: 0.12 },
        uIris: { value: new THREE.Color(IRIS[i % IRIS.length]) }, uFade: { value: 0 }, uSeed: { value: Math.random() * 100 },
      };
      // sem teste de profundidade: o olho vive na moldura escura da tela, por cima do breu da mesa
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: u, vertexShader: EyeShader.vertexShader, fragmentShader: EyeShader.fragmentShader,
        transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      }));
      mesh.visible = false;
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const e: Eye = { mesh, u, state: 'hidden', t: 0, dur: 0.3 + Math.random() * 10, blinkAt: 2 + Math.random() * 5, blink: -1, ndc: new THREE.Vector2(), depth: 10, bob: Math.random() * 10, size: 1, look: new THREE.Vector2() };
      this.eyes.push(e);
    }
  }

  /** Susto: todos arregalam (explosão, combo grande, a mão chegando). */
  startle(amount = 1) { this.wide = Math.min(1.4, this.wide + amount); this.pulse = Math.min(1, this.pulse + amount * 0.5); }

  /** Abre os olhos que estiverem fechados (chegada da mão). */
  wakeAll() {
    for (const e of this.eyes) if (e.state === 'hidden' && e.dur > 0.4) e.dur = Math.random() * 0.4;
  }

  /** Sorteia um lugar na moldura escura da tela (faixa de cima e laterais), longe de inimigos e de outros olhos. */
  private place(e: Eye) {
    const avoid = this.cam ? this.avoid.map((p) => { const v = p.clone().project(this.cam!); return new THREE.Vector2(v.x, v.y); }) : [];
    const others = this.eyes.filter((o) => o !== e && o.state !== 'hidden').map((o) => o.ndc);
    const p = new THREE.Vector2();
    for (let tries = 0; tries < 20; tries++) {
      if (Math.random() < 0.55) p.set(-0.95 + Math.random() * 1.9, 0.62 + Math.random() * 0.3);
      else p.set((Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.16), -0.45 + Math.random() * 1.1);
      if (avoid.some((a) => a.distanceTo(p) < 0.3)) continue;
      if (others.some((o) => o.distanceTo(p) < 0.22)) continue;
      break;
    }
    e.ndc.copy(p);
    e.depth = 8 + Math.random() * 10;
    e.size = e.depth * (0.016 + Math.random() * 0.02);
    e.mesh.scale.set(e.size, e.size, 1);
    (e.u.uIris.value as THREE.Color).set(IRIS[Math.floor(Math.random() * IRIS.length)]);
  }

  update(dt: number, cam: THREE.Camera) {
    this.cam = cam;
    this.t += dt;
    const cp = cam.position;
    this.az = Math.atan2(cp.x, cp.z);
    this.wide = Math.max(0, this.wide - dt * 0.8);
    this.pulse = Math.max(0, this.pulse - dt * 0.7);
    this.swirlU.uTime.value = this.t;
    this.swirlU.uAz.value = this.az;
    this.swirlU.uPulse.value = this.pulse;
    (this.swirlU.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);

    const right = new THREE.Vector3(), up = new THREE.Vector3(), to = new THREE.Vector3();
    for (const e of this.eyes) {
      e.t += dt;
      let open = 0, fade = 0;
      if (e.state === 'hidden') {
        if (e.t > e.dur) { this.place(e); e.state = 'opening'; e.t = 0; e.dur = 1.2 + Math.random() * 1.5; e.mesh.visible = true; }
      } else if (e.state === 'opening') {
        const k = Math.min(1, e.t / e.dur);
        fade = Math.min(1, k * 2); open = k * k;
        if (k >= 1) { e.state = 'open'; e.t = 0; e.dur = 6 + Math.random() * 10; }
      } else if (e.state === 'open') {
        fade = 1; open = 1;
        if (e.t > e.dur) { e.state = 'closing'; e.t = 0; e.dur = 0.8 + Math.random(); }
      } else {
        const k = Math.min(1, e.t / e.dur);
        fade = 1 - k * k; open = 1 - k;
        if (k >= 1) { e.state = 'hidden'; e.t = 0; e.dur = 4 + Math.random() * 12; e.mesh.visible = false; }
      }
      if (!e.mesh.visible) continue;
      // piscar
      e.blinkAt -= dt;
      if (e.blinkAt <= 0 && e.blink < 0) { e.blink = 0; e.blinkAt = 2.5 + Math.random() * 6; }
      if (e.blink >= 0) {
        e.blink += dt;
        open *= Math.abs(1 - e.blink / 0.09);
        if (e.blink > 0.18) e.blink = -1;
      }
      const wide = Math.min(1, this.wide);
      e.u.uOpen.value = Math.max(0, open * (0.82 + 0.38 * wide + Math.sin(this.t * 0.7 + e.bob) * 0.05));
      e.u.uPupil.value = 0.13 - 0.07 * wide + Math.sin(this.t * 0.5 + e.bob) * 0.015;
      e.u.uFade.value = fade;
      // flutua (deriva lenta na tela) e encara a câmera (billboard)
      const m = e.mesh;
      to.set(e.ndc.x + Math.sin(this.t * 0.31 + e.bob) * 0.02, e.ndc.y + Math.sin(this.t * 0.47 + e.bob * 2) * 0.025, 0.5).unproject(cam).sub(cp).normalize();
      m.position.copy(cp).addScaledVector(to, e.depth);
      m.quaternion.copy(cam.quaternion);
      // pupila: projeta a direção do alvo nos eixos do olho
      right.set(1, 0, 0).applyQuaternion(m.quaternion);
      up.set(0, 1, 0).applyQuaternion(m.quaternion);
      to.copy(this.target).sub(m.position).normalize();
      const lx = THREE.MathUtils.clamp(to.dot(right) * 1.6, -1, 1);
      const ly = THREE.MathUtils.clamp(to.dot(up) * 2.0, -1, 1);
      e.look.lerp(new THREE.Vector2(lx, ly), 1 - Math.exp(-dt * 6));
      (e.u.uLook.value as THREE.Vector2).copy(e.look);
    }
  }
}
