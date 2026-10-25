// vr3dgs 主程序：把 GhostChain MV 的歌、时间轴、歌词和音频特征，搬进一座用 3DGS 重建的万神殿里。
// 独立于原 MV 工程：所有数据与代码都在本文件夹内。
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { Features } from './features.js';
import { Timeline } from './timeline.js';
import { Spectrum } from './spectrum.js';
import { SPLAT_URL, AUDIO_URL, EYE, LIFT, CULL, FLOOR_R, SPLAT_XFORM, QUALITY, PREVIEW_FOV, styleAt } from './config.js';
import { collectChars, buildAtlas } from './atlas.js';
import { createSplatFx } from './splatfx.js';
import { decimate } from './decimate.js';
import { createStage } from './stage.js';
import { createSets } from './sets.js';
import { createDirector } from './director.js';
import { createLyrics } from './lyrics3d.js';
import { createInput } from './input.js';

const $ = (id) => document.getElementById(id);
const L = (zh, en) => (window.__L ? window.__L(zh, en) : zh);
const q = new URLSearchParams(location.search);
const T_FIX = q.has('t') ? parseFloat(q.get('t')) : null;          // ?t=45 固定在第 45 秒（截图/调试用）
const SHOW_FPS = q.has('fps');
const AUDIO_OFFSET = parseFloat(q.get('ao') || '0') || 0;          // ?ao=0.05 微调音画同步（秒）
const NO_LOD_PARAM = q.get('lod') === '0';                               // ?lod=0 关闭 LoD，直接渲染全部 400 万点（电脑上更清晰，加载更快）
const NO_FX = q.get('fx') === '0';                                 // ?fx=0 关闭大厅发光着色器（更省电）

let statusKey = ['加载中…', 'Loading…'];
const setStatus = (zh, en) => { statusKey = [zh, en || zh]; $('status').textContent = L(...statusKey); };
window.__refreshText = () => { $('status').textContent = L(...statusKey); refreshXrNote(); $('bPlay').textContent = audio && audio.paused ? L('播放', 'Play') : L('暂停', 'Pause'); };
addEventListener('error', (e) => setStatus('出错：' + (e.message || e), 'Error: ' + (e.message || e)));
addEventListener('unhandledrejection', (e) => setStatus('出错：' + (e.reason && e.reason.message || e.reason), 'Error: ' + (e.reason && e.reason.message || e.reason)));
let audio = null;
let xrOK = false;

// ---------- 画质 ----------
const ua = navigator.userAgent;
const isQuest = /OculusBrowser|Quest/i.test(ua);
const defaultQ = isQuest ? (/Quest 3|Quest3/i.test(ua) ? 'std' : 'low') : 'high';
const qSel = $('quality');
for (const [k, v] of Object.entries(QUALITY)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; qSel.appendChild(o); }
qSel.value = (() => { try { return q.get('q') || localStorage.getItem('v3dgs_quality') || defaultQ; } catch (e) { return defaultQ; } })();
if (!QUALITY[qSel.value]) qSel.value = defaultQ;
const curQ = () => QUALITY[qSel.value] || QUALITY.std;
const NO_LOD = NO_LOD_PARAM || !curQ().lod;                         // 精简档（标准/省电）不用 LoD；高档默认 LoD

