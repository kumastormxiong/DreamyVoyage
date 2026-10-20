// 环绕复制：原场景把内容只摆在正前方（一面墙、一排窗口……）。这里把它们绕着观众所在的竖直轴再复制几份，
// 摆成一圈。复制体与原物体共用几何体和材质，所以原场景的所有动画（透明度、贴图、颜色、着色器参数）自动同步；
// 位置、旋转、缩放、显隐、实例数量由 sync() 每帧从原物体复制过来。原场景代码不需要任何改动。
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);

// 子物体的局部变换、显隐、几何体逐个同步（克隆出来的组结构和原物体一致）
function syncKids(s, c) {
  for (let i = 0; i < s.children.length && i < c.children.length; i++) {
    const a = s.children[i], b = c.children[i];
    b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible;
    if (a.isMesh && b.geometry !== a.geometry) b.geometry = a.geometry;
    if (a.children.length) syncKids(a, b);
  }
}

// srcs 必须是场景的直接子物体（父级为单位变换）。angles：绕竖直轴转过的角度（弧度）
export function orbitClones(scene, srcs, { pivot, angles }) {
  const items = [];
  for (const a of angles) {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, a);
    for (const s of srcs) {
      const c = s.clone();
      if (s.isInstancedMesh) { c.instanceMatrix = s.instanceMatrix; if (s.instanceColor) c.instanceColor = s.instanceColor; }
      c.frustumCulled = false;
      scene.add(c);
      items.push({ s, c, q });
    }
  }
  return {
    items,
    sync() {
      for (const { s, c, q } of items) {
        c.visible = s.visible;
        c.position.copy(s.position).sub(pivot).applyQuaternion(q).add(pivot);
        c.quaternion.copy(q).multiply(s.quaternion);
        c.scale.copy(s.scale);
        c.renderOrder = s.renderOrder;
        if (s.isMesh && c.geometry !== s.geometry) c.geometry = s.geometry;
        if (s.isInstancedMesh) c.count = s.count;
        if (!s.isMesh && s.children.length) syncKids(s, c);   // Mesh 的子物体（立体字替身等）各自同步，不在这里处理
      }
    },
  };
}

// 内容会被原场景整体重建的"格子"（例如 matrix 的五十音格）：原物体是空的 Group，每段歌词换一批子物体。
// pick：从原子物体里挑出要复制的下标（跳过不重要的底板、边框，减少绘制次数）
export function orbitCells(scene, cells, { pivot, angles, pick }) {
  const items = [];
  for (const a of angles) {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, a);
    for (const s of cells) {
      const c = new THREE.Group(); scene.add(c);
      items.push({ s, c, q, key: null, pairs: [] });
    }
  }
  return {
    items,
    sync() {
      for (const it of items) {
        const { s, c, q } = it;
        if (s.children[0] !== it.key) {                         // 原格子换了一批子物体：重建复制体
          it.key = s.children[0] || null;
          while (c.children.length) c.remove(c.children[0]);
          it.pairs = [];
          for (const i of pick) { const o = s.children[i]; if (!o) continue; const k = o.clone(); k.frustumCulled = false; c.add(k); it.pairs.push([o, k]); }
        }
        c.visible = s.visible && it.pairs.length > 0;
        c.position.copy(s.position).sub(pivot).applyQuaternion(q).add(pivot);
        c.quaternion.copy(q).multiply(s.quaternion);
        c.scale.copy(s.scale);
        for (const [o, k] of it.pairs) if (k.geometry !== o.geometry) k.geometry = o.geometry;   // 检索动画每帧换字形
      }
    },
  };
}
