// 导演：给自动运镜编排“万神殿里的镜头”，并给出粒子事件（汇聚/爆散/合成/放大）。
// 所有量只由时间 t 决定（确定性）：拖进度条、重放、截图结果一致。
//
// 镜头坐标系（“歌词墙坐标系”）：原点在大厅中心，fwd 指向本段歌词墙，side 向右，h 为离地高度。
// 歌词墙在 fwd = 3.4 米、高 2.4 米处；镜头位置 p=[side, fwd, h]，看向 tg=[side, fwd, h]。
import * as THREE from 'three';

const RL = 3.4, YT = 2.4;
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const FOV_BASE = 72;
const dollyFov = (d0, d, fov0) => 2 * Math.atan(Math.tan(fov0 * Math.PI / 360) * d0 / d) * 180 / Math.PI;

// 每个镜头：(u: 0..1 镜头内进度, e: 缓动后的 u, t: 绝对时间) → { p, tg, fov, roll }
const SHOTS = {
  push:   (u, e) => ({ p: [0, lerp(-3.4, 0.3, e), lerp(3.4, 2.5, e)], tg: [0, RL, YT], fov: lerp(76, 62, e) }),
  pull:   (u, e) => ({ p: [0, lerp(0.2, -3.8, e), lerp(2.4, 3.8, e)], tg: [0, RL, lerp(YT, YT + 3, e)], fov: lerp(64, 80, e) }),
  truckL: (u, e) => ({ p: [lerp(-3.4, 3.4, e), -1.8, 2.7 + 0.2 * Math.sin(u * 3.14)], tg: [lerp(-1.2, 1.2, e), RL, YT], fov: 66 }),
  truckR: (u, e) => ({ p: [lerp(3.4, -3.4, e), -1.8, 2.7 + 0.2 * Math.sin(u * 3.14)], tg: [lerp(1.2, -1.2, e), RL, YT], fov: 66 }),
  crane:  (u, e) => { const e2 = sm((u - 0.4) / 0.6); return { p: [lerp(-1, 1, e), lerp(-2, -6, e), lerp(2.4, 13, e)], tg: [0, lerp(RL, 0, e2), lerp(YT, 26, e2)], fov: lerp(66, 82, e), roll: 0.12 * Math.sin(u * 3.1) * e2 }; },
  orbitL: (u, e) => { const a = lerp(-0.95, 0.95, e), R = 6.5; return { p: [Math.sin(a) * R, RL - Math.cos(a) * R, lerp(2.7, 4.0, e)], tg: [0, RL, YT], fov: 64 }; },
  orbitR: (u, e) => { const a = lerp(0.95, -0.95, e), R = 6.5; return { p: [Math.sin(a) * R, RL - Math.cos(a) * R, lerp(4.0, 2.7, e)], tg: [0, RL, YT], fov: 64 }; },
  oculus: (u, e) => ({ p: [0.8 * Math.sin(u * 3), 0.6 * Math.cos(u * 3) - 1, lerp(2.6, 6, e)], tg: [7 * Math.cos(u * 2.4 + 1), 7 * Math.sin(u * 2.4 + 1), 28], fov: 86, roll: 0.22 * Math.sin(u * 2.2) }),
  drift:  (u, e, t) => ({ p: [0.7 * Math.sin(t * 0.31), -1.2 + 0.5 * Math.sin(t * 0.23), 2.8 + 0.2 * Math.sin(t * 0.5)], tg: [0.6 * Math.sin(t * 0.2), RL, YT + 0.3 * Math.sin(t * 0.27)], fov: 68 }),
  lowTilt: (u, e) => ({ p: [lerp(-1.4, 1.4, u), -1.0, 1.4], tg: [0, lerp(RL, 0.5, e), lerp(2.0, 22, e)], fov: 82 }),
  flyby:  (u, e) => { const a = lerp(-0.5, 1.0, u), R = 8.5; return { p: [Math.sin(a) * R, -Math.cos(a) * R, lerp(3.6, 6.2, e)], tg: [0, 0.5, lerp(3.5, 8, e)], fov: 70 }; },
  dollyZoom: (u, e) => { const f = lerp(0.5, -5.5, e); return { p: [0, f, 2.7], tg: [0, RL, YT], fov: dollyFov(RL - 0.5, RL - f, 84) }; },
};

