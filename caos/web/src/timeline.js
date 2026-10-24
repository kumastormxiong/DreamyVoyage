// 时间轴：data/timing.json 决定"哪一秒是哪一段、用哪个场景"，data/lyrics.json 决定每段唱哪些字/词。
// data/char_times.json（timing.html 打点工具生成）逐个覆盖每个单位的起唱时间；没打完的段落按 LRC 行时间或整段均分。
// 打点 key = `${段落id}:${行}:${列}`。打点工具和播放共用 rowsFor()，保证顺序完全一致。
export class Timeline {
  constructor(timing, lyrics, charTimes = {}) {
    this.timing = timing;
    this.sections = timing.sections;
    this.duration = timing.duration;
    this.bpm = timing.bpm || 120;
    this.blocks = {};
    for (const b of lyrics.blocks || []) this.blocks[b.id] = b;
    this.charTimes = charTimes || {};
    this._cache = new Map();
  }
  static async load(base = './data/') {
    const get = (u) => fetch(base + u).then((r) => r.json());
    const [a, b] = await Promise.all([get('timing.json'), get('lyrics.json').catch(() => ({ blocks: [] }))]);
    const c = await fetch(base + 'char_times.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return new Timeline(a, b, c.times || {});
  }
  // 当前段落：sec, index, lt（段内秒数）, p（段内进度 0..1）, dur
  at(t) {
    const S = this.sections;
    let s = S[S.length - 1];
    for (const x of S) if (t >= x.start && t < x.end) { s = x; break; }
    const dur = s.end - s.start;
    return { sec: s, index: S.indexOf(s), lt: t - s.start, p: Math.min(1, Math.max(0, (t - s.start) / dur)), dur };
  }
  // 拍子：beat（第几拍，小数）、bar（第几小节，4/4）、bp（拍内相位 0..1）
  beat(t) {
    const b = (t - (this.timing.beatPhase || 0)) * this.bpm / 60;
    return { beat: b, bar: b / 4, bp: b - Math.floor(b) };
  }
  rowsFor(sec) {
    const blk = this.blocks[sec.lyric];
    if (!blk) return [];
    const o = sec.rowOffset || 0, n = sec.rowCount ?? blk.rows.length - o;
    return blk.rows.slice(o, o + n);
  }
  // 段内每个单位的起唱时间。优先级：char_times（逐字打点，整段都打了才用）> sec.lines（LRC 每行 [起,止]，行内均分）> 整段均分
  timesFor(sec) {
    if (this._cache.has(sec.id)) return this._cache.get(sec.id);
    const rows = this.rowsFor(sec), flat = rows.flat(), keys = [];
    rows.forEach((r, ri) => r.forEach((_, ci) => keys.push(`${sec.id}:${ri}:${ci}`)));
    let times = null;
    if (keys.length && keys.every((k) => k in this.charTimes)) times = keys.map((k) => this.charTimes[k]);
    if (!times && sec.lines && sec.lines.length === rows.length) {
      times = []; rows.forEach((r, ri) => { const [a, b] = sec.lines[ri]; r.forEach((_, j) => times.push(a + (b - a) * j / r.length)); });
    }
    if (!times) {
      const v0 = sec.start + Math.min(1, (sec.end - sec.start) * 0.08), v1 = sec.end - Math.min(1.5, (sec.end - sec.start) * 0.1);
      times = flat.map((_, j) => v0 + (v1 - v0) * j / Math.max(1, flat.length));
    }
    // 每个单位所在的行、列
    const pos = []; rows.forEach((r, ri) => r.forEach((_, ci) => pos.push([ri, ci])));
    const res = { rows, flat, times, pos, keys };
    this._cache.set(sec.id, res);
    return res;
  }
  // 当前正在唱的单位：{ i（-1=未开始/已熄灭）, row, col, rows, flat, n, times, age（距起唱秒数）, next（距下一个单位秒数）, blk }
  lyric(t) {
    const { sec } = this.at(t);
    const blk = this.blocks[sec.lyric];
    if (!blk) return { i: -1, row: -1, col: -1, flat: [], rows: [], n: 0, times: [], age: 99, next: 99, blk: null, sec };
    const { rows, flat, times, pos } = this.timesFor(sec);
    let i = -1; for (let k = 0; k < times.length; k++) { if (t >= times[k]) i = k; else break; }
    const age = i >= 0 ? t - times[i] : 99;
    const next = i + 1 < times.length ? times[i + 1] - t : 99;
    // 最后一个字唱完 1.5 秒后熄灭
    if (i === times.length - 1 && age > 1.5) i = -1;
    const [row, col] = i >= 0 ? pos[i] : [-1, -1];
    return { i, row, col, rows, flat, n: flat.length, times, age, next, blk, sec };
  }
  kana(t) { return this.lyric(t); }   // 兼容 GhostChain 的旧场景代码
}
