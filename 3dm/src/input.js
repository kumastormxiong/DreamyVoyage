// 输入：Quest 手柄（摇杆飞行、A/B 缩放、握把抓取、射线点菜单）+ 桌面（鼠标/键盘）
import * as THREE from 'three';
import { clamp, DEG } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV3 = new THREE.Vector3(), tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const dz = (v, d = 0.14) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export class Controls {
  constructor(app) {
    this.app = app; const { renderer, rig } = app;
    this.hands = { left: null, right: null }; this.prev = { left: [], right: [] }; this.ptr = { left: {}, right: {} };
    this.grabState = null; this.snapCool = 0; this.boost = false;
    this.carry = { left: null, right: null }; this.free = []; this.mods = new Map(); this.hot = null; this.hotSide = { left: null, right: null }; this.sel = new Map(); this.gripRoot = null; this.returning = []; this.zoneHot = { left: false, right: false };   // 手柄「拿起手办」
    this.ray = new THREE.Raycaster(); this.ray.far = 60;
    this.keys = new Set(); this.yaw = 0; this.pitch = 0; this.drag = null;
    this.ctrls = [];
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i);
      rig.add(c, g);
      const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
      laser.visible = false; c.add(laser);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); dot.visible = false; c.add(dot);
      // 手柄外形：发光的小棒（不依赖外部模型库）
      const wand = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.11, 12), new THREE.MeshStandardMaterial({ color: 0x15102a, metalness: 0.8, roughness: 0.3 }));
      body.rotation.x = Math.PI / 2; const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      ringM.position.z = -0.075; wand.add(body, ringM); g.add(wand);
      const rec = { c, g, laser, dot, ring: ringM, side: null };
      c.addEventListener('connected', (e) => { rec.src = e.data; rec.side = e.data.handedness; this.hands[rec.side] = rec; ringM.material.color.set(rec.side === 'left' ? 0x30e8ff : 0xff40d0); laser.material.color.copy(ringM.material.color); dot.material.color.copy(ringM.material.color); });
      c.addEventListener('disconnected', () => { if (rec.side && this.hands[rec.side] === rec) this.hands[rec.side] = null; rec.side = null; });
      this.ctrls.push(rec);
    }
    this.initDesktop();
  }

  // ---------------- 桌面 ----------------
  initDesktop() {
    const A = this.app, el = A.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Tab') { e.preventDefault(); A.toggleUI(); }
      else if (e.code === 'KeyQ') A.prev(); else if (e.code === 'KeyE') A.next();
      else if (e.code === 'KeyG') A.setMode(A.st.mode === 'gallery' ? 'showcase' : 'gallery');
      else if (e.code === 'KeyR') { A.resetStage(); A.resetRig(); }
      else if (/^Digit[1-8]$/.test(e.code)) A.setEnv(+e.code.slice(5) - 1);
      else if (e.code === 'KeyM') A.toggleMusic();
      else if (e.code === 'KeyB') A.openGame?.();
      else if (e.code === 'KeyP') A.addHere();
      else if (e.code === 'Delete' || e.code === 'Backspace') A.removeSel();
      else if (e.code === 'KeyT') { A.stage.cycleSel(1); A.ui.invalidate(); }
      else if (e.code === 'KeyF') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('pointerdown', (e) => { if (A.renderer.xr.isPresenting) return; el.setPointerCapture(e.pointerId); this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; A.userGesture(); });
    el.addEventListener('pointermove', (e) => {
      if (A.renderer.xr.isPresenting) return;
      if (this.drag) { const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy); this.yaw -= dx * 0.0035; this.pitch = clamp(this.pitch - dy * 0.0035, -1.5, 1.5); }
      else if (A.st.mode === 'gallery') this.deskHover(e);
    });
    el.addEventListener('pointerup', (e) => {
      if (A.renderer.xr.isPresenting) return;
      if (this.drag && this.drag.moved < 6 && A.st.mode === 'gallery') { const i = this.deskPick(e); if (i >= 0) A.selectModel(i); }
      else if (this.drag && this.drag.moved < 6 && A.st.mode === 'showcase') {
        this.deskRay(e);
        if (A.st.placeMode) { const pt = this.floorHit(this.ray.ray); if (pt) A.placeAt(pt); }
        else { const h = A.stage.pickItem(this.ray); if (h) { A.stage.select(h.k === 'placed' ? A.stage.placed.indexOf(h.item) : -1); A.ui.invalidate(); } }
      }
      this.drag = null;
    });
    el.addEventListener('wheel', (e) => { if (A.renderer.xr.isPresenting) return; e.preventDefault(); A.stage.setScale(A.stage.tgtScale * Math.exp(-e.deltaY * 0.0012)); A.ui.invalidate(); }, { passive: false });
  }
  deskRay(e) {
    const A = this.app, r = A.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), A.camera);
  }
  floorHit(ray) { const pl = new THREE.Plane(UP, -this.app.floorY()); const p = ray.intersectPlane(pl, new THREE.Vector3()); return p && p.distanceTo(ray.origin) < 40 ? p : null; }
  deskPick(e) { this.deskRay(e); return this.app.stage.pick(this.ray); }
  deskHover(e) { this.app.stage.setHover(this.deskPick(e)); }

  // ---------------- 飞行/转向/缩放（桌面与 VR 共用）----------------
  fly(dt, fx, fy, fz, boost) {
    const A = this.app, st = A.st, cam = A.camera, rig = A.rig;
    cam.getWorldDirection(tmpV);                       // 视线方向（含俯仰）= 飞行方向
    tmpV2.crossVectors(tmpV, UP).setY(0); if (tmpV2.lengthSq() < 1e-6) tmpV2.set(1, 0, 0); tmpV2.normalize();
    const k = st.speed * (st.autoSpeed ? Math.pow(Math.max(1, A.stage.scale), 0.85) : 1) * (boost ? 4 : 1);
    rig.position.addScaledVector(tmpV, fy * k * dt).addScaledVector(tmpV2, fx * k * dt);
    rig.position.y += fz * k * 0.8 * dt;
    rig.position.y = clamp(rig.position.y, A.renderer.xr.isPresenting ? 0 : 0, 1800);
    const h = Math.hypot(rig.position.x, rig.position.z); if (h > 2500) { rig.position.x *= 2500 / h; rig.position.z *= 2500 / h; }
  }
  turn(a) {   // 绕头部所在位置转动整个玩家平台
    const A = this.app, rig = A.rig; A.camera.getWorldPosition(tmpV);
    const dx = rig.position.x - tmpV.x, dzz = rig.position.z - tmpV.z, c = Math.cos(a), s = Math.sin(a);
    rig.position.x = tmpV.x + dx * c + dzz * s; rig.position.z = tmpV.z - dx * s + dzz * c; rig.rotation.y += a;
  }
  scaleBy(f) { this.app.stage.setScale(this.app.stage.tgtScale * f); this.app.ui.invalidate(); }

  update(dt) {
    const A = this.app;
    if (A.renderer.xr.isPresenting) this.updateXR(dt); else this.updateDesktop(dt);
  }
  updateDesktop(dt) {
    const A = this.app, k = this.keys, key = (c) => (k.has(c) ? 1 : 0);
    A.rig.rotation.y = this.yaw; A.camera.rotation.set(this.pitch, 0, 0, 'YXZ'); A.camera.position.set(0, 1.6, 0);
    const fx = key('KeyD') - key('KeyA'), fy = key('KeyW') - key('KeyS'), fz = key('Space') - key('KeyC') - key('ControlLeft');
    if (fx || fy || fz) this.fly(dt, fx, fy, fz, k.has('ShiftLeft') || k.has('ShiftRight'));
    if (k.has('Equal') || k.has('BracketRight')) this.scaleBy(Math.exp(dt * 0.9)); if (k.has('Minus') || k.has('BracketLeft')) this.scaleBy(Math.exp(-dt * 0.9));
    A.stage.setHover(A.st.mode === 'gallery' && this.drag === null ? A.stage.hover : -1);
  }

  // ---------------- Quest 手柄 ----------------
  haptic(side, amp = 0.25, ms = 25) {
    const h = this.hands[side]; const gp = h?.src?.gamepad; if (!gp) return;
    try { (gp.hapticActuators?.[0])?.pulse(amp, ms); } catch (e) { /* 不支持就算了 */ }
  }
  updateXR(dt) {
    const A = this.app, st = A.st, ui = A.ui; A.rig.updateMatrixWorld(true);
    const info = {};
    for (const side of ['left', 'right']) {
      const h = this.hands[side]; if (!h || !h.src.gamepad) { info[side] = null; continue; }
      const gp = h.src.gamepad, b = gp.buttons, ax = gp.axes, prev = this.prev[side];
      const P = (i) => !!b[i]?.pressed, edge = (i) => P(i) && !prev[i];
      info[side] = { P, edge, ax, trig: P(0), grip: P(1) };
      info[side].cur = [0, 1, 2, 3, 4, 5].map((i) => P(i));
    }
    const L = info.left, R = info.right;
    // 菜单/换模型/重置
    const holding = !!(this.carry.left || this.carry.right);
    const lh = this.hotSide.left, lSel = lh && lh.k !== 'main';
    if (L && L.edge(4) && lSel) this.toggleSelect(lh.node);       // 左手光圈碰着空中的手办时，X = 选中 / 取消选中（用来批量隐藏）
    if (L) { if (L.edge(3)) A.toggleUI(); if (!holding && !lSel && L.edge(4)) A.prev(); if (!holding && L.edge(5)) A.next(); }
    if (R) { if (R.edge(3)) { A.resetStage(); } }
    // 飞行 + 转向
    let boost = false;
    if (L) { const x = dz(L.ax[2]), y = dz(L.ax[3]); if (x || y) this.fly(dt, x, -y, 0, this.boost); }
    if (R) {
      const x = dz(R.ax[2]), y = dz(R.ax[3]);
      if (y) this.fly(dt, 0, 0, (st.invertY ? 1 : -1) * y, this.boost);
      this.snapCool -= dt;
      if (st.snap) { if (Math.abs(x) > 0.65 && this.snapCool <= 0) { this.turn(-Math.sign(x) * 30 * DEG); this.snapCool = 0.28; this.haptic('right', 0.2, 15); } else if (Math.abs(x) < 0.3) this.snapCool = 0; }
      else if (x) this.turn(-x * 110 * DEG * dt);
      if (R.P(4) || R.P(5)) {      // A/B：光圈碰到（或正拿着）的模型 → 只放大/缩小这个模型；没碰到任何模型时仍然缩放当前选中的对象
        const f = Math.exp(0.9 * dt * ((R.P(4) ? 1 : 0) - (R.P(5) ? 1 : 0))), t = this.scaleTarget();
        if (t) this.scaleNode(t, f); else this.scaleBy(f);
      }
    }
    // 射线：菜单 / 画廊
    this.boost = false; let anyUiHit = false, hoverSlot = -1;
    const busy = this.updateCarry(info, dt);
    for (const side of ['left', 'right']) {
      const h = this.hands[side], I = info[side], p = this.ptr[side]; if (!h || !I) continue;
      if (busy[side]) { h.laser.visible = false; h.dot.visible = false; this.prev[side] = I.cur || []; continue; }   // 手在底座附近 / 正拿着手办：不发射线、不加速
      h.c.updateMatrixWorld(true); this.ray.ray.origin.setFromMatrixPosition(h.c.matrixWorld); this.ray.ray.direction.set(0, 0, -1).transformDirection(h.c.matrixWorld);
      let len = 2.2, hitUI = false;
      if (st.uiOpen) {
        ui.mesh.updateMatrixWorld(true);
        const hit = this.ray.intersectObject(ui.mesh, false)[0];
        if (hit) { hitUI = true; len = hit.distance; const px = hit.uv.x * 1280, py = (1 - hit.uv.y) * 960; const before = ui.hover; ui.move(px, py); if (ui.hover !== before && ui.hover >= 0) this.haptic(side, 0.12, 10); p.px = px; p.py = py; }
        else if (p.down && ui.active) { // 拖动滑块时射线离开面板：与面板所在平面求交继续跟随
          const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(tmpV.set(0, 0, 1).transformDirection(ui.mesh.matrixWorld), tmpV2.setFromMatrixPosition(ui.mesh.matrixWorld));
          const pt = this.ray.ray.intersectPlane(pl, new THREE.Vector3()); if (pt) { ui.mesh.worldToLocal(pt); ui.move((pt.x / 1.2 + 0.5) * 1280, (0.5 - pt.y / 0.9) * 960); }
        }
      }
      if (hitUI) anyUiHit = true;
      if (!hitUI && A.st.mode === 'gallery') { const i = A.stage.pick(this.ray); if (i >= 0) { hoverSlot = i; const sl = A.stage.slotOf(i); if (sl) len = Math.min(len, this.ray.ray.origin.distanceTo(sl.slot.getWorldPosition(tmpV)) - 0.3); } }
      // 展台模式：射线选中摆放的模型 / 地面落点
      let itemHit = null, floorPt = null;
      if (!hitUI && A.st.mode === 'showcase') {
        itemHit = A.stage.pickItem(this.ray); if (itemHit) len = Math.min(len, itemHit.dist);
        if (st.placeMode) { floorPt = this.floorHit(this.ray.ray); if (floorPt) len = Math.min(len, this.ray.ray.origin.distanceTo(floorPt)); }
      }
      // 扳机
      if (I.edge(0)) {
        if (hitUI) { p.down = ui.down(p.px, p.py); this.haptic(side, 0.35, 30); }
        else if (A.st.mode === 'gallery' && hoverSlot >= 0) { A.selectModel(hoverSlot); this.haptic(side, 0.5, 40); }
        else if (A.st.mode === 'showcase' && st.placeMode && floorPt) { A.placeAt(floorPt); this.haptic(side, 0.5, 40); }
        else if (itemHit) { A.stage.select(itemHit.k === 'placed' ? A.stage.placed.indexOf(itemHit.item) : -1); A.ui.invalidate(); this.haptic(side, 0.3, 25); }
      }
      if (!I.trig && p.down) { ui.up(); p.down = false; }
      if (I.trig && !hitUI && !p.down && !st.placeMode && !itemHit) this.boost = true;
      // 激光显示
      const show = st.uiOpen || A.st.mode === 'gallery' || st.placeMode || A.stage.placed.length > 0;
      h.laser.visible = show; h.dot.visible = show && (hitUI || hoverSlot >= 0 || !!itemHit || !!floorPt);
      h.laser.scale.z = len; h.dot.position.z = -len;
      this.prev[side] = I.cur || [];
    }
    if (hoverSlot >= 0 || A.st.mode === 'gallery') A.stage.setHover(hoverSlot);
    if (!anyUiHit && ui.hover !== -1 && !ui.active) { ui.hover = -1; ui.invalidate(); }
    this.updateGrab(info);
  }

  // ---------------- 扳机拿起手办：手碰到底座 + 按扳机，模型就「卡」在手柄上，随手柄翻转；松开扳机放回展台 ----------
  carryUnits() {      // 可被拿起的手办：展台上的主模型、摆放的模型、以及被松手留在空中的模型
    const s = this.app.stage, u = [], seen = new Set(); if (s.mode !== 'showcase') return u;
    for (const f of this.free) if (f.node.parent && !f.hidden) { u.push({ k: f.k, node: f.node, item: f.item }); seen.add(f.node); }
    if (s.show.visible && s.cur && s.cur.parent === s.holderGroup && !seen.has(s.cur)) u.push({ k: 'main', node: s.cur });
    for (const it of s.placed) if (it.model && it.model.parent === it.inner && !seen.has(it.model)) u.push({ k: 'placed', node: it.model, item: it });
    return u;
  }
  register(node, parent, k, item) { if (!this.mods.has(node)) this.mods.set(node, { parent, k, item, orig: { pos: node.position.clone(), quat: node.quaternion.clone(), scl: node.scale.clone() } }); return this.mods.get(node); }
  grab(side, h, u) {       // 抓住的是光圈碰到的那个点：模型不会跳位置，保持当前相对手柄的姿态，随手柄转
    const A = this.app, node = u.node; let k = u.k;
    const fi = this.free.findIndex((f) => f.node === node); if (fi >= 0) this.free.splice(fi, 1);
    const ri = this.returning.findIndex((r) => r.node === node); if (ri >= 0) this.returning.splice(ri, 1);
    if (k === 'main') { this.mods.delete(node); A.stage.takeCur(); k = 'float'; }     // 从展台拿走：展台立刻补上一份新的，拿走的这份是独立的空中模型
    else if (k === 'placed') this.register(node, node.parent, k, u.item);
    h.c.updateMatrixWorld(true); h.c.attach(node);
    this.carry[side] = { node, parent: null, k, item: u.item };
    this.haptic(side, 0.6, 50); A.ui.say((side === 'left' ? '左手' : '右手') + '抓住手办（松开扳机：留在原地；A/B 放大缩小）');
  }
  release(side) {       // 松开扳机：手办留在空间里当前的位置，不回底座（按右摇杆重置才会回去）
    const c = this.carry[side]; if (!c) return; this.carry[side] = null;
    this.app.scene.attach(c.node); this.free.push({ node: c.node, k: c.k, item: c.item }); this.haptic(side, 0.3, 30);
  }
  dropAll() { this.release('left'); this.release('right'); }
  detachToFloat(u) {     // 握把操作用：把光圈碰到的模型变成独立的空中模型，返回它的节点
    const A = this.app, node = u.node; let k = u.k; if (this.free.some((f) => f.node === node)) return node;
    if (k === 'main') { this.mods.delete(node); A.stage.takeCur(); k = 'float'; } else if (k === 'placed') this.register(node, node.parent, k, u.item);
    A.scene.attach(node); this.free.push({ node, k, item: u.item }); return node;
  }
  // ---- 空中模型的选择 / 隐藏 ----
  floaters() { return this.free.filter((f) => f.node.parent); }
  toggleSelect(node) {
    const A = this.app;
    if (this.sel.has(node)) { const hp = this.sel.get(node); A.scene.remove(hp); hp.geometry.dispose(); this.sel.delete(node); }
    else { const hp = new THREE.Box3Helper(new THREE.Box3(), 0x30f0ff); hp.material.toneMapped = false; A.scene.add(hp); this.sel.set(node, hp); }
    this.haptic('left', 0.3, 25); A.ui.say(`已选中 ${this.sel.size} 个空中模型`); A.ui.invalidate();
  }
  clearSelection() { for (const [, hp] of this.sel) { this.app.scene.remove(hp); hp.geometry.dispose(); } this.sel.clear(); }
  selectAllToggle() {
    const vis = this.floaters().filter((f) => !f.hidden);
    if (this.sel.size >= vis.length && vis.length) this.clearSelection(); else for (const f of vis) if (!this.sel.has(f.node)) this.toggleSelect(f.node);
    this.app.ui.say(`已选中 ${this.sel.size} 个空中模型`); this.app.ui.invalidate();
  }
  hideSelected() {
    let n = 0; for (const f of this.free) if (this.sel.has(f.node)) { f.hidden = true; f.node.visible = false; n++; }
    this.clearSelection(); this.app.ui.say(n ? `已隐藏 ${n} 个空中模型（菜单里可恢复）` : '先用左手光圈碰到空中的手办，按 X 选中'); this.app.ui.invalidate();
  }
  showHidden() { let n = 0; for (const f of this.free) if (f.hidden) { f.hidden = false; n++; } this.app.ui.say(`恢复显示 ${n} 个`); this.app.ui.invalidate(); }
  clearFloaters() {      // 彻底删除所有空中模型
    const A = this.app; this.dropAll(); this.clearSelection();
    for (const f of this.free) { f.node.parent?.remove(f.node); f.node.traverse((n) => { if (n.isMesh) { n.geometry?.dispose(); for (const m of [].concat(n.material)) m.dispose(); } }); }
    this.free = []; A.ui.say('空中模型已清空'); A.ui.invalidate();
  }
  scaleTarget() { for (const side of ['left', 'right']) { const c = this.carry[side]; if (c) return { node: c.node, hand: side, k: c.k, item: c.item, parent: c.parent }; } return this.hot; }
  scaleNode(t, f) {      // 以光圈所在的点为中心放大/缩小
    const h = this.hands[t.hand], node = t.node; if (!h || !node.parent) return;
    const m = this.register(node, t.parent || node.parent, t.k, t.item), base = m.orig.scl.x, cur = node.scale.x, ns = clamp(cur * f, base * 0.1, base * 30), nf = ns / cur; if (Math.abs(nf - 1) < 1e-7) return;
    h.ring.getWorldPosition(tmpV3); node.parent.updateWorldMatrix(true, false); const r = node.parent.worldToLocal(tmpV3);
    node.position.sub(r).multiplyScalar(nf).add(r); node.scale.multiplyScalar(nf);
  }
  restoreNow(node, m) { node.position.copy(m.orig.pos); node.quaternion.copy(m.orig.quat); node.scale.copy(m.orig.scl); }
  returnAll() {         // 重置：所有被拿走 / 缩放过的手办回到各自的底座
    const s = this.app.stage; this.dropAll();
    for (const [node, m] of this.mods) {
      if (m.k === 'float') continue;      // 空中的独立模型没有「底座」，重置不动它
      const gone = m.k === 'placed' ? !s.placed.includes(m.item) : node !== s.cur;
      if (gone) { this.restoreNow(node, m); if (node.parent === this.app.scene) node.parent.remove(node); continue; }
      if (node.parent !== m.parent) m.parent.attach(node);
      this.returning.push({ node, pos: m.orig.pos, quat: m.orig.quat, scl: m.orig.scl });
    }
    this.mods.clear(); this.free = this.free.filter((f) => f.k === 'float');
  }
  updateCarry(info, dt) {
    const A = this.app, busy = { left: false, right: false }, s = A.stage, k = 1 - Math.exp(-dt * 12); this.hot = null;
    for (let i = this.returning.length - 1; i >= 0; i--) {
      const r = this.returning[i]; r.node.position.lerp(r.pos, k); r.node.quaternion.slerp(r.quat, k); r.node.scale.lerp(r.scl, k);
      if (r.node.position.distanceTo(r.pos) < 0.002 && r.node.quaternion.angleTo(r.quat) < 0.01) { r.node.position.copy(r.pos); r.node.quaternion.copy(r.quat); r.node.scale.copy(r.scl); this.returning.splice(i, 1); }
    }
    const carried = (n) => this.carry.left?.node === n || this.carry.right?.node === n;
    for (const [node, m] of [...this.mods]) {   // 对应的模型被换掉 / 删掉了：恢复原样并清理（缓存的模型下次显示时不能带着变形）
      if (carried(node)) continue;
      const stale = m.k === 'placed' ? !s.placed.includes(m.item) : m.k === 'main' ? node !== s.cur : false;
      if (stale) { this.restoreNow(node, m); if (node.parent === A.scene) A.scene.remove(node); this.mods.delete(node); const fi = this.free.findIndex((f) => f.node === node); if (fi >= 0) this.free.splice(fi, 1); }
    }
    for (const f of this.free) f.node.visible = s.mode === 'showcase' && !f.hidden;
    for (const [node, hp] of this.sel) { if (!node.parent) { A.scene.remove(hp); this.sel.delete(node); continue; } hp.box.setFromObject(node); hp.visible = node.visible; }
    this.hotSide = { left: null, right: null };
    const units = this.carryUnits();
    for (const side of ['right', 'left']) {
      const h = this.hands[side], I = info[side], c = this.carry[side];
      if (c) {
        if (c.k === 'placed' && !s.placed.includes(c.item)) { c.node.parent?.remove(c.node); this.carry[side] = null; continue; }
        busy[side] = true;
        if (!h || !I || !I.trig || c.node.parent !== h.c) this.release(side);
        continue;
      }
      if (!h || !I) { this.zoneHot[side] = false; continue; }
      h.ring.getWorldPosition(tmpV); let hit = null;       // 手柄顶端的彩色光圈
      for (const u of units) {
        if (carried(u.node)) continue;
        tmpBox.setFromObject(u.node).expandByScalar(0.04);
        if (tmpBox.containsPoint(tmpV)) { hit = u; break; }
      }
      if (hit && !this.zoneHot[side]) this.haptic(side, 0.2, 20); this.zoneHot[side] = !!hit;
      if (hit) { this.hotSide[side] = hit; busy[side] = true; if (!this.hot) this.hot = { node: hit.node, hand: side, k: hit.k, item: hit.item, parent: hit.node.parent }; if (I.edge(0)) this.grab(side, h, hit); }
    }
    return busy;
  }

  // 握把：单手抓取移动，双手同时握住 = 缩放+旋转（拉开=巨大化）
  updateGrab(info) {
    const A = this.app, stg = A.stage, L = this.hands.left, R = this.hands.right;
    const gl = !!(info.left && info.left.grip && L), gr = !!(info.right && info.right.grip && R);
    if (!gl && !gr) this.gripRoot = null;
    else if (!this.gripRoot || (!this.gripRoot.parent)) {     // 握把开始：光圈碰着某个模型就操作这个模型，否则操作展台
      const u = (gr && this.hotSide.right) || (gl && this.hotSide.left) || null;
      this.gripRoot = u ? this.detachToFloat(u) : stg.target;
    }
    const st = { root: this.gripRoot || stg.target, get scale() { return this.root.scale.x; } };
    const pos = (h, out) => h.g.getWorldPosition(out);
    if (gl && gr) {
      const pl = pos(L, new THREE.Vector3()), pr = pos(R, new THREE.Vector3()), mid = pl.clone().add(pr).multiplyScalar(0.5), d = Math.max(pl.distanceTo(pr), 0.04), yaw = Math.atan2(pr.x - pl.x, pr.z - pl.z);
      if (!this.grabState || this.grabState.k !== 2 || this.grabState.root !== st.root) { this.grabState = { root: st.root, k: 2, mid, d, yaw, pos: st.root.position.clone(), s: st.scale, ry: st.root.rotation.y }; A.ui.say('双手缩放'); }
      else {
        const g = this.grabState; let s = clamp(g.s * (d / g.d), 0.01, 120); const k = s / g.s, dy = yaw - g.yaw;
        const off = g.pos.clone().sub(g.mid).applyAxisAngle(UP, dy).multiplyScalar(k);
        st.root.position.copy(mid).add(off); st.root.rotation.y = g.ry + dy; st.root.scale.setScalar(s);
      }
    } else if (gl || gr) {
      const h = gl ? L : R, p = pos(h, new THREE.Vector3());
      if (!this.grabState || this.grabState.k !== 1 || this.grabState.h !== h || this.grabState.root !== st.root) this.grabState = { root: st.root, k: 1, h, p, pos: st.root.position.clone() };
      else st.root.position.copy(this.grabState.pos).add(p.sub(this.grabState.p));
    } else this.grabState = null;
    if (this.grabState && st.root.position.y < 0) st.root.position.y = 0;   // 模型不会被拽到地面以下
  }
}
