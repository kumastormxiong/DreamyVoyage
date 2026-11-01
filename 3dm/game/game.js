// 3DM · 音乐游戏：用手柄触碰沿节奏飞来的音符，通关解锁手办。
// 与展厅共用同一个渲染器和 XR 会话（由 src/main.js 的 DM.openGame() 加载），所以可以在 VR 里直接来回切换，不会退出到浏览器。
// 只读取 models.json / thumbs.webp / models_lod，解锁进度存在 localStorage。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Envs, ENV_DEFS, PAL } from '../src/envs.js';     // 复用展厅的 8 个场景

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), BOT = Q.has('bot'), RATE = Number(Q.get('rate') || 1), SILENT = Q.has('silent');   // rate/silent/bot 仅用于自动化测试

// ---------- 常量 ----------
const COL = [0x30f0ff, 0xff2fd0];                    // 左手青 / 右手粉
const COLX = [-0.5, -0.17, 0.17, 0.5];               // 四列的 x（米，相对玩家）
const HIT_Z = -0.55, SPEED = 8, TIP_R = 0.17, LEAD = 3.0;
const FIG_H = 25, FIG_Z = -20;                        // 巨像：25 米高、离玩家 20 米，略微抬头就能看到全貌
const ROUND = 90;                                     // 每局时长（秒），从歌曲的随机位置开始
const ENV_SCALE = 2.2;                                // 展厅场景放大倍数（配合 30 米巨像）
const MP3_BASE = 'https://dreamy.voyage/mp3s/';
const pick = (a) => a[(Math.random() * a.length) | 0];
const DIFFS = {
  easy:   { zh: '简单', appr: 2.0, need: 0.60, win: [0.06, 0.12, 0.2],    any: true,  desc: '约 1 个/秒 · 任意手触碰' },
  normal: { zh: '普通', appr: 1.7, need: 0.75, win: [0.055, 0.105, 0.17], any: true,  desc: '约 2 个/秒 · 任意手触碰' },
  hard:   { zh: '困难', appr: 1.45, need: 0.90, win: [0.045, 0.09, 0.15], any: false, desc: '约 3 个/秒 · 要用对应颜色的手' },
};
const JUDGE = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
const JPTS = [1000, 700, 400, 0];

// ---------- 存档 ----------
const SKEY = 'dm_game_v1';
const save = { unlocked: [], best: {}, offset: 0, sel: 0, diff: 'normal' };
try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s) Object.assign(save, s); } catch (e) { /* 无痕模式 */ }
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
if (Q.get('diff') && DIFFS[Q.get('diff')]) save.diff = Q.get('diff');
if (Q.get('model')) save.sel = Math.max(0, Number(Q.get('model')) | 0);

export function createGame(app) {
// ---------- 场景（渲染器由展厅提供）----------
const renderer = app.renderer; renderer.localClippingEnabled = true;
let active = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 4000);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const DESK_CAM = new THREE.Vector3(0, 1.5, 1.0);
function deskCamera() { camera.position.copy(DESK_CAM); camera.lookAt(0, 7.3, -19); }
deskCamera();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const play = new THREE.Group(); scene.add(play);       // 所有玩法内容：原点 = 玩家脚下，-z = 面朝方向
let base = 0.95;                                      // 最低一排的离地高度
const rowY = (r) => base + r * 0.26;

// 场景：复用展厅的 8 个环境（天空 / 地面 / 特效），放大后包住玩家和巨像
const genvs = new Envs(scene); const worldG = genvs.group; worldG.scale.setScalar(ENV_SCALE); play.add(worldG);
let envIdx = -1;
function applyEnv(i) {
  if (i === envIdx) return; envIdx = i; const d = genvs.set(i);
  lA.color.copy(PAL.a); lB.color.copy(PAL.b);
}

// 判定框：四列 × 三排
const frames = [];
{
  const eg = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.27, 0.27));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const m = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, toneMapped: false }));
    m.userData = { c, r, flash: 0 }; play.add(m); frames.push(m);
  }
}
function layoutFrames() { for (const m of frames) m.position.set(COLX[m.userData.c], rowY(m.userData.r), HIT_Z); }

// 音符：两个实例化网格（实心核 + 线框外壳），每个实例单独着色
const CAP = 200;
const noteGeo = new THREE.OctahedronGeometry(0.1, 0);
const noteCore = new THREE.InstancedMesh(noteGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), CAP);
const noteWire = new THREE.InstancedMesh(noteGeo, new THREE.MeshBasicMaterial({ wireframe: true, toneMapped: false, transparent: true, opacity: 0.9 }), CAP);
for (const m of [noteCore, noteWire]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); play.add(m); }

