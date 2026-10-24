// 03 余烬公寓（参考 ref-1）：黄昏天空（钴蓝 → 玫瑰粉色绘画云），一座层层错落加建的"九龙式"公寓塔，
// 窗户全是橙红灯火，挂满朱红/琥珀/青绿的霓虹招牌；墨绿树冠在前景剪影。低机位仰拍、缓慢环绕。
// 鼓点：招牌在 16 分音符上短暂熄灭/串色，楼体切片错位。后期 3px 像素 + 9 阶色阶。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat, signMesh, SIGN_WORDS, pick, wetGround } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, flyers, steam } from './dress.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { fogSheets, motes } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 58, bg: 0x0c0e26 });
  const sky = skyMat({ stops: [[-0.2, 0x1a1020], [0.0, 0xd8603a], [0.07, 0x8a2a5a], [0.25, 0x2a2458], [0.7, 0x0c0e26]],
    cloud: 1, cloudA: 0xe06a8a, cloudB: 0x4a1a4a, cloudY: [0.04, 0.55], cloudScale: 2.2, levels: 16, drift: 0.02 }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x8aa8ff, moonI: 2.2, dir: [0.7, 0.5, 0.3], hemiSky: 0x4a3a6a, hemiGround: 0x2a1008, hemiI: 1.2, size: 140, center: [0, 30, -34], env: envFromSky(ctx, sky), envK: 1 });
  const warmL = new THREE.PointLight(0xff6a2a, 4000, 120, 1.6); warmL.position.set(-10, 8, -6); scene.add(warmL);
  const mat = cityMat({ wall: 0x2a2038, wall2: 0x3c2c50, wallH: 70, lit: [0xff7a2a, 0xffb347, 0xff3a2a], dark: 0x1a1020, litP: 0.55, glow: 2.4,
    floorH: 1.7, colW: 1.35, winX: 0.55, winY: 0.5, neon: 0xff2f4f, neon2: 0x2fe0d0, neonP: 0.12, roof: 0x1d1626, fog: 0x3a2a4a, fogNear: 90, fogFar: 380, fogH: 14, band: 0.08, warm: 0xff8a3a, flood: 0.5, floodCol: 0xff5a2a, flick: 0.05, seed: 3 });
  const R = rng(303), list = [];
  // 主塔：层层错落加建
  let y = 0;
  for (let k = 0; k < 14; k++) {
    const w = 16 + R() * 10, d = 14 + R() * 8, h = 3 + R() * 6;
    list.push({ x: (R() - 0.5) * 6, y, z: -34 + (R() - 0.5) * 4, w, d, h }); y += h;
    if (R() < 0.6) list.push({ x: (R() - 0.5) * 18, y: y - h, z: -30 + R() * 3, w: 5 + R() * 5, d: 5 + R() * 4, h: h * (0.6 + R() * 0.6) });   // 外挂小屋
  }
  const topY = y, main = list.slice();
  for (let i = 0; i < 26; i++) list.push({ x: (R() < 0.5 ? -1 : 1) * (22 + R() * 50), z: -20 - R() * 60, w: 8 + R() * 10, d: 8 + R() * 10, h: 10 + R() * 40 });
  list.push(...ringLayout(160, 70, 260, { seed: 31, hMin: 10, hMax: 70, wMin: 10, wMax: 24 }));
  scene.add(buildings(mat, list, { reflect: true })); scene.add(wetGround(0x0c0810, 0.75));

  // 招牌
  const cols = ['#ff5a2a', '#ff2f4f', '#ffb02e', '#2fe0d0', '#ff3fa4'];
  const signs = [];
  // 招牌：先按主塔的真实体块算出"紧贴最凸出一层外墙"的位置，再检查没有嵌进任何楼里
  const inBox = (x, y, z, pad = 0.05) => list.some((b) => Math.abs(x - b.x) < b.w / 2 - pad && Math.abs(z - b.z) < b.d / 2 - pad && y > (b.y || 0) + pad && y < (b.y || 0) + b.h - pad);
  for (let i = 0; i < 34; i++) {
    const v = R() < 0.6, c = pick(cols, R());
    const s = signMesh(pick(SIGN_WORDS, R()), v ? 6 + R() * 6 : 2.2 + R() * 1.5, { color: c, vertical: v });
    const sw = s.geometry.parameters.width, sh = s.geometry.parameters.height, side = R() >= 0.7;
    let ok = false;
    for (let tr = 0; tr < 30 && !ok; tr++) {
      const y = sh / 2 + 2 + R() * Math.max(0.1, topY - sh - 4), hit = (b) => (b.y || 0) < y + sh / 2 && (b.y || 0) + b.h > y - sh / 2;
      if (!side) {
        const x = (R() - 0.5) * 24; let zf = -1e9;
        main.forEach((b) => { if (Math.abs(b.x - x) < b.w / 2 + sw / 2 && hit(b)) zf = Math.max(zf, b.z + b.d / 2); });
        if (zf < -100) continue; const z = zf + 0.3;
        if ([[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].some(([dx, dy]) => inBox(x + dx * sw / 2, y + dy * sh / 2, z + 0.02))) continue;
        s.position.set(x, y, z); s.rotation.y = 0; ok = true;
      } else {
        const sd = R() < 0.5 ? -1 : 1, z = -34 + (R() - 0.5) * 10;
        let ex = sd > 0 ? -1e9 : 1e9;
        main.forEach((b) => { if (Math.abs(b.z - z) < b.d / 2 + sw / 2 && hit(b)) ex = sd > 0 ? Math.max(ex, b.x + b.w / 2) : Math.min(ex, b.x - b.w / 2); });
        if (Math.abs(ex) > 100) continue; const x = ex + sd * 0.3;
        if ([[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].some(([dz, dy]) => inBox(x + sd * 0.02, y + dy * sh / 2, z + dz * sw / 2))) continue;
        s.position.set(x, y, z); s.rotation.y = sd * Math.PI / 2; ok = true;
      }
    }
    if (!ok) continue;
    scene.add(s); signs.push({ s, i });
  }
  // 树冠剪影
  const leaf = new THREE.MeshBasicMaterial({ color: 0x0c2420 });
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  // 树冠用独立的随机数，并放在远处两侧（z -60..-130）：之前和招牌共用随机数，树的位置被打乱，近处出现大片黑色块
  const RT = rng(555);
  const trees = new THREE.InstancedMesh(leafGeo, leaf, 90); const M = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) {
    const sx = RT() < 0.5 ? -1 : 1, s = 3 + RT() * 5;
    M.compose(new THREE.Vector3(sx * (30 + RT() * 60), 2 + RT() * 8, -60 - RT() * 70), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s)); trees.setMatrixAt(i, M);
  }
  scene.add(trees);
  const roof = roofClutter(list, { seed: 33 }); scene.add(roof);
  const vents = steam(list.slice(0, 28).filter((b, i) => i % 3 === 0).map((b) => new THREE.Vector3(b.x, (b.y || 0) + b.h, b.z)), { color: 0xc07a6a, size: 6, n: 5, opacity: 0.35 }); scene.add(vents);
  const fly = flyers({ n: 6, seed: 34, rad: [40, 110], y: [50, 110], light: 0xffd2a0, cone: 0xffc890 }); fly.position.z = -34; scene.add(fly);
  // 细节层：粉紫晚霞雾、从塔身升腾的火星与灰烬
  const haze = fogSheets({ n: 5, y0: 3, y1: 62, color: 0x7a4466, density: 0.4, seed: 3, speed: 0.02 }); scene.add(haze);
  const sparks = motes({ n: 900, box: [90, 90, 70], center: [0, 0, -34], color: 0xff8a3a, size: 3.2, rise: 6, sway: 5, seed: 31 }); scene.add(sparks);
  const ash = motes({ n: 500, box: [120, 70, 90], center: [0, 0, -30], color: 0xffd0a0, size: 1.6, rise: 2, sway: 8, seed: 32 }); scene.add(ash);
  const rig = camPath([
    { u: 0, p: [-46, 1.5, 4], l: [0, 24, -34], fov: 104, roll: -0.08 },
    { u: 0.45, p: [-30, 14, 10], l: [0, 34, -34], fov: 92, roll: 0.05 },
    { u: 0.62, p: [22, 22, 12], l: [0, 40, -34], fov: 88, roll: -0.1 },
    { u: 1, p: [16, 48, -10], l: [-2, 50, -34], fov: 62, roll: 0 }
  ], { ease: E.lin });
  const lyric = makeLyricLayer(ctx, camera, { y: -0.32, height: 0.08, colors: { sung: 0xfff1de, hot: 0xffd23f, pre: 0xff9a5a, splitA: 0x2fe0d0, splitB: 0xff2f4f } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), p = S.p;
    // 0–45% 低机位慢环绕（超广角）→ 第 5 小节一次甩镜绕到另一侧 → 最后推近霓虹招牌
    const u = p < 0.5 ? p * 0.9 : p < 0.56 ? 0.45 + E.whip((p - 0.5) / 0.06) * 0.17 : 0.62 + E.io((p - 0.56) / 0.44) * 0.38;
    applyCam(camera, rig(u), { t, shake: 0.12 + f.kick * 0.25, punch: punchAt(B, 4) });
    const kk = Math.max(f.kick, pulse(B.bp, 8) * 0.4);
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 1.6, B.b16, kk);
    roof.userData.tick(t); vents.userData.tick(t); fly.userData.tick(t); warmL.intensity = 3000 + kk * 4000;
    const b8 = ((B.beat % 8) + B.bp) / 8;
    mat.userData.wave(0, -34, b8 * 150, (1 - b8) * 0.9, 6 + b8 * 8, 0xff7a3a);
    haze.userData.tick(t, camera, kk * 0.4); sparks.userData.tick(t, 1 + kk * 0.8); ash.userData.tick(t, 0.8);
    signs.forEach(({ s, i }) => {
      const off = hash(i * 3.3 + B.b16 * 0.71) < 0.08 + f.kick * 0.25;
      s.material.opacity = off ? 0.15 : 1;
      s.material.color.setScalar(off ? 1 : 0.85 + kk * 0.4);
    });
    post.s.exposure = 1.2; post.s.bloom = 0.45 + kk * 0.15; post.s.bloomT = 0.7; post.s.fish = 0; post.s.bloomR = 0.5;
    post.s.ab = 0.002 + f.kick * 0.008; post.s.glitch = Math.pow(f.kick, 3) * 0.3;
    post.s.scan = 0.05; post.s.grain = 0.03; post.s.vig = 0.35;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
