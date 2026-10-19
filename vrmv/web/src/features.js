// 读取 data/features.json（tools/analyze_audio.py 生成），按时间 t 给出 0..1 的音频特征。
// 画面完全由这些预先算好的数据驱动，不依赖实时 FFT，所以逐帧离线渲染与网页实时播放结果一致。
export class Features {
  constructor(json) {
    this.d = json;
    this.fps = json.fps;
    this.kicks = json.kicks;
    this.hits = json.hits;
  }
  static async load(url) {
    try {
      const r = await fetch(url);
      return new Features(await r.json());
    } catch (e) {
      console.warn('features.json 缺失，使用空特征', e);
      return new Features({ fps: 60, n: 0, low: [], mid: [], high: [], vox: [], flux: [], kicks: [], hits: [] });
    }
  }
  _a(arr, t, w = 2) {            // 在 ±w 帧内取平滑值
    const n = arr.length; if (!n) return 0;
    const i = Math.max(0, Math.min(n - 1, Math.round(t * this.fps)));
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < n) { s += arr[j]; c++; } }
    return s / c / 255;
  }
  _since(list, t) {              // 距离上一次起音的秒数 / 距离下一次起音的秒数
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] <= t) lo = m + 1; else hi = m; }
    const prev = lo > 0 ? list[lo - 1] : -9, next = lo < list.length ? list[lo] : 9e3;
    return { since: t - prev, until: next - t, idx: lo - 1 };
  }
  at(t) {
    const k = this._since(this.kicks, t), h = this._since(this.hits, t);
    return {
      low: this._a(this.d.low, t), mid: this._a(this.d.mid, t), high: this._a(this.d.high, t),
      vox: this._a(this.d.vox, t), flux: this._a(this.d.flux, t, 1),
      kick: Math.exp(-k.since * 9), hit: Math.exp(-h.since * 12),
      kickIdx: k.idx, hitIdx: h.idx,
      pre: Math.exp(-Math.max(0, k.until) * 14),   // 鼓点来临前的"预备"
    };
  }
}