// 粒子（命中爆裂）
const NP = 360, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP), pBase = new Float32Array(NP * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
pts.frustumCulled = false; play.add(pts); let pHead = 0;
function burst(x, y, z, hex, n = 14) {
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    const k = pHead++ % NP, a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, s = 0.8 + Math.random() * 1.6;
    pPos.set([x, y, z], k * 3); pBase.set([c.r, c.g, c.b], k * 3);
    pVel.set([Math.cos(a) * Math.sqrt(1 - b * b) * s, b * s, Math.sin(a) * Math.sqrt(1 - b * b) * s], k * 3); pLife[k] = 1;
  }
}
function updateParticles(dt) {
  for (let k = 0; k < NP; k++) {
    if (pLife[k] <= 0) { pCol[k * 3] = pCol[k * 3 + 1] = pCol[k * 3 + 2] = 0; continue; }
    pLife[k] -= dt * 2.2; const l = Math.max(pLife[k], 0);
    for (let j = 0; j < 3; j++) { pPos[k * 3 + j] += pVel[k * 3 + j] * dt; pVel[k * 3 + j] *= 1 - dt * 2.5; pCol[k * 3 + j] = pBase[k * 3 + j] * l * 1.6; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// 手办（背景巨像）：未解锁时是暗色剪影，随命中数从下往上被"点亮"
scene.add(new THREE.HemisphereLight(0xa8b8ff, 0x3a1060, 1.4));
const lA = new THREE.PointLight(0xff2fd0, 5000, 160, 2); lA.position.set(-18, 20, FIG_Z + 14); play.add(lA);
const lB = new THREE.PointLight(0x30f0ff, 5000, 160, 2); lB.position.set(18, 20, FIG_Z + 14); play.add(lB);
const lC = new THREE.DirectionalLight(0xffffff, 1.2); lC.position.set(0, 12, 8); play.add(lC);
const revealPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), ghostPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const figure = new THREE.Group(); figure.position.set(0, 0, FIG_Z); figure.scale.setScalar(FIG_H); play.add(figure);
const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
figure.add(scanPlane); scanPlane.visible = false;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map(); const CACHE_MAX = 3; let figToken = 0, figReveal = 0, figTarget = 0;
function normalize(gltf) {
  const sc = gltf.scene, box = new THREE.Box3().setFromObject(sc), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const k = 1 / Math.max(Math.max(size.y, 0.85 * Math.max(size.x, size.z)), 1e-3), holder = new THREE.Group();
  holder.add(sc); sc.scale.multiplyScalar(k); sc.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
  sc.traverse((o) => { o.frustumCulled = false; }); return holder;
}
async function showFigure(i) {
  const m = models[i]; if (!m) return; const tok = ++figToken;
  while (figure.children.length > 1) { const o = figure.children.pop(); o.traverse((x) => { if (x.material) [].concat(x.material).forEach((mm) => mm.dispose()); }); }
  let holder = gltfCache.get(m.id);
  if (!holder) { try { holder = normalize(await loader.loadAsync(m.file)); gltfCache.set(m.id, holder); while (gltfCache.size > CACHE_MAX) gltfCache.delete(gltfCache.keys().next().value); } catch (e) { console.warn('model', e); return; } }
  if (tok !== figToken) return;
  const real = holder.clone(true), ghost = holder.clone(true);
  real.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = [revealPlane]; } });
  ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x3b1f78, transparent: true, opacity: 0.62, clippingPlanes: [ghostPlane], side: THREE.DoubleSide, depthWrite: false, toneMapped: false }); } });
  figure.add(ghost, real); figReveal = 0; figTarget = isUnlocked(m.id) && state !== 'playing' ? 1 : 0;
}

// ---------- 音频 ----------
const AC = window.AudioContext || window.webkitAudioContext; let actx = null, musicGain = null, sfxGain = null, src = null, startAt = 0, roundGain = null;
try { actx = new AC(); musicGain = actx.createGain(); musicGain.gain.value = 0.85; sfxGain = actx.createGain(); sfxGain.gain.value = 0.5; musicGain.connect(actx.destination); sfxGain.connect(actx.destination); } catch (e) { actx = null; }
function blip(hand, kind) {
  if (!actx || actx.state !== 'running') return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.value = (hand ? 784 : 587) * (kind === 0 ? 1.5 : 1); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(sfxGain); o.start(t); o.stop(t + 0.13);
}
let fallbackT0 = 0;
const songTime = () => (cur && cur.state === 'ok' && cur.buf && actx && !SILENT ? actx.currentTime - startAt - (actx.outputLatency || 0) : ((performance.now() - fallbackT0) / 1000) * RATE - LEAD) + save.offset / 1000;

// ---------- 数据 ----------
let songs = [], models = [], sheet = null, state = 'menu', cfg = DIFFS[save.diff] || DIFFS.normal;
// ---------- 回合：随机歌曲 + 随机场景 + 随机 90 秒片段 ----------
const chartCache = new Map(); let cur = null, pending = null, lastSong = null;
async function getChart(id) { if (!chartCache.has(id)) chartCache.set(id, fetch(`./game/charts/${id}.json`).then((r) => r.json())); return chartCache.get(id); }
function makeRound() {
  const song = (Q.get('gsong') && songs.find((x) => x.id === Q.get('gsong'))) || pick(songs.length > 1 ? songs.filter((x) => x.id !== lastSong) : songs); lastSong = song.id;
  const env = Q.has('genv') ? (Number(Q.get('genv')) | 0) % ENV_DEFS.length : (Math.random() * ENV_DEFS.length) | 0;
  const r = { song, env, state: 'loading', start: 0, buf: null, beats: [], charts: null };
  r.promise = (async () => {
    const d = await getChart(song.id); r.data = d;
    const ok = d.starts.filter((t) => t + ROUND + 2 <= d.duration), st = Q.has('gstart') ? Number(Q.get('gstart')) : ok.length ? pick(ok) : Math.max(0, d.duration - ROUND - 2);
    r.start = st; r.beats = d.beats.filter((t) => t >= st && t <= st + ROUND + 2).map((t) => t - st);
    r.charts = {}; for (const k of Object.keys(DIFFS)) r.charts[k] = d.charts[k].filter((a) => a[0] >= st && a[0] <= st + ROUND).map((a) => [a[0] - st, a[1], a[2], a[3]]);
    if (!actx || SILENT) { r.state = 'ok'; return; }
    try {
      const ab = await (await fetch(MP3_BASE + encodeURIComponent(song.file))).arrayBuffer(), full = await actx.decodeAudioData(ab), sr = full.sampleRate;
      const s0 = Math.floor(st * sr), len = Math.min(full.length - s0, Math.floor((ROUND + 2.5) * sr)), win = actx.createBuffer(full.numberOfChannels, len, sr);   // 只保留这一局用到的片段，省内存
      for (let c = 0; c < full.numberOfChannels; c++) win.copyToChannel(full.getChannelData(c).subarray(s0, s0 + len), c);
      r.buf = win; r.state = 'ok';
    } catch (e) { console.warn('song', e); r.state = 'ok'; r.silent = true; }      // 加载失败：静音游玩
  })().catch((e) => { console.warn('round', e); r.state = 'fail'; }).then(() => { drawPanel(); });
  return r;
}
function newPending() { pending = makeRound(); }
function showPending() { if (!pending) newPending(); applyEnv(pending.env); drawPanel(); }
const pReady = () => !!pending && pending.state === 'ok';
const isUnlocked = (id) => save.unlocked.includes(id);
async function loadData() {
  models = await (await fetch('./models.json')).json();
  songs = await (await fetch('./game/songs.json')).json();
  sheet = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = './thumbs.webp'; });
  save.sel = Math.min(save.sel, models.length - 1);
}

