// 读取 data/spectrum.json（tools/analyze_audio.py 生成）：每帧 32 个对数频段，取值 0..1。
// 与 features.js 一样是预先算好的数据，所以逐帧离线渲染与网页实时播放结果一致。
export class Spectrum {
  constructor(json) {
    this.fps = json.fps || 60;
    this.nb = json.bands || 32;
    this.d = json.data || [];
    this.n = this.d.length;
  }
  static async load(url) {
    try {
      const r = await fetch(url);
      return new Spectrum(await r.json());
    } catch (e) {
      console.warn('spectrum.json 缺失，频谱光圈将保持静止', e);
      return new Spectrum({});
    }
  }
  // 把 t 时刻的各频段写入 out（长度 nb）；取 ±1 帧平均，避免逐帧跳变
  at(t, out) {
    if (!this.n) { out.fill(0); return out; }
    const i = Math.max(0, Math.min(this.n - 1, Math.round(t * this.fps)));
    for (let b = 0; b < this.nb; b++) {
      let s = 0, c = 0;
      for (let k = -1; k <= 1; k++) {
        const j = i + k;
        if (j >= 0 && j < this.n) { s += this.d[j][b]; c++; }
      }
      out[b] = s / c / 255;
    }
    return out;
  }
}
