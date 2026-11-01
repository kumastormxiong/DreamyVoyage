// 3DM · 音乐游戏：用手柄触碰沿节奏飞来的音符，通关解锁手办。
// 独立于展厅（src/）：只读取 models.json / thumbs.webp / models_lod，解锁进度存在 localStorage。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), BOT = Q.has('bot'), RATE = Number(Q.get('rate') || 1), SILENT = Q.has('silent');   // rate/silent/bot 仅用于自动化测试
const quest3 = /Quest 3/i.test(navigator.userAgent);
const FB = { low: 0.8, mid: 1.0, high: 1.25 }[Q.get('q') || (quest3 ? 'high' : 'mid')] ?? 1.0;

// ---------- 常量 ----------
const COL = [0x30f0ff, 0xff2fd0];                    // 左手青 / 右手粉
const COLX = [-0.5, -0.17, 0.17, 0.5];               // 四列的 x（米，相对玩家）
const HIT_Z = -0.55, SPEED = 8, TIP_R = 0.17, LEAD = 3.0;
const FIG_H = 7, FIG_Z = -22;
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

// ---------- 渲染器 / 场景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.localClippingEnabled = true;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(0); renderer.xr.setFramebufferScaleFactor(FB);
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x08031c, 10, 46);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 220);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const DESK_CAM = new THREE.Vector3(0, 1.5, 1.0);
function deskCamera() { camera.position.copy(DESK_CAM); camera.lookAt(0, 1.05, -2.5); }
deskCamera();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const play = new THREE.Group(); scene.add(play);       // 所有玩法内容：原点 = 玩家脚下，-z = 面朝方向
let base = 0.95;                                      // 最低一排的离地高度
const rowY = (r) => base + r * 0.26;

// 天空：渐变 + 星点 + 复古落日（在手办身后）
const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uT: { value: 0 }, uPulse: { value: 0 }, uProg: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vP; uniform float uT, uPulse, uProg;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec3 d = normalize(vP); float y = d.y;
      vec3 col = mix(vec3(0.02, 0.0, 0.06), vec3(0.20, 0.03, 0.30), smoothstep(-0.05, 0.7, y));
      col += pow(1.0 - min(abs(y), 1.0), 7.0) * vec3(1.0, 0.22, 0.75) * (0.35 + 0.55 * uPulse);
      vec2 g = floor(vec2(atan(d.x, d.z) * 90.0, y * 90.0)); float st = step(0.9965, h21(g)) * smoothstep(0.0, 0.3, y);
      col += st * vec3(0.8, 0.9, 1.0) * (0.5 + 0.5 * sin(uT * 2.0 + h21(g) * 40.0));
      if (d.z < 0.0) { vec2 p = d.xy / -d.z - vec2(0.0, 0.34); float r = length(p);
        float stripe = step(0.0, sin(p.y * 48.0 - uT * 0.6) + (0.34 - p.y) * 3.0 - 0.7) + step(0.0, p.y);
        float sun = smoothstep(0.36, 0.35, r) * clamp(stripe, 0.0, 1.0);
        col += sun * mix(vec3(1.0, 0.2, 0.7), vec3(1.0, 0.85, 0.3), clamp((p.y + 0.16) * 3.0, 0.0, 1.0)) * (0.6 + 0.6 * uPulse + 0.5 * uProg); }
      gl_FragColor = vec4(col, 1.0); }`,
}));
sky.renderOrder = -10; play.add(sky);

// 地面：向玩家流动的霓虹网格
const floorMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScroll: { value: 0 }, uPulse: { value: 0 } },
  vertexShader: 'varying vec2 vXZ; void main(){ vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec2 vXZ; uniform float uScroll, uPulse;
    void main(){
      vec2 q = vec2(vXZ.x, vXZ.y - uScroll); vec2 f = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
      float l = 1.0 - min(min(f.x, f.y), 1.0);
      float fade = smoothstep(46.0, 8.0, -vXZ.y) * smoothstep(-3.0, 1.0, -vXZ.y + 6.0);
      vec3 c = mix(vec3(0.15, 0.9, 1.0), vec3(1.0, 0.2, 0.8), smoothstep(-8.0, 8.0, vXZ.x));
      gl_FragColor = vec4(c * l * fade * (0.55 + 0.9 * uPulse), 1.0); }`,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 90).rotateX(-Math.PI / 2).translate(0, 0, -30), floorMat);
