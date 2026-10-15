import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOARD } from '../core/mapgen';
import { feltTexture, gridTexture, woodTexture } from './textures';

// Renderer + cena do diorama: mesa de madeira, tapete de feltro, luz quente de abajur, bloom,
// tilt-shift (miniatura) e vinheta.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.9 },
    uTilt: { value: 1.0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uTilt; uniform float uTime; uniform float uFlash; uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      // tilt-shift: desfoca topo e base da tela (efeito maquete)
      float band = abs(vUv.y - 0.46);
      float amt = smoothstep(0.16, 0.5, band) * 2.4 * uTilt;
      vec4 c = texture2D(tDiffuse, vUv);
      if (amt > 0.01) {
        vec2 px = amt / uRes;
        vec4 acc = c * 0.2;
        acc += texture2D(tDiffuse, vUv + vec2( px.x, 0.0)) * 0.1;
        acc += texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)) * 0.1;
        acc += texture2D(tDiffuse, vUv + vec2(0.0,  px.y)) * 0.1;
        acc += texture2D(tDiffuse, vUv + vec2(0.0, -px.y)) * 0.1;
        acc += texture2D(tDiffuse, vUv + px * 1.6) * 0.1;
        acc += texture2D(tDiffuse, vUv - px * 1.6) * 0.1;
        acc += texture2D(tDiffuse, vUv + vec2(px.x, -px.y) * 1.6) * 0.1;
        acc += texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 1.6) * 0.1;
        c = acc;
      }
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * uVignette * 1.6;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (rnd(vUv * uRes) - 0.5) * 0.025;
      c.rgb += vec3(1.0, 0.85, 0.6) * uFlash;
      gl_FragColor = c;
    }`,
};

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finish: ShaderPass;
  sun: THREE.DirectionalLight;
  lamp: THREE.PointLight;
  postFx = true;
  private clockT = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.scene.background = new THREE.Color('#140d0a');
    this.scene.fog = new THREE.Fog('#140d0a', 26, 48);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.32;

    this.scene.add(new THREE.HemisphereLight('#ffe7c4', '#2a1a10', 0.55));
    this.sun = new THREE.DirectionalLight('#ffd7a1', 2.2);
    this.sun.position.set(-7, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -11; sc.right = 11; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight('#8fb4ff', 0.55);
    rim.position.set(8, 6, -9);
    this.scene.add(rim);
    // abajur quente acima da mesa (flash das explosões usa ele)
    this.lamp = new THREE.PointLight('#ffb36b', 0, 14, 1.6);
    this.lamp.position.set(0, 3, 0);
    this.scene.add(this.lamp);

    this.buildTable();
    this.buildProps();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private buildTable() {
    const W = BOARD.w, D = BOARD.d;
    // tapete de feltro (área jogável)
    const felt = feltTexture();
    felt.repeat.set(W / 4, D / 4);
    const mat = new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 });
    const mat2 = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
    mat2.rotation.x = -Math.PI / 2;
    mat2.receiveShadow = true;
    this.scene.add(mat2);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: gridTexture(W, D), transparent: true, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.003;
    this.scene.add(grid);
    // moldura de madeira
    const wood = woodTexture();
    const frameMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0.0 });
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
    const top = woodTexture('#4a2c17', '#24140a', 21);
    top.repeat.set(3, 6);
    top.rotation = Math.PI / 2;
    const table = new THREE.Mesh(new THREE.BoxGeometry(W + 10, 0.6, D + 8), new THREE.MeshStandardMaterial({ map: top, roughness: 0.5 }));
    table.position.y = -0.31;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  /** Objetos de mesa fora do tabuleiro: caneca, lápis, dado, dominós de reserva (clima de maquete). */
  private buildProps() {
    const W = BOARD.w, D = BOARD.d;
    const m = (c: string, r = 0.5, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const add = (o: THREE.Object3D) => { o.traverse((c) => { (c as THREE.Mesh).castShadow = true; (c as THREE.Mesh).receiveShadow = true; }); this.scene.add(o); };
    // caneca
    const mug = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.2, 32, 1, true), m('#c9473a', 0.35));
    (body.material as THREE.Material).side = THREE.DoubleSide;
    body.position.y = 0.6;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), m('#c9473a', 0.35));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.02;
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), m('#2b170c', 0.15));
    coffee.rotation.x = -Math.PI / 2; coffee.position.y = 1.0;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 24, Math.PI * 1.2), m('#c9473a', 0.35));
    handle.position.set(0.58, 0.6, 0); handle.rotation.z = -Math.PI * 0.6;
    mug.add(body, bottom, coffee, handle);
    mug.position.set(W / 2 + 2.2, 0, -D / 2 + 1.2);
    add(mug);
    // lápis
    const pencil = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), m('#f2c14e', 0.5));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 6), m('#e8c9a0', 0.6));
    tip.position.y = 1.62;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.2, 12), m('#e58a9a', 0.8));
    eraser.position.y = -1.6;
    pencil.add(wood, tip, eraser);
    pencil.rotation.set(0, 0.5, Math.PI / 2);
    pencil.position.set(-W / 2 - 1.6, 0.07, D / 2 - 0.5);
    add(pencil);
    // dado
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), m('#f6efe2', 0.3));
    die.position.set(W / 2 + 1.5, 0.25, D / 2 - 1.0);
    die.rotation.y = 0.6;
    for (const [x, z] of [[-0.12, -0.12], [0, 0], [0.12, 0.12]]) {
      const pip = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), m('#c9473a', 0.4));
      pip.rotation.x = -Math.PI / 2; pip.position.set(x, 0.251, z);
      die.add(pip);
    }
    add(die);
    // dominós de reserva deitados em pilha
    const spare = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.8), m('#ebdfc6', 0.35));
      b.position.set(Math.sin(i * 1.7) * 0.05, 0.06 + i * 0.125, Math.cos(i * 2.1) * 0.05);
      b.rotation.y = i * 0.12;
      spare.add(b);
    }
    spare.position.set(-W / 2 - 1.8, 0, -D / 2 + 1.5);
    add(spare);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.finish.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  render(dt: number, flash: number) {
    this.clockT += dt;
    this.finish.uniforms.uTime.value = this.clockT % 100;
    this.finish.uniforms.uFlash.value = flash;
    if (this.postFx) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  setTiltShift(on: boolean) { this.finish.uniforms.uTilt.value = on ? 1 : 0; }
}
