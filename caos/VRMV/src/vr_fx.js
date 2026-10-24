// VR 专用着色器特效（全方位、跟随观众平台）：
//  · nebula：包围观众的星云穹顶。噪声在顶点着色器里算（逐顶点而不是逐像素），整片天空只多一次很便宜的绘制
//  · motes ：观众身边漂浮的能量光点，随鼓点闪烁，GPU 动画，提供 VR 里很重要的近景纵深感
// 用来补偿 VR 里无法使用的泛光后期，同时让四面八方都有东西可看。各场景用哪些特效见 vr_config.js 的 VR_FX。
import * as THREE from 'three';
import { EYE, VR_FX } from './vr_config.js';

const NOISE = `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }`;

function makeNebula({ a = 0xff2f8f, b = 0x3ff6ff, i = 0.3, radius = 240 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uI: { value: i }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: `uniform float uT, uK, uI; uniform vec3 uA, uB; varying vec3 vC;
${NOISE}
void main(){
  vec3 d = normalize(position); float t = uT * 0.025;
  float f1 = fbm(d * 2.2 + vec3(t, -t * 0.7, t * 0.4));
  float f2 = fbm(d * 4.3 - vec3(t * 0.5, t, 0.0) + f1 * 1.5);
  float neb = smoothstep(0.42, 0.85, f2);
  float band = exp(-pow(d.y * 3.2 - sin(d.x * 2.0 + uT * 0.05) * 0.7, 2.0));
  vC = mix(uA, uB, smoothstep(0.3, 0.7, f1)) * (neb * 0.9 + band * 0.22) * uI * (1.0 + uK * 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `varying vec3 vC;
void main(){
  gl_FragColor = vec4(vC, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  m.frustumCulled = false; m.renderOrder = -50;
  return { obj: m, update(t, f) { mat.uniforms.uT.value = t; mat.uniforms.uK.value = f.kick || 0; } };
}

function makeMotes({ n = 1200, rMin = 1.2, rMax = 22, a = 0xff2f8f, b = 0x3ff6ff, size = 0.07, rise = 0.15 } = {}) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = rMin + Math.pow(Math.random(), 0.7) * (rMax - rMin);
    pos.set([Math.cos(th) * s * r, u * r * 0.6, Math.sin(th) * s * r], i * 3); seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uSize: { value: size }, uRise: { value: rise }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: `attribute float aS; uniform float uT, uK, uSize, uRise; varying float vA; varying float vS;
void main(){
  vec3 p = position;
  p.y = mod(p.y + uT * uRise * (0.4 + aS) + 12.0, 24.0) - 12.0;
  p.x += sin(uT * 0.3 + aS * 40.0) * 0.6; p.z += cos(uT * 0.27 + aS * 31.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.5 + 0.5 * sin(uT * (1.5 + aS * 3.0) + aS * 60.0);
  vA = (0.25 + 0.75 * tw) * (1.0 + uK * 1.2) * smoothstep(0.4, 1.5, -mv.z);
  vS = aS;
  gl_PointSize = clamp(uSize * 900.0 / -mv.z, 1.0, 40.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform vec3 uA, uB; varying float vA; varying float vS;
void main(){
  float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(mix(uA, uB, step(0.5, vS)) * a * vA, a * vA);
  #include <colorspace_fragment>
}`,
  });
  const m = new THREE.Points(g, mat); m.frustumCulled = false;
  return { obj: m, update(t, f) { mat.uniforms.uT.value = t; mat.uniforms.uK.value = f.kick || 0; } };
}

const MAKERS = { nebula: makeNebula, motes: makeMotes };

// 给某个场景的观众平台挂上特效。返回 { update(t, f) } 或 null
export function attachFx(name, adapter) {
  const cfg = VR_FX[name];
  if (!cfg) return null;
  const items = [];
  const g = new THREE.Group(); g.name = 'vrFx'; g.position.y = EYE;   // 以观众头部高度为中心
  for (const [kind, opts] of Object.entries(cfg)) {
    const mk = MAKERS[kind]; if (!mk) continue;
    const it = mk(opts); g.add(it.obj); items.push(it);
  }
  adapter.rig.add(g);
  return { group: g, update(t, f) { for (const it of items) it.update(t, f); } };
}
