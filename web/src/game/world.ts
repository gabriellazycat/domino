import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOARD } from '../core/mapgen';
import { feltTexture, gridTexture, woodTexture, cardBackTexture } from './textures';
import { glow } from './models';
import { Backdrop, SWIRL_GLSL, MASK_POS } from './backdrop';
import { softDot } from './textures';

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
    uTension: { value: 0 },
    uAz: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    // onda de choque de explosão: centro em UV e progresso (1 = parada)
    uShockC: { value: new THREE.Vector2(0.5, 0.5) },
    uShockT: { value: 1 },
    // foco cinematográfico: força do desfoque radial nas bordas (0 = desligado)
    uLens: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uTilt; uniform float uTime; uniform float uFlash;
    uniform float uImpact; uniform float uCrt; uniform vec2 uRes;
    uniform float uSwirlT; uniform float uPulse; uniform float uTension; uniform float uAz;
    uniform vec2 uShockC; uniform float uShockT; uniform float uLens;
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
      // efeito TV (CRT): tudo multiplicado por uCrt — desligado nas Opções, some inteiro
      float imp = uImpact * uCrt;
      // onda de choque: anel de distorção que se expande a partir da explosão (some ao sair da tela)
      vec2 sv = vUv - uShockC;
      float sdist = length(vec2(sv.x * uRes.x / uRes.y, sv.y));
      float ring = exp(-pow((sdist - uShockT * 0.9) * 11.0, 2.0)) * max(0.0, 1.0 - uShockT);
      vec2 base = vUv + normalize(sv + 1e-5) * ring * 0.028;
      // curvatura de tubo (barril) — leve; aumenta um pouco no impacto
      vec2 d0 = base - 0.5;
      float k = uCrt * 0.035 + imp * 0.06;
      vec2 uv = 0.5 + d0 * (1.0 + k * dot(d0, d0));
      // tremida horizontal de sinal ruim no impacto
      uv.x += sin(uv.y * 46.0 + uTime * 37.0) * 0.0015 * imp;
      vec2 edge = smoothstep(vec2(0.0), vec2(0.002), uv) * smoothstep(vec2(0.0), vec2(0.002), 1.0 - uv);
      // aberração cromática radial (bem fraca; só cresce no impacto)
      vec2 dir = uv - 0.5;
      float ca = 0.001 * uCrt + 0.018 * imp;
      vec3 c;
      c.r = samp(uv + dir * ca).r;
      c.g = samp(uv).g;
      c.b = samp(uv - dir * ca).b;
      // foco cinematográfico: desfoque radial que cresce para as bordas (o centro, onde está a cascata, fica nítido)
      float lens = uLens * smoothstep(0.22, 0.75, length(dir));
      if (lens > 0.002) {
        vec3 acc = c;
        float wsum = 1.0;
        for (int i = 1; i < 7; i++) {
          float f = float(i) / 6.0;
          float w = 1.0 - f * 0.5;
          acc += texture2D(tDiffuse, uv - dir * lens * 0.05 * f).rgb * w;
          wsum += w;
        }
        c = acc / wsum;
      }
      // gradação: sombras frias/arroxeadas, luz quente
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c * vec3(0.82, 0.86, 1.08), c * vec3(1.06, 0.98, 0.88), smoothstep(0.05, 0.6, l));
      // o breu respira: redemoinho de tinta só no que é quase preto, bem de leve (não pode atrapalhar a leitura)
      float swirlK = (1.0 - smoothstep(0.002, 0.03, l)) * smoothstep(0.2, 0.6, length(dir)) * 0.35;
      if (swirlK > 0.002) {
        vec2 suv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        suv.x += uAz * 0.25;
        c += swirl(suv, uSwirlT, uPulse, uTension) * swirlK;
      }
      // scanlines + máscara fina de fósforo
      float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * 2.094);
      c *= 1.0 - uCrt * 0.07 * sl;
      // vinheta suave (só escurece de leve os cantos)
      float v = 1.0 - dot(dir, dir) * uVignette * 0.8;
      c *= clamp(v, 0.0, 1.0) * edge.x * edge.y;
      // grão + oscilação de exposição (lâmpada velha)
      c += (rnd(uv * uRes) - 0.5) * 0.02 * uCrt;
      c *= 1.0 + (rnd(vec2(0.37, 0.71)) - 0.5) * 0.02 * uCrt;
      c += vec3(1.0, 0.82, 0.55) * uFlash;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * Oclusão ambiental (GTAO): escurece as frestas de contato (peça na mesa, pé de vela, caveira).
 * Objetos transparentes (feixe, poeira, brilhos) ficam de fora: senão a névoa escureceria a cena.
 */