// ---------- 玩法状态 ----------
let notes = [], lo = 0, hi = 0, stats = null, judgeText = '', judgeT = 0, judgeK = 0, beatIdx = 0, pulse = 0, hudT = 0, doneT = 0, result = null;
const tmpV3 = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const noteZ = (n, now) => HIT_Z - (n.t - now) * SPEED;
function resetStats() { return { score: 0, combo: 0, maxCombo: 0, counts: [0, 0, 0, 0], total: notes.length, hits: 0 }; }
const hitRate = () => (stats.total ? stats.hits / stats.total : 0);

function startSong() {
  if (!pReady()) return; cur = pending; pending = null; prefetched = false; applyEnv(cur.env); cfg = DIFFS[save.diff];
  const ch = cur.charts[save.diff];
  notes = ch.map((a) => ({ t: a[0], c: a[1], r: a[2], h: a[3], s: 0 })); lo = hi = 0; beatIdx = 0; stats = resetStats(); judgeText = ''; result = null; notified = false;
  recenter(); layoutFrames(); panel.mesh.visible = false; hud.mesh.visible = true; hudDirty = true;
  if (actx && cur.buf && !SILENT) {
    actx.resume(); src = actx.createBufferSource(); src.buffer = cur.buf; roundGain = actx.createGain(); src.connect(roundGain).connect(musicGain); startAt = actx.currentTime + LEAD; src.start(startAt);
    roundGain.gain.setValueAtTime(0, startAt); roundGain.gain.linearRampToValueAtTime(1, startAt + 0.5); roundGain.gain.setValueAtTime(1, startAt + ROUND - 2.5); roundGain.gain.linearRampToValueAtTime(0, startAt + ROUND);
  } else fallbackT0 = performance.now();
  state = 'playing'; figTarget = 0; figReveal = 0; doneT = 0;
  for (const m of frames) m.userData.flash = 0;
}
function stopSong() { try { src?.stop(); } catch (e) { /* 已停止 */ } src = null; }
function quitToMenu() { stopSong(); state = 'menu'; showPending(); hud.mesh.visible = false; panel.mesh.visible = true; recenter(); showFigure(save.sel); drawPanel(); }

function judge(n, dt, hand) {
  const w = cfg.win, a = Math.abs(dt), k = a <= w[0] ? 0 : a <= w[1] ? 1 : 2;
  n.s = 1; stats.counts[k]++; stats.hits++; stats.combo++; stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
  stats.score += Math.round(JPTS[k] * (1 + Math.min(stats.combo, 50) / 50));
  judgeText = JUDGE[k]; judgeK = k; judgeT = 0.5; hudDirty = true;
  const x = COLX[n.c], y = rowY(n.r); burst(x, y, HIT_Z, COL[n.h], k === 0 ? 20 : 12); blip(hand ?? n.h, k);
  const fr = frames.find((f) => f.userData.c === n.c && f.userData.r === n.r); if (fr) fr.userData.flash = 1; pulse = Math.max(pulse, 0.6);
  if (hand != null && hand >= 0) controls.haptic(hand, k === 0 ? 0.7 : 0.45, 35);
  if (!notified && stats.hits >= cfg.need * stats.total) { notified = true; judgeText = 'UNLOCK READY'; judgeT = 1.4; judgeK = 0; burst(0, 1.4, -1.5, 0xffffff, 60); }
}
let notified = false, prefetched = false;
function miss(n) { n.s = 2; stats.counts[3]++; stats.combo = 0; judgeText = 'MISS'; judgeK = 3; judgeT = 0.4; hudDirty = true; }

