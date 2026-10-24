// 09 微缩十字路口（参考 ref-5）：移轴摄影般的高空俯瞰——钢蓝色街区、钠灯琥珀色窗光，路口斑马线上数千个小人潮水般穿行，
// 一栋楼正面是冰蓝色的巨型竖屏，正在唱的单词直接打在屏上。后期移轴模糊让城市像微缩模型。
// 卡点：每拍人潮"走一步"（按拍子量化移动），巨屏每小节换一次故障画面，鼓点时整城窗光一闪。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, skyMat, ground } from './city.js';
import { glitchScreenMat, tickScreen, makeSplitWord, beatAt, pulse, LYRIC_FONT } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, flyers, steam } from './dress.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { shockRing, fogSheets, motes } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 40, bg: 0x101824 });
  const sky = skyMat({ stops: [[-0.2, 0x0e141c], [0.0, 0x2a3e58], [0.2, 0x1a2a40], [1, 0x0a1220]] }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x9ab8e8, moonI: 2.4, dir: [0.5, 0.7, 0.3], hemiSky: 0x3a4e6a, hemiGround: 0x2a1a0a, hemiI: 1.3, size: 220, center: [0, 0, 0], env: envFromSky(ctx, sky) });
  const mat = cityMat({ wall: 0x4a5a70, wall2: 0x6a7a90, wallH: 60, lit: [0xffb04a, 0xffd890, 0xbfefff], dark: 0x142030, litP: 0.5, glow: 2.2,
    floorH: 1.5, colW: 1.2, winX: 0.6, winY: 0.5, neon: 0xff5a5a, neon2: 0xffd84a, neonP: 0.12, roof: 0x2a3a4c, band: 0.1, warm: 0xffc070, fog: 0x1a2638, fogNear: 120, fogFar: 420, flick: 0.04, seed: 9 });
  const R = rng(909), list = [], BLK = 34, ST = 12;
  for (let gx = -5; gx <= 5; gx++) for (let gz = -5; gz <= 5; gz++) {
    const cx = gx * (BLK + ST), cz = gz * (BLK + ST);
    if (gx === 0 && gz === 0) continue;                       // 中心是十字路口广场
    const n = 3 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const w = 8 + R() * 12, d = 8 + R() * 12;
      list.push({ x: cx + (R() - 0.5) * (BLK - w), z: cz + (R() - 0.5) * (BLK - d), w, d, h: 8 + Math.pow(R(), 1.5) * 50 * (1 - Math.hypot(gx, gz) / 9) + 4 });
    }
  }
  scene.add(buildings(mat, list)); scene.add(ground(0x0a0e14));
  // 人行道与斑马线
  const walk = new THREE.MeshBasicMaterial({ color: 0x161c26 }), zebra = new THREE.MeshBasicMaterial({ color: 0x9aa6b4 });
  for (let gx = -5; gx <= 5; gx++) for (let gz = -5; gz <= 5; gz++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(BLK + 3, BLK + 3), walk); m.rotation.x = -Math.PI / 2; m.position.set(gx * (BLK + ST), 0.02, gz * (BLK + ST)); scene.add(m); }
  const half = (BLK + ST) / 2;
  for (let k = 0; k < 4; k++) for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, ST * 0.8), zebra); m.rotation.x = -Math.PI / 2;
    const o = -BLK / 2 + 2 + i * 3; if (k < 2) { m.position.set(o, 0.04, (k ? 1 : -1) * (BLK / 2 + ST / 2)); m.rotation.z = Math.PI / 2; } else m.position.set((k === 3 ? 1 : -1) * (BLK / 2 + ST / 2), 0.04, o);
    scene.add(m);
  }
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 50), zebra); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 4 * (i % 2 ? 1 : -1); m.position.set((i - 2.5) * 0.4, 0.05, 0); scene.add(m); }
  void half;
  // 人潮
  const NP = 5000, ppos = new Float32Array(NP * 3), pcol = new Float32Array(NP * 3), people = [];
  const tones = [0x1a1a22, 0x3a3a48, 0xc8c0b0, 0xff6a5a, 0x6a8aff, 0xffd27a, 0xe8e8f0];
  for (let i = 0; i < NP; i++) {
    const kind = R(); let a, b;
    if (kind < 0.5) { const s = (R() < 0.5 ? -1 : 1) * (BLK / 2 + ST / 2 + (R() - 0.5) * 8); a = new THREE.Vector3(-BLK / 2, 0, s); b = new THREE.Vector3(BLK / 2, 0, s); if (R() < 0.5) { a.set(s, 0, -BLK / 2); b.set(s, 0, BLK / 2); } }
    else if (kind < 0.8) { const ang = R() * Math.PI * 2; a = new THREE.Vector3(Math.cos(ang) * 22, 0, Math.sin(ang) * 22); b = a.clone().multiplyScalar(-1); }
    else { const line = Math.floor(R() * 11) - 5, s = line * (BLK + ST) + (R() < 0.5 ? -1 : 1) * (BLK / 2 + 1); a = new THREE.Vector3(-250, 0, s); b = new THREE.Vector3(250, 0, s); if (R() < 0.5) { a.set(s, 0, -250); b.set(s, 0, 250); } }
    if (R() < 0.5) [a, b] = [b, a];
    a.x += (R() - 0.5) * 2; a.z += (R() - 0.5) * 2; b.x += (R() - 0.5) * 2; b.z += (R() - 0.5) * 2;
    people.push({ a, b, ph: R(), sp: 0.6 + R() * 0.8, len: a.distanceTo(b) });
    const c = col(tones[Math.floor(R() * tones.length)]); pcol.set([c.r, c.g, c.b], i * 3);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const crowd = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.8, vertexColors: true, toneMapped: false, sizeAttenuation: true })); crowd.frustumCulled = false; scene.add(crowd);
  // 巨型竖屏（东北角楼的正面）
  const scr = new THREE.Group(); scr.position.set(26, 32, -BLK / 2 - ST / 2 - 11.5); scene.add(scr);
  const sMat = glitchScreenMat({ seed: 3, a: 0xbfefff, b: 0x5a9ad8, c: 0xffffff, amp: 0.5 });
  const sMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 46), sMat); scr.add(sMesh);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(20, 50, 6), new THREE.MeshBasicMaterial({ color: 0x1a2430 })); frame.position.z = -3.2; scr.add(frame);
  scr.rotation.y = 0.0;
  const word = makeSplitWord(3.2, [0x5a9ad8, 0xff6a8a, 0xffffff]); word.group.position.set(0, 4, 0.3); word.group.rotation.z = Math.PI / 2; scr.add(word.group);
  const roof = roofClutter(list, { seed: 92, per: 4 }); scene.add(roof);
  const fly = flyers({ n: 7, seed: 93, rad: [40, 160], y: [30, 70], light: 0xfff0d0, cone: 0xd8f0ff }); scene.add(fly);
  const vents = steam(list.filter((b, i) => i % 9 === 0).slice(0, 14).map((b) => new THREE.Vector3(b.x, b.h, b.z)), { size: 7, n: 4, opacity: 0.3 }); scene.add(vents);
  // 细节层：路口中心荡开的信号环、街道低雾、飘在城市上空的光尘
  const ring = shockRing({ color: 0xbfefff, color2: 0xffb04a, size: 900, hex: 4 }); ring.position.set(0, 0.5, 0); scene.add(ring);
  const haze = fogSheets({ n: 4, y0: 3, y1: 50, color: 0x3a4e6a, density: 0.3, seed: 9 }); scene.add(haze);
  const dust = motes({ n: 800, box: [420, 120, 420], center: [0, 0, 0], color: 0xffd890, size: 2.0, rise: 1.0, sway: 4, seed: 91 }); scene.add(dust);
  const rig = camPath([
    { u: 0, p: [20, 300, 160], l: [0, 0, 0], fov: 32 },
    { u: 0.4, p: [150, 140, 70], l: [0, 4, 0], fov: 40, roll: 0.1 },
    { u: 0.75, p: [90, 60, -90], l: [0, 8, 0], fov: 46, roll: -0.05 },
    { u: 1, p: [-40, 38, -70], l: [10, 18, -20], fov: 70, roll: 0.12 }
  ], { ease: E.io });
  const lyric = makeLyricLayer(ctx, camera, { y: -0.36, height: 0.065, colors: { sung: 0xf2f6ff, hot: 0xffb04a, pre: 0x8ab4d8, splitA: 0xbfefff, splitB: 0xff6a5a } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), p = S.p, bp = pulse(B.bp, 6);
    applyCam(camera, rig(p), { t, shake: 0.2, punch: punchAt(B, 3) });
    roof.userData.tick(t); fly.userData.tick(t); vents.userData.tick(t);
    const rAge = (B.beat % 4 + B.bp) / 4;
    ring.userData.set(rAge * 380, (1 - rAge) * 0.9, 6 + rAge * 10, t);
    mat.userData.wave(0, 0, rAge * 380, (1 - rAge) * 0.8, 8 + rAge * 12, 0xbfefff);
    mat.userData.scan(((B.bar % 2) + B.barp) / 2 * 70, 0.5, 0xffb04a);
    haze.userData.tick(t, camera, bp * 0.2); dust.userData.tick(t, 0.9 + bp * 0.4);
    const step = B.raw + Math.min(1, B.bp * 4) * 0;                     // 人潮按拍子走：每拍前 1/4 拍里移动一步
    const q = Math.floor(B.raw) + Math.min(1, B.bp * 3.5);
    people.forEach((pp, i) => {
      const u = ((pp.ph + q * pp.sp * 1.2 / pp.len) % 1);
      ppos[i * 3] = pp.a.x + (pp.b.x - pp.a.x) * u; ppos[i * 3 + 1] = 0.5; ppos[i * 3 + 2] = pp.a.z + (pp.b.z - pp.a.z) * u;
    });
    void step;
    pg.attributes.position.needsUpdate = true;
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 3) * 1.2, B.b16, Math.max(f.kick, bp * 0.5));
    tickScreen(sMat, t, B.bar, f.kick, 0);
    const w = k.i >= 0 ? k.flat[k.i] : null; word.set(w, LYRIC_FONT);
    if (w) { const e = Math.min(1, k.age / 0.12); word.group.scale.setScalar(1 + (1 - e) * 0.5); word.update(0.2 + f.kick * 0.6, 0.95, B.b16, f.kick * 2); }
    post.s.tilt = 1.2 * (1 - smooth(0.8, 1, p)); post.s.exposure = 1.15; post.s.sat = 1.25; post.s.bloom = 0.35 + bp * 0.12; post.s.bloomT = 0.72;
    post.s.ab = 0.002 + f.kick * 0.006; post.s.glitch = Math.pow(f.kick, 3) * 0.25; post.s.scan = 0.03; post.s.grain = 0.02; post.s.vig = 0.45;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
