// 场景 highway：Pre-Chorus / Chorus / 终章。霓虹公路奔向蒸汽波落日，铬金属锁链拱门一座座飞过头顶，当前唱到的假名巨大地悬在天空。
import * as THREE from 'three';
import { PAL, col, KANA, hash, makeGrid, makeSun, makeStars, makeRidge, makeSky, makeGlyphBank, glowSprite, smooth, clamp, lerp } from '../lib.js';
import { makeChain } from '../lib.js';
import { makeCyberField, makeBlockField } from '../cyber.js';
import { makeLyricLayer, FLY, KANA_CELL } from '../lyrics.js';

const MODES = {
  pre:    { top: 0x04000d, mid: 0x2a0838, hor: 0xb02a70, speed: 16, rise: [0.12, 0.62], glitch: 0.12, bloom: 0.42, hero: 15 },
  chorus: { top: 0x070016, mid: 0x5a0d4e, hor: 0xff5a5a, speed: 32, rise: [0.45, 0.8], glitch: 0.3, bloom: 0.52, hero: 24 },
  apex:   { top: 0x0a0020, mid: 0x7a1060, hor: 0xffa860, speed: 46, rise: [1, 1], glitch: 0.5, bloom: 0.68, hero: 28 }
};

const topLayer = (o) => { o.renderOrder = 30; if (o.material) { o.material.depthTest = false; o.material.depthWrite = false; } };

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x05000c);
  scene.fog = new THREE.Fog(0xb02a70, 40, 340);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
  const sky = makeSky(0x04000d, 0x2a0838, 0xb02a70, { midAt: 0.3, power: 0.55 }); scene.add(sky);
  scene.add(makeStars(2200, 380, 1.5, 4));

  // 太阳放大约 3 倍（后退到 z=-232 以保证不超出画面），光晕同步放大
  // 断裂条纹的范围加大到太阳下部 74%，并把太阳抬高，让条纹露在地平线和山脊之上
  const sun = makeSun(38, 0.6, 0.74); sun.scale.setScalar(3); sun.position.set(0, 10, -232); scene.add(sun);
  const sunGlow = glowSprite('255,120,90', 300, 0.75); sunGlow.scale.setScalar(2.2); sunGlow.position.set(0, 8, -234); scene.add(sunGlow);
  const hz = glowSprite('255,60,140', 500, 0.55); hz.scale.set(1.2, 0.22, 1); hz.position.set(0, 4, -200); scene.add(hz);

  const rA = makeRidge({ z: -125, h: 24, seed: 3, color: PAL.cyan, valley: 30 }), rB = makeRidge({ z: -160, h: 36, seed: 9, color: PAL.magenta, valley: 40, width: 420 });
  scene.add(rB, rA);
  const grid = makeGrid({ speed: 16, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); scene.add(grid);

  // 锁链拱门
  const ARCH_N = 7, SPACING = 52, TOTAL = ARCH_N * SPACING;
  const arches = [];
  for (let i = 0; i < ARCH_N; i++) {
    const c = makeChain(80, ctx.env, { tube: 1.9 }); scene.add(c.mesh);
    c.layout((u) => { const a = Math.PI * (1 - u); return new THREE.Vector3(Math.cos(a) * 13.5, 0.1 + Math.sin(a) * 11, 0); }, { frac: 1, scale: 1.25, twist: i });
    const lamp = glowSprite(i % 2 ? '63,246,255' : '255,47,143', 9, 0.8); lamp.position.set(0, 11.4, 0.2); c.mesh.add(lamp);
    arches.push(c.mesh);
  }
  const cf = makeCyberField({ n: 34, codes: 10, box: [70, 36, 240], seed: 41 }); scene.add(cf.group);
  const bf = makeBlockField({ n: 120, box: [60, 30, 240], seed: 62 }); scene.add(bf.mesh);
  scene.add(new THREE.AmbientLight(0x553355, 0.6));
  // 天上的眼睛（副歌/终章才睁开）
  const eyesF = ctx.makeEyeField([
    { pos: [-62, 44, -175], w: 40, iris: 'blue', line: 'pink' }, { pos: [0, 60, -185], w: 50, iris: 'red', line: 'cyan' }, { pos: [64, 42, -175], w: 38, iris: 'ring_cyan', line: 'pink' },
    { pos: [-105, 70, -190], w: 34, iris: 'orange', line: 'cyan' }, { pos: [108, 68, -190], w: 34, iris: 'ring_pink', line: 'cyan' }
  ]); scene.add(eyesF.group);

  // 天空里的巨大假名
  const heroF = makeGlyphBank(ctx.atlasF, 0xffb4de, 1, 1), heroO = makeGlyphBank(ctx.atlasO, PAL.cyan, 1, 0.9);
  const heroOP = makeGlyphBank(ctx.atlasO, PAL.pink, 1, 0.6);
  [heroF, heroO, heroOP].forEach(b => { scene.add(b.group); b.group.traverse(topLayer); });
  const tmpA = new THREE.Color(), tmpB = new THREE.Color(), heroPos = new THREE.Vector3();
  // 五十音表 + 弹射（大字由本场景画在天空里，所以 hero:false，弹射终点指向天空里的字）
  const lyr = makeLyricLayer(ctx, camera, scene, { hero: false });
  // 歌词字形置于最顶层：不做深度测试，渲染顺序最后，不会被地面网格切入

  function update({ t, f, S, k, post, sec }) {
    const M = MODES[sec.mode] || MODES.chorus;
    // 氛围色随模式变化
    sky.material.uniforms.uTop.value.set(M.top); sky.material.uniforms.uMid.value.set(M.mid); sky.material.uniforms.uHor.value.set(M.hor);
    scene.fog.color.set(M.hor);
    const rise = lerp(M.rise[0], M.rise[1], S.p);
    sun.position.y = lerp(10, 22, rise); sunGlow.position.y = sun.position.y; sun.material.uniforms.uTime.value = t; sun.material.uniforms.uPulse.value = f.kick;
    sunGlow.material.opacity = 0.12 + rise * 0.12 + f.kick * 0.05;
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uSpeed.value = M.speed; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick;
    // 拱门向镜头飞来
    arches.forEach((m, i) => { m.position.z = ((i * SPACING + t * M.speed) % TOTAL) - (TOTAL - 22); m.rotation.z = 0; });
    // 副歌1（40.8s 起）：飞行漫游。镜头真正向太阳方向前进，左右、高度、俯仰一起起伏；歌词字形跟随镜头平移，保持位置不变
    const fly = sec.id === 'chorus1' ? 1 : 0;
    const fu = clamp(S.lt / Math.max(0.001, sec.end - sec.start), 0, 1);
    const adv = fly * 100 * (0.5 * fu + 0.5 * fu * fu);                       // 前进距离（向 -z），末段加速
    const sway = fly * (Math.sin(S.lt * 0.37) * 5.5 + Math.sin(S.lt * 0.9 + 1.3) * 1.1);   // 左右漫游
    const lift = fly * (2.6 * Math.sin(S.lt * 0.55 + 0.5) + 1.8 * fu);        // 高度起伏
    // 假名
    const flat = k.flat, ci = k.i, ch = ci >= 0 ? flat[ci] : null;
    const age = ci >= 0 ? k.age : 9, pop = Math.exp(-age * 6);
    // 假名先从右上角的五十音表弹射过来（飞行 FLY 秒，期间天空里不显示），落地时从大砸到正常大小并白闪
    // 预副歌（pre）用"检索"入场：落地后先闪过几个随机假名再锁定；副歌用"砸下来"
    const ea = age - FLY, landed = ea >= 0 || !(ch in KANA_CELL);
    const dec = sec.mode === 'pre' && landed && ea < 0.09;
    const e = !landed || dec ? 0 : sec.mode === 'pre' ? 0.35 * Math.exp(-(ea - 0.09) * 22) : Math.exp(-Math.max(0, ea) * 24);
    const dch = dec ? KANA[Math.floor(hash(Math.floor(t * 50) * 1.7 + ci) * KANA.length)] : ch;
    const sc = M.hero * (1 + f.kick * 0.06) * (1 + 0.75 * e);
    for (const b of [heroF, heroO, heroOP]) { b.group.visible = !!ch && landed; b.group.traverse(topLayer); }
    const gx = sway, gy = lift, gz = -adv;   // 字形与镜头同步平移（gx/gy/gz 为副歌1的镜头位移），屏幕位置与大小保持不变
    heroPos.set(gx, -1 + M.hero * 0.25 + gy, -52 + gz);
    lyr.update(k, t, f, { target: heroPos, targetSize: M.hero, style: 'stamp' });
    if (ch && ch in heroF.map && landed) {
      const a = heroF.show(dch, Math.min(1, 0.26 + 0.12 * pop + 0.5 * e)); a.material.color.set(dec ? PAL.cyan : 0xffb4de).lerp(tmpA.set(0xffffff), e);
      a.scale.setScalar(sc); a.position.set(gx, -1 + sc * 0.25 + Math.sin(t * 0.9) * 0.3 + gy, -52 + gz);
      const b = heroO.show(dch, 0.55); b.scale.setScalar(sc * 1.07); b.position.set(gx + 0.5 + pop * 0.8, -1.2 + sc * 0.25 + gy, -53 + gz);
      const c = heroOP.show(dch, 0.32); c.scale.setScalar(sc * 1.16); c.position.set(gx - 0.7 - pop * 1.0, -0.8 + sc * 0.25 + gy, -54 + gz);
    }
    eyesF.update(t, camera, { opacity: sec.id === 'chorus1' ? 0 : sec.mode === 'pre' ? 0 : sec.mode === 'chorus' ? 0.7 : 0.9, appear: sec.mode === 'pre' ? 0 : smooth(0.05, 0.6, S.p), kick: f.kick });
    cf.update(t, f); bf.update(t, f);
    // 相机
    camera.fov = 60 + f.kick * 2.2 + (sec.mode === 'apex' ? 4 : 0); camera.updateProjectionMatrix();
    camera.position.set(Math.sin(t * 0.33) * 1.6 + sway, 2.4 + Math.sin(t * 0.5) * 0.15 + f.kick * 0.1 + lift, 14 - adv);
    if (fly) {
      const tx = Math.sin(S.lt * 0.25) * 4, ty = lerp(6, sun.position.y, fu) + Math.sin(S.lt * 0.4) * 1.2;
      camera.lookAt(tx, ty, sun.position.z);
    } else {
      camera.lookAt(Math.sin(t * 0.21) * 2, 6.0 + Math.sin(t * 0.17) * 0.7, -80);
    }
    camera.rotation.z += Math.sin(t * 0.4) * 0.025 + fly * Math.sin(S.lt * 0.7) * 0.05;
    const s = post.s; s.bloom = M.bloom + f.kick * 0.2; s.bloomT = 0.8; s.glitch = Math.max(s.glitch, f.hit * M.glitch); s.ab = 0.0028 + f.hit * 0.0025 + f.kick * 0.001; s.warp = 0.05; s.track = 0.25; s.scan = 0.1;
    if (sec.mode === 'apex') s.flash = [f.kick * 0.05, f.kick * 0.012, f.kick * 0.03];
  }
  return { scene, camera, update };
}
