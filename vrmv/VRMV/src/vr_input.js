// 输入：VR 手柄（扳机暂停/继续、握把切段、左摇杆移动、右摇杆转向）+ 预览模式（拖动看、WASD 走、空格暂停）。
import * as THREE from 'three';
import { EYE, MOVE_SPEED, SNAP_TURN, PREVIEW_FOV } from './vr_config.js';

export function createInput(renderer, dom, { onToggle, onNext, onPrev }) {
  const user = { offset: new THREE.Vector3(), yaw: 0 };   // 观众自己的位移（世界坐标）与转向，换段时清零
  const look = { yaw: 0, pitch: 0 };                       // 预览模式的视角
  const keys = new Set();
  let snapLatch = false;
  const _d = new THREE.Vector3(), _r = new THREE.Vector3();

  // ---- VR 手柄事件 ----
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    c.addEventListener('connected', (e) => { c.userData.hand = e.data && e.data.handedness; });
    c.addEventListener('selectstart', () => onToggle());
    c.addEventListener('squeezestart', () => (c.userData.hand === 'left' ? onPrev() : onNext()));
  }

  // ---- 预览模式：鼠标 / 触屏拖动看，键盘走 ----
  let drag = null;
  dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return;
    look.yaw -= (e.clientX - drag.x) * 0.004; look.pitch -= (e.clientY - drag.y) * 0.004;
    look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch)); drag = { x: e.clientX, y: e.clientY };
  });
  dom.addEventListener('pointerup', () => { drag = null; });
  addEventListener('keydown', (e) => { if (!e.target.closest || !e.target.closest('input,select')) keys.add(e.code); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // 沿水平方向移动：dir 为面朝方向（世界坐标），fwd/side 为 -1..1
  function move(dir, fwd, side, dt) {
    _d.set(dir.x, 0, dir.z).normalize(); _r.set(-_d.z, 0, _d.x);
    user.offset.addScaledVector(_d, fwd * MOVE_SPEED * dt).addScaledVector(_r, side * MOVE_SPEED * dt);
  }

  return {
    user, look,
    reset() { user.offset.set(0, 0, 0); user.yaw = 0; },
    // 每帧调用（在场景 update 之前）。rigYaw：当前观众平台朝向
    update(dt, rigYaw) {
      const session = renderer.xr.getSession();
      if (session) {
        const head = renderer.xr.getCamera(); head.getWorldDirection(_d);
        const dir = _d.clone();
        for (const src of session.inputSources) {
          const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
          const x = gp.axes[2], y = gp.axes[3];
          if (src.handedness === 'left') {
            if (Math.hypot(x, y) > 0.2) move(dir, -y, x, dt);
          } else if (src.handedness === 'right') {
            if (!snapLatch && Math.abs(x) > 0.7) { user.yaw -= Math.sign(x) * SNAP_TURN; snapLatch = true; }
            if (Math.abs(x) < 0.3) snapLatch = false;
          }
        }
      } else {
        const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
        const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
        if (fwd || side) move(_d.set(0, 0, -1).applyAxisAngle(_r.set(0, 1, 0), rigYaw + look.yaw), fwd, side, dt);
      }
    },
    // 预览模式下设置镜头（VR 模式下镜头姿态由头显决定，不需要这一步）
    applyPreview(cam) {
      cam.position.set(0, EYE, 0);
      cam.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
      cam.fov = PREVIEW_FOV; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    },
  };
}