floor.position.y = 0.0; floor.renderOrder = -5; floor.frustumCulled = false; play.add(floor);

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
const lA = new THREE.PointLight(0xff2fd0, 900, 60, 2); lA.position.set(-6, 5, FIG_Z + 9); play.add(lA);
const lB = new THREE.PointLight(0x30f0ff, 900, 60, 2); lB.position.set(6, 5, FIG_Z + 9); play.add(lB);
const lC = new THREE.DirectionalLight(0xffffff, 1.2); lC.position.set(0, 6, 4); play.add(lC);
const revealPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), ghostPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const figure = new THREE.Group(); figure.position.set(0, 0, FIG_Z); figure.scale.setScalar(FIG_H); play.add(figure);
const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
figure.add(scanPlane); scanPlane.visible = false;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map(); let figToken = 0, figReveal = 0, figTarget = 0;
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
  if (!holder) { try { holder = normalize(await loader.loadAsync(m.lod || m.file)); gltfCache.set(m.id, holder); } catch (e) { console.warn('model', e); return; } }
  if (tok !== figToken) return;
  const real = holder.clone(true), ghost = holder.clone(true);
  real.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = [revealPlane]; } });
  ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x3b1f78, transparent: true, opacity: 0.62, clippingPlanes: [ghostPlane], side: THREE.DoubleSide, depthWrite: false, toneMapped: false }); } });
  figure.add(ghost, real); figReveal = 0; figTarget = isUnlocked(m.id) && state !== 'playing' ? 1 : 0;
}

// ---------- 音频 ----------
const AC = window.AudioContext || window.webkitAudioContext; let actx = null, musicGain = null, sfxGain = null, audioBuf = null, audioState = 'loading', src = null, startAt = 0;
const CANDIDATES = ['./audio/ChainedGhost.mp3', '/vrmv/VRMV/audio/ChainedGhost.mp3', '../vrmv/VRMV/audio/ChainedGhost.mp3', '../GhostChain_MV/VRMV/audio/ChainedGhost.mp3', '/vrmv/audio/ChainedGhost.mp3'];
try { actx = new AC(); musicGain = actx.createGain(); musicGain.gain.value = 0.85; sfxGain = actx.createGain(); sfxGain.gain.value = 0.5; musicGain.connect(actx.destination); sfxGain.connect(actx.destination); } catch (e) { actx = null; }
async function loadAudio() {
  for (const u of CANDIDATES) {
    try { const r = await fetch(u); if (!r.ok) continue; const ab = await r.arrayBuffer(); if (ab.byteLength < 100000) continue; audioBuf = await actx.decodeAudioData(ab); audioState = 'ok'; return; } catch (e) { /* 试下一个 */ }
  }
  audioState = 'fail';
}
function blip(hand, kind) {
  if (!actx || actx.state !== 'running') return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'triangle'; o.frequency.value = (hand ? 784 : 587) * (kind === 0 ? 1.5 : 1); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(sfxGain); o.start(t); o.stop(t + 0.13);
}
let fallbackT0 = 0;
const songTime = () => (audioState === 'ok' && actx && !SILENT ? actx.currentTime - startAt - (actx.outputLatency || 0) : ((performance.now() - fallbackT0) / 1000) * RATE - LEAD) + save.offset / 1000;

// ---------- 数据 ----------
let models = [], beatmap = null, sheet = null, state = 'menu', cfg = DIFFS[save.diff] || DIFFS.normal;
const isUnlocked = (id) => save.unlocked.includes(id);
async function loadData() {
  models = await (await fetch('./models.json')).json();
  beatmap = await (await fetch('./game/beatmap.json')).json();
  sheet = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = './thumbs.webp'; });
  save.sel = Math.min(save.sel, models.length - 1);
}

// ---------- 玩法状态 ----------
let notes = [], lo = 0, hi = 0, stats = null, judgeText = '', judgeT = 0, judgeK = 0, beatIdx = 0, pulse = 0, hudT = 0, doneT = 0, result = null;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const noteZ = (n, now) => HIT_Z - (n.t - now) * SPEED;
function resetStats() { return { score: 0, combo: 0, maxCombo: 0, counts: [0, 0, 0, 0], total: notes.length, hits: 0 }; }
const hitRate = () => (stats.total ? stats.hits / stats.total : 0);

