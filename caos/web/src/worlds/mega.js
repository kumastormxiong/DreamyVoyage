// 巨构建筑工具（巨物感：建筑尺度是人的几十到几百倍，观众只是脚下的一粒尘）。
//   megaTower(list, o)      往 buildings() 用的列表里压入一座"退台巨塔"：层层收分的塔身 + 贴墙扶壁 + 顶部尖塔
//   megaBridge(list, a, b, y, thick)   两座塔之间的天桥（粗大的横梁）
//   megaBeacons(list, o)    塔顶/塔腰的航标灯（大号光点，远处也看得见，用来标出尺度）
//   streetScale(o)          脚边的"人尺度"参照物：路灯、护栏墩、地面车流的小光点（让观众意识到自己有多小）
// 尺度提示：窗格仍然是 3 米一层，所以塔越高、窗越密；雾按距离和高度叠，远塔只剩剪影。
import * as THREE from 'three';
import { col, rng, hash, glowTexture } from '../lib.js';


// 近处的光点会被 sizeAttenuation 放大成一大团白斑（镜头贴近车灯 / 路灯时）：把点的像素尺寸封顶到屏幕高度的 ~4%
function clampPts(m) {
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n  gl_PointSize = min(gl_PointSize, scale * 0.08);'); };
  return m;
}

export function megaTower(list, { x, z, w, d = w * 0.8, h, tiers = 5, taper = 0.78, fins = true, spire = true, seed = 1 } = {}) {
  const R = rng(seed + 1000);
  const frac = [0.34, 0.26, 0.19, 0.12, 0.09, 0.06].slice(0, tiers); const sum = frac.reduce((a, b) => a + b, 0);
  let y = 0, ww = w, dd = d;
  frac.forEach((fr, k) => {
    const hh = h * fr / sum;
    list.push({ x, y, z, w: ww, d: dd, h: hh });
    if (fins && k < 3) for (const s of [-1, 1]) {
      list.push({ x: x + s * ww * 0.5, y, z, w: ww * 0.07, d: dd * (0.42 + R() * 0.2), h: hh * (1.05 + R() * 0.25) });
      list.push({ x, y, z: z + s * dd * 0.5, w: ww * (0.42 + R() * 0.2), d: dd * 0.07, h: hh * (1.05 + R() * 0.25) });
    }
    if (k < tiers - 1) list.push({ x, y: y + hh - 4, z, w: ww * 1.12, d: dd * 1.12, h: 8 });      // 层间挑檐
    y += hh; ww *= taper; dd *= taper;
  });
  if (spire) list.push({ x, y, z, w: ww * 0.25, d: ww * 0.25, h: h * 0.16 });
  return { x, z, w, d, h, top: y };
}

export function megaBridge(list, a, b, y, thick = 14) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dx) >= Math.abs(dz)) list.push({ x: (a.x + b.x) / 2, y, z: (a.z + b.z) / 2, w: Math.abs(dx), d: thick * 2.2, h: thick });
  else list.push({ x: (a.x + b.x) / 2, y, z: (a.z + b.z) / 2, w: thick * 2.2, d: Math.abs(dz), h: thick });
}

// 航标：一批红 / 白闪光点；size 是世界尺寸（米），远处用大号光点
export function megaBeacons(points, { size = 40, color = 0xff2a1a, period = 3.3 } = {}) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.PointsMaterial({ color: col(color), size, sizeAttenuation: true, map: glowTexture('255,255,255', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  p.userData.tick = (t) => { m.opacity = 0.35 + 0.65 * (Math.sin(t * period) > 0.1 ? 1 : 0); };
  return p;
}

// 人尺度参照物：路灯（5 米）、矮墩（1 米）、沿路奔跑的车灯点。center/长宽决定摆放范围
export function streetScale({ center = [0, 0, 0], len = 120, width = 24, seed = 7, lamps = 18, cars = 70, lampColor = 0xffc070 } = {}) {
  const R = rng(seed), g = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.5, metalness: 0.6 });
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1, 0.25).translate(0, 0.5, 0), pm, lamps * 2);
  const bolls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), pm, 60);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), lampPts = [];
  for (let i = 0; i < lamps; i++) for (const s of [-1, 1]) {
    const px = center[0] + s * (width / 2 + 0.5), pz = center[2] - (i / lamps) * len + 4;
    M.compose(new THREE.Vector3(px, center[1], pz), Q, new THREE.Vector3(1, 5.5, 1)); poles.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), M);
    lampPts.push(new THREE.Vector3(px - s * 1.2, center[1] + 5.6, pz));
  }
  for (let i = 0; i < 60; i++) { M.compose(new THREE.Vector3(center[0] + (R() < 0.5 ? -1 : 1) * (width / 2 - 1 - R() * 1.5), center[1], center[2] - R() * len), Q, new THREE.Vector3(1, 1 + R() * 0.4, 1)); bolls.setMatrixAt(i, M); }
  poles.frustumCulled = bolls.frustumCulled = false; g.add(poles, bolls);
  const lampGeo = new THREE.BufferGeometry().setFromPoints(lampPts);
  g.add(new THREE.Points(lampGeo, clampPts(new THREE.PointsMaterial({ color: col(lampColor), size: 3.4, sizeAttenuation: true, map: glowTexture('255,255,255', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }))));
  // 车流：沿路中线两个方向的小光点（红 = 驶离，白 = 驶来）
  const NC = cars, cp = new Float32Array(NC * 3), cc = new Float32Array(NC * 3), cd = [];
  for (let i = 0; i < NC; i++) { const dir = i % 2 ? 1 : -1, c = col(dir > 0 ? 0xfff0d8 : 0xff2a1a); cc.set([c.r, c.g, c.b], i * 3); cd.push({ ph: R(), sp: 0.04 + R() * 0.05, lane: (R() * 0.5 + 0.1) * dir * (width / 2 - 2), dir }); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const carsP = new THREE.Points(cg, clampPts(new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: true, map: glowTexture('255,255,255', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })));
  carsP.frustumCulled = false; g.add(carsP);
  g.userData.tick = (t) => {
    for (let i = 0; i < NC; i++) { const d = cd[i], u = ((d.ph + t * d.sp * d.dir) % 1 + 1) % 1; cp.set([center[0] + d.lane, center[1] + 0.8, center[2] + 20 - u * (len + 40)], i * 3); }
    cg.attributes.position.needsUpdate = true;
  };
  return g;
}
