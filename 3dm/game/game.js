// 3DM · 音乐游戏：用手柄触碰沿节奏飞来的音符，通关解锁手办。
// 与展厅共用同一个渲染器和 XR 会话（由 src/main.js 的 DM.openGame() 加载），所以可以在 VR 里直接来回切换，不会退出到浏览器。
// 只读取 models.json / thumbs.webp / models_lod，解锁进度存在 localStorage。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Envs, ENV_DEFS, PAL } from '../src/envs.js';
import { lifeify, tickLife, LIFE } from '../src/life.js';       // 呼吸方案与展示模式完全一致（同一套着色器 / 同一份设置）     // 复用展厅的 8 个场景

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), BOT = Q.has('bot'), RATE = Number(Q.get('rate') || 1), SILENT = Q.has('silent');   // rate/silent/bot 仅用于自动化测试

// ---------- 常量 ----------
const COL = [0x30f0ff, 0xff2fd0];                    // 左手青 / 右手粉
const COLX = [-0.5, -0.17, 0.17, 0.5];               // 四列的 x（米，相对玩家）
const HIT_Z = -0.55, SPEED = 8, TIP_R = 0.17, LEAD = 0.8, WARM = 5;   // WARM：每局先放 5 秒音乐热身，这段没有谱子
const FIG_H = 25, FIG_Z = -30;                        // 巨像：25 米高、离玩家 30 米，略微抬头就能看到全貌
const ROUND = 90;                                     // 每局时长（秒），从歌曲的随机位置开始
const ENV_SCALE = 2.2;                                // 展厅场景放大倍数（配合 30 米巨像）
const MP3_BASE = 'https://pub-bd539265c2a1491c845fd2758d51b673.r2.dev/mp3s/';
const pick = (a) => a[(Math.random() * a.length) | 0];
const DIFFS = {
  easy:   { zh: '简单', appr: 2.0, need: 0.60, win: [0.06, 0.12, 0.2],    any: false, desc: '约 1 个/秒 · 蓝球左手 · 红球右手' },
  normal: { zh: '普通', appr: 1.7, need: 0.75, win: [0.055, 0.105, 0.17], any: false, desc: '约 2 个/秒 · 蓝球左手 · 红球右手' },
  hard:   { zh: '困难', appr: 1.45, need: 0.90, win: [0.045, 0.09, 0.15], any: false, desc: '约 3 个/秒 · 蓝球左手 · 红球右手' },
};
const JUDGE = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
const JPTS = [1000, 700, 400, 0];

// ---------- 存档 ----------
const SKEY = 'dm_game_v1';
const BASE_SONGS = ['s48', 's50', 's51', 's58', 's74', 's79'];       // 默认可玩的歌，其余歌曲通关解锁
const save = { unlocked: [], songs: [], best: {}, offset: 0, sel: 0, diff: 'normal', frames: false, pick: null };
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
function deskCamera() { camera.position.copy(DESK_CAM); camera.lookAt(0, 8.6, -29); }
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
figure.add(scanPlane); scanPlane.visible = false;   // 旧的整面扫描平面已弃用（会划过视线）：改为只画在模型表面的“绘制”特效
const revU = { uRev: { value: 0 }, uAct: { value: 0 } };
const FX_BELOW = `
  { float dd = uRev - vRW.y; float on = step(0.0, dd) * uAct;
    float band = on * smoothstep(3.2, 0.0, dd), edge = on * smoothstep(0.55, 0.0, dd);
    float hl = smoothstep(0.86, 1.0, abs(sin(vRW.y * 9.42 - uRT * 3.0))), vl = smoothstep(0.9, 1.0, abs(sin((vRW.x + vRW.z * 0.7) * 5.0 + uRT * 0.8)));
    float grid = max(hl, vl) * (0.75 + 0.25 * sin(uRT * 37.0 + vRW.y * 3.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.25, 0.95, 1.0) * (0.3 + grid * 1.5), band * 0.6) + vec3(0.7, 1.0, 1.0) * edge * 2.2; }`;
const FX_ABOVE = `
  { float du = vRW.y - uRev; float on = step(0.0, du) * uAct; float gb = on * smoothstep(3.0, 0.0, du);
    float hl = smoothstep(0.86, 1.0, abs(sin(vRW.y * 9.42 - uRT * 3.0))), vl = smoothstep(0.9, 1.0, abs(sin((vRW.x + vRW.z * 0.7) * 5.0 + uRT * 0.8)));
    float grid = max(hl, vl) * (0.75 + 0.25 * sin(uRT * 37.0 + vRW.y * 3.0));
    gl_FragColor.rgb += vec3(0.25, 0.95, 1.0) * (grid * 1.3 + 0.12) * gb * 1.6; gl_FragColor.a = max(gl_FragColor.a, gb * 0.9); }`;
function revealfx(mat, below) {     // 解锁分界线只在模型表面发光 + 全息网格，像是正在被一笔笔画出来
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey.call(mat) : '';
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r); sh.uniforms.uRev = revU.uRev; sh.uniforms.uAct = revU.uAct; sh.uniforms.uRT = LIFE.uT;
    sh.vertexShader = 'varying vec3 vRW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vRW; uniform float uRev, uAct, uRT;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', (below ? FX_BELOW : FX_ABOVE) + '\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => key + (below ? '|rvB' : '|rvG'); mat.needsUpdate = true;
}
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
  real.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData = {}; o.material.clippingPlanes = [revealPlane]; lifeify(o.material, o); revealfx(o.material, true); } });
  ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x3b1f78, transparent: true, opacity: 0.62, clippingPlanes: [ghostPlane], side: THREE.DoubleSide, depthWrite: false, toneMapped: false }); lifeify(o.material, o); revealfx(o.material, false); } });
  figure.add(ghost, real); figReveal = 0; figTarget = isUnlocked(m.id) && state !== 'playing' ? 1 : 0;
}