function startSong() {
  const ch = beatmap.charts[save.diff]; cfg = DIFFS[save.diff];
  notes = ch.map((a) => ({ t: a[0], c: a[1], r: a[2], h: a[3], s: 0 })); lo = hi = 0; beatIdx = 0; stats = resetStats(); judgeText = ''; result = null; notified = false;
  recenter(); layoutFrames(); panel.mesh.visible = false; hud.mesh.visible = true; hudDirty = true;
  if (actx && audioState === 'ok' && !SILENT) {
    actx.resume(); src = actx.createBufferSource(); src.buffer = audioBuf; src.connect(musicGain); startAt = actx.currentTime + LEAD; src.start(startAt);
  } else fallbackT0 = performance.now();
  state = 'playing'; figTarget = 0; figReveal = 0; doneT = 0;
  for (const m of frames) m.userData.flash = 0;
}
function stopSong() { try { src?.stop(); } catch (e) { /* 已停止 */ } src = null; }
function quitToMenu() { stopSong(); state = 'menu'; hud.mesh.visible = false; panel.mesh.visible = true; recenter(); showFigure(save.sel); drawPanel(); }

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
let notified = false;
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
  const bt = beatmap.beats; while (beatIdx < bt.length && bt[beatIdx] < now) { beatIdx++; pulse = Math.max(pulse, 0.85); }
  figTarget = Math.min(1, stats.hits / Math.max(1, cfg.need * stats.total));
  // 结束
  if (now > beatmap.duration + 1.2 || (notes.length && lo >= notes.length && now > notes[notes.length - 1].t + 1.5)) finish();
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
  c.addEventListener('selectstart', () => { if (panel.mesh.visible) { const h = controls.hover[i]; if (h) click(h.id); } });
  ctrls.push(rec);
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
  const ready = beatmap && audioState !== 'loading';
  btn(g, 'start', 300, 630, 424, 84, ready ? '▶  开始演奏' : '加载中 …', { fs: 34, sel: ready, dim: !ready });
  btn(g, 'back', 40, 650, 190, 52, '← 返回展厅', { fs: 22 });
  txt(g, `延迟补偿 ${save.offset >= 0 ? '+' : ''}${save.offset}ms`, 856, 612, 19, '#9fb4ff', 'center');
  btn(g, 'off:-10', 756, 628, 66, 44, '−10', { fs: 20 }); btn(g, 'off:10', 890, 628, 66, 44, '+10', { fs: 20 });
  if (audioState === 'fail') txt(g, '⚠ 未找到歌曲音频，将静音游玩', 512, 738, 18, '#ffb0b0', 'center');
  panel.tex.needsUpdate = true;
}
function drawResult(g) {
  const r = result, c = r.s.counts;
  neon(g, r.pass ? 'CLEAR !' : 'TRY AGAIN', 512, 70, 62, r.pass ? P.b : P.a);
  neon(g, r.gr, 190, 240, 170, r.gr === 'S' ? '#ffe35a' : P.a);
  txt(g, `SCORE  ${r.s.score}`, 330, 180, 40, '#fff', 'left', 800); txt(g, `命中率 ${(hitRate() * 100).toFixed(1)}%（需要 ${Math.round(DIFFS[r.diff].need * 100)}%）`, 330, 226, 26);
  txt(g, `最大连击 ${r.s.maxCombo}`, 330, 262, 26);
  txt(g, `PERFECT ${c[0]}   GREAT ${c[1]}   GOOD ${c[2]}   MISS ${c[3]}`, 330, 300, 24, '#9fb4ff');
  if (r.pass && r.newly.length) {
    txt(g, '✨ 新解锁手办', 512, 360, 30, '#ffe35a', 'center', 800);
    r.newly.forEach((m, k) => { const idx = models.indexOf(m), x = 512 - r.newly.length * 90 + k * 180 + 10; tile(g, idx, x, 390, 160, false, true); txt(g, `#${m.n ?? idx + 1}`, x + 80, 570, 22, '#fff', 'center', 800); });
  } else if (r.pass) txt(g, '已解锁过的手办 · 刷新了你的最高分', 512, 420, 26, '#9fb4ff', 'center');
  else txt(g, `再多命中 ${Math.max(0, Math.ceil(DIFFS[r.diff].need * r.s.total) - r.s.hits)} 个音符就能解锁`, 512, 420, 28, '#ffb0e8', 'center');
  btn(g, 'again', 60, 626, 270, 76, '再来一次', { fs: 30, sel: true }); btn(g, 'menu', 370, 626, 270, 76, '返回选择', { fs: 30 });
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
  const p = songTime() / beatmap.duration, ur = Math.min(1, stats.hits / Math.max(1, cfg.need * stats.total));
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
  else if (id === 'start' || id === 'again') { if (beatmap && audioState !== 'loading') { if (actx) actx.resume(); startSong(); } }
  else if (id === 'menu') { quitToMenu(); return; }
  else if (id === 'back') { if (renderer.xr.isPresenting) renderer.xr.getSession()?.end(); location.href = './index.html'; return; }
  else if (id === 'gallery') { if (renderer.xr.isPresenting) renderer.xr.getSession()?.end(); location.href = './index.html?model=' + (result?.m ? models.indexOf(result.m) : save.sel); return; }
  drawPanel();
}
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function padHit(uv) { const px = uv.x * 1024, py = (1 - uv.y) * 768; return rects.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null; }
function setHover(id) { if (id !== hoverId) { hoverId = id; drawPanel(); } }
renderer.domElement.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting || !panel.mesh.visible) return; mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const h = ray.intersectObject(panel.mesh)[0]; const r = h ? padHit(h.uv) : null; setHover(r?.id || null); renderer.domElement.style.cursor = r ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting || !panel.mesh.visible) return; if (actx) actx.resume(); mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const h = ray.intersectObject(panel.mesh)[0]; const r = h ? padHit(h.uv) : null; if (r) click(r.id);
});
const KEYMAP = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
addEventListener('keydown', (e) => {
  if (e.repeat) return; if (actx) actx.resume();
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
renderer.xr.addEventListener('sessionstart', () => {
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); document.getElementById('launcher')?.classList.add('hide'); needRecenter = 1; if (actx) actx.resume();
});
renderer.xr.addEventListener('sessionend', () => {
  needRecenter = 0; deskCamera(); document.getElementById('launcher')?.classList.remove('hide'); if (state === 'playing') quitToMenu(); recenter(); drawPanel();
});

// ---------- 主循环 ----------
let T = 0, last = performance.now(), frames_ = 0;
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
function frame() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now; T += dt;
  checkRecenter();
  if (renderer.xr.isPresenting) updateXRPanelRay();
  if (state === 'playing') updatePlay(dt);
  // 视觉
  pulse *= Math.exp(-dt * 6); const sp = state === 'playing' ? songTime() : T * 0.5;
  sky.material.uniforms.uT.value = T; sky.material.uniforms.uPulse.value = pulse; sky.material.uniforms.uProg.value = figReveal;
  floorMat.uniforms.uScroll.value = (sp * SPEED) % 1000; floorMat.uniforms.uPulse.value = pulse;
  figReveal += (figTarget - figReveal) * Math.min(1, dt * (state === 'playing' ? 4 : 1.5));
  const cy = FIG_H * 1.03 * figReveal; revealPlane.constant = cy; ghostPlane.constant = -cy;
  scanPlane.visible = figReveal > 0.01 && figReveal < 0.985; scanPlane.position.y = figReveal * 1.03;
  figure.rotation.y = Math.sin(T * 0.35) * 0.3; figure.position.y = Math.sin(T * 0.9) * 0.08;
  lA.intensity = 700 + 900 * pulse; lB.intensity = 700 + 900 * pulse;
  for (const f of frames) { const u = f.userData; u.flash = Math.max(0, u.flash - dt * 3.5); f.material.opacity = 0.22 + u.flash * 0.8; f.scale.setScalar(1 + u.flash * 0.25); }
  if (judgeT > 0) { judgeT -= dt; hudDirty = true; }
  hudT += dt; if (state === 'playing' && hud.mesh.visible && (hudDirty || hudT > 0.12) && hudT > 0.05) { drawHud(); hudT = 0; hudDirty = false; }
  updateParticles(dt);
  if (state === 'result') { figure.rotation.y += dt * 0.6; }
  renderer.render(scene, camera); if (++frames_ === 8) window.__ready = true;
}
renderer.setAnimationLoop(frame);

