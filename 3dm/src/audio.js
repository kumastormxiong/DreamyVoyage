// 背景音乐 + 频谱（让霓虹随节奏呼吸）。音乐复用 dreamy.voyage/vrmv 里的 ChainedGhost.mp3，本地调试时按顺序尝试几个位置。
const CANDIDATES = ['./audio/ChainedGhost.mp3', '../vrmv/audio/ChainedGhost.mp3', '/vrmv/audio/ChainedGhost.mp3', '../GhostChain_MV/VRMV/audio/ChainedGhost.mp3'];

export class Music {
  constructor() { this.on = false; this.level = 0; this.kick = 0; this.ready = false; this.failed = false; this.idx = 0; this.vol = 0.55; }
  async start() {
    this.on = true;
    if (!this.el) {
      this.el = new Audio(); this.el.loop = true; this.el.crossOrigin = 'anonymous'; this.el.preload = 'auto'; this.el.volume = this.vol;
      this.el.addEventListener('error', () => { if (++this.idx < CANDIDATES.length) { this.el.src = CANDIDATES[this.idx]; this.el.play().catch(() => {}); } else { this.failed = true; } });
      this.el.src = CANDIDATES[0];
    }
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
        this.src = this.ctx.createMediaElementSource(this.el); this.an = this.ctx.createAnalyser(); this.an.fftSize = 256; this.an.smoothingTimeConstant = 0.6;
        this.src.connect(this.an); this.an.connect(this.ctx.destination); this.buf = new Uint8Array(this.an.frequencyBinCount);
      }
      await this.ctx.resume(); await this.el.play(); this.ready = true;
    } catch (e) { console.warn('audio', e); }
  }
  stop() { this.on = false; this.el?.pause(); }
  setVolume(v) { this.vol = v; if (this.el) this.el.volume = v; }
  // 每帧调用：返回 0..1 的低频能量（带平滑），kick 为鼓点瞬时值
  update(dt) {
    if (!this.on || !this.ready || !this.an || this.el.paused) { this.level += (0 - this.level) * Math.min(1, dt * 3); this.kick *= 0.9; return this.level; }
    this.an.getByteFrequencyData(this.buf);
    let s = 0; for (let i = 1; i < 9; i++) s += this.buf[i]; s = s / 8 / 255;
    const target = Math.min(1, Math.pow(s, 1.6) * 1.6);
    if (target > this.level + 0.12) this.kick = 1;
    this.kick *= 0.88; this.level += (target - this.level) * Math.min(1, dt * 10);
    return this.level;
  }
}
