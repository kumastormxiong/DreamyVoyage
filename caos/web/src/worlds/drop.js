// 场景 drop：低音全开的段落（¡ohohoh! 间奏、副歌后的 drop）。观众在一条由故障方块砌成的方形隧道里高速前冲，
// 方块长度跟着 32 段频谱伸缩、每拍随机换色亮灭；每拍硬切机位（滚转/俯仰/远近），每小节第一拍白闪一下，
// 鼓点触发画面撕裂。sec.mode === 'apex'：每小节隧道整体扭转 90°，第 8 拍像素化重击。
import * as THREE from 'three';
import { PAL, col, makeStage, makeStars, rng, hash, clamp, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { makeSplitWord, beatAt, pulse, LYRIC_COLORS, LYRIC_FONT } from './_glitch.js';
import { fractalSky, speedLines } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 78, fog: [PAL.bg, 20, 150] });
  scene.add(makeStars(1500, 180, 1.4, 31));
  // 细节层：方块缝隙里透出的碎形纤维，以及迎面而来的曲速线
  const fr = fractalSky({ c1: 0xff2f8f, c2: 0x3ff6ff, shape: 0.9, speed: 1.4, intensity: 0.3 }); scene.add(fr);
  const warp = speedLines({ n: 480, rMin: 2.5, rMax: 9, depth: 200, len: 16, color: 0xffd0f0, seed: 78 }); scene.add(warp);
  const tunnel = new THREE.Group(); scene.add(tunnel);
  const N = 1100, R = rng(77), items = [], LEN = 220, HALF = 8;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tunnel.add(mesh);
  const pal = [PAL.a, PAL.b, PAL.c, 0xffffff, 0x222233, 0x111118];
  for (let i = 0; i < N; i++) {
    const side = Math.floor(R() * 4), u = (R() * 2 - 1) * HALF;
    const depth = R() * 2.5;                               // 往墙外的厚度偏移
    let x, y; if (side === 0) { x = u; y = -HALF - depth; } else if (side === 1) { x = u; y = HALF + depth; } else if (side === 2) { x = -HALF - depth; y = u; } else { x = HALF + depth; y = u; }
    items.push({ x, y, z0: R() * LEN, side, band: Math.floor(R() * 32), w: 0.2 + R() * 1.1, len: 0.5 + R() * 3.5, c: Math.floor(R() * pal.length), s: R() * 100 });
  }
  const colors = pal.map((h) => col(h));
  items.forEach((it, i) => mesh.setColorAt(i, colors[it.c]));
  const white = col(0xffffff), tmpC = new THREE.Color();
  const big = makeSplitWord(3.2); big.group.position.set(0, 0, -11); camera.add(big.group);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.34, height: 0.07, colors: LYRIC_COLORS() });
  const spBuf = new Float32Array(ctx.spec.nb || 32);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
  const CAMS = [   // [x, y, roll, pitch, fov]
    [0, 0, 0, 0, 78], [-2.5, 1.5, 0.35, -0.05, 70], [2.8, -2.0, -0.4, 0.08, 84], [0, 3.2, Math.PI, 0, 76], [-3.2, -3.0, 0.8, 0.1, 90], [1.5, 2.5, -0.2, -0.12, 66]
  ];

  function update({ t, f, S, k, tl, post, sec }) {
    const B = beatAt(tl, t), apex = sec.mode === 'apex';
    const bp = pulse(B.bp, 6), down = B.beat % 4 === 0 ? pulse(B.bp, 5) : 0;
    const hit = Math.max(f.kick, bp * 0.7);
    fr.userData.tick(t, camera, 0.22 + hit * 0.3);
    warp.userData.tick(t, camera, 0.5 + hit * 0.5, f.kick, tl.bpm / 60 * 7.5 * 2);
    const sp = ctx.spec.at(t, spBuf);
    const speed = (tl.bpm / 60) * 7.5;                       // 每拍前冲 7.5 米
    tunnel.rotation.z = apex ? (B.bar + 1 - Math.pow(1 - Math.min(1, B.barp * 8), 3)) * Math.PI / 2 : Math.sin(t * 0.25) * 0.2;
    items.forEach((it, i) => {
      const z = ((it.z0 + t * speed) % LEN) - LEN + 40;     // 飞到身后 40 米才回收
      const v = sp[it.band] || 0;
      const on = hash(i * 0.731 + B.beat * 1.37) > 0.25 ? 1 : 0;
      const L = it.len * (0.4 + v * 2.2) * on, W = it.w * (0.6 + v * 0.8);
      const out = v * 1.2 + (it.side < 2 ? 0 : 0);
      const ox = it.side === 2 ? -out : it.side === 3 ? out : 0, oy = it.side === 0 ? -out : it.side === 1 ? out : 0;
      Sc.set(it.side < 2 ? W : 0.25 + v * 0.8, it.side < 2 ? 0.25 + v * 0.8 : W, Math.max(0.0001, L));
      M.compose(P.set(it.x + ox, it.y + oy, z), Q.identity(), Sc); mesh.setMatrixAt(i, M);
      const ci = (it.c + Math.floor(hash(i + B.bar * 3.3) * 3)) % pal.length;
      tmpC.copy(colors[ci]).multiplyScalar(0.22 + v * 0.55); if (down > 0.5 && hash(i + B.bar) > 0.7) tmpC.lerp(white, down);
      mesh.setColorAt(i, tmpC);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;

    // 每拍硬切机位
    const c = CAMS[B.beat <= 0 ? 0 : Math.floor(hash(B.beat * 2.17) * CAMS.length)];
    camera.position.set(c[0] + (hash(t * 60) - 0.5) * hit * 0.25, c[1] + (hash(t * 60 + 2) - 0.5) * hit * 0.25, 0);
    camera.rotation.set(c[3], 0, c[2] + B.bp * 0.05);
    camera.fov = c[4] + (1 - bp) * 3 - f.kick * 6; camera.updateProjectionMatrix();

    // 无歌词的 drop：正中大字闪现"CAOS"/"GLITCH"/"链魂"，与拍子同步
    if (!k.blk) {
      const words = ['CAOS', 'GLITCH', 'ERROR', 'ESPAÑOL'];
      const w = B.beat % 2 === 0 && B.bp < 0.45 ? words[Math.floor(hash(B.beat * 0.37) * words.length)] : null;
      big.set(w, LYRIC_FONT); if (w) big.update(0.1 + f.kick * 0.4, 0.5, B.b16, hit * 1.5);
    } else {
      const word = k.i >= 0 ? k.flat[k.i] : null;
      big.set(word, LYRIC_FONT);
      if (word) { const e = clamp(k.age / 0.12); big.group.scale.setScalar(1 + (1 - e) * 0.8); big.update(0.08 + f.kick * 0.4, 0.6, B.b16, hit * 1.6); }
    }

    post.s.bloom = 0.35 + f.low * 0.25; post.s.bloomT = 0.72; post.s.bloomR = 0.35;
    post.s.ab = 0.004 + f.kick * 0.016;
    post.s.glitch = Math.pow(f.kick, 2) * 0.55 + (apex && B.beat % 8 === 7 ? (1 - B.bp) * 0.6 : 0);
    post.s.flash = [down * 0.1, down * 0.1, down * 0.13];
    post.s.scan = 0.12; post.s.grain = 0.05; post.s.warp = 0.12 + bp * 0.08;
    if (apex && B.beat % 8 === 7 && B.bp > 0.4) post.s.pix = 0.25;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
