// 12 雨夜招牌林（副歌后的 drop，无歌词）：一条窄街两侧的楼几乎全黑，只有成百上千块悬挑出来的霓虹招牌，
// 酸性绿 / 朱红 / 群青 / 白，层层叠叠伸进街心；斜雨从镜头前划过，湿地面倒映着所有招牌。
// 卡点：每拍硬切机位（低/中/高、左右偏），每拍离镜头最近的一排招牌白闪，16 分音符上随机招牌掉帧。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth } from '../lib.js';
import { cityMat, buildings, skyMat, wetGround, signMesh, SIGN_WORDS, pick } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { steam } from './dress.js';
import { ripples, fogSheets, lightning, motes } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 66, bg: 0x020607 });
  const sky = skyMat({ stops: [[-0.2, 0x020607], [0.0, 0x0c1a1c], [0.15, 0x050c0e], [1, 0x010203]] }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x6a8a90, moonI: 0.8, hemiSky: 0x1a3036, hemiGround: 0x1a0a0a, hemiI: 0.8, shadow: false, env: envFromSky(ctx, sky) });
  const spillA = new THREE.PointLight(0xb6ff3b, 900, 60, 1.5), spillB = new THREE.PointLight(0xff3b3b, 900, 60, 1.5); scene.add(spillA, spillB);
  const mat = cityMat({ wall: 0x2a3434, wall2: 0x1a2424, rough: 0.35, wallH: 60, lit: [0x9ad8d0, 0xe8f0ea, 0xb6ff3b], dark: 0x030606, litP: 0.12, glow: 1.0,
    floorH: 2.6, colW: 1.8, neon: 0xb6ff3b, neon2: 0xff3b3b, neonP: 0.08, roof: 0x060a0a, fog: 0x040a0c, fogNear: 30, fogFar: 260, fogH: 6, band: 0.04, warm: 0xb6ff3b, seed: 12 });
  const R = rng(1212), list = [];
  for (let z = 20; z > -420; z -= 8 + R() * 6) for (const side of [-1, 1]) { const w = 8 + R() * 6; list.push({ x: side * (9 + w / 2), z, w, d: 8 + R() * 4, h: 20 + R() * 50 }); }
  scene.add(buildings(mat, list, { reflect: true })); scene.add(wetGround(0x020506, 0.62));
  const cols = ['#b6ff3b', '#ff3b3b', '#3b6bff', '#f4f4f4', '#ff3fb0', '#ffb23b'];
  const signs = [], mirror = new THREE.Group(); mirror.scale.y = -1; scene.add(mirror);
  for (let i = 0; i < 180; i++) {
    const side = R() < 0.5 ? -1 : 1, v = R() < 0.65, z = 15 - R() * 420;
    const s = signMesh(pick(SIGN_WORDS, R()), v ? 3 + R() * 5 : 1.2 + R() * 1.2, { color: pick(cols, R()), vertical: v, size: 64 });
    const w = s.geometry.parameters.width;
    s.position.set(side * (9 - w / 2 - R() * 3.5), 3 + R() * 22, z);
    scene.add(s);
    const m = s.clone(); m.material = s.material; mirror.add(m);
    signs.push({ s, i, z });
  }
  // 雨
  const NR = 1800, rp = new Float32Array(NR * 6), drops = [];
  for (let i = 0; i < NR; i++) drops.push({ x: (R() - 0.5) * 18, z: -R() * 60, ph: R(), sp: 0.8 + R() * 0.5 });
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9ab8c0, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
  rain.frustumCulled = false; scene.add(rain);
  // 细节层：湿地面的雨滴涟漪、霓虹染色的低雾、霓虹蒸汽火花，以及偶尔劈下的闪电
  const rip = ripples({ color: 0xcfeee8, cell: 2.4 }); scene.add(rip);
  const neonFog = fogSheets({ n: 3, y0: 3, y1: 24, color: 0x2a6a20, density: 0.22, seed: 12, additive: true, scale: 0.03 }); scene.add(neonFog);
  const redFog = fogSheets({ n: 2, y0: 6, y1: 18, color: 0x6a1010, density: 0.18, seed: 13, additive: true, scale: 0.025 }); scene.add(redFog);
  const sparks = motes({ n: 500, box: [26, 40, 260], center: [0, 0, -120], color: 0xb6ff3b, size: 2.2, rise: 2.5, sway: 1.5, seed: 21, follow: false }); scene.add(sparks);
  const storm = lightning({ n: 2, color: 0xd8f4ff }); scene.add(storm);
  const sF = new THREE.Vector3(), sT = new THREE.Vector3();
  const SHOTS = [[0, 2.2, 0, 0.05, 0, 66], [-4, 6, 0.2, -0.12, 0, 80], [3.5, 1.0, -0.15, 0.1, 0, 96], [6.5, 16, 0.05, -0.6, 0, 100], [-2, 3.5, 0.35, 0, 0, 58], [0, 0.4, 0, 0.35, 0.3, 108]];   // [x, y, roll, pitch, 鱼眼, fov]
  const vents = steam(Array.from({ length: 10 }, (_, i) => new THREE.Vector3((i % 2 ? 1 : -1) * 7, 0, -20 - i * 30)), { color: 0x6a8a80, size: 6, n: 5, rise: 2, opacity: 0.18 }); scene.add(vents);

  function update({ t, f, S, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 7);
    const cz = 10 - S.lt * 14;
    const sh = SHOTS[S.p < 0.4 ? 0 : S.p < 0.74 ? 3 : 5];                // 整场只有 2 次切换：街面平视 → 高处俯瞰 → 贴地鱼眼仰拍
    camera.position.set(sh[0], sh[1], cz);
    camera.rotation.set(sh[3], (B.bp < 0.15 ? (1 - B.bp / 0.15) : 0) * 0.08 * (B.beat % 2 ? 1 : -1), sh[2] + Math.sin(t * 7) * 0.01);
    camera.fov = sh[5] - f.kick * 8 + (1 - Math.min(1, B.bp * 6)) * 6; camera.updateProjectionMatrix();
    post.s.fish = sh[4]; vents.userData.tick(t);
    rip.userData.tick(t, camera, 0.9 + bp * 0.5); neonFog.userData.tick(t, camera, bp * 0.4); redFog.userData.tick(t, camera, f.kick * 0.5);
    sparks.position.z = cz + 120 - 120; sparks.userData.tick(t, 0.9);
    for (let i = 0; i < 2; i++) {                                        // 每 8 拍的最后一拍：两道闪电劈向招牌林
      sF.set((i ? 1 : -1) * (6 + hash(B.beat + i) * 10), 130, cz - 140 - i * 30); sT.set((i ? 1 : -1) * 9, 18 + hash(B.beat * 2 + i) * 8, cz - 100 - i * 40);
      storm.userData.bolt(i, sF, sT, B.b16 * 3 + i, B.beat % 8 === 7 ? Math.exp(-B.bp * 7) * (hash(B.b16 + i) > 0.2 ? 1 : 0.3) : 0, 0.14, 0.3);
    }
    spillA.position.set(-6, 8, cz - 14); spillB.position.set(6, 12, cz - 30); spillA.intensity = 120 + bp * 300; spillB.intensity = 120 + f.kick * 300;
    for (let i = 0; i < NR; i++) {
      const d = drops[i], y = 30 - ((d.ph * 30 + t * 26 * d.sp) % 30), z = cz + d.z;
      rp.set([d.x, y, z, d.x - 0.25, y - 1.1, z], i * 6);
    }
    rg.attributes.position.needsUpdate = true;
    signs.forEach(({ s, i, z }) => {
      const dz = cz - z;
      const near = dz > 8 && dz < 26 && (Math.floor(dz / 6) === (B.beat % 3)) ? bp : 0;
      const drop = hash(i * 0.73 + B.b16 * 1.31) < 0.06 + f.kick * 0.12;
      s.material.opacity = drop ? 0.1 : 1;
      s.material.color.setScalar(0.9 + near * 1.1);
    });
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 2.0, B.b16, bp);
    post.s.bloom = 0.4 + f.low * 0.12; post.s.bloomT = 0.68; post.s.bloomR = 0.45; post.s.exposure = 1.0;
    post.s.ab = 0.002 + f.kick * 0.01; post.s.glitch = Math.pow(f.kick, 2) * 0.4 + (B.beat % 8 === 7 ? (1 - B.bp) * 0.4 : 0);
    post.s.scan = 0.05; post.s.grain = 0.04; post.s.vig = 0.55;
  }
  return { scene, camera, update };
}
