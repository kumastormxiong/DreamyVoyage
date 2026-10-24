// 场景 mosh：副歌。观众站在一座由故障屏组成的环形"数据神殿"中央（三层，360°），
// 每块屏每拍换一次故障图案；每小节整圈屏幕"跳"转 30°（卡点硬步进），镜头每小节切一个朝向。
// 正前方是当前歌词单词的巨型三色错位大字，随鼓点撕裂。
// sec.mode：'half'（副歌 1，还没进低音：每 2 小节一跳、亮度低一点）/'apex'（副歌 3：每半小节一跳 + 像素化重拍）
//           'build'（drop 前的上扬：屏幕向中心收拢、16 分音符闪烁、白光爬升）
import * as THREE from 'three';
import { PAL, col, makeStage, makeStars, makeGrid, rng, hash, clamp, smooth } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { glitchScreenMat, tickScreen, makeSplitWord, beatAt, pulse, LYRIC_COLORS, LYRIC_FONT } from './_glitch.js';
import { shockRing, lightning, fractalSky, motes } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 70, fog: [PAL.bg, 25, 90] });
  scene.add(makeStars(1200, 160, 1.2, 17));
  const floor = makeGrid({ size: 260, speed: 0, scale: 2.5, colA: PAL.a, colB: PAL.b, y: -2.2 }); scene.add(floor);
  const ceil = makeGrid({ size: 260, speed: 0, scale: 2.5, colA: PAL.b, colB: PAL.a, y: 7.5 }); ceil.rotation.x = Math.PI / 2; scene.add(ceil);

  const ring = new THREE.Group(); scene.add(ring);
  const R = rng(21), screens = [], N = 12;
  const tiers = [{ y: 1.6, r: 13, w: 5.6, h: 3.4 }, { y: 5.4, r: 14, w: 5.2, h: 2.8 }, { y: -1.6, r: 12.5, w: 4.8, h: 2.2 }];
  tiers.forEach((tr, ti) => {
    for (let i = 0; i < N; i++) {
      const a = ((i + (ti % 2) * 0.5) / N) * Math.PI * 2;
      const mat = glitchScreenMat({ seed: ti * 40 + i + 1, amp: 0.62, a: [PAL.a, PAL.b, PAL.c][(i + ti) % 3], b: [PAL.b, PAL.c, PAL.a][(i + ti) % 3], c: 0xffffff });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(tr.w, tr.h), mat);
      m.userData = { a, r: tr.r, y: tr.y, ti, i };
      ring.add(m); screens.push({ m, mat, ti, i, a, r: tr.r, y: tr.y });
    }
  });
  // 细节层：地面冲击环、天顶落下的电弧、屏幕后面的碎形纤维与浮尘
  const rg = shockRing({ color: 0xffffff, color2: 0xff2f8f, size: 120, hex: 1.6 }); rg.position.y = -2.1; scene.add(rg);
  const arcs = lightning({ n: 4, color: 0xffd0f0 }); scene.add(arcs);
  const fr = fractalSky({ c1: 0xff2f8f, c2: 0x3ff6ff, shape: 0.95, speed: 0.5, intensity: 0.22 }); scene.add(fr);
  const dust = motes({ n: 500, box: [40, 14, 40], center: [0, -2, 0], color: 0xffc0e8, size: 1.6, rise: 0.8, sway: 2, seed: 22 }); scene.add(dust);
  const aF = new THREE.Vector3(), aT = new THREE.Vector3();
  // 正前方巨型错位大字
  const big = makeSplitWord(2.4); big.group.position.set(0, 2.4, -9); scene.add(big.group);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.36, height: 0.07, colors: LYRIC_COLORS() });

  const YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const SHOTS = [   // [x, y, z, lookX, lookY, roll]
    [0, 1.6, 3.5, 0, 2.3, 0], [-3.2, 0.4, 2, 0.5, 2.6, 0.08], [3.0, 3.8, 2.5, -0.3, 2.0, -0.1], [0, 0.9, 0.5, 0, 2.6, 0.03], [-1.6, 3.0, 4.5, 0.8, 2.2, -0.05]
  ];

  function update({ t, f, S, k, tl, post, sec }) {
    const B = beatAt(tl, t), mode = sec.mode || '';
    const half = mode === 'half', apex = mode === 'apex', build = mode === 'build';
    const stepLen = half ? 8 : apex ? 2 : 4;                    // 多少拍"跳"一次
    const steps = Math.floor(B.raw / stepLen), sp = (B.raw / stepLen) - steps;
    const bp = pulse(B.bp, 7), hit = Math.max(f.kick, bp * 0.6);
    // 整圈步进：每次跳 30°，跳的瞬间有 0.08 拍的"甩"
    ring.rotation.y = (steps + 1 - Math.pow(1 - Math.min(1, sp * 10), 3)) * (Math.PI / 12);
    const shrink = build ? smooth(0, 1, S.p) : 0;
    screens.forEach((s) => {
      const r = s.r * (1 - shrink * 0.45) + (hash(s.i + s.ti * 9 + B.beat) > 0.9 ? hit * 1.5 : 0);
      s.m.position.set(Math.sin(s.a) * r, s.y + (build ? Math.sin(t * 8 + s.i) * shrink * 0.3 : 0), -Math.cos(s.a) * r);
      s.m.lookAt(0, s.y, 0);                          // 平面正面朝向中心
      const beatSeed = build ? B.b16 : B.beat;
      tickScreen(s.mat, t, beatSeed, hit, s.ti * 100 + s.i * 7);
      const blink = hash(s.i * 3.1 + s.ti * 17 + beatSeed * 0.37) > (half ? 0.45 : 0.2) ? 1 : 0.08;
      s.mat.uniforms.uOp.value = blink;
      s.mat.uniforms.uAmp.value = (half ? 0.38 : 0.5) + hit * 0.18 + shrink * 0.3;
    });
    const ra = B.barp * 240 / tl.bpm;
    rg.userData.set(ra * 24, Math.exp(-ra * 1.4) * (apex ? 1.3 : 0.7), 1.2 + ra * 1.5, t);
    for (let i = 0; i < 4; i++) {
      const an = hash(B.beat * 1.9 + i) * 6.2832, rr = 6 + hash(B.beat * 3.1 + i) * 8;
      aF.set(Math.cos(an) * rr * 0.5, 7.4, Math.sin(an) * rr * 0.5); aT.set(Math.cos(an) * rr, -2.1, Math.sin(an) * rr);
      arcs.userData.bolt(i, aF, aT, B.b16 * 4 + i, (apex || B.beat % 2 === 0 ? 1 : 0) * (hash(B.beat * 0.9 + i) > 0.45 ? 1 : 0) * Math.exp(-B.bp * 6), 0.12, 0.25);
    }
    fr.userData.tick(t, camera, 0.14 + hit * 0.22); dust.userData.tick(t, 0.8);
    floor.userData.update(t, 0.18 + bp * 0.25); ceil.userData.update(t, 0.08 + bp * 0.12);
    floor.position.z = (B.raw * 2.5) % 2.5; ceil.position.z = floor.position.z;

    // 大字：当前单词，起唱瞬间砸下 + 鼓点撕裂
    const word = k.i >= 0 ? k.flat[k.i] : null;
    big.set(word, LYRIC_FONT);
    if (word) {
      const age = k.age, e = clamp(age / 0.12);
      const sc = 1 + (1 - e) * 0.6;
      big.group.scale.setScalar(sc * (1 + f.kick * 0.06));
      const fit = Math.min(1, 13 / (2.4 * (big.group.children[0].scale.x / 2.4)));
      big.group.scale.multiplyScalar(fit);
      big.update(0.06 + f.kick * 0.35 + (1 - clamp(age / 0.3)) * 0.4, clamp(age / 0.04) * (k.next < 0.06 ? 0.3 : 0.6), B.b16, hit * 1.2);
    }

    // 镜头：每小节硬切一个机位（half 每 2 小节）。有词时机位都对着正前方的大字；没词时转向四周的屏幕
    const shotEvery = half ? 2 : 1, si = Math.floor(B.bar / shotEvery);
    const lp = ((B.bar % shotEvery) + B.barp) / shotEvery;
    if (word || build) {
      const sh = SHOTS[si === 0 ? 0 : Math.floor(hash(si * 5.3) * SHOTS.length)];
      camera.position.set(sh[0], sh[1], sh[2] - lp * 0.8);
      camera.lookAt(sh[3], sh[4], -9);
      camera.rotation.z += sh[5];
    } else {
      const yaw = YAW[Math.floor(hash(si * 5.3) * 4)];
      camera.position.set(0, 1.5, 0); camera.rotation.set(0.05, yaw + lp * 0.3, 0);
    }
    camera.position.x += (hash(t * 60) - 0.5) * f.kick * 0.1; camera.position.y += (hash(t * 60 + 1) - 0.5) * f.kick * 0.1;
    camera.rotation.z += apex ? Math.sin(B.raw * Math.PI / 2) * 0.03 : 0;
    camera.fov = 70 - hit * 4 + shrink * 10; camera.updateProjectionMatrix();

    post.s.bloom = 0.35 + f.low * 0.2 + hit * 0.15; post.s.bloomT = 0.72; post.s.bloomR = 0.35;
    post.s.ab = 0.003 + f.kick * 0.012;
    post.s.glitch = Math.pow(f.kick, 3) * (apex ? 0.55 : 0.35) + (apex && B.beat % 8 === 7 ? (1 - B.bp) * 0.5 : 0);
    post.s.scan = 0.16; post.s.grain = 0.05;
    if (apex && B.beat % 4 === 3 && B.bp > 0.5) post.s.pix = 0.15;
    if (build) {
      const w = smooth(0.55, 1, S.p);
      post.s.flash = [w * 0.5, w * 0.5, w * 0.55]; post.s.pix = S.p > 0.85 ? (S.p - 0.85) * 4 : 0;
      post.s.glitch = Math.max(post.s.glitch, (B.b16 % 2) * S.p * 0.5);
      camera.rotation.z += Math.sin(t * 30) * S.p * 0.02;
    }
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
