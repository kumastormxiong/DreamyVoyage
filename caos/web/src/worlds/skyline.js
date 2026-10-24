// 02 巨构塔群（参考 ref-6，改成"巨物"尺度）：黑夜里一群千米级的退台巨塔，塔身比云还高，窗格细密得像电路板；
// 观众只是塔脚广场上的一粒尘——脚边是五米高的路灯和几点车灯，抬头是望不到顶的立面。
// 运镜：镜头从塔脚仰拍，慢慢前移（越慢越显得塔大），随后缓缓吊升，最后拉到几百米高空回望，塔群吞没整个地平线。
// 卡点：低音进来（~11s）后每拍一次冲击变焦，航标随鼓点闪，立面巨屏故障，扫描带从地面扫到塔顶。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, textMesh } from '../lib.js';
import { cityMat, buildings, ringLayout, skyMat, wetGround } from './city.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, searchlights, flyers } from './dress.js';
import { glitchScreenMat, tickScreen, beatAt, pulse } from './_glitch.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { fogSheets, aurora, motes } from './fx.js';
import { megaTower, megaBridge, megaBeacons, streetScale } from './mega.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 50, bg: 0x020306, near: 0.5, far: 7000 });
  const sky = skyMat({ stops: [[-0.3, 0x020306], [0.0, 0x1a2436], [0.1, 0x0a1220], [0.5, 0x03050b], [1, 0x000002]], stars: 0.8, cloud: 0.5, cloudA: 0x2a3446, cloudB: 0x0c121c, cloudY: [0.12, 0.5], cloudScale: 1.4, levels: 12 });
  scene.add(sky);
  nightRig(ctx, scene, { moon: 0x9ab4ff, moonI: 2.3, dir: [0.6, 0.45, 0.5], hemiSky: 0x3a4a6a, hemiGround: 0x140c0a, hemiI: 1.5, shadow: false, env: envFromSky(ctx, sky), envK: 0.9 });
  const mat = cityMat({ wall: 0x2a323e, wall2: 0x3c4858, wallH: 1500, lit: [0xffb347, 0xffe2a0, 0x9fd8ff], dark: 0x0a1018, litP: 0.3, glow: 2.0,
    floorH: 3.4, colW: 2.6, winX: 0.5, winY: 0.5, neon: 0xff4f7a, neon2: 0x59d8ff, neonP: 0.05, roof: 0x1a2028, fog: 0x070b14, fogNear: 300, fogFar: 4200, fogH: 140, band: 0.04, warm: 0x9fd8ff, seed: 2, trimP: 0.2, trim: 0x55708a });
  const R = rng(202), list = [];
  // 巨塔：[x, z, 宽, 高]。最近的一座离观众只有 300 米，却高过 1500 米
  const TW = [[0, -520, 300, 1700], [-440, -470, 220, 1200], [420, -450, 240, 1350], [-170, -1050, 340, 2200], [260, -1250, 360, 2400], [-820, -900, 280, 1500], [830, -980, 260, 1600], [-1300, -1500, 300, 2000], [1350, -1600, 320, 2100]];
  const towers = TW.map(([x, z, w, h], i) => megaTower(list, { x, z, w, h, tiers: 5, taper: 0.8, seed: i + 30 }));
  [[0, 1, 520], [0, 2, 700], [1, 3, 980], [2, 4, 880], [3, 4, 1250], [0, 3, 1100]].forEach(([a, b, y]) => megaBridge(list, towers[a], towers[b], y, 16));
  for (let i = 0; i < 90; i++) list.push({ x: (R() - 0.5) * 1000, z: -140 - R() * 220, w: 20 + R() * 40, d: 20 + R() * 30, h: 12 + Math.pow(R(), 2) * 90 });      // 塔脚的矮街区
  list.push(...ringLayout(160, 1300, 3200, { seed: 21, hMin: 300, hMax: 1500, wMin: 120, wMax: 300, skipArc: [0, 0.5] }));
  scene.add(buildings(mat, list, { reflect: true })); const ground = wetGround(0x030409, 0.55, 9000); scene.add(ground);
  const roof = roofClutter(list, { seed: 22, per: 8, maxB: 160 }); scene.add(roof);
  const tips = []; towers.forEach((tw) => tips.push(new THREE.Vector3(tw.x, tw.top + tw.h * 0.16 + 4, tw.z), new THREE.Vector3(tw.x + tw.w * 0.3, tw.h * 0.6, tw.z + tw.d * 0.4)));
  const beac = megaBeacons(tips, { size: 60 }); scene.add(beac);
  const lights = searchlights({ n: 5, seed: 23, area: 400, z0: -500, color: 0xbcd4ff, len: 420 }); lights.scale.setScalar(3.4); scene.add(lights);
  const fly = flyers({ n: 9, seed: 24, rad: [260, 900], y: [200, 1100], speed: 0.03 }); fly.position.z = -600; scene.add(fly);
  const street = streetScale({ center: [0, 0, 70], len: 260, width: 30, seed: 5, lamps: 22, cars: 90 }); scene.add(street);
  // 开场的雨街：雨线 + 水面涟漪（镜头先低头看积水里的城市倒影，再抬起）
  const NR = 1500, rp = new Float32Array(NR * 6), RR = rng(777), rd = Array.from({ length: NR }, () => ({ x: (RR() - 0.5) * 34, z: (RR() - 0.75) * 46, ph: RR(), sp: 0.8 + RR() * 0.5 }));
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x6a80a0, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false });
  const rain = new THREE.LineSegments(rg, rainMat); rain.frustumCulled = false; scene.add(rain);
  // 细节层：塔群之间的云海、天幕极光、漂浮的冷光尘
  const haze = fogSheets({ n: 7, y0: 40, y1: 1500, color: 0x3a5a86, density: 0.3, seed: 2, size: 7000, scale: 0.0016, speed: 0.004 }); scene.add(haze);
  const aur = aurora({ center: Math.PI, span: 2.6, radius: 4200, y: 2000, height: 2200, colors: [0x3a8aff, 0x6a4aff, 0x38e0ff], layers: 3, seed: 2, intensity: 0.5 }); scene.add(aur);
  const dust = motes({ n: 700, box: [220, 140, 220], center: [0, 0, 20], color: 0x9fc8ff, size: 2.0, rise: 1.2, sway: 4, seed: 12 }); scene.add(dust);
  // 立面上的巨型故障屏（一块 140 × 320 米的竖屏，印着 CAOS / ESPAÑOL / 链魂）
  const scr = new THREE.Group(); scr.scale.setScalar(13); scr.position.set(-70, 330, -520 + 240 + 0.6); scene.add(scr);
  const panelMat = glitchScreenMat({ seed: 7, a: 0x9fe8ff, b: 0x3a7bd5, c: 0xffffff, amp: 0.32, mode: 0 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(11, 24), panelMat); scr.add(panel);
  const T = (s, h, y, o) => { const m = textMesh(s, h, o, false); m.position.set(0, y, 0.2); m.renderOrder = 5; m.material.depthTest = false; m.material.side = THREE.DoubleSide; scr.add(m); return m; };
  const t1 = T('CAOS', 3.6, 5, { font: '"Exo2",sans-serif', size: 160, weight: '800', italic: true, fill: '#ffffff', pad: 20 });
  const t2 = T('ESPAÑOL', 2.0, 1.5, { font: '"Exo2",sans-serif', size: 160, weight: '800', italic: true, fill: '#dff8ff', pad: 20 });
  const t3 = T('GLITCH', 2.4, -5, { font: '"Exo2",sans-serif', size: 160, weight: '800', italic: true, fill: '#ff5f8a', pad: 20 });
  const rig = camPath([
    { u: 0, p: [3, 1.1, 72], l: [2, -4, 40], fov: 84, roll: 0.03 },                  // 开场：低头看雨后的积水，水里倒映着整片倒立的塔群
    { u: 0.14, p: [3, 1.3, 56], l: [1, -1.5, -80], fov: 88, roll: -0.02 },               // 视线慢慢抬向远处，倒影铺满下半个画面
    { u: 0.32, p: [22, 1.8, 40], l: [-10, 520, -480], fov: 98, roll: 0.05 },        // 猛地抬头：塔脚仰望
    { u: 0.54, p: [14, 2.2, -10], l: [-30, 700, -520], fov: 92, roll: 0.05 },       // 慢慢前行
    { u: 0.78, p: [-40, 240, -60], l: [0, 900, -620], fov: 78, roll: -0.06 },       // 缓缓吊升
    { u: 1, p: [260, 820, 380], l: [-60, 700, -900], fov: 58, roll: 0.04 }          // 高空回望，塔群吞没地平线
  ], { ease: E.io });

  function update({ t, f, S, tl, post }) {
    const B = beatAt(tl, t), bass = smooth(10.6, 12.8, t), p = S.p;
    const k = Math.max(f.kick, pulse(B.bp, 7) * 0.5) * bass;
    applyCam(camera, rig(p), { t, shake: 0.1 + k * 0.5, punch: punchAt(B, 5) * bass }); camera.position.y = Math.max(camera.position.y, 0.9);
    sky.position.copy(camera.position);
    mat.userData.tick(t, B.beat * bass + Math.floor(t * 2), k * 1.2, B.b16, k);
    roof.userData.tick(t + B.beat * 0.4 * bass); lights.userData.tick(t, B.beat, k); fly.userData.tick(t); beac.userData.tick(t); street.userData.tick(t);
    tickScreen(panelMat, t, B.beat, k, 0);
    panelMat.uniforms.uOp.value = smooth(9.5, 10.2, t) * (hash(Math.floor(t * 14)) < 0.08 ? 0.3 : 1);
    [t1, t2, t3].forEach((m, i) => { m.material.opacity = smooth(10 + i * 0.6, 10.5 + i * 0.6, t) * (hash(Math.floor(t * 20) + i) < 0.06 + k * 0.2 ? 0.2 : 1); m.position.x = (hash(B.b16 + i) - 0.5) * k * 1.5; });
    // 全息扫描带：每 4 小节从地面扫到塔顶；每 8 拍一圈冲击波从主塔脚下荡开
    const sc4 = ((B.bar % 4) + B.barp) / 4, b8 = ((B.beat % 8) + B.bp) / 8;
    mat.userData.scan(-20 + sc4 * 2300, 1.2 * bass, 0x59d8ff);
    mat.userData.wave(0, -520, b8 * 2200, (1 - b8) * 1.3 * bass, 40 + b8 * 80, 0x9fd8ff);
    const wet = 1 - smooth(0.3, 0.55, p);                                        // 雨只在开场的低机位出现
    rainMat.opacity = 0.22 * wet; rain.visible = wet > 0.01; ground.material.opacity = 0.3 + (1 - wet) * 0.52;
    for (let i = 0; i < NR; i++) { const d = rd[i], y = camera.position.y + 24 - ((d.ph * 24 + t * 22 * d.sp) % 24); rp.set([camera.position.x + d.x, y, camera.position.z + d.z, camera.position.x + d.x - 0.12, y - 0.9, camera.position.z + d.z], i * 6); }
    rg.attributes.position.needsUpdate = true;
    haze.userData.tick(t, camera, k * 0.4); aur.userData.tick(t, k); dust.userData.tick(t);
    post.s.exposure = 1.25; post.s.bloom = 0.45 + k * 0.3; post.s.bloomT = 0.7; post.s.bloomR = 0.5;
    post.s.ab = 0.0015 + k * 0.008; post.s.glitch = Math.pow(f.kick * bass, 3) * 0.35 + (p > 0.93 ? (p - 0.93) * 8 : 0);
    post.s.pix = 1 - smooth(8.4, 11.6, t);                                       // 接住上一场 boot 末尾的马赛克：从 8.4 秒的满格像素渐渐还原成清晰画面
    post.s.fish = 0; post.s.scan = 0.02; post.s.grain = 0.035; post.s.vig = 0.6;
  }
  return { scene, camera, update };
}
