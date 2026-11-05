// 3DM · 模型库接口层（网络版预留）。
// 页面代码（main.js / game.js）只通过这里取模型清单，不再直接 fetch models.json。
// 现在只有 LocalStore（读 ./models.json，用户只有站长一人）；网络版上线时把 CONFIG.api 指向后端即可，
// 页面代码不用改。接口约定见 docs/network-api.md。
const Q = new URLSearchParams(location.search);

export const CONFIG = {
  api: Q.get('api') || (typeof window !== 'undefined' && window.DM_API) || null,   // 例：https://api.dreamy.voyage ；空 = 单机模式
};

// 当前用户。单机模式 = 站长本人；网络版换成 GET /v1/me 的返回。
export const me = { id: 'local', role: 'owner', credits: Infinity, entitlements: ['official', 'generate', 'publish'] };

// 清单项统一成：{id, n, file, lod, sort_order, owner, visibility, status, created_at, legacy_ids, title}
// 兼容后端返回 files:{display, lod, thumb} 的写法。
// visible：管理页关掉的模型（models.json 里 visible:false）。隐藏的不进展厅 / 画廊 / 游戏，页数和计数由剩下的自动算。
// sheetIdx：缩略图表（thumbs.webp）里的格子，按全部已就绪模型排序，和隐藏与否无关，所以隐藏不会让别的图错位。
function normalize(items, { all = false } = {}) {
  const list = items.filter((e) => (e.status ?? 'ready') === 'ready').map((e, i) => ({   // 只展示已就绪的（pending / needs_simplify / failed 不进展厅）
    id: e.id, n: e.n ?? i + 1,
    file: e.file || e.files?.display, lod: e.lod || e.files?.lod, thumb: e.thumb || e.files?.thumb || null,
    sort_order: e.sort_order ?? i + 1, owner: e.owner ?? 'system', visibility: e.visibility ?? 'official',
    status: e.status ?? 'ready', created_at: e.created_at ?? null, legacy_ids: e.legacy_ids ?? [], title: e.title ?? '', visible: e.visible !== false,
  }));
  list.sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : 1));   // 同序号时按 UUIDv7（= 创建时间）
  list.forEach((m, i) => { m.sheetIdx = i; });
  const shown = all ? list : list.filter((m) => m.visible);
  shown.forEach((m, i) => { m.n = i + 1; });
  return shown;
}

// 线上显隐：管理页在线上关掉的模型（存在 Cloudflare Workers KV，代码在 worker/），不用重新部署就生效。
// 本地（localhost）不查线上状态，只按 models.json 显示，和本地管理页保持一致。接口不可用（断网、超时）时返回空集合。
export const VIS_API = 'https://3dm-visibility.kuma-storm-xiong-5dc.workers.dev/';
const IS_LOCAL = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);

export async function runtimeHidden() {
  if (IS_LOCAL) return new Set();
  try {
    const r = await fetch(VIS_API, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!r.ok) return new Set();
    const j = await r.json();
    return new Set(Array.isArray(j.hidden) ? j.hidden : []);
  } catch (e) {
    return new Set();
  }
}

class LocalStore {
  capabilities = { accounts: false, generate: false, publish: false };
  async list() {
    const raw = await (await fetch(Q.get('manifest') || './models.json')).json();
    const hid = await runtimeHidden();   // 线上管理页关掉的模型：展厅 / 画廊 / 游戏 / 缩略图都不显示
    return normalize(raw.map((e) => (hid.has(e.id) ? { ...e, visible: false } : e)));
  }
  async generate() { throw new Error('单机模式不支持在线生成：用 tools/add_model.mjs 加模型'); }
  async publish() { throw new Error('单机模式没有“发布”：模型都是官方展厅的一部分'); }
  async unpublish() { throw new Error('单机模式没有“发布”'); }
}

class RemoteStore {
  capabilities = { accounts: true, generate: true, publish: true };
  constructor(base) { this.base = base.replace(/\/$/, ''); }
  async _req(path, init = {}) {
    const r = await fetch(this.base + path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  // scope: all（官方 + 我的 + 公开）| official | mine | public；按 UUIDv7 游标翻页
  async list({ scope = 'all' } = {}) {
    const out = []; let cursor = null;
    do {
      const page = await this._req(`/v1/models?scope=${scope}&limit=200${cursor ? '&cursor=' + cursor : ''}`);
      out.push(...page.items); cursor = page.next_cursor || null;
    } while (cursor);
    return normalize(out);
  }
  generate(uploadId, opts = {}) { return this._req('/v1/generations', { method: 'POST', body: JSON.stringify({ upload_id: uploadId, ...opts }) }); }
  publish(id) { return this._req(`/v1/models/${id}/publish`, { method: 'POST' }); }
  unpublish(id) { return this._req(`/v1/models/${id}/publish`, { method: 'DELETE' }); }
}

export const store = CONFIG.api ? new RemoteStore(CONFIG.api) : new LocalStore();
const local = new LocalStore();

// 取清单。后端不可用时回退到本地官方清单，展厅不会因为接口挂掉而打不开。
export async function loadModels(opts) {
  if (store === local || !CONFIG.api) return local.list();
  try { return await store.list(opts); } catch (e) { console.warn('[modelstore] 后端不可用，回退本地清单：', e.message); return local.list(); }
}

// 管理页用：全部已就绪模型（含隐藏的），编号和缩略图格子与展厅一致
export async function loadAllModels() { return normalize(await (await fetch('./models.json', { cache: 'no-store' })).json(), { all: true }); }

// 旧 ID（girl / girl-2 ...）→ 新 UUIDv7：把浏览器里已有的解锁进度迁过来。返回 true 表示有改动，需要 persist()。
export function migrateProgress(save, models) {
  const alias = new Map();
  for (const m of models) for (const o of m.legacy_ids || []) alias.set(o, m.id);
  let changed = false;
  const fix = (id) => { const n = alias.get(id); if (n) { changed = true; return n; } return id; };
  if (Array.isArray(save.unlocked)) save.unlocked = [...new Set(save.unlocked.map(fix))];
  if (save.best && typeof save.best === 'object') { const nb = {}; for (const [k, v] of Object.entries(save.best)) nb[fix(k)] = v; save.best = nb; }
  return changed;
}
