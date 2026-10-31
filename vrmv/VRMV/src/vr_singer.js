// 虚拟歌手：混元3D 生成的上半身像（VRMV/assets/singer/singer.glb），在有歌词的段落里站在观众左前方唱歌。
//  · 口型：按当前唱的假名（tl.kana，和画面歌词同一份逐字时间）取元音 a/i/u/e/o/n，换算成"张嘴 / 咧嘴 / 嘟嘴"三个量，
//    在顶点着色器里变形嘴唇和下巴；嘴唇之间被拉开的部分压暗，看起来像张开的嘴。
//  · 头发：模型里烘焙了逐顶点头发权重（_HAIR，按贴图颜色和金属度识别），着色器里按时间做风吹摆动，鼓点时加大。
//  · 出现 / 消失：从头顶往下扫描显形（全息风格），底部渐隐。
// 画面只由时间 t 决定（无随机、无累积状态），和原 MV 的设计一致。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SINGER } from './vr_config.js';

// ---------- 假名 → 元音 ----------
const VOWEL = {};
const ROW = {
  a: 'アカサタナハマヤラワガザダバパァャヮ', i: 'イキシチニヒミリギジヂビピィ', u: 'ウクスツヌフムユルグズヅブプゥュヴ',
  e: 'エケセテネヘメレゲゼデベペェ', o: 'オコソトノホモヨロヲゴゾドボポォョ', n: 'ン', x: 'ッ',
};
for (const [v, s] of Object.entries(ROW)) for (const c of s) VOWEL[c] = v;
const LIPS = new Set('マミムメモバビブベボパピプペポ');          // 双唇音：起音时先闭嘴
const kata = (c) => { const k = c.charCodeAt(0); return k >= 0x3041 && k <= 0x3096 ? String.fromCharCode(k + 0x60) : c; };
// 三个口型量：open 张嘴（下巴）、wide 咧嘴（嘴角外拉）、round 嘟嘴（嘴角内收、嘴唇前突）
const SHAPE = {
  a: [1.00, 0.15, 0.00], i: [0.28, 0.85, 0.00], u: [0.30, 0.00, 0.90], e: [0.60, 0.55, 0.00],
  o: [0.80, 0.00, 0.60], n: [0.06, 0.10, 0.00], x: [0.00, 0.00, 0.00], rest: [0.00, 0.00, 0.00],
};
const vowelOf = (flat, i) => {
  let c = kata(flat[i] || ''); if (c === 'ー' && i > 0) c = kata(flat[i - 1]);
  return VOWEL[c] || 'a';
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 当前口型（只依赖 t 与逐字时间表）
export function mouthAt(k, f) {
  if (!k || k.i < 0 || !k.times || !k.flat) return [0, 0, 0];
  const { i, times, flat, age } = k;
  const gapPrev = i > 0 ? times[i] - times[i - 1] : 99;
  const next = i + 1 < times.length ? times[i + 1] - times[i] : 0.9;
  const cur = SHAPE[vowelOf(flat, i)];
  const prev = i > 0 && gapPrev < 0.9 ? SHAPE[vowelOf(flat, i - 1)] : SHAPE.rest;
  const b = sm(0, 0.075, age);                                      // 前一个口型 → 当前口型
  const out = [0, 1, 2].map((j) => prev[j] + (cur[j] - prev[j]) * b);
  if (LIPS.has(kata(flat[i]))) out[0] *= sm(0.015, 0.09, age);      // ま行等：先闭唇再张开
  const hold = next > 0.85 ? Math.min(0.75, next - 0.12) : 9;       // 行尾 / 长停顿：唱完后合嘴
  const rel = 1 - sm(hold, hold + 0.18, age);
  const loud = 0.78 + 0.32 * Math.min(1, (f ? f.vox : 0.5) * 1.6); // 人声越响，嘴张得越大
  return [out[0] * rel * loud, out[1] * rel, out[2] * rel];
}

export async function createSinger(ctx) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL(SINGER.url, import.meta.url).href);
  let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  gltf.scene.updateMatrixWorld(true);
  // meshopt 量化后顶点是整数 + 节点缩放；这里还原成以米为单位的浮点坐标（着色器里的嘴部坐标都是模型原尺寸）
  const g = mesh.geometry, M = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3();
  const toF = (a, fn) => { const o = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); fn(v); v.toArray(o, i * 3); } return new THREE.BufferAttribute(o, 3); };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', toF(g.attributes.position, (p) => p.applyMatrix4(M)));
  geo.setAttribute('normal', toF(g.attributes.normal, (n) => n.applyMatrix3(nm).normalize()));
  const uv = g.attributes.uv, uvf = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) { uvf[2 * i] = uv.getX(i); uvf[2 * i + 1] = uv.getY(i); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvf, 2));
  const h = g.attributes._hair, hf = new Float32Array(h.count);
  for (let i = 0; i < h.count; i++) hf[i] = h.getX(i);
  geo.setAttribute('hairW', new THREE.BufferAttribute(hf, 1));
  geo.setIndex(g.index);
  geo.computeBoundingSphere();

  // GLB 里是带 KHR_materials_specular 的 Physical 材质；换成 Standard，Quest 上更省
  const src = mesh.material;
  const mat = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, normalScale: src.normalScale,
    roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap, roughness: src.roughness, metalness: src.metalness,
  });
  mat.envMap = ctx.env; mat.envMapIntensity = SINGER.env;
  mat.side = THREE.FrontSide;
  const U = {
    uT: { value: 0 }, uOpen: { value: 0 }, uWide: { value: 0 }, uRound: { value: 0 },
    uMouth: { value: new THREE.Vector3(...SINGER.mouth) }, uMouthW: { value: SINGER.mouthW }, uJaw: { value: SINGER.jaw },
    uHair: { value: SINGER.hairAmp }, uHairTop: { value: SINGER.hairTop }, uKick: { value: 0 },
    uFade: { value: 0 }, uTop: { value: SINGER.top },
    uRimA: { value: new THREE.Color(SINGER.rimA) }, uRimB: { value: new THREE.Color(SINGER.rimB) }, uRim: { value: SINGER.rim }, uKey: { value: SINGER.key },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float hairW;
        uniform float uT, uOpen, uWide, uRound, uMouthW, uJaw, uHair, uHairTop, uKick;
        uniform vec3 uMouth;
        varying float vGap; varying float vY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 p0 = position; vY = p0.y;
          vec3 dm = p0 - uMouth; float W = uMouthW;
          float front = smoothstep(0.075, 0.14, p0.z);                                       // 只动脸的正面
          float lat = 1.0 - smoothstep(W * 0.9, W * 1.9, abs(dm.x));
          float lower = smoothstep(0.0012, -0.0012, dm.y) * (1.0 - smoothstep(0.036, 0.062, -dm.y));  // 下唇 + 下巴
          float upper = smoothstep(-0.0012, 0.0012, dm.y) * (1.0 - smoothstep(0.008, 0.02, dm.y));   // 上唇
          float lip = (1.0 - smoothstep(0.012, 0.022, abs(dm.y))) * (1.0 - smoothstep(W * 0.85, W * 1.3, abs(dm.x)));
          float jaw = uOpen * uJaw;
          // 嘴唇开口呈椭圆：嘴角不分开、中间开得最大；离嘴唇越远（下巴）越接近整体平移
          float sxn = dm.x / W;
          float prof = 1.0 - smoothstep(0.0, 1.0, sxn * sxn);
          float lowW = mix(prof, lat, smoothstep(0.004, 0.02, -dm.y));
          vec3 d = vec3(0.0);
          d.y -= jaw * lower * lowW; d.z -= jaw * 0.35 * lower * lowW;
          d.y += jaw * 0.2 * upper * prof;
          float sx = clamp(dm.x / W, -1.3, 1.3);
          d.x += sx * W * (0.16 * uWide - 0.28 * uRound) * lip;
          d.y += 0.0035 * uWide * smoothstep(0.45, 1.0, abs(sx)) * lip;
          d.z += 0.005 * uRound * lip * (1.0 - abs(sx) * 0.6);
          transformed += d * front;
          vGap = uOpen * (1.0 - smoothstep(0.0, 0.0045, abs(dm.y))) * (1.0 - smoothstep(W * 0.7, W * 0.98, abs(dm.x))) * front;
          // 头发：越往下摆得越大；沿身体外侧方向摆（不往身体里穿），再加一点横向
          float hw = hairW * smoothstep(uHairTop, uHairTop - 0.38, p0.y);
          vec2 rd = normalize(p0.xz + vec2(1e-4));
          float ph = p0.y * 7.0 + p0.x * 4.0 + p0.z * 3.0;
          float s1 = sin(uT * 1.9 + ph), s2 = sin(uT * 1.27 + ph * 0.6 + 1.7), s3 = sin(uT * 3.1 + ph * 1.7);
          float amp = uHair * hw * (1.0 + 1.6 * uKick);
          transformed.xz += rd * amp * (0.5 + 0.35 * s1 + 0.15 * s3) + vec2(-rd.y, rd.x) * amp * 0.65 * s2;
          transformed.y += amp * 0.12 * s2;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uFade, uTop, uRim, uKey; uniform vec3 uRimA, uRimB;
        varying float vGap; varying float vY;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float rev = uFade * (uTop + 0.25) - (uTop - vY);                 // 从头顶往下显形
        if (rev < 0.0) discard;
        float base = smoothstep(0.02, 0.24, vY);                          // 腰部以下渐隐（抖动透明）
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
          // 固定在视线方向上的柔和主光（不往场景里加灯，避免影响其他物体）
          vec3 kd = normalize(vec3(-0.35, 0.55, 0.75));
          totalEmissiveRadiance += diffuseColor.rgb * uKey * (0.25 + 0.75 * max(dot(normal, kd), 0.0)) * (1.0 - gap) * (1.0 - 0.9 * metalnessFactor);   // 金属（紧身衣）不加漫反射，保持黑亮
          float edge = smoothstep(0.06, 0.0, rev);                          // 显形扫描线
          float scan = step(0.5, fract(vY * 140.0 - uT * 3.0)) * (1.0 - uFade);
          totalEmissiveRadiance += uRimB * (edge * 3.0 + scan * 0.6);
        }`);
  };
  mat.customProgramCacheKey = () => 'vr_singer';

  const body = new THREE.Mesh(geo, mat);
  body.frustumCulled = false;
  const root = new THREE.Group(); root.name = 'vrSinger';
  const sway = new THREE.Group(); sway.add(body); root.add(sway);
  root.position.fromArray(SINGER.pos); root.rotation.y = SINGER.yaw; root.scale.setScalar(SINGER.scale);
  sway.position.y = -SINGER.eyeY;          // 模型眼睛高度对齐 hud 原点（观众视线高度）
  root.visible = false;

  const secSet = new Set(SINGER.sections);
  let host = null;
  const fadeAt = (t, S) => {
    const { sec } = S;
    const a = sm(sec.start, sec.start + SINGER.fadeIn, t);
    const b = 1 - sm(sec.end - SINGER.fadeOut, sec.end, t);
    // 相邻两段都有歌手时不消失
    const i = S.index, secs = S.secs;
    const prevOn = secs && i > 0 && secSet.has(secs[i - 1].id), nextOn = secs && i + 1 < secs.length && secSet.has(secs[i + 1].id);
    return Math.min(prevOn ? 1 : a, nextOn ? 1 : b);
  };

  return {
    root, mesh: body,
    // 预编译：挂到每个场景里编译一次（雾、灯光不同的场景各需要一份着色器）
    attachForCompile(hud) { hud.add(root); root.visible = true; U.uFade.value = 1; },
    detach() { if (root.parent) root.parent.remove(root); root.visible = false; },
    update(t, f, S, k, A, secs) {
      const on = secSet.has(S.sec.id);
      if (!on) { if (root.parent) root.parent.remove(root); root.visible = false; return; }
      if (host !== A.hud || root.parent !== A.hud) { A.hud.add(root); host = A.hud; }
      root.visible = true;
      U.uFade.value = fadeAt(t, { ...S, secs });
      U.uT.value = t;
      U.uKick.value = f ? f.kick : 0;
      const [o, w, r] = mouthAt(k, f);
      U.uOpen.value = o; U.uWide.value = w; U.uRound.value = r;
      // 身体：随节拍轻微点头、左右摇摆、呼吸
      const kick = f ? f.kick : 0;
      sway.rotation.set(-0.025 * kick + 0.012 * Math.sin(t * 1.3), 0.06 * Math.sin(t * 0.45), 0.025 * Math.sin(t * 0.7));
      sway.position.y = -SINGER.eyeY - 0.006 * kick + 0.004 * Math.sin(t * 1.6);
    },
  };
}
