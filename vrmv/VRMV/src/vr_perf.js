// VR 帧率保障：
//  1. 自适应注视点渲染：头显里帧率掉到 68fps 以下时，逐步加强注视点渲染（视野边缘降分辨率），恢复后再慢慢减弱
//  2. 画布贴图节流：原 MV 有些画布贴图每帧都重画并上传（例如尾奏的数据雨 1280×720），在头显里很贵。
//     检测到"每帧都在更新"的画布后，VR 里改成隔帧重画、隔帧上传，画面几乎看不出差别
import * as THREE from 'three';

const DRAW_OPS = ['clearRect', 'fillRect', 'fillText', 'strokeText', 'drawImage', 'fill', 'stroke', 'putImageData'];

export function createPerf(renderer) {
  const streams = [];            // 被接管的画布贴图
  let frame = 0, fov = 0.5, base = 0.5, slow = 0, fast = 0, ema = 1 / 72;

  // 接管一个场景里所有画布贴图：记录每帧是否更新，判断是否为"流式"贴图
  function register(scene) {
    const seen = new Set();
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) for (const key of ['map', 'alphaMap']) {
        const tex = m[key];
        if (!tex || !tex.isCanvasTexture || seen.has(tex) || tex.userData.vrStream) continue;
        seen.add(tex);
        const cv = tex.image; if (!cv || !cv.getContext) continue;
        const st = { tex, hit: false, run: 0, open: true };
        tex.userData.vrStream = st;
        Object.defineProperty(tex, 'needsUpdate', {
          configurable: true, get() { return false; },
          set(v) { if (!v) return; st.hit = true; if (st.open) { tex.version++; tex.source.needsUpdate = true; } },
        });
        const g = cv.getContext('2d');
        if (g) for (const op of DRAW_OPS) {
          const orig = g[op]; if (typeof orig !== 'function') continue;
          g[op] = function (...a) { if (st.open) return orig.apply(this, a); };
        }
        streams.push(st);
      }
    });
  }

  return {
    register,
    setBase(f) { base = fov = f; renderer.xr.setFoveation(fov); },
    // 场景 update 之前：决定这一帧流式画布要不要重画
    before(xr) {
      frame++;
      for (const st of streams) st.open = !xr || st.run < 20 || (frame & 1) === 0;
    },
    // 场景 update 之后：统计每张画布是否连续在更新
    after() { for (const st of streams) { st.run = st.hit ? st.run + 1 : 0; st.hit = false; } },
    // 每帧调用：dt 为真实帧间隔
    tick(dt, xr) {
      if (!xr) return;
      ema += (dt - ema) * 0.1;
      if (ema > 1 / 68) { slow += dt; fast = 0; } else if (ema < 1 / 78) { fast += dt; slow = 0; } else { slow = fast = 0; }
      if (slow > 1 && fov < 1) { fov = Math.min(1, fov + 0.15); renderer.xr.setFoveation(fov); slow = 0; }
      if (fast > 4 && fov > base) { fov = Math.max(base, fov - 0.1); renderer.xr.setFoveation(fov); fast = 0; }
    },
    get fps() { return Math.round(1 / ema); },
    get foveation() { return fov; },
  };
}
