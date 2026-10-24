// 场景 mirror：桥段（低音抽空，合唱 + 人声最满）。镜像世界：上百块镜面碎片悬浮在观众四周缓慢旋转，
// 反射霓虹环境；正前方唱出的倒序单词，在上方"倒影"里被翻回正序（ugredna → andergu），像镜子揭示真话。
// 重音时个别碎片"跳帧"；最后两小节碎片向中心收拢、画面像素化，硬切进最后的副歌。
import * as THREE from 'three';
import { PAL, col, makeStage, makeStars, glowSprite, rng, hash, clamp, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { makeSplitWord, beatAt, pulse, LYRIC_COLORS, LYRIC_FONT } from './_glitch.js';
import { fractalSky, motes, lightning } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 58, fog: [PAL.bg, 14, 70] });
  scene.add(makeStars(2000, 140, 1.2, 41, 0xd8e4ff));
  const N = 160, R = rng(61), shards = [];
  const shardMat = new THREE.MeshPhysicalMaterial({ color: 0xaab0c8, metalness: 1, roughness: 0.06, envMap: ctx.env, envMapIntensity: 0.9, side: THREE.DoubleSide, flatShading: true, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 900] });   // 薄膜干涉：碎片随角度泛出彩虹色
  const shape = (s) => { const g = new THREE.BufferGeometry(); const p = []; const n = 3 + Math.floor(s * 3); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + hash(s * 10 + i) * 0.8; const r = 0.5 + hash(s * 7 + i) * 0.6; p.push(Math.cos(a) * r, Math.sin(a) * r, 0); } const idx = []; for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const geos = [0.1, 0.4, 0.7, 0.95].map(shape);
  for (let i = 0; i < N; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, r = 4 + Math.pow(R(), 0.7) * 20, s = Math.sqrt(1 - u * u);
    const m = new THREE.Mesh(geos[i % 4], shardMat);
    const base = new THREE.Vector3(Math.cos(a) * s * r, 1.6 + u * r * 0.55, Math.sin(a) * s * r);
    if (base.length() < 7) base.setLength(7);   // 碎片不进入镜头环绕范围（半径 2.2），否则大块金属会把整个画面压黑
    m.scale.setScalar(0.5 + R() * 2.2); scene.add(m);
    shards.push({ m, base, rx: R() * 6, ry: R() * 6, sp: 0.1 + R() * 0.3, i });
  }
  // 细节层：碎形纤维背景、浮尘、碎片之间跳动的电弧
  const fr = fractalSky({ c1: 0x3ff6ff, c2: 0xff2f8f, shape: 1.05, speed: 0.3, intensity: 0.3 }); scene.add(fr);
  const dust = motes({ n: 600, box: [60, 40, 60], center: [0, 2, 0], color: 0xd8e4ff, size: 2.0, rise: 0.8, sway: 4, seed: 14 }); scene.add(dust);
  const arcs = lightning({ n: 3, color: 0xbfefff }); scene.add(arcs);
  const aF = new THREE.Vector3(), aT = new THREE.Vector3();
  const glowA = glowSprite(PAL.a, 30, 0.25); glowA.position.set(-12, 6, -40); scene.add(glowA);
  const glowB = glowSprite(PAL.b, 34, 0.25); glowB.position.set(14, -4, -36); scene.add(glowB);
  const ghost = makeSplitWord(1.3, [PAL.b, PAL.a, 0xbfefff]); ghost.group.position.set(0, 4.2, -10); scene.add(ghost.group);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.12, height: 0.085, colors: LYRIC_COLORS() });
  const rev = (w) => [...w].reverse().join('');

  function update({ t, f, S, k, tl, post, sec }) {
    const B = beatAt(tl, t), end = smooth(0.86, 1, S.p);
    shards.forEach((s) => {
      const jump = hash(s.i * 1.7 + f.hitIdx * 0.37) > 0.92 && f.hit > 0.3 ? 0.6 : 0;
      s.m.position.copy(s.base).multiplyScalar(1 - end * 0.7);
      if (s.m.position.length() < 7) s.m.position.setLength(7);   // 收拢时也保持距离
      s.m.position.y += Math.sin(t * s.sp + s.i) * 0.4;
      s.m.position.x += jump * (hash(s.i + f.hitIdx) - 0.5) * 2;
      s.m.rotation.set(s.rx + t * s.sp, s.ry + t * s.sp * 0.7 + jump, 0);
    });
    // 镜头：慢慢环绕中心（每 2 小节换一个环绕方向）
    // 原先按小节翻转方向、按拍数累加角度，在换向和拍子回绕时会跳一下（约 1 秒的切变）；现在改成两个正弦叠加，始终连续
    const ang = Math.sin(t * 0.12) * 0.5 + Math.sin(t * 0.037) * 0.3;
    camera.position.set(Math.sin(ang) * 2.2, 1.7 + Math.sin(t * 0.3) * 0.3, Math.cos(ang) * 2.2);
    camera.lookAt(0, 2.4, -10);
    camera.rotation.z += Math.sin(t * 0.2) * 0.05 + end * Math.sin(t * 20) * 0.03;

    // 倒影里的正序单词
    const word = k.i >= 0 ? k.flat[k.i] : null;
    ghost.set(word ? rev(word) : null, LYRIC_FONT);
    if (word) { ghost.group.scale.set(1, -1, 1); ghost.update(0.05 + f.vox * 0.12, smooth(0.15, 0.6, k.age) * 0.55, B.b16, 0.15); }

    fr.userData.tick(t, camera, 0.22 + f.vox * 0.25 + end * 0.3); dust.userData.tick(t, 0.8 + f.vox * 0.5);
    for (let i = 0; i < 3; i++) {
      const sa = shards[Math.floor(hash(B.beat * 1.3 + i) * shards.length)], sb = shards[Math.floor(hash(B.beat * 2.9 + i * 4) * shards.length)];
      aF.copy(sa.m.position); aT.copy(sb.m.position);
      arcs.userData.bolt(i, aF, aT, B.b16 * 3 + i, (hash(B.beat * 0.77 + i) > 0.5 ? 1 : 0) * Math.exp(-B.bp * 5) * (0.5 + f.vox), 0.14, 0.2);
    }
    glowA.material.opacity = 0.18 + f.vox * 0.25; glowB.material.opacity = 0.18 + f.mid * 0.25;
    post.s.dream = 0.45; post.s.hue = Math.sin(t * 0.5) * 0.3; post.s.kal = (B.bar % 4 === 3 && B.beat % 4 >= 2) ? 6 : 0; post.s.bloom = 0.45 + f.vox * 0.25; post.s.bloomT = 0.7; post.s.bloomR = 0.45;
    post.s.ab = 0.003 + f.hit * 0.008; post.s.scan = 0.2; post.s.grain = 0.08; post.s.track = 0.3;
    post.s.glitch = Math.pow(f.hit, 3) * 0.25 + end * 0.4;
    post.s.pix = S.p > 0.94 ? (S.p - 0.94) * 12 : 0;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
