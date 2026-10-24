// 14 倒悬之城（桥段后半，合唱 + 人声，无低音）：脚下一座巨构之城，头顶倒挂着另一座一模一样的城，两座城的塔尖几乎相触，
// 一根直径两百多米、贯穿天地的巨柱把两座城钉在一起——观众悬在柱子旁边，渺小得像一粒灰；
// 中间是一条发白的紫色地平光带。观众悬浮在两城之间，镜头在 8 秒里缓慢翻滚 180°——上下颠倒，像倒序的歌词。
// 卡点：人声每起一个词，两城之间的光带亮一下；最后一小节翻滚加速、像素化，硬切进最后的副歌。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { megaTower, megaBeacons } from './mega.js';
import { aurora, fogSheets, motes as motesFx } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 64, bg: 0x08061a, near: 0.5, far: 7000 });
  const GAP = 760;                                    // 两城地面之间的距离
  const sky = skyMat({ stops: [[-1, 0x0a0820], [-0.1, 0x2a1c58], [0.0, 0x5a4a98], [0.1, 0x2a1c58], [1, 0x0a0820]] }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0xc8b8ff, moonI: 1.6, dir: [0, 0, -1], hemiSky: 0x5a4a9a, hemiGround: 0x5a4a9a, hemiI: 0.75, shadow: false, env: envFromSky(ctx, sky) });
  const mat = cityMat({ wall: 0x2e2648, wall2: 0x3e3468, wallH: 700, lit: [0x7fe7ff, 0xf0f4ff, 0xff7ad0], dark: 0x0a0818, litP: 0.4, glow: 1.4,
    floorH: 2.4, colW: 1.7, neon: 0xff7ad0, neon2: 0x7fe7ff, neonP: 0.1, roof: 0x120e26, fog: 0x1c1440, fogNear: 300, fogFar: 4600, seed: 14, band: 0.12, warm: 0x7fe7ff });
  const list = ringLayout(420, 260, 2600, { seed: 141, hMin: 120, hMax: 340, wMin: 50, wMax: 170 });
  list.push(...ringLayout(60, 700, 3200, { seed: 143, hMin: 300, hMax: 420, wMin: 120, wMax: 260 }));
  const PX = 150, PZ = -620;                               // 贯穿两城的巨柱 + 三道环形平台
  const pillar = [{ x: PX, y: 0, z: PZ, w: 230, d: 230, h: GAP }];
  [0.2, 0.5, 0.8].forEach((u) => pillar.push({ x: PX, y: GAP * u, z: PZ, w: 520, d: 520, h: 16 }));
  scene.add(buildings(mat, pillar));
  const pillarTips = [new THREE.Vector3(PX + 115, GAP * 0.5 + 18, PZ + 115), new THREE.Vector3(PX - 115, GAP * 0.2 + 18, PZ - 115), new THREE.Vector3(PX + 115, GAP * 0.8 + 18, PZ - 115)];
  scene.add(megaBeacons(pillarTips, { size: 40, color: 0x7fe7ff }));
  const low = buildings(mat, list); scene.add(low);
  const high = buildings(mat, list); high.scale.y = -1; high.position.y = GAP; high.rotation.y = 0.9; scene.add(high);
  const band = glowSprite(0xd8c8ff, 4200, 0.0); band.scale.y = 0.12; band.position.set(0, GAP / 2, -1500); scene.add(band);
  const R = rng(142), motes = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) motes.set([(R() - 0.5) * 900, R() * GAP, (R() - 0.5) * 900], i * 3);
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const dust = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xbfaaff, size: 1.6, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false })); scene.add(dust);
  // 细节层：环绕地平线的紫粉极光幕、两城之间的发光雾带、漂浮的星尘
  const aur = aurora({ center: Math.PI, span: 6.0, radius: 3000, y: GAP / 2, height: 1100, colors: [0x7fe7ff, 0xb48cff, 0xff7ad0], layers: 3, seed: 14, intensity: 0.7 }); scene.add(aur);
  const mist = fogSheets({ n: 3, y0: GAP / 2 - 40, y1: GAP / 2 + 40, color: 0x8a6ae0, density: 0.3, seed: 14, additive: true, scale: 0.003, size: 5000 }); scene.add(mist);
  const stars2 = motesFx({ n: 700, box: [700, GAP, 700], center: [0, 0, -300], color: 0xd8c8ff, size: 4.5, rise: 1.2, sway: 6, seed: 142 }); scene.add(stars2);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.12, height: 0.085, colors: { sung: 0xf4f0ff, hot: 0x7fe7ff, pre: 0xb48cff, splitA: 0x7fe7ff, splitB: 0xff7ad0 } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), p = S.p;
    const roll = smooth(0.05, 0.95, p) * Math.PI + smooth(0.85, 1, p) * 0.6;
    camera.position.set(PX - 230 + Math.sin(t * 0.1) * 10, GAP / 2 + Math.sin(t * 0.3) * 4, PZ + 330 - p * 20);   // 几乎停在柱子前方，原来推进 160 米会穿进墙体
    camera.lookAt(PX + 40, GAP / 2 + 40, PZ - 260);
    sky.position.copy(camera.position);
    camera.rotateZ(roll);
    dust.rotation.y = t * 0.02;
    aur.userData.tick(t, f.vox * 0.6); mist.userData.tick(t, camera, f.vox * 0.5); stars2.userData.tick(t, 0.9);
    mat.userData.scan(((B.bar % 2) + B.barp) / 2 * GAP, 0.9, 0x7fe7ff);
    const w = k.i >= 0 ? Math.exp(-k.age * 3) : 0;
    band.material.opacity = 0.25 + f.vox * 0.3 + w * 0.5;
    mat.userData.tick(t, B.beat, 0.1 + w * 1.5, Math.floor(t * 4), w);
    post.s.bloom = 0.5 + f.vox * 0.2; post.s.bloomT = 0.65; post.s.bloomR = 0.6; post.s.dream = 0.45; post.s.fish = 0; post.s.hue = Math.sin(t * 0.4) * 0.25; post.s.exposure = 1.2;
    post.s.ab = 0.0015 + w * 0.006; post.s.scan = 0.06; post.s.grain = 0.04; post.s.vig = 0.5;
    post.s.glitch = p > 0.9 ? (p - 0.9) * 5 : 0; post.s.pix = p > 0.95 ? (p - 0.95) * 10 : 0;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