// ---------- 音频 ----------
const AC = window.AudioContext || window.webkitAudioContext; let actx = null, musicGain = null, sfxGain = null, src = null, startAt = 0, roundGain = null;
try { actx = new AC(); musicGain = actx.createGain(); musicGain.gain.value = 0.85; sfxGain = actx.createGain(); sfxGain.gain.value = 0.5; musicGain.connect(actx.destination); sfxGain.connect(actx.destination); } catch (e) { actx = null; }
// 音效：全部用振荡器 / 噪声现场合成，不需要音频文件。触碰方块本身不再有音效。
const sfxOn = () => actx && actx.state === 'running';
function tone(f, t0 = 0, d = 0.15, type = 'sine', vol = 0.18, f2 = 0) {
  if (!sfxOn()) return; const t = actx.currentTime + t0, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(sfxGain); o.start(t); o.stop(t + d + 0.03);
}
function noiseSweep(t0, d, vol, fa, fb) {
  if (!sfxOn()) return; const t = actx.currentTime + t0, n = Math.floor(actx.sampleRate * d), buf = actx.createBuffer(1, n, actx.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  const sr = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain(); sr.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 3;
  bp.frequency.setValueAtTime(fa, t); bp.frequency.exponentialRampToValueAtTime(fb, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + d * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  sr.connect(bp).connect(g).connect(sfxGain); sr.start(t); sr.stop(t + d + 0.02);
}
const sfxTick = (p) => tone(700 + p * 1100, 0, 0.035, 'square', 0.05);
function sfxGrade(gr) {            // 不同评价，不同音效
  const arp = (fs, gap, type, vol, d) => fs.forEach((f, k) => tone(f, k * gap, d, type, vol));
  if (gr === 'S') { arp([523, 659, 784, 1047, 1319], 0.085, 'triangle', 0.2, 0.28); [1047, 1319, 1568].forEach((f) => tone(f, 0.5, 1.5, 'sine', 0.11)); tone(130, 0.45, 0.9, 'square', 0.07); noiseSweep(0.4, 1.1, 0.09, 1800, 9000); }
  else if (gr === 'A') { arp([523, 659, 784, 1047], 0.1, 'triangle', 0.18, 0.3); tone(1047, 0.4, 0.9, 'sine', 0.08); }
  else if (gr === 'B') { arp([494, 659, 784], 0.12, 'triangle', 0.16, 0.28); }
  else if (gr === 'C') { arp([392, 523], 0.16, 'sine', 0.16, 0.3); }
  else if (gr === 'D') { arp([330, 262], 0.2, 'sawtooth', 0.09, 0.35); }
  else { tone(330, 0, 1.0, 'sawtooth', 0.14, 70); tone(80, 0.05, 0.6, 'sine', 0.3, 40); }   // 失败
}
const sfxWhoosh = () => noiseSweep(0, 0.85, 0.13, 300, 3200);
function sfxBoxOpen() { tone(120, 0, 0.35, 'sine', 0.35, 40); noiseSweep(0, 0.6, 0.16, 500, 7000); [1319, 1568, 1976, 2637].forEach((f, k) => tone(f, 0.14 + k * 0.07, 0.5, 'sine', 0.12)); tone(1047, 0.2, 1.3, 'triangle', 0.1); }
let fallbackT0 = 0;
const songTime = () => (cur && cur.state === 'ok' && cur.buf && actx && !SILENT ? actx.currentTime - startAt - (actx.outputLatency || 0) : ((performance.now() - fallbackT0) / 1000) * RATE - LEAD) + save.offset / 1000;

// ---------- 数据 ----------
let songs = [], models = [], sheet = null, state = 'menu', cfg = DIFFS[save.diff] || DIFFS.normal;
// ---------- 回合：随机歌曲 + 随机场景 + 随机 90 秒片段 ----------
const songOpen = (id) => BASE_SONGS.includes(id) || save.songs.includes(id);
// 可选时长：1分30秒 / 3分30秒（歌曲够长才有）/ 完整；很短的歌只有完整版
const modesFor = (sg) => { const d = sg.duration, m = []; if (d >= 95) m.push(90); if (d >= 225) m.push(210); m.push('full'); return m; };
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const modeName = (sg, m) => (m === 'full' ? `完整版 ${fmtT(sg.duration)}` : m === 90 ? '1分30秒版' : '3分30秒版');
const chartCache = new Map(); let cur = null, pending = null, lastSong = null;
async function getChart(id) { if (!chartCache.has(id)) chartCache.set(id, fetch(`./game/charts/${id}.json`).then((r) => r.json())); return chartCache.get(id); }
const lastStart = {};
function makeRound(fo = null) {
  const pk = save.pick && songs.find((x) => x.id === save.pick.id && songOpen(x.id));
  const song = fo?.song || (Q.get('gsong') && songs.find((x) => x.id === Q.get('gsong'))) || pk || (() => { const pool = songs.filter((x) => songOpen(x.id)), p2 = pool.filter((x) => x.id !== lastSong); return pick(p2.length ? p2 : pool.length ? pool : songs); })(); lastSong = song.id;
  const env = fo ? fo.env : Q.has('genv') ? (Number(Q.get('genv')) | 0) % ENV_DEFS.length : (Math.random() * ENV_DEFS.length) | 0;
  const ms = modesFor(song); let mode = Q.get('gmode') ? (Q.get('gmode') === 'full' ? 'full' : +Q.get('gmode')) : (fo ? fo.mode : pk && song === pk ? save.pick.mode : null); if (!ms.includes(mode)) mode = ms[0];
  const r = { song, env, mode, len: mode === 'full' ? song.duration : mode, state: 'loading', start: 0, buf: null, beats: [], charts: null };
  r.promise = (async () => {
    const d = await getChart(song.id); r.data = d; const dur = d.duration, full_ = mode === 'full', need = (full_ ? dur : mode) + 2;
    let st = 0;
    if (!full_) {       // 从整首歌里随机抽一段：起点是任意一拍，要求这一段里有足够的音符；尽量避开上一次的位置
      const ez = d.charts.easy, cnt = (a, b) => { let l = 0, h = ez.length; while (l < h) { const m = (l + h) >> 1; if (ez[m][0] < a) l = m + 1; else h = m; } const i0 = l; h = ez.length; while (l < h) { const m = (l + h) >> 1; if (ez[m][0] <= b) l = m + 1; else h = m; } return l - i0; };
      const all = d.beats.filter((t, i) => i % 3 === 0 && t + need <= dur), rich = all.filter((t) => cnt(t + WARM, t + mode) >= 0.45 * (mode - WARM)), pool0 = rich.length >= 4 ? rich : all;
      const lastS = lastStart[song.id], pool = pool0.filter((t) => lastS == null || Math.abs(t - lastS) > mode * 0.35), pl = pool.length >= 2 ? pool : pool0;
      st = Q.has('gstart') ? Number(Q.get('gstart')) : fo ? fo.start : pl.length ? pick(pl) : Math.max(0, dur - need); lastStart[song.id] = st;
    }
    const len = full_ ? dur : Math.min(mode, dur - st); r.len = len; r.start = st;
    r.beats = d.beats.filter((t) => t >= st && t <= st + len + 2).map((t) => t - st);
    const tEnd = st + len - (full_ ? 1.5 : 0);
    r.charts = {}; for (const k of Object.keys(DIFFS)) r.charts[k] = d.charts[k].filter((a) => a[0] >= st + WARM && a[0] <= tEnd).map((a) => [a[0] - st, a[1], a[2], a[3]]);
    if (!actx || SILENT) { r.state = 'ok'; return; }
    try {
      const ab = await (await fetch(MP3_BASE + encodeURIComponent(song.file))).arrayBuffer(), full = await actx.decodeAudioData(ab), sr = full.sampleRate;
      const s0 = Math.floor(st * sr), n = Math.min(full.length - s0, Math.floor((len + 2.5) * sr));
      if (s0 === 0 && n >= full.length) r.buf = full;       // 完整版：直接用整首
      else { const win = actx.createBuffer(full.numberOfChannels, n, sr); for (let c = 0; c < full.numberOfChannels; c++) win.copyToChannel(full.getChannelData(c).subarray(s0, s0 + n), c); r.buf = win; }   // 只保留这一局用到的片段，省内存
      r.state = 'ok';
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
  if (!pReady()) return; stopPreview(); cur = pending; pending = null; prefetched = false; applyEnv(cur.env); cfg = DIFFS[save.diff];
  const ch = cur.charts[save.diff];
  notes = ch.map((a) => ({ t: a[0], c: a[1], r: a[2], h: a[3], s: 0 })); lo = hi = 0; beatIdx = 0; stats = resetStats(); judgeText = ''; result = null; notified = false;
  recenter(); layoutFrames(); panel.mesh.visible = false; hud.mesh.visible = true; hudDirty = true;
  if (actx && cur.buf && !SILENT) {
    actx.resume(); src = actx.createBufferSource(); src.buffer = cur.buf; roundGain = actx.createGain(); src.connect(roundGain).connect(musicGain); startAt = actx.currentTime + LEAD; src.start(startAt);
    roundGain.gain.setValueAtTime(0, startAt); roundGain.gain.linearRampToValueAtTime(1, startAt + 0.5); roundGain.gain.setValueAtTime(1, startAt + cur.len - 2.5); roundGain.gain.linearRampToValueAtTime(0, startAt + cur.len);
  } else fallbackT0 = performance.now();
  state = 'playing'; figTarget = 0; figReveal = 0; doneT = 0; hp = HP_START; hurtT = 0; failing = false; failT = 0; ending = false; endT = 0; hideGacha();
  for (const m of frames) m.userData.flash = 0;
}
function stopSong() { try { src?.stop(); } catch (e) { /* 已停止 */ } src = null; }
function quitToMenu() { stopSong(); stopPreview(); state = 'menu'; view = 'main'; failing = false; hideGacha(); showPending(); hud.mesh.visible = false; panel.mesh.visible = true; recenter(); showFigure(save.sel); drawPanel(); }

function judge(n, dt, hand) {
  const w = cfg.win, a = Math.abs(dt), k = a <= w[0] ? 0 : a <= w[1] ? 1 : 2;
  n.s = 1; stats.counts[k]++; stats.hits++; stats.combo++; stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
  stats.score += Math.round(JPTS[k] * (1 + Math.min(stats.combo, 50) / 50)); hpAdd(HP_HIT);
  judgeText = JUDGE[k]; judgeK = k; judgeT = 0.5; hudDirty = true;
  const x = COLX[n.c], y = rowY(n.r); burst(x, y, HIT_Z, COL[n.h], k === 0 ? 20 : 12); 
  const fr = frames.find((f) => f.userData.c === n.c && f.userData.r === n.r); if (fr) fr.userData.flash = 1; pulse = Math.max(pulse, 0.6);
  if (hand != null && hand >= 0) controls.haptic(hand, k === 0 ? 0.7 : 0.45, 35);
  if (!notified && stats.hits >= cfg.need * stats.total) { notified = true; judgeText = 'UNLOCK READY'; judgeT = 1.4; judgeK = 0; burst(0, 1.4, -1.5, 0xffffff, 60); }
}
let notified = false, prefetched = false;
// 能量条（参考节奏光剑）：一开始 50%，命中 +1%，漏掉大幅下降，降到 0 就失败（音乐变慢 → LEVEL FAILED → 重来）
const HP_START = 50, HP_HIT = 1, HP_MISS = { easy: 1.0, normal: 1.8, hard: 4.0 };
let hp = HP_START, hurtT = 0, failing = false, failT = 0, ending = false, endT = 0;
const RESULT_DELAY = 5;      // 一局结束后，等 3 秒再弹出结算
const hpAdd = (v) => { hp = Math.max(0, Math.min(100, hp + v)); };
function miss(n) {
  n.s = 2; stats.counts[3]++; stats.combo = 0; judgeText = 'MISS'; judgeK = 3; judgeT = 0.4; hudDirty = true;
  if (failing) return; hpAdd(-HP_MISS[save.diff]); hurtT = 0.4;
  if (hp <= 0) {            // 能量耗尽：音乐渐慢，稍等一下再进入失败结算
    failing = true; failT = RESULT_DELAY; judgeText = 'LEVEL FAILED'; judgeK = 3; judgeT = 2; controls.haptic(0, 1, 250); controls.haptic(1, 1, 250);
    try { src?.playbackRate.cancelScheduledValues(0); src?.playbackRate.setValueAtTime(1, actx.currentTime); src?.playbackRate.linearRampToValueAtTime(0.12, actx.currentTime + 1.0); roundGain?.gain.linearRampToValueAtTime(0, actx.currentTime + 1.1); } catch (e) { /* ignore */ }
    tone(330, 0, 1.0, 'sawtooth', 0.12, 70);
  }
}

function updatePlay(dt) {
  if (failing) { failT -= dt; hudDirty = true; if (failT <= 0) finish(true); return; }
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
  if (!prefetched && now > 15) { prefetched = true; if (cur.mode === 90 || !save.pick) newPending(); }   // 长版本不预载，省内存       // 开局后再悄悄预载下一局，避免开场卡顿
  // 结束
  if (!ending && (now > cur.len || (notes.length && lo >= notes.length && now > notes[notes.length - 1].t + 0.3))) { ending = true; endT = RESULT_DELAY; judgeText = 'COMPLETE'; judgeK = 0; judgeT = RESULT_DELAY; hudDirty = true; burst(0, 1.4, -1.5, 0xffffff, 30); }
  if (ending) { endT -= dt; if (endT <= 0) finish(); }
  if (now < WARM && now > WARM - 3) { const c = Math.ceil(WARM - now); if (judgeText !== String(c)) { judgeText = String(c); judgeK = 1; judgeT = 0.9; hudDirty = true; } }   // 热身最后 3 秒倒数
}

function grade(acc) { return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D'; }
function finish(failed = false) {
  stopSong(); state = 'result'; failing = false; ending = false; const c = stats.counts, acc = stats.total ? (c[0] + c[1] * 0.8 + c[2] * 0.5) / stats.total : 0, pass = !failed && hitRate() >= cfg.need, m = models[save.sel];
  const gr = failed ? 'F' : grade(acc), newly = [], newSongs = [];
  if (pass && m && !isUnlocked(m.id)) { save.unlocked.push(m.id); newly.push(m); }
  if (m && !failed) { const old = save.best[m.id]; if (!old || stats.score > old.score) save.best[m.id] = { score: stats.score, grade: gr, diff: save.diff }; }
  if (pass) { const locked = songs.filter((x) => !songOpen(x.id)); if (locked.length) { const sg = pick(locked); save.songs.push(sg.id); newSongs.push(sg); } }   // 通关解锁 1 首歌
  let gacha = null;          // S 评级：额外抽卡，3 个盒子里选 1 个，每个盒子 = 1 个手办 + 1 首音乐
  if (pass && gr === 'S') {
    const shuf = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const lm = shuf(models.filter((x) => !isUnlocked(x.id) && x !== m && !newly.includes(x))), ls = shuf(songs.filter((x) => !songOpen(x.id) && !newSongs.includes(x)));
    const boxes = [0, 1, 2].map((i) => ({ model: lm.length ? lm[i % lm.length] : null, song: ls.length ? ls[i % ls.length] : null })).filter((b) => b.model || b.song);
    if (boxes.length) { while (boxes.length < 3) boxes.push(boxes[boxes.length - 1]); gacha = { boxes, opened: -1, t: 0, openT: 0 }; }
  }
  persist(); result = { acc, pass, gr, newly, newSongs, s: stats, diff: save.diff, m, fail: failed, gacha };
  resT = 0; resF = {}; resNext = 0; hideGacha();
  hud.mesh.visible = false; panel.mesh.visible = true; recenter(); noteCore.count = noteWire.count = 0; figTarget = pass ? 1 : figTarget; view = 'main';
  if (failed) pending = makeRound({ song: cur.song, env: cur.env, mode: cur.mode, start: cur.start }); else if (!pending) newPending();
  drawPanel();
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
  c.addEventListener('selectstart', () => {
    if (active && gachaLive()) { rec.c.updateMatrixWorld(true); ray.ray.origin.setFromMatrixPosition(rec.c.matrixWorld); ray.ray.direction.set(0, 0, -1).transformDirection(rec.c.matrixWorld); const b = gachaRay(ray); if (b) { openBox(b.userData.i); return; } }
    if (active && panel.mesh.visible) { const h = controls.hover[i]; if (h) click(h.id); }
  });
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
const panel = new Panel(1024, 768, 1.6, 1.2);
// 节奏光剑式 HUD：连击在左侧、分数/倍数在右侧、进度条在视线下方，都不挡正前方
const hudL = new Panel(384, 256, 0.9, 0.6), hudR = new Panel(384, 256, 0.9, 0.6), hudB = new Panel(768, 192, 1.3, 0.325);
const hudG = new THREE.Group(); play.add(hudG); hudG.add(hudL.mesh, hudR.mesh, hudB.mesh); hudG.visible = false; const hud = { mesh: hudG };
const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif';
let rects = [], hoverId = null, hudDirty = true, page = 0, view = 'main', spage = 0, spick = null, smode = 90;
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
  if (locked) { g.fillStyle = 'rgba(4,1,14,.93)'; g.fillRect(x, y, sz, sz); g.save(); g.globalAlpha = 0.75; txt(g, '🔒', x + sz / 2, y + sz / 2 - sz * 0.05, sz * 0.26, '#fff', 'center'); g.restore(); }
  g.lineWidth = sel ? 4 : 1.5; g.strokeStyle = sel ? '#30f0ff' : 'rgba(255,255,255,.3)'; g.strokeRect(x, y, sz, sz);
}
function bg(g, w, h) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(14,6,40,.94)'); gr.addColorStop(1, 'rgba(6,16,40,.94)');
  rr(g, 4, 4, w - 8, h - 8, 28); g.fillStyle = gr; g.fill(); g.lineWidth = 4; const s = g.createLinearGradient(0, 0, w, 0); s.addColorStop(0, P.a); s.addColorStop(1, P.b); g.strokeStyle = s; g.stroke();
}
// 试听：点一首已解锁的歌，随机从中间某处起播 30 秒
let prevToken = 0, prevSrc = null, prevId = null, prevLoad = null, prevBuf = null;
function stopPreview() { prevToken++; const s0 = prevSrc; prevSrc = null; prevId = null; prevLoad = null; try { s0?.stop(); } catch (e) { /* 已停止 */ } }
async function playPreview(sg) {
  if (!actx || SILENT) return; stopPreview(); const tok = prevToken; prevLoad = sg.id; actx.resume(); drawPanel();
  let buf = prevBuf && prevBuf.id === sg.id ? prevBuf.buf : null;
  if (!buf) { try { const ab = await (await fetch(MP3_BASE + encodeURIComponent(sg.file))).arrayBuffer(); buf = await actx.decodeAudioData(ab); } catch (e) { if (tok === prevToken) { prevLoad = null; drawPanel(); } return; } if (tok !== prevToken) return; prevBuf = { id: sg.id, buf }; }
  const len = Math.min(30, buf.duration), st = Math.random() * Math.max(0, buf.duration - len), sr = actx.createBufferSource(), g = actx.createGain(), t = actx.currentTime + 0.05;
  sr.buffer = buf; sr.connect(g).connect(musicGain); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.7); g.gain.setValueAtTime(1, t + len - 1.5); g.gain.linearRampToValueAtTime(0, t + len); sr.start(t, st, len);
  prevSrc = sr; prevLoad = null; prevId = sg.id; sr.onended = () => { if (prevSrc === sr) { prevSrc = null; prevId = null; drawPanel(); } }; drawPanel();
}
let spgPages = 1;
function drawSongs(g) {
  neon(g, '选择音乐', 512, 44, 42, P.b);
  const nOpen = songs.filter((x) => songOpen(x.id)).length;
  txt(g, `已解锁 ${nOpen} / ${songs.length} · 通关解锁新歌，S 评级一次解锁 2 首`, 512, 84, 19, '#9fb4ff', 'center');
  const per = 16, pages = Math.max(1, Math.ceil(songs.length / per)); spage = Math.min(spage, pages - 1); spgPages = pages;
  for (let i = 0; i < per; i++) {
    const idx = spage * per + i; if (idx >= songs.length) break; const sg = songs[idx], op = songOpen(sg.id), sel = sg.id === spick;
    const x = 40 + (i % 2) * 488, y = 108 + (i >> 1) * 56, w = 468, h = 50; rects.push({ id: 'sg:' + sg.id, x, y, w, h });
    rr(g, x, y, w, h, 10); g.fillStyle = sel ? 'rgba(48,240,255,.28)' : op ? 'rgba(255,255,255,.09)' : 'rgba(6,2,20,.55)'; g.fill();
    g.lineWidth = sel || hoverId === 'sg:' + sg.id ? 3 : 1.4; g.strokeStyle = sel ? P.b : hoverId === 'sg:' + sg.id ? '#fff' : 'rgba(255,255,255,.28)'; g.stroke();
    txt(g, String(sg.n).padStart(2, '0'), x + 16, y + 26, 22, op ? '#ffd0f4' : '#6a5a88', 'left', 800);
    let t = sg.zh; g.font = `700 21px ${FONT}`; while (g.measureText(t).width > 290 && t.length > 2) t = t.slice(0, -1); if (t.length < sg.zh.length) t += '…';
    txt(g, t, x + 62, y + 26, 21, op ? '#fff' : '#7d6f9c', 'left', 700);
    if (op) { txt(g, fmtT(sg.duration), x + w - 14, y + 26, 18, '#9fb4ff', 'right', 600); if (save.pick && save.pick.id === sg.id) txt(g, '●', x + w - 70, y + 26, 16, '#6dffb0', 'right'); }
    else txt(g, '🔒', x + w - 16, y + 26, 22, '#fff', 'right');
  }
  btn(g, 'spg:-1', 40, 560, 70, 36, '◀', { fs: 20 }); btn(g, 'spg:1', 120, 560, 70, 36, '▶', { fs: 20 }); txt(g, `${spage + 1}/${pages}`, 205, 579, 20);
  const sg = songs.find((x) => x.id === spick);
  if (sg) {
    const op = songOpen(sg.id); txt(g, `♪ ${sg.zh}  ${sg.en}`.slice(0, 40), 300, 570, 22, '#fff', 'left', 700);
    txt(g, op ? `${fmtT(sg.duration)} · ${sg.bpm | 0} BPM` : '🔒 未解锁 · 通关其他歌曲后随机解锁', 760, 570, 19, op ? '#9fb4ff' : '#ffb0e8', 'left');
    const ms = modesFor(sg); ms.forEach((m, k) => btn(g, 'md:' + m, 40 + k * 232, 612, 220, 56, modeName(sg, m), { fs: 24, sel: op && smode === m, dim: !op }));
    btn(g, 'sok', 740, 612, 244, 56, '✓ 选定', { fs: 28, sel: op, dim: !op });
    if (op) txt(g, prevLoad === sg.id ? '♪ 试听加载中 …' : prevId === sg.id ? '♪ 试听中（随机 30 秒，再点一次换一段）' : '点歌名可试听随机 30 秒', 40, 592, 17, '#ffe9a8');
  } else txt(g, '点选一首歌曲', 512, 640, 24, '#9fb4ff', 'center');
  btn(g, 'srand', 40, 690, 220, 46, '🎲 随机选曲', { fs: 20 }); btn(g, 'sback', 280, 690, 200, 46, '← 返回', { fs: 20 });
  txt(g, '时长：1分30秒（随机片段）· 3分30秒 · 完整版；不足 3分30 的歌没有 3分30 选项', 500, 720, 16, '#7d8fc0', 'left');
  panel.tex.needsUpdate = true;
}
function drawPanel() {
  const g = panel.g; g.clearRect(0, 0, 1024, 768); bg(g, 1024, 768); rects = [];
  if (state === 'result' && result) return drawResult(g);
  if (view === 'songs') return drawSongs(g);
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
  txt(g, `手办 ${save.unlocked.length} / ${models.length}`, 40, 598, 20, '#cfd8ff', 'left', 700); txt(g, `音乐 ${songs.filter((x) => songOpen(x.id)).length} / ${songs.length}`, 40, 624, 20, '#9fe8ff', 'left', 700);
  const ready = pReady();
  btn(g, 'start', 300, 630, 424, 84, ready ? '▶  开始演奏' : '加载中 …', { fs: 34, sel: ready, dim: !ready });
  btn(g, 'back', 40, 650, 190, 52, '← 返回展厅', { fs: 22 });
  txt(g, `延迟补偿 ${save.offset >= 0 ? '+' : ''}${save.offset}ms`, 856, 612, 19, '#9fb4ff', 'center');
  btn(g, 'frames', 730, 556, 254, 40, save.frames ? '判定框线：开' : '判定框线：关', { fs: 19, sel: save.frames }); btn(g, 'off:-10', 756, 628, 66, 44, '−10', { fs: 20 }); btn(g, 'off:10', 890, 628, 66, 44, '+10', { fs: 20 });
  if (pending) {
    const sg = pending.song, ev = ENV_DEFS[pending.env];
    { let t = `♪ ${sg.zh}  ${sg.en}`; const full = t; g.font = `700 20px ${FONT}`; while (g.measureText(t).width > 290 && t.length > 6) t = t.slice(0, -2); if (t.length < full.length) t += '…'; txt(g, t, 262, 556, 20, '#fff', 'left', 700); }
    txt(g, `◈ 场景：${ev.zh} · ${sg.bpm | 0} BPM`, 262, 584, 19, '#9fb4ff'); txt(g, `⏱ ${modeName(sg, pending.mode)} · 含 5 秒热身${save.pick && save.pick.id === sg.id ? ' · 已选曲' : ''}`, 262, 610, 18, '#ffe9a8');
    btn(g, 'songs', 574, 538, 140, 36, '♪ 选曲', { fs: 19, sel: view === 'songs' }); btn(g, 'reroll', 574, 580, 140, 36, '🎲 随机', { fs: 18 });
    if (pending.state === 'fail') txt(g, '⚠ 谱面加载失败，请点「换一局」重试', 512, 738, 18, '#ffb0b0', 'center');
    else if (pending.silent) txt(g, '⚠ 歌曲音频加载失败，将静音游玩', 512, 738, 18, '#ffb0b0', 'center');
  }
  panel.tex.needsUpdate = true;
}
let resT = 0, resF = {}, resNext = 0, resDraw = 0;
const RES_END = 2.9, GRADE_T = 1.9;
const GCOLR = { S: '#ffe35a', A: '#6dffb0', B: '#30f0ff', C: '#c9a7ff', D: '#ff8aa0', F: '#ff4466' };
const GWORD = { S: 'SUPERB !', A: 'EXCELLENT', B: 'GOOD', C: 'NOT BAD', D: 'KEEP TRYING', F: 'LEVEL FAILED' };
const btnsReady = () => !!result && resT >= RES_END && (!result.gacha || result.gacha.opened >= 0);
function drawResult(g) {
  const r = result, c = r.s.counts, t = resT; if (t < RES_END) rects.push({ id: 'skip', x: 0, y: 0, w: 1024, h: 768 });
  const pk = Math.min(1, Math.max(0, (t - 0.15) / 1.6)), e = 1 - Math.pow(1 - pk, 3), gt = t - GRADE_T, col = GCOLR[r.gr];
  if (gt < 0) txt(g, 'RESULT', 512, 70, 44, 'rgba(159,180,255,.8)', 'center', 800);
  else { g.save(); g.globalAlpha = Math.min(1, gt / 0.3); neon(g, r.fail ? 'FAILED' : r.pass ? 'CLEAR !' : 'TRY AGAIN', 512, 70, 62, r.pass ? P.b : P.a); g.restore(); }
  const sp = pk < 1 ? 1 + 0.04 * Math.sin(t * 40) : 1;      // 计数时分数轻微跳动
  g.save(); g.translate(330, 180); g.scale(sp, sp); txt(g, `SCORE  ${Math.round(r.s.score * e)}`, 0, 0, 40, '#fff', 'left', 800); g.restore();
  txt(g, `命中率 ${(hitRate() * 100 * e).toFixed(1)}%（需要 ${Math.round(DIFFS[r.diff].need * 100)}%）`, 330, 226, 26);
  txt(g, `最大连击 ${Math.round(r.s.maxCombo * e)}`, 330, 262, 26);
  txt(g, `PERFECT ${Math.round(c[0] * e)}   GREAT ${Math.round(c[1] * e)}   GOOD ${Math.round(c[2] * e)}   MISS ${Math.round(c[3] * e)}`, 330, 300, 24, '#9fb4ff');
  if (gt >= 0) {                                              // 评价：砸入 + 冲击波 + 光点
    const k = Math.min(1, gt / 0.5), sc = 1 + 2.4 * Math.pow(1 - k, 2);
    if (gt < 1.0) { g.save(); g.globalAlpha = (1 - gt) * 0.9; g.strokeStyle = col; g.lineWidth = 9 * (1 - gt) + 1; g.beginPath(); g.arc(190, 240, 40 + gt * 440, 0, 7); g.stroke(); g.restore(); }
    g.save(); g.globalAlpha = Math.min(1, gt / 0.15); g.translate(190, 240); g.scale(sc, sc); neon(g, r.gr, 0, 0, 170, col); g.restore();
    if (r.gr === 'S' || r.gr === 'A') { const nS = r.gr === 'S' ? 16 : 8; for (let i = 0; i < nS; i++) { const a = i * 2.4 + gt * (r.gr === 'S' ? 1.2 : 0.6), rad = 100 + ((gt * 0.9 + i * 0.37) % 1) * 90, al = 1 - ((gt * 0.9 + i * 0.37) % 1); g.save(); g.globalAlpha = Math.max(0, al) * Math.min(1, gt); g.fillStyle = col; const x = 190 + Math.cos(a) * rad, y = 240 + Math.sin(a) * rad * 0.8; g.fillRect(x - 1.5, y - 7, 3, 14); g.fillRect(x - 7, y - 1.5, 14, 3); g.restore(); } }
    g.save(); g.globalAlpha = Math.min(1, Math.max(0, (gt - 0.25) / 0.3)); g.translate(Math.min(0, -60 * (1 - Math.min(1, (gt - 0.25) / 0.4))), 0); g.shadowColor = col; g.shadowBlur = 16; txt(g, GWORD[r.gr], 190, 345, 24, col, 'center', 800); g.restore();
  }
  const fa = Math.min(1, Math.max(0, (t - RES_END + 0.4) / 0.4)); g.save(); g.globalAlpha = fa;
  if (fa > 0) {
    txt(g, `♪ ${cur.song.zh} · ${ENV_DEFS[cur.env].zh}`, 330, 332, 20, '#ffd0f4');
    if (r.fail) txt(g, '能量耗尽 · 点「重来」再试一次（同一首歌、同一个片段）', 512, 440, 26, '#ffb0e8', 'center');
    else if (r.gacha && r.gacha.opened < 0) { txt(g, '✨ S 评级奖励 ✨', 512, 410, 38, '#ffe35a', 'center', 800); txt(g, '触碰面前三个盒子中的一个 · 每个盒子藏着 1 个手办 + 1 首音乐', 512, 458, 22, '#cfe8ff', 'center'); }
    else if (r.pass && r.newly.length) {
      txt(g, '✨ 新解锁手办', 512, 360, 30, '#ffe35a', 'center', 800);
      r.newly.forEach((m, k) => { const idx = models.indexOf(m), x = 512 - r.newly.length * 90 + k * 180 + 10; tile(g, idx, x, 390, 160, false, true); txt(g, `#${m.n ?? idx + 1}`, x + 80, 570, 22, '#fff', 'center', 800); });
    } else if (r.pass) txt(g, '已解锁过的手办 · 刷新了你的最高分', 512, 420, 26, '#9fb4ff', 'center');
    else if (!r.fail) txt(g, `再多命中 ${Math.max(0, Math.ceil(DIFFS[r.diff].need * r.s.total) - r.s.hits)} 个音符就能解锁`, 512, 420, 28, '#ffb0e8', 'center');
    if (r.pass && !(r.gacha && r.gacha.opened < 0)) txt(g, r.newSongs.length ? `♪ 解锁音乐：${r.newSongs.map((x) => x.zh).join('、')}${r.gacha ? '（含抽卡）' : ''}` : '♪ 音乐已全部解锁', 512, 600, 21, '#9fe8ff', 'center', 700);
  }
  g.restore();
  if (btnsReady()) {
    btn(g, 'again', 60, 626, 270, 76, pReady() ? (r.fail ? '重来' : '再来一次') : '加载中…', { fs: 28, sel: pReady(), dim: !pReady() }); btn(g, 'menu', 370, 626, 270, 76, '返回选择', { fs: 30 });
    btn(g, 'gallery', 680, 626, 284, 76, r.m ? '去展厅看看' : '展厅', { fs: 28 });
  }
  panel.tex.needsUpdate = true;
}
function updateResult(dt) {
  if (!result) return; const prev = resT; resT += dt;
  if (resT > 0.15 && resT < 1.75 && resT >= resNext) { sfxTick(Math.min(1, (resT - 0.15) / 1.6)); resNext = resT + 0.055; }
  if (resT >= GRADE_T && !resF.grade) { resF.grade = 1; sfxGrade(result.gr); controls.haptic(0, 0.6, 80); controls.haptic(1, 0.6, 80); if (result.pass) { burst(0, 1.8, -1.5, 0xffffff, 60); } }
  if (resT >= RES_END + 0.1 && result.gacha && !resF.gacha) { resF.gacha = 1; startGacha(); }
  const busy = resT < RES_END + 0.6 || (result.gacha && result.gacha.opened >= 0 && result.gacha.t - result.gacha.openT < 2.5);
  resDraw += dt; if (busy && resDraw > 0.033) { resDraw = 0; drawPanel(); } else if (!busy && prev < RES_END + 0.6) drawPanel();
}

// ---------- S 评级抽卡：飞出 3 个带特效的盒子，触碰其中一个打开 ----------
const gachaG = new THREE.Group(); gachaG.visible = false; play.add(gachaG);
const GBOX = [0xff2fd0, 0x30f0ff, 0xffe35a]; let gboxes = null, gcard = null, gcardCv = null, gcardTex = null, gHover = -1;
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const GLSL_H = 'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n';
const VERT = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vUv = uv; vP = position; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }';
const shMat = (frag, col, extra = {}) => new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(col) }, uA: { value: 1 }, uH: { value: 0 }, uF: { value: 0 }, uSeed: { value: Math.random() * 50 }, ...extra }, vertexShader: VERT, fragmentShader: GLSL_H + frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
// 面板：电路走线 + 流动脉冲 + 故障位移 + 色散 + 扫描带 + 菲涅尔边缘光
const FRAG_FACE = `uniform float uT, uA, uH, uSeed; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float pat(vec2 uv){ vec2 g = uv * 7.0, id = floor(g), f = fract(g); float h = hash(id + uSeed), hz = step(0.5, h);
  float tr = mix(smoothstep(0.06, 0.0, abs(f.x - 0.5)), smoothstep(0.06, 0.0, abs(f.y - 0.5)), hz), along = mix(g.y, g.x, hz);
  float pulse = pow(0.5 + 0.5 * sin(along * 2.2 - uT * (2.0 + h * 3.0) + h * 40.0), 6.0), node = smoothstep(0.17, 0.0, length(f - 0.5)) * step(0.72, h);
  return tr * (0.22 + pulse * 1.7) + node * 1.5; }
void main(){ vec2 uv = vUv; float gl = step(0.962, hash(vec2(floor(uT * 7.0), floor(uv.y * 12.0)))); uv.x += gl * 0.14 * (hash(vec2(floor(uT * 7.0), 3.0)) - 0.5) * 2.0;
  float sp = 0.012 + gl * 0.035, r = pat(uv + vec2(sp, 0.0)), g = pat(uv), b = pat(uv - vec2(sp, 0.0));
  vec3 col = uC * g + vec3(1.0, 0.1, 0.6) * max(r - g, 0.0) + vec3(0.1, 0.9, 1.0) * max(b - g, 0.0) + uC * 0.07;
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)); float fr = smoothstep(0.07, 0.0, e); col += uC * fr * 1.6 + vec3(fr * 0.4);
  float band = exp(-pow((fract(vUv.y - uT * 0.4) - 0.5) * 12.0, 2.0)); col += uC * band * 0.55;
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); col += uC * rim * 0.7;
  gl_FragColor = vec4(col * (1.0 + uH * 0.7), uA); }`;
// 核心：流动的等离子能量球
const FRAG_CORE = `uniform float uT, uA, uF; uniform vec3 uC; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vec3 p = vP * 70.0; float n = sin(p.x + uT * 3.0) * sin(p.y * 0.9 - uT * 2.3) + sin(p.z * 1.1 + uT * 3.7) * cos(p.x * 0.8 - uT * 1.7) + sin((p.x + p.y + p.z) * 0.6 + uT * 2.0);
  float pl = 0.5 + 0.5 * sin(n * 2.4 + uT * 4.0), rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 col = mix(uC * 0.55, vec3(1.0), pl * pl * 0.9) + uC * rim * 1.2; col *= 1.0 + uF * 3.5; gl_FragColor = vec4(col, uA); }`;
// 光柱：向上流动的环
const FRAG_BEAM = `uniform float uT, uA; uniform vec3 uC; varying vec2 vUv;
void main(){ float v = vUv.y, ring = pow(0.5 + 0.5 * sin(v * 46.0 - uT * 11.0), 5.0), a = (0.18 + 0.82 * ring) * smoothstep(1.0, 0.35, v) * smoothstep(0.0, 0.05, v); gl_FragColor = vec4(mix(uC, vec3(1.0), ring * 0.6), a * uA); }`;
const FACES = [[[1, 0, 0], [0, 1.5708, 0]], [[-1, 0, 0], [0, -1.5708, 0]], [[0, 1, 0], [-1.5708, 0, 0]], [[0, -1, 0], [1.5708, 0, 0]], [[0, 0, 1], [0, 0, 0]], [[0, 0, -1], [0, 3.14159, 0]]];
function ensureBoxes() {
  if (gboxes) return; gboxes = GBOX.map((col, i) => {
    const g = new THREE.Group(), fm = shMat(FRAG_FACE, col), cm = shMat(FRAG_CORE, col), bm = shMat(FRAG_BEAM, col), faces = [];
    for (const [n, r] of FACES) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm); f.position.set(n[0] * 0.11, n[1] * 0.11, n[2] * 0.11); f.rotation.set(r[0], r[1], r[2]); f.userData = { n: new THREE.Vector3(...n), q0: f.quaternion.clone() }; faces.push(f); g.add(f); }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 3), cm);
    const ringM = () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.0045, 6, 72), ringM()), ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.0035, 6, 64), ringM());
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.scale.setScalar(1.0);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 1.6, 24, 1, true), bm); beam.position.y = 0.85; beam.visible = false;
    const shock = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); shock.visible = false;
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(core, ring1, ring2, glow, beam, shock, pick);
    g.traverse((o) => { if (o.material && o !== pick) { o.material.depthTest = false; o.renderOrder = 60; } });
    g.userData = { i, faces, fm, cm, bm, core, ring1, ring2, glow, beam, shock, pick, col, open: -1, hov: 0 }; gachaG.add(g); return g;
  });
}
const clamp01 = (v) => Math.min(1, Math.max(0, v)), easeOutBack = (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
const gachaTargets = () => { const y = headY - 0.45, z = -0.72; return [[-0.36, y, z], [0, y + 0.05, z - 0.05], [0.36, y, z]]; };
function hideGacha() { gachaG.visible = false; if (gcard) gcard.visible = false; gHover = -1; }
function startGacha() {   // （赛博版）
  if (!result?.gacha) return; ensureBoxes(); gachaG.visible = true; result.gacha.t = 0; result.gacha.opened = -1; gHover = -1; if (gcard) gcard.visible = false;
  for (const b of gboxes) { const u = b.userData; u.open = -1; u.hov = 0; for (const m of [u.fm, u.cm, u.bm]) m.uniforms.uA.value = 1; u.cm.uniforms.uF.value = 0; u.beam.visible = false; u.shock.visible = false; u.core.scale.setScalar(1); u.glow.material.opacity = 0.8; u.ring1.visible = u.ring2.visible = true; u.faces.forEach((f) => { f.position.copy(f.userData.n).multiplyScalar(0.11); f.quaternion.copy(f.userData.q0); f.scale.setScalar(1); }); b.visible = true; b.scale.setScalar(0.01); }
  sfxWhoosh();
}
const gachaLive = () => state === 'result' && result?.gacha && gachaG.visible && result.gacha.opened < 0 && result.gacha.t > 1.1;
function gachaRay(r) { const h = r.intersectObjects(gboxes.map((b) => b.userData.pick), false)[0]; return h ? gboxes.find((b) => b.userData.pick === h.object) : null; }
function drawCard(bx) {
  if (!gcardCv) { gcardCv = document.createElement('canvas'); gcardCv.width = 640; gcardCv.height = 380; gcardTex = new THREE.CanvasTexture(gcardCv); gcardTex.colorSpace = THREE.SRGBColorSpace; gcard = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.38), new THREE.MeshBasicMaterial({ map: gcardTex, transparent: true, depthWrite: false, toneMapped: false })); gcard.renderOrder = 70; gachaG.add(gcard); }
  const g = gcardCv.getContext('2d'); g.clearRect(0, 0, 640, 380); rr(g, 6, 6, 628, 368, 28); const gr = g.createLinearGradient(0, 0, 640, 380); gr.addColorStop(0, 'rgba(24,8,60,.96)'); gr.addColorStop(1, 'rgba(6,24,56,.96)'); g.fillStyle = gr; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffe35a'; g.stroke();
  txt(g, 'UNLOCKED !', 320, 44, 34, '#ffe35a', 'center', 800);
  if (bx.model) { const idx = models.indexOf(bx.model); tile(g, idx, bx.song ? 30 : 225, 80, 200, false, true); txt(g, `手办 #${bx.model.n ?? idx + 1}`, (bx.song ? 130 : 325), 310, 26, '#fff', 'center', 800); }
  if (bx.song) { const cx = bx.model ? 430 : 320; txt(g, '♪', cx, 130, 60, '#9fe8ff', 'center', 800); let t = bx.song.zh; g.font = `800 30px ${FONT}`; while (g.measureText(t).width > 300 && t.length > 3) t = t.slice(0, -1); txt(g, t, cx, 200, 30, '#fff', 'center', 800); txt(g, bx.song.en.slice(0, 26), cx, 240, 19, '#cfd8ff', 'center'); txt(g, `${fmtT(bx.song.duration)} · ${bx.song.bpm | 0} BPM`, cx, 276, 20, '#9fb4ff', 'center'); }
  gcardTex.needsUpdate = true;
}
function openBox(i) {
  const G = result?.gacha; if (!G || G.opened >= 0) return; G.opened = i; G.openT = G.t; const bx = G.boxes[i], u = gboxes[i].userData; u.open = 0;
  if (bx.model && !isUnlocked(bx.model.id)) { save.unlocked.push(bx.model.id); result.newly.push(bx.model); }
  if (bx.song && !songOpen(bx.song.id)) { save.songs.push(bx.song.id); result.newSongs.push(bx.song); }
  persist(); sfxBoxOpen(); controls.haptic(0, 0.9, 120); controls.haptic(1, 0.9, 120);
  const p = gboxes[i].position; burst(p.x, p.y + 0.1, p.z, u.col, 70); burst(p.x, p.y + 0.15, p.z, 0xffffff, 40); burst(p.x, p.y + 0.1, p.z, 0xffe35a, 40);
  drawCard(bx); gcard.visible = true; gcard.userData.k = 0; gcard.userData.i = i; drawPanel();
}
const gTip = new THREE.Vector3(), gCam = new THREE.Vector3(), AX_Z = new THREE.Vector3(0, 0, 1);
function updateGacha(dt) {
  if (!gachaG.visible || !result?.gacha) return; const G = result.gacha; G.t += dt; const tg = gachaTargets();
  gboxes.forEach((b, i) => {
    const u = b.userData, k = clamp01((G.t - i * 0.16) / 0.9), e = easeOutBack(k); u.hov += ((gHover === i ? 1 : 0) - u.hov) * Math.min(1, dt * 10);
    b.position.set(tg[i][0] * e, (headY - 0.08) + (tg[i][1] - (headY - 0.08)) * e + Math.sin(T * 2 + i * 2) * 0.015 * k, -1.55 + (tg[i][2] + 1.55) * e);
    let s = (0.15 + 0.85 * e) * (1 + u.hov * 0.14), fade = 1;
    if (G.opened >= 0 && G.opened !== i) { fade = 1 - clamp01((G.t - G.openT - 0.35) / 0.7); s *= fade; }
    else if (G.opened === i) { fade = 1 - clamp01((G.t - G.openT - 5.0) / 0.8); s *= 0.4 + 0.6 * fade; b.visible = fade > 0.001; }   // 展示 5 秒后盒子与光效一起消失
    b.scale.setScalar(Math.max(0.001, s)); b.rotation.y = T * (k < 1 ? 3 : 0.5) + i; b.rotation.x = Math.sin(T * 0.7 + i) * 0.12;
    const op = u.open >= 0, q = op ? 1 - Math.pow(1 - clamp01(u.open / 0.75), 3) : 0;
    for (const m of [u.fm, u.cm, u.bm]) { m.uniforms.uT.value = T; m.uniforms.uA.value = fade; } u.fm.uniforms.uH.value = u.hov; u.fm.uniforms.uA.value = fade * (1 - q * 0.85);
    u.cm.uniforms.uF.value = op ? Math.max(0, 1.2 - u.open * 0.8) + u.hov * 0 : u.hov * 0.5 + 0.12 * Math.sin(T * 3 + i); u.core.scale.setScalar(1 + q * 1.6 + 0.06 * Math.sin(T * 6 + i)); u.core.rotation.set(T * 0.9, T * 1.3, 0);
    u.ring1.rotation.set(T * 1.1 + i, T * 0.7, 0.4); u.ring2.rotation.set(-T * 0.8, T * 1.4 + i, 1.1); u.ring1.material.opacity = u.ring2.material.opacity = 0.85 * fade * (1 - q * 0.6);
    u.faces.forEach((f, fi) => { f.position.copy(f.userData.n).multiplyScalar(0.11 + q * 0.8); f.quaternion.copy(f.userData.q0).multiply(tmpQ.setFromAxisAngle(AX_Z, q * (2.2 + fi * 0.5) * (fi % 2 ? -1 : 1))); f.scale.setScalar(1 + q * 0.5); });
    u.glow.material.opacity = (0.5 + 0.2 * Math.sin(T * 3 + i)) * fade * (op ? 1.8 : 1) + u.hov * 0.25; u.glow.scale.setScalar(op ? 1.0 + q * 1.6 : 1.0);
    if (op) {
      u.open += dt; u.beam.visible = true; u.bm.uniforms.uA.value = Math.min(0.9, u.open * 2.2) * fade * (u.open > 3 ? Math.max(0, 1 - (u.open - 3)) : 1);
      const sk = clamp01(u.open / 1.1); u.shock.visible = sk < 1; u.shock.scale.setScalar(0.15 + sk * 3.2); u.shock.material.opacity = (1 - sk) * 0.9;
    }
  });
  if (gcard?.visible && G.opened >= 0) {
    const bp = gboxes[G.opened].position; gcard.userData.k = Math.min(1, gcard.userData.k + dt / 0.6); const e = easeOutBack(Math.min(1, Math.max(0, (G.t - G.openT - 0.25) / 0.6)));
    gcard.position.set(bp.x * 0.6, bp.y + 0.45 + 0.04 * Math.sin(T * 2), bp.z + 0.05); const fo = 1 - clamp01((G.t - G.openT - 5.2) / 0.6); gcard.scale.setScalar(Math.max(0.001, e * 1.25 * fo)); if (fo <= 0) gcard.visible = false; camera.getWorldPosition(gCam); gcard.lookAt(gCam);
  }
  if (VRlive() && gachaLive()) {
    for (const rec of ctrls) { if (!rec.src) continue; rec.c.updateMatrixWorld(true); gTip.set(0, 0, -0.06).applyMatrix4(rec.c.matrixWorld); gachaG.worldToLocal(gTip);
      for (let i = 0; i < 3; i++) if (gboxes[i].position.distanceTo(gTip) < 0.15) { openBox(i); return; } }
    let hv = -1; for (const rec of ctrls) { if (!rec.src) continue; ray.ray.origin.setFromMatrixPosition(rec.c.matrixWorld); ray.ray.direction.set(0, 0, -1).transformDirection(rec.c.matrixWorld); const b = gachaRay(ray); if (b) hv = b.userData.i; } gHover = hv;
  }
}
const VRlive = () => renderer.xr.isPresenting;
function hudBox(g, w, h) { g.clearRect(0, 0, w, h); rr(g, 6, 6, w - 12, h - 12, 26); g.fillStyle = 'rgba(8,4,28,.5)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke(); }
function drawHud() {
  if (!stats) return; const now = songTime(), mult = 1 + Math.min(stats.combo, 50) / 50;
  const acc = stats.counts.reduce((x, y) => x + y, 0) ? (stats.counts[0] + stats.counts[1] * 0.8 + stats.counts[2] * 0.5) / stats.counts.reduce((x, y) => x + y, 0) : 0;
  { const g = hudL.g; hudBox(g, 384, 256);          // 左：连击 + 判定
    txt(g, 'COMBO', 192, 40, 24, '#9fb4ff', 'center'); neon(g, String(stats.combo), 192, 112, stats.combo > 99 ? 84 : 100, P.b);
    if (judgeT > 0) { const col = ['#ffe35a', '#6dffb0', '#9fd0ff', '#ff6b8a'][judgeK]; g.save(); g.shadowColor = col; g.shadowBlur = 18; txt(g, judgeText, 192, 204, judgeText.length > 5 ? 44 : 60, col, 'center', 800); g.restore(); }
    hudL.tex.needsUpdate = true; }
  { const g = hudR.g; hudBox(g, 384, 256);          // 右：分数 + 倍数
    txt(g, 'SCORE', 192, 36, 22, '#9fb4ff', 'center'); txt(g, String(stats.score).padStart(7, '0'), 192, 82, 52, '#fff', 'center', 800);
    neon(g, '×' + mult.toFixed(1), 192, 160, 74, P.a); txt(g, `ACC ${(acc * 100).toFixed(1)}%`, 192, 222, 28, '#cfd8ff', 'center', 700);
    hudR.tex.needsUpdate = true; }
  { const g = hudB.g; hudBox(g, 768, 192);          // 下：歌名 + 歌曲进度 + 解锁进度 + 能量条
    const p = Math.min(1, Math.max(0, now / cur.len)), ur = Math.min(1, stats.hits / Math.max(1, cfg.need * stats.total));
    txt(g, `♪ ${cur ? cur.song.zh : ''}`, 36, 34, 26, '#fff', 'left', 700); txt(g, now < WARM ? '热身中 …' : fmtT(Math.max(0, Math.ceil(cur.len - now))), 732, 34, 24, now < WARM ? '#ffe35a' : '#9fb4ff', 'right', 700);
    g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(36, 56, 696, 12); g.fillStyle = P.b; g.fillRect(36, 56, 696 * p, 12);
    txt(g, '解锁', 36, 100, 21, '#ffd0f4'); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(100, 92, 560, 16);
    const gr = g.createLinearGradient(100, 0, 660, 0); gr.addColorStop(0, P.a); gr.addColorStop(1, '#ffe35a'); g.fillStyle = gr; g.fillRect(100, 92, 560 * ur, 16);
    txt(g, `${Math.round(ur * 100)}%`, 732, 100, 20, '#9fb4ff', 'right');
    const low = hp < 25, hc = hp > 50 ? '#6dffb0' : hp > 25 ? '#ffe35a' : '#ff4466', fl = low ? 0.55 + 0.45 * Math.sin(T * 12) : 1, sh = hurtT > 0 ? Math.sin(T * 90) * 4 * hurtT : 0;
    txt(g, '能量', 36, 148, 21, low ? '#ff9ab0' : '#cfe8ff'); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(100 + sh, 136, 560, 24);
    g.globalAlpha = fl; g.fillStyle = hc; g.fillRect(100 + sh, 136, 560 * hp / 100, 24); g.globalAlpha = 1;
    if (hurtT > 0) { g.fillStyle = `rgba(255,60,90,${hurtT})`; g.fillRect(100 + sh, 136, 560, 24); }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(100 + sh, 136, 560, 24);
    txt(g, `${Math.round(hp)}%`, 732, 148, 20, low ? '#ff9ab0' : '#9fb4ff', 'right');
    hudB.tex.needsUpdate = true; }
}

// ---------- 面板交互 ----------
function click(id) {
  if (!id) return;
  if (['sok', 'sback', 'srand', 'reroll', 'start', 'again', 'menu', 'gallery', 'back'].includes(id)) stopPreview();
  if (id === 'skip') { if (resT < RES_END) resT = RES_END; drawPanel(); return; }
  if (state === 'result' && (id === 'again' || id === 'menu' || id === 'gallery') && !btnsReady()) return;
  if (id.startsWith('d:')) { save.diff = id.slice(2); cfg = DIFFS[save.diff]; persist(); }
  else if (id.startsWith('m:')) { save.sel = +id.slice(2); persist(); showFigure(save.sel); }
  else if (id.startsWith('pg:')) { const pages = Math.max(1, Math.ceil(models.length / 18)); page = (page + +id.slice(3) + pages) % pages; }
  else if (id === 'frames') { save.frames = !save.frames; persist(); }
  else if (id.startsWith('off:')) { save.offset = Math.max(-300, Math.min(300, save.offset + +id.slice(4))); persist(); }
  else if (id === 'reroll' || id === 'srand') { save.pick = null; persist(); view = 'main'; newPending(); showPending(); return; }
  else if (id === 'songs') { view = 'songs'; spick = save.pick?.id || pending?.song.id || null; const ix = songs.findIndex((x) => x.id === spick); if (ix >= 0) spage = (ix / 16) | 0; const sg0 = songs[ix]; smode = sg0 ? (save.pick && save.pick.id === spick ? save.pick.mode : pending?.mode ?? modesFor(sg0)[0]) : 90; }
  else if (id === 'sback') { view = 'main'; }
  else if (id.startsWith('spg:')) { spage = (spage + +id.slice(4) + spgPages) % spgPages; }
  else if (id.startsWith('sg:')) { spick = id.slice(3); const sg = songs.find((x) => x.id === spick), ms = modesFor(sg); smode = save.pick && save.pick.id === spick && ms.includes(save.pick.mode) ? save.pick.mode : ms[0]; if (songOpen(sg.id)) playPreview(sg); else stopPreview(); }
  else if (id.startsWith('md:')) { const sg = songs.find((x) => x.id === spick); if (sg && songOpen(sg.id)) { const m = id.slice(3) === 'full' ? 'full' : +id.slice(3); if (modesFor(sg).includes(m)) smode = m; } }
  else if (id === 'sok') { const sg = songs.find((x) => x.id === spick); if (sg && songOpen(sg.id)) { save.pick = { id: sg.id, mode: smode }; persist(); view = 'main'; newPending(); showPending(); return; } }
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
  if (gachaLive()) { const b = gachaRay(ray); gHover = b ? b.userData.i : -1; renderer.domElement.style.cursor = b ? 'pointer' : 'default'; if (b) return; }
  const h = ray.intersectObject(panel.mesh)[0]; const r = h ? padHit(h.uv) : null; setHover(r?.id || null); renderer.domElement.style.cursor = r ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!active || renderer.xr.isPresenting || !panel.mesh.visible) return; if (actx) actx.resume(); mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  if (gachaLive()) { const b = gachaRay(ray); if (b) { openBox(b.userData.i); return; } }
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
  const xr = renderer.xr.isPresenting, k = xr ? 1 : 1.45; panel.mesh.scale.setScalar(k);
  panel.mesh.position.set(0, headY - 0.08, -1.55);
  const sx = xr ? 2.35 : 2.5, sz = 3.0;                 // 左右 HUD：在判定区两侧，稍微朝向玩家
  hudL.mesh.position.set(-sx, base + 0.5, -sz); hudL.mesh.rotation.set(0, Math.atan2(sx, sz), 0);
  hudR.mesh.position.set(sx, base + 0.5, -sz); hudR.mesh.rotation.set(0, -Math.atan2(sx, sz), 0);
  const dy = xr ? 0.95 : 0.36, dz = xr ? 1.5 : 1.15;     // 下方 HUD：在视线下方，向上倾斜朝向眼睛
  hudB.mesh.position.set(0, headY - dy, -dz); hudB.mesh.rotation.set(-Math.atan2(dy, dz), 0, 0);
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
  if (state === 'playing') updatePlay(dt); else if (state === 'result') updateResult(dt);
  updateGacha(dt);
  // 视觉
  pulse *= Math.exp(-dt * 6); const sp = state === 'playing' ? songTime() : T * 0.5;
  camera.getWorldPosition(tmpV3); const au = Math.min(1, 0.2 + pulse * 0.9) * (app.st?.react ?? 1);
  if (envIdx >= 0) genvs.update(T, dt, tmpV3, au, 0.9 / ENV_SCALE);
  figReveal += (figTarget - figReveal) * Math.min(1, dt * (state === 'playing' ? 4 : 1.5));
  if (Q.has('greveal')) figReveal = figTarget = +Q.get('greveal');      // 测试用：固定解锁进度
  const cy = FIG_H * 1.03 * figReveal; revealPlane.constant = cy; ghostPlane.constant = -cy;
  revU.uRev.value = cy; revU.uAct.value = Math.min(1, figReveal / 0.03) * (1 - Math.min(1, Math.max(0, (figReveal - 0.95) / 0.04)));
  tickLife(T);                                          // 呼吸 / 发丝：和展示模式同一套（不旋转）
  lA.intensity = lB.intensity = 4500 + 5000 * pulse;
  for (const f of frames) { f.visible = !!save.frames; const u = f.userData; u.flash = Math.max(0, u.flash - dt * 3.5); f.material.opacity = 0.22 + u.flash * 0.8; f.scale.setScalar(1 + u.flash * 0.25); }
  if (judgeT > 0) { judgeT -= dt; hudDirty = true; } if (hurtT > 0) { hurtT -= dt; hudDirty = true; }
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
  active = true; state = 'menu'; stopSong(); hideGacha(); hud.mesh.visible = false; panel.mesh.visible = true;
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
  if (!active) return; active = false; stopSong(); stopPreview(); state = 'menu'; hideGacha(); hud.mesh.visible = false; noteCore.count = noteWire.count = 0;
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
  res: (t) => { if (t != null) resT = t; return resT; }, hp: () => hp, setHp: (v) => { hp = v; }, gacha: () => result?.gacha, openBox: (i) => openBox(i), gachaLive,
  skip: (sec) => { fallbackT0 -= (sec * 1000) / RATE; startAt -= sec; }, state: () => state, save, click, get stats() { return stats; }, get result() { return result; },
};
window.GM = api;
return api;
}
