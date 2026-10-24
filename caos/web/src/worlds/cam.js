// 运镜工具：关键帧样条 + 缓动 + 节拍冲击。全部是 t 的纯函数（可逐帧复现）。
//   const rig = camPath([{ u:0, p:[x,y,z], l:[x,y,z], fov:60, roll:0 }, ...], { ease })
//   rig(u) → { p, l, fov, roll }       u = 0..1（通常 = 段内进度 S.p，或某个镜头内的进度）
//   applyCam(camera, s, { shake, punch })   设置位置/朝向/FOV/滚转；shake = 手持抖动幅度，punch = 冲击变焦（度）
//   shots(list, S, B)  按"第几小节"切换不同的 camPath（硬切）
import * as THREE from 'three';
import { clamp } from '../lib.js';

export const E = {
  lin: (x) => x,
  io: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  out: (x) => 1 - Math.pow(1 - clamp(x), 3),
  in: (x) => Math.pow(clamp(x), 3),
  expo: (x) => { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); },
  inExpo: (x) => { x = clamp(x); return x === 0 ? 0 : Math.pow(2, 10 * x - 10); },
  // 慢—快—慢 但中段更猛（适合"甩"）
  whip: (x) => { x = clamp(x); return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2; }
};

const v = (a) => new THREE.Vector3(...a);
export function camPath(keys, { ease = E.io } = {}) {
  const ks = keys.map((k) => ({ u: k.u, p: v(k.p), l: v(k.l), fov: k.fov ?? 60, roll: k.roll ?? 0 }));
  const P = new THREE.CatmullRomCurve3(ks.map((k) => k.p), false, 'centripetal');
  const L = new THREE.CatmullRomCurve3(ks.map((k) => k.l), false, 'centripetal');
  const n = ks.length - 1;
  return (u0) => {
    const u = ease(clamp(u0));
    let i = 0; while (i < n - 1 && u > ks[i + 1].u) i++;
    const a = ks[i], b = ks[Math.min(n, i + 1)];
    const lu = b.u > a.u ? clamp((u - a.u) / (b.u - a.u)) : 0;
    const su = n ? (i + lu) / n : 0;                 // 样条参数（按关键帧均分）
    return { p: P.getPoint(su), l: L.getPoint(su), fov: a.fov + (b.fov - a.fov) * E.io(lu), roll: a.roll + (b.roll - a.roll) * E.io(lu) };
  };
}

const n1 = (x) => { const i = Math.floor(x), f = x - i, h = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return h(i) * (1 - u) + h(i + 1) * u - 0.5; };
export function applyCam(camera, s, { t = 0, shake = 0, punch = 0, roll = 0 } = {}) {
  camera.position.copy(s.p);
  if (shake) camera.position.add(new THREE.Vector3(n1(t * 7.3), n1(t * 6.1 + 9), n1(t * 5.7 + 3)).multiplyScalar(shake));
  camera.lookAt(s.l);
  camera.rotateZ(s.roll + roll + (shake ? n1(t * 4.1 + 5) * shake * 0.02 : 0));
  camera.fov = Math.max(8, s.fov - punch); camera.updateProjectionMatrix();
}
// 节拍冲击变焦：小节第一拍最强，其余拍弱一些
export const punchAt = (B, k = 1) => (B.bp < 0.5 ? Math.exp(-B.bp * 9) : 0) * (B.beat % 4 === 0 ? 1 : 0.35) * k;