// ---------- 启动 ----------
async function boot() {
  const st = document.getElementById('status'); if (st) st.textContent = '正在加载 …';
  await loadData(); if (actx) loadAudio().then(() => { drawPanel(); }); else audioState = 'fail';
  recenter(); layoutFrames(); drawPanel(); showFigure(save.sel);
  document.body.classList.add('ready'); window.__booted = true; if (st) st.textContent = `已解锁 ${save.unlocked.length} / ${models.length} · 歌曲 ChainedGhost`;
  if (TEST) startDesktop();
}
function startDesktop() { document.getElementById('launcher')?.classList.add('hide'); if (actx) actx.resume(); }
async function startVR() {
  if (!navigator.xr) { alert('此浏览器不支持 WebXR（用 Quest 浏览器打开）'); return; }
  try { if (actx) actx.resume(); const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }); await renderer.xr.setSession(s); }
  catch (e) { console.error(e); alert('无法进入 VR：' + e.message); }
}
window.GM = { debug: { notes: () => notes, now: songTime, toWorld: (x, y, z) => play.localToWorld(new THREE.Vector3(x, y, z)), COLX, rowY, HIT_Z, SPEED, panelPos: () => panel.mesh.getWorldPosition(new THREE.Vector3()), hover: () => hoverId }, startVR, startDesktop, skip: (sec) => { fallbackT0 -= (sec * 1000) / RATE; startAt -= sec; }, state: () => state, save, click, get stats() { return stats; }, get result() { return result; } };
boot().catch((e) => { console.error(e); const st = document.getElementById('status'); if (st) st.textContent = '加载失败：' + e.message; });
