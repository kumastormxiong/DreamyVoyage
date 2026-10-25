// 时间轴：data/timing.json 决定"哪一秒是哪一段、用哪个场景"，data/lyrics.json 决定每段唱哪些假名。
// data/char_times.json（由 timing.html 打点工具生成）逐字覆盖每个假名的起唱时间；没打的段落用段内平均分配。
export class Timeline {
  constructor(timing, lyrics, charTimes = {}) {
    this.timing = timing;
    this.sections = timing.sections;
    this.duration = timing.duration;
    this.blocks = {};
    for (const b of lyrics.blocks) this.blocks[b.id] = b;
    this.charTimes = charTimes || {};
  }
  static async load() {
    const get = (u) => fetch(u).then((r) => r.json());
    const [a, b] = await Promise.all([get('./data/timing.json'), get('./data/lyrics.json')]);
    const c = await fetch('./data/char_times.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return new Timeline(a, b, c.times || {});
  }
  at(t) {
    const S = this.sections;
    let s = S[S.length - 1];
    for (const x of S) if (t >= x.start && t < x.end) { s = x; break; }
    const dur = s.end - s.start;
    return { sec: s, index: S.indexOf(s), lt: t - s.start, p: Math.min(1, Math.max(0, (t - s.start) / dur)), dur };
  }
  // 该段唱的假名行（只取"一格一个假名"的行；按 sec.lines 截断）。打点工具与播放共用这一份逻辑
  rowsFor(sec) {
    const blk = this.blocks[sec.lyric];
    if (!blk) return [];
    let rows = blk.rows.filter((r) => r.length >= 3 && r.every((x) => x.length === 1));
    if (sec.lines) { const o = sec.rowOffset || 0; rows = rows.slice(o, o + sec.lines.length); }
    return rows;
  }
  // 当前段落正在唱第几个假名：返回 {i（0 起，-1 表示尚未开始）, rows, flat, n, times（每个假名的起唱时间）, age（距当前假名起唱的秒数）}
  // 时间来源优先级：char_times（逐字打点）> sec.times > sec.lines（每行 [起,止]，行内平均）> sec.vocal（整段平均）
  kana(t) {
    const { sec } = this.at(t);
    const blk = this.blocks[sec.lyric];
    if (!blk) return { i: -1, flat: [], rows: [], n: 0, times: [], age: 99 };
    const rows = this.rowsFor(sec);
    const flat = rows.flat();
    let times = null;
    const keys = [];
    rows.forEach((r, ri) => r.forEach((_, ci) => keys.push(`${sec.id}:${ri}:${ci}`)));
    if (keys.length && keys.every((k) => k in this.charTimes)) times = keys.map((k) => this.charTimes[k]);
    if (!times && sec.times && sec.times.length) times = sec.times;
    if (!times && sec.lines) {
      times = [];
      rows.forEach((r, ri) => { const [a, b] = sec.lines[ri]; r.forEach((_, j) => times.push(a + (b - a) * j / r.length)); });
    }
    if (!times) {
      const v0 = sec.vocal ? sec.vocal[0] : sec.start, v1 = sec.vocal ? sec.vocal[1] : sec.end;
      times = flat.map((_, j) => v0 + (v1 - v0) * j / Math.max(1, flat.length));
    }
    let i = -1; for (let k = 0; k < times.length; k++) { if (t >= times[k]) i = k; else break; }
    // 一行唱完之后 1.2 秒内保持最后一个假名，再熄灭（避免长间奏里一直挂着）
    const age = i >= 0 ? t - times[i] : 99;
    const lastEnd = sec.lines ? sec.lines[sec.lines.length - 1][1] : (sec.vocal ? sec.vocal[1] : sec.end);
    if (t > lastEnd + 1.2) i = -1;
    return { i, rows, flat, n: flat.length, blk, times, age };
  }
}
