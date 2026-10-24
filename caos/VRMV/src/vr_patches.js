// 场景补丁（VR 专用，可选）：不改平面 MV 的场景代码，只在 VR 里补全/替换。
// PATCHES[世界名] = (world, adapter, ctx) => ({ after({ t, S, f, k, cam }) {} })
//   world   = 原场景 { scene, camera, update }      adapter = vr_rig 的平台 { rig, hud, center（观众眼睛世界坐标）, yaw }
// 常见用途（GhostChain 里都用过）：
//   · 只摆在正前方的内容 → 用 vr_ring.js 的 orbitClones(scene, [物体...], { pivot, angles: [π/2, π, -π/2] }) 绕观众复制一圈
//   · 飞过镜头就回收的物体 → 让它飞到身后 30~40 米再回收（最好直接在场景代码里写成这样，平面版看不出区别）
//   · 单平面角色/大字 → 每帧 lookAt(adapter.center) 面向观众
//   · 贴在镜头上的全屏特效（黑场、闪白） → 换成包围观众的球幕：new THREE.Mesh(new THREE.SphereGeometry(30), BackSide 材质) 加到 adapter.rig
//   · 结构对不上时 console.warn 提醒（原场景改版后要同步检查补丁）
import * as THREE from 'three';
import { orbitClones } from './vr_ring.js';

export const PATCHES = {
  // 示例：grid 场景的落日只在前方 → VR 里已经在场景里放了身后的落日，这里不需要补丁。
  // dream(w, A) {
  //   const wins = w.scene.children.filter((o) => o.userData.window);
  //   const ring = orbitClones(w.scene, wins, { pivot: new THREE.Vector3(0, 1.6, 0), angles: [Math.PI / 2, Math.PI, -Math.PI / 2] });
  //   return { after() { ring.sync(); } };
  // },
};
void THREE; void orbitClones;
