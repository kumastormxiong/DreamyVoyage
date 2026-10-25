// 输入：VR 手柄（扳机暂停/继续、握把切段、左摇杆移动、右摇杆每次转 30°）+ 浏览器预览（拖动看、WASD 走、空格暂停）。
// 观众的位置/朝向放在 rig（相机的父级）上；浏览器预览默认由“自动运镜”接管，一旦拖动或按 WASD 就切回手动。
import * as THREE from 'three';
import { MOVE_SPEED, SNAP_TURN, WALK_RADIUS, EYE } from './config.js';

export function createInput({ renderer, dom, rig, camera, onToggle, onNext, onPrev }) {
  const st = { auto: true, yaw: 0, pitch: 0 };
  const keys = new Set();
  let snapLatch = false, drag = null;
  const _d = new THREE.Vector3(), _p = new THREE.Vector3();

  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    c.addEventListener('connected', (e) => { c.userData.hand = e.data && e.data.handedness; });
    c.addEventListener('selectstart', () => onToggle());
    c.addEventListener('squeezestart', () => (c.userData.hand === 'left' ? onPrev() : onNext()));
  }

  const manual = () => { if (st.auto) { st.auto = false; st.yaw = camera.rotation.y; st.pitch = camera.rotation.x; } };
  dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return;
    manual();
    st.yaw -= (e.clientX - drag.x) * 0.004; st.pitch -= (e.clientY - drag.y) * 0.004;
    st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch)); drag = { x: e.clientX, y: e.clientY };
  });
  dom.addEventListener('pointerup', () => { drag = null; });
  addEventListener('keydown', (e) => { if (!e.target.closest || !e.target.closest('input,select')) keys.add(e.code); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const clamp = () => {
    const r = Math.hypot(rig.position.x, rig.position.z);
    if (r > WALK_RADIUS) { rig.position.x *= WALK_RADIUS / r; rig.position.z *= WALK_RADIUS / r; }
  };
  function move(dir, fwd, side, dt) {
    _d.set(dir.x, 0, dir.z).normalize(); _p.set(-_d.z, 0, _d.x);
    rig.position.addScaledVector(_d, fwd * MOVE_SPEED * dt).addScaledVector(_p, side * MOVE_SPEED * dt);
    clamp();
  }

  return {
    st,
    toggleAuto() { if (st.auto) manual(); else st.auto = true; },
    update(dt) {
      const session = renderer.xr.getSession();
      if (session) {
        const head = renderer.xr.getCamera(); head.getWorldDirection(_d);
        const dir = _d.clone();
        for (const src of session.inputSources) {
          const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
          const x = gp.axes[2], y = gp.axes[3];
          if (src.handedness === 'left') { if (Math.hypot(x, y) > 0.2) move(dir, -y, x, dt); }
          else if (src.handedness === 'right') {
            if (!snapLatch && Math.abs(x) > 0.7) {                       // 绕头部位置转身，不让人“飘”走
              const a = -Math.sign(x) * SNAP_TURN;
              head.getWorldPosition(_p);
              rig.position.sub(_p).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(_p);
              rig.rotation.y += a; snapLatch = true;
            }
            if (Math.abs(x) < 0.3) snapLatch = false;
          }
        }
      } else {
        const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
        const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
        if (fwd || side) {
          manual();
          move(_d.set(0, 0, -1).applyAxisAngle(_p.set(0, 1, 0), st.yaw), fwd, side, dt);
        }
      }
    },
    // 预览模式的相机姿态（手动）
    applyManual(cam) { cam.position.set(0, EYE, 0); cam.rotation.set(st.pitch, st.yaw, 0, 'YXZ'); },
  };
}