// ---------- 渲染器 / 场景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x03010a);
renderer.xr.enabled = q.get('xr') !== '0';
renderer.xr.setReferenceSpaceType('local-floor');
$('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(PREVIEW_FOV, innerWidth / innerHeight, 0.05, 400);
if (q.has('near')) camera.near = +q.get('near'); if (q.has('far')) camera.far = +q.get('far');
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
camera.position.set(0, EYE, 0);
addEventListener('resize', () => { if (!renderer.xr.isPresenting) { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } });

const spark = new SparkRenderer(NO_LOD ? { renderer } : { renderer, enableLod: true, lodSplatCount: curQ().lod });
scene.add(spark);

// ---------- 数据 ----------
setStatus('加载字体与数据…', 'Loading fonts & data…');
await Promise.all([document.fonts.load('900 64px NotoSansSC', 'アイウ'), document.fonts.load('italic 800 64px Exo2', 'CHAINEDGHOST')]).catch(() => {});
const [feat, tl, spec] = await Promise.all([Features.load('./data/features.json'), Timeline.load(), Spectrum.load('./data/spectrum.json')]);
const lyricsJson = await fetch('./data/lyrics.json').then((r) => r.json());
const atlas = buildAtlas(collectChars(lyricsJson));
const loadTex = (u) => new Promise((res, rej) => new THREE.TextureLoader().load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
const avatarTex = await loadTex('assets/avatar_full.png');

function makeTitleTex() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 512;
  const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.shadowColor = '#ff2f8f'; g.shadowBlur = 26; g.fillStyle = '#fff';
  g.font = 'italic 800 250px Exo2, sans-serif'; g.fillText('CHAINEDGHOST', 1024, 270);
  g.shadowColor = '#3ff6ff'; g.shadowBlur = 18;
  g.font = '900 92px NotoSansSC, sans-serif'; g.fillText('虚  空  造  物', 1024, 430);
  g.shadowBlur = 0; g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = '600 34px NotoSansSC, sans-serif';
  g.fillText('Scene · The Pantheon Interior by David Fletcher (CC BY 4.0) · superspl.at/scene/dac6e508', 1024, 500);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- 3DGS 万神殿 ----------
const sx = { scale: parseFloat(q.get('s') || SPLAT_XFORM.scale), y: parseFloat(q.get('sy') || SPLAT_XFORM.y), rotY: parseFloat(q.get('ry') || SPLAT_XFORM.rotY) };
const yawRoot = new THREE.Group(); yawRoot.rotation.y = sx.rotY * Math.PI / 180; yawRoot.position.y = sx.y; scene.add(yawRoot);
const flipRoot = new THREE.Group(); flipRoot.rotation.x = Math.PI; flipRoot.scale.setScalar(sx.scale); yawRoot.add(flipRoot);
setStatus('加载万神殿模型（约 60 MB，首次需要构建 LoD，请稍候）…', 'Loading the Pantheon model (~60 MB; building LoD on first load)…');
let splat = new SplatMesh({
  url: SPLAT_URL, lod: !NO_LOD,
  onProgress: (e) => { if (e && e.total) { const p = Math.min(1, e.loaded / e.total); $('progFill').style.width = (p * 80).toFixed(0) + '%'; } },
});
flipRoot.add(splat);
await splat.initialized;
if (curQ().keep && !q.has('full')) {                                // 标准 / 省电：只保留大的高斯点
  setStatus('精简模型（只保留较大的高斯点）…', 'Simplifying the model (keeping the larger splats)…');
  await new Promise((r) => setTimeout(r, 30));
  const r = decimate(splat, curQ().keep, curQ().grow);
  if (r.packed !== splat.packedSplats) {
    const old = splat;
    splat = new SplatMesh({ packedSplats: r.packed });
    flipRoot.remove(old); try { old.dispose(); } catch (e) {}
    flipRoot.add(splat); await splat.initialized;
  }
  window.__splatCount = r.kept + '/' + r.total;
}
$('progFill').style.width = '92%';

const stage = createStage({ scene, atlas, titleTex: makeTitleTex(), avatarTex });
const lyrics = createLyrics({ atlas, parent: stage.root });
if (q.get('stage') === '0') { stage.root.visible = false; }
if (q.get('flat') === '1') { flipRoot.remove(splat); splat.rotation.x = Math.PI; splat.scale.setScalar(sx.scale); scene.add(splat); }
const sets = createSets({ scene, floorR: FLOOR_R });
const cull = { r: q.has('cr') ? +q.get('cr') : CULL.r, h: q.has('ch') ? +q.get('ch') : CULL.h };
const fx = (NO_FX || !curQ().fx) ? null : createSplatFx(splat, cull);
const director = createDirector(tl, LIFT);

// ---------- 音频与播放控制 ----------
audio = new Audio(new URL(AUDIO_URL, location.href).href);
audio.preload = 'auto';
const secs = tl.sections;
const toggle = () => { if (T_FIX !== null) return; if (audio.ended) audio.currentTime = 0; audio.paused ? audio.play() : audio.pause(); };
const jumpSec = (d) => {
  const S0 = tl.at(audio.currentTime);
  const i = Math.max(0, Math.min(secs.length - 1, S0.index + d));
  audio.currentTime = secs[i].start + 0.01;
  if (audio.paused) audio.play();
};
const input = createInput({ renderer, dom: renderer.domElement, rig, camera, onToggle: toggle, onNext: () => jumpSec(1), onPrev: () => jumpSec(-1) });
if (q.has('yaw')) { input.st.auto = false; input.st.yaw = parseFloat(q.get('yaw')) * Math.PI / 180; input.st.pitch = parseFloat(q.get('pitch') || '0') * Math.PI / 180; }
if (q.get('auto') === '0') input.st.auto = false;

// ---------- 页面状态 ----------
let mode = 'home';
const seek = $('seek'); seek.max = tl.duration;
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showHome() { mode = 'home'; document.body.classList.remove('preview'); audio.pause(); }
function startPreview() { mode = 'preview'; document.body.classList.add('preview'); if (T_FIX === null) audio.play(); }
$('bPreview').onclick = startPreview; $('bHome').onclick = showHome; $('bPlay').onclick = toggle;
$('bAuto').onclick = () => input.toggleAuto();
seek.oninput = () => { audio.currentTime = +seek.value; };
qSel.onchange = () => {                                              // 画质决定模型精度：换档后重新载入页面
  try { localStorage.setItem('v3dgs_quality', qSel.value); } catch (e) {}
  const u = new URL(location.href); u.searchParams.set('q', qSel.value); location.href = u.toString();
};
addEventListener('keydown', (e) => {
  if (mode !== 'preview' || (e.target.closest && e.target.closest('input,select'))) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') audio.currentTime += 5;
  else if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  else if (e.code === 'PageDown') jumpSec(1); else if (e.code === 'PageUp') jumpSec(-1);
  else if (e.code === 'KeyC') input.toggleAuto();
});

async function enterVR() {
  const qd = curQ();
  if (!NO_LOD) spark.lodSplatCount = qd.lod;
  renderer.xr.setFramebufferScaleFactor(qd.scale);
  const req = navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  if (audio.ended) audio.currentTime = 0;
  audio.play();
  try {
    const session = await req;
    await renderer.xr.setSession(session);
    try { renderer.xr.setFoveation(qd.fov); } catch (e) {}
    mode = 'vr'; document.body.classList.remove('preview');
    rig.position.set(0, LIFT, 0); rig.rotation.set(0, 0, 0);
    session.addEventListener('end', () => { showHome(); camera.position.set(0, EYE, 0); setStatus('已退出 VR。可以再次进入，会从当前位置继续。', 'Left VR. Enter again to resume from here.'); });
  } catch (e) { audio.pause(); setStatus('无法进入 VR：' + (e.message || e), 'Cannot enter VR: ' + (e.message || e)); }
}
$('bEnterVR').onclick = enterVR; $('bVR2').onclick = enterVR;

xrOK = navigator.xr ? await navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : false;
$('bEnterVR').disabled = !xrOK; $('bVR2').style.display = xrOK ? '' : 'none'; $('bPreview').disabled = false;
function refreshXrNote() {
  $('xrnote').textContent = xrOK ? '' : (!window.isSecureContext
    ? L('当前地址不是 HTTPS，浏览器不允许进入 VR。请通过 https:// 地址（或本机 localhost）打开。', 'This page is not HTTPS, so VR is blocked. Open it via https:// (or localhost).')
    : L('当前浏览器不支持 WebXR VR。请用 Quest 自带浏览器打开；电脑或手机可以先用预览模式。', 'This browser does not support WebXR VR. Use the Quest browser; on desktop or phone use Preview.'));
}
refreshXrNote();
$('progFill').style.width = '100%';
setStatus('已就绪 · Ready', 'Ready');

// ---------- 每帧 ----------
const style = { ca: new THREE.Color(), cb: new THREE.Color() };
const specArr = new Float32Array(32);
const ages = [99, 99, 99];
const anchor = { yaw: 0, sec: -1 };
const _v = new THREE.Vector3();
const headYaw = () => { (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldDirection(_v); return Math.atan2(-_v.x, -_v.z); };
const baseYaw = (i) => (i * 2.399963) % (Math.PI * 2);
let lastFx = 0, lastNow = performance.now(), fpsN = 0, fpsT = 0, fps = 0, uiT = 0, frames = 0;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  const t = T_FIX !== null ? T_FIX : Math.max(0, Math.min(tl.duration - 0.001, audio.currentTime + AUDIO_OFFSET));
  const S0 = tl.at(t), f = feat.at(t), k = tl.kana(t);
  spec.at(t, specArr);
  styleAt(tl, S0, style);
  for (let j = 0; j < 3; j++) { const i = f.kickIdx - j; ages[j] = i >= 0 ? t - feat.kicks[i] : 99; }

  const xr = renderer.xr.isPresenting;
  input.update(dt);
  // 歌词墙/标题牌的位置：每段开始放在观众正前方（自动运镜时用固定朝向，保证镜头一直看得到）
  if (S0.index !== anchor.sec) { anchor.sec = S0.index; anchor.yaw = (xr || !input.st.auto) ? headYaw() : baseYaw(S0.index); }
  let shotName = '';
  if (!xr) {
    if (input.st.auto) {                                           // 自动运镜：导演按段落编排的镜头（推拉、横移、环绕、升降到穹顶……）
      rig.position.set(0, 0, 0);
      shotName = director.apply(camera, t, S0, anchor.yaw, f.kick);
    } else { input.applyManual(camera); camera.fov = PREVIEW_FOV; }
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  } else rig.position.y = LIFT;
  const ev = director.events(t, S0, f);
  const theta = Math.atan2(-Math.cos(anchor.yaw), -Math.sin(anchor.yaw));

  if (fx && (!curQ().fxHz || now - lastFx >= 1000 / curQ().fxHz)) { lastFx = now; fx.update({ t, f, style, ages, ev, orb: { x: -Math.sin(anchor.yaw) * 8, y: 5.5, z: -Math.cos(anchor.yaw) * 8 } }); }
  stage.update({ t, dur: tl.duration, f, spec: specArr, style, ages, theta });
  sets.update({ t, f, spec: specArr, style, ev, yaw: anchor.yaw });
  lyrics.update({ t, dt, k, theta, style });

  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  if (mode === 'preview' && (uiT += dt) > 0.2) {
    uiT = 0; seek.value = t;
    $('info').textContent = `${fmt(t)} / ${fmt(tl.duration)}  ${S0.sec.name}${SHOW_FPS ? '  ' + shotName : ''}${SHOW_FPS ? '  ' + fps + 'fps' : ''}`;
    $('bPlay').textContent = audio.paused ? L('播放', 'Play') : L('暂停', 'Pause');
    $('bAuto').style.opacity = input.st.auto ? 1 : 0.55;
  }
  renderer.render(scene, camera);
  if (++frames === 4) window.__ready = true;
});

window.__v3 = { sets, director, renderer, spark, splat, audio, tl, feat, input, stage, fx, camera, rig };
if (q.get('preview') === '1' || T_FIX !== null) startPreview();