function updatePlay(dt) {
  const now = songTime(), w = cfg.win, W = w[2];
  // 新音符进入视野 / 判定 MISS
  while (hi < notes.length && notes[hi].t - now < cfg.appr + 0.15) hi++;
  if (BOT) { for (let i = lo; i < hi; i++) { const n = notes[i]; if (n.s === 0 && now >= n.t - 0.005) judge(n, 0.004, n.h); } }   // 测试用自动演奏
  while (lo < hi && (notes[lo].s !== 0 || notes[lo].t < now - W - 0.02)) { if (notes[lo].s === 0) miss(notes[lo]); lo++; }
  for (let i = lo; i < hi; i++) if (notes[i].s === 0 && notes[i].t < now - W - 0.02) miss(notes[i]);
  // 命中判定
  if (!BOT && renderer.xr.isPresenting) vrHits(now, W);
  // 实例矩阵
  let cnt = 0;
  for (let i = lo; i < hi && cnt < CAP; i++) {
    const n = notes[i]; if (n.s !== 0) continue;
    const z = noteZ(n, now), pop = Math.min(1, Math.max(0, (cfg.appr + 0.15 - (n.t - now)) * 5)), s = 0.4 + 0.6 * pop;
    tmpV.set(COLX[n.c], rowY(n.r), z); tmpE.set(now * 1.7 + i, now * 2.3, 0); tmpQ.setFromEuler(tmpE); tmpS.setScalar(s);
    tmpM.compose(tmpV, tmpQ, tmpS); noteCore.setMatrixAt(cnt, tmpM);
    tmpS.setScalar(s * 1.55); tmpM.compose(tmpV, tmpQ, tmpS); noteWire.setMatrixAt(cnt, tmpM);
    tmpC.setHex(COL[n.h]); noteCore.setColorAt(cnt, tmpC); tmpC.multiplyScalar(1.4); noteWire.setColorAt(cnt, tmpC); cnt++;
  }
  noteCore.count = noteWire.count = cnt; noteCore.instanceMatrix.needsUpdate = noteWire.instanceMatrix.needsUpdate = true;
  if (noteCore.instanceColor) { noteCore.instanceColor.needsUpdate = true; noteWire.instanceColor.needsUpdate = true; }
  // 节拍脉冲
  const bt = cur.beats; while (beatIdx < bt.length && bt[beatIdx] < now) { beatIdx++; pulse = Math.max(pulse, 0.85); }
  figTarget = Math.min(1, stats.hits / Math.max(1, cfg.need * stats.total));
  if (!prefetched && now > 15) { prefetched = true; newPending(); }       // 开局后再悄悄预载下一局，避免开场卡顿
  // 结束
  if (now > ROUND + 1.2 || (notes.length && lo >= notes.length && now > notes[notes.length - 1].t + 1.5)) finish();
  if (now < 0) { const c = Math.ceil(-now); if (c <= 3 && judgeText !== String(c)) { judgeText = String(c); judgeK = 1; judgeT = 0.9; hudDirty = true; } }
}

function grade(acc) { return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D'; }
function finish() {
  stopSong(); state = 'result'; const c = stats.counts, acc = stats.total ? (c[0] + c[1] * 0.8 + c[2] * 0.5) / stats.total : 0, pass = hitRate() >= cfg.need, m = models[save.sel];
  const gr = grade(acc), newly = [];
  if (pass && m && !isUnlocked(m.id)) { save.unlocked.push(m.id); newly.push(m); }
  if (pass && gr === 'S') { const b = models.find((x) => !isUnlocked(x.id)); if (b) { save.unlocked.push(b.id); newly.push(b); } }
  if (m) { const old = save.best[m.id]; if (!old || stats.score > old.score) save.best[m.id] = { score: stats.score, grade: gr, diff: save.diff }; }
  persist(); result = { acc, pass, gr, newly, s: stats, diff: save.diff, m };
  hud.mesh.visible = false; panel.mesh.visible = true; recenter(); noteCore.count = noteWire.count = 0; figTarget = pass ? 1 : figTarget; drawPanel();
  if (pass) { burst(0, 1.4, -1.5, 0xffffff, 120); burst(0, 1.8, -1.5, COL[0], 80); burst(0, 1.8, -1.5, COL[1], 80); }
}

// ---------- 手柄（VR） ----------
const controls = {
  hands: [null, null], prev: [new THREE.Vector3(), new THREE.Vector3()], hover: [null, null], down: [false, false],
  haptic(i, amp, ms) { try { this.hands[i]?.src?.gamepad?.hapticActuators?.[0]?.pulse(amp, ms); } catch (e) { /* 不支持 */ } },
};
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i); rig.add(c, g);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  laser.visible = false; c.add(laser);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); tip.position.z = -0.06; c.add(tip);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(TIP_R, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false })); halo.position.z = -0.06; c.add(halo);
  const rec = { c, laser, tip, halo, side: i, src: null };
  c.addEventListener('connected', (e) => {
    rec.src = e.data; rec.side = e.data.handedness === 'left' ? 0 : e.data.handedness === 'right' ? 1 : i; controls.hands[rec.side] = rec;
    const col = COL[rec.side]; tip.material.color.setHex(col); halo.material.color.setHex(col); laser.material.color.setHex(col);
  });
  c.addEventListener('disconnected', () => { if (controls.hands[rec.side] === rec) controls.hands[rec.side] = null; });
  c.addEventListener('selectstart', () => { if (active && panel.mesh.visible) { const h = controls.hover[i]; if (h) click(h.id); } });
  ctrls.push(rec);
}
function syncMainControllers() {       // 展厅先建立的手柄信息（会话开始时已触发过 connected）
  for (let i = 0; i < 2; i++) {
    const m = app.controls?.ctrls?.[i], rec = ctrls[i]; if (!m?.src || rec.src === m.src) continue;
    rec.src = m.src; rec.side = m.side === 'left' ? 0 : m.side === 'right' ? 1 : i; controls.hands[rec.side] = rec;
    const col = COL[rec.side]; rec.tip.material.color.setHex(col); rec.halo.material.color.setHex(col); rec.laser.material.color.setHex(col);
  }
}
function vrHits(now, W) {
  const cand = [null, null];
  for (const rec of ctrls) {
    if (!rec.src) continue; const hand = rec.side; rec.c.updateMatrixWorld(true);
    tmpV.set(0, 0, -0.06).applyMatrix4(rec.c.matrixWorld); play.worldToLocal(tmpV); const prev = controls.prev[hand], cur = tmpV;
    const mid = tmpV2.copy(prev).add(cur).multiplyScalar(0.5); let best = null, bd = 9;
    for (let i = lo; i < hi; i++) {
      const n = notes[i]; if (n.s !== 0) continue; const dtn = n.t - now; if (Math.abs(dtn) > W + 0.05) continue;
      const nx = COLX[n.c], ny = rowY(n.r), nz = noteZ(n, now);
      const d1 = Math.hypot(cur.x - nx, cur.y - ny, cur.z - nz), d2 = Math.hypot(mid.x - nx, mid.y - ny, mid.z - nz);
      if (Math.min(d1, d2) < TIP_R + 0.03) { if (!cfg.any && n.h !== hand) continue; if (Math.abs(dtn) < bd) { bd = Math.abs(dtn); best = n; } }
    }
    if (best && bd <= W) cand[hand] = { n: best, dt: best.t - now };
    prev.copy(cur);
  }
  for (const hand of [0, 1]) { const c = cand[hand]; if (c && c.n.s === 0) judge(c.n, c.dt, hand); }
}

