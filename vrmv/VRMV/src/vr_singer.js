// 虚拟歌手：混元3D 生成的人物（VRMV/assets/singer/g1~g5.glb），每个有歌词的段落由一位站在观众左前方唱歌（SINGER_BY_SECTION）。
//  · 口型：按当前唱的假名（tl.kana，和画面歌词同一份逐字时间）取元音，换算成"张嘴 / 咧嘴 / 嘟嘴"，在顶点着色器里按嘴部坐标系变形。
//  · 转头：脖子以上绕脖子转动，时而看着观众、时而看前方或别处（按时间分段，平滑过渡）。
//  · 眼睛：镜片 / 眼睛后面有一双发光的眼睛（视差着色器，虹膜在表面后方），始终看向观众。
//  · 头发：弹簧质点（惯性、阻尼、风），头转动、人物移动时有惯性甩动；手柄伸进头发会被推开、带动。
//  · 不随音乐抖动；只有缓慢的呼吸和重心变化。
// 口型 / 转头 / 眼睛只由时间 t 和观众位置决定；头发物理有状态（实时模拟），跳转时重置。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SINGER, SINGERS, SINGER_BY_SECTION } from './vr_config.js';

// ---------- 假名 → 元音 → 口型 ----------
const VOWEL = {};
const ROW = {
  a: 'アカサタナハマヤラワガザダバパァャヮ', i: 'イキシチニヒミリギジヂビピィ', u: 'ウクスツヌフムユルグズヅブプゥュヴ',
  e: 'エケセテネヘメレゲゼデベペェ', o: 'オコソトノホモヨロヲゴゾドボポォョ', n: 'ン', x: 'ッ',
};
for (const [v, s] of Object.entries(ROW)) for (const c of s) VOWEL[c] = v;
const LIPS = new Set('マミムメモバビブベボパピプペポ');          // 双唇音：起音时先闭嘴
const kata = (c) => { const k = c.charCodeAt(0); return k >= 0x3041 && k <= 0x3096 ? String.fromCharCode(k + 0x60) : c; };
const SHAPE = {       // [张嘴, 咧嘴, 嘟嘴]
  a: [1.00, 0.15, 0.00], i: [0.28, 0.85, 0.00], u: [0.30, 0.00, 0.90], e: [0.60, 0.55, 0.00],
  o: [0.80, 0.00, 0.60], n: [0.06, 0.10, 0.00], x: [0.00, 0.00, 0.00], rest: [0.00, 0.00, 0.00],
};
const vowelOf = (flat, i) => { let c = kata(flat[i] || ''); if (c === 'ー' && i > 0) c = kata(flat[i - 1]); return VOWEL[c] || 'a'; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function mouthAt(k, f) {
  if (!k || k.i < 0 || !k.times || !k.flat) return [0, 0, 0];
  const { i, times, flat, age } = k;
  const gapPrev = i > 0 ? times[i] - times[i - 1] : 99;
  const next = i + 1 < times.length ? times[i + 1] - times[i] : 0.9;
  const cur = SHAPE[vowelOf(flat, i)];
  const prev = i > 0 && gapPrev < 0.9 ? SHAPE[vowelOf(flat, i - 1)] : SHAPE.rest;
  const b = sm(0, 0.075, age);
  const out = [0, 1, 2].map((j) => prev[j] + (cur[j] - prev[j]) * b);
  if (LIPS.has(kata(flat[i]))) out[0] *= sm(0.015, 0.09, age);
  const hold = next > 0.85 ? Math.min(0.75, next - 0.12) : 9;
  const rel = 1 - sm(hold, hold + 0.18, age);
  const loud = 0.78 + 0.32 * Math.min(1, (f ? f.vox : 0.5) * 1.6);
  return [out[0] * rel * loud, out[1] * rel, out[2] * rel];
}

// ---------- 转头日程：只由 t 决定 ----------
const LOOK = SINGER.look;
const SCHED = (() => {
  const out = []; let t = -2, i = 0;
  while (t < 400) {
    const len = LOOK.seg[0] + (LOOK.seg[1] - LOOK.seg[0]) * hash(i * 3.1);
    const r = hash(i * 7.7 + 1);
    const mode = r < LOOK.viewer ? 'viewer' : r < LOOK.viewer + LOOK.forward ? 'forward' : 'away';
    const side = hash(i * 5.3 + 2) < 0.5 ? -1 : 1;
    out.push({ t0: t, mode, away: [side * (0.35 + 0.2 * hash(i + 9)), 0.05 + 0.12 * hash(i + 4)] });
    t += len; i++;
  }
  return out;
})();
function lookAngles(t, viewerYP) {
  let j = 0; while (j + 1 < SCHED.length && SCHED[j + 1].t0 <= t) j++;
  const ang = (s) => s.mode === 'viewer' ? viewerYP : s.mode === 'forward' ? [0, -0.04] : s.away;
  const a = ang(SCHED[Math.max(0, j - 1)]), b = ang(SCHED[j]);
  const w = sm(0, LOOK.blend, t - SCHED[j].t0);
  let yaw = a[0] + (b[0] - a[0]) * w + 0.035 * Math.sin(t * 0.37), pitch = a[1] + (b[1] - a[1]) * w + 0.02 * Math.sin(t * 0.53 + 1);
  yaw = Math.max(-LOOK.maxYaw, Math.min(LOOK.maxYaw, yaw));
  pitch = Math.max(-0.3, Math.min(LOOK.maxPitch, pitch));
  return [yaw, pitch];
}

// ---------- 人物坐标系（由嘴、嘴角、双眼 landmark 推出） ----------
const V3 = (a) => new THREE.Vector3(...a);
function frameOf(c) {
  const eL = V3(c.eyeL), eR = V3(c.eyeR), mo = V3(c.mouth);
  const eM = eL.clone().add(eR).multiplyScalar(0.5);
  const right = eR.clone().sub(eL).normalize();
  const up = eM.clone().sub(mo); up.addScaledVector(right, -up.dot(right)).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up); if (fwd.z < 0) fwd.negate();
  const H = eM.clone().addScaledVector(fwd, -0.075);
  const N = mo.clone().addScaledVector(up, -0.06).addScaledVector(fwd, -0.055);
  // 嘴部坐标系：x 嘴角方向，y 向上，z 向前
  const mx = V3(c.cornerR).sub(V3(c.cornerL)).normalize();
  const my = up.clone().addScaledVector(mx, -up.dot(mx)).normalize();
  const mz = new THREE.Vector3().crossVectors(mx, my); if (mz.dot(fwd) < 0) mz.negate();
  const mouthM = new THREE.Matrix3().set(mx.x, mx.y, mx.z, my.x, my.y, my.z, mz.x, mz.y, mz.z);   // 行 = 轴：世界 → 嘴部
  const mouthW = c.cornerL ? V3(c.cornerR).distanceTo(V3(c.cornerL)) / 2 : SINGER.mouthW;
  return { eL, eR, eM, right, up, fwd, H, N, mo, mouthM, mouthW };
}

