import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOARD } from '../core/mapgen';
import { feltTexture, gridTexture, woodTexture, cardBackTexture } from './textures';
import { glow } from './models';
import { Backdrop, SWIRL_GLSL } from './backdrop';

// Renderer + cena: mesa velha no escuro, uma lâmpada pendurada que balança e pisca, velas,
// fundo de redemoinho com olhos. Pós: bloom + acabamento CRT (scanlines, barril, aberração
// cromática que reage a impacto), vinheta e grão.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 1.0 },
    uTilt: { value: 1.0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uImpact: { value: 0 },
    uCrt: { value: 1.0 },
    uSwirlT: { value: 0 },
    uPulse: { value: 0 },
    uAz: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uTilt; uniform float uTime; uniform float uFlash;
    uniform float uImpact; uniform float uCrt; uniform vec2 uRes;
    uniform float uSwirlT; uniform float uPulse; uniform float uAz;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    ${SWIRL_GLSL}
    // amostra com tilt-shift opcional (desfoca topo e base da tela)
    vec3 samp(vec2 uv){
      float band = abs(uv.y - 0.46);
      float amt = smoothstep(0.16, 0.5, band) * 2.4 * uTilt;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (amt < 0.01) return c;
      vec2 px = amt / uRes;
      vec3 acc = c * 0.2;
      acc += texture2D(tDiffuse, uv + vec2( px.x, 0.0)).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + vec2(0.0,  px.y)).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + px * 1.6).rgb * 0.1;
      acc += texture2D(tDiffuse, uv - px * 1.6).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + vec2(px.x, -px.y) * 1.6).rgb * 0.1;
      acc += texture2D(tDiffuse, uv + vec2(-px.x, px.y) * 1.6).rgb * 0.1;
      return acc;
    }
    void main(){
      // curvatura de tubo (barril) — aumenta no impacto
      vec2 d0 = vUv - 0.5;
      float k = uCrt * 0.07 + uImpact * 0.10;
      vec2 uv = 0.5 + d0 * (1.0 + k * dot(d0, d0));
      // tremida horizontal de sinal ruim no impacto
      uv.x += sin(uv.y * 46.0 + uTime * 37.0) * 0.0022 * uImpact;
      vec2 edge = smoothstep(vec2(0.0), vec2(0.004), uv) * smoothstep(vec2(0.0), vec2(0.004), 1.0 - uv);
      // aberração cromática radial
      vec2 dir = uv - 0.5;
      float ca = 0.0035 * uCrt + 0.03 * uImpact;
      vec3 c;
      c.r = samp(uv + dir * ca).r;
      c.g = samp(uv).g;
      c.b = samp(uv - dir * ca).b;
      // gradação: sombras frias/arroxeadas, luz quente
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c * vec3(0.82, 0.86, 1.08), c * vec3(1.06, 0.98, 0.88), smoothstep(0.05, 0.6, l));
      // o breu respira: redemoinho de tinta nas áreas escuras, mais forte nas bordas da tela
      float swirlK = (1.0 - smoothstep(0.004, 0.06, l)) * smoothstep(0.12, 0.55, length(dir)) * 1.4;
      if (swirlK > 0.002) {
        vec2 suv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        suv.x += uAz * 0.25;
        c += swirl(suv, uSwirlT, uPulse) * swirlK;
      }
      // scanlines + máscara fina de fósforo
      float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * 2.094);
      c *= 1.0 - uCrt * 0.07 * sl;
      // vinheta forte
      float v = 1.0 - dot(dir, dir) * uVignette * 2.0;
      c *= clamp(v, 0.0, 1.0) * edge.x * edge.y;
      // grão + oscilação de exposição (lâmpada velha)
      c += (rnd(uv * uRes) - 0.5) * 0.035;
      c *= 1.0 + (rnd(vec2(0.37, 0.71)) - 0.5) * 0.02 * uCrt;
      c += vec3(1.0, 0.82, 0.55) * uFlash;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