// ---------- 画布面板：菜单 / 结果 / HUD ----------
class Panel {
  constructor(w, h, mw, mh) {
    this.w = w; this.h = h; this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h; this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }));
    this.mesh.renderOrder = 50; play.add(this.mesh);
  }
}
const panel = new Panel(1024, 768, 1.6, 1.2), hud = new Panel(768, 256, 1.6, 0.533); hud.mesh.visible = false;
const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif';
let rects = [], hoverId = null, hudDirty = true, page = 0;
const P = { a: '#ff2fd0', b: '#30f0ff' };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function btn(g, id, x, y, w, h, label, o = {}) {
  rects.push({ id, x, y, w, h }); const hv = hoverId === id, sel = o.sel;
  rr(g, x, y, w, h, 12); g.fillStyle = sel ? 'rgba(255,47,208,.45)' : hv ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)'; g.fill();
  g.lineWidth = sel || hv ? 3 : 1.5; g.strokeStyle = sel ? P.a : hv ? '#fff' : 'rgba(255,255,255,.35)'; g.stroke();
  g.fillStyle = o.dim ? 'rgba(255,255,255,.4)' : '#fff'; g.font = `700 ${o.fs || 24}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2 + 1);
}
function txt(g, s, x, y, fs, col = '#cfd8ff', al = 'left', wt = 600) { g.font = `${wt} ${fs}px ${FONT}`; g.fillStyle = col; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(s, x, y); }
function neon(g, s, x, y, fs, c1, al = 'center') { g.save(); g.shadowColor = c1; g.shadowBlur = 24; txt(g, s, x, y, fs, '#fff', al, 800); g.restore(); }
function tile(g, i, x, y, sz, locked, sel) {
  const col = i % 6, row = (i / 6) | 0;
  if (sheet) { g.drawImage(sheet, col * 256, row * 256, 256, 256, x, y, sz, sz); } else { g.fillStyle = '#1a1038'; g.fillRect(x, y, sz, sz); }
  if (locked) { g.fillStyle = 'rgba(6,2,20,.82)'; g.fillRect(x, y, sz, sz); txt(g, '🔒', x + sz / 2, y + sz / 2 - sz * 0.05, sz * 0.34, '#fff', 'center'); }
  g.lineWidth = sel ? 4 : 1.5; g.strokeStyle = sel ? '#30f0ff' : 'rgba(255,255,255,.3)'; g.strokeRect(x, y, sz, sz);
}
function bg(g, w, h) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(14,6,40,.94)'); gr.addColorStop(1, 'rgba(6,16,40,.94)');
  rr(g, 4, 4, w - 8, h - 8, 28); g.fillStyle = gr; g.fill(); g.lineWidth = 4; const s = g.createLinearGradient(0, 0, w, 0); s.addColorStop(0, P.a); s.addColorStop(1, P.b); g.strokeStyle = s; g.stroke();
}
function drawPanel() {
  const g = panel.g; g.clearRect(0, 0, 1024, 768); bg(g, 1024, 768); rects = [];
  if (state === 'result' && result) return drawResult(g);
  neon(g, 'GHOSTCHAIN · RHYTHM', 512, 52, 46, P.a); txt(g, '用手柄触碰沿节奏飞来的音符 · 通关即可解锁手办', 512, 96, 22, '#9fb4ff', 'center');
  ['easy', 'normal', 'hard'].forEach((d, i) => btn(g, 'd:' + d, 40 + i * 156, 128, 146, 46, DIFFS[d].zh, { sel: save.diff === d, fs: 24 }));
  txt(g, DIFFS[save.diff].desc + ` · 命中率 ≥ ${Math.round(DIFFS[save.diff].need * 100)}% 解锁`, 520, 151, 19, '#9fb4ff');
  const per = 18, pages = Math.max(1, Math.ceil(models.length / per)); page = Math.min(page, pages - 1);
  for (let i = 0; i < per; i++) {
    const idx = page * per + i; if (idx >= models.length) break; const c = i % 6, r = (i / 6) | 0, x = 40 + c * 112, y = 196 + r * 112;
    rects.push({ id: 'm:' + idx, x, y, w: 100, h: 100 }); tile(g, idx, x, y, 100, !isUnlocked(models[idx].id), idx === save.sel);
    if (hoverId === 'm:' + idx) { g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeRect(x, y, 100, 100); }
    if (isUnlocked(models[idx].id)) txt(g, '✓', x + 90, y + 12, 18, '#6dffb0', 'right', 800);
  }
  if (pages > 1) { btn(g, 'pg:-1', 40, 538, 70, 36, '◀', { fs: 20 }); btn(g, 'pg:1', 120, 538, 70, 36, '▶', { fs: 20 }); txt(g, `${page + 1}/${pages}`, 205, 556, 20); }
  const m = models[save.sel];
  if (m) {
    const lk = !isUnlocked(m.id), b = save.best[m.id];
    tile(g, save.sel, 730, 196, 254, lk, false); txt(g, `手办 #${m.n ?? save.sel + 1}`, 730, 474, 26, '#fff', 'left', 800);
    txt(g, lk ? '🔒 未解锁 · 通关后点亮' : '✓ 已解锁', 730, 506, 20, lk ? '#ffb0e8' : '#6dffb0');
    txt(g, b ? `最佳 ${b.score}  ${b.grade}（${DIFFS[b.diff].zh}）` : '尚无记录', 730, 536, 20, '#9fb4ff');
  }
  txt(g, `已解锁 ${save.unlocked.length} / ${models.length}`, 40, 604, 22, '#cfd8ff', 'left', 700);
  const ready = pReady();
  btn(g, 'start', 300, 630, 424, 84, ready ? '▶  开始演奏' : '加载中 …', { fs: 34, sel: ready, dim: !ready });
  btn(g, 'back', 40, 650, 190, 52, '← 返回展厅', { fs: 22 });
  txt(g, `延迟补偿 ${save.offset >= 0 ? '+' : ''}${save.offset}ms`, 856, 612, 19, '#9fb4ff', 'center');
  btn(g, 'off:-10', 756, 628, 66, 44, '−10', { fs: 20 }); btn(g, 'off:10', 890, 628, 66, 44, '+10', { fs: 20 });
  if (pending) {
    const sg = pending.song, ev = ENV_DEFS[pending.env];
    txt(g, `♪ ${sg.zh}  ${sg.en}`, 262, 556, 21, '#fff', 'left', 700); txt(g, `◈ 场景：${ev.zh} · ${sg.bpm | 0} BPM · ${ROUND} 秒随机片段`, 262, 588, 19, '#9fb4ff');
    btn(g, 'reroll', 590, 536, 126, 40, '🎲 换一局', { fs: 18 });
    if (pending.state === 'fail') txt(g, '⚠ 谱面加载失败，请点「换一局」重试', 512, 738, 18, '#ffb0b0', 'center');
    else if (pending.silent) txt(g, '⚠ 歌曲音频加载失败，将静音游玩', 512, 738, 18, '#ffb0b0', 'center');
  }
  panel.tex.needsUpdate = true;
}
function drawResult(g) {
  const r = result, c = r.s.counts;
  neon(g, r.pass ? 'CLEAR !' : 'TRY AGAIN', 512, 70, 62, r.pass ? P.b : P.a);
  neon(g, r.gr, 190, 240, 170, r.gr === 'S' ? '#ffe35a' : P.a);
  txt(g, `SCORE  ${r.s.score}`, 330, 180, 40, '#fff', 'left', 800); txt(g, `命中率 ${(hitRate() * 100).toFixed(1)}%（需要 ${Math.round(DIFFS[r.diff].need * 100)}%）`, 330, 226, 26);
  txt(g, `♪ ${cur.song.zh} · ${ENV_DEFS[cur.env].zh}`, 330, 332, 20, '#ffd0f4');
  txt(g, `最大连击 ${r.s.maxCombo}`, 330, 262, 26);
  txt(g, `PERFECT ${c[0]}   GREAT ${c[1]}   GOOD ${c[2]}   MISS ${c[3]}`, 330, 300, 24, '#9fb4ff');
  if (r.pass && r.newly.length) {
    txt(g, '✨ 新解锁手办', 512, 360, 30, '#ffe35a', 'center', 800);
    r.newly.forEach((m, k) => { const idx = models.indexOf(m), x = 512 - r.newly.length * 90 + k * 180 + 10; tile(g, idx, x, 390, 160, false, true); txt(g, `#${m.n ?? idx + 1}`, x + 80, 570, 22, '#fff', 'center', 800); });
  } else if (r.pass) txt(g, '已解锁过的手办 · 刷新了你的最高分', 512, 420, 26, '#9fb4ff', 'center');
  else txt(g, `再多命中 ${Math.max(0, Math.ceil(DIFFS[r.diff].need * r.s.total) - r.s.hits)} 个音符就能解锁`, 512, 420, 28, '#ffb0e8', 'center');
  btn(g, 'again', 60, 626, 270, 76, pReady() ? '再来一次' : '加载下一局…', { fs: 28, sel: pReady(), dim: !pReady() }); btn(g, 'menu', 370, 626, 270, 76, '返回选择', { fs: 30 });
  btn(g, 'gallery', 680, 626, 284, 76, r.m ? '去展厅看看' : '展厅', { fs: 28 });
  panel.tex.needsUpdate = true;
}
function drawHud() {
  const g = hud.g; g.clearRect(0, 0, 768, 256); if (!stats) return;
  rr(g, 6, 6, 756, 244, 24); g.fillStyle = 'rgba(8,4,28,.55)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
  txt(g, 'SCORE', 36, 40, 20, '#9fb4ff'); txt(g, String(stats.score).padStart(7, '0'), 36, 82, 44, '#fff', 'left', 800);
  const acc = stats.total ? (stats.counts[0] + stats.counts[1] * 0.8 + stats.counts[2] * 0.5) / Math.max(1, stats.counts.reduce((a, b) => a + b, 0)) : 0;
  txt(g, 'ACC', 732, 40, 20, '#9fb4ff', 'right'); txt(g, (acc * 100).toFixed(1) + '%', 732, 82, 44, '#fff', 'right', 800);
  if (stats.combo > 1) neon(g, `${stats.combo} COMBO`, 384, 50, 40, P.b);
  if (judgeT > 0) { const col = ['#ffe35a', '#6dffb0', '#9fd0ff', '#ff6b8a'][judgeK]; g.save(); g.shadowColor = col; g.shadowBlur = 18; txt(g, judgeText, 384, 124, judgeText.length > 5 ? 44 : 56, col, 'center', 800); g.restore(); }
  const p = songTime() / ROUND, ur = Math.min(1, stats.hits / Math.max(1, cfg.need * stats.total));
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(36, 176, 696, 14); g.fillStyle = P.b; g.fillRect(36, 176, 696 * Math.min(1, Math.max(0, p)), 14);
  txt(g, '解锁进度', 36, 214, 20, '#ffd0f4'); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(140, 206, 592, 16);
  const gr = g.createLinearGradient(140, 0, 732, 0); gr.addColorStop(0, P.a); gr.addColorStop(1, '#ffe35a'); g.fillStyle = gr; g.fillRect(140, 206, 592 * ur, 16);
  hud.tex.needsUpdate = true;
}

