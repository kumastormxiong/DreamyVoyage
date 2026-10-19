// 场景 matrix：Verse。五十音墙（4 行×10 列，弧形排列），唱到哪个假名哪个点亮，锁链依次穿过已点亮的格子。
import * as THREE from 'three';
import { PAL, col, KANA, makeGrid, makeStars, glyphMesh, glyphGeo, glowSprite, smooth, clamp, rng, hash } from '../lib.js';
import { makeChain } from '../lib.js';

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x04010a); scene.fog = new THREE.FogExp2(0x07010f, 0.012);
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 600);
  scene.add(makeStars(1500, 300, 1.4, 21));

  const ROWS = 4, COLS = 10, R = 17, SPAN = THREE.MathUtils.degToRad(116), CELL = 2.55, ROWH = 3.15, Y0 = 3.4;
  const cells = [];   // 每格：{ g, th, pos, fill, outline }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const th = (c / (COLS - 1) - 0.5) * SPAN, x = Math.sin(th) * R, z = R - Math.cos(th) * R, y = Y0 + (1.5 - r) * ROWH;
    const g = new THREE.Group(); g.position.set(x, y, z - 2); g.rotation.y = -th; scene.add(g);
    cells.push({ g, th, pos: new THREE.Vector3(x, y, z - 2), r, c });
  }
  let builtFor = null;
  const gC = {}, geoC = (ch) => gC[ch] || (gC[ch] = glyphGeo(ctx.atlasF, ch, CELL, CELL));
  function build(flat) {            // 按本段歌词建立格子里的假名
    const key = flat.join(''); if (builtFor === key) return; builtFor = key;
    cells.forEach((cell, i) => {
      while (cell.g.children.length) cell.g.remove(cell.g.children[0]);
      const ch = flat[i]; cell.ch = ch; cell.fill = null; if (!ch || !(ch in ctx.atlasF.idx)) return;
      cell.fill = glyphMesh(ctx.atlasF, ch, PAL.pink, CELL, 0); cell.outline = glyphMesh(ctx.atlasO, ch, PAL.cyan, CELL * 1.02, 0.25);
      cell.back = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92), new THREE.MeshBasicMaterial({ color: 0x0a0218, transparent: true, opacity: 0.55, depthWrite: false }));
      cell.back.position.z = -0.05; cell.edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92)), new THREE.LineBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.35, toneMapped: false }));
      cell.g.add(cell.back, cell.edge, cell.outline, cell.fill);
    });
  }

  // 背景里漂浮的暗淡假名（体积感）
  const R2 = rng(33), dust = [];
  for (let i = 0; i < 110; i++) {
    const m = glyphMesh(ctx.atlasO, KANA[Math.floor(R2() * KANA.length)], R2() < 0.5 ? PAL.cyan : PAL.magenta, 1.2 + R2() * 2.2, 0.08 + R2() * 0.12);
    m.position.set((R2() - 0.5) * 90, R2() * 26 - 2, -30 - R2() * 70); m.userData.s = 0.2 + R2() * 0.5; m.userData.y0 = m.position.y; scene.add(m); dust.push(m);
  }
  const grid = makeGrid({ y: -3.6, speed: 4, scale: 3, colA: PAL.cyan, colB: PAL.magenta }); grid.material.uniforms.uFog.value = 0.02; scene.add(grid);
  const g1 = glowSprite('63,246,255', 120, 0.32); g1.position.set(-30, 6, -60); scene.add(g1);
  const g2 = glowSprite('255,47,143', 140, 0.34); g2.position.set(34, 8, -70); scene.add(g2);
  const chain = makeChain(320, ctx.env); scene.add(chain.mesh);
  // 参考图的
  scene.add(new THREE.AmbientLight(0x442244, 0.7));
  // 墙后方夜空里的一只大眼睛，从 26 秒（全局时间）起睁开
  const eyesF = ctx.makeEyeField([
    { pos: [-2, 22, -50], w: 17, iris: 'red', line: 'pink' }
  ]); scene.add(eyesF.group);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 60), new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(PAL.cyan) }, uO: { value: 0.35 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 uC; uniform float uO; varying vec2 vUv; void main(){ float d = 1.0 - abs(vUv.x - 0.5) * 2.0; float y = 1.0 - abs(vUv.y - 0.5) * 2.0; float a = pow(smoothstep(0.0, 0.85, d), 1.5) * smoothstep(0.0, 0.3, y) * uO; gl_FragColor = vec4(uC, a); }' })); beam.position.z = -6; scene.add(beam);

  function update({ t, f, S, k, post, sec }) {
    const flat = k.flat; build(flat);
    const done = k.n > 0 && t > k.times[k.n - 1] + 1.2;      // 唱完以后保持全部已点亮
    const ci = done ? k.n : k.i;
    cells.forEach((cell, i) => {
      if (!cell.fill) return;
      const age = ci >= 0 ? (t - k.times[i]) : -1;
      const pastLit = i < ci, cur = i === ci;
      const pop = cur ? Math.exp(-age * 7) : 0;
      // "检索"入场（与其他主歌段一致）：刚唱到的格子先闪过几个随机假名，0.09 秒后锁定成正确的字
      const dec = cur && age >= 0 && age < 0.09;
      cell.fill.geometry = geoC(dec ? KANA[Math.floor(hash(Math.floor(t * 50) * 1.7 + i) * KANA.length)] : cell.ch);
      cell.fill.material.opacity = cur ? 1.0 : pastLit ? 0.42 : 0;
      cell.fill.material.color.set(dec ? PAL.cyan : cur ? 0xffd2ee : PAL.cyan);
      cell.outline.material.opacity = cur ? 0.9 : pastLit ? 0.35 : 0.16 + 0.05 * Math.sin(t * 2 + i);
      cell.outline.material.color.set(cur ? PAL.pink : pastLit ? PAL.cyan : 0x6a4a9a);
      cell.g.scale.setScalar(1 + pop * 0.45 + (cur ? f.kick * 0.08 : 0));
      cell.g.position.z = cell.pos.z + (cur ? 1.6 + pop * 1.2 : pastLit ? 0.3 : 0);
      cell.edge.material.opacity = cur ? 1 : pastLit ? 0.5 : 0.22; cell.edge.material.color.set(cur ? PAL.pink : PAL.cyan);
    });
    // 锁链：穿过已点亮格子（含当前）
    const lit = cells.filter((c, i) => c.fill && i <= ci);
    if (lit.length >= 2) {
      const pts = lit.map((c, i) => new THREE.Vector3(c.pos.x, c.pos.y + Math.sin(i * 1.3 + t * 1.2) * 0.35, c.pos.z + 1.2 + (i === ci ? 1.8 : 0.4)));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
      chain.layout((u) => curve.getPoint(u), { frac: 1, scale: 0.78, twist: t * 0.4 });
    } else chain.mesh.count = 0;
    // 相机：沿弧线缓慢环绕，鼓点推一下
    const ang = Math.sin(t * 0.16) * 0.42;
    camera.position.set(Math.sin(ang) * 15.5, 4.2 + Math.sin(t * 0.27) * 0.5, 23 + Math.cos(ang) * 4.2 - f.kick * 0.5 - S.p * 3.0);
    camera.lookAt(Math.sin(ang) * -2, 3.4, -2);
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.5;
    beam.position.x = ((t * 6) % 80) - 40; beam.rotation.z = 0.06;
    // 24 秒起出现并睁开（约 7.5 秒）；眨眼方式与 Break 1（dream 场景）一致，使用 eyes.js 的默认眨眼
    eyesF.update(t, camera, { opacity: 0.9, appear: smooth(24, 31.5, t), kick: f.kick });
    dust.forEach((m, i) => { m.position.y = m.userData.y0 + Math.sin(t * m.userData.s + i) * 1.2; });
    const s = post.s; s.bloom = 0.62 + f.kick * 0.22; s.glitch = Math.max(s.glitch, f.hit * 0.18); s.track = 0.35; s.scan = 0.12; s.ab = 0.0024 + f.hit * 0.0016;
  }
  return { scene, camera, update };
}
