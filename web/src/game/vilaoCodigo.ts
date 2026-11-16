import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Variações do dono da mesa feitas 100% no código (laboratório ?vilao=C1 / C2), sem arquivo de modelo nem de textura.
// Forma: campo de distância (SDF) com união suave — crânio, rosto, maçãs, nariz, orelhas, órbitas cavadas — virado
// malha raio a raio no carregamento. Pintura: shader procedural em coordenadas da cabeça (madeira, goiva ou
// craquelê, bochechas, sobrancelhas, lábios, cílios) com relevo calculado no próprio fragmento.
//   C1 = entalhado (madeira talhada, tinta fina, cabelo ruivo)   C2 = sinistro (tinta rachada, órbitas fundas)
// As medidas seguem as do Blender (tools/vilao2/vilao2.py): x = lado, y = -profundidade, z = altura.

type V3 = [number, number, number];
interface Spec {
  eye: { x: number; z: number; y: number; r: number }; socketR: number; socketDepth: number;
  mouthZ: number; mouthW: number; noseTip: V3; noseR: number; brow: number; cheek: number; chinY: number;
  hairline: number; partX: number; hairTh: number; groove: number; grooves: number; puff: number;
}
const BASE: Spec = {
  eye: { x: 0.31, z: 0.13, y: -0.635, r: 0.17 }, socketR: 0.25, socketDepth: 0.10, mouthZ: -0.36, mouthW: 0.29,
  noseTip: [0, -0.99, -0.06], noseR: 0.15, brow: 0.17, cheek: 0.36, chinY: -0.5,
  hairline: 0.62, partX: 0.24, hairTh: 0.06, groove: 0.032, grooves: 9, puff: 0.11,
};
const SPECS: Record<string, Spec> = {
  C1: { ...BASE, noseTip: [0, -1.0, -0.02], noseR: 0.16, cheek: 0.38 },
  C2: { ...BASE, socketR: 0.29, socketDepth: 0.17, brow: 0.21, noseTip: [0, -0.95, -0.12], noseR: 0.11, cheek: 0.30, chinY: -0.56,
    hairline: 0.72, partX: 0, groove: 0.012, grooves: 20, puff: 0.02 },
};

