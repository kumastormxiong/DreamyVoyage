// 19 灰烬上升（尾奏后半）：夜里的整座城开始消散——窗灯从楼顶往下一层层熄灭，楼体化成成千上万个霓虹像素方块，
// 青 / 品红 / 白，像灰烬一样螺旋上升，消失在黑暗里。"链魂"离开了这座城。镜头缓缓后撤、升高。
// 卡点：每个鼓点所有方块同时"闪一下"并加速一下；每拍熄灭一层楼。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat, wetGround } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter } from './dress.js';
import { camPath, applyCam, punchAt, E as EZ } from './cam.js';
import { aurora, motes, fogSheets } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 55, bg: 0x020206 });
  const sky = skyMat({ stops: [[-0.3, 0x010103], [0.0, 0x10102a], [0.12, 0x05050f], [1, 0x000002]], stars: 0.6 }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x8aa0ff, moonI: 2.0, dir: [-0.4, 0.6, 0.5], hemiSky: 0x2a2e50, hemiGround: 0x100818, hemiI: 1.0, size: 200, center: [0, 0, 0], env: envFromSky(ctx, sky) });
  const mat = cityMat({ wall: 0x3a3e50, wall2: 0x2a2e40, wallH: 120, lit: [0x7af0ff, 0xf4f0ff, 0xff5ac8], dark: 0x04050a, litP: 0.35, glow: 1.3,
    floorH: 2.4, colW: 1.7, neon: 0xff5ac8, neon2: 0x7af0ff, neonP: 0.1, roof: 0x080a12, fog: 0x06061a, fogNear: 100, fogFar: 520, fogH: 20, seed: 19, band: 0.1, warm: 0x7af0ff });
  const list = ringLayout(300, 0, 170, { seed: 191, hMin: 15, hMax: 140, wMin: 8, wMax: 24 });   // 楼群保持原样，镜头只改飞行路径
  scene.add(buildings(mat, list, { reflect: true })); scene.add(wetGround(0x020208, 0.8));
  const N = 3600, R = rng(1919), parts = [];
  const pal = [0x7af0ff, 0xff5ac8, 0xf4f0ff, 0x5a7aff];
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N; i++) {
    const b = list[Math.floor(R() * list.length)];
    parts.push({ x: b.x + (R() - 0.5) * b.w, y: R() * b.h, z: b.z + (R() - 0.5) * b.d, t0: R() * 0.85, sp: 6 + R() * 14, sw: R() * 6, s: 1.0 + R() * 2.4 });
    im.setColorAt(i, col(pal[Math.floor(R() * pal.length)]));
  }
  scene.add(im);
  const roof = roofClutter(list, { seed: 192 }); scene.add(roof);
  // 细节层：升空的极光、随城市一起升腾的光尘、低空发光雾
  const aur = aurora({ center: Math.PI, span: 6.0, radius: 800, y: 260, height: 380, colors: [0x7af0ff, 0x5a7aff, 0xff5ac8], layers: 3, seed: 19, intensity: 0.6 }); scene.add(aur);
  const rising = motes({ n: 1400, box: [380, 260, 380], center: [0, 0, 0], color: 0x9fe8ff, size: 2.6, rise: 9, sway: 8, seed: 193 }); scene.add(rising);
  const mist = fogSheets({ n: 4, y0: 4, y1: 70, color: 0x1a2a5a, density: 0.34, seed: 19, additive: true, scale: 0.01, size: 1100 }); scene.add(mist);
  // 镜头路径：在楼群之间随机挑选一串空白点，逐段检查每一段都不碰到任何楼（含 4 米余量），
  // 镜头按这些直线段飞行，所以不会穿墙。起点、终点固定（起点在楼群外侧，终点在楼顶之上）。
  const clearAt = (x, y, z, m = 4) => !list.some((b) => { const h = Math.max(b.w, b.d) / 2 + m; return Math.abs(x - b.x) < h && Math.abs(z - b.z) < h && y < b.h + m; });
  const segClear = (A, C) => { for (let i = 0; i <= 30; i++) { const k = i / 30; if (!clearAt(A.x + (C.x - A.x) * k, A.y + (C.y - A.y) * k, A.z + (C.z - A.z) * k)) return false; } return true; };
  const END = new THREE.Vector3(-150, 170, 150);
  const RP = rng(2727);
  // 到最近楼边的水平距离
  const gapD = (x, z) => list.reduce((m, b) => Math.min(m, Math.max(Math.abs(x - b.x) - b.w / 2, Math.abs(z - b.z) - b.d / 2)), 1e9);
  // 起点：地面、裙楼底下，落在一条街缝里（离最近楼 3~14 米），镜头从这里抬头看四周一圈楼
  let start = null;
  for (let tries = 0; !start && tries < 20000; tries++) {
    const a = RP() * Math.PI * 2, r = 30 + RP() * 110, c = new THREE.Vector3(Math.cos(a) * r, 2.5, Math.sin(a) * r);
    const g = gapD(c.x, c.z);
    if (g >= 3 && g <= 14) start = c;
  }
  if (!start) start = new THREE.Vector3(0, 2.5, 0);
  const wps = [start];
  // 先在地面街缝里穿行几段，同时慢慢抬高；每段都不碰楼
  for (let tries = 0; wps.length < 6 && tries < 4000; tries++) {
    const last = wps[wps.length - 1], a = RP() * Math.PI * 2, d = 20 + RP() * 30;
    const c = new THREE.Vector3(last.x + Math.cos(a) * d, Math.min(12, last.y + RP() * 2), last.z + Math.sin(a) * d);
    if (Math.hypot(c.x, c.z) > 170) continue;
    const g = gapD(c.x, c.z);
    if (g >= 3 && g <= 14 && clearAt(c.x, c.y, c.z, 4) && segClear(last, c)) wps.push(c);
  }
  // 最后一段直接升到楼群上方，允许穿过楼体
  wps.push(END);
  // 注视点：起点抬头看周围一圈楼的顶部；途中朝向下一路点；终点俯瞰城市中心
  const looks = wps.map((w, i) => {
    if (i === 0) return new THREE.Vector3(start.x * 1.5, 45, start.z * 1.5);
    const n = wps[Math.min(i + 1, wps.length - 1)]; return new THREE.Vector3(n.x, n.y + 6, n.z);
  });
  looks[looks.length - 1] = new THREE.Vector3(0, 40, 0);   // 终点俯瞰城市中心，否则只看到天空
  looks[looks.length - 2] = new THREE.Vector3(0, 30, 0);   // 地面段结束时看向城市中心，之后升起过程中逐渐俯视
  const fovs = wps.map((_, i) => 100 - (i / (wps.length - 1)) * 40), rolls = wps.map((_, i) => Math.sin(i * 1.7) * 0.12);
  // 前段（到 3:47 ≈ 227 秒）：地面街缝里穿行；后段：从最后一个路点渐渐升到楼群顶上，镜头转向下俯瞰城市
  const nT = wps.length - 1, tourLast = nT - 1;
  const rig = (p, T1) => {
    if (p < T1) {
      const seg = Math.max(0, (p / T1) * tourLast), i = Math.max(0, Math.min(Math.floor(seg), tourLast - 1)), k = EZ.io(Math.min(1, seg - i));
      return { p: wps[i].clone().lerp(wps[i + 1], k), l: looks[i].clone().lerp(looks[i + 1], k), fov: fovs[i] + (fovs[i + 1] - fovs[i]) * k, roll: rolls[i] + (rolls[i + 1] - rolls[i]) * k };
    }
    const q = Math.min(1, (p - T1) / (1 - T1));
    const climb = EZ.io(Math.min(1, q / 0.7)), base = wps[tourLast].clone().lerp(wps[nT], climb);
    // 升起的同时绕城市中心缓慢环绕（总共约 0.8 弧度），镜头一直俯视城市
    const a = q * 0.8, ca = Math.cos(a), sa = Math.sin(a);
    const pos = new THREE.Vector3(base.x * ca - base.z * sa, base.y, base.x * sa + base.z * ca);
    const kl = EZ.io(q);
    return { p: pos, l: looks[tourLast].clone().lerp(looks[nT], kl), fov: fovs[tourLast] + (fovs[nT] - fovs[tourLast]) * kl, roll: rolls[tourLast] + (rolls[nT] - rolls[tourLast]) * kl };
  };

  const maxH = 140;
  const RISE_AT = 227;   // 3 分 47 秒开始升起（绝对时间）
  const lyric = makeLyricLayer(ctx, camera, { y: -0.2, height: 0.075, colors: { sung: 0xeef4ff, hot: 0xff5ac8, pre: 0x5a6a9a, splitA: 0x7af0ff, splitB: 0xff5ac8 } });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 6), p = S.p;
    mat.userData.U.uLevelY.value = maxH * (1 - Math.floor(S.lt / (60 / tl.bpm)) / (S.dur / (60 / tl.bpm)) * 1.05);   // 每拍熄灭一截
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 1.5, B.b16, bp);
    const boost = f.kick;
    parts.forEach((q, i) => {
      const a = S.lt - q.t0 * S.dur;
      if (a < 0) { M.makeScale(0.0001, 0.0001, 0.0001); im.setMatrixAt(i, M); return; }
      const rise = a * q.sp * (1 + boost * 0.3) + a * a * 2;
      const ang = a * 0.4 + q.sw;
      P.set(q.x + Math.sin(ang) * a * 3, q.y + rise, q.z + Math.cos(ang) * a * 3);
      const s = q.s * (1 + boost * 0.6) * Math.max(0, 1 - a / 9);
      Q.setFromEuler(E.set(a * 1.3 + q.sw, a * 0.9, 0)); M.compose(P, Q, Sc.setScalar(Math.max(0.0001, s))); im.setMatrixAt(i, M);
    });
    im.instanceMatrix.needsUpdate = true;
    const T1 = Math.min(0.99, Math.max(0.01, (RISE_AT - (t - S.lt)) / S.dur));   // 升起开始点：按当前段落长度换算成进度
    applyCam(camera, rig(p, T1), { t, shake: 0.2 + f.kick * 0.5, punch: punchAt(B, 4) }); roof.userData.tick(t);
    // 3:45（225 秒）前后镜头接近完全仰视：222→225 秒渐渐抬头，225→226.5 秒保持，之后随升起渐渐回到俯视
    const upW = 0.92 * smooth(222, 225, t) * (1 - smooth(226.5, 228.5, t));
    if (upW > 0.001) {
      const q0 = camera.quaternion.clone();
      camera.lookAt(camera.position.x + 0.02, camera.position.y + 100, camera.position.z);
      const qUp = camera.quaternion.clone();
      camera.quaternion.copy(q0).slerp(qUp, upW);
    }
    aur.userData.tick(t, bp * 0.5, 0.25 + smooth(0.1, 0.8, p) * 0.8); rising.userData.tick(t, 0.6 + p * 0.8 + bp * 0.4); mist.userData.tick(t, camera, bp * 0.4);
    mat.userData.wave(0, 0, B.barp * 340, (1 - B.barp) * 0.9, 10 + B.barp * 18, 0x7af0ff);
    mat.userData.scan(maxH * (1 - Math.floor(S.lt / (60 / tl.bpm)) / (S.dur / (60 / tl.bpm)) * 1.05), 0.9, 0xff5ac8);
    post.s.dream = smooth(0.4, 1, p) * 0.6; post.s.fish = 0; post.s.exposure = 1.2;
    post.s.bloom = 0.6 + bp * 0.2; post.s.bloomT = 0.5; post.s.bloomR = 0.6;
    post.s.ab = 0.0015 + f.kick * 0.006; post.s.glitch = Math.pow(f.kick, 3) * 0.3; post.s.scan = 0.06; post.s.grain = 0.04; post.s.vig = 0.6;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
