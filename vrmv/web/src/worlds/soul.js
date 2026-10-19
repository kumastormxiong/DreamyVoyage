// 场景 soul（Outro A，200–210 秒）：黑色虚空里，"魂"字随鼓点剧烈震动、红蓝错位；
// 一根锁链从一条开始，慢慢绕着它缠成好几层。这是唯一保留真锁链的地方。
import * as THREE from 'three';
import { PAL, col, JP_FONT, KANJI_FONT, makeChain, makeGrid, makeStars, textMesh, glyphMesh, smooth, lerp, clamp, hash } from '../lib.js';
import { makeCyberField } from '../cyber.js';

const ROUNDS = [200.826, 203.634, 206.18, 208.422];
// 结尾回收：每唱一次"魂（タマシイ）"，タ マ シ イ 四个假名从右上角（五十音表的位置）依次飞来砸出一排，
// 然后加速吸向中心、合体成"魂"字。第一次合体之前魂字不出现（芯片上的魂字 → 拆成假名 → 重新合成魂）
// KOFF：各假名相对该轮起唱的时间（估计值，可微调）；FUSE：开始合体的时间；FUSE_D：合体用时
const TAMA = ['タ', 'マ', 'シ', 'イ'], KOFF = [0, 0.26, 0.52, 0.86], FUSE = 1.45, FUSE_D = 0.3;
const KS = 3.4, KX = [-5.1, -1.7, 1.7, 5.1], KY = 2.6, KZ = 2.5;

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x02000a); scene.fog = new THREE.FogExp2(0x02000a, 0.02);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  scene.add(makeStars(1200, 260, 1.3, 40)); scene.add(new THREE.AmbientLight(0x553355, 0.8));
  const cf = makeCyberField({ n: 16, codes: 6, box: [50, 30, 160], seed: 14 }); scene.add(cf.group);
  const grid = makeGrid({ y: -7, speed: 6, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); grid.material.uniforms.uFog.value = 0.02; scene.add(grid);

  const O = { size: 300, weight: '700', font: '"STKaiti", "华文楷体", "KaiTi", serif' };   // 魂字：楷体毛笔感，替换原字体
  const main = textMesh('魂', 7, { ...O, chrome: true, glow: '#ff4fd8' }, false);
  const cy = textMesh('魂', 7, { ...O, fill: '#3ff6ff' }, true); cy.material.opacity = 0.35; cy.position.z = -0.1;
  const pk = textMesh('魂', 7, { ...O, fill: '#ff2f8f' }, true); pk.material.opacity = 0.35; pk.position.z = -0.2;
  const soul = new THREE.Group(); soul.add(pk, cy, main); soul.position.set(0, 2.6, 0); scene.add(soul);

  const chain = makeChain(300, ctx.env); chain.mesh.frustumCulled = false; chain.mesh.count = 0; scene.add(chain.mesh);

  // タマシイ 四个假名：实心字 + 青色描边 + 红蓝错位副本
  const kana = TAMA.map((ch) => {
    const fi = glyphMesh(ctx.atlasF, ch, 0xffd6ef, 1, 0), ln = glyphMesh(ctx.atlasO, ch, PAL.cyan, 1, 0);
    const rp = glyphMesh(ctx.atlasF, ch, PAL.pink, 1, 0), bc = glyphMesh(ctx.atlasF, ch, PAL.cyan, 1, 0);
    const g = new THREE.Group(); g.add(rp, bc, ln, fi); g.visible = false; scene.add(g);
    return { g, fi, ln, rp, bc };
  });
  const fuseRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffd6ef, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  fuseRing.position.set(0, KY, 1); fuseRing.visible = false; scene.add(fuseRing);
  const WHITE = new THREE.Color(0xffffff);
  function tamashii(t, rounds, t0, fuses) {
    let ri = -1; for (let i = 0; i < rounds.length; i++) if (t >= Math.max(rounds[i], t0)) ri = i;
    const r = ri >= 0 ? rounds[ri] : 0, fzt = ri >= 0 ? clamp((t - (r + FUSE)) / FUSE_D) : 1, fe = fzt * fzt;   // 合体：加速吸向中心
    kana.forEach((K, q) => {
      const a = t - Math.max(r + KOFF[q], t0 + 0.01);
      if (ri < 0 || a < 0 || fzt >= 1) { K.g.visible = false; return; }
      K.g.visible = true;
      const fl = clamp(a / 0.08), fle = 1 - Math.pow(1 - fl, 3);       // 从右上角飞入（0.08 秒）
      const ea = a - 0.08, e = ea >= 0 ? Math.exp(-ea * 26) : 0;        // 落地：从大砸到正常大小
      let x = lerp(12, KX[q], fle), y = lerp(9.5, KY, fle), z = KZ;
      let sc = KS * (ea >= 0 ? 1 + 0.9 * e : 0.35 + 0.65 * fle);
      x = lerp(x, 0, fe); y = lerp(y, KY, fe); z = lerp(z, 0.8, fe); sc *= 1 - 0.8 * fe;
      const sh = 0.25 * e + 0.12 * fzt, s = Math.floor(t * 60) + q * 7;
      K.g.position.set(x + (hash(s) - 0.5) * sh, y + (hash(s + 3) - 0.5) * sh, z);
      const op = 1 - fe, sp = 0.35 * e + 0.25 * fzt;
      K.fi.scale.setScalar(sc); K.rp.scale.setScalar(sc); K.bc.scale.setScalar(sc); K.ln.scale.setScalar(sc * 1.04);
      K.fi.material.opacity = Math.min(1, 0.7 + 0.3 * e) * op; K.fi.material.color.set(0xffd6ef).lerp(WHITE, Math.max(e, fe));
      K.ln.position.set(0.06, -0.06, -0.02); K.ln.material.opacity = 0.55 * op;
      K.rp.position.set(-sp, 0, -0.01); K.bc.position.set(sp, 0, -0.01);
      K.rp.material.opacity = K.bc.material.opacity = 0.5 * clamp(sp / 0.1) * op;
    });
    // 合体完成的瞬间：冲击波环
    let lf = -1; for (const fz of fuses) if (t >= fz) lf = fz;
    const ra = lf >= 0 ? t - lf : 9;
    fuseRing.visible = ra < 0.5;
    if (fuseRing.visible) { fuseRing.scale.setScalar(2 + ra * 18); fuseRing.material.opacity = 0.85 * Math.pow(1 - ra / 0.5, 2); }
  }


  function update({ t, f, sec, post }) {
    const rounds = sec.rounds || ROUNDS, t0 = sec.start;
    const fuses = rounds.map((r) => r + FUSE + FUSE_D);      // 每轮合体完成（魂字闪亮）的时刻
    // 震动冲击：起唱时一次小冲击，合体完成时一次大冲击
    let imp = 0, pop = 0;
    for (const r of rounds) if (t >= r) imp = Math.max(imp, 0.4 * Math.exp(-(t - r) * 3.2));
    for (const fz of fuses) if (t >= fz) { imp = Math.max(imp, Math.exp(-(t - fz) * 3.2)); pop = Math.max(pop, Math.exp(-(t - fz) * 6)); }
    // 魂字显隐：第一次合体前不出现；之后每轮假名在场时变暗，合体完成时闪亮回来
    let soulA = 1;
    if (t < fuses[0]) soulA = 0;
    else for (let i = 1; i < rounds.length; i++) if (t >= rounds[i] && t < fuses[i]) soulA = 1 - 0.75 * smooth(rounds[i], rounds[i] + 0.15, t);
    main.material.opacity = soulA; cy.material.opacity = pk.material.opacity = 0.35 * soulA;
    tamashii(t, rounds, t0, fuses);
    const A = 0.04 + imp * 0.5 + smooth(t0, t0 + 8, t) * 0.1 + f.hit * 0.05;
    const jx = (Math.sin(t * 47.3) + 0.5 * Math.sin(t * 23.7 + 1.1)) * A;
    const jy = (Math.cos(t * 41.1) + 0.5 * Math.sin(t * 29.9)) * A;
    soul.position.set(jx, 2.6 + jy, 0); soul.scale.setScalar(1 + imp * 0.08 + f.kick * 0.03 + pop * 0.3);
    pk.position.x = -0.12 - imp * 0.1; cy.position.x = 0.12 + imp * 0.1;

    // 锁链：202 秒开始从一条线慢慢变成螺旋，圈数逐步增加到约六层
    const prog = smooth(202, 210, t);
    if (t >= 202) {
      const N = lerp(0.6, 6, prog);
      chain.layout((u) => {
        const th = u * Math.PI * 2 * N + t * 0.4;
        const Rr = 6.2 + 0.9 * Math.sin(u * 13 + t * 0.6) + 0.35 * Math.sin(u * 37 - t * 1.1);
        const yy = 2.6 + lerp(-4.6, 4.6, u) + 0.45 * Math.sin(u * 23 + t * 0.8);
        return new THREE.Vector3(Math.cos(th) * Rr, yy, Math.sin(th) * Rr);
      }, { frac: lerp(0.02, 1, prog), scale: 1.0, twist: t * 0.3, samples: 600 });
    } else chain.mesh.count = 0;

    camera.position.set(Math.sin(t * 0.3) * 0.8, 2.2 + Math.sin(t * 0.5) * 0.2, 16 - prog * 1.5);
    camera.lookAt(0, 2.6, 0);
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.5 + imp * 0.5;
    cf.update(t, f);
    const s = post.s; s.glitch = Math.max(s.glitch, 0.12 + imp * 0.5 + f.hit * 0.3); s.ab = 0.004 + imp * 0.012; s.bloom = 0.32 + imp * 0.2 + f.kick * 0.08; s.scan = 0.15; s.track = 0.5; s.bloomT = 0.6;
    s.flash = [pop * 0.15, pop * 0.05, pop * 0.12];   // 合体完成：画面闪一下
  }
  return { scene, camera, update };
}