class ContactAO extends GTAOPass {
  constructor(...args: ConstructorParameters<typeof GTAOPass>) {
    super(...args);
    // Blindagem contra NaN: no D3D (ANGLE/Windows) acos/sqrt fora de [-1,1] e normalize de vetor nulo dão NaN, que o
    // alvo HalfFloat carrega e o bloom espalha em blocos pretos piscando. Saneia no shader do GTAO e no blend.
    const safeNorm = (e: string) => `((${e}) * inversesqrt(max(dot(${e}, ${e}), 1e-10)))`;
    const fs = this.gtaoMaterial.fragmentShader
      .replace('vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);',
        'cosHorizons = clamp(cosHorizons, -0.9999, 0.9999);\n\t\t\t\tvec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);')
      .replaceAll('normalize(viewDelta)', safeNorm('viewDelta'))
      .replace('normalize(cross(sampleDir.xyz, viewDir))', safeNorm('cross(sampleDir.xyz, viewDir)'))
      .replace('normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent))',
        safeNorm('viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent)'))
      .replace('ao = clamp(ao / float(DIRECTIONS), 0., 1.);',
        'float aoRaw = ao / float(DIRECTIONS);\n\t\t\tao = (aoRaw >= 0. && aoRaw <= 1.) ? aoRaw : ((aoRaw < 0.) ? 0. : 1.);');
    this.gtaoMaterial.fragmentShader = fs;
    this.gtaoMaterial.needsUpdate = true;
    this.blendMaterial.fragmentShader = this.blendMaterial.fragmentShader.replace(
      'gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);',
      'vec3 a = texel.rgb;\n\t\t\tbool ok = a.r >= 0. && a.g >= 0. && a.b >= 0. && a.r <= 1. && a.g <= 1. && a.b <= 1.;\n\t\t\tgl_FragColor = vec4(mix(vec3(1.), ok ? a : vec3(1.), intensity), 1.0);');
    this.blendMaterial.needsUpdate = true;
  }

  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (o.visible && o.userData.noAO) o.visible = false;
      else if (o.visible && m && !Array.isArray(m) && m.transparent) o.visible = false;
    });
  }
}

/** Brasas que sobem das chamas das velas (aditivas; brilham no bloom porque passam do limiar de 3,8). */
const EmberShader = {
  uniforms: {
    uPx: { value: 800 },
    uMap: { value: null as THREE.Texture | null },
  },
  vertexShader: `
    attribute float aLife; attribute float aSz;
    uniform float uPx;
    varying float vL;
    void main(){
      vL = aLife;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSz * (1.0 - 0.5 * aLife) * uPx / -mv.z;
    }`,
  fragmentShader: `
    uniform sampler2D uMap; varying float vL;
    void main(){
      float a = texture2D(uMap, gl_PointCoord).a * smoothstep(0.0, 0.12, vL) * (1.0 - vL);
      gl_FragColor = vec4(vec3(1.0, 0.5, 0.2) * 6.5, a);
    }`,
};
const N_EMBERS = 56;

/**
 * Estilo gravura (opcional): contornos de tinta (Sobel na luminância), cores em poucos tons com tramado
 * (dither, como em impressão antiga) e um tom de papel. Não usa arquivo nenhum: tudo sai do shader.
 */
const InkShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLevels: { value: 9 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uLevels;
    varying vec2 vUv;
    float lum(vec2 o){ return dot(texture2D(tDiffuse, vUv + o / uRes).rgb, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float tl = lum(vec2(-1.0, 1.0)), t = lum(vec2(0.0, 1.0)), tr = lum(vec2(1.0, 1.0));
      float l = lum(vec2(-1.0, 0.0)), r = lum(vec2(1.0, 0.0));
      float bl = lum(vec2(-1.0, -1.0)), b = lum(vec2(0.0, -1.0)), br = lum(vec2(1.0, -1.0));
      float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
      float edge = smoothstep(0.1, 0.28, length(vec2(gx, gy)));
      // tramado interleaved-gradient: quebra o degradê em degraus finos
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      vec3 q = floor(c * uLevels + 0.5 + n * 0.55) / uLevels;
      vec3 paper = mix(vec3(1.0), vec3(1.0, 0.93, 0.8), 0.45);
      gl_FragColor = vec4(q * paper * (1.0 - edge * 0.85), 1.0);
    }`,
};

/** Altura do gancho da lâmpada (pivô do balanço) e comprimento da corrente. */
const HANG_Y = 21, DROP = 10;
/** Ângulo do cone da lâmpada (igual ao SpotLight): o feixe alarga na mesma razão. */
const SPOT_ANGLE = 0.6;
/** Força da luz de preenchimento em relação à lâmpada. */
const FILL_K = 0.36;
const BEAM_H = HANG_Y - DROP;
const BEAM_R = BEAM_H * Math.tan(SPOT_ANGLE);

/**
 * Feixe volumétrico falso: um cone aditivo que brilha nas bordas (onde o caminho da luz é mais longo),
 * some em direção ao chão e tem uma textura de fumaça que desliza devagar. Não bloqueia nada.
 */
const BeamShader = {
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.1 },
    uColor: { value: new THREE.Color('#ffc27a') },
    uH: { value: BEAM_H },
  },
  vertexShader: `
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      vP = position;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uH;
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vnoise(vec3 p){
      vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y);
      float b = mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y);
      return mix(a, b, f.z);
    }
    void main(){
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float edge = pow(1.0 - facing, 1.5);
      // t = 1 na lâmpada, 0 no chão
      float t = clamp((vP.y + uH * 0.5) / uH, 0.0, 1.0);
      float along = mix(0.12, 1.0, pow(t, 1.3)) * smoothstep(0.0, 0.4, t); // some antes de tocar o chão (sem anel)
      float smoke = vnoise(vP * 0.55 + vec3(uTime * 0.04, uTime * 0.09, -uTime * 0.03));
      float a = uOpacity * along * (0.3 + edge * 1.2) * (0.55 + smoke * 0.9);
      gl_FragColor = vec4(uColor, a);
    }`,
};

/** Poeira no ar, dentro do feixe: pontinhos que flutuam e piscam (só aparecem onde a luz bate). */
const MoteShader = {
  uniforms: {
    uTime: { value: 0 },
    uPx: { value: 800 },
    uMap: { value: null as THREE.Texture | null },
    uOpacity: { value: 0.55 },
  },
  vertexShader: `
    attribute float aPh; attribute float aSz;
    uniform float uTime; uniform float uPx;
    varying float vA;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.21 + aPh * 6.2831) * 0.14;
      p.y += sin(uTime * 0.13 + aPh * 3.1) * 0.22;
      p.z += cos(uTime * 0.17 + aPh * 5.7) * 0.14;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSz * uPx / -mv.z;
      vA = 0.45 + 0.55 * sin(uTime * (0.9 + aPh) + aPh * 40.0);
    }`,
  fragmentShader: `
    uniform sampler2D uMap; uniform float uOpacity;
    varying float vA;
    void main(){
      float d = texture2D(uMap, gl_PointCoord).a;
      gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * (0.5 + vA * 0.6), d * vA * uOpacity);
    }`,
};

/** Cinzas no ar em volta da mesa: pontinhos que descem e derivam devagar, dão profundidade ao breu. */
const AshShader = {
  uniforms: { uTime: { value: 0 }, uPx: { value: 800 }, uMap: { value: null as THREE.Texture | null } },
  vertexShader: `
    attribute float aPh; attribute float aSz;
    uniform float uTime; uniform float uPx;
    varying float vA; varying float vWarm;
    void main(){
      vec3 p = position;
      float t = uTime * (0.08 + aPh * 0.06) + aPh * 40.0;
      p.y = mod(p.y - uTime * (0.12 + aPh * 0.1), 9.0) - 1.0;
      p.x += sin(t * 1.7) * 0.6 + sin(uTime * 0.05 + aPh * 9.0) * 1.2;
      p.z += cos(t * 1.3) * 0.5;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSz * uPx / -mv.z;
      vA = (0.35 + 0.65 * sin(uTime * (0.6 + aPh) + aPh * 30.0) * 0.5 + 0.5) * smoothstep(-1.0, 0.5, p.y) * (1.0 - smoothstep(6.0, 8.0, p.y));
      vWarm = step(0.6, fract(aPh * 7.0));
    }`,
  fragmentShader: `
    uniform sampler2D uMap; varying float vA; varying float vWarm;
    void main(){
      float d = texture2D(uMap, gl_PointCoord).a;
      vec3 c = mix(vec3(0.62, 0.52, 0.78), vec3(1.0, 0.62, 0.32), vWarm);
      gl_FragColor = vec4(c, d * vA * 0.45);
    }`,
};

interface Flame { m: THREE.Object3D; base: number; ph: number }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  ao!: GTAOPass;
  bloom: UnrealBloomPass;
  finish: ShaderPass;
  /** estilo gravura (opcional, nas Opções) */
  ink!: ShaderPass;
  private aoOn = true;
  private lowQ = false;
  /** a lâmpada só pisca quando pedido (a transição entre fases); nunca sozinha */
  private flickerUntil = 0;
  /** foco cinematográfico: 0 = nítido, 1 = bordas desfocadas (sobe só na simulação, opcional nas Opções) */
  private lens = 0;
  private lensTarget = 0;
  /** lâmpada pendurada (luz principal) */
  hanging: THREE.SpotLight;
  /** luz de preenchimento da mesma lâmpada: cone mais aberto e fraco, sem sombra, para as bordas não sumirem */
  private fill: THREE.SpotLight;
  /** luz de flash das explosões (game.ts posiciona e acende) */
  lamp: THREE.PointLight;
  backdrop: Backdrop;
  postFx = true;
  /** 0..1, aberração/distorção de impacto (vem do trauma da câmera) */
  impact = 0;
  private clockT = 0;
  private swing = new THREE.Group();
  private lampModel = new THREE.Group();
  private lampBase = 700;
  private flames: Flame[] = [];
  private candleLights: { l: THREE.PointLight; base: number; ph: number }[] = [];
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private moteMat!: THREE.ShaderMaterial;
  private shockT = 1;
  private shockUV = new THREE.Vector2(0.5, 0.5);
  private flameSpots: THREE.Vector3[] = [];
  private embers!: THREE.Points;
  private emberMat!: THREE.ShaderMaterial;
  private emberLife = new Float32Array(N_EMBERS);
  private emberMax = new Float32Array(N_EMBERS);
  private emberVel = new Float32Array(N_EMBERS * 3);
  private ash!: THREE.Points;
  private ashMat!: THREE.ShaderMaterial;

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
    (this.scene as any).environmentIntensity = 0.07;

    this.scene.add(new THREE.HemisphereLight('#6a5a80', '#0a0608', 0.22));
    // contraluz fria bem fraca (silhuetas no escuro)
    const rim = new THREE.DirectionalLight('#5a6aa0', 0.25);
    rim.position.set(6, 5, -10);
    this.scene.add(rim);

    // lâmpada pendurada: pivô no teto, balança devagar
    this.swing.position.set(0, HANG_Y, 0.4);
    this.scene.add(this.swing);
    const drop = DROP;
    // cone estreito e borda macia: forma uma poça de luz no centro da mesa, a borda cai no breu
    this.hanging = new THREE.SpotLight('#ffd09a', this.lampBase, 0, SPOT_ANGLE, 0.95, 1.6);
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
    // o cone principal acaba antes da beirada do tabuleiro; este alcança as bordas (o centro continua mais claro)
    this.fill = new THREE.SpotLight('#ffcf9a', this.lampBase * FILL_K, 0, 0.95, 0.4, 1.6);
    this.fill.position.set(0, -drop, 0);
    this.fill.target.position.set(0, -drop - 10, 0);
    this.swing.add(this.fill, this.fill.target);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, drop, 6), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 }));
    cord.position.y = -drop / 2 + 0.3;
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2b2520', roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.95, 0.7, 28, 1, true), shadeMat);
    shade.position.y = -drop + 0.25;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glow('#ffd9a0', 6));
    bulb.position.y = -drop + 0.02;
    this.lampModel.add(cord, shade, bulb);
    this.swing.add(this.lampModel);

    // feixe de luz (cone aditivo) e poeira flutuando dentro dele; ficam presos ao balanço da lâmpada
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BeamShader.uniforms), vertexShader: BeamShader.vertexShader, fragmentShader: BeamShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, BEAM_R, BEAM_H, 48, 1, true), this.beamMat);
    this.beam.position.y = -drop - BEAM_H / 2;
    this.beam.renderOrder = 4;
    this.beam.frustumCulled = false;
    this.swing.add(this.beam);
    this.motes = this.makeMotes();
    this.swing.add(this.motes);

    // flash das explosões
    this.lamp = new THREE.PointLight('#ff9a4a', 0, 14, 1.6);
    this.lamp.position.set(0, 3, 0);
    this.scene.add(this.lamp);

    this.buildTable();
    this.buildProps();
    this.embers = this.makeEmbers();
    this.scene.add(this.embers);
    this.ash = this.makeAsh();
    this.scene.add(this.ash);
    this.backdrop = new Backdrop(this.scene);

    // o composer desenha em um alvo com MSAA (4x): sem isso, o pós-processamento serrilha as bordas.
    // Em telas de alta densidade (DPR 2+) os pixels extras já escondem o serrilhado, então poupa-se a memória.
    const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: window.devicePixelRatio >= 2 ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new ContactAO(this.scene, this.camera, 256, 256);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 0.6, scale: 1, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.ao);
    // saneia NaN/Inf antes do bloom: um único pixel inválido vira um bloco preto piscando quando o bloom o espalha
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a);
        }`,
    }));
    // limiar alto: só o que é realmente quente (chamas, faíscas, olhos) brilha. O topo dos dominós sob a
    // lâmpada chega a ~3–3,5 (linear), por isso o limiar fica acima disso; faíscas/brasas usam ×11 para passar.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 3.8);
    this.composer.addPass(this.bloom);
    this.ink = new ShaderPass(InkShader);
    this.ink.enabled = false;
    this.composer.addPass(this.ink);
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
    // filete de latão na beirada de dentro: a lâmpada só ilumina o centro, então a borda da área
    // jogável sumia no escuro; o filete tem um brilho próprio fraco e desenha o limite em volta toda
    const brass = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.35, metalness: 0.7, emissive: '#5a3c14', emissiveIntensity: 0.55 });
    const s = 0.035;
    const trims: [number, number, number, number][] = [
      [0, -D / 2 - s / 2, W + 2 * s, s], [0, D / 2 + s / 2, W + 2 * s, s],
      [-W / 2 - s / 2, 0, s, D], [W / 2 + s / 2, 0, s, D],
    ];
    for (const [x, z, w, d] of trims) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), brass);
      m.position.set(x, h - 0.02 + 0.01, z);
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

  /** Sistema de brasas: pontos que nascem nas chamas das velas e sobem devagar (atualizado em `animate`). */
  private makeEmbers(): THREE.Points {
    const pos = new Float32Array(N_EMBERS * 3), life = new Float32Array(N_EMBERS), sz = new Float32Array(N_EMBERS);
    for (let i = 0; i < N_EMBERS; i++) {
      this.emberMax[i] = 0; // nasce "morta" e acende na primeira atualização
      life[i] = 1;
      sz[i] = 0.035 + Math.random() * 0.03;
      pos[i * 3 + 1] = -100; // escondida fora da cena até nascer
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
    this.emberMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(EmberShader.uniforms), vertexShader: EmberShader.vertexShader, fragmentShader: EmberShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.emberMat.uniforms.uMap.value = softDot();
    const pts = new THREE.Points(g, this.emberMat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    return pts;
  }

  private updateEmbers(dt: number) {
    if (!this.flameSpots.length) return;
    const pos = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const life = this.embers.geometry.getAttribute('aLife') as THREE.BufferAttribute;
    for (let i = 0; i < N_EMBERS; i++) {
      this.emberLife[i] += dt;
      if (this.emberLife[i] >= this.emberMax[i]) {
        // renasce numa chama, com subida lenta e um pouco de deriva lateral
        const s = this.flameSpots[Math.floor(Math.random() * this.flameSpots.length)];
        this.emberLife[i] = 0;
        this.emberMax[i] = 1.6 + Math.random() * 1.2;
        pos.setXYZ(i, s.x + (Math.random() - 0.5) * 0.06, s.y, s.z + (Math.random() - 0.5) * 0.06);
        this.emberVel[i * 3] = (Math.random() - 0.5) * 0.12;
        this.emberVel[i * 3 + 1] = 0.35 + Math.random() * 0.3;
        this.emberVel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      }
      const k = i * 3;
      const sway = Math.sin(this.clockT * 2.3 + i) * 0.04 * dt;
      pos.setXYZ(i, pos.getX(i) + (this.emberVel[k] + sway) * dt, pos.getY(i) + this.emberVel[k + 1] * dt, pos.getZ(i) + this.emberVel[k + 2] * dt);
      life.setX(i, this.emberLife[i] / this.emberMax[i]);
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;
  }

  /** Cinzas: espalhadas num volume em volta da mesa (mais nas bordas e no fundo, pouco em cima do tabuleiro). */
  private makeAsh(): THREE.Points {
    const N = 260;
    const pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 8; k++) {
        x = (Math.random() - 0.5) * 34; z = -16 + Math.random() * 26;
        if (Math.abs(x) > 8.5 || z < -5.5 || z > 6) break; // evita o meio do tabuleiro
      }
      pos[i * 3] = x; pos[i * 3 + 1] = Math.random() * 9; pos[i * 3 + 2] = z;
      ph[i] = Math.random();
      sz[i] = 0.03 + Math.random() * 0.05;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
    this.ashMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AshShader.uniforms), vertexShader: AshShader.vertexShader, fragmentShader: AshShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ashMat.uniforms.uMap.value = softDot();
    const pts = new THREE.Points(g, this.ashMat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    pts.userData.noAO = true;
    return pts;
  }

  /** Poeira: pontos espalhados dentro do cone da lâmpada (coordenadas locais ao balanço). */
  private makeMotes(): THREE.Points {
    const N = 150;
    const pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = 0.4 + Math.pow(Math.random(), 0.85) * (BEAM_H - 0.8); // profundidade abaixo da lâmpada
      const r = Math.sqrt(Math.random()) * (0.1 + (d / BEAM_H) * BEAM_R) * 0.92;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -DROP - d;
      pos[i * 3 + 2] = Math.sin(a) * r;
      ph[i] = Math.random();
      sz[i] = 0.02 + Math.random() * 0.03;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(MoteShader.uniforms), vertexShader: MoteShader.vertexShader, fragmentShader: MoteShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.moteMat.uniforms.uMap.value = softDot();
    const pts = new THREE.Points(g, this.moteMat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    return pts;
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
      this.flameSpots.push(new THREE.Vector3(x, h + 0.1, z));
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
    // tamanho em pixels de 1 m a 1 m de distância (poeira mantém o tamanho na tela)
    const pr = this.renderer.getPixelRatio();
    (this.ink.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr);
    this.moteMat.uniforms.uPx.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    if (this.emberMat) this.emberMat.uniforms.uPx.value = this.moteMat.uniforms.uPx.value;
    if (this.ashMat) this.ashMat.uniforms.uPx.value = this.moteMat.uniforms.uPx.value;
  }

  /** Onda de choque saindo de um ponto do mundo (explosões). */
  shockAt(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    this.shockUV.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    this.shockT = 0;
  }

  private animate(dt: number) {
    const t = this.clockT;
    // balanço da lâmpada
    this.swing.rotation.z = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 0.37 + 2) * 0.018;
    this.swing.rotation.x = Math.sin(t * 0.71 + 1) * 0.022;
    // pisca-pisca: de vez em quando sozinha, ou quando pedido
    // (rara e rasa: não pode atrapalhar a leitura do tabuleiro)
    let k = 1 + Math.sin(t * 13) * 0.01;
    if (t < this.flickerUntil) k *= Math.random() < 0.4 ? 0.55 + Math.random() * 0.2 : 0.85 + Math.random() * 0.15;
    this.hanging.intensity = this.lampBase * k;
    this.fill.intensity = this.lampBase * FILL_K * k;
    // a lâmpada some quando a câmera está acima dela (não tapa a visão de cima)
    const bulbY = this.swing.position.y - 10;
    this.lampModel.visible = this.camera.position.y < bulbY - 0.6;
    // o feixe e a poeira só aparecem junto com a lâmpada (vista de cima, o cone taparia a mesa)
    this.beam.visible = this.motes.visible = this.lampModel.visible && !this.lowQ;
    this.beamMat.uniforms.uOpacity.value = 0.11 * (0.92 + 0.08 * Math.sin(t * 1.7)) * (this.hanging.intensity / this.lampBase);
    for (const f of this.flames) {
      const n = Math.sin(t * 9 + f.ph) * 0.5 + Math.sin(t * 23 + f.ph * 2) * 0.3 + (Math.random() - 0.5) * 0.25;
      f.m.scale.set(1 - n * 0.06, 1 + n * 0.18, 1 - n * 0.06);
      f.m.rotation.z = Math.sin(t * 5 + f.ph) * 0.08;
    }
    for (const c of this.candleLights) c.l.intensity = c.base * (0.85 + Math.sin(t * 11 + c.ph) * 0.08 + Math.random() * 0.1);
    this.updateEmbers(dt);
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
    u.uTension.value = this.backdrop.tension;
    u.uAz.value = Math.atan2(this.camera.position.x, this.camera.position.z);
    this.shockT = Math.min(1, this.shockT + dt * 1.3);
    u.uShockT.value = this.shockT;
    (u.uShockC.value as THREE.Vector2).copy(this.shockUV);
    this.beamMat.uniforms.uTime.value = this.clockT;
    this.moteMat.uniforms.uTime.value = this.clockT;
    this.ashMat.uniforms.uTime.value = this.clockT;
    this.emberMat.uniforms.uPx.value = this.moteMat.uniforms.uPx.value;
    this.lens += (this.lensTarget - this.lens) * (1 - Math.exp(-dt * 3));
    u.uLens.value = this.lens;
    if (this.postFx) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  setAO(on: boolean) { this.aoOn = on; this.applyQuality(); }
  setInk(on: boolean) { this.ink.enabled = on; }
  setTiltShift(on: boolean) { this.finish.uniforms.uTilt.value = on ? 1 : 0; }
  setCrt(on: boolean) { this.finish.uniforms.uCrt.value = on ? 1 : 0; }
  /** Foco cinematográfico: 1 = bordas desfocadas (a cascata, no centro, continua nítida). Suaviza no quadro. */
  setLensTarget(t: number) { this.lensTarget = t; }
  /** Modo leve (automático quando a máquina não aguenta): corta AO, brasas e feixe. */
  setLowQuality(on: boolean) { this.lowQ = on; this.applyQuality(); }
  private applyQuality() {
    this.ao.enabled = this.aoOn && !this.lowQ;
    this.embers.visible = !this.lowQ;
    this.ash.visible = !this.lowQ;
  }
  /** Posição do "dono da mesa" na tela, em pixels (para o balão de fala). */
  maskScreenPos(): { x: number; y: number } {
    const v = MASK_POS.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (1 - (v.y * 0.5 + 0.5)) * window.innerHeight };
  }
}
