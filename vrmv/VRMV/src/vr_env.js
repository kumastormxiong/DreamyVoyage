// 环形环境：原 MV 的电路背景（代码面板）和数据方块场只铺在正前方，转头什么都没有。
// 这里用原 MV 的同一批生成函数（只读引用，不改动）再造一圈，摆在观众的侧面和身后，原来正前方的那份不动。
//  dome   ：围绕观众站位的圆环（避开正前方一个扇形，那里已经有原背景），随观众平台移动
//  travel ：穿越场景（公路）：两侧的面板/方块固定在世界里，沿行进方向循环，身后保留一段，有真实的视差
import * as THREE from 'three';
import { hash } from '../../web/src/lib.js';
import { makeCyberField, makeBlockField } from '../../web/src/cyber.js';

const wrap = (v, lo, span) => lo + ((((v - lo) % span) + span) % span);
const TAU = Math.PI * 2;

export function makeRingEnv(w, A, o = {}) {
  const {
    mode = 'dome', codes = 8, blocks = 90, seed = 1, colors,
    r = [20, 42],            // dome：半径范围；travel：左右偏移范围
    y = [-6, 16],            // 面板相对眼睛的高度
    by = [-9, 14],           // 方块相对眼睛的高度
    avoid = 0.85,            // dome：避开正前方（-z）的半角（弧度）
    ahead = 110, behind = 70, // travel：前方、身后保留的距离
  } = o;
  const grp = new THREE.Group(); grp.name = 'vrRingEnv'; w.scene.add(grp);

  const cf = makeCyberField({ n: 0, codes, box: [1, 1, 1], seed, cables: 0, ...(colors ? { colors } : {}) });
  const panels = cf.group.children.filter((c) => c.isMesh);
  const bf = blocks ? makeBlockField({ n: blocks, seed: seed + 100, ...(colors ? { colors } : {}) }) : null;
  for (const p of panels) grp.add(p);
  if (bf) grp.add(bf.mesh);

  // 每个物体的固定参数（只和序号有关，帧间一致）
  const place = (i, salt) => {
    const u = (i + 0.15 + hash(i * 3.7 + salt) * 0.7);
    return u;
  };
  const make = (n, salt, yr) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = place(i, salt) / n;
      out.push({
        phi: avoid + (TAU - 2 * avoid) * u,                          // dome：与 -z 的夹角
        rad: r[0] + hash(i * 5.1 + salt + 1) * (r[1] - r[0]),
        yy: yr[0] + hash(i * 7.9 + salt + 2) * (yr[1] - yr[0]),
        side: hash(i * 2.3 + salt + 3) < 0.5 ? -1 : 1,               // travel：左右
        zw: hash(i * 9.7 + salt + 4) * (ahead + behind),             // travel：世界 z 的相位
        ph: hash(i * 4.4 + salt + 5) * TAU, sp: 0.15 + hash(i * 6.6 + salt + 6) * 0.3,
        sz: 0.25 + hash(i * 8.8 + salt + 7) * 0.9, op: 0.4 + hash(i * 1.9 + salt + 8) * 0.3,
      });
    }
    return out;
  };
  const pItems = make(panels.length, 11, y), bItems = bf ? make(blocks, 57, by) : [];
  const C = A.center, spanZ = ahead + behind;
  const pos = (it, out, yOff) => {
    if (mode === 'travel') {
      out.x = C.x + it.side * it.rad;
      out.z = wrap(it.zw + 0 * C.z, C.z - ahead, spanZ);          // 世界固定的相位，窗口跟着观众
    } else {
      out.x = C.x + Math.sin(it.phi) * it.rad;
      out.z = C.z - Math.cos(it.phi) * it.rad;
    }
    out.y = C.y + it.yy + yOff;
    return out;
  };
  const P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), T = new THREE.Vector3();

  return {
    after({ t, f }) {
      for (let i = 0; i < panels.length; i++) {
        const it = pItems[i], m = panels[i];
        pos(it, m.position, Math.sin(t * it.sp + it.ph) * 0.8);
        T.set(mode === 'travel' ? C.x : C.x, m.position.y, mode === 'travel' ? m.position.z : C.z);
        m.lookAt(T);                                                 // 正面朝向观众 / 公路中线
        m.material.opacity = Math.min(1, it.op * (0.65 + 0.35 * Math.sin(t * it.sp * 6 + it.ph)) * (1 + f.kick * 0.3));
      }
      if (bf) {
        for (let i = 0; i < bItems.length; i++) {
          const it = bItems[i];
          pos(it, P, Math.sin(t * (0.3 + it.sp * 2) + it.ph) * 0.9 + f.kick * 0.3);
          const flick = 0.5 + 0.5 * Math.sin(t * it.sp * 8 + it.ph);
          const s = it.sz * (0.4 + 0.6 * flick) * (1 + f.hit * 0.2);
          S.set(s, s, s); M.compose(P, Q, S); bf.mesh.setMatrixAt(i, M);
        }
        bf.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
