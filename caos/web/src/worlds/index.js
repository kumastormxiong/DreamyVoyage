// 场景注册表。新增场景：写 worlds/xxx.js（导出 create(ctx)，参考 _template.js），在下面 import 并加进 mods，
// 然后在 timing/sections.json 里用 "world": "xxx"，或在 project.json 的 world_for_kind 里按段落类型指定。
import * as endcard from './endcard.js';
import * as boot from './boot.js';
import * as chains from './chains.js';
import * as mosh from './mosh.js';
import * as drop from './drop.js';
import * as mirror from './mirror.js';
import * as skyline from './skyline.js';
import * as ember from './ember.js';
import * as aurum from './aurum.js';
import * as collapse from './collapse.js';
import * as tiltshift from './tiltshift.js';
import * as maglev from './maglev.js';
import * as rainsigns from './rainsigns.js';
import * as inverted from './inverted.js';
import * as lighttrails from './lighttrails.js';
import * as bloodmoon from './bloodmoon.js';
import * as dissolve from './dissolve.js';
import * as coderain from './coderain.js';
import * as atfield from './atfield.js';
import * as cyberdive from './cyberdive.js';

const mods = { endcard, boot, chains, mosh, drop, mirror, skyline, ember, aurum, collapse, tiltshift, maglev, rainsigns, inverted, lighttrails, bloodmoon, dissolve, coderain, atfield, cyberdive };

export function createWorlds(ctx) {
  const out = {};
  for (const [k, m] of Object.entries(mods)) {
    try { out[k] = m.create(ctx); } catch (e) { console.error('场景创建失败', k, e); }
  }
  return out;
}
