// 赛博积木（替代大部分锁链）：
//  makeCableSet   沿路径排布的发光数据包串（参数与 lib.js 的 makeChain 一致，可直接替换）
//  makeCyberField 电路背景：芯片、代码面板、数据线，用来填满空旷的背景
//  makeLyricLayer 挂在镜头上的歌词层：当前唱到的假名（大字）+ 整行小字，任何场景都能用
//  makeFlashCards 闪回卡片：记忆碎片一闪而过
//  makeBlockField 抽象数据方块场：无文字的立方体阵列
import * as THREE from 'three';
import { PAL, KANA, JP_FONT, KANJI_FONT, glyphGeo, makeGlyphBank, glyphMesh, rng, hash, clamp } from './lib.js';

const CODE = ['if (ghost.alive) {', '  sync(chain, 0x7F3A);', '  escape(memory);', '}', 'while (!signal) {', '  reboot(0);', 'ERR: NULL_SOUL', 'hash = 0x9C2F ^ tick;', 'for (i in 0..46) {', '  link(i, i + 1);', '}', 'buf[ptr++] = 0xFF;', 'return NULL;', 'helix.encode(soul, key);', 'dna[i] ^= chain[i];'];

// ---------- 数据包串 ----------
export function makeCableSet(maxN, env, { colors = [PAL.cyan, PAL.pink], intensity = 1.6, pitch = 0.7 } = {}) {
  const geo = new THREE.BoxGeometry(0.3, 0.6, 0.1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), maxN);
  mesh.frustumCulled = false; mesh.count = 0;
  const cols = colors.map((c) => new THREE.Color(c).multiplyScalar(intensity));
  for (let i = 0; i < maxN; i++) mesh.setColorAt(i, cols[i % cols.length]);
  const tmp = { p: new THREE.Vector3(), t: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0), sv: new THREE.Vector3() };
  function layout(fn, { frac = 1, twist = 0, scale = 1, samples = 240 } = {}) {
    const pts = [], cum = [0];
    for (let i = 0; i <= samples; i++) { pts.push(fn(i / samples)); if (i) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); }
    const total = cum[samples] * frac, step = pitch * scale;
    const n = Math.min(maxN, Math.max(0, Math.floor(total / step)));
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (seg < samples - 1 && cum[seg + 1] < s) seg++;
      const f = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      tmp.p.lerpVectors(pts[seg], pts[seg + 1], f);
      tmp.t.subVectors(pts[Math.min(samples, seg + 1)], pts[seg]).normalize();
      tmp.x.crossVectors(tmp.t, tmp.up); if (tmp.x.lengthSq() < 1e-4) tmp.x.set(1, 0, 0); tmp.x.normalize();
      tmp.z.crossVectors(tmp.x, tmp.t).normalize();
      const ang = (i % 2 ? Math.PI / 2 : 0) + twist, c = Math.cos(ang), sn = Math.sin(ang);
      const xx = tmp.x.clone().multiplyScalar(c).addScaledVector(tmp.z, sn);
      const zz = tmp.z.clone().multiplyScalar(c).addScaledVector(tmp.x, -sn);
      tmp.m.makeBasis(xx, tmp.t, zz); tmp.m.setPosition(tmp.p); tmp.m.scale(tmp.sv.set(scale, scale, scale));
      mesh.setMatrixAt(i, tmp.m);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; return n;
  }
  return { mesh, layout, pitch };
}