// ---------- 面板交互 ----------
function click(id) {
  if (!id) return;
  if (id.startsWith('d:')) { save.diff = id.slice(2); cfg = DIFFS[save.diff]; persist(); }
  else if (id.startsWith('m:')) { save.sel = +id.slice(2); persist(); showFigure(save.sel); }
  else if (id.startsWith('pg:')) { const pages = Math.max(1, Math.ceil(models.length / 18)); page = (page + +id.slice(3) + pages) % pages; }
  else if (id.startsWith('off:')) { save.offset = Math.max(-300, Math.min(300, save.offset + +id.slice(4))); persist(); }
  else if (id === 'reroll') { newPending(); showPending(); return; }
  else if (id === 'start' || id === 'again') { if (pReady()) { if (actx) actx.resume(); startSong(); } }
  else if (id === 'menu') { quitToMenu(); return; }
  else if (id === 'back') { exitToShowcase(null); return; }
  else if (id === 'gallery') { exitToShowcase(result?.m ? models.indexOf(result.m) : save.sel); return; }
  drawPanel();
}
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function padHit(uv) { const px = uv.x * 1024, py = (1 - uv.y) * 768; return rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null; }
function setHover(id) { if (id !== hoverId) { hoverId = id; drawPanel(); } }
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!active || renderer.xr.isPresenting || !panel.mesh.visible) return; mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const h = ray.intersectObject(panel.mesh)[0]; const r = h ? padHit(h.uv) : null; setHover(r?.id || null); renderer.domElement.style.cursor = r ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!active || renderer.xr.isPresenting || !panel.mesh.visible) return; if (actx) actx.resume(); mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const h = ray.intersectObject(panel.mesh)[0]; const r = h ? padHit(h.uv) : null; if (r) click(r.id);
});
const KEYMAP = { KeyS: 0, KeyD: 1, KeyK: 2, KeyL: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };   // 避开展厅的 F/G/M/P/Q/E/R 快捷键
addEventListener('keydown', (e) => {
  if (!active || e.repeat) return; if (actx) actx.resume();
  if (e.code === 'Escape' && state === 'playing') { quitToMenu(); return; }
  if (e.code === 'Space' || e.code === 'Enter') { if (state === 'menu') click('start'); else if (state === 'result') click('again'); e.preventDefault(); return; }
  if (state === 'playing' && e.code in KEYMAP && !renderer.xr.isPresenting) {
    const col = KEYMAP[e.code], now = songTime(); let best = null, bd = 9;
    for (let i = lo; i < hi; i++) { const n = notes[i]; if (n.s === 0 && n.c === col && Math.abs(n.t - now) < cfg.win[2] && Math.abs(n.t - now) < bd) { bd = Math.abs(n.t - now); best = n; } }
    if (best) judge(best, best.t - now, null); else { const fr = frames.filter((f) => f.userData.c === col); fr.forEach((f) => { f.userData.flash = 0.4; }); }
  }
});

