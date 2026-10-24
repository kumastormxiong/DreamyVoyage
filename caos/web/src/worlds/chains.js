// 场景 chains：主歌 / 尾奏。一条巨大的铬金属锁链从远处穿过观众身边飞到身后（每拍飞过一节），
// 四周（360°）还有几条斜穿、竖穿的锁链；整条链按世界 y 分带"切片错位"，鼓点时错位最大。
// 漂浮的故障色块每拍随机亮灭。镜头每 2 小节硬切一个机位（主歌克制）。
// sec.mode === 'collapse'（尾奏）：链节间距拉开、散架翻滚，错位加剧。
import * as THREE from 'three';
import { PAL, col, makeStage, makeStars, rng, hash, clamp, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { glitchify, beatAt, pulse, LYRIC_COLORS } from './_glitch.js';
import { fractalSky, speedLines, lightning } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 62, fog: [PAL.bg, 18, 120] });
  scene.add(makeStars(1400, 170, 1.3, 11, 0xbfd0ff));
  scene.add(new THREE.AmbientLight(0x404050, 1));
  const kl = new THREE.PointLight(col(PAL.a), 60, 40, 1.6); kl.position.set(4, 4, -6); scene.add(kl);
  const kl2 = new THREE.PointLight(col(PAL.b), 50, 40, 1.6); kl2.position.set(-5, -1, 4); scene.add(kl2);

  // 链节：拉长的圆环（instanced），每条链 NL 节
  const linkGeo = new THREE.TorusGeometry(0.9, 0.2, 10, 28); linkGeo.scale(1.55, 1, 1);
  const linkMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b4, metalness: 1, roughness: 0.22, envMap: ctx.env, envMapIntensity: 1.4 });
  const gU = glitchify(linkMat, { bands: 2.4, seed: 1 });
  const SP = 2.0;                      // 链节间距（米）
  const chains = [
    { o: new THREE.Vector3(0, 0.6, 0), dir: new THREE.Vector3(0, 0, 1), NL: 90, wob: 1.0, seed: 1 },        // 主链：从正前方飞到身后
    { o: new THREE.Vector3(-14, 4, -10), dir: new THREE.Vector3(0.35, 0, 1).normalize(), NL: 70, wob: 2, seed: 2 },
    { o: new THREE.Vector3(16, -3, -6), dir: new THREE.Vector3(-0.3, 0.1, 1).normalize(), NL: 70, wob: 2, seed: 3 },
    { o: new THREE.Vector3(9, 0, -22), dir: new THREE.Vector3(0, 1, 0), NL: 40, wob: 0.6, seed: 4 },         // 竖直上升
    { o: new THREE.Vector3(-10, 0, 14), dir: new THREE.Vector3(0, 1, 0.15).normalize(), NL: 40, wob: 0.6, seed: 5 },
    { o: new THREE.Vector3(0, 9, 0), dir: new THREE.Vector3(1, 0, 0.2).normalize(), NL: 70, wob: 1.5, seed: 6 }, // 头顶横穿
  ];
  const total = chains.reduce((s, c) => s + c.NL, 0);
  const links = new THREE.InstancedMesh(linkGeo, linkMat, total);
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage); links.frustumCulled = false; scene.add(links);
  chains.forEach((c) => {
    c.q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), c.dir);   // 链节长轴 → 链方向
    c.L = c.NL * SP;
  });

  // 故障色块（instanced 小方块），360° 分布，每拍随机亮灭
  const NB = 260, R = rng(9), blocks = [];
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 });
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, NB); bMesh.frustumCulled = false; scene.add(bMesh);
  const pal = [PAL.a, PAL.b, PAL.c, 0xffffff];
  for (let i = 0; i < NB; i++) {
    const a = R() * Math.PI * 2, r = 7 + R() * 26, y = (R() - 0.4) * 16;
    blocks.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, w: 0.2 + R() * 2.2, h: 0.08 + R() * 0.5, s: R() * 100 });
    bMesh.setColorAt(i, col(pal[Math.floor(R() * 4)]));
  }
  // 细节层：锁链背后的碎形纤维、顺着链飞来的流线，以及鼓点劈开的电弧
  const fr = fractalSky({ c1: 0xff2f8f, c2: 0x3ff6ff, shape: 0.9, speed: 0.5, intensity: 0.2 }); scene.add(fr);
  const warp = speedLines({ n: 380, rMin: 3, rMax: 22, depth: 120, len: 14, color: 0xbfd8ff, seed: 112 }); scene.add(warp);
  const arcs = lightning({ n: 3, color: 0xcfefff }); scene.add(arcs);
  const aF = new THREE.Vector3(), aT = new THREE.Vector3();
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.085, colors: LYRIC_COLORS() });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), E = new THREE.Euler();
  const AX = new THREE.Vector3(1, 0, 0);
  const SHOTS = [   // 机位：[x, y, z, lookX, lookY, lookZ]
    [2.6, 1.7, 0, -0.4, 1.0, -14],
    [-2.2, 2.6, 2, 0.6, 0.4, -12],
    [-3.2, -0.6, 1, 0, 2.0, -14],
    [3.4, 0.8, -1, -2, 1.8, -10],
  ];

  function update({ t, f, S, k, tl, post, sec }) {
    const B = beatAt(tl, t), collapse = sec.mode === 'collapse';
    const speed = SP * (tl.bpm / 60);                           // 每拍飞过一节
    const hit = Math.max(f.kick, pulse(B.bp, 9) * 0.5);
    const sep = collapse ? 1 + smooth(0, 1, S.p) * 1.2 : 1;   // 尾奏：链节散开
    let n = 0;
    for (const c of chains) {
      for (let i = 0; i < c.NL; i++, n++) {
        const d = ((i * SP + t * speed) % c.L) - c.L + 36;       // 飞到身后/上方 36 米才回到远端
        P.copy(c.dir).multiplyScalar(d * sep).add(c.o);
        P.x += Math.sin(d * 0.05 + c.seed) * c.wob; P.y += Math.cos(d * 0.04 + c.seed * 2) * c.wob * 0.6;
        Q.copy(c.q);
        Q2.setFromAxisAngle(AX, (i % 2) * Math.PI / 2 + (collapse ? (hash(i + c.seed * 50) - 0.5) * S.p * 6 + t * (hash(i) - 0.5) * S.p * 3 : 0));
        Q.multiply(Q2);
        const s = 1 + (hash(i * 3 + c.seed + B.beat * 0.01) > 0.93 ? hit * 0.35 : 0);
        Sc.setScalar(s);
        M.compose(P, Q, Sc); links.setMatrixAt(n, M);
      }
    }
    links.instanceMatrix.needsUpdate = true;
    gU.uGBeat.value = B.b16 * (collapse ? 1 : 0.25) | 0;
    gU.uGAmt.value = 0.08 + Math.pow(f.kick, 2) * (collapse ? 2.4 : 1.4) + (collapse ? 0.4 : 0);

    // 故障色块：缓慢后退（与链同速的 1/3），每拍随机亮灭
    const drift = t * speed * 0.33;
    blocks.forEach((b, i) => {
      const on = hash(i * 13.7 + B.beat * 0.73) > 0.55 ? 1 : 0;
      const zz = ((b.z + drift + 200) % 66) - 33;
      const w = b.w * (1 + f.kick * 0.5) * on;
      M.compose(P.set(b.x, b.y, zz), Q.identity(), Sc.set(Math.max(0.0001, w), Math.max(0.0001, b.h * on), 0.05)); bMesh.setMatrixAt(i, M);
    });
    bMesh.instanceMatrix.needsUpdate = true;
    bMat.opacity = 0.35 + f.high * 0.4;

    // 机位：每 2 小节硬切（尾奏每小节），机位内缓慢推移
    const every = collapse ? 1 : 2, shotIdx = Math.floor(B.bar / every);
    const sh = SHOTS[Math.floor(hash(shotIdx * 7.7) * SHOTS.length)];
    const sp = ((B.bar % every) + B.barp) / every;
    const jx = (hash(t * 60) - 0.5) * f.kick * 0.08, jy = (hash(t * 60 + 3) - 0.5) * f.kick * 0.08;
    camera.position.set(sh[0] + jx, sh[1] + jy, sh[2] - sp * 1.2);
    camera.lookAt(sh[3], sh[4], sh[5]);
    camera.rotation.z += Math.sin(t * 0.4) * 0.04;

    kl.intensity = 30 + f.kick * 140; kl2.intensity = 25 + f.low * 60;
    fr.userData.tick(t, camera, 0.15 + hit * 0.25 + (collapse ? S.p * 0.3 : 0));
    warp.userData.tick(t, camera, 0.3 + hit * 0.5, f.kick, speed * 3);
    for (let i = 0; i < 3; i++) {
      aF.set((hash(B.beat + i) - 0.5) * 14, 7 + hash(B.beat * 2 + i) * 3, -6 - hash(B.beat * 3 + i) * 8); aT.set((hash(B.beat * 4 + i) - 0.5) * 18, -3, -4 - hash(B.beat * 5 + i) * 12);
      arcs.userData.bolt(i, aF, aT, B.b16 * 3 + i, (collapse || B.beat % 2 === 0 ? 1 : 0) * (hash(B.beat * 0.8 + i) > 0.4 ? 1 : 0) * Math.exp(-B.bp * 6), 0.14, 0.25);
    }
    post.s.bloom = 0.5 + f.low * 0.35; post.s.bloomT = 0.55;
    post.s.ab = 0.0025 + f.kick * 0.008;
    post.s.glitch = Math.pow(f.kick, 3) * (collapse ? 0.6 : 0.3);
    post.s.scan = 0.14; post.s.grain = 0.06;
    if (collapse) { post.s.track = 0.5; post.s.pix = hash(B.beat * 1.3) > 0.85 && B.bp < 0.25 ? 0.3 : 0; }
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