// ---------- 眼睛：镜片 / 眼睛表面后方的发光眼球，虹膜始终朝向观众 ----------
function makeEye(r, colA, colB, seed) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: {
      uR: { value: r }, uD: { value: SINGER.eye.depth }, uV: { value: new THREE.Vector3(0, 0, 1) }, uT: { value: 0 },
      uA: { value: new THREE.Color(colA) }, uB: { value: new THREE.Color(colB) }, uBlink: { value: 0 }, uFade: { value: 1 }, uSeed: { value: seed },
    },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uR, uD, uT, uBlink, uFade, uSeed; uniform vec3 uV, uA, uB; varying vec2 vP;
      void main(){
        float q = length(vP) / uR;
        float sock = 1.0 - smoothstep(0.82, 1.0, q);                     // 眼窝（圆形，边缘柔和）
        if (sock <= 0.001) discard;
        // 眼球中心在表面后方 uD；虹膜是朝向观众的圆盘，位于眼球前表面
        vec3 C = vec3(0.0, 0.0, -uD);
        vec3 n = normalize(uV - C);
        vec3 Q = C + n * (uD * 0.82);
        vec3 P = vec3(vP, 0.0);
        vec3 dir = normalize(P - uV);
        float tt = dot(Q - P, n) / dot(dir, n);
        vec3 hit = P + dir * tt;
        vec2 ip = vec2(dot(hit - Q, normalize(cross(vec3(0.0, 1.0, 0.0), n))), dot(hit - Q, normalize(cross(n, normalize(cross(vec3(0.0, 1.0, 0.0), n))))));
        float ri = length(ip) / (uR * 0.52);
        float ang = atan(ip.y, ip.x);
        float streak = 0.55 + 0.45 * sin(ang * 23.0 + uSeed * 3.0 + sin(ang * 7.0) * 1.5);
        float ring = 0.5 + 0.5 * sin(ri * 18.0 - uT * 1.6);
        vec3 iris = mix(uB, uA, smoothstep(0.25, 0.95, ri)) * (0.55 + 0.6 * streak) * (0.75 + 0.35 * ring);
        float irisM = 1.0 - smoothstep(0.92, 1.02, ri);
        float pupil = 1.0 - smoothstep(0.26, 0.33, ri + 0.05 * sin(uT * 0.9 + uSeed));
        vec3 col = vec3(0.012, 0.0, 0.02) + uA * 0.12 * (1.0 - q);      // 深色眼球
        col = mix(col, iris * 1.8, irisM);
        col = mix(col, vec3(0.0), pupil * 0.96);
        col += uA * 0.9 * exp(-pow((ri - 1.0) * 6.0, 2.0));              // 虹膜外圈辉光
        col += vec3(1.0) * smoothstep(0.12, 0.0, length(vP / uR - vec2(-0.28, 0.32))) * 0.8;   // 镜面高光
        // 眨眼：上眼睑从上往下
        float lid = smoothstep(1.0 - 2.1 * uBlink, 1.04 - 2.1 * uBlink, vP.y / uR);
        col = mix(col, vec3(0.01, 0.0, 0.015), lid);
        float a = sock * mix(0.92, 1.0, irisM) * uFade;
        gl_FragColor = vec4(col, a);
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), mat);
}

