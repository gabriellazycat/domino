import * as THREE from 'three';

// Fundo vivo: redemoinho de tinta (à la Balatro) em tela cheia atrás de tudo, bem escuro,
// e o "dono da mesa" (à la Leshy, do Inscryption): uma máscara de porcelana flutuando no breu
// do outro lado da mesa. Os buracos dos olhos mudam de forma: acompanham o cursor e a cascata,
// se abrem nos sustos, fecham a cara quando você vence e "riem" quando você perde. Racha a cada vitória.

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

/**
 * O dono da mesa: máscara de porcelana branca e lisa, sem boca, flutuando no breu.
 * Só os buracos pretos dos olhos mudam de forma (expressão) e vai rachando conforme você vence.
 * Tudo desenhado num quad (x -1..1, y -0.5..0.5).
 */
const WatcherShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uOpen; uniform vec2 uLook; uniform float uPupil; uniform float uAnger; uniform float uSquint;
    uniform float uFade; uniform float uTime; uniform float uCrack; uniform float uCrackFlash;
    varying vec2 vUv;
    // 1 → 0 entre a e b (a < b). Nunca usar smoothstep com bordas invertidas: no D3D (ANGLE/Windows) quebra.
    float fall(float a, float b, float x){ return 1.0 - smoothstep(a, b, x); }
    float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    const vec2 C = vec2(0.0, 0.0);      // centro da máscara
    const vec2 R = vec2(0.13, 0.17);    // raios (oval)
    // buraco do olho (amendoado); side = -1 esquerdo / +1 direito. Retorna "dentro" (0..1) e distância à borda.
    vec2 hole(vec2 p, float side){
      vec2 d = p - vec2(side * 0.05, 0.028);
      float w = 0.036, h = 0.017;
      float t = clamp(d.x / w, -1.0, 1.0);
      float arc = sqrt(max(0.0, 1.0 - t * t));
      float inner = -side * t * 0.5 + 0.5;               // 1 no canto de dentro
      float top = h * uOpen * arc - uAnger * 0.014 * inner;
      float bot = -h * uOpen * arc * (1.0 - uSquint * 1.6); // squint alto vira meia-lua ("rindo com os olhos")
      float m = min(top - d.y, d.y - bot);
      float inside = smoothstep(0.0, 0.0025, m) * step(abs(d.x), w);
      return vec2(inside, m);
    }
    float cracks(vec2 p){
      // rachaduras que aparecem aos poucos (uCrack 0..1), partindo dos olhos e da testa
      float d = 1.0;
      if (uCrack > 0.05) { d = min(d, seg(p, vec2(-0.06, 0.05), vec2(-0.075, 0.09))); d = min(d, seg(p, vec2(-0.075, 0.09), vec2(-0.065, 0.13))); }
      if (uCrack > 0.2)  { d = min(d, seg(p, vec2(0.065, 0.012), vec2(0.08, -0.03))); d = min(d, seg(p, vec2(0.08, -0.03), vec2(0.07, -0.08))); }
      if (uCrack > 0.35) { d = min(d, seg(p, vec2(0.0, 0.17), vec2(0.012, 0.12))); d = min(d, seg(p, vec2(0.012, 0.12), vec2(-0.008, 0.085))); }
      if (uCrack > 0.5)  { d = min(d, seg(p, vec2(-0.04, 0.012), vec2(-0.05, -0.05))); d = min(d, seg(p, vec2(-0.05, -0.05), vec2(-0.03, -0.11))); d = min(d, seg(p, vec2(-0.05, -0.05), vec2(-0.09, -0.08))); }
      if (uCrack > 0.7)  { d = min(d, seg(p, vec2(0.125, 0.06), vec2(0.09, 0.07))); d = min(d, seg(p, vec2(0.09, 0.07), vec2(0.075, 0.045))); }
      if (uCrack > 0.85) { d = min(d, seg(p, vec2(-0.1, -0.1), vec2(-0.03, -0.13))); d = min(d, seg(p, vec2(0.02, -0.165), vec2(0.04, -0.12))); d = min(d, seg(p, vec2(0.04, -0.12), vec2(0.02, -0.09))); }
      return d;
    }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(2.0, 1.0);
      // oval levemente "ovo" (mais larga em cima)
      vec2 q = (p - C) / (R * vec2(1.0 + 0.1 * clamp(p.y / R.y, -1.0, 1.0), 1.0));
      float e = length(q);
      float mask = fall(0.97, 1.0, e);
      // sombreado falso: normal do elipsoide; luz quente de vela vindo de baixo/frente, borda fria
      vec3 n = normalize(vec3(q * 0.9, sqrt(max(0.0, 1.0 - min(1.0, dot(q, q))))));
      float lit = max(0.0, dot(n, normalize(vec3(0.2, -0.5, 0.85))));
      float rim = pow(max(0.0, 1.0 - n.z), 3.0); // n.z pode passar de 1 por arredondamento: pow de negativo = NaN no D3D
      // porcelana velha (amarelada, sem o branco de louça nova): não compete com o tabuleiro
      vec3 porcelain = vec3(0.74, 0.69, 0.6);
      vec3 col = porcelain * (0.18 + 0.62 * lit) + vec3(0.25, 0.3, 0.42) * rim * 0.35;
      col += pow(max(0.0, dot(reflect(-normalize(vec3(0.2, -0.5, 0.85)), n), vec3(0.0, 0.0, 1.0))), 24.0) * 0.25;
      // buracos dos olhos: preto fundo, com sombra em volta e uma brasinha que segue o alvo
      vec2 hl = hole(p, -1.0), hr = hole(p, 1.0);
      float inside = max(hl.x, hr.x);
      float near = max(fall(0.0, 0.012, -hl.y) * step(hl.y, 0.0), fall(0.0, 0.012, -hr.y) * step(hr.y, 0.0));
      col *= 1.0 - 0.35 * near * mask;
      vec2 ember = vec2(uLook.x * 0.018, uLook.y * 0.008 + 0.026);
      float dl = length(p - vec2(-0.05, 0.0) - ember), dr = length(p - vec2(0.05, 0.0) - ember);
      float dotL = fall(uPupil * 0.4, uPupil, dl), dotR = fall(uPupil * 0.4, uPupil, dr);
      vec3 holeCol = vec3(0.004) + vec3(1.3, 0.75, 0.3) * max(dotL * hl.x, dotR * hr.x);
      col = mix(col, holeCol, inside);
      // rachaduras (linha escura fina); piscam claras quando uma nova aparece
      float cd = cracks(p);
      float crack = fall(0.0012, 0.0032, cd) * mask * (1.0 - inside);
      col = mix(col, vec3(0.08, 0.06, 0.05), crack);
      col += vec3(1.0, 0.7, 0.4) * fall(0.0, 0.008, cd) * uCrackFlash * mask;
      // sombra escura em volta: separa a máscara do tabuleiro sem pesar
      float halo = fall(1.0, 1.45, e) * (1.0 - mask) * 0.35 * smoothstep(-0.45, -0.2, p.y);
      float a = max(mask, halo);
      col = mix(vec3(0.0), col, mask / max(a, 1e-3));
      gl_FragColor = vec4(col, a * uFade);
    }`,
};

export type WatcherMood = 'watch' | 'angry' | 'amused';

/** Onde o dono da mesa flutua: logo atrás da borda de trás da mesa (z = -7,5), saindo de trás do tampo. */
export const MASK_POS = new THREE.Vector3(0, 0.75, -8.8);
/** Escala do quad (a máscara ocupa ~0,34 da altura dele → ~2,4 m: do tamanho da mão gigante). */
const MASK_SCALE = 7;

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
    // o vertex shader dele posiciona o quad em tela cheia; com o material de normais do AO ele viraria um plano 2x2 no centro da mesa
    this.swirl.userData.noAO = true;
    this.swirl.renderOrder = -1000;
    scene.add(this.swirl);

    this.wu = {
      uOpen: { value: 1 }, uLook: { value: new THREE.Vector2() }, uPupil: { value: 0.007 }, uAnger: { value: 0 },
      uSquint: { value: 0.2 }, uFade: { value: 0 }, uTime: { value: 0 }, uCrack: { value: 0 }, uCrackFlash: { value: 0 },
    };
    // com teste de profundidade: o tampo da mesa esconde a parte de baixo (ele "espia" por trás da borda)
    this.watcher = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.ShaderMaterial({
      uniforms: this.wu, vertexShader: WatcherShader.vertexShader, fragmentShader: WatcherShader.fragmentShader,
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.watcher.frustumCulled = false;
    this.watcher.renderOrder = 5;
    scene.add(this.watcher);
  }

  /** Susto: os buracos dos olhos se abrem redondos (explosão, combo grande, a própria mão descendo). */
  startle(amount = 1) { this.wide = Math.min(1.4, this.wide + amount); this.pulse = Math.min(1, this.pulse + amount * 0.5); }

  /** Nível de rachadura (0..1). Se aumentou, a rachadura nova brilha um instante. */
  setCrack(level: number) {
    const v = THREE.MathUtils.clamp(level, 0, 1);
    if (v > (this.wu.uCrack.value as number) + 1e-3) this.crackFlash = 1;
    this.wu.uCrack.value = v;
  }
  private crackFlash = 0;

  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.t += dt;
    // para onde a câmera olha (azimute): 0 = olhando para -Z, o lado onde ele está sentado
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    this.az = Math.atan2(-fwd.x, -fwd.z);
    this.wide = Math.max(0, this.wide - dt * 0.8);
    this.pulse = Math.max(0, this.pulse - dt * 0.7);
    this.swirlU.uTime.value = this.t;
    this.swirlU.uAz.value = this.az;
    this.swirlU.uPulse.value = this.pulse;
    (this.swirlU.uRes.value as THREE.Vector2).set(window.innerWidth, window.innerHeight);

    // posição fixa no mundo: flutua atrás da borda de trás da mesa (de onde o braço sai), espiando;
    // a parte de baixo some atrás do tampo. Sempre de frente para a câmera.
    this.fade = Math.min(1, this.fade + dt * 0.5);
    const w = this.watcher;
    w.position.set(MASK_POS.x + Math.sin(this.t * 0.23) * 0.12, MASK_POS.y + Math.sin(this.t * 0.6) * 0.1, MASK_POS.z);
    w.quaternion.copy(cam.quaternion);
    w.rotateZ(Math.sin(this.t * 0.31) * 0.025); // inclina a cabeça devagar
    w.scale.setScalar(MASK_SCALE * (1 + Math.sin(this.t * 0.6) * 0.008));
    const wp = w.position.clone().project(cam);
    const ndc = new THREE.Vector2(wp.x, wp.y);

    // máscara não pisca: a brasinha dentro do buraco é que apaga um instante (às vezes duas vezes)
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blink < 0) { this.blink = 0; this.blinkAt = Math.random() < 0.2 ? 0.3 : 3 + Math.random() * 5; }
    let ember = 1;
    if (this.blink >= 0) {
      this.blink += dt;
      ember = Math.min(1, Math.abs(1 - this.blink / 0.1));
      if (this.blink > 0.2) this.blink = -1;
    }
    const wide = Math.min(1, this.wide);
    const k = 1 - Math.exp(-dt * 3);
    this.anger += ((this.mood === 'angry' ? 1 : 0) * (1 - wide) - this.anger) * k;
    this.squint += ((this.mood === 'amused' ? 0.85 : this.mood === 'angry' ? 0.3 : 0.2) * (1 - wide) - this.squint) * k;
    this.crackFlash = Math.max(0, this.crackFlash - dt * 1.5);
    this.wu.uCrackFlash.value = this.crackFlash;
    this.wu.uOpen.value = 1 + wide * 0.7;
    this.wu.uPupil.value = (0.007 - wide * 0.002 + Math.sin(this.t * 0.4) * 0.0006) * ember;
    this.wu.uAnger.value = this.anger;
    this.wu.uSquint.value = this.squint;
    this.wu.uTime.value = this.t;
    this.wu.uFade.value = this.fade;

    // olhar: compara na tela a posição do alvo com a dos olhos (ele olha "para baixo", para a mesa)
    const tp = this.target.clone().project(cam);
    const lx = THREE.MathUtils.clamp((tp.x - ndc.x) * 1.3, -1, 1);
    const ly = THREE.MathUtils.clamp((tp.y - ndc.y) * 0.9, -1, 0.4);
    this.look.lerp(new THREE.Vector2(lx, ly), 1 - Math.exp(-dt * 5));
    (this.wu.uLook.value as THREE.Vector2).copy(this.look);
  }
}