// ---------- 定位：把游戏场放到玩家面前 ----------
let headY = 1.6;
function recenter() {
  if (renderer.xr.isPresenting) {
    camera.getWorldPosition(tmpV); camera.getWorldDirection(tmpV2); const yaw = Math.atan2(-tmpV2.x, -tmpV2.z);
    play.position.set(tmpV.x, 0, tmpV.z); play.rotation.set(0, yaw, 0); headY = tmpV.y || 1.6;
  } else { play.position.set(0, 0, 0.6); play.rotation.set(0, 0, 0); headY = 1.5; }
  base = Math.min(1.25, Math.max(0.6, headY - 0.65)); layoutFrames();
  const k = renderer.xr.isPresenting ? 1 : 1.45; panel.mesh.scale.setScalar(k); hud.mesh.scale.setScalar(k);
  panel.mesh.position.set(0, headY - 0.08, -1.55); hud.mesh.position.set(0, base + 1.12, -3.0);
}
function checkRecenter() { if (needRecenter > 0 && renderer.xr.isPresenting && ++needRecenter > 8) { needRecenter = 0; recenter(); drawPanel(); } }
let needRecenter = 0;
renderer.xr.addEventListener('sessionstart', () => { if (!active) return; camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); needRecenter = 1; if (actx) actx.resume(); });
renderer.xr.addEventListener('sessionend', () => { needRecenter = 0; deskCamera(); if (active) deactivate(); });

