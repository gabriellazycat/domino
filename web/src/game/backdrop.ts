import * as THREE from 'three';

// Fundo vivo: redemoinho de tinta (à la Balatro) em tela cheia atrás de tudo, bem escuro,
// e o "dono da mesa" (à la Leshy, do Inscryption): uma cabeça que quase não se vê no breu
// do outro lado da mesa, só os dois olhos brilhando. Ele pisca, acompanha o cursor e a
// cascata, arregala nos sustos, fecha a cara quando você vence e ri com os olhos quando perde.

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

/** O dono da mesa: silhueta da cabeça + dois olhos brilhando, tudo num quad (x -1..1, y -0.5..0.5). */
const WatcherShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uOpen; uniform vec2 uLook; uniform float uPupil; uniform float uAnger; uniform float uSquint;
    uniform float uFade; uniform float uTime;
    varying vec2 vUv;
    // 1 → 0 entre a e b (a < b). Nunca usar smoothstep com bordas invertidas: no D3D (ANGLE/Windows) quebra.
    float fall(float a, float b, float x){ return 1.0 - smoothstep(a, b, x); }
    // um olho amendoado; side = -1 (esquerdo) / +1 (direito). Retorna cor (rgb) e cobertura (a).
    vec4 eye(vec2 p, vec2 c, float side){
      vec2 d = p - c;
      float w = 0.1, h = 0.046;
      float t = clamp(d.x / w, -1.0, 1.0);
      float arc = sqrt(max(0.0, 1.0 - t * t));
      float inner = -side * t * 0.5 + 0.5;                    // 1 no canto de dentro (perto do nariz)
      float top = h * uOpen * arc - uAnger * 0.04 * inner * step(abs(d.x), w);
      float bot = -h * uOpen * arc * (1.0 - uSquint * 0.75);
      float inside = smoothstep(0.0, 0.006, min(top - d.y, d.y - bot)) * step(abs(d.x), w);
      // íris brilhante (pega bloom) + pupila escura que segue o alvo
      vec2 ip = d - uLook * vec2(0.055, 0.03);
      float ir = length(ip * vec2(1.0, 1.08));
      float flick = 0.92 + 0.08 * sin(uTime * 13.0 + side * 2.0);
      vec3 sclera = vec3(0.15, 0.12, 0.08) * (1.0 - 0.6 * abs(t));
      vec3 iris = mix(vec3(1.8, 1.4, 0.6), vec3(0.85, 0.45, 0.12), smoothstep(0.0, 0.05, ir)) * flick;
      vec3 col = mix(sclera, iris, fall(0.048, 0.054, ir));
      col = mix(col, vec3(0.0), fall(uPupil - 0.003, uPupil + 0.003, ir));
      col += fall(0.0, 0.012, length(ip - vec2(-0.016, 0.014))) * 1.2;
      // sombra da pálpebra de cima
      col *= mix(0.25, 1.0, smoothstep(0.0, 0.02, top - d.y));
      // brilho em volta (o olho "acende" o breu)
      float halo = exp(-length(d * vec2(0.8, 1.6)) * 24.0) * (0.35 + 0.65 * uOpen);
      return vec4(col * inside + vec3(0.7, 0.4, 0.15) * halo * (1.0 - inside), max(inside, halo * 0.5));
    }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(2.0, 1.0);
      // silhueta: cabeça mais escura que o breu, com um fio de luz de vela na borda
      float e = length((p - vec2(0.0, 0.0)) / vec2(0.37, 0.48));
      float sil = fall(0.86, 1.0, e);
      float rim = smoothstep(0.8, 0.95, e) * fall(0.95, 1.02, e) * smoothstep(-0.3, 0.3, p.y) * 0.09;
      // pescoço e ombros caídos
      float neck = fall(0.8, 1.0, length((p - vec2(0.0, -0.42)) / vec2(0.16, 0.2)));
      float sh = fall(0.75, 1.0, length((p - vec2(0.0, -0.72)) / vec2(1.0, 0.3)));
      sil = max(max(sil, sh), neck);
      // borda do quad some no escuro
      // a figura se desfaz abaixo do queixo para não escurecer o tabuleiro
      float edge = fall(0.75, 1.0, abs(p.x)) * smoothstep(-0.42, -0.05, p.y) * fall(0.38, 0.5, p.y);
      vec3 col = vec3(0.012, 0.008, 0.01) + vec3(0.9, 0.45, 0.2) * rim;
      float a = sil * 0.6 * edge;
      vec4 l = eye(p, vec2(-0.16, 0.06), -1.0);
      vec4 r = eye(p, vec2(0.16, 0.06), 1.0);
      vec4 ey = l + r;
      col = mix(col, ey.rgb / max(ey.a, 1e-3), clamp(ey.a, 0.0, 1.0));
      a = max(a, clamp(ey.a, 0.0, 1.0));
      gl_FragColor = vec4(col, a * uFade);
    }`,
};

export type WatcherMood = 'watch' | 'angry' | 'amused';

export class Backdrop {
  swirl: THREE.Mesh;
  watcher: THREE.Mesh;
  /** ponto do mundo que o dono da mesa encara */
  target = new THREE.Vector3(0, 0, 0);
  mood: WatcherMood = 'watch';
  pulse = 0;
  private wide = 0;
  private t = 0;
  private az = 0;
  private fade = 0;
  private blinkAt = 3;
  private blink = -1;
  private look = new THREE.Vector2();
  private anger = 0;
  private squint = 0.25;
  private swirlU: { [k: string]: THREE.IUniform };
  private wu: { [k: string]: THREE.IUniform };

  constructor(scene: THREE.Scene) {
    this.swirlU = { uTime: { value: 0 }, uAz: { value: 0 }, uPulse: { value: 0 }, uRes: { value: new THREE.Vector2(16, 9) } };
    this.swirl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.swirlU, vertexShader: SwirlShader.vertexShader, fragmentShader: SwirlShader.fragmentShader,
      depthWrite: false, toneMapped: false,
    }));
    this.swirl.frustumCulled = false;
    this.swirl.renderOrder = -1000;
    scene.add(this.swirl);

    this.wu = {
      uOpen: { value: 1 }, uLook: { value: new THREE.Vector2() }, uPupil: { value: 0.018 }, uAnger: { value: 0 },
      uSquint: { value: 0.25 }, uFade: { value: 0 }, uTime: { value: 0 },
    };
    // sem teste de profundidade: ele fica "do outro lado da mesa", no alto da tela, sobre o breu
    this.watcher = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.ShaderMaterial({
      uniforms: this.wu, vertexShader: WatcherShader.vertexShader, fragmentShader: WatcherShader.fragmentShader,
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    this.watcher.frustumCulled = false;
    this.watcher.renderOrder = 5;
    scene.add(this.watcher);
  }

  /** Susto: ele arregala os olhos (explosão, combo grande, a própria mão descendo). */
  startle(amount = 1) { this.wide = Math.min(1.4, this.wide + amount); this.pulse = Math.min(1, this.pulse + amount * 0.5); }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.t += dt;
    const cp = cam.position;
    // para onde a câmera olha (azimute): 0 = olhando para -Z, o lado onde ele está sentado
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    this.az = Math.atan2(-fwd.x, -fwd.z);
    this.wide = Math.max(0, this.wide - dt * 0.8);
    this.pulse = Math.max(0, this.pulse - dt * 0.7);
    this.swirlU.uTime.value = this.t;
    this.swirlU.uAz.value = this.az;
    this.swirlU.uPulse.value = this.pulse;
    (this.swirlU.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);

    // posição: ele mora no lado -Z da mesa; se a câmera gira, ele escorrega para o lado da tela
    const sx = -Math.sin(this.az) * 0.9;
    const behind = Math.cos(this.az);
    this.fade = Math.min(1, this.fade + dt * 0.5);
    const ndc = new THREE.Vector2(sx + Math.sin(this.t * 0.23) * 0.015, 0.77 + Math.sin(this.t * 0.6) * 0.008);
    const depth = 10;
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cp).normalize();
    const w = this.watcher;
    w.position.copy(cp).addScaledVector(dir, depth);
    w.quaternion.copy(cam.quaternion);
    w.rotateZ(Math.sin(this.t * 0.31) * 0.025); // inclina a cabeça devagar
    const visH = 2 * depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    w.scale.setScalar(visH * 0.5 * (1 + Math.sin(this.t * 0.6) * 0.008));

    // piscar (às vezes duas vezes seguidas)
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blink < 0) { this.blink = 0; this.blinkAt = Math.random() < 0.2 ? 0.25 : 2.5 + Math.random() * 4.5; }
    let open = 1;
    if (this.blink >= 0) {
      this.blink += dt;
      open = Math.min(1, Math.abs(1 - this.blink / 0.08));
      if (this.blink > 0.16) this.blink = -1;
    }
    const wide = Math.min(1, this.wide);
    const k = 1 - Math.exp(-dt * 3);
    this.anger += ((this.mood === 'angry' ? 1 : 0) * (1 - wide) - this.anger) * k;
    this.squint += ((this.mood === 'amused' ? 0.85 : this.mood === 'angry' ? 0.4 : 0.35) * (1 - wide) - this.squint) * k;
    this.wu.uOpen.value = open * (0.82 + wide * 0.55);
    this.wu.uPupil.value = 0.02 - wide * 0.011 + Math.sin(this.t * 0.4) * 0.002;
    this.wu.uAnger.value = this.anger;
    this.wu.uSquint.value = this.squint;
    this.wu.uTime.value = this.t;
    this.wu.uFade.value = this.fade * THREE.MathUtils.smoothstep(behind, 0.1, 0.5);

    // olhar: compara na tela a posição do alvo com a dos olhos (ele olha "para baixo", para a mesa)
    const tp = this.target.clone().project(cam);
    const lx = THREE.MathUtils.clamp((tp.x - ndc.x) * 1.3, -1, 1);
    const ly = THREE.MathUtils.clamp((tp.y - ndc.y) * 0.9, -1, 0.4);
    this.look.lerp(new THREE.Vector2(lx, ly), 1 - Math.exp(-dt * 5));
    (this.wu.uLook.value as THREE.Vector2).copy(this.look);
  }
}
