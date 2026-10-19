// 场景注册表。想新增场景：写一个 worlds/xxx.js（导出 create(ctx)），在这里登记，再在 data/timing.json 里用它的名字。
import * as void_ from './void.js';
import * as matrix from './matrix.js';
import * as highway from './highway.js';
import * as city from './city.js';
import * as tunnel from './tunnel.js';
import * as hit from './hit.js';
import * as dream from './dream.js';
import * as outro from './outro.js';
import * as wasteland from './wasteland.js';
import * as soul from './soul.js';
import * as flash from './flash.js';
import * as neural from './neural.js';
import * as dna from './dna.js';
import * as endcard from './endcard.js';
import * as cpu from './cpu.js';

const mods = { void: void_, matrix, highway, city, tunnel, hit, dream, outro, wasteland, soul, flash, neural, endcard, cpu, dna };

export function createWorlds(ctx) {
  const out = {};
  for (const [k, m] of Object.entries(mods)) {
    try { out[k] = m.create(ctx); } catch (e) { console.error('场景创建失败', k, e); }
  }
  return out;
}
