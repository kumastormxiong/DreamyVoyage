// 10 高架磁浮（副歌 2 前半，低音全开）：第一人称坐在磁浮轨道的最前端，在午夜靛紫色的巨构峡谷里高速穿行——两侧是几百米宽、上千米高的塔墙，
// 一条细细的高架轨道从塔墙之间穿过，对向列车和脚下的轨道立柱是唯一的人尺度参照。
// 楼面是冷白 + 黄绿 + 洋红的窗光；旁边几条高架轨道上，对向列车每两拍呼啸而过一列（卡点），
// 轨道立柱上的灯随你经过依次闪亮；鼓点让窗光与画面一起撕裂。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite, glowTexture } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, skyMat, ground, signMesh, SIGN_WORDS, pick } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { flyers, searchlights } from './dress.js';
import { E } from './cam.js';
import { speedLines, fogSheets, motes, aurora } from './fx.js';

const V = 62;                                     // 镜头速度（米/秒）

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 70, bg: 0x140f2e, near: 0.4, far: 6000 });
  const sky = skyMat({ stops: [[-0.2, 0x0a0820], [0.0, 0x3a1e5e], [0.12, 0x24164a], [0.5, 0x120c2a], [1, 0x07051a]], stars: 0.3 }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0xa08aff, moonI: 2.0, dir: [0.5, 0.6, 0.2], hemiSky: 0x3a2a6a, hemiGround: 0x101020, hemiI: 1.2, shadow: false, env: envFromSky(ctx, sky) });
  const fly = flyers({ n: 10, seed: 101, rad: [40, 120], y: [40, 120], speed: 0.12 }); scene.add(fly);
  const beams = searchlights({ n: 6, seed: 102, area: 200, z0: -500, color: 0xc6ff3d, len: 500 }); scene.add(beams);
  const mat = cityMat({ wall: 0x3a3460, wall2: 0x4a4280, wallH: 1300, lit: [0xe8f0ff, 0xc6ff3d, 0xff3fa4], dark: 0x0c0a22, litP: 0.3, glow: 1.25, band: 0.1, warm: 0xc6ff3d, fogH: 30,
    floorH: 2.2, colW: 1.6, winX: 0.7, winY: 0.45, neon: 0xc6ff3d, neon2: 0xff3fa4, neonP: 0.12, roof: 0x120e2a, fog: 0x1c1440, fogNear: 160, fogFar: 2000, flick: 0.05, seed: 10 });
  const R = rng(1010), list = [];
  for (let z = 120; z > -1500; z -= 90 + R() * 80) for (const side of [-1, 1]) {          // 塔墙：每 100 多米一座，宽 70–180 米，高 300–1500 米
    const w = 70 + R() * 110, x = side * (60 + w / 2 + R() * 50), h = 300 + Math.pow(R(), 1.2) * 1200;
    let y = 0, ww = w, hh = h * 0.55;
    for (let q = 0; q < 3; q++) { list.push({ x, y, z, w: ww, d: 90 + R() * 80, h: hh }); y += hh; ww *= 0.78; hh = h * (q ? 0.14 : 0.3); }
    if (R() < 0.6) list.push({ x: x + side * (130 + R() * 160), z: z + R() * 40, w: 120 + R() * 120, d: 120, h: 600 + R() * 1200 });
    if (R() < 0.35) list.push({ x: side * 52, y: 520 + R() * 500, z: z - 40, w: 32 + R() * 20, d: 60 + R() * 60, h: 18 });         // 塔间悬着的天桥残段
  }
  scene.add(buildings(mat, list)); scene.add(ground(0x0a0818, 8000));
  // 轨道：主轨（镜头所在）+ 3 条旁轨
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x2a2450, toneMapped: false });
  const railMat = new THREE.MeshBasicMaterial({ color: 0x4a7a1a, toneMapped: false });
  const tracks = [[0, 30], [-12, 30], [14, 44], [-20, 18]];
  const posts = [];
  tracks.forEach(([x, y], ti) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 1500), beamMat); beam.position.set(x, y - 1.5, -600); scene.add(beam);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1500), railMat); rail.position.set(x - 2.4, y - 0.6, -600); scene.add(rail);
    const rail2 = rail.clone(); rail2.position.x = x + 2.4; scene.add(rail2);
    for (let z = 60; z > -1300; z -= 30) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, y - 2, 1.6), beamMat); p.position.set(x, (y - 2) / 2, z); scene.add(p);
      if (ti === 0 || ti === 1) { const g = glowSprite(ti ? 0xff3fa4 : 0xc6ff3d, 2, 0.8); g.position.set(x + 3, y + 0.6, z); scene.add(g); posts.push({ g, z }); }
    }
  });
  // 车流光迹：轨道正上方（中央轨道两侧）两条车道的长曝光光带——白色车头灯朝镜头驶来，红色尾灯背向远去。
  // 每条光带是一根细长的实体条（加色混合发光），世界坐标固定，镜头穿过时自然掠过。
  const LEN = 1100, Z0 = 120, NC = 260, RR = rng(1077);
  const cars = Array.from({ length: NC * 2 }, (_, i) => {
    const dir = i < NC ? 1 : -1;
    return { dir, x: (dir > 0 ? -2.8 : 2.8) + (RR() - 0.5) * 1.0, y: 30.4 + RR() * 1.8, ph: RR() * LEN, sp: dir > 0 ? 36 + RR() * 40 : 22 + RR() * 30, len: 16 + RR() * 22,
      head: dir > 0 ? [1.0, 0.96, 0.85] : [1.0, 0.2, 0.1] };
  });
  const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 1), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), cars.length);
  bar.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bar.frustumCulled = false; scene.add(bar);
  const hPos = new Float32Array(cars.length * 3), hCol = new Float32Array(cars.length * 3);
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hPos, 3)); hg.setAttribute('color', new THREE.BufferAttribute(hCol, 3));
  const heads = new THREE.Points(hg, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, sizeAttenuation: true, map: glowTexture('255,255,255', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  heads.frustumCulled = false; scene.add(heads);
  const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3(), C3 = new THREE.Color();
  const trafficTick = (t, cz, k) => {
    cars.forEach((c, i) => {
      const z = Z0 - (((c.ph - c.dir * t * c.sp) % LEN) + LEN) % LEN;      // 世界坐标循环
      const d = cz - z, fade = (1 - smooth(300, 620, Math.abs(d))) * smooth(-10, 40, d) * (0.75 + k * 0.5);   // 镜头附近亮、远处与身后渐隐
      P3.set(c.x, c.y, z - c.dir * c.len / 2); S3.set(1, 1, c.len); M4.compose(P3, Q0, S3); bar.setMatrixAt(i, M4);
      C3.setRGB(c.head[0] * fade * 1.9, c.head[1] * fade * 1.9, c.head[2] * fade * 1.9); bar.setColorAt(i, C3);
      hPos.set([c.x, c.y, z], i * 3); hCol.set([c.head[0] * fade, c.head[1] * fade, c.head[2] * fade], i * 3);
    });
    bar.instanceMatrix.needsUpdate = true; if (bar.instanceColor) bar.instanceColor.needsUpdate = true;
    hg.attributes.position.needsUpdate = hg.attributes.color.needsUpdate = true;
  };
  // 对向列车
  const trainMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2a, toneMapped: false });
  const winMat = new THREE.MeshBasicMaterial({ color: col(0xe8f0ff), toneMapped: false });
  const trains = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 70), trainMat); g.add(body);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.8, 68), winMat); strip.position.y = 0.5; g.add(strip);
    const head = glowSprite(0xffffff, 6, 1); head.position.set(0, 0, -35.5); g.add(head);
    scene.add(g); trains.push(g);
  }
  // 楼面广告牌
  for (let i = 0; i < 40; i++) {
    const b = list[Math.floor(R() * list.length)]; if (b.h < 100 || Math.abs(b.x) > 400) continue;
    const s = signMesh(pick(SIGN_WORDS, R()), 30 + R() * 40, { color: pick(['#c6ff3d', '#ff3fa4', '#8ad8ff'], R()), vertical: R() < 0.5 });
    s.position.set(b.x - Math.sign(b.x) * (b.w / 2 + 0.6), 60 + R() * 420, b.z); s.rotation.y = -Math.sign(b.x) * Math.PI / 2; scene.add(s);
  }
  // 细节层：峡谷上空的紫绿极光、楼间雾、飞掠而过的火花、迎面的曲速线
  const aur = aurora({ center: Math.PI, span: 2.4, radius: 4000, y: 2000, height: 2000, colors: [0xc6ff3d, 0x8a6aff, 0xff3fa4], layers: 3, seed: 10, intensity: 0.6 }); scene.add(aur);
  const haze = fogSheets({ n: 6, y0: 10, y1: 800, color: 0x3a2a6a, density: 0.28, seed: 10, size: 5000, scale: 0.002, speed: 0.01 }); scene.add(haze);
  const sparks = motes({ n: 800, box: [120, 90, 260], center: [0, 20, 0], color: 0xc6ff3d, size: 2.4, rise: 2.0, sway: 3, seed: 105 }); scene.add(sparks);
  const warp = speedLines({ n: 520, rMin: 6, rMax: 40, depth: 240, len: 24, color: 0xd8ffa0, seed: 106 }); scene.add(warp);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.08, colors: { sung: 0xf4f6ff, hot: 0xc6ff3d, pre: 0x9a86e8, splitA: 0xc6ff3d, splitB: 0xff3fa4 } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 6);
    const cz = 40 - S.lt * V;
    camera.position.set(Math.sin(t * 0.7) * 0.15, 33 + Math.sin(t * 9) * 0.04 + f.kick * 0.1, cz);
    camera.lookAt(-1 + Math.sin(t * 0.3) * 3, 31, cz - 100);
    const barrel = B.bar % 4 === 3 ? E.whip(B.barp) * Math.PI * 2 : 0;          // 每 4 小节最后一小节：360° 桶滚
    camera.rotation.z += Math.sin(t * 0.25) * 0.05 + barrel;
    camera.fov = 96 + f.low * 8 - (B.bp < 0.3 ? (1 - B.bp / 0.3) * 6 : 0); camera.updateProjectionMatrix();
    fly.position.z = cz - 150; fly.userData.tick(t); beams.position.z = cz; beams.userData.tick(t, B.beat, bp);
    post.s.fish = 0; post.s.exposure = 1.15;
    sky.position.set(0, 0, cz); aur.position.z = cz; haze.userData.tick(t, camera, bp * 0.3); aur.userData.tick(t, bp * 0.4);
    sparks.position.z = cz - 100; sparks.userData.tick(t, 0.9 + bp * 0.4);
    warp.userData.tick(t, camera, 0.3 + f.low * 0.2, f.kick, V * 2.2);          // 中心的速度线减弱，给中间的车流让出可见度
    trafficTick(t, cz, f.low);
    mat.userData.scan(((B.bar % 2) + B.barp) / 2 * 1500, 0.6, 0xc6ff3d);
    // 列车：第 j 列在第 2j 拍时离镜头 600 米出发，相对速度 V + 90
    const beat2 = Math.floor(B.raw / 2);
    trains.forEach((g, i) => {
      const j = beat2 - i; const tj = (j * 2) * 60 / tl.bpm + (tl.timing.beatPhase || 0);
      const dt = t - tj; const tr = tracks[1 + (((j % 3) + 3) % 3)];
      const z = cz - 600 + dt * (V + 90);
      g.visible = z < cz + 120 && dt >= 0;
      g.position.set(tr[0], tr[1] + 1, z);
    });
    posts.forEach(({ g, z }) => { const d = cz - z; g.material.opacity = d > -2 && d < 40 ? 1 : 0.25 + bp * 0.4; });
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 2, B.b16, Math.max(f.kick, bp * 0.6));
    post.s.bloom = 0.35 + f.low * 0.15; post.s.bloomT = 0.75;
    post.s.ab = 0.0015 + f.kick * 0.007; post.s.glitch = Math.pow(f.kick, 3) * 0.45; post.s.warp = 0.1 + f.low * 0.1;
    post.s.scan = 0.06; post.s.grain = 0.03; post.s.vig = 0.45;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
