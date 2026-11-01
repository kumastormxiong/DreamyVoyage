// 菜单面板：一张 1280×960 的 Canvas。VR 里贴在一块平面上用手柄射线点击/拖动滑块；桌面预览里直接作为屏幕浮层。
import * as THREE from 'three';
import { PAL, ENV_DEFS } from './envs.js';
import { PRESETS } from './lights.js';
import { hsColor } from './util.js';
import { LIFE } from './life.js';

export const PW = 1280, PH = 960;
const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif';
const css = (c, k = 1) => { const t = c.clone().multiplyScalar(k); return '#' + t.getHexString(); };
const TABS = ['模型 MODEL', '场景 SCENE', '灯光 LIGHT', '环境 WORLD', '飞行 FLY'];
const PER = 18;   // 菜单里每页缩略图数

export class UI {
  constructor(app) {
    this.app = app; this.tab = 0; this.thumbPage = 0; this.widgets = []; this.dirty = true; this.active = null; this.hover = -1; this.toast = ''; this.toastT = 0;
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
    TABS.forEach((n, i) => btn(206 + i * 195, 22, 185, 64, n, () => { this.tab = i; this.dirty = true; }, { active: this.tab === i, size: 23 }));
    btn(1186, 22, 62, 64, '✕', () => A.toggleUI(false), { size: 30 });
    let y = 116;
    const keepActive = () => { if (this.active) this.active = W.find((x) => x.t === 'sl' && x.label === this.active.label) || this.active; };
    const lb = (x, y, w, h, label, o = {}) => W.push({ t: 'lb', x, y, w, h, label, ...o });
    const st = A.stage;
    if (this.tab === 0) {
      const pages = Math.max(1, Math.ceil(st.count / PER)); this.thumbPage = Math.min(this.thumbPage, pages - 1);
      btn(32, y, 200, 56, '展台 SHOW', () => A.setMode('showcase'), { active: S.mode === 'showcase', size: 26 });
      btn(244, y, 200, 56, '画廊 GALLERY', () => A.setMode('gallery'), { active: S.mode === 'gallery', size: 26 });
      btn(456, y, 232, 56, '♪ 音乐游戏', () => A.openGame?.(), { size: 26, tint: css(PAL.b, 1) });
      if (pages > 1) {
        btn(700, y, 110, 56, '◀', () => { this.thumbPage = (this.thumbPage + pages - 1) % pages; this.dirty = true; });
        btn(822, y, 300, 56, `第 ${this.thumbPage + 1}/${pages} 页 · 共 ${st.count} 个`, null, { noop: true, size: 24 });
        btn(1134, y, 114, 56, '▶', () => { this.thumbPage = (this.thumbPage + 1) % pages; this.dirty = true; });
      } else lb(700, y, 548, 56, `共 ${st.count} 个模型`, { size: 24, color: '#9fb4ff' });
      y += 64; const cw = 192, ch = 160, g = 12.8;
      for (let k = 0; k < PER; k++) {
        const i = this.thumbPage * PER + k; if (i >= st.count) break;
        const c = k % 6, r = Math.floor(k / 6);
        W.push({ t: 'th', x: 32 + c * (cw + g), y: y + r * (ch + 6), w: cw, h: ch, idx: i, fn: () => A.selectModel(i), active: st.index === i && S.mode === 'showcase' });
      }
      y += 3 * (160 + 6) + 4;
      btn(32, y, 290, 56, S.mode === 'gallery' ? '◀ 上一页 PREV' : '◀ 上一个 PREV', () => A.prev(), { size: 26 }); btn(334, y, 290, 56, S.mode === 'gallery' ? '下一页 NEXT ▶' : '下一个 NEXT ▶', () => A.next(), { size: 26 });
      btn(636, y, 290, 56, '自动旋转 SPIN', () => { S.autoRotate = !S.autoRotate; st.autoRotate = S.autoRotate; }, { active: S.autoRotate, size: 26 });
      btn(938, y, 310, 56, '扫描线 SCAN', () => { S.scan = !S.scan; A.applyFx(); }, { active: S.scan, size: 26 });
      y += 64;
      slider(y, '模型大小 SCALE', () => st.tgtScale, (v) => st.setScale(v), 0.02, 80, (v) => '×' + (v < 1 ? v.toFixed(2) : v.toFixed(1)), { log: true }); y += 56;
      slider(y, '自转速度 SPIN SPEED', () => S.rotSpeed, (v) => { S.rotSpeed = v; st.rotSpeed = v; }, 0, 3, (v) => Math.round(v * 57.3) + '°/s');
      { const C = A.controls, fl = C.floaters(), hid = fl.filter((f) => f.hidden).length;       // 空中模型：选中 / 隐藏
        btn(32, 866, 300, 56, `隐藏已选 (${C.sel.size})`, () => C.hideSelected(), { size: 24 });
        btn(344, 866, 300, 56, `全选/取消 空中${fl.length - hid}个`, () => C.selectAllToggle(), { size: 24 });
        btn(656, 866, 300, 56, `恢复隐藏 (${hid})`, () => C.showHidden(), { size: 24 });
        btn(968, 866, 280, 56, '清空空中模型', () => C.clearFloaters(), { size: 24 }); }
    } else if (this.tab === 1) {
      const pages = st.galPages, sel = st.sel;
      lb(32, y, 222, 56, '画廊每页 GALLERY', { size: 24, color: css(PAL.a, 1.5), weight: 800 });
      [3, 6, 12, 18, 24].forEach((n, i) => btn(260 + i * 158, y, 148, 56, n + ' 个', () => A.setGalCount(n), { active: S.galCount === n, size: 26 }));
      y += 68;
      btn(260, y, 230, 56, '◀ 上一页', () => A.galPage(-1), { size: 25 });
      btn(502, y, 330, 56, `第 ${st.galPage + 1}/${pages} 页 · 共 ${st.count} 个`, null, { noop: true, size: 24 });
      btn(844, y, 230, 56, '下一页 ▶', () => A.galPage(1), { size: 25 });
      btn(1086, y, 162, 56, '进入画廊', () => A.setMode('gallery'), { size: 25, active: S.mode === 'gallery' });
      y += 76;
      lb(32, y, 1216, 40, `多模型摆放 PLACE　已摆 ${st.placed.length} / 16　（当前模型 #${st.index + 1}）`, { size: 26, color: css(PAL.a, 1.5), weight: 800 }); y += 46;
      btn(32, y, 300, 58, '＋ 放入场景 ADD', () => A.addHere(), { size: 26 });
      btn(344, y, 300, 58, '摆放模式 AIM', () => { S.placeMode = !S.placeMode; this.say(S.placeMode ? '摆放模式：射线指向地面，扳机放置' : '摆放模式关'); }, { active: S.placeMode, size: 26 });
      btn(656, y, 300, 58, '移除所选 REMOVE', () => A.removeSel(), { size: 25 });
      btn(968, y, 280, 58, '清空 CLEAR', () => A.clearPlaced(), { size: 26 });
      y += 70;
      btn(32, y, 300, 58, '◀ 选上一个', () => { st.cycleSel(-1); this.dirty = true; }, { size: 25 });
      btn(344, y, 300, 58, '选下一个 ▶', () => { st.cycleSel(1); this.dirty = true; }, { size: 25 });
      btn(656, y, 300, 58, S.mainVisible ? '主展台：显示' : '主展台：隐藏', () => A.setMainVisible(!S.mainVisible), { active: S.mainVisible, size: 25 });
      btn(968, y, 280, 58, '场景自转 SPIN', () => { S.spinPlaced = !S.spinPlaced; st.spinPlaced = S.spinPlaced; }, { active: S.spinPlaced, size: 25 });
      y += 68;
      lb(32, y, 1216, 36, '当前选中：' + (sel < 0 ? '主展台模型（#' + (st.curIdx + 1) + '）' : `第 ${sel + 1} 个摆放模型（#${st.placed[sel].idx + 1}）`) + '　— 握把移动 / A·B 缩放 / 滚轮缩放', { size: 24, color: '#e8ecff' }); y += 44;
      slider(y, '放置大小 DROP', () => S.dropScale, (v) => { S.dropScale = v; }, 0.05, 3, (v) => '×' + v.toFixed(2), { log: true }); y += 56;
      slider(y, '所选大小 SCALE', () => st.tgtScale, (v) => st.setScale(v), 0.02, 80, (v) => '×' + (v < 1 ? v.toFixed(2) : v.toFixed(1)), { log: true }); y += 66;
      lb(32, y, 1216, 36, 'MR 透视 PASSTHROUGH', { size: 26, color: css(PAL.a, 1.5), weight: 800 }); y += 42;
      const ar = A.sessionMode === 'ar';
      btn(32, y, 700, 62, ar ? (S.pass ? '透视：开　点击关闭（回到虚拟环境）' : '透视：关　点击开启（显示真实房间）') : (A.sessionMode === 'vr' ? '切换到 MR：退出 VR，再点页面「进入 MR」' : 'MR 只能在 Quest 头显里使用'), () => A.toggleMR(), { active: S.pass, size: 25 });
      lb(750, y, 498, 62, '', { lines: ['开启后背景隐藏，模型摆在真实房间里；', '摆放模式 + 扳机 = 放到射线指向的地面。'], size: 20, color: '#9fb4ff', weight: 500 }); y += 70;
      lb(32, y, 300, 46, '角色动态 LIFE', { size: 26, color: css(PAL.a, 1.5), weight: 800 });
      btn(330, y, 330, 46, LIFE.on ? '呼吸 + 发丝：开' : '呼吸 + 发丝：关（静态）', () => A.setLife({ on: !LIFE.on }), { active: LIFE.on, size: 23 }); y += 54;
      slider(y, '呼吸 BREATH', () => LIFE.breath, (v) => A.setLife({ breath: v }), 0, 2.5, (v) => Math.round(v * 100) + '%'); y += 52;
      slider(y, '发丝/衣摆 HAIR', () => LIFE.hair, (v) => A.setLife({ hair: v }), 0, 2.5, (v) => Math.round(v * 100) + '%');
    } else if (this.tab === 2) {
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
    } else if (this.tab === 3) {
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
      btn(856, y, 392, 60, '飞到画廊中心', () => { A.setMode('gallery'); }, { size: 26 }); y += 70;
      btn(32, y, 400, 60, '♪ 音乐游戏 GAME', () => A.openGame?.(), { size: 26, tint: css(PAL.b, 1) }); y += 74;
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
    if (this.tab === 4) this.drawHelp();
    // 状态栏
    this.txt(A.statusText || '', 36, PH - 22, 22, '#9fb4ff', 'left', 500);
    if (this.toastT > 0) { const w = 520; this.rr(PW / 2 - w / 2, PH - 84, w, 54, 27); c.fillStyle = 'rgba(0,0,0,0.78)'; c.fill(); c.lineWidth = 2; c.strokeStyle = a; c.stroke(); this.txt(this.toast, PW / 2, PH - 57, 27, '#fff', 'center'); }
    this.texture.needsUpdate = true; this.dirty = false;
  }
  drawWidget(w, hov, a, b) {
    const c = this.ctx; if (w.noop) hov = false;
    if (w.t === 'lb') { const L = w.lines || [w.label]; L.forEach((l, i) => this.txt(l, w.x, w.y + (w.h / L.length) * (i + 0.5), w.size || 26, w.color || '#dfe6ff', 'left', w.weight || 600)); return; }
    if (w.t === 'btn' || w.t === 'sw') {
      this.rr(w.x, w.y, w.w, w.h, 16);
      if (w.t === 'sw') { c.fillStyle = w.color; c.fill(); } else { c.fillStyle = w.active ? 'rgba(120,60,255,0.45)' : (hov ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'); c.fill(); }
      if (w.active) { const gg = c.createLinearGradient(w.x, w.y, w.x + w.w, w.y); gg.addColorStop(0, a); gg.addColorStop(1, b); c.strokeStyle = gg; c.lineWidth = 4; } else { c.strokeStyle = hov ? '#ffffff' : 'rgba(255,255,255,0.28)'; c.lineWidth = hov ? 4 : 2; }
      c.stroke();
      if (w.t === 'btn') { this.txt(w.label, w.x + w.w / 2, w.y + w.h / 2 + 1, w.size || 28, '#fff', 'center'); if (w.tint) { c.fillStyle = w.tint; c.fillRect(w.x + 18, w.y + w.h - 9, w.w - 36, 4); } }
    } else if (w.t === 'th') {
      this.rr(w.x, w.y, w.w, w.h, 18); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      if (this.thumbsOk) { c.save(); this.rr(w.x + 3, w.y + 3, w.w - 6, w.h - 6, 15); c.clip(); const col = w.idx % 6, row = Math.floor(w.idx / 6); const iw = this.thumbs.width / 6, ih = iw; if (row * ih + ih <= this.thumbs.height + 1) { const dw = w.w - 6, dh = w.h - 6, sh = iw * dh / dw; c.drawImage(this.thumbs, col * iw, row * ih + (ih - sh) * 0.35, iw, sh, w.x + 3, w.y + 3, dw, dh); } c.restore(); }
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
    const L = [['左摇杆', '沿视线方向 飞行 / 平移'], ['右摇杆 ↔', '转向（快速30° 或 平滑）'], ['右摇杆 ↕', '上升 / 下降'], ['A / B', '放大 / 缩小（按住）；光圈碰着或抓着某个手办时只缩放它'], ['握把', '抓住模型：移动、旋转；双手握把拉开/靠拢 = 巨大化/缩小'],
      ['X / Y', '上一个 / 下一个 模型（画廊里 = 翻页）'], ['右扳机', '点菜单 / 选画廊模型 / 选中摆放的模型；空白处按住 = 加速'], ['光圈碰手办+扳机', '按住扳机抓着翻看；松开留在空中，可从展台拿出多个'], ['光圈碰手办+握把', '握把移动 / 双手握把缩放这个手办；光圈不在手办上时才操作展台'], ['左手 X', '光圈碰着空中手办时：选中 / 取消；菜单「模型」页底部批量隐藏'], ['场景页', '放入多个模型、摆放模式、MR 透视'], ['左摇杆按下', '显示 / 隐藏菜单'], ['右摇杆按下', '重置模型']];
    let y = this.helpY - 20;
    for (const [k, v] of L) { this.txt(k, 40, y, 26, css(PAL.a, 1.5), 'left', 800); this.txt(v, 290, y, 25, '#e8ecff', 'left', 500); y += 37; }
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
