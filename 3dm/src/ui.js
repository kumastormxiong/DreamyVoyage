// 菜单面板：一张 1280×960 的 Canvas。VR 里贴在一块平面上用手柄射线点击/拖动滑块；桌面预览里直接作为屏幕浮层。
import * as THREE from 'three';
import { PAL, ENV_DEFS } from './envs.js';
import { PRESETS } from './lights.js';
import { hsColor } from './util.js';

export const PW = 1280, PH = 960;
const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif';
const css = (c, k = 1) => { const t = c.clone().multiplyScalar(k); return '#' + t.getHexString(); };
const TABS = ['模型 MODELS', '灯光 LIGHT', '环境 WORLD', '飞行 FLY'];

export class UI {
  constructor(app) {
    this.app = app; this.tab = 0; this.widgets = []; this.dirty = true; this.active = null; this.hover = -1; this.toast = ''; this.toastT = 0;
    this.canvas = document.createElement('canvas'); this.canvas.width = PW; this.canvas.height = PH; this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthTest: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 999; this.mesh.visible = false; this.mesh.frustumCulled = false;
    this.thumbs = new Image(); this.thumbs.onload = () => { this.thumbsOk = true; this.dirty = true; }; this.thumbs.src = './thumbs.webp';
    // 桌面预览：Canvas 直接做屏幕浮层
    this.dom = this.canvas; this.dom.id = 'uipanel';
    Object.assign(this.dom.style, { position: 'fixed', left: '12px', top: '12px', width: 'min(600px, 48vw)', height: 'auto', aspectRatio: '4 / 3', zIndex: 20, display: 'none', touchAction: 'none', borderRadius: '14px' });
    const ev = (e) => { const r = this.dom.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * PW, (e.clientY - r.top) / r.height * PH]; };
    this.dom.addEventListener('pointerdown', (e) => { this.dom.setPointerCapture(e.pointerId); this.down(...ev(e)); e.stopPropagation(); });
    this.dom.addEventListener('pointermove', (e) => { this.move(...ev(e)); });
    this.dom.addEventListener('pointerup', (e) => { this.up(); });
    this.dom.addEventListener('wheel', (e) => e.stopPropagation());
    document.body.appendChild(this.dom);
  }
  say(s) { this.toast = s; this.toastT = 2.6; this.dirty = true; }
  invalidate() { this.dirty = true; }

  // ---------- 构建控件 ----------
  build() {
    const A = this.app, S = A.st, W = (this.widgets = []);
    const btn = (x, y, w, h, label, fn, o = {}) => W.push({ t: 'btn', x, y, w, h, label, fn, ...o });
    const slider = (y, label, get, set, min, max, fmt, o = {}) => W.push({ t: 'sl', x: 32, y, w: 1216, h: 52, tx: 322, tw: 776, label, get, set, min, max, fmt, ...o });
    const gap = 12;
    // 标签栏
    TABS.forEach((n, i) => btn(250 + i * 214, 22, 204, 64, n, () => { this.tab = i; this.dirty = true; }, { active: this.tab === i, size: 27 }));
    btn(1186, 22, 62, 64, '✕', () => A.toggleUI(false), { size: 30 });
    let y = 116;
    const keepActive = () => { if (this.active) this.active = W.find((x) => x.t === 'sl' && x.label === this.active.label) || this.active; };
    if (this.tab === 0) {
      btn(32, y, 280, 60, '展台 SHOWCASE', () => A.setMode('showcase'), { active: S.mode === 'showcase' });
      btn(324, y, 280, 60, '画廊 GALLERY', () => A.setMode('gallery'), { active: S.mode === 'gallery' });
      y += 72; const cw = 192, ch = 178, g = 12.8;
      for (let i = 0; i < A.stage.count; i++) {
        const c = i % 6, r = Math.floor(i / 6);
        W.push({ t: 'th', x: 32 + c * (cw + g), y: y + r * (ch + 8), w: cw, h: ch, idx: i, fn: () => A.selectModel(i), active: A.stage.index === i && S.mode === 'showcase' });
      }
      y += 3 * (178 + 8) + 4;
      btn(32, y, 290, 60, '◀ 上一个 PREV', () => A.prev()); btn(334, y, 290, 60, '下一个 NEXT ▶', () => A.next());
      btn(636, y, 290, 60, '自动旋转 SPIN', () => { S.autoRotate = !S.autoRotate; A.stage.autoRotate = S.autoRotate; }, { active: S.autoRotate });
      btn(938, y, 310, 60, '扫描线 SCAN', () => { S.scan = !S.scan; A.applyFx(); }, { active: S.scan });
      y += 70;
      slider(y, '模型大小 SCALE', () => A.stage.scale, (v) => A.stage.setScale(v), 0.02, 80, (v) => '×' + (v < 1 ? v.toFixed(2) : v.toFixed(1)), { log: true });
    } else if (this.tab === 1) {
      const L = A.lights.items[S.selLight];
      A.lights.items.forEach((it, i) => btn(32 + i * 305, y, 293, 60, it.zh, () => { S.selLight = i; this.dirty = true; }, { active: S.selLight === i, tint: css(it.color, 1) }));
      y += 74;
      for (let i = 0; i < 17; i++) {
        const c = i < 16 ? hsColor(i / 16, 1) : hsColor(0, 0);
        W.push({ t: 'sw', x: 32 + i * 71.5, y, w: 66, h: 60, color: css(c), fn: () => { A.lights.set(L.id, 'hue', i < 16 ? i / 16 : L.hue); A.lights.set(L.id, 'sat', i < 16 ? 1 : 0); A.touchLight(); }, active: i < 16 ? (L.sat > 0.5 && Math.abs(((L.hue % 1) + 1) % 1 - i / 16) < 0.03) : L.sat < 0.3 });
      }
      y += 72; const sy = 60;
      slider(y, '色相 HUE', () => ((L.hue % 1) + 1) % 1, (v) => { A.lights.set(L.id, 'hue', v); A.touchLight(); }, 0, 1, (v) => Math.round(v * 360) + '°', { rainbow: true }); y += sy;
      slider(y, '饱和 SAT', () => L.sat, (v) => { A.lights.set(L.id, 'sat', v); A.touchLight(); }, 0, 1, (v) => Math.round(v * 100) + '%'); y += sy;
      slider(y, '强度 POWER', () => L.int, (v) => { A.lights.set(L.id, 'int', v); }, 0, L.id === 'amb' ? 3 : 8, (v) => v.toFixed(2)); y += sy;
      if (L.id !== 'amb') {
        slider(y, '方位 AZIMUTH', () => ((L.az + 180) % 360 + 360) % 360 - 180, (v) => { L.az = v; }, -180, 180, (v) => Math.round(v) + '°'); y += sy;
        slider(y, '高度 ELEVATION', () => L.el, (v) => { L.el = v; }, -20, 88, (v) => Math.round(v) + '°'); y += sy;
      } else y += 2 * sy;
      slider(y, '曝光 EXPOSURE', () => S.exposure, (v) => { S.exposure = v; A.renderer.toneMappingExposure = v; }, 0.3, 2.5, (v) => v.toFixed(2)); y += sy;
      slider(y, '边缘光 RIM', () => S.rim, (v) => { S.rim = v; A.applyFx(); }, 0, 4, (v) => v.toFixed(2)); y += sy + 4;
      btn(32, y, 293, 58, '灯光绕转 ORBIT', () => { S.lightAuto = !S.lightAuto; A.lights.auto = S.lightAuto; }, { active: S.lightAuto, size: 25 });
      btn(337, y, 293, 58, '显示光球 ORBS', () => { S.orbs = !S.orbs; A.lights.orbsOn = S.orbs; }, { active: S.orbs, size: 25 });
      btn(642, y, 293, 58, '线框 WIRE', () => { S.wire = !S.wire; A.stage.setWire(S.wire); }, { active: S.wire, size: 25 });
      btn(947, y, 301, 58, '跟随环境 LINK', () => { S.lightFollow = !S.lightFollow; }, { active: S.lightFollow, size: 25 }); y += 70;
      Object.entries(PRESETS).forEach(([k, p], i) => btn(32 + i * 204, y, 196, 58, p.zh, () => { A.lights.apply(k); A.touchLight(); this.say('灯光预设：' + p.zh); }, { active: A.lights.preset === k, size: 25 }));
    } else if (this.tab === 2) {
      ENV_DEFS.forEach((d, i) => W.push({ t: 'env', x: 32 + (i % 4) * 308, y: y + Math.floor(i / 4) * 126, w: 292, h: 114, def: d, fn: () => A.setEnv(i), active: S.envIdx === i }));
      y += 2 * 126 + 10; const sy = 62;
      slider(y, '雾 FOG', () => S.fog, (v) => { S.fog = v; }, 0, 3, (v) => v.toFixed(2)); y += sy;
      slider(y, '霓虹色相 HUE', () => S.hue, (v) => { S.hue = v; PAL.hue = v; A.paletteChanged(); }, -0.5, 0.5, (v) => Math.round(v * 360) + '°', { rainbow: true, onEnd: () => A.rebuildEnvMap() }); y += sy;
      slider(y, '霓虹亮度 GLOW', () => S.glow, (v) => { S.glow = v; A.paletteChanged(); }, 0.2, 2.5, (v) => v.toFixed(2)); y += sy;
      slider(y, '环境反射 IBL', () => S.envInt, (v) => { S.envInt = v; A.scene.environmentIntensity = v; }, 0, 3, (v) => v.toFixed(2)); y += sy;
      slider(y, '雨/粒子 FX', () => S.particles, (v) => { S.particles = v; }, 0, 1, (v) => Math.round(v * 100) + '%'); y += sy;
      slider(y, '音量 VOLUME', () => S.vol, (v) => { S.vol = v; A.music.setVolume(v); }, 0, 1, (v) => Math.round(v * 100) + '%'); y += sy;
      slider(y, '律动 REACT', () => S.react, (v) => { S.react = v; }, 0, 2, (v) => v.toFixed(2)); y += sy + 4;
      btn(32, y, 600, 58, S.music ? '♪ 音乐 开 MUSIC ON' : '♪ 音乐 关 MUSIC OFF', () => A.toggleMusic(), { active: S.music });
      btn(648, y, 600, 58, '重生成反射 REBUILD IBL', () => A.rebuildEnvMap(), { size: 25 });
    } else {
      slider(y, '飞行速度 SPEED', () => S.speed, (v) => { S.speed = v; }, 0.5, 150, (v) => v.toFixed(1) + ' m/s', { log: true }); y += 66;
      btn(32, y, 400, 60, '速度随大小 AUTO-SCALE', () => { S.autoSpeed = !S.autoSpeed; }, { active: S.autoSpeed, size: 25 });
      btn(444, y, 400, 60, S.snap ? '转向：快速30° SNAP' : '转向：平滑 SMOOTH', () => { S.snap = !S.snap; }, { size: 25 });
      btn(856, y, 392, 60, S.invertY ? '升降：反向' : '升降：正常', () => { S.invertY = !S.invertY; }, { size: 25 }); y += 74;
      btn(32, y, 400, 60, '回到原点 HOME', () => A.resetRig(), { size: 26 }); btn(444, y, 400, 60, '重置模型 RESET', () => A.resetStage(), { size: 26 });
      btn(856, y, 392, 60, '飞到画廊中心', () => { A.setMode('gallery'); }, { size: 26 }); y += 84;
      this.helpY = y;
    }
    keepActive();
  }

  // ---------- 绘制 ----------
  rr(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.roundRect(x, y, w, h, r); }
  txt(s, x, y, size, color = '#fff', align = 'left', weight = 600) { const c = this.ctx; c.font = `${weight} ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y); }
  draw() {
    this.build();
    const c = this.ctx, A = this.app, S = A.st, a = css(PAL.a, 1.4), b = css(PAL.b, 1.4);
    c.clearRect(0, 0, PW, PH);
    this.rr(4, 4, PW - 8, PH - 8, 34); c.fillStyle = 'rgba(6,4,22,0.93)'; c.fill();
    const g = c.createLinearGradient(0, 0, PW, PH); g.addColorStop(0, a); g.addColorStop(1, b); c.lineWidth = 5; c.strokeStyle = g; c.shadowColor = a; c.shadowBlur = 18; c.stroke(); c.shadowBlur = 0;
    this.txt('3DM', 40, 46, 42, a, 'left', 800); this.txt('NEON VIEWER', 42, 78, 17, '#9fb4ff', 'left', 600);
    for (let i = 0; i < this.widgets.length; i++) this.drawWidget(this.widgets[i], i === this.hover, a, b);
    if (this.tab === 3) this.drawHelp();
    // 状态栏
    this.txt(A.statusText || '', 36, PH - 22, 22, '#9fb4ff', 'left', 500);
    if (this.toastT > 0) { const w = 520; this.rr(PW / 2 - w / 2, PH - 84, w, 54, 27); c.fillStyle = 'rgba(0,0,0,0.78)'; c.fill(); c.lineWidth = 2; c.strokeStyle = a; c.stroke(); this.txt(this.toast, PW / 2, PH - 57, 27, '#fff', 'center'); }
    this.texture.needsUpdate = true; this.dirty = false;
  }
  drawWidget(w, hov, a, b) {
    const c = this.ctx;
    if (w.t === 'btn' || w.t === 'sw') {
      this.rr(w.x, w.y, w.w, w.h, 16);
      if (w.t === 'sw') { c.fillStyle = w.color; c.fill(); } else { c.fillStyle = w.active ? 'rgba(120,60,255,0.45)' : (hov ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'); c.fill(); }
      if (w.active) { const gg = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y); gg.addColorStop(0, a); gg.addColorStop(1, b); c.strokeStyle = gg; c.lineWidth = 4; } else { c.strokeStyle = hov ? '#ffffff' : 'rgba(255,255,255,0.28)'; c.lineWidth = hov ? 4 : 2; }
      c.stroke();
      if (w.t === 'btn') { this.txt(w.label, w.x + w.w / 2, w.y + w.h / 2 + 1, w.size || 28, '#fff', 'center'); if (w.tint) { c.fillStyle = w.tint; c.fillRect(w.x + 18, w.y + w.h - 9, w.w - 36, 4); } }
    } else if (w.t === 'th') {
      this.rr(w.x, w.y, w.w, w.h, 18); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      if (this.thumbsOk) { c.save(); this.rr(w.x + 3, w.y + 3, w.w - 6, w.h - 6, 15); c.clip(); const col = w.idx % 6, row = Math.floor(w.idx / 6); const iw = this.thumbs.width / 6, ih = this.thumbs.height / 3; c.drawImage(this.thumbs, col * iw, row * ih, iw, ih, w.x + 3, w.y + 3, w.w - 6, w.h - 6); c.restore(); }
      this.rr(w.x, w.y, w.w, w.h, 18);
      if (w.active) { const gg = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h); gg.addColorStop(0, a); gg.addColorStop(1, b); c.strokeStyle = gg; c.lineWidth = 6; } else { c.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.22)'; c.lineWidth = hov ? 5 : 2; }
      c.stroke(); this.txt(String(w.idx + 1).padStart(2, '0'), w.x + 14, w.y + 22, 26, '#fff', 'left', 800);
    } else if (w.t === 'env') {
      const d = w.def;
      this.rr(w.x, w.y, w.w, w.h, 18); const gg = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
      const hx = (n) => '#' + n.toString(16).padStart(6, '0');
      gg.addColorStop(0, hx(d.pal.top)); gg.addColorStop(0.55, hx(d.pal.mid)); gg.addColorStop(1, hx(d.pal.bot)); c.fillStyle = gg; c.fill();
      c.fillStyle = hx(d.pal.a); c.fillRect(w.x + 18, w.y + w.h - 20, 74, 6); c.fillStyle = hx(d.pal.b); c.fillRect(w.x + 98, w.y + w.h - 20, 74, 6); c.fillStyle = hx(d.pal.c); c.fillRect(w.x + 178, w.y + w.h - 20, 74, 6);
      this.rr(w.x, w.y, w.w, w.h, 18);
      if (w.active) { const g2 = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y); g2.addColorStop(0, a); g2.addColorStop(1, b); c.strokeStyle = g2; c.lineWidth = 6; } else { c.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.3)'; c.lineWidth = hov ? 5 : 2; }
      c.stroke(); this.txt(d.zh, w.x + 18, w.y + 36, 34, '#fff', 'left', 800); this.txt(d.en, w.x + 18, w.y + 72, 21, 'rgba(255,255,255,0.8)', 'left', 600);
    } else if (w.t === 'sl') {
      const tx = w.tx, tw = w.tw, ty = w.y + w.h / 2, v = w.get(), t = this.toT(w, v);
      this.txt(w.label, w.x, ty, 27, '#dfe6ff', 'left', 600);
      this.rr(tx, ty - 9, tw, 18, 9);
      if (w.rainbow) { const gr = c.createLinearGradient(tx, 0, tx + tw, 0); for (let i = 0; i <= 12; i++) gr.addColorStop(i / 12, hsColor(i / 12, 1).getStyle()); c.fillStyle = gr; } else c.fillStyle = 'rgba(255,255,255,0.14)';
      c.fill();
      if (!w.rainbow) { this.rr(tx, ty - 9, Math.max(18, tw * t), 18, 9); const gg = c.createLinearGradient(tx, 0, tx + tw, 0); gg.addColorStop(0, a); gg.addColorStop(1, b); c.fillStyle = gg; c.fill(); }
      const kx = tx + tw * t; c.beginPath(); c.arc(kx, ty, this.active === w ? 20 : (hov ? 18 : 15), 0, 7); c.fillStyle = '#fff'; c.shadowColor = a; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0;
      this.txt(w.fmt(v), w.x + w.w, ty, 26, '#fff', 'right', 700);
    }
  }
  drawHelp() {
    const L = [['左摇杆', '沿视线方向 飞行 / 平移'], ['右摇杆 ↔', '转向（快速30° 或 平滑）'], ['右摇杆 ↕', '上升 / 下降'], ['A / B', '模型 放大 / 缩小（按住）'], ['握把', '抓住模型：移动、旋转；双手握把拉开/靠拢 = 巨大化/缩小'],
      ['X / Y', '上一个 / 下一个 模型'], ['右扳机', '点击菜单 / 选画廊模型；空白处按住 = 加速'], ['左摇杆按下', '显示 / 隐藏菜单'], ['右摇杆按下', '重置模型']];
    let y = this.helpY + 6;
    for (const [k, v] of L) { this.txt(k, 40, y, 26, css(PAL.a, 1.5), 'left', 800); this.txt(v, 290, y, 25, '#e8ecff', 'left', 500); y += 46; }
    this.txt('桌面预览：拖动鼠标转视角 · WASD/空格/C 飞行 · Shift 加速 · 滚轮 缩放模型 · Q/E 换模型 · Tab 菜单 · G 画廊', 40, y + 14, 22, '#9fb4ff', 'left', 500);
  }

  // ---------- 交互 ----------
  toT(w, v) { return w.log ? Math.log(v / w.min) / Math.log(w.max / w.min) : (v - w.min) / (w.max - w.min); }
  fromT(w, t) { t = Math.min(1, Math.max(0, t)); return w.log ? w.min * Math.pow(w.max / w.min, t) : w.min + (w.max - w.min) * t; }
  hit(px, py) { for (let i = this.widgets.length - 1; i >= 0; i--) { const w = this.widgets[i]; if (px >= w.x - 6 && px <= w.x + w.w + 6 && py >= w.y - 4 && py <= w.y + w.h + 4) return i; } return -1; }
  move(px, py) {
    if (this.active) { this.drag(px); return this.hover; }
    const h = this.hit(px, py); if (h !== this.hover) { this.hover = h; this.dirty = true; return h; } return h;
  }
  drag(px) { const w = this.active; w.set(this.fromT(w, (px - w.tx) / w.tw)); this.dirty = true; }
  down(px, py) {
    const i = this.hit(px, py); if (i < 0) return false;
    const w = this.widgets[i];
    if (w.t === 'sl') { this.active = w; this.drag(px); } else { w.fn?.(); this.dirty = true; }
    return true;
  }
  up() { if (this.active) { this.active.onEnd?.(); this.active = null; this.dirty = true; } }
  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.dirty = true; }
    if (this.app.st.uiOpen && this.dirty) this.draw();
  }
}
