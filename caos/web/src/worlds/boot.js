// 场景 boot：开场「咏叹」。黑暗里一颗被切片错位的线框"链魂"（幽灵核心），四周一圈若隐若现的故障屏，
// 标题像信号不稳的电视一样解码出现；低频进来（~11s）后故障开始变密，15.7s 硬切进主歌。
import * as THREE from 'three';
import { PAL, col, makeStage, makeStars, glowSprite, textMesh, rng, hash, smooth, clamp } from '../lib.js';
import { glitchScreenMat, tickScreen, glitchify, beatAt, pulse, DISPLAY_FONT, LYRIC_FONT } from './_glitch.js';
import { plasmaShell, fractalSky, speedLines, motes } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 55 });
  scene.add(makeStars(900, 150, 1.2, 3, 0x9fb8ff));

  // 链魂核心：线框二十面体 + 内层实体 + 光晕
  const core = new THREE.Group(); core.position.set(0, 2.6, -11); scene.add(core);
  const wireMat = new THREE.MeshBasicMaterial({ color: col(PAL.b), wireframe: true, transparent: true, opacity: 0.85, toneMapped: false });
  const gU = glitchify(wireMat, { bands: 3.0, seed: 2 });
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 2), wireMat); core.add(wire);
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 1, roughness: 0.25, envMap: ctx.env, flatShading: true });
  const gU2 = glitchify(innerMat, { bands: 3.0, seed: 2 });
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), innerMat); core.add(inner);
  const halo = glowSprite(PAL.a, 9, 0.5); halo.position.z = -0.5; core.add(halo);
  // 细节层：核心外的等离子电晕、背后若隐若现的碎形纤维、漂浮的冷光尘，以及硬切前的曲速线
  const plasma = plasmaShell({ radius: 3.3, color: 0x3ff6ff, color2: 0xff2f8f, scale: 1.3 }); core.add(plasma);
  const fr = fractalSky({ c1: 0xff2f8f, c2: 0x3ff6ff, shape: 1.0, speed: 0.15, intensity: 0.1 }); scene.add(fr);
  const dust = motes({ n: 500, box: [50, 24, 50], center: [0, -3, -10], color: 0x9fd8ff, size: 2.2, rise: 0.6, sway: 2, seed: 8 }); scene.add(dust);
  const warp = speedLines({ n: 420, rMin: 2, rMax: 26, depth: 160, len: 14, color: 0xcfe8ff, seed: 9 }); scene.add(warp);

  // 一圈故障屏（360°），开场只亮几块
  const R = rng(5), screens = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + R() * 0.15, r = 15 + R() * 4;
    const mat = glitchScreenMat({ seed: i + 1, amp: 0.55 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + R() * 2, 5 + R() * 4), mat);
    m.position.set(Math.sin(a) * r, 1.5 + (R() - 0.5) * 3, -Math.cos(a) * r); m.lookAt(0, 1.6, 0);
    scene.add(m); screens.push({ m, mat, ph: R() * 10, i });
  }

  // 标题：三层错位（红/青/白）+ 副标题 + 署名（只在开场与片尾出现）
  const tOpt = { font: DISPLAY_FONT, size: 170, italic: true, fill: '#ffffff', spacing: 10, pad: 40 };
  const title = [PAL.a, PAL.b, 0xffffff].map((c, i) => {
    const m = textMesh('CHAINEDGHOST - Caos', 1.17, { ...tOpt }, i < 2); m.material.color = col(c); m.position.set(0, 0.95, -7 - i * 0.01); m.renderOrder = 10 + i; scene.add(m); return m;
  });
  const by = textMesh('虚空造物', 0.26, { font: DISPLAY_FONT, size: 120, weight: '700', fill: '#ff8fb0', spacing: 24 });
  by.position.set(0, -0.3, -7); scene.add(by);

  function update({ t, f, S, tl, post }) {
    const B = beatAt(tl, t), bassIn = smooth(6.2, 8.2, t), p = S.p;
    camera.position.set(Math.sin(t * 0.21) * 0.4, 1.6 + Math.sin(t * 0.17) * 0.15, 1.5 - p * 2.2);
    camera.lookAt(0, 1.5, -10);
    camera.rotation.z += Math.sin(t * 0.13) * 0.03;

    // 核心：随人声呼吸，低频进来后随拍子抖动/错位
    const k = Math.max(f.kick * bassIn, pulse(B.bp, 10) * 0.35 * bassIn);
    wire.rotation.set(t * 0.11, t * 0.17, 0); inner.rotation.set(-t * 0.2, t * 0.13, t * 0.05);
    core.scale.setScalar(1 + f.vox * 0.12 + k * 0.08);
    plasma.userData.tick(t, k, 0.12 + bassIn * 0.55 + f.vox * 0.2);
    fr.userData.tick(t, camera, 0.07 + bassIn * 0.22 + smooth(6.0, 8.2, t) * 0.2);
    dust.userData.tick(t, 0.7 + f.vox * 0.4);
    warp.userData.tick(t, camera, smooth(6.8, 8.2, t) * 0.9, k, 40 + smooth(6.8, 8.3, t) * 160);
    const amt = 0.15 + f.vox * 0.25 + k * 0.9 + (hash(Math.floor(t * 6)) > 0.85 ? 0.6 : 0);
    gU.uGAmt.value = gU2.uGAmt.value = amt; gU.uGBeat.value = gU2.uGBeat.value = Math.floor(t * 6) + B.beat * 3;
    wireMat.color.setHex(hash(B.beat + 0.5) > 0.8 && bassIn > 0.5 ? PAL.c : PAL.b);
    halo.material.opacity = (0.2 + f.vox * 0.35 + k * 0.25) * (1 - 0.6 * smooth(2.5, 3.6, t) * (1 - smooth(7.3, 8.2, t)));

    // 故障屏：前 6 秒几乎全黑，之后按 hash 随机亮起，低频进来后每拍换图
    screens.forEach((s) => {
      const on = smooth(1 + s.i * 0.3, 1.8 + s.i * 0.3, t) * (hash(s.i * 7 + Math.floor(t * (2 + bassIn * 6))) > 0.35 - bassIn * 0.3 ? 1 : 0.15);
      s.mat.uniforms.uOp.value = on * (0.35 + bassIn * 0.5);
      tickScreen(s.mat, t, Math.floor(t * 2) + B.beat * bassIn, k, s.i * 31);
    });

    // 标题：4.5s 起解码出现，13.8s 后碎裂消失
    const tin = smooth(2.5, 3.6, t), tout = 1 - smooth(7.4, 8.2, t);
    const unstable = (t < 4.2 ? 1 : 0.15) + k * 0.8;
    const fl = hash(Math.floor(t * 20)) < 0.25 * unstable ? 0.25 : 1;
    title.forEach((m, i) => {
      const sp = (i === 0 ? -1 : i === 1 ? 1 : 0) * (0.03 + unstable * 0.12);
      m.position.x = sp + (hash(Math.floor(t * 15) + i) - 0.5) * unstable * 0.3 * (i < 2 ? 1 : 0.3);
      m.material.opacity = tin * tout * fl * (i === 2 ? 0.92 : 0.45);
    });
    by.material.opacity = smooth(5, 6, t) * tout * 0.85;

    post.s.bloom = 0.45 + f.vox * 0.25 + k * 0.25; post.s.bloomT = 0.6;
    post.s.scan = 0.28; post.s.grain = 0.09; post.s.track = 0.8 * (1 - bassIn * 0.5); post.s.vig = 0.55;
    post.s.ab = 0.003 + k * 0.012 + (1 - tin) * 0.004;
    post.s.glitch = Math.pow(k, 2) * 0.5 + (t > 7.6 ? smooth(7.6, 8.39, t) * 0.6 : 0) + (t < 4 ? 0.05 : 0);
    post.s.dream = 0.6 * (1 - smooth(1.5, 4.5, t)); post.s.fish = 0.3 * (1 - smooth(0, 2.5, t)); post.s.exposure = 1.1;
    post.s.pix = t > 7.95 ? smooth(7.95, 8.39, t) : 0;
  }
  return { scene, camera, update };
}