// ---------- 贴图：芯片 / 代码面板 / 闪回卡 ----------
function chipTexture(v) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const c = S / 2, h = 62;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 6;
  g.strokeRect(c - h, c - h, h * 2, h * 2);
  g.lineWidth = 2; g.beginPath();
  for (let i = 0; i < 9; i++) {
    const o = -48 + i * 12;
    g.moveTo(c - h - 30, c + o); g.lineTo(c - h, c + o); g.moveTo(c + h, c + o); g.lineTo(c + h + 30, c + o);
    g.moveTo(c + o, c - h - 30); g.lineTo(c + o, c - h); g.moveTo(c + o, c + h); g.lineTo(c + o, c + h + 30);
  }
  g.stroke();
  g.font = `900 30px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(['0x7F3A', 'GHOST', 'SYNC', 'DATA'][v % 4], c, c);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function codeTexture(seed) {
  const W = 512, H = 320, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const r = rng(seed * 97 + 3);
  g.font = '22px Consolas, "Courier New", monospace'; g.textBaseline = 'top';
  for (let i = 0; i < 11; i++) {
    g.fillStyle = i % 3 === 0 ? '#ff8fd0' : '#7ff9ff';
    g.globalAlpha = 0.5 + r() * 0.5;
    g.fillText(CODE[Math.floor(r() * CODE.length)], 16 + Math.floor(r() * 4) * 22, 12 + i * 27);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// ---------- 电路背景 ----------
export function makeCyberField({ n = 30, codes = 8, box = [60, 40, 220], colors = [PAL.cyan, PAL.pink, PAL.yellow], seed = 5, cables = 0 } = {}) {
  const r = rng(seed), group = new THREE.Group(), anim = [];
  const ctex = [0, 1, 2, 3, 4].map((i) => codeTexture(seed + i));
  const cw = 15, chh = cw * 320 / 512;
  for (let i = 0; i < codes; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, chh), new THREE.MeshBasicMaterial({ map: ctex[i % 5], transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const base = new THREE.Vector3((r() - 0.5) * box[0] * 2.2, r() * box[1], -box[2] * 0.6 - 30 - r() * box[2] * 0.4);
    m.position.copy(base); group.add(m);
    anim.push({ m, base, ph: r() * 6.28, sp: 0.15 + r() * 0.3, op: 0.4 + r() * 0.3 });
  }
  for (let i = 0; i < cables; i++) {
    const pts = []; let x = (r() - 0.5) * box[0] * 2, y = r() * box[1] - 6, z = -r() * box[2];
    for (let k = 0; k < 6; k++) { pts.push(new THREE.Vector3(x, y, z)); x += (r() - 0.5) * 30; y += (r() - 0.5) * 14; z -= 20 + r() * 30; }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.05 + r() * 0.05, 6, false);
    group.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(1.2), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  }
  function update(t, f) {
    for (const a of anim) {
      const p = a.m.position;
      p.y = a.base.y + Math.sin(t * a.sp + a.ph) * 0.8;
      p.x = a.base.x + Math.sin(t * a.sp * 0.5 + a.ph) * 0.6;
      a.m.material.opacity = Math.min(1, a.op * (0.65 + 0.35 * Math.sin(t * a.sp * 6 + a.ph)) * (1 + f.kick * 0.3));
    }
  }
  return { group, update };
}

// ---------- 数据方块场：无文字的抽象立方体阵列，缓慢升降、闪烁，给背景加一层高科技纹理 ----------
export function makeBlockField({ n = 200, box = [60, 30, 200], colors = [PAL.cyan, PAL.pink, PAL.yellow], seed = 21 } = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), n);
  mesh.frustumCulled = false;
  const r = rng(seed), cells = [];
  for (let i = 0; i < n; i++) {
    const base = new THREE.Vector3((r() - 0.5) * box[0] * 2, r() * box[1] - box[1] * 0.25, -8 - r() * box[2]);
    cells.push({ base, sz: 0.25 + r() * 0.9, ph: r() * 6.28, sp: 0.3 + r() * 0.8 });
    mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]).multiplyScalar(0.9));
  }
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
  function update(t, f) {
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const y = c.base.y + Math.sin(t * c.sp + c.ph) * 0.9 + f.kick * 0.3;
      const flick = 0.5 + 0.5 * Math.sin(t * c.sp * 5 + c.ph);
      const s = c.sz * (0.4 + 0.6 * flick) * (1 + f.hit * 0.2);
      P.set(c.base.x, y, c.base.z); S.set(s, s, s);
      M.compose(P, Q, S); mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

// ---------- 数据流：沿一条路径的发光管道，表面是流动的亮带（无珠子、无红蓝光斑）----------
export function makeDataStream(fn, { segs = 600, radius = 0.12, colors = [0xfff3c4, 0xffd27a] } = {}) {
  const pts = []; for (let i = 0; i < 160; i++) pts.push(fn(i / 159));
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, segs, radius, 8, false);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uGain: { value: 1 }, uA: { value: new THREE.Color(colors[0]) }, uB: { value: new THREE.Color(colors[1]) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform float uT,uGain;uniform vec3 uA,uB;varying vec2 vUv;void main(){float b=fract(vUv.x*70.0-uT*5.0);float pulse=smoothstep(0.0,0.15,b)*(1.0-smoothstep(0.15,0.55,b));float rim=1.0-abs(vUv.y-0.5)*2.0;vec3 c=mix(uA,uB,pulse)*(0.25+pulse*1.8)*(0.35+0.65*rim);gl_FragColor=vec4(c*uGain,1.0);}'
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  function update(t, gain = 1) { mat.uniforms.uT.value = t; mat.uniforms.uGain.value = gain; }
  return { mesh, update };
}

// ---------- 歌词层：已移到 lyrics.js（入场动画 + 五十音表），这里转出，旧的 import 不用改 ----------
export { makeLyricLayer } from './lyrics.js';

// ---------- 闪回卡片 ----------
function drawCard(i) {
  const W = 1024, H = 576, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const r = rng(i * 131 + 7);
  if (i === 0) {                       // 眼睛
    g.strokeStyle = '#ff8fd0'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(W / 2, H / 2, 380, 150, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#7ff9ff'; g.beginPath(); g.arc(W / 2, H / 2, 110, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * 40, H / 2 + Math.sin(a) * 40); g.lineTo(W / 2 + Math.cos(a) * 108, H / 2 + Math.sin(a) * 108); g.stroke(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, H / 2, 26, 0, Math.PI * 2); g.fill();
  } else if (i === 1) {                // 电路网格
    g.strokeStyle = '#3ff6ff'; g.lineWidth = 3;
    for (let k = 0; k < 28; k++) {       // 电路走线：直角折线 + 焊盘
      let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { if (s % 2) x += (r() - 0.5) * 320; else y += (r() - 0.5) * 220; g.lineTo(x, y); }
      g.stroke(); g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#ff2f8f'; g.lineWidth = 8; g.strokeRect(W * 0.3, H * 0.25, W * 0.4, H * 0.5);
  } else if (i === 2) {                // 代码块
    g.font = '40px Consolas, "Courier New", monospace'; g.fillStyle = '#7ff9ff';
    for (let k = 0; k < 12; k++) g.fillText(CODE[Math.floor(r() * CODE.length)], 80 + Math.floor(r() * 3) * 40, 70 + k * 42);
  } else if (i === 3) {                // 假名竖列
    g.font = `900 64px ${JP_FONT}`; g.textAlign = 'center'; g.fillStyle = '#ff9fd2';
    for (let c = 0; c < 14; c++) for (let k = 0; k < 9; k++) g.fillText(KANA[Math.floor(r() * KANA.length)], 40 + c * 72, 60 + k * 64);
  } else if (i === 4) {                // 像素撕裂
    for (let k = 0; k < 260; k++) { g.fillStyle = r() < 0.5 ? '#ff2f8f' : '#3ff6ff'; g.globalAlpha = 0.25 + r() * 0.6; g.fillRect(r() * W, r() * H, 20 + r() * 400, 2 + r() * 12); }
    g.globalAlpha = 1;
  } else if (i === 5) {                // 故障的大字
    g.font = `900 420px ${KANJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff2f8f'; g.fillText('魂', W / 2 - 14, H / 2 + 10);
    g.fillStyle = '#3ff6ff'; g.fillText('魂', W / 2 + 16, H / 2 - 6);
  } else if (i === 6) {                // 终端
    g.font = '44px Consolas, "Courier New", monospace'; g.fillStyle = '#7ff9ff';
    ['> SIGNAL LOST', '> RETRY 0x00', '> MEMORY  ........ OK', '> PATCH   ........ ??', '> _'].forEach((s, k) => g.fillText(s, 100, 160 + k * 60));
  } else if (i === 7) {                // DNA 双螺旋（闪回）
    const pt = (u, ph) => [W / 2 + Math.cos(u * Math.PI * 8 + ph) * (150 + 60 * Math.sin(u * 7)), 30 + u * (H - 60)];
    g.lineWidth = 7;
    [['#ff2f8f', 0], ['#3ff6ff', Math.PI]].forEach(([c, ph]) => {
      g.strokeStyle = c; g.shadowColor = c; g.shadowBlur = 18; g.beginPath();
      for (let k = 0; k <= 400; k++) { const [x, y] = pt(k / 400, ph); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    });
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    for (let k = 0; k < 26; k++) { const u = (k + 0.5) / 26, [x1, y1] = pt(u, 0), [x2, y2] = pt(u, Math.PI); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  } else {                             // 同心环 + 扫描线
    g.strokeStyle = '#ffd84a'; g.lineWidth = 4;
    for (let k = 1; k <= 8; k++) { g.beginPath(); g.arc(W / 2, H / 2, k * 40, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function makeFlashCards(camera, scene, { dist = 4.2, seed = 9, rate = 6 } = {}) {
  if (camera.parent !== scene) scene.add(camera);
  const cards = [0, 1, 2, 3, 4, 5, 6, 7].map(drawCard);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cards[0], transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  mesh.visible = false; camera.add(mesh);
  function update(t, amt) {
    const slot = Math.floor(t * rate);
    const h1 = hash(slot * 1.13 + seed), h2 = hash(slot * 2.71 + seed * 3), h3 = hash(slot * 5.3 + 7);
    const on = h1 < clamp(amt) * 0.6;
    mesh.visible = on;
    if (!on) return;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * camera.aspect;
    mesh.material.map = cards[Math.floor(h2 * cards.length)];
    const sc = 0.6 + h3 * 0.8;
    mesh.scale.set(2 * halfW * sc, 2 * halfH * sc, 1);
    mesh.position.set((h3 - 0.5) * halfW * 0.6, (hash(slot + 9) - 0.5) * halfH * 0.6, -dist);
    mesh.rotation.z = (h3 - 0.5) * 0.2;
    mesh.material.opacity = 0.6 + h1 * 0.4;
  }
  return { mesh, update };
}