// ---------------------------------------------------------------- SDF (coordenadas do Blender)
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
function ell(p: V3, c: V3, r: V3) {
  const qx = (p[0] - c[0]) / r[0], qy = (p[1] - c[1]) / r[1], qz = (p[2] - c[2]) / r[2];
  const k0 = len3(qx, qy, qz), k1 = len3(qx / r[0], qy / r[1], qz / r[2]);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
}
const sph = (p: V3, c: V3, r: number) => len3(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
function cap(p: V3, a: V3, b: V3, ra: number, rb: number) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const h = THREE.MathUtils.clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len3(pax - h * bax, pay - h * bay, paz - h * baz) - (ra + (rb - ra) * h);
}
function box(p: V3, lo: V3, hi: V3) {
  const q = [0, 1, 2].map((i) => Math.abs(p[i] - (lo[i] + hi[i]) / 2) - (hi[i] - lo[i]) / 2);
  return len3(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
}
function smin(a: number, b: number, k: number) { const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
function ssub(a: number, b: number, k: number) { const h = THREE.MathUtils.clamp(0.5 - (0.5 * (a + b)) / k, 0, 1); return a + (-b - a) * h + k * h * (1 - h); }
function smax(a: number, b: number, k: number) { return -smin(-a, -b, k); }

function headSdf(p: V3, S: Spec) {
  const { x: ex, z: ez, y: ey } = S.eye;
  let d = ell(p, [0, 0.1, 0.2], [0.78, 0.86, 0.9]);
  d = smin(d, ell(p, [0, -0.28, -0.2], [0.68, 0.62, 0.74]), 0.2);
  for (const s of [-1, 1]) {
    d = smin(d, sph(p, [s * 0.37, -0.56, -0.16], S.cheek * 0.82), 0.14);
    d = smin(d, ell(p, [s * 0.8, 0.08, 0.04], [0.11, 0.2, 0.27]), 0.07);
  }
  d = smin(d, ell(p, [0, -0.58, -0.44], [0.4, 0.3, 0.25]), 0.14);
  d = smin(d, ell(p, [0, S.chinY, -0.78], [0.36, 0.32, 0.23]), 0.16);
  d = smin(d, ell(p, [0, -0.66, ez + 0.2], [0.62, S.brow * 0.9, 0.12]), 0.1);
  const t = S.noseTip;
  d = smin(d, cap(p, [0, -0.76, ez + 0.04], [t[0], t[1] + 0.05, t[2] + 0.03], 0.07, 0.09), 0.08);
  d = smin(d, sph(p, t, S.noseR), 0.06);
  for (const s of [-1, 1]) d = ssub(d, sph(p, [s * ex, ey - S.socketDepth * 0.3, ez], S.socketR * 0.86), 0.07);
  return d;
}
function hairSdf(p: V3, S: Spec) {
  const [x, y, z] = p;
  const skull = ell(p, [0, 0.1, 0.2], [0.78, 0.86, 0.9]);
  const front = THREE.MathUtils.clamp(-y / 0.8, 0, 1), side = THREE.MathUtils.clamp(Math.abs(x) / 0.75, 0, 1);
  let line = S.hairline + 0.16 * front * (1 - side * side) - 0.05 * side - 0.75 * THREE.MathUtils.clamp(y / 0.7, 0, 1);
  const sb = THREE.MathUtils.clamp((Math.abs(x) - 0.5) / 0.12, 0, 1) * THREE.MathUtils.clamp((y + 0.42) / 0.12, 0, 1) * THREE.MathUtils.clamp((0.28 - y) / 0.12, 0, 1);
  line = line * (1 - sb) + Math.min(line, 0.3 + 0.25 * THREE.MathUtils.clamp(-y - 0.1, 0, 1)) * sb;
  const puff = S.puff * THREE.MathUtils.clamp(-y / 0.6 + 0.3, 0, 1) * Math.exp(-((x + S.partX * 0.7) ** 2) / 0.2) * THREE.MathUtils.clamp((z - 0.3) / 0.5, 0, 1);
  const phase = (x - S.partX) * (1 + 0.5 * THREE.MathUtils.clamp(-y, 0, 1)) + 0.05 * Math.sin(y * 4);
  const groove = S.groove * (1 - Math.pow(Math.abs(Math.sin(phase * S.grooves * 1.6)), 0.45));
  const part = S.partX ? 0.035 * Math.exp(-((x - S.partX) ** 2) / 0.001) * THREE.MathUtils.clamp(-y + 0.2, 0, 1) : 0;
  return smax(skull - (S.hairTh + puff) + groove + part, (line - z) * 0.9, 0.035);
}

/** Malha de um SDF quase estrelado a partir de `c` (coords do Blender) → geometria em coords do three (x, z, -y). */
function sdfGeometry(fn: (p: V3) => number, c: V3, detail: number, rmax: number): THREE.BufferGeometry {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const N = 96;
  const at = (dx: number, dy: number, dz: number, t: number): V3 => [c[0] + dx * t, c[1] + dy * t, c[2] + dz * t];
  for (let i = 0; i < pos.count; i++) {
    // direção do ícosaedro (three) → Blender: (x, -z, y)
    const dx = pos.getX(i), dy = -pos.getZ(i), dz = pos.getY(i);
    let lo = 0.02, hi = 0.02;
    for (let k = N - 1; k >= 0; k--) {
      const t = 0.02 + (rmax * k) / (N - 1);
      if (fn(at(dx, dy, dz, t)) < 0) { lo = t; hi = Math.min(rmax, t + rmax / (N - 1)); break; }
    }
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (fn(at(dx, dy, dz, m)) < 0) lo = m; else hi = m; }
    const p = at(dx, dy, dz, (lo + hi) / 2);
    pos.setXYZ(i, p[0], p[2], -p[1]);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- pintura procedural (GLSL)
const NOISE = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 3.7; a *= 0.5; } return s / 0.9375; }
vec3 vor(vec3 p){ vec3 c = floor(p); float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++) for (int z=-1;z<=1;z++){
    vec3 g = c + vec3(x,y,z); vec3 o = vec3(h31(g), h31(g+11.7), h31(g+23.1));
    float d = length(g + o - p);
    if (d < f1){ f2 = f1; f1 = d; id = h31(g + 5.3); } else if (d < f2) f2 = d; }
  return vec3(f1, f2, id); }
