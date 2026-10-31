// 8 个霓虹赛博环境。每个环境 = { root, update(t,dt,cam), onPalette() }，全部由 GPU 着色器驱动，没有贴图。
// 调色板 PAL 里的 Color 对象被所有着色器直接引用，色相/亮度滑块改的是同一个对象，立即生效。
import * as THREE from 'three';
import { GLSL_NOISE, GLSL_GRID, GLSL_HDR, mulberry32 } from './util.js';

export const PAL = {
  a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color(),
  top: new THREE.Color(), mid: new THREE.Color(), bot: new THREE.Color(), fog: new THREE.Color(),
  hue: 0, base: null,
  set(def) { this.base = def; this.refresh(); },
  refresh() {
    const b = this.base; if (!b) return;
    for (const k of ['a', 'b', 'c', 'top', 'mid', 'bot']) this[k].set(b[k]).offsetHSL(this.hue, 0, 0);
    this.fog.copy(this.mid).multiplyScalar(0.55);
  },
};

// 全局共享的 uniform（所有环境材质引用同一批对象）
export const U = {
  uT: { value: 0 }, uGlow: { value: 1 }, uAud: { value: 0 }, uFog: { value: 0.006 }, uRain: { value: 0.7 },
  uA: { value: PAL.a }, uB: { value: PAL.b }, uC: { value: PAL.c },
  uTop: { value: PAL.top }, uMid: { value: PAL.mid }, uBot: { value: PAL.bot }, uFogCol: { value: PAL.fog },
};

const PRE = GLSL_HDR + GLSL_NOISE + GLSL_GRID;
const END = '\n#include <colorspace_fragment>\n';

function mat(vs, fs, opts = {}) {
  const { extra = {}, vnoise = false, ...rest } = opts;
  return new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: GLSL_HDR + (vnoise ? GLSL_NOISE : '') + vs, fragmentShader: PRE + fs, ...rest });
}