interface Flame { m: THREE.Object3D; base: number; ph: number }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finish: ShaderPass;
  /** lâmpada pendurada (luz principal) */
  hanging: THREE.SpotLight;
  /** luz de flash das explosões (game.ts posiciona e acende) */
  lamp: THREE.PointLight;
  backdrop: Backdrop;
  postFx = true;
  /** 0..1, aberração/distorção de impacto (vem do trauma da câmera) */
  impact = 0;
  private clockT = 0;
  private swing = new THREE.Group();
  private lampModel = new THREE.Group();
  private lampBase = 400;
  private flickerUntil = 0;
  private nextFlicker = 6;
  private flames: Flame[] = [];
  private candleLights: { l: THREE.PointLight; base: number; ph: number }[] = [];

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.scene.background = new THREE.Color('#050307');
    this.scene.fog = new THREE.Fog('#050307', 24, 44);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.12;

    this.scene.add(new THREE.HemisphereLight('#6a5a80', '#0a0608', 0.5));
    // contraluz fria bem fraca (silhuetas no escuro)
    const rim = new THREE.DirectionalLight('#5a6aa0', 0.35);
    rim.position.set(6, 5, -10);
    this.scene.add(rim);

    // lâmpada pendurada: pivô no teto, balança devagar
    this.swing.position.set(0, 21, 0.4);
    this.scene.add(this.swing);
    const drop = 10;
    this.hanging = new THREE.SpotLight('#ffd09a', this.lampBase, 0, 0.82, 0.55, 1.6);
    this.hanging.position.set(0, -drop, 0);
    this.hanging.target.position.set(0, -drop - 10, 0);
    this.hanging.castShadow = true;
    this.hanging.shadow.mapSize.set(2048, 2048);
    this.hanging.shadow.camera.near = 2;
    this.hanging.shadow.camera.far = 30;
    this.hanging.shadow.bias = -0.0004;
    this.hanging.shadow.normalBias = 0.02;
    this.hanging.shadow.radius = 3;
    this.swing.add(this.hanging, this.hanging.target);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, drop, 6), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 }));
    cord.position.y = -drop / 2 + 0.3;
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2b2520', roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.95, 0.7, 28, 1, true), shadeMat);
    shade.position.y = -drop + 0.25;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glow('#ffd9a0', 6));
    bulb.position.y = -drop + 0.02;
    this.lampModel.add(cord, shade, bulb);
    this.swing.add(this.lampModel);

    // flash das explosões
    this.lamp = new THREE.PointLight('#ff9a4a', 0, 14, 1.6);
    this.lamp.position.set(0, 3, 0);
    this.scene.add(this.lamp);

    this.buildTable();
    this.buildProps();
    this.backdrop = new Backdrop(this.scene);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 1.15);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildTable() {
    const W = BOARD.w, D = BOARD.d;
    // pano velho e manchado (área jogável)
    const felt = feltTexture();
    felt.repeat.set(W / 8, D / 8);
    const mat = new THREE.MeshStandardMaterial({ map: felt, roughness: 0.97 });
    const mat2 = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
    mat2.rotation.x = -Math.PI / 2;
    mat2.receiveShadow = true;
    this.scene.add(mat2);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: gridTexture(W, D), transparent: true, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.003;
    this.scene.add(grid);
    // moldura de madeira escura
    const wood = woodTexture();
    const frameMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6, metalness: 0.0 });
    const t = 0.35, h = 0.12;
    const bars: [number, number, number, number][] = [
      [0, -D / 2 - t / 2, W + 2 * t, t], [0, D / 2 + t / 2, W + 2 * t, t],
      [-W / 2 - t / 2, 0, t, D], [W / 2 + t / 2, 0, t, D],
    ];
    for (const [x, z, w, d] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, h / 2 - 0.02, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
    // tampo da mesa
    const top = woodTexture('#2c1a0f', '#100804', 21);
    top.repeat.set(3, 6);
    top.rotation = Math.PI / 2;
    // mesa menor que antes: em volta dela só o breu (onde flutuam os olhos)
    const table = new THREE.Mesh(new RoundedBoxGeometry(W + 6.5, 0.6, D + 5, 3, 0.12), new THREE.MeshStandardMaterial({ map: top, roughness: 0.55 }));
    table.position.y = -0.31;
    table.receiveShadow = true;
    this.scene.add(table);
    // pés da mesa sumindo no escuro
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), new THREE.MeshStandardMaterial({ map: top, roughness: 0.6 }));
      leg.position.set(sx * (W / 2 + 2.6), -4.1, sz * (D / 2 + 1.9));
      this.scene.add(leg);
    }
  }

  /** Objetos de mesa fora do tabuleiro: velas, crânio, ossos, cartas velhas. */
  private buildProps() {
    const W = BOARD.w, D = BOARD.d;
    const m = (c: string, r = 0.6, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const add = (o: THREE.Object3D) => { o.traverse((c) => { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true; }); this.scene.add(o); };
    const wax = m('#cfc3a4', 0.55);
    const bone = m('#cbbf9f', 0.75);
    const dark = m('#0b0907', 0.9);

    const candle = (x: number, z: number, h: number, r: number, light: boolean) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 18), wax);
      body.position.y = h / 2;
      g.add(body);
      // cera escorrida
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9 + x;
        const len = h * (0.2 + ((i * 37) % 10) / 22);
        const drip = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, len, 3, 8), wax);
        drip.position.set(Math.cos(a) * r * 0.93, h - len / 2 - r * 0.1, Math.sin(a) * r * 0.93);
        g.add(drip);
      }
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.7, 0.04, 20), wax);
      pool.position.y = 0.02;
      g.add(pool);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 5), dark);
      wick.position.y = h + 0.03;
      g.add(wick);
      g.position.set(x, 0, z);
      add(g);
      const flame = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow('#ff9a3c', 4));
      outer.scale.set(0.75, 1.9, 0.75);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), glow('#fff0c8', 7));
      inner.scale.set(0.8, 1.6, 0.8);
      inner.position.y = -0.02;
      flame.add(outer, inner);
      flame.position.set(x, h + 0.1, z);
      this.scene.add(flame);
      this.flames.push({ m: flame, base: 1, ph: x * 3.1 + z });
      if (light) {
        const l = new THREE.PointLight('#ff8a3a', 6, 7, 1.6);
        l.position.set(x, h + 0.35, z);
        this.scene.add(l);
        this.candleLights.push({ l, base: 6, ph: x + z * 2 });
      }
    };
    // grupo de velas à direita (fundo) e à esquerda (frente)
    candle(W / 2 + 1.5, -D / 2 + 0.9, 1.1, 0.13, true);
    candle(W / 2 + 1.95, -D / 2 + 1.35, 0.7, 0.11, false);
    candle(W / 2 + 1.25, -D / 2 + 1.55, 0.45, 0.1, false);
    candle(-W / 2 - 1.6, D / 2 - 1.0, 0.9, 0.12, true);
    candle(-W / 2 - 2.1, D / 2 - 0.6, 0.55, 0.1, false);

    // crânio
    const skull = new THREE.Group();
    const cran = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), bone);
    cran.scale.set(0.92, 0.88, 1.08);
    cran.position.y = 0.42;
    const face = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.26, 0.3, 3, 0.08), bone);
    face.position.set(0, 0.2, 0.2);
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.26, 2, 0.04), bone);
    jaw.position.set(0, 0.06, 0.22);
    jaw.rotation.x = 0.12;
    skull.add(cran, face, jaw);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), dark);
      eye.scale.set(1, 0.9, 0.55);
      eye.position.set(sx * 0.11, 0.33, 0.33);
      skull.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), dark);
    nose.position.set(0, 0.22, 0.36);
    nose.rotation.x = Math.PI;
    skull.add(nose);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.03), m('#e2d8bd', 0.5));
      tooth.position.set(-0.09 + i * 0.036, 0.11, 0.35);
      skull.add(tooth);
    }
    skull.position.set(W / 2 + 2.3, 0, D / 2 - 1.4);
    skull.rotation.y = -0.7;
    add(skull);

    // ossos
    const boneAt = (x: number, z: number, yaw: number, len: number) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), bone);
      shaft.rotation.z = Math.PI / 2;
      g.add(shaft);
      for (const s of [-1, 1]) for (const o of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bone);
        knob.position.set(s * len / 2, 0, o * 0.04);
        g.add(knob);
      }
      g.position.set(x, 0.055, z);
      g.rotation.y = yaw;
      add(g);
    };
    boneAt(W / 2 + 1.7, D / 2 - 0.5, 0.4, 0.8);
    boneAt(W / 2 + 2.6, D / 2 - 0.3, -0.9, 0.6);
    boneAt(-W / 2 - 1.9, -D / 2 + 3.1, 1.2, 0.7);

    // cartas velhas espalhadas
    const back = cardBackTexture();
    const cardMat = [m('#1a1410', 0.8), m('#1a1410', 0.8), new THREE.MeshStandardMaterial({ map: back, roughness: 0.85 }), m('#b7a988', 0.9), m('#1a1410', 0.8), m('#1a1410', 0.8)];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.9), cardMat);
      c.position.set(-W / 2 - 2.0 + Math.sin(i * 2.3) * 0.3, 0.008 + i * 0.013, -D / 2 + 1.6 + Math.cos(i * 1.7) * 0.25);
      c.rotation.y = i * 0.4 - 0.3;
      add(c);
    }
  }

  /** Pisca a lâmpada por um tempo (sustos, chegada da mão). */
  flicker(dur = 0.6) { this.flickerUntil = Math.max(this.flickerUntil, this.clockT + dur); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.finish.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  private animate(dt: number) {
    const t = this.clockT;
    // balanço da lâmpada
    this.swing.rotation.z = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 0.37 + 2) * 0.018;
    this.swing.rotation.x = Math.sin(t * 0.71 + 1) * 0.022;
    // pisca-pisca: de vez em quando sozinha, ou quando pedido
    if (t > this.nextFlicker) { this.flicker(0.25 + Math.random() * 0.35); this.nextFlicker = t + 7 + Math.random() * 12; }
    let k = 1 + Math.sin(t * 13) * 0.015;
    if (t < this.flickerUntil) k *= Math.random() < 0.45 ? 0.28 + Math.random() * 0.25 : 0.8 + Math.random() * 0.25;
    this.hanging.intensity = this.lampBase * k;
    // a lâmpada some quando a câmera está acima dela (não tapa a visão de cima)
    const bulbY = this.swing.position.y - 10;
    this.lampModel.visible = this.camera.position.y < bulbY - 0.6;
    for (const f of this.flames) {
      const n = Math.sin(t * 9 + f.ph) * 0.5 + Math.sin(t * 23 + f.ph * 2) * 0.3 + (Math.random() - 0.5) * 0.25;
      f.m.scale.set(1 - n * 0.06, 1 + n * 0.18, 1 - n * 0.06);
      f.m.rotation.z = Math.sin(t * 5 + f.ph) * 0.08;
    }
    for (const c of this.candleLights) c.l.intensity = c.base * (0.85 + Math.sin(t * 11 + c.ph) * 0.08 + Math.random() * 0.1);
    this.backdrop.update(dt, this.camera);
  }

  render(dt: number, flash: number) {
    this.clockT += dt;
    this.animate(dt);
    const u = this.finish.uniforms;
    u.uTime.value = this.clockT % 100;
    u.uFlash.value = flash;
    u.uImpact.value = this.impact;
    u.uSwirlT.value = this.clockT;
    u.uPulse.value = this.backdrop.pulse;
    u.uAz.value = Math.atan2(this.camera.position.x, this.camera.position.z);
    if (this.postFx) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  setTiltShift(on: boolean) { this.finish.uniforms.uTilt.value = on ? 1 : 0; }
  setCrt(on: boolean) { this.finish.uniforms.uCrt.value = on ? 1 : 0; }
}