float sst(float a, float b, float x){ return smoothstep(a, b, x); }
float gau(vec3 p, vec3 c, vec3 s){ vec3 q = (p - c) / s; return exp(-dot(q, q)); }
vec3 bumpN(vec3 pos, vec3 n, float h){
  vec3 sx = dFdx(pos), sy = dFdy(pos); vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g); }
`;

/**
 * part: 0 pele (cabeça/queixo/pálpebra), 1 cabelo, 2 dentes, 3 boca, 4 paletó, 5 pescoço, 6 colarinho, 7 gravata.
 * offset: onde a origem da malha fica na cabeça (queixo/pálpebra giram em volta do próprio pivô).
 */
function paintMat(style: number, part: number, S: Spec, offset = new THREE.Vector3()): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = { value: offset };
    sh.vertexShader = 'varying vec3 vHP;\nuniform vec3 uOff;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vec3 hp3 = transformed + uOff; vHP = vec3(hp3.x, -hp3.z, hp3.y);');
    const E = S.eye;
    sh.fragmentShader = 'varying vec3 vHP;\n' + NOISE + `
      const float STYLE = ${style.toFixed(1)}; const int PART = ${part};
      const vec3 EYE = vec3(${E.x}, ${E.y}, ${E.z}); const float MZ = ${S.mouthZ}, MW = ${S.mouthW};
      const vec3 NOSE = vec3(${S.noseTip.join(',')});
      void paint(vec3 p, out vec3 col, out float rough, out float metal, out float h){
        float big = fbm(p * 3.0), small = fbm(p * 18.0);
        float rad = length(p.xy + vec2(0.0, 0.15)) * 9.0 + fbm(p * 2.2) * 3.0;
        float rings = 0.5 + 0.5 * sin(rad * 6.2832);
        vec3 wood = mix(vec3(0.43,0.27,0.14), vec3(0.66,0.45,0.27), rings * rings * 0.8 + fbm(p * vec3(30,30,3)) * 0.3);
        metal = 0.0; h = 0.0;
        if (PART == 0) {
          vec3 skin; vec3 brow; vec3 lip; float bw, barc, btilt;
          if (STYLE < 0.5) {
            vec3 v = vor(p * 11.0); float gouge = v.x * v.x;
            skin = mix(vec3(0.93,0.79,0.64), vec3(0.86,0.71,0.54), big);
            skin = mix(skin, vec3(0.96,0.86,0.74), sst(0.5, 0.9, v.y - v.x) * 0.25);
            float chip = sst(0.74, 0.75, fbm(p * 6.0)) * sst(0.62, 0.9, length(p.xz) * 0.0 + abs(p.x) + 0.2);
            skin = mix(skin, wood, chip * 0.8);
            for (int s = -1; s <= 1; s += 2) skin = mix(skin, vec3(0.85,0.44,0.37), clamp(gau(p, vec3(float(s)*0.4, -0.62, -0.2), vec3(0.17,0.3,0.14)) * 0.75, 0.0, 1.0));
            skin = mix(skin, vec3(0.84,0.42,0.34), clamp(gau(p, NOSE, vec3(0.13,0.2,0.13)) * 0.55, 0.0, 1.0));
            float fr = step(0.86, vn(p * 70.0)) * gau(p, vec3(0.0,-0.75,-0.08), vec3(0.55,0.5,0.18));
            skin = mix(skin, vec3(0.6,0.33,0.2), fr * 0.7);
            brow = vec3(0.35,0.14,0.07); lip = vec3(0.64,0.19,0.17); bw = 0.022; barc = 0.2; btilt = 0.06;
            rough = 0.4 + gouge * 0.25 + chip * 0.3; h = -gouge * 0.012;
          } else {
            vec3 v = vor(p * 9.0); float crack = 1.0 - sst(0.0, 0.035, v.y - v.x);
            vec3 v2 = vor(p * 26.0); float crackf = 1.0 - sst(0.0, 0.03, v2.y - v2.x);
            float flake = step(0.88, v.z) * step(0.45, fbm(p * 5.0));
            skin = mix(vec3(0.89,0.84,0.74), vec3(0.75,0.68,0.55), big * 0.8);
            skin = mix(skin, vec3(0.16,0.10,0.06), clamp(crack * 0.85 + crackf * 0.12, 0.0, 1.0));
            skin = mix(skin, mix(vec3(0.23,0.13,0.06), vec3(0.35,0.2,0.09), rings), flake);
            for (int s = -1; s <= 1; s += 2) {
              skin = mix(skin, vec3(0.36,0.25,0.28), clamp(gau(p, vec3(float(s)*EYE.x, EYE.y - 0.05, EYE.z - 0.02), vec3(0.3,0.3,0.24)) * 0.65, 0.0, 1.0));
              skin = mix(skin, vec3(0.69,0.45,0.41), clamp(gau(p, vec3(float(s)*0.42, -0.62, -0.26), vec3(0.14,0.3,0.1)) * 0.35, 0.0, 1.0));
            }
            float mus = step(abs(p.x), 0.17) * step(0.03, abs(p.x)) * step(abs(p.z - (MZ + 0.10 + 0.05 * abs(p.x))), 0.012) * step(p.y, -0.6);
            skin = mix(skin, vec3(0.05,0.03,0.03), mus);
            brow = vec3(0.08,0.05,0.05); lip = vec3(0.35,0.07,0.09); bw = 0.012; barc = 0.3; btilt = -0.1;
            rough = mix(0.5, 0.85, flake) + crack * 0.3; h = -crack * 0.006 - crackf * 0.002 - flake * 0.004;
          }
          for (int s = -1; s <= 1; s += 2) {
            float u = (p.x - float(s) * EYE.x) / 0.2;
            float cz = EYE.z + 0.21 + barc * 0.35 * (1.0 - u*u) - btilt * u * float(s);
            float band = step(abs(u), 1.0) * step(abs(p.z - cz), bw * (1.3 - 0.6 * abs(u))) * step(p.y, -0.45);
            skin = mix(skin, brow, band * 0.95);
          }
          float lipz = step(abs(p.x), MW * 0.95) * step(p.y, -0.55);
          float up = lipz * step(MZ, p.z) * step(p.z, MZ + 0.055 - 0.04 * (p.x/MW)*(p.x/MW));
          float lo = lipz * step(p.z, MZ) * step(MZ - 0.075 + 0.04 * (p.x/MW)*(p.x/MW), p.z);
          skin = mix(skin, lip, max(up, lo) * 0.92);
          for (int s = -1; s <= 1; s += 2) skin = mix(skin, vec3(0.79,0.5,0.42), clamp(gau(p, vec3(float(s)*0.84, 0.06, 0.02), vec3(0.06,0.15,0.2)) * 0.5, 0.0, 1.0));
          // cílios na borda da pálpebra (a malha da pálpebra tem pivô no centro do olho)
          col = skin;
        } else if (PART == 1) {
          float fine = 0.5 + 0.5 * sin(p.x * 110.0 + fbm(p * 8.0) * 6.0);
          vec3 a = STYLE < 0.5 ? vec3(0.18,0.06,0.03) : vec3(0.02,0.015,0.02);
          vec3 b = STYLE < 0.5 ? vec3(0.49,0.2,0.09) : vec3(0.16,0.12,0.14);
          col = mix(a, b, fbm(p * 6.0) * 0.6 + fine * 0.2); rough = STYLE < 0.5 ? 0.32 : 0.2; h = fine * 0.002;
        } else if (PART == 2) {
          float k = (p.x + MW) / (2.0 * MW) * 7.0; float gap = step(0.44, abs(fract(k) - 0.5));
          col = mix(STYLE < 0.5 ? vec3(0.94,0.89,0.78) : vec3(0.85,0.78,0.6), vec3(0.2,0.12,0.07), gap); rough = 0.35;
          if (STYLE > 0.5 && floor(k) == 4.0 && gap < 0.5) { col = vec3(0.88,0.64,0.23); rough = 0.22; metal = 1.0; }
        } else if (PART == 3) { col = vec3(0.1,0.02,0.03); rough = 0.9; }
        else if (PART == 4) {
          float vx = 0.3 + (p.z + 1.45) * 0.55; float shirt = step(abs(p.x), vx) * step(p.y, 0.0);
          float lapel = step(vx, abs(p.x)) * step(abs(p.x), vx + 0.14) * step(p.y, 0.0);
          vec3 suit = STYLE < 0.5 ? vec3(0.13,0.11,0.15) : vec3(0.1,0.08,0.09);
          float weave = 0.5 + 0.25 * sin(p.x * 420.0) * sin(p.z * 420.0) + 0.25 * fbm(p * 60.0);
          col = mix(suit * (1.0 + big * 0.5 + weave * 0.2), vec3(0.85,0.8,0.7) * (0.85 + 0.15 * weave), shirt);
          col = mix(col, suit * 2.4, lapel); rough = mix(0.88, 0.45, lapel); h = weave * 0.001;
        } else if (PART == 5) { col = wood; rough = 0.7; }
        else if (PART == 6) { col = mix(vec3(0.91,0.87,0.79), vec3(0.75,0.68,0.54), big); rough = 0.85; }
        else { col = STYLE < 0.5 ? vec3(0.56,0.09,0.13) : vec3(0.23,0.04,0.08); rough = 0.35; }
      }
    ` + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n vec3 pc; float pr, pm, ph; paint(vHP, pc, pr, pm, ph); diffuseColor.rgb = pc;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(pr, 0.05, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = pm;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = bumpN(-vViewPosition, normal, ph * 1.2);');
  };
  m.customProgramCacheKey = () => `vilao-code-${style}-${part}`;
  return m;
}

function eyeTex(style: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; // equirretangular: frente da esfera = u 0,25
  const g = c.getContext('2d')!;
  g.fillStyle = style < 0.5 ? '#f2ead8' : '#e2d6a8'; g.fillRect(0, 0, 512, 256);
  const ir = style < 0.5 ? 36 : 30;
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, ir);
  if (style < 0.5) { gr.addColorStop(0, '#20384a'); gr.addColorStop(0.6, '#5d8fa8'); gr.addColorStop(1, '#1a2a34'); }
  else { gr.addColorStop(0, '#3a2a10'); gr.addColorStop(0.6, '#b08a2a'); gr.addColorStop(1, '#2a1c08'); }
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, ir, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let a = 0; a < 48; a++) { const t = (a / 48) * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(t) * 14, 128 + Math.sin(t) * 14); g.lineTo(128 + Math.cos(t) * ir * 0.9, 128 + Math.sin(t) * ir * 0.9); g.stroke(); }
  g.fillStyle = '#050303'; g.beginPath(); g.arc(128, 128, style < 0.5 ? 14 : 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Converte um ponto das medidas (Blender) para o three. */
const B = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

export function buildCodeVilao(id: string): { root: THREE.Group; jawCorners: [number, number, number] } {
  const S = SPECS[id] ?? SPECS.C1;
  const style = id === 'C2' ? 1 : 0;
  const root = new THREE.Group();
  const w = S.mouthW, mz = S.mouthZ, gap = 0.012;
  const head = (p: V3) => headSdf(p, S);
  // cabeça sem o bloco do queixo (com folga) e o queixo sozinho: dois SDFs, bordas retas e limpas
  const cutOut = (p: V3) => box(p, [-w - gap, -1.5, -1.5], [w + gap, -0.05 + gap, mz + gap * 1.6]);
  const cutIn = (p: V3) => box(p, [-w, -1.5, -1.5], [w, -0.05, mz]);
  const headGeo = sdfGeometry((p) => Math.max(head(p), -cutOut(p)), [0, -0.15, -0.05], 90, 2.4);
  root.add(Object.assign(new THREE.Mesh(headGeo, paintMat(style, 0, S)), { name: 'Head' }));
  const pivot = B(0, 0.05, mz + 0.02);
  const jawGeo = sdfGeometry((p) => Math.max(head(p), cutIn(p)), [0, -0.5, mz - 0.25], 48, 1.2);
  jawGeo.translate(-pivot.x, -pivot.y, -pivot.z);
  const jaw = new THREE.Mesh(jawGeo, paintMat(style, 0, S, pivot.clone()));
  jaw.name = 'Jaw'; jaw.position.copy(pivot);
  root.add(jaw);
  const hair = new THREE.Mesh(sdfGeometry((p) => hairSdf(p, S), [0, 0.1, 0.75], 90, 1.6), paintMat(style, 1, S));
  hair.name = 'Hair'; root.add(hair);
  // boca por dentro e dentes, recortados pela cabeça
  const cav = sdfGeometry((p) => Math.max(box(p, [-w + 0.02, -0.9, mz - 0.26], [w - 0.02, -0.25, mz + 0.01]), head(p) + 0.025), [0, -0.5, mz - 0.12], 16, 1.0);
  root.add(Object.assign(new THREE.Mesh(cav, paintMat(style, 3, S)), { name: 'Mouth' }));
  const teeth = sdfGeometry((p) => Math.max(box(p, [-w + 0.05, -0.95, mz - 0.075], [w - 0.05, -0.55, mz + 0.005]) - 0.01, head(p) + 0.012), [0, -0.68, mz - 0.035], 24, 0.5);
  root.add(Object.assign(new THREE.Mesh(teeth, paintMat(style, 2, S)), { name: 'Teeth' }));
  // olhos de vidro e pálpebras
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex(style), roughness: 0.08, clearcoat: 1 });
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    const c = B(s * S.eye.x, S.eye.y, S.eye.z);
    const ballGeo = new THREE.SphereGeometry(S.eye.r, 40, 28);
    const ball = new THREE.Mesh(ballGeo, eyeMat);
    ball.name = `Eye_${side}`; ball.position.copy(c); root.add(ball);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(S.eye.r * 1.07, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), paintMat(style, 0, S, c.clone()));
    (lid.material as THREE.Material).side = THREE.DoubleSide;
    lid.name = `Lid_${side}`; lid.position.copy(c); root.add(lid);
  }
  // pescoço, colarinho, paletó e gravata
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 32), paintMat(style, 5, S, B(0, 0.05, -1.05)));
  neck.position.copy(B(0, 0.05, -1.05)); root.add(neck);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 40, 1, true), paintMat(style, 6, S, B(0, 0.05, -1.3)));
  collar.position.copy(B(0, 0.05, -1.3)); (collar.material as THREE.Material).side = THREE.DoubleSide; root.add(collar);
  const bodySdf = (p: V3) => {
    let d = ell(p, [0, 0.12, -2.05], [1.25, 0.72, 0.62]);
    for (const s of [-1, 1]) d = smin(d, ell(p, [s * 0.92, 0.14, -1.78], [0.42, 0.42, 0.34]), 0.25);
    d = smin(d, cap(p, [0, 0.08, -1.55], [0, 0.1, -1.95], 0.4, 0.55), 0.2);
    return Math.max(d, -2.25 - p[2]);
  };
  root.add(new THREE.Mesh(sdfGeometry(bodySdf, [0, 0.12, -1.95], 40, 2.6), paintMat(style, 4, S)));
  const bowSdf = (p: V3) => {
    let d = sph(p, [0, -0.44, -1.33], 0.065);
    for (const s of [-1, 1]) d = smin(d, cap(p, [s * 0.03, -0.43, -1.33], [s * 0.2, -0.41, -1.33], 0.04, 0.11), 0.04);
    return Math.max(d, Math.abs(p[1] + 0.42) - 0.06);
  };
  root.add(new THREE.Mesh(sdfGeometry(bowSdf, [0, -0.42, -1.33], 24, 0.5), paintMat(style, 7, S)));
  return { root, jawCorners: [0.27, -0.32, 0.83] };
}
