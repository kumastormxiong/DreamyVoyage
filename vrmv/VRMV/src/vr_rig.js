// 把原 MV 的一个场景（world）适配成 VR：不改场景代码本身，只在它的 update 前后做转换。
//  · 原场景每帧把"导演镜头"写进 camera.position / quaternion；这里读出来，换算成"观众平台"（rig）的位置和朝向，
//    去掉俯仰、侧倾和抖动，转头交给头显。
//  · 原来挂在镜头上的东西（歌词大字、字条、ヌ、ケ 等）改挂到 hud：跟着观众平台走，不跟着头转，避免粘在眼前。
import * as THREE from 'three';
import { EYE, DEFAULT_MODE, VR_WORLD } from './vr_config.js';

const _f = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3();

export function adaptWorld(name, w) {
  const cam = w.camera;
  const cfg = { ...DEFAULT_MODE, ...(VR_WORLD[name] || {}) };
  const rig = new THREE.Group(); rig.name = 'vrRig';
  const hud = new THREE.Group(); hud.name = 'vrHud'; hud.position.y = EYE;
  for (const c of [...cam.children]) hud.add(c);       // 镜头上的子物体 → hud
  if (cam.parent) cam.parent.remove(cam);
  w.scene.add(rig); rig.add(cam, hud);
  const baseFov = cam.fov, baseAspect = cam.aspect;
  // sPos / sQuat：上一帧的导演镜头。VR 渲染时头显会改写镜头的局部姿态，下一帧 update 前要还原，
  // 否则只改部分分量的场景（例如 endcard 只改 x）会被头部姿态污染
  const st = { secId: null, lastT: -1, anchorYaw: 0, pos: new THREE.Vector3(), sPos: cam.position.clone(), sQuat: cam.quaternion.clone() };

  const center = new THREE.Vector3();
  return {
    name, rig, hud, cfg, center,
    get yaw() { return rig.rotation.y; },
    // 场景 update 之前：平台归零、镜头恢复原设计参数，让原场景脚本照常写入"导演镜头"（此时局部坐标 = 世界坐标）
    begin() {
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      cam.position.copy(st.sPos); cam.quaternion.copy(st.sQuat); rig.updateMatrixWorld(true);
      cam.fov = baseFov; cam.aspect = baseAspect; cam.updateProjectionMatrix();
    },
    // 场景 update 之后：导演镜头 → 观众平台。user = { offset: Vector3（世界坐标）, yaw }
    end(t, S, user) {
      st.sPos.copy(cam.position); st.sQuat.copy(cam.quaternion);
      _p.copy(cam.position);
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const yawScript = Math.atan2(-_f.x, -_f.z);
      const jump = st.secId !== S.sec.id || Math.abs(t - st.lastT) > 0.5;
      if (jump) {
        st.secId = S.sec.id;
        if (cfg.mode === 'fixed') {
          st.pos.fromArray(cfg.eye);
          st.anchorYaw = Math.atan2(-(cfg.look[0] - cfg.eye[0]), -(cfg.look[2] - cfg.eye[2]));
        } else { st.pos.copy(_p); st.anchorYaw = yawScript; }
      } else if (cfg.mode === 'follow') {
        const dt = Math.min(0.1, Math.max(0, t - st.lastT));
        st.pos.lerp(_p, 1 - Math.exp(-dt / cfg.tau));    // 低通：保留慢速移动，滤掉抖动
      }
      st.lastT = t;
      rig.position.copy(st.pos); rig.position.y -= EYE;
      rig.position.add(user.offset);
      center.set(rig.position.x, rig.position.y + EYE, rig.position.z);   // 观众眼睛的世界位置（补丁里放环形背景用）
      const ry = st.anchorYaw + user.yaw;
      rig.rotation.set(0, ry, 0);
      rig.updateMatrixWorld(true);
      return jump;
    },
    // 头部在世界坐标中的水平朝向（用于摇杆移动方向）
    forward(out) { return out.set(0, 0, -1).applyAxisAngle(_o.set(0, 1, 0), rig.rotation.y); },
  };
}