// ---------- 一个人物 ----------
async function loadChar(id, def, ctx) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL(def.url, import.meta.url).href);
  let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  gltf.scene.updateMatrixWorld(true);
  const g = mesh.geometry, M = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3();
  const toF = (a, fn) => { const o = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); fn(v); v.toArray(o, i * 3); } return new THREE.BufferAttribute(o, 3); };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', toF(g.attributes.position, (p) => p.applyMatrix4(M)));
  geo.setAttribute('normal', toF(g.attributes.normal, (n) => n.applyMatrix3(nm).normalize()));
  const uv = g.attributes.uv, uvf = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) { uvf[2 * i] = uv.getX(i); uvf[2 * i + 1] = uv.getY(i); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvf, 2));
  geo.setIndex(g.index);
  const F = frameOf(def), HC = SINGER.hair;
  const pos = geo.attributes.position.array, nv = pos.length / 3;
  let top = -1e9; for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);

  // 头发：每个顶点的摆动权重 = 头发权重 × 从眼睛高度往下的渐变（越往下越自由）
  const h = g.attributes._hair, hm = new Float32Array(nv);
  const rootH = F.eM.clone().sub(F.N).dot(F.up);
  for (let i = 0; i < nv; i++) {
    v.fromArray(pos, 3 * i);
    const hh = v.clone().sub(F.N).dot(F.up);
    hm[i] = h.getX(i) * sm(rootH, rootH - HC.len, hh);
  }
  // 控制点：在会动的头发上做最远点采样
  const cand = []; for (let i = 0; i < nv; i++) if (hm[i] > 0.25) cand.push(i);
  const ctl = [];
  if (cand.length) {
    let first = cand[0]; for (const i of cand) if (hm[i] > hm[first]) first = i;
    ctl.push(first);
    const dmin = new Float32Array(cand.length).fill(1e9);
    while (ctl.length < HC.ctl) {
      const last = ctl[ctl.length - 1]; let best = -1, bd = -1;
      for (let j = 0; j < cand.length; j++) {
        const i = cand[j];
        const d = (pos[3*i]-pos[3*last])**2 + (pos[3*i+1]-pos[3*last+1])**2 + (pos[3*i+2]-pos[3*last+2])**2;
        if (d < dmin[j]) dmin[j] = d;
        if (dmin[j] > bd) { bd = dmin[j]; best = i; }
      }
      if (best < 0 || bd < 1e-6) break;
      ctl.push(best);
    }
  }
  const NC = HC.ctl;
  const cIdx = new Float32Array(nv * 2), cW = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    if (hm[i] <= 0.005 || !ctl.length) continue;
    let a = -1, b = -1, da = 1e9, db = 1e9;
    for (let c = 0; c < ctl.length; c++) {
      const k = ctl[c]; const d = (pos[3*i]-pos[3*k])**2 + (pos[3*i+1]-pos[3*k+1])**2 + (pos[3*i+2]-pos[3*k+2])**2;
      if (d < da) { db = da; b = a; da = d; a = c; } else if (d < db) { db = d; b = c; }
    }
    const wa = 1 / (Math.sqrt(da) + 0.01), wb = b >= 0 ? 1 / (Math.sqrt(db) + 0.01) : 0;
    cIdx[2*i] = a; cIdx[2*i+1] = Math.max(0, b); cW[2*i] = hm[i] * wa / (wa + wb); cW[2*i+1] = hm[i] * wb / (wa + wb);
  }
  geo.setAttribute('aCtl', new THREE.BufferAttribute(cIdx, 2));
  geo.setAttribute('aCtlW', new THREE.BufferAttribute(cW, 2));
  geo.computeBoundingSphere();

  const src = mesh.material;
  const mat = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, normalScale: src.normalScale,
    roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap, roughness: src.roughness, metalness: src.metalness,
    envMap: ctx.env, envMapIntensity: SINGER.env,
  });
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) if (t && ctx.renderer) ctx.renderer.initTexture(t);
  const U = {
    uT: { value: 0 }, uOpen: { value: 0 }, uWide: { value: 0 }, uRound: { value: 0 },
    uMouth: { value: F.mo }, uMouthM: { value: F.mouthM }, uMouthW: { value: F.mouthW }, uJaw: { value: SINGER.jaw },
    uNeck: { value: F.N }, uUp: { value: F.up }, uHeadR: { value: new THREE.Matrix3() },
    uCtl: { value: Array.from({ length: NC }, () => new THREE.Vector3()) },
    uFade: { value: 0 }, uTop: { value: top },
    uRimA: { value: new THREE.Color(SINGER.rimA) }, uRimB: { value: new THREE.Color(SINGER.rimB) }, uRim: { value: SINGER.rim }, uKey: { value: SINGER.key },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCtl; attribute vec2 aCtlW;
        uniform float uOpen, uWide, uRound, uMouthW, uJaw;
        uniform vec3 uMouth, uNeck, uUp; uniform mat3 uMouthM, uHeadR;
        uniform vec3 uCtl[${NC}];
        varying float vGap; varying float vY;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float headW = smoothstep(0.0, 0.05, dot(position - uNeck, uUp));       // 脖子以上跟着头转
        objectNormal = normalize(mix(objectNormal, uHeadR * objectNormal, headW));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 p0 = position; vY = p0.y;
          vec3 ml = uMouthM * (p0 - uMouth); float W = uMouthW;               // 嘴部坐标：x 嘴角方向、y 向上、z 向前
          float front = smoothstep(-0.115, -0.05, ml.z);
          float lat = 1.0 - smoothstep(W * 0.9, W * 1.9, abs(ml.x));
          float lower = smoothstep(0.0012, -0.0012, ml.y) * (1.0 - smoothstep(0.036, 0.062, -ml.y));
          float upper = smoothstep(-0.0012, 0.0012, ml.y) * (1.0 - smoothstep(0.008, 0.02, ml.y));
          float lip = (1.0 - smoothstep(0.012, 0.022, abs(ml.y))) * (1.0 - smoothstep(W * 0.85, W * 1.3, abs(ml.x)));
          float jaw = uOpen * uJaw;
          float sxn = ml.x / W;
          float prof = 1.0 - smoothstep(0.0, 1.0, sxn * sxn);
          float lowW = mix(prof, lat, smoothstep(0.004, 0.02, -ml.y));
          vec3 d = vec3(0.0);
          d.y -= jaw * lower * lowW; d.z -= jaw * 0.35 * lower * lowW;
          d.y += jaw * 0.2 * upper * prof;
          float sx = clamp(sxn, -1.3, 1.3);
          d.x += sx * W * (0.16 * uWide - 0.28 * uRound) * lip;
          d.y += 0.0035 * uWide * smoothstep(0.45, 1.0, abs(sx)) * lip;
          d.z += 0.005 * uRound * lip * (1.0 - abs(sx) * 0.6);
          transformed += transpose(uMouthM) * (d * front);
          vGap = uOpen * (1.0 - smoothstep(0.0, 0.0045, abs(ml.y))) * (1.0 - smoothstep(W * 0.7, W * 0.98, abs(ml.x))) * front;
          // 转头
          transformed = mix(transformed, uNeck + uHeadR * (transformed - uNeck), headW);
          // 头发物理（控制点位移，已换算到模型坐标）
          int ia = int(aCtl.x + 0.5), ib = int(aCtl.y + 0.5);
          transformed += uCtl[ia] * aCtlW.x + uCtl[ib] * aCtlW.y;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uFade, uTop, uRim, uKey; uniform vec3 uRimA, uRimB;
        varying float vGap; varying float vY;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float rev = uFade * (uTop + 0.25) - (uTop - vY);
        if (rev < 0.0) discard;
        float base = smoothstep(0.02, 0.24, vY);
        if (hsh(floor(gl_FragCoord.xy)) > base) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gap = clamp(vGap * 1.7, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.0, 0.02), gap);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, gap);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.5);
          float side = 0.5 + 0.5 * sin(vY * 9.0 + uT * 0.8);
          totalEmissiveRadiance += mix(uRimA, uRimB, side) * fr * uRim * (1.0 - gap);
          vec3 kd = normalize(vec3(-0.35, 0.55, 0.75));
          totalEmissiveRadiance += diffuseColor.rgb * uKey * (0.25 + 0.75 * max(dot(normal, kd), 0.0)) * (1.0 - gap) * (1.0 - 0.9 * metalnessFactor);
          float edge = smoothstep(0.06, 0.0, rev);
          float scan = step(0.5, fract(vY * 140.0 - uT * 3.0)) * (1.0 - uFade);
          totalEmissiveRadiance += uRimB * (edge * 3.0 + scan * 0.6);
        }`);
  };
  mat.customProgramCacheKey = () => 'vr_singer_' + NC;

  const body = new THREE.Mesh(geo, mat); body.frustumCulled = false;
  // 层级：root（hud 里的站位，朝向观众）→ inner（把双眼中点移到原点、把人物的脸转向 +Z）→ body / eyes
  const root = new THREE.Group(); root.name = 'vrSinger_' + id; root.visible = false;
  const breath = new THREE.Group(); root.add(breath);
  const inner = new THREE.Group(); breath.add(inner);
  const yawFix = -Math.atan2(F.fwd.x, F.fwd.z);
  inner.rotation.y = yawFix;
  inner.position.copy(F.eM).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawFix).negate();
  inner.position.y -= SINGER.eyeDrop;
  inner.add(body);
  // 眼睛：放在眼睛 / 镜片表面前 3 毫米，跟着头一起转（eyeHead 的变换和着色器里的转头一致）
  const eyeHead = new THREE.Group(); inner.add(eyeHead);
  const basis = new THREE.Matrix4().makeBasis(F.right, F.up, F.fwd);
  const eyes = [F.eL, F.eR].map((p, i) => {
    const e = makeEye(def.eyeR_ || 0.018, def.iris[0], def.iris[1], i + id.charCodeAt(1));
    e.position.copy(p).addScaledVector(F.fwd, 0.003);
    e.quaternion.setFromRotationMatrix(basis);
    e.renderOrder = 5;
    eyeHead.add(e); return e;
  });

  // 头发控制点状态（世界坐标）
  const P = ctl.map((i) => ({ p0: new THREE.Vector3().fromArray(pos, 3 * i), w: hm[i], T: new THREE.Vector3(), Tp: null, vT: new THREE.Vector3(), d: new THREE.Vector3(), dv: new THREE.Vector3() }));
  return { id, root, breath, inner, body, eyes, eyeHead, U, F, P, mat, top };
}

export async function createSinger(ctx) {
  const ids = [...new Set(Object.values(SINGER_BY_SECTION))].filter((k) => SINGERS[k]);
  const chars = {};
  await Promise.all(ids.map(async (id) => {
    try { chars[id] = await loadChar(id, SINGERS[id], ctx); } catch (e) { console.warn('歌手模型加载失败', id, e); }
  }));
  for (const c of Object.values(chars)) { c.root.position.fromArray(SINGER.pos); c.root.rotation.y = Math.atan2(-SINGER.pos[0], -SINGER.pos[2]); }

  const HC = SINGER.hair;
  const w0 = 2 * Math.PI * HC.hz, K = w0 * w0, C = 2 * HC.zeta * w0;
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _r = new THREE.Vector3(), _inv = new THREE.Quaternion();
  const handsPrev = [null, null], handVel = [new THREE.Vector3(), new THREE.Vector3()];
  let active = null, lastT = -1;

  function headRotation(c, t, viewerW) {
    // 观众在人物坐标里的方向（相对头部中心）→ 偏航 / 俯仰
    const inv = _m4.copy(c.inner.matrixWorld).invert();
    const vl = _v.copy(viewerW).applyMatrix4(inv).sub(c.F.H);
    const x = vl.dot(c.F.right), y = vl.dot(c.F.up), z = vl.dot(c.F.fwd);
    const viewer = [Math.atan2(x, z), Math.atan2(y, Math.hypot(x, z))];
    const [yaw, pitch] = lookAngles(t, viewer);
    _q.setFromAxisAngle(c.F.up, yaw); _q2.setFromAxisAngle(c.F.right, -pitch); _q.multiply(_q2);
    return _q;
  }

  function simulateHair(c, dt, hands, reset) {
    const iw = c.inner.matrixWorld;
    c.inner.getWorldQuaternion(_inv).invert();
    const R = c.U.uHeadR.value, N = c.F.N, up = c.F.up;
    for (let i = 0; i < c.P.length; i++) {
      const s = c.P[i];
      // 刚体目标：控制点随头转动后的位置（世界坐标）
      const hw = sm(0, 0.05, _v.copy(s.p0).sub(N).dot(up));
      _r.copy(s.p0).sub(N).applyMatrix3(R).add(N);
      const T = _v.copy(s.p0).lerp(_r, hw).applyMatrix4(iw);
      if (reset || !s.Tp || T.distanceTo(s.Tp) > 0.25) { s.Tp = T.clone(); s.vT.set(0, 0, 0); s.d.set(0, 0, 0); s.dv.set(0, 0, 0); continue; }
      const vT = T.clone().sub(s.Tp).divideScalar(Math.max(dt, 1e-3));
      const aT = vT.clone().sub(s.vT).divideScalar(Math.max(dt, 1e-3)); if (aT.length() > 30) aT.setLength(30);
      s.Tp.copy(T); s.vT.copy(vT);
      const n = Math.max(1, Math.ceil(dt / 0.011)), h = dt / n;
      for (let k = 0; k < n; k++) {
        const a = s.d.clone().multiplyScalar(-K).addScaledVector(s.dv, -C).sub(aT);
        // 风：缓慢变化，不跟音乐
        a.x += HC.wind * Math.sin(lastT * 0.7 + i * 1.3); a.z += HC.wind * 0.8 * Math.cos(lastT * 0.53 + i * 0.7); a.y += HC.wind * 0.15 * Math.sin(lastT * 1.1 + i);
        // 手柄：靠近时把头发推开，移动时带动头发
        for (let j = 0; j < hands.length; j++) {
          const hp = hands[j]; if (!hp) continue;
          const pr = T.clone().add(s.d).sub(hp), dist = pr.length();
          if (dist < HC.handR) {
            const f = 1 - dist / HC.handR;
            a.addScaledVector(pr.normalize(), HC.push * f * f);
            a.addScaledVector(handVel[j].clone().sub(vT).sub(s.dv), HC.drag * f);
          }
        }
        s.dv.addScaledVector(a, h); s.d.addScaledVector(s.dv, h);
        if (s.d.length() > HC.max) { s.d.setLength(HC.max); s.dv.multiplyScalar(0.5); }
      }
    }
    // 世界位移 → 模型坐标（inner 只有旋转和平移）
    for (let i = 0; i < c.U.uCtl.value.length; i++) {
      const s = c.P[i];
      if (s) c.U.uCtl.value[i].copy(s.d).applyQuaternion(_inv); else c.U.uCtl.value[i].set(0, 0, 0);
    }
  }

  return {
    chars,
    attachForCompile(hud) { const c = Object.values(chars)[0]; if (!c) return; hud.add(c.root); c.root.visible = true; c.U.uFade.value = 1; },
    detach() { for (const c of Object.values(chars)) { if (c.root.parent) c.root.parent.remove(c.root); c.root.visible = false; } },
    // view = { viewer: 观众眼睛世界坐标, hands: [世界坐标|null, …], dt }
    update(t, f, S, k, A, secs, view) {
      const id = SINGER_BY_SECTION[S.sec.id];
      const c = id && chars[id];
      if (active && active !== c) { if (active.root.parent) active.root.parent.remove(active.root); active.root.visible = false; }
      if (!c) { active = null; return; }
      const jump = active !== c || Math.abs(t - lastT) > 0.5;
      if (c.root.parent !== A.hud) A.hud.add(c.root);
      c.root.visible = true; active = c;
      // 显形 / 消失：相邻段落是同一个人物时不消失
      const i = S.index, same = (j) => secs && j >= 0 && j < secs.length && SINGER_BY_SECTION[secs[j].id] === id;
      const a = sm(S.sec.start, S.sec.start + SINGER.fadeIn, t), b = 1 - sm(S.sec.end - SINGER.fadeOut, S.sec.end, t);
      const fade = Math.min(same(i - 1) ? 1 : a, same(i + 1) ? 1 : b);
      c.U.uFade.value = fade; c.U.uT.value = t;
      const [o, w, r] = mouthAt(k, f);
      c.U.uOpen.value = o; c.U.uWide.value = w; c.U.uRound.value = r;
      // 呼吸与重心（不跟音乐）
      c.root.updateMatrixWorld(true);
      // 转头
      const viewer = (view && view.viewer ? view.viewer : new THREE.Vector3(0, 1.6, 0)).clone();
      const q = headRotation(c, t, viewer.clone()).clone();
      c.U.uHeadR.value.setFromMatrix4(_m4.makeRotationFromQuaternion(q));
      c.eyeHead.position.copy(c.F.N).sub(c.F.N.clone().applyQuaternion(q)); c.eyeHead.quaternion.copy(q);
      // 眼睛看观众 + 眨眼（每 2.5~5 秒一次）
      c.root.updateMatrixWorld(true);
      const bi = Math.floor(t / 3.7), bp = t - bi * 3.7 - hash(bi) * 1.5;
      const blink = bp > 0 && bp < 0.16 ? Math.sin(bp / 0.16 * Math.PI) : 0;
      for (const e of c.eyes) {
        const u = e.material.uniforms;
        const vl = viewer.clone().applyMatrix4(_m4.copy(e.matrixWorld).invert());
        const dir = vl.clone().normalize(), lim = Math.cos(SINGER.eye.look);
        if (dir.z < lim) { const xy = Math.hypot(dir.x, dir.y) || 1; const s = Math.sqrt(1 - lim * lim) / xy; dir.set(dir.x * s, dir.y * s, lim); }
        u.uV.value.copy(dir.multiplyScalar(Math.max(0.3, vl.length())));
        u.uT.value = t; u.uBlink.value = blink; u.uFade.value = fade;
      }
      // 手柄速度
      const hands = (view && view.hands) || [];
      const dt = view && view.dt ? Math.min(0.05, view.dt) : 1 / 72;
      for (let j = 0; j < 2; j++) {
        const hp = hands[j];
        if (hp && handsPrev[j]) handVel[j].copy(hp).sub(handsPrev[j]).divideScalar(dt); else handVel[j].set(0, 0, 0);
        handsPrev[j] = hp ? hp.clone() : null;
      }
      simulateHair(c, dt, hands, jump);
      lastT = t;
      c.breath.position.y = 0.003 * Math.sin(t * 2 * Math.PI / 4.2);
      c.breath.rotation.z = 0.012 * Math.sin(t * 0.31);
    },
  };
}