// 每个 world 可用的镜头（按段落序号轮换；长段落每 ~4 小节换一个）
const PLAN = {
  void:      ['lowTilt', 'pull', 'crane'],
  matrix:    ['push', 'truckL', 'drift'],
  highway:   ['truckR', 'orbitL', 'push', 'orbitR'],
  hit:       ['dollyZoom', 'flyby'],
  dream:     ['oculus', 'drift', 'orbitR', 'crane'],
  cpu:       ['truckL', 'push', 'orbitL'],
  city:      ['orbitL', 'crane', 'truckR', 'pull'],
  tunnel:    ['push', 'dollyZoom', 'push', 'flyby'],
  wasteland: ['lowTilt', 'drift', 'flyby'],
  outro:     ['crane', 'orbitR', 'pull', 'flyby'],
  dna:       ['crane', 'oculus', 'orbitL'],
  soul:      ['pull', 'crane'],
  flash:     ['dollyZoom', 'flyby'],
  neural:    ['drift', 'orbitL', 'oculus'],
  endcard:   ['pull'],
};

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

export function createDirector(tl, lift) {
  const beat = 60 / (tl.bpm || 120);
  const secEnd = (i) => (i + 1 < tl.sections.length ? tl.sections[i + 1].start : tl.duration);

  return {
    // 返回当前镜头名，便于调试
    shotAt(S0) {
      const sec = S0.sec, dur = secEnd(S0.index) - sec.start;
      const n = Math.max(1, Math.round(dur / (16 * beat)));
      const len = dur / n, sub = Math.min(n - 1, Math.floor(S0.lt / len));
      const list = PLAN[sec.world] || PLAN.void;
      const name = list[(S0.index * 2 + sub) % list.length];
      return { name, u: Math.min(1, (S0.lt - sub * len) / len), sub };
    },
    // 自动运镜：写入相机 position / quaternion / fov / roll；anchorYaw = 本段歌词墙朝向
    apply(camera, t, S0, anchorYaw, kick) {
      const { name, u } = this.shotAt(S0);
      const e = u * u * (3 - 2 * u);
      const sh = SHOTS[name](u, e, t);
      const fw = new THREE.Vector3(-Math.sin(anchorYaw), 0, -Math.cos(anchorYaw));
      const rt = new THREE.Vector3(Math.cos(anchorYaw), 0, -Math.sin(anchorYaw));
      const w = (a, out) => out.set(0, a[2] + lift, 0).addScaledVector(rt, a[0]).addScaledVector(fw, a[1]);
      w(sh.p, _p); w(sh.tg, _t);
      _p.y += 0.02 * kick;
      camera.position.copy(_p);
      _m.lookAt(_p, _t, _up);
      camera.quaternion.setFromRotationMatrix(_m);
      if (sh.roll) camera.rotateZ(sh.roll);
      camera.fov = sh.fov + 1.2 * kick;
      return name;
    },
    // 粒子事件
    events(t, S0, f) {
      const id = S0.sec.id, lt = S0.lt, w = S0.sec.world;
      const ev = { assemble: t < 10 ? sm(t / 10) : 1, shatter: 0, gather: 0, zoom: 0.012 * f.kick };
      if (w === 'hit') ev.shatter = lt < 0.12 ? lt / 0.12 : Math.exp(-(lt - 0.12) * 0.85);
      if (id === 'flash') ev.shatter = (lt < 0.15 ? lt / 0.15 : Math.exp(-(lt - 0.15) * 1.6)) + 0.12 * f.kick;
      if (id === 'soul') ev.gather = sm(lt / 8);
      else if (id === 'flash') ev.gather = Math.exp(-lt * 2.2);
      if (id.startsWith('chorus')) ev.zoom += 0.3 * Math.exp(-lt * 2.2);
      if (id === 'outro') ev.zoom += 0.12 * sm(lt / 10);
      return ev;
    },
  };
}