// ---------- 通用部件 ----------
const SKY_VS = `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }`;
function sky(fs, extra) {
  const m = mat(SKY_VS, 'varying vec3 vD;\n' + fs, { side: THREE.BackSide, depthWrite: false, depthTest: false, extra });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -100; return mesh;
}
const FLOOR_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
function floor(fs, { radius = 1400, transparent = false, extra, side = THREE.FrontSide } = {}) {
  const g = new THREE.CircleGeometry(radius, 64); g.rotateX(-Math.PI / 2);
  const m = mat(FLOOR_VS, 'varying vec3 vW;\n' + fs, { transparent, extra, side });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
function stars(n = 3200, seed = 11, size = 2.6) {
  const r = mulberry32(seed), pos = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * 6.2832, k = Math.sqrt(1 - u * u);
    pos.set([Math.cos(th) * k * 900, Math.abs(u) * 900 * 0.98 + 10, Math.sin(th) * k * 900], i * 3); s[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = mat(`attribute float aS; varying float vA;
void main(){ vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = ${size.toFixed(1)} * (0.7 + aS * 1.4) * (0.75 + 0.25 * sin(uT * (1.0 + aS * 3.0) + aS * 50.0)); vA = 0.45 + 0.55 * aS; }`,
  `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(vec3(0.75, 0.85, 1.0), uA, 0.25) * vA * a, a); ${END} }`,
  { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -90; return p;
}
// 身边漂浮的光点（给近景纵深）
function motes(n = 900, rMin = 2, rMax = 26, size = 0.07, rise = 0.25, seed = 5) {
  const r = mulberry32(seed), pos = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * 6.2832, k = Math.sqrt(1 - u * u), rr = rMin + Math.pow(r(), 0.7) * (rMax - rMin);
    pos.set([Math.cos(th) * k * rr, u * rr * 0.6 + 6, Math.sin(th) * k * rr], i * 3); s[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = mat(`attribute float aS; varying float vA; varying float vS;
void main(){ vec3 p = position; p.y = mod(p.y + uT * ${rise.toFixed(3)} * (0.4 + aS) + 12.0, 24.0) - 12.0 + 4.0;
  p.x += sin(uT * 0.3 + aS * 40.0) * 0.6; p.z += cos(uT * 0.27 + aS * 31.0) * 0.6;
  vec4 mv = viewMatrix * vec4(p, 1.0); float tw = 0.5 + 0.5 * sin(uT * (1.5 + aS * 3.0) + aS * 60.0);
  vA = (0.25 + 0.75 * tw) * (1.0 + uAud * 1.5) * smoothstep(0.3, 1.5, -mv.z); vS = aS;
  gl_PointSize = clamp(${size.toFixed(3)} * 900.0 / -mv.z, 1.0, 36.0); gl_Position = projectionMatrix * mv; }`,
  `varying float vA; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(mix(uA, uB, step(0.5, vS)) * a * vA * uGlow, a * vA); ${END} }`,
  { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
// 圆形发光底座（所有环境里模型下方都有，保证模型落地感）
function glowDisc(radius = 6) {
  const g = new THREE.CircleGeometry(radius, 48); g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0);
  const m = mat(`varying vec2 vU; void main(){ vU = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    `varying vec2 vU; void main(){ float r = length(vU); float a = (smoothstep(${radius.toFixed(1)}, 0.0, r)); a *= a;
     float ring = smoothstep(0.06, 0.0, abs(r - 1.05)) + 0.5 * smoothstep(0.05, 0.0, abs(r - 2.2)) * (0.5 + 0.5 * sin(uT * 2.0 - r * 3.0));
     vec3 c = uA * (a * 0.025 + ring * 0.45) * uGlow * (1.0 + uAud * 0.6);   // 加法混合发生在 sRGB 空间，数值要很小 gl_FragColor = vec4(c, 1.0); ${END} }`,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; return mesh;
}
function basicColorUpdater(list) {   // MeshBasicMaterial 的颜色跟随调色板
  return () => { for (const [m, key, k = 1] of list) m.color.copy(PAL[key]).multiplyScalar(k * U.uGlow.value); };
}
const rampMesh = (geo, color, opacity = 1) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
  return new THREE.Mesh(geo, m);
};

// ======== 1. 霓虹日落 SYNTHWAVE ========
function envSynth() {
  const root = new THREE.Group();
  root.add(sky(`void main(){
    vec3 d = normalize(vD); float h = d.y;
    vec3 c = mix(uMid, uTop, smoothstep(0.0, 0.55, h)); c = mix(c, uBot, smoothstep(0.0, -0.25, h));
    vec3 sd = normalize(vec3(0.0, 0.11, -1.0)); float cs = dot(d, sd); float ang = acos(clamp(cs, -1.0, 1.0));
    float R = 0.24; float k = clamp((d.y - sd.y) / R * 0.5 + 0.5, 0.0, 1.0);
    float gap = (1.0 - k) * 0.62; float st = step(gap, fract(k * 9.0)); st = mix(st, 1.0, step(0.58, k));
    float disc = smoothstep(R, R - 0.006, ang) * st;
    c += mix(uB, uA, k) * disc * 1.5 * uGlow;
    c += uA * pow(max(cs, 0.0), 18.0) * 0.55 * (1.0 + uAud * 0.5);
    c += uC * exp(-abs(h) * 22.0) * 0.18;
    gl_FragColor = vec4(c, 1.0); ${END} }`));
  root.add(floor(`void main(){
    vec2 p = vW.xz; float d = length(vW - cameraPosition); float r = length(p);
    float g1 = gridL(p, 1.0, 1.1), g2 = gridL(p, 10.0, 1.7);
    vec3 col = uBot * 0.55 + uA * 0.07 / (1.0 + r * 0.12);
    vec3 ln = mix(uB, uA, smoothstep(0.0, 140.0, r));
    col += ln * (g1 * 0.32 + g2 * 1.0) * uGlow * (1.0 + uAud * 0.8);
    col += uC * smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(r * 0.32 - uT * 1.4)) * 0.16 * exp(-r * 0.012);
    gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  // 山脉环
  const N = 120, R = 560, rnd = mulberry32(3), pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * 6.2832, h = 25 + Math.pow(rnd(), 1.4) * 95 * (0.4 + 0.6 * Math.abs(Math.sin(a * 3.0 + 1)));
    pos.push(Math.cos(a) * R, -6, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx);
  const body = rampMesh(mg, 0x000000); body.material.side = THREE.DoubleSide;
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mg), new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false }));
  root.add(body, wire, glowDisc(7));
  const upd = basicColorUpdater([[body.material, 'bot', 0.4], [wire.material, 'a', 1.1]]);
  root.add(motes(500, 3, 30, 0.06, 0.2));
  return { root, update() { upd(); }, onPalette: upd };
}

// ======== 2. 赛博都市 CYBER CITY ========
function envCity() {
  const root = new THREE.Group();
  root.add(sky(`void main(){
    vec3 d = normalize(vD); float h = d.y;
    vec3 c = mix(uMid, uTop, smoothstep(0.0, 0.5, h)); c = mix(c, uBot, smoothstep(0.0, -0.2, h));
    c += uA * exp(-abs(h) * 14.0) * 0.35;
    vec3 md = normalize(vec3(-0.45, 0.42, -0.8)); float ma = acos(clamp(dot(d, md), -1.0, 1.0));
    c += uB * smoothstep(0.075, 0.07, ma) * 1.4 + uB * exp(-ma * 7.0) * 0.18;
    float cl = fbm2(d.xz / (h + 0.3) * 1.5 + uT * 0.01); c += uC * smoothstep(0.5, 0.9, cl) * 0.06 * smoothstep(0.0, 0.3, h);
    gl_FragColor = vec4(c, 1.0); ${END} }`));
  root.add(floor(`void main(){
    vec2 p = vW.xz; float d = length(vW - cameraPosition); float r = length(p);
    float g1 = gridL(p, 2.0, 1.0), g2 = gridL(p, 20.0, 1.5);
    vec3 col = uBot * 0.35;
    float streak = fbm2(vec2(p.x * 0.35, p.y * 0.03 + 3.0)) * fbm2(vec2(p.y * 0.35, p.x * 0.03));
    col += mix(uA, uB, step(0.5, hash21(floor(p / 18.0)))) * smoothstep(0.18, 0.5, streak) * 0.22 * smoothstep(12.0, 40.0, r);
    col += mix(uB, uA, 0.5) * (g1 * 0.07 + g2 * 0.35) * uGlow;
    col += uA * smoothstep(0.1, 0.0, abs(r - 9.0)) * 0.9 * uGlow + uB * smoothstep(0.08, 0.0, abs(r - 12.0)) * 0.6 * uGlow;
    gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  // 摩天楼
  const N = 260, rnd = mulberry32(21), M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(
    `varying vec3 vP; varying vec3 vN; varying vec3 vSc; varying float vSeed; varying vec3 vW;
     void main(){ vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
       vSc = sc; vP = position * sc; vN = normal; vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
       vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    `varying vec3 vP; varying vec3 vN; varying vec3 vSc; varying float vSeed; varying vec3 vW;
     void main(){
       float sd = floor(vSeed * 255.0 + 0.5) / 255.0; float side = step(abs(vN.y), 0.5); float u = abs(vN.x) > 0.5 ? vP.z : vP.x; float v = vW.y;
       vec2 cs = vec2(2.4, 3.2); vec2 cu = vec2(u / cs.x + sd * 10.0, v / cs.y); vec2 cell = floor(cu), f = fract(cu);
       float hh = hash21(cell + sd * 37.0);
       float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
       float aa = 1.0 - smoothstep(0.18, 0.55, max(fwidth(cu.x), fwidth(cu.y)));
       float lit = mix(0.2 * side, step(0.6, hh) * win * side, aa);
       vec3 wc = hh > 0.93 ? uA : (hh > 0.85 ? uB : (hh > 0.77 ? uC : vec3(1.0, 0.8, 0.5) * 0.55));
       if (aa < 1.0) wc = mix(mix(uA, uB, 0.5) * 0.8, wc, aa);
       vec3 col = vec3(0.012, 0.010, 0.03) + wc * lit * (0.65 + 0.35 * mix(1.0, sin(uT * 2.0 + hh * 50.0), aa)) * uGlow;
       vec3 de = vSc * 0.5 - abs(vP); float e = step(2.0, step(de.x, 0.22) + step(de.y, 0.22) + step(de.z, 0.22));
       col += (sd > 0.5 ? uA : uB) * e * 1.1 * uGlow * (1.0 + uAud * 0.6);
       col += uA * 0.05 * (1.0 - side) * step(0.0, vN.y);
       gl_FragColor = vec4(fogMix(col, length(vW - cameraPosition)), 1.0); ${END} }`), N);
  for (let i = 0; i < N; i++) {
    const r = 34 + Math.pow(rnd(), 0.75) * 260, a = rnd() * 6.2832, w = 9 + rnd() * 17, dd = 9 + rnd() * 17, h = 24 + Math.pow(rnd(), 2.0) * 190 * (0.5 + r / 400);
    P.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); S.set(w, h, dd); M.compose(P, q.identity(), S); towers.setMatrixAt(i, M);
  }
  towers.frustumCulled = false; root.add(towers);
  // 车流光带
  const T = 320, tr = mulberry32(8), aS = new Float32Array(T * 4), aD = new Float32Array(T);
  for (let i = 0; i < T; i++) { aS.set([(tr() - 0.5) * 360, 12 + tr() * 90, (tr() < 0.5 ? -1 : 1) * (14 + tr() * 30), tr()], i * 4); aD[i] = i % 2; }
  const bg = new THREE.InstancedBufferGeometry(); bg.copy(new THREE.BoxGeometry(1, 1, 1));
  bg.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4)); bg.setAttribute('aD', new THREE.InstancedBufferAttribute(aD, 1)); bg.instanceCount = T;
  const traffic = new THREE.Mesh(bg, mat(
    `attribute vec4 aS; attribute float aD; varying vec3 vC; varying vec3 vW; void main(){
       float L = 640.0; float tr = mod(aS.w * L + uT * aS.z, L) - L * 0.5;
       vec3 ctr = aD < 0.5 ? vec3(tr, aS.y, aS.x) : vec3(aS.x, aS.y, tr);
       vec3 p = position * (aD < 0.5 ? vec3(8.0, 0.32, 0.32) : vec3(0.32, 0.32, 8.0)) + ctr;
       vC = (aS.w > 0.5 ? uA : uB) * 2.2 * uGlow; vW = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    `varying vec3 vC; varying vec3 vW; void main(){ gl_FragColor = vec4(fogMix(vC, length(vW - cameraPosition)), 1.0); ${END} }`));
  traffic.frustumCulled = false; root.add(traffic);
  // 雨
  const R = 2600, rr = mulberry32(4), aP = new Float32Array(R * 3);
  for (let i = 0; i < R * 3; i++) aP[i] = rr();
  const rg = new THREE.InstancedBufferGeometry(); rg.copy(new THREE.PlaneGeometry(1, 1));
  rg.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 3)); rg.instanceCount = R;
  const rain = new THREE.Mesh(rg, mat(
    `attribute vec3 aP; varying float vA; void main(){
       vec3 box = vec3(36.0, 24.0, 36.0); vec3 b = aP * box; b.y -= uT * (13.0 + aP.x * 7.0);
       vec3 q = mod(b - cameraPosition, box) + cameraPosition - box * 0.5;
       vec3 dir = q - cameraPosition; vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), dir) + vec3(1e-4));
       vec3 p = q + rt * position.x * 0.018 + vec3(0.0, position.y * 0.9, 0.0);
       vA = (1.0 - length(dir) / 20.0) * 0.45 * smoothstep(0.8, 3.5, length(dir)); vec4 pos = projectionMatrix * viewMatrix * vec4(p, 1.0);
       if (aP.z > uRain) pos = vec4(2.0, 2.0, 2.0, 1.0); gl_Position = pos; }`,
    `varying float vA; void main(){ gl_FragColor = vec4(mix(uB, vec3(0.8, 0.95, 1.0), 0.5) * max(vA, 0.0), max(vA, 0.0)); ${END} }`,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  rain.frustumCulled = false; root.add(rain, glowDisc(7));
  return { root, update() {} };
}

// ======== 3. 星云虚空 NEBULA VOID ========
function envNebula() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); vec3 c = mix(uMid, uTop, smoothstep(-0.3, 0.8, d.y)); c = mix(c, uBot, smoothstep(0.1, -0.7, d.y)); gl_FragColor = vec4(c, 1.0); ${END} }`));
  const neb = mat(`varying vec3 vC; void main(){
      vec3 d = normalize(position); float t = uT * 0.025;
      float f1 = fbm3(d * 2.2 + vec3(t, -t * 0.7, t * 0.4)); float f2 = fbm3(d * 4.3 - vec3(t * 0.5, t, 0.0) + f1 * 1.5);
      float nb = smoothstep(0.40, 0.85, f2); float band = exp(-pow(d.y * 3.0 - sin(d.x * 2.0 + uT * 0.05) * 0.7, 2.0));
      vC = mix(uA, uB, smoothstep(0.3, 0.7, f1)) * (nb * 1.0 + band * 0.25) * 0.55 * uGlow * (1.0 + uAud * 0.6);
      gl_Position = projectionMatrix * viewMatrix * vec4(position * 0.9 + cameraPosition, 1.0); }`,
    `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); ${END} }`, { side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vnoise: true });
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(1000, 128, 64), neb); nebula.frustumCulled = false; nebula.renderOrder = -95;
  root.add(nebula, stars(4200, 12, 3.2));
  // 气态巨行星 + 环
  const planet = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), mat(
    `varying vec3 vN; varying vec3 vL; varying vec3 vWp; void main(){ vN = normalize(mat3(modelMatrix) * normal); vL = position; vWp = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    `varying vec3 vN; varying vec3 vL; varying vec3 vWp; void main(){
      float b = sin(vL.y * 0.07 + fbm2(vL.xz * 0.02) * 3.0) * 0.5 + 0.5; vec3 base = mix(uC, mix(uA, uB, b), 0.65);
      vec3 V = normalize(cameraPosition - vWp); float fr = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.5);
      float lit = clamp(dot(normalize(vN), normalize(vec3(0.6, 0.4, 0.7))) * 0.5 + 0.5, 0.05, 1.0);
      gl_FragColor = vec4(base * lit * 0.55 + uB * fr * 0.9, 1.0); ${END} }`));
  planet.position.set(-460, 170, -680); root.add(planet);
  const ringG = new THREE.RingGeometry(200, 330, 96, 1); ringG.rotateX(-1.25);
  const ring = new THREE.Mesh(ringG, mat(`varying vec2 vU; varying vec3 vP; void main(){ vP = position; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    `varying vec3 vP; void main(){ float r = length(vP) ; float a = smoothstep(200.0, 215.0, r) * smoothstep(330.0, 300.0, r) * (0.35 + 0.65 * step(0.5, fract(r * 0.11)));
      gl_FragColor = vec4(mix(uA, uC, fract(r * 0.03)) * a * 0.8, a * 0.8); ${END} }`, { transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.copy(planet.position); root.add(ring);
  // 平台：悬浮在虚空里的发光圆盘
  const plat = floor(`void main(){ float r = length(vW.xz); float d = length(vW - cameraPosition);
      float g = gridL(vW.xz, 0.5, 1.0) * 0.18 + gridL(vW.xz, 2.5, 1.2) * 0.4;
      vec3 col = uBot * 0.4 + (uA * g + uB * smoothstep(0.1, 0.0, abs(r - 5.6)) * 1.4) * uGlow;
      float a = 1.0 - smoothstep(5.0, 6.0, r); gl_FragColor = vec4(col, a); ${END} }`, { radius: 6.2, transparent: true, side: THREE.DoubleSide });
  root.add(plat, glowDisc(9), motes(1400, 2, 60, 0.08, 0.35));
  return { root, update() {} };
}

// ======== 4. 数据隧道 DATA TUNNEL ========
function envTunnel() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); gl_FragColor = vec4(mix(uMid, uBot, 0.5) * 0.35, 1.0); ${END} }`));
  const wg = new THREE.CylinderGeometry(26, 26, 300, 64, 1, true); wg.rotateX(Math.PI / 2);
  const wall = new THREE.Mesh(wg, mat(`varying vec3 vL; varying vec3 vW; void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    `varying vec3 vL; varying vec3 vW; void main(){
      float ang = atan(vL.x, vL.y) / 6.2831853 + 0.5; float cols = 56.0, rowS = 3.0; vec2 cell = vec2(floor(ang * cols), floor(vW.z / rowS)); vec2 f = vec2(fract(ang * cols), fract(vW.z / rowS));
      float h = hash21(cell); float panel = step(0.05, f.x) * step(f.x, 0.95) * step(0.06, f.y) * step(f.y, 0.94);
      vec3 col = uBot * 0.5 + panel * mix(uTop, uMid, h) * 0.45;
      float lit = step(0.9, h) * panel; col += mix(uA, uB, fract(h * 7.0)) * lit * (0.5 + 0.5 * sin(uT * 3.0 + h * 40.0)) * 0.8 * uGlow;
      float pz = fract(vW.z * 0.018 - uT * 0.3 + hash21(vec2(cell.x, 3.0))); col += uC * smoothstep(0.96, 1.0, pz) * panel * 0.9 * uGlow;
      col += uA * smoothstep(0.05, 0.0, min(f.x, 1.0 - f.x)) * 0.35 * uGlow;
      col *= 1.0 + uAud * 0.5; float d = length(vW - cameraPosition); gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`, { side: THREE.BackSide }));
  wall.position.y = 7; wall.frustumCulled = false;
  const NR = 52, tg = new THREE.TorusGeometry(25.4, 0.22, 8, 64), rings = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ toneMapped: false }), NR);
  const M = new THREE.Matrix4(); for (let i = 0; i < NR; i++) { M.makeTranslation(0, 0, (i - NR / 2) * 6); rings.setMatrixAt(i, M); }
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NR * 3), 3); rings.frustumCulled = false;
  const ringGroup = new THREE.Group(); ringGroup.position.y = 7; ringGroup.add(rings);
  const c = new THREE.Color(); const paint = () => { for (let i = 0; i < NR; i++) { c.copy(i % 2 ? PAL.a : PAL.b).multiplyScalar(1.4 * U.uGlow.value); rings.setColorAt(i, c); } rings.instanceColor.needsUpdate = true; };
  const plat = floor(`void main(){ float r = length(vW.xz); float g = gridL(vW.xz, 0.5, 1.0) * 0.2 + gridL(vW.xz, 2.5, 1.2) * 0.5;
      vec3 col = uBot * 0.5 + (uA * g + uB * smoothstep(0.07, 0.0, abs(r - 5.6)) * 1.5) * uGlow; float a = 1.0 - smoothstep(5.2, 5.9, r); gl_FragColor = vec4(col, a); ${END} }`, { radius: 6, transparent: true, side: THREE.DoubleSide });
  root.add(wall, ringGroup, plat, glowDisc(8), motes(900, 3, 22, 0.07, 0.5, 9));
  return { root, onPalette: paint, update(t, dt, cam) { const z = Math.round(cam.z / 6) * 6; ringGroup.position.z = z; wall.position.z = z; } };
}

// ======== 5. 全息展厅 HOLOGRAM HALL ========
function envHolo() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); vec3 c = mix(uMid * 0.5, uTop * 0.4, smoothstep(0.0, 0.8, d.y)); c = mix(c, uBot * 0.3, smoothstep(0.0, -0.3, d.y)); gl_FragColor = vec4(c, 1.0); ${END} }`));
  root.add(floor(`void main(){ vec2 p = vW.xz; float r = length(p); float d = length(vW - cameraPosition); float ang = atan(p.x, p.y);
      float rr = smoothstep(0.06, 0.0, abs(fract(r / 3.0 - 0.5) - 0.5) * 3.0);
      float spokes = smoothstep(0.47, 0.5, abs(fract(ang * 24.0 / 6.2831853) - 0.5)) * smoothstep(6.0, 14.0, r) * 0.8;
      float pulse = smoothstep(0.85, 1.0, sin(r * 0.5 - uT * 2.0 - uAud * 2.0) * 0.5 + 0.5) * exp(-r * 0.03);
      vec3 col = uBot * 0.35 + (uA * rr * 0.9 + uB * spokes * 0.5 + uC * pulse * 0.7) * uGlow;
      col += uA * smoothstep(0.12, 0.0, abs(r - 5.0)) * 1.4 * uGlow; col += uB * 0.04 * fbm2(p * 0.4 + uT * 0.05);
      gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  const NP = 36, pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(
    `varying float vY; varying float vId; void main(){ vY = position.y + 0.5; vId = float(gl_InstanceID); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    `varying float vY; varying float vId; void main(){ float id = floor(vId + 0.5); float ch = 0.5 + 0.5 * sin(uT * 1.6 - id * 0.35 + uAud * 3.0);
      vec3 c = mix(uA, uB, mod(id, 2.0)) * (0.12 + 0.95 * ch * vY) * uGlow + uC * 0.5 * smoothstep(0.97, 1.0, vY); gl_FragColor = vec4(c, 1.0); ${END} }`), NP);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i < NP; i++) { const a = i / NP * 6.2832, h = 32 + 26 * (0.5 + 0.5 * Math.sin(i * 2.7)); P.set(Math.cos(a) * 28, h / 2, Math.sin(a) * 28); S.set(0.8, h, 0.8); M.compose(P, q.identity(), S); pil.setMatrixAt(i, M); }
  pil.frustumCulled = false; root.add(pil);
  const bars = []; for (const y of [0.4, 9, 18, 28]) { const t = rampMesh(new THREE.TorusGeometry(28, 0.09, 6, 120), 0xffffff); t.rotation.x = Math.PI / 2; t.position.y = y; root.add(t); bars.push(t.material); }
  const beams = new THREE.Group(); const bm = [], Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832, T = new THREE.Vector3(Math.cos(a) * 17, 44, Math.sin(a) * 17), G = new THREE.Vector3(Math.cos(a + 0.5) * 3, 0, Math.sin(a + 0.5) * 3);
    const len = T.distanceTo(G), m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 1.1, 1, 14, 1, true), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.012, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.scale.y = len; m.position.copy(T).add(G).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, T.clone().sub(G).normalize()); beams.add(m); bm.push([m.material, i % 2 ? 'b' : 'a']); }
  root.add(beams);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832 + 0.3; const p = new THREE.Mesh(new THREE.PlaneGeometry(13, 7.5), mat(`varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      `varying vec2 vU; void main(){ float s = smoothstep(0.92, 1.0, fract(vU.y * 1.0 - uT * 0.2)); float g = max(smoothstep(0.46, 0.5, abs(fract(vU.x * 10.0) - 0.5)), smoothstep(0.46, 0.5, abs(fract(vU.y * 6.0) - 0.5)));
       float e = smoothstep(0.03, 0.0, min(min(vU.x, 1.0 - vU.x), min(vU.y, 1.0 - vU.y))); float a = (g * 0.3 + s * 0.35 + e * 0.9) * 0.8;
       gl_FragColor = vec4(mix(uA, uB, vU.x) * a * uGlow, a); ${END} }`, { transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.position.set(Math.cos(a) * 20, 8.5, Math.sin(a) * 20); p.lookAt(0, 8.5, 0); root.add(p); }
  root.add(glowDisc(8), motes(600, 3, 24, 0.06, 0.3, 17));
  const upd = () => { for (const m of bars) m.color.copy(PAL.a).multiplyScalar(1.3 * U.uGlow.value); for (const [m, k] of bm) m.color.copy(PAL[k]).multiplyScalar(U.uGlow.value); };
  return { root, update(t) { beams.rotation.y = t * 0.1; upd(); }, onPalette: upd };
}

// ======== 6. 极光雪原 AURORA ========
function envAurora() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); float h = d.y;
    vec3 col = mix(uMid, uTop, smoothstep(-0.05, 0.7, h)); col = mix(col, uBot, smoothstep(0.0, -0.2, h));
    if (h > 0.0) { vec2 uv = d.xz / (h + 0.3); float t = uT * 0.03;
      float n = fbm2(uv * 0.5 + vec2(t, 0.0)); float w = uv.y * 0.5 + n * 2.8 + t;
      float rib = pow(1.0 - abs(sin(w * 3.14159)), 3.2); float rays = 0.45 + 0.9 * fbm2(vec2(uv.x * 4.0, t * 3.0));
      float vert = smoothstep(0.0, 0.1, h) * exp(-h * 3.2); float mask = smoothstep(0.25, 0.65, fbm2(uv * 0.3 + 9.0));
      vec3 ac = mix(uA, uB, smoothstep(0.08, 0.55, h + n * 0.2));
      col += ac * rib * rays * vert * mask * 3.2 * uGlow * (1.0 + uAud * 0.6); }
    gl_FragColor = vec4(col, 1.0); ${END} }`));
  root.add(stars(2600, 31, 2.4));
  root.add(floor(`void main(){ vec2 p = vW.xz; float d = length(vW - cameraPosition); float r = length(p);
      float sp = step(0.985, hash21(floor(p * 6.0))) * (0.5 + 0.5 * sin(uT * 3.0 + hash21(floor(p * 6.0)) * 40.0)) * (1.0 - smoothstep(10.0, 60.0, d));
      float rip = fbm2(p * 0.08); vec3 col = mix(uBot * 0.45, uMid * 0.18, rip) + uA * 0.012 * rip + (uA + uB) * 0.5 * sp * uGlow;
      col += uB * smoothstep(0.1, 0.0, abs(r - 5.4)) * 1.1 * uGlow;
      gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  const N = 90, R = 520, rnd = mulberry32(44), pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const a = i / N * 6.2832, h = 20 + Math.pow(rnd(), 1.2) * 110; pos.push(Math.cos(a) * R, -6, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx);
  const mount = rampMesh(mg, 0x000000); mount.material.side = THREE.DoubleSide;
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mg), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false }));
  root.add(mount, wire, glowDisc(7), motes(700, 3, 30, 0.05, 0.1, 23));
  const upd = basicColorUpdater([[mount.material, 'bot', 0.5], [wire.material, 'b', 0.8]]);
  return { root, update() { upd(); }, onPalette: upd };
}

// ======== 7. 黑日余烬 ECLIPSE ========
function envEclipse() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); float h = d.y;
    vec3 col = mix(uMid, uTop, smoothstep(0.0, 0.6, h)); col = mix(col, uBot, smoothstep(0.0, -0.2, h));
    vec3 sd = normalize(vec3(0.15, 0.3, -1.0)); float cs = dot(d, sd); float ang = acos(clamp(cs, -1.0, 1.0)); float R = 0.17;
    vec3 rt = normalize(cross(sd, vec3(0.0, 1.0, 0.0))); vec3 up2 = cross(rt, sd); vec2 q = vec2(dot(d, rt), dot(d, up2)); float th = atan(q.y, q.x);
    float rays = pow(0.5 + 0.5 * sin(th * 17.0 + uT * 0.08 + sin(th * 5.0) * 2.0), 3.0) * exp(-(ang - R) * 4.5);
    col += uA * exp(-max(ang - R, 0.0) * 8.0) * 1.3 * (1.0 + uAud * 0.5) * uGlow + uC * rays * 0.5 * uGlow;
    col += uC * smoothstep(0.014, 0.0, abs(ang - (R + 0.016))) * 2.0 * uGlow;
    col *= smoothstep(R - 0.002, R + 0.002, ang); gl_FragColor = vec4(col, 1.0); ${END} }`));
  root.add(floor(`void main(){ vec2 p = vW.xz * 0.16; float d = length(vW - cameraPosition); vec2 ip = floor(p), fp = fract(p); float m1 = 8.0, m2 = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = vec2(hash21(ip + g), hash21(ip + g + 17.3)); o = 0.5 + 0.5 * sin(uT * 0.15 + 6.2831 * o);
        vec2 r = g + o - fp; float dd = dot(r, r); if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd; }
      float edge = sqrt(m2) - sqrt(m1); float crack = smoothstep(0.1, 0.0, edge) * (1.0 - smoothstep(60.0, 220.0, d));
      float r0 = length(vW.xz); vec3 col = uBot * 0.35 + fbm2(vW.xz * 0.2) * uMid * 0.18;
      col += mix(uA, uC, 0.5 + 0.5 * sin(uT * 0.7 + m1 * 6.0)) * crack * (1.3 + 0.4 * sin(uT * 1.3) + uAud) * uGlow;
      col *= smoothstep(4.6, 5.2, r0) * 0.9 + 0.1; col += uC * smoothstep(0.1, 0.0, abs(r0 - 5.5)) * 1.3 * uGlow;
      gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(`varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    `varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - max(dot(normalize(vN), V), 0.0), 2.0);
      float lit = clamp(dot(normalize(vN), normalize(vec3(0.15, 0.3, -1.0))) * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = uBot * 0.4 + uA * (fr * 0.55 + lit * 0.12) * uGlow; gl_FragColor = vec4(fogMix(col, length(vW - cameraPosition)), 1.0); ${END} }`), 150);
  const rr = mulberry32(61), M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  for (let i = 0; i < 150; i++) { const r = 18 + Math.pow(rr(), 0.7) * 300, a = rr() * 6.2832, s = 1.5 + Math.pow(rr(), 2) * 22;
    P.set(Math.cos(a) * r, s * 0.45, Math.sin(a) * r); S.set(s, s * (0.8 + rr()), s); q.setFromEuler(E.set(rr() * 3, rr() * 6, rr() * 3)); M.compose(P, q, S); rocks.setMatrixAt(i, M); }
  rocks.frustumCulled = false; root.add(rocks, glowDisc(7), motes(1100, 2, 40, 0.06, 0.9, 71));
  return { root, update() {} };
}

// ======== 8. 极简摄影棚 STUDIO ========
function envStudio() {
  const root = new THREE.Group();
  root.add(sky(`void main(){ vec3 d = normalize(vD); vec3 c = mix(uMid * 0.2, uTop * 0.25, smoothstep(-0.2, 0.7, d.y)); gl_FragColor = vec4(c, 1.0); ${END} }`));
  root.add(floor(`void main(){ float r = length(vW.xz); float d = length(vW - cameraPosition);
      vec3 col = uMid * 0.1 + uMid * 0.2 * (1.0 - smoothstep(0.0, 14.0, r));
      col += uA * smoothstep(0.1, 0.0, abs(r - 5.5)) * 1.3 * uGlow + uB * smoothstep(0.06, 0.0, abs(r - 6.1)) * 0.9 * uGlow;
      col += uA * 0.12 * smoothstep(0.47, 0.5, abs(fract(r * 0.5) - 0.5)) * (1.0 - smoothstep(0.0, 30.0, r));
      col *= 1.0 - smoothstep(30.0, 200.0, r); gl_FragColor = vec4(fogMix(col, d), 1.0); ${END} }`));
  const tubes = []; const tubeG = new THREE.CylinderGeometry(0.07, 0.07, 6, 10);
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832 + 0.15, t = rampMesh(tubeG, 0xffffff); t.position.set(Math.cos(a) * 9, 3, Math.sin(a) * 9); root.add(t); tubes.push([t.material, i % 2 ? 'b' : 'a']); }
  for (const [rad, y, rx] of [[9, 6.2, Math.PI / 2], [9, 3, 0]]) { const t = rampMesh(new THREE.TorusGeometry(rad, 0.05, 6, 120), 0xffffff); t.rotation.x = rx; t.position.y = y; if (rx === 0) { t.position.set(0, 3, -8.5); t.scale.setScalar(0.75); } root.add(t); tubes.push([t.material, 'c']); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), mat(`varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    `varying vec2 vU; void main(){ float r = length((vU - vec2(0.5, 0.42)) * vec2(1.6, 1.0)); vec3 c = mix(uA, uB, vU.x) * smoothstep(0.55, 0.0, r) * 0.55 * uGlow * (1.0 + uAud * 0.6); gl_FragColor = vec4(c, 1.0); ${END} }`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  wall.position.set(0, 12, -22); root.add(wall, glowDisc(7), motes(300, 3, 14, 0.04, 0.15, 3));
  const upd = () => { for (const [m, k] of tubes) m.color.copy(PAL[k]).multiplyScalar(1.4 * U.uGlow.value); };
  return { root, update: upd, onPalette: upd };
}

// ---------- 环境清单 ----------
const P = (a, b, c, top, mid, bot) => ({ a, b, c, top, mid, bot });
export const ENV_DEFS = [
  { id: 'synth',  zh: '霓虹日落', en: 'SYNTHWAVE',  make: envSynth,   fog: 0.0055, light: 'sunset', pal: P(0xff2fd0, 0x30f0ff, 0xffb02e, 0x0a0030, 0x7a1a8a, 0x12002a) },
  { id: 'city',   zh: '赛博都市', en: 'CYBER CITY', make: envCity,    fog: 0.0085, light: 'cyber',  pal: P(0xff2f8f, 0x2ff0ff, 0xffd02e, 0x040418, 0x2a0a4a, 0x05030c) },
  { id: 'nebula', zh: '星云虚空', en: 'NEBULA',     make: envNebula,  fog: 0.0012, light: 'cyber',  pal: P(0xff3fa0, 0x3f6bff, 0x9a4bff, 0x02010a, 0x0c0624, 0x01000a) },
  { id: 'tunnel', zh: '数据隧道', en: 'DATA TUNNEL', make: envTunnel, fog: 0.012,  light: 'holo',   pal: P(0x20f0ff, 0xff2fd0, 0xf0ff40, 0x02101a, 0x06283a, 0x01060c) },
  { id: 'holo',   zh: '全息展厅', en: 'HOLO HALL',  make: envHolo,    fog: 0.007,  light: 'holo',   pal: P(0x30ffd0, 0x4090ff, 0xff40d0, 0x041418, 0x08303a, 0x020a0e) },
  { id: 'aurora', zh: '极光雪原', en: 'AURORA',     make: envAurora,  fog: 0.0035, light: 'aurora', pal: P(0x40ff9a, 0x7a50ff, 0xff50d8, 0x020a1c, 0x0a2a48, 0x03101c) },
  { id: 'eclipse',zh: '黑日余烬', en: 'ECLIPSE',    make: envEclipse, fog: 0.006,  light: 'blood',  pal: P(0xff4a10, 0xff2fa0, 0xffc040, 0x120208, 0x4a0a10, 0x0a0204) },
  { id: 'studio', zh: '极简棚拍', en: 'STUDIO',     make: envStudio,  fog: 0.003,  light: 'studio', pal: P(0xff40d0, 0x30e8ff, 0xffffff, 0x06040e, 0x1a1030, 0x020106) },
];

export class Envs {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'envs'; scene.add(this.group);
    this.cache = []; this.cur = -1; this.scene = scene;
    this.scene.fog = new THREE.FogExp2(0x000000, 0.006);
  }
  get def() { return ENV_DEFS[this.cur]; }
  set(i) {
    if (this.cur >= 0) this.group.remove(this.cache[this.cur].root);
    this.cur = i; const d = ENV_DEFS[i];
    PAL.set(d.pal);
    const e = this.cache[i] || (this.cache[i] = d.make());
    this.group.add(e.root); e.onPalette?.();
    return d;
  }
  refreshPalette() { PAL.refresh(); this.cache[this.cur]?.onPalette?.(); }
  update(t, dt, camPos, audio, fogMul) {
    if (this.cur < 0) return; const d = this.def; U.uT.value = t; U.uAud.value = audio;
    U.uFog.value = d.fog * fogMul; this.scene.fog.density = U.uFog.value; this.scene.fog.color.copy(PAL.fog);
    this.cache[this.cur].update?.(t, dt, camPos);
  }
}
