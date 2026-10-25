// 模型精简：只保留“体积大、不透明度高”的高斯点（最能撑起大厅轮廓的那批），并把保留的点略微放大补洞。
// 用于标准 / 省电画质（Quest 2/3）：点数从 400 万降到几十万，排序和绘制开销按比例下降，也不需要构建 LoD。
import { PackedSplats } from '@sparkjsdev/spark';

export function decimate(srcMesh, keep, grow) {
  const ps = srcMesh.packedSplats, n = ps.numSplats;
  if (!n || n <= keep) return { packed: ps, kept: n, total: n };
  const lgv = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  ps.forEachSplat((i, c, s, q, o) => {
    const lg = Math.log2(Math.max(1e-12, s.x * s.y * s.z) * Math.max(0.03, o));      // 体积 × 不透明度
    lgv[i] = lg; if (lg < lo) lo = lg; if (lg > hi) hi = lg;
  });
  lo = Math.max(lo, hi - 60);
  const BINS = 4096, hist = new Uint32Array(BINS), bin = new Uint16Array(n), span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < n; i++) { const b = Math.max(0, Math.min(BINS - 1, Math.floor(((lgv[i] - lo) / span) * BINS))); bin[i] = b; hist[b]++; }
  let acc = 0, thr = BINS - 1;                                                       // 从大到小累加，直到够数
  for (let b = BINS - 1; b >= 0; b--) { acc += hist[b]; thr = b; if (acc >= keep) break; }
  const out = new PackedSplats();
  let kept = 0;
  for (let i = 0; i < n; i++) {
    if (bin[i] < thr) continue;
    const sp = ps.getSplat(i);
    sp.scales.multiplyScalar(grow);
    out.pushSplat(sp.center, sp.scales, sp.quaternion, sp.opacity, sp.color);
    kept++;
  }
  return { packed: out, kept, total: n };
}
