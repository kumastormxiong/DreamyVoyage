// 场景 cpu：超级复杂的 CPU 电路板。两种镜头：
//  - break（71.5–79.4 秒）：镜头绕着板子俯冲旋转；
//  - alt（185–200 秒）：镜头低空向前穿行，左右蜿蜒掠过走线与芯片。
// 信号脉冲沿走线奔跑，扫描光带从板面掠过，中央处理器的引脚随鼓点闪亮，上方悬着一圈旋转的全息环，中央升起锁链双螺旋。
import * as THREE from 'three';
import { PAL, col, glowSprite, rng, smooth, lerp, clamp } from '../lib.js';
import { makeLyricLayer } from '../cyber.js';
import { makeDNA } from '../dna.js';

const HALF = 300, GRID = 1.2;   // 板子范围加大，保证电路铺满整个画面（含上方两角）
const snap = (v) => Math.round(v / GRID) * GRID;
const clampH = (v) => Math.max(-HALF, Math.min(HALF, v));
const dummy = new THREE.Object3D();

function boardTexture() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = '#04150c'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(80,255,170,0.09)'; g.lineWidth = 2;
  for (let i = 0; i <= S; i += S / 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18.1, 18.1);
  return tex;
}

function dieTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = '#0a0e14'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(63,246,255,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.strokeStyle = '#ff2f8f'; g.lineWidth = 8; g.strokeRect(24, 24, S - 48, S - 48);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// cpu2 段芯片上循环闪现的「魂」：英文 GHOST 与各语言的词，后备字体覆盖日文、韩文、阿拉伯文、泰文、印地文等
const WORDS = ['GHOST', '魂', 'タマシイ', '혼', 'Душа', 'Seele', 'âme', 'alma', 'anima', 'روح', 'आत्मा', 'วิญญาณ', 'linh hồn', 'jiwa', 'ψυχή', 'dusza'];
const LABEL_FONT = 'Michroma, "NotoSC9", "Yu Gothic", "Malgun Gothic", "Segoe UI", "Nirmala UI", "Leelawadee UI", "Microsoft YaHei", sans-serif';
// 非英文字符用的字体：字重较轻，避免汉字在镜头贴近时糊成块
const CJK_FONT = '"Microsoft YaHei", "Yu Gothic", "Malgun Gothic", "NotoSC9", "Segoe UI", "Nirmala UI", "Leelawadee UI", sans-serif';
// 芯片中央的 GHOST 字样：单独一层透明贴图，便于闪烁浮现
function labelTexture(text = 'GHOST', S = 512) {
  const k = S / 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const latin = /^[\x00-\x7F]*$/.test(text), font = latin ? LABEL_FONT : CJK_FONT;
  let fs = 92 * k; g.font = `400 ${fs}px ${font}`; if ('letterSpacing' in g) g.letterSpacing = latin ? `${8 * k}px` : '0px';
  while (g.measureText(text).width > 380 * k && fs > 24 * k) { fs -= 4 * k; g.font = `400 ${fs}px ${font}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#3ff6ff'; g.shadowBlur = 18 * k;
  g.fillStyle = '#7ff9ff'; g.fillText(text, S / 2 + 4 * k, S / 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x010a06); scene.fog = new THREE.FogExp2(0x010a06, 0.0018);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
  const R = rng(404);

  // 板子（深绿基材 + 网格纹理）
  const board = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 400, HALF * 2 + 400), new THREE.MeshBasicMaterial({ map: boardTexture(), toneMapped: false }));
  board.rotation.x = -Math.PI / 2; board.position.y = -0.5; scene.add(board);

  // 走线：正交折线（曼哈顿路由）
  const traces = [];
  for (let i = 0; i < 6400; i++) {
    let x = snap((R() - 0.5) * 2 * HALF), z = snap((R() - 0.5) * 2 * HALF);
    const pts = [[x, z]]; let horiz = R() < 0.5;
    const steps = 3 + Math.floor(R() * 7);
    for (let s = 0; s < steps; s++) {
      const len = snap((R() - 0.5) * 36);
      if (horiz) x = clampH(x + len); else z = clampH(z + len);
      pts.push([x, z]); horiz = !horiz;
    }
    traces.push(pts);
  }
  const TR = traces.map((pts) => {
    const segs = []; let total = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const [x0, z0] = pts[j], [x1, z1] = pts[j + 1];
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < 1e-3) continue;
      segs.push({ x0, z0, x1, z1, len, start: total, rotY: Math.abs(x1 - x0) > 1e-3 ? 0 : Math.PI / 2 });
      total += len;
    }
    return { segs, total };
  }).filter((tr) => tr.segs.length);
  const allSegs = TR.flatMap((tr) => tr.segs);

  const traceMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.14), new THREE.MeshBasicMaterial({ toneMapped: false }), allSegs.length);
  allSegs.forEach((s, i) => {
    dummy.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2); dummy.rotation.set(0, s.rotY, 0); dummy.scale.set(s.len, 1, 1); dummy.updateMatrix(); traceMesh.setMatrixAt(i, dummy.matrix);
    const cyan = i % 3 === 0;
    traceMesh.setColorAt(i, new THREE.Color(cyan ? PAL.cyan : 0xd9a441).multiplyScalar(cyan ? 0.55 : 0.85));
  });
  scene.add(traceMesh);

  // 焊盘与过孔
  const padGeo = new THREE.CircleGeometry(0.2, 10); padGeo.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, new THREE.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false }), allSegs.length);
  allSegs.forEach((s, i) => { dummy.position.set(s.x0, 0.05, s.z0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix); });
  scene.add(pads);
  const viaSegs = allSegs.filter((_, i) => i % 3 === 0);
  const viaGeo = new THREE.RingGeometry(0.1, 0.22, 10); viaGeo.rotateX(-Math.PI / 2);
  const vias = new THREE.InstancedMesh(viaGeo, new THREE.MeshBasicMaterial({ color: PAL.cyan, toneMapped: false }), viaSegs.length);
  viaSegs.forEach((s, i) => { dummy.position.set(s.x1, 0.06, s.z1); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); vias.setMatrixAt(i, dummy.matrix); });
  scene.add(vias);

  // 芯片与引脚
  const CHIPS = [];
  for (let i = 0; i < 1000; i++) {
    const cx = snap((R() - 0.5) * 2 * (HALF - 6)), cz = snap((R() - 0.5) * 2 * (HALF - 6));
    if (Math.abs(cx) < 12 && Math.abs(cz) < 12) continue;
    CHIPS.push({ cx, cz, w: 2.4 + Math.floor(R() * 4) * 1.2, d: 1.8 + Math.floor(R() * 3) * 1.2, pins: 4 + Math.floor(R() * 5) * 2 });
  }
  const chipBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshBasicMaterial({ color: 0x0b0f0d, toneMapped: false }), CHIPS.length);
  CHIPS.forEach((c, i) => { dummy.position.set(c.cx, 0.25, c.cz); dummy.rotation.set(0, 0, 0); dummy.scale.set(c.w, 1, c.d); dummy.updateMatrix(); chipBody.setMatrixAt(i, dummy.matrix); });
  scene.add(chipBody);
  const chipPins = [];
  CHIPS.forEach((c) => {
    const half = c.pins / 2;
    for (let j = 0; j < half; j++) {
      const x = c.cx - c.w / 2 + (j + 0.5) * (c.w / half);
      chipPins.push([x, c.cz - c.d / 2 - 0.1]); chipPins.push([x, c.cz + c.d / 2 + 0.1]);
    }
  });
  const pinMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: 0xd9b25a, toneMapped: false }), chipPins.length);
  chipPins.forEach(([x, z], i) => { dummy.position.set(x, 0.1, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pinMesh.setMatrixAt(i, dummy.matrix); });
  scene.add(pinMesh);

  // 电容（银色小圆柱）
  const CAPS = [];
  for (let i = 0; i < 2300; i++) CAPS.push([snap((R() - 0.5) * 2 * (HALF - 3)), snap((R() - 0.5) * 2 * (HALF - 3)), R() < 0.5 ? 0 : Math.PI / 2]);
  const capGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 8); capGeo.rotateZ(Math.PI / 2);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: 0xbfd0d8, toneMapped: false }), CAPS.length);
  CAPS.forEach(([x, z, ry], i) => { dummy.position.set(x, 0.16, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix); });
  scene.add(caps);

  // 中央处理器：封装 + 顶盖（纹理）+ 四圈引脚（随鼓点闪亮）
  const die = new THREE.Group(); scene.add(die);
  const pkg = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 16), new THREE.MeshBasicMaterial({ color: 0x07090c, toneMapped: false })); pkg.position.y = 0.45; die.add(pkg);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 11), new THREE.MeshBasicMaterial({ map: dieTexture(), toneMapped: false })); lid.position.y = 1.02; die.add(lid);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({ map: labelTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  label.rotation.x = -Math.PI / 2; label.position.y = 1.16; label.material.opacity = 0; label.renderOrder = 5; die.add(label);   // 画在螺旋的光晕之后，保证文字可读
  const labelTex = label.material.map;
  const wordTex = WORDS.map((w) => labelTexture(w, 1024));   // cpu2 段循环使用的各语言贴图
  const DP = [];
  for (let s = 0; s < 4; s++) for (let j = 0; j < 24; j++) {
    const u = -7.5 + (j + 0.5) * (15 / 24);
    const onZ = s < 2;
    DP.push({ x: onZ ? u : (s === 2 ? -8.6 : 8.6), z: onZ ? (s === 0 ? -8.6 : 8.6) : u, rotY: onZ ? 0 : Math.PI / 2, ph: j * 0.4 + s * 1.3 });
  }
  const dpMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.12, 0.7), new THREE.MeshBasicMaterial({ color: 0xffd98a, toneMapped: false }), DP.length);
  scene.add(dpMesh);
  const core = glowSprite('63,246,255', 34, 0.3); core.rotation.x = -Math.PI / 2; core.position.set(0, 1.6, 0); scene.add(core);
  // Large diffusion glow that spreads when GHOST emerges (flat, above the chip)
  const burst = glowSprite('127,249,255', 30, 0); burst.rotation.x = -Math.PI / 2; burst.position.set(0, 1.4, 0); scene.add(burst);

  // 上方的全息环（绕处理器旋转）
  const holoG = new THREE.Group(); holoG.position.y = 5.5; scene.add(holoG);
  const holo = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.035, 6, 140), new THREE.MeshBasicMaterial({ color: PAL.cyan, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  holo.rotation.x = -Math.PI / 2; holoG.add(holo);
  const holo2 = new THREE.Mesh(new THREE.TorusGeometry(11, 0.02, 6, 160), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  holo2.rotation.x = -Math.PI / 2; holoG.add(holo2);

  // 中央升起的锁链双螺旋（DNA 式意向）
  const dna = makeDNA(ctx.env, { height: 14, radius: 3.4, turns: 2.5, links: 110, scale: 0.6 }); dna.group.position.set(0, 1.6, 0); scene.add(dna.group);

  // 扫描光带：从板面掠过
  const scan = glowSprite('63,246,255', 120, 0.22); scan.rotation.x = -Math.PI / 2; scan.scale.set(1, 0.1, 1); scan.position.y = 2; scene.add(scan);

  // 信号脉冲：沿走线奔跑
  const P = 1400;
  const pulses = []; for (let i = 0; i < P; i++) pulses.push({ tr: Math.floor(R() * TR.length), ph: R(), sp: 10 + R() * 18 });
  const pulseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), P);
  for (let i = 0; i < P; i++) pulseMesh.setColorAt(i, new THREE.Color(i % 2 ? PAL.cyan : 0xffd98a).multiplyScalar(2.2));
  scene.add(pulseMesh);

  // 歌词层（3:05 之后的脉冲段有歌词时才显示）
  const lyr = makeLyricLayer(ctx, camera, scene, { heroColor: 0xffd6ef, outline: PAL.cyan, heroY: -0.3 });

  function update({ t, f, S, k, post, sec }) {
    const alt = sec && sec.mode === 'alt';
    if (alt) {
      // 低空向前穿行：左右蜿蜒，掠过走线与芯片
      const lt = S.lt;
      const pz = 46 - lt * 2.6, px = Math.sin(lt * 0.6) * 26;
      // 段末（9.5 秒起）：镜头加速俯冲，直接飞向芯片中间的 GHOST 文字，一直飞到场景切换；螺旋在途中收缩消失，避免镜头钻进光晕
      const g = Math.pow(Math.min(1, Math.max(0, (lt - 9.5) / 5.3)), 2);   // 一直飞到场景切换（约 201 秒）
      camera.position.set(lerp(px, 0, g), lerp(14 + Math.sin(lt * 0.4) * 2.5, 2.0, g) + f.kick * 0.4, lerp(pz, 1.0, g));
      camera.lookAt(lerp(px * 0.5 + Math.sin(lt * 0.9) * 4, 0, g), lerp(0, 1.16, g), lerp(pz - 30, 0, g));
      camera.rotation.z += Math.sin(lt * 0.7) * 0.05 * (1 - g);
      dna.group.scale.setScalar(1 + 1.2 * smooth(10.5, 14.8, lt));   // 段末螺旋放大
    } else {
      // 绕板子俯冲旋转
      const e = smooth(0, 1, S.p || 0);
      const ang = t * 0.09, Rr = lerp(46, 26, e), H = lerp(58, 24, e);
      camera.position.set(Math.cos(ang) * Rr, H + Math.sin(t * 0.4) * 0.6 + f.kick * 0.4, Math.sin(ang) * Rr);
      camera.lookAt(Math.cos(ang + 0.6) * 4, 0, Math.sin(ang + 0.6) * 4);
    }
    camera.fov = 55 + f.kick * 2; camera.updateProjectionMatrix();

    for (let i = 0; i < P; i++) {
      const p = pulses[i], tr = TR[p.tr];
      const s = (((p.ph * tr.total + t * p.sp) % tr.total) + tr.total) % tr.total;
      let seg = tr.segs[0];
      for (const sg of tr.segs) { if (s <= sg.start + sg.len) { seg = sg; break; } }
      const u = clamp((s - seg.start) / seg.len, 0, 1);
      dummy.position.set(seg.x0 + (seg.x1 - seg.x0) * u, 0.1, seg.z0 + (seg.z1 - seg.z0) * u); dummy.rotation.set(0, seg.rotY, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      pulseMesh.setMatrixAt(i, dummy.matrix);
    }
    pulseMesh.instanceMatrix.needsUpdate = true;

    DP.forEach((d, i) => {
      const k2 = 1 + f.kick * 1.6 * (0.5 + 0.5 * Math.sin(t * 7 + d.ph));
      dummy.position.set(d.x, 0.2, d.z); dummy.rotation.set(0, d.rotY, 0); dummy.scale.set(1, k2, 1); dummy.updateMatrix(); dpMesh.setMatrixAt(i, dummy.matrix);
    });
    dpMesh.instanceMatrix.needsUpdate = true;
    core.material.opacity = (0.25 + f.kick * 0.25) * (1 - smooth(10.5, 13.0, S.lt || 0));   // 段末镜头贴近芯片时，中心光晕渐隐

    holoG.rotation.y = t * 0.5; holo.material.opacity = 0.5 + f.kick * 0.3; holo2.material.opacity = 0.3 + f.kick * 0.25;
    scan.position.z = ((t * 14) % 150) - 75; scan.material.opacity = 0.18 + f.kick * 0.1; scan.visible = sec.id !== 'cpu';   // 74.5s 段不要扫描光带
    // 74.5s 段只保留电路，不出现锁链双螺旋（cpu2 段保留）
    dna.group.visible = sec.id !== 'cpu';
    dna.update(t, f, smooth(0.12, 0.6, S.p || 0));
    // 芯片中央 GHOST：74.5s 段内闪烁并浮现；其余段保持显示
    const rev = sec.id === 'cpu' ? smooth(0.6, 3.0, S.lt || 0) : 1;
    const rnd = (n) => { const q = Math.sin(n * 127.1 + 311.7) * 43758.5453; return q - Math.floor(q); };
    const on = sec.id === 'cpu' ? (rnd(Math.floor(t * 16)) > 0.35 * (1 - rev) ? 1 : 0.12) : 1;
    const lt0 = S.lt || 0, isC = sec.id === 'cpu' ? 1 : 0;
    const grow = isC * Math.min(1, Math.max(0, (lt0 - 0.5) / 3.0)), shrink = isC * Math.min(1, Math.max(0, (lt0 - 3.5) / 1.1));   // bloom: linear rise from 1:15, slow partial shrink from 1:18 (never fully back)
    const pk = grow * (1 - 0.4 * shrink);
    const dimK = isC * smooth(0.3, 1.2, lt0);   // GHOST stays washed out until the scene ends
    burst.material.opacity = 0.9 * pk; burst.scale.setScalar(0.6 + 2.9 * pk);
    label.material.opacity = rev * on * (1 - 0.92 * dimK);   // glow washes the label out
    label.scale.setScalar(1 + (1 - rev) * 0.06);
    // cpu2 段：芯片上的文字在各语言的「魂」之间快速切换，并且闪烁
    if (sec.id === 'cpu2') {
      // 13.4 秒（约 199.6 秒）起锁定为汉字“魂”，镜头贴近芯片时清晰可见
      const soulLock = (S.lt || 0) >= 13.4;
      label.material.map = wordTex[soulLock ? 1 : Math.floor(t * 2.6) % WORDS.length];
      label.material.opacity = soulLock ? 1 : (rnd(Math.floor(t * 18)) > 0.25 ? 1 : 0.15);
      label.material.color.setScalar(soulLock ? 1 : 2.4);   // 提亮，压过螺旋的光晕；锁定“魂”时用正常亮度，避免文字糊成白块
    } else {
      label.material.color.setScalar(1);
    }
    lyr.update(k, t, f);

    const s = post.s; s.bloom = 0.42 + f.kick * 0.22 + 1.4 * pk; s.glitch = Math.max(s.glitch, f.hit * 0.3); s.ab = 0.002 + f.hit * 0.004; s.scan = 0.1; s.track = 0.2;
  }
  return { scene, camera, update };
}