// ---------- 主循环 ----------
let T = 0, frames_ = 0;
function updateXRPanelRay() {
  for (let i = 0; i < 2; i++) {
    const rec = ctrls[i]; if (!rec.src) { rec.laser.visible = false; continue; }
    const show = panel.mesh.visible; rec.laser.visible = show; rec.halo.visible = state === 'playing'; rec.tip.visible = true;
    if (!show) { controls.hover[i] = null; continue; }
    rec.c.updateMatrixWorld(true); ray.ray.origin.setFromMatrixPosition(rec.c.matrixWorld); ray.ray.direction.set(0, 0, -1).transformDirection(rec.c.matrixWorld);
    const h = ray.intersectObject(panel.mesh)[0]; let len = 3;
    if (h) { len = h.distance; const r = padHit(h.uv); controls.hover[i] = r; if (r && r.id !== hoverId) { setHover(r.id); controls.haptic(rec.side, 0.12, 10); } else if (!r && hoverId && controls.hover[1 - i] == null) setHover(null); } else controls.hover[i] = null;
    rec.laser.scale.z = len;
  }
  // 左手 X：演奏中途退出
  const gp = ctrls.find((c) => c.side === 0)?.src?.gamepad; if (gp && state === 'playing' && gp.buttons[4]?.pressed && !controls.xDown) { controls.xDown = true; quitToMenu(); } else if (gp && !gp.buttons[4]?.pressed) controls.xDown = false;
}
function frame(dtIn) {
  const dt = Math.min(dtIn, 0.1); T += dt;
  checkRecenter();
  if (renderer.xr.isPresenting) { syncMainControllers(); updateXRPanelRay(); }
  if (state === 'playing') updatePlay(dt);
  // 视觉
  pulse *= Math.exp(-dt * 6); const sp = state === 'playing' ? songTime() : T * 0.5;
  camera.getWorldPosition(tmpV3); const au = Math.min(1, 0.2 + pulse * 0.9) * (app.st?.react ?? 1);
  if (envIdx >= 0) genvs.update(T, dt, tmpV3, au, 0.9 / ENV_SCALE);
  figReveal += (figTarget - figReveal) * Math.min(1, dt * (state === 'playing' ? 4 : 1.5));
  const cy = FIG_H * 1.03 * figReveal; revealPlane.constant = cy; ghostPlane.constant = -cy;
  scanPlane.visible = figReveal > 0.01 && figReveal < 0.985; scanPlane.position.y = figReveal * 1.03;
  const br = Math.sin(T * 1.3); figure.scale.set(FIG_H * (1 + 0.006 * br), FIG_H * (1 + 0.014 * br), FIG_H * (1 + 0.006 * br)); figure.position.y = 0;   // 只呼吸，不旋转
  lA.intensity = lB.intensity = 4500 + 5000 * pulse;
  for (const f of frames) { const u = f.userData; u.flash = Math.max(0, u.flash - dt * 3.5); f.material.opacity = 0.22 + u.flash * 0.8; f.scale.setScalar(1 + u.flash * 0.25); }
  if (judgeT > 0) { judgeT -= dt; hudDirty = true; }
  hudT += dt; if (state === 'playing' && hud.mesh.visible && (hudDirty || hudT > 0.12) && hudT > 0.05) { drawHud(); hudT = 0; hudDirty = false; }
  updateParticles(dt);
  renderer.render(scene, camera); if (++frames_ === 8) window.__ready = true;
}

// ---------- 进入 / 退出游戏（与展厅共用同一个页面和 XR 会话）----------
let booting = null;
function boot() {
  if (!booting) booting = (async () => { await loadData(); newPending(); })();
  return booting;
}
async function activate() {
  active = true; state = 'menu'; stopSong(); hud.mesh.visible = false; panel.mesh.visible = true;
  app.music?.stop();                                    // 展厅的背景音乐让位给游戏里的歌
  if (app.ui?.dom) app.ui.dom.style.display = 'none'; if (app.ui?.mesh) app.ui.mesh.visible = false;
  app.controls?.ctrls?.forEach((m) => { m.laser.visible = false; m.dot.visible = false; });
  for (let i = 0; i < 2; i++) { rig.add(renderer.xr.getController(i), renderer.xr.getControllerGrip(i)); ctrls[i].tip.visible = true; }
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (renderer.xr.isPresenting) { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); needRecenter = 1; } else deskCamera();
  if (actx) actx.resume();
  recenter(); layoutFrames(); drawPanel();
  await boot(); if (!active) return;
  recenter(); layoutFrames(); showPending(); showFigure(save.sel);
}
function deactivate() {
  if (!active) return; active = false; stopSong(); state = 'menu'; hud.mesh.visible = false; noteCore.count = noteWire.count = 0;
  for (let i = 0; i < 2; i++) { app.rig.add(renderer.xr.getController(i), renderer.xr.getControllerGrip(i)); ctrls[i].laser.visible = ctrls[i].tip.visible = ctrls[i].halo.visible = false; }
  if (app.envs && app.envs.cur >= 0) app.envs.set(app.envs.cur);        // 把展厅的调色板还回去
  if (app.st?.music) app.music?.start();
  app.toggleUI?.(app.st.uiOpen); app.ui?.invalidate();
}
function exitToShowcase(idx) {                           // 回到展厅（VR 里不会退出会话）
  deactivate(); if (idx != null && idx >= 0) app.selectModel?.(idx);
}
const api = {
  get active() { return active; }, frame, activate, deactivate,
  debug: { round: () => cur, pending: () => pending, notes: () => notes, now: songTime, toWorld: (x, y, z) => play.localToWorld(new THREE.Vector3(x, y, z)), COLX, rowY, HIT_Z, SPEED, panelPos: () => panel.mesh.getWorldPosition(new THREE.Vector3()), hover: () => hoverId },
  skip: (sec) => { fallbackT0 -= (sec * 1000) / RATE; startAt -= sec; }, state: () => state, save, click, get stats() { return stats; }, get result() { return result; },
};
window.GM = api;
return api;
}
