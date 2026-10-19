// 场景 flash（Outro B，210–218 秒）：闪回蒙太奇。记忆碎片一闪而过（闪回卡片），代码雨，碎裂的"魂"字，终端开机。
import * as THREE from 'three';
import { PAL, col, KANA, JP_FONT, KANJI_FONT, makeStars, textMesh, smooth, clamp, hash, rng } from '../lib.js';
import { makeCyberField, makeFlashCards } from '../cyber.js';

const RW = 1280, RH = 720, CW = 18, CH = 20, NC = Math.floor(RW / CW), TAIL = 16;
const TERM_TEXT = '> CHAINEDGHOST.EXE ... OK';

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x0a0014);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  scene.add(makeStars(800, 260, 1.2, 50));

  // 代码雨
  const rcv = document.createElement('canvas'); rcv.width = RW; rcv.height = RH; const rg = rcv.getContext('2d');
  const rtex = new THREE.CanvasTexture(rcv); rtex.colorSpace = THREE.SRGBColorSpace;
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(89.5, 50.4), new THREE.MeshBasicMaterial({ map: rtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  rain.position.z = -40; scene.add(rain);
  function drawRain(t, inten) {
    rg.clearRect(0, 0, RW, RH); rg.font = `700 ${CH - 3}px ${JP_FONT}`; rg.textAlign = 'center'; rg.textBaseline = 'middle';
    for (let c = 0; c < NC; c++) {
      if (hash(c * 1.7) > inten) continue;
      const sp = 0.45 + hash(c * 3.1) * 0.9, head = ((t * sp * 11 + hash(c * 5.3) * (RH + TAIL * CH))) % (RH + TAIL * CH);
      const warm = hash(c * 9.7) > 0.5;
      for (let r = 0; r < TAIL; r++) {
        const y = head - r * CH; if (y < -CH || y > RH + CH) continue;
        const a = Math.pow(1 - r / TAIL, 1.6) * (r === 0 ? 1 : 0.8);
        const ch = KANA[Math.floor(hash(c * 13.1 + r * 7.7 + Math.floor(t * 5 + c % 5) * 1.3) * KANA.length)];
        rg.fillStyle = r === 0 ? `rgba(255,255,255,${a})` : warm ? `rgba(255,70,160,${a * 0.9})` : `rgba(70,240,255,${a * 0.9})`;
        rg.fillText(ch, c * CW + CW / 2, y);
      }
    }
    rtex.needsUpdate = true;
  }

  // 碎裂的魂字（几块错位叠放）
  const R = rng(88), shards = [];
  for (let i = 0; i < 5; i++) {
    const m = textMesh('魂', 4, { size: 220, weight: '900', font: KANJI_FONT, fill: i % 2 ? '#ff2f8f' : '#3ff6ff' }, true);
    m.position.set((R() - 0.5) * 30, (R() - 0.5) * 16, -10 - R() * 14);
    m.userData = { base: m.position.clone(), ph: R() * 6 };
    scene.add(m); shards.push(m);
  }

  const cf = makeCyberField({ n: 22, codes: 8, box: [40, 26, 120], seed: 77 }); scene.add(cf.group);
  const gits = textMesh('GHOST IN THE SHELL', 3.3, { font: '"Michroma", sans-serif', weight: '400', size: 150, fill: '#ffffff', glow: '#ff2f8f', spacing: 26 }, true);
  gits.position.set(0, 0.2, -6); scene.add(gits);
  // 文字底板：压暗背后的代码雨，让 GHOST IN THE SHELL 清晰可读
  const gitsBack = new THREE.Mesh(new THREE.PlaneGeometry(44, 9), new THREE.MeshBasicMaterial({ color: 0x05000c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  gitsBack.position.set(0, 0.2, -6.5); scene.add(gitsBack);
  // 3分34秒（本场景 lt=4.0）起：全屏黑屏 1.5 秒，中间大字 GHOST IN THE SHELL
  const BLK0 = 4.0, BLK1 = 5.5;
  const blk = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  blk.position.set(0, 0, -4); blk.renderOrder = 50; blk.visible = false; scene.add(blk);
  const bigT = textMesh('GHOST IN THE SHELL', 1, { font: '"Michroma", sans-serif', weight: '400', size: 150, fill: '#ffffff', glow: '#3ff6ff', spacing: 26 }, true);
  bigT.scale.setScalar(34 / bigT.userData.tex.aspect); bigT.position.set(0, 0, -3.5);
  bigT.material.depthTest = false; bigT.material.opacity = 0; bigT.renderOrder = 51; bigT.visible = false; scene.add(bigT);
  const fc = makeFlashCards(camera, scene, { dist: 4.2, seed: 9 });

  // 终端
  const tcv = document.createElement('canvas'); tcv.width = 1400; tcv.height = 150; const tg = tcv.getContext('2d');
  const ttex = new THREE.CanvasTexture(tcv); ttex.colorSpace = THREE.SRGBColorSpace;
  const term = new THREE.Mesh(new THREE.PlaneGeometry(23, 2.46), new THREE.MeshBasicMaterial({ map: ttex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  term.position.set(0, -4.6, 0); scene.add(term);
  function drawTerm(lt, t, T0) {
    tg.clearRect(0, 0, 1400, 150);
    const n = Math.floor(clamp((lt - T0) / 3.0) * TERM_TEXT.length), cur = Math.floor(t * 2.5) % 2 === 0 ? '█' : ' ';
    tg.font = '64px PS2P, monospace'; tg.textBaseline = 'middle'; tg.fillStyle = '#3ff6ff'; tg.shadowColor = '#3ff6ff'; tg.shadowBlur = 18;
    tg.fillText(TERM_TEXT.slice(0, n) + cur, 40, 78); ttex.needsUpdate = true;
  }

  function update({ t, f, S, sec, post }) {
    const lt = S.lt, T0 = (sec.term || sec.start + 4.85) - sec.start;
    // 黑屏窗口：淡入 0.06 秒，停留约 1.4 秒，淡出 0.12 秒
    const bA = smooth(BLK0, BLK0 + 0.06, lt) * (1 - smooth(BLK1 - 0.12, BLK1, lt));
    const amt = smooth(0, 1.2, lt) * 0.5 + f.hit * 0.4 + f.kick * 0.25;
    fc.update(t, amt);
    drawRain(t, 0.7 + 0.3 * Math.sin(t * 0.5));
    rain.material.opacity = 0.5 + f.kick * 0.3;
    shards.forEach((m, i) => {
      const u = m.userData, jit = f.hit > 0.5 ? (hash(Math.floor(t * 12) + i) - 0.5) * 0.8 : 0;   // 确定性的抖动（录制与逐帧渲染一致）
      m.position.set(u.base.x + Math.sin(t * 0.9 + u.ph) * 0.6 + jit, u.base.y + Math.cos(t * 0.7 + u.ph) * 0.5, u.base.z);
      m.material.opacity = 0.35 + 0.5 * Math.max(0, Math.sin(t * (6 + i) + u.ph)) + f.kick * 0.2;
      m.rotation.z = Math.sin(t * 0.5 + u.ph) * 0.15;
    });
    cf.update(t, f);
    const gA = smooth(5.0, 5.8, lt) * (1 - smooth(6.8, 7.6, lt)); const flick = 0.55 + 0.45 * Math.sin(t * 23.0 + Math.sin(t * 3.1) * 2.0);
    gits.material.opacity = gA * flick * (0.85 + f.kick * 0.2); gitsBack.material.opacity = gA * 0.72; gits.position.x = (hash(Math.floor(t * 14)) - 0.5) * 0.25 * f.hit;
    blk.visible = bA > 0.001; blk.material.opacity = bA;
    bigT.visible = bA > 0.001; bigT.material.opacity = bA * (0.9 + 0.1 * Math.sin(t * 37.0)); bigT.position.x = (hash(Math.floor(t * 14)) - 0.5) * 0.12 * f.hit;
    term.visible = lt > T0 - 0.3 && bA < 0.001;
    if (term.visible) drawTerm(lt, t, T0);
    camera.position.set(Math.sin(t * 13.1) * 0.1 * (0.3 + f.hit), Math.sin(t * 9.7) * 0.08, 14);
    camera.lookAt(0, 0, 0);
    camera.fov = 60 + f.kick * 4; camera.updateProjectionMatrix();
    const s = post.s; s.bloom = 0.55 + f.kick * 0.2; s.glitch = Math.max(s.glitch, 0.12 + f.hit * 0.35); s.ab = 0.006 + f.hit * 0.01; s.scan = 0.2; s.track = 0.5;
    s.flash = [amt * 0.02 * (1 - bA), 0, amt * 0.02 * (1 - bA)];
  }
  return { scene, camera, update };
}
