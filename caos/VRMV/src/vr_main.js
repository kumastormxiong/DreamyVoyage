// VR 版主程序（WebXR，Quest 浏览器打开即可进入）。
// 直接复用平面 MV（web/src）的全部场景、时间轴、歌词和音频特征——只读引用，不改动平面版。
// 在此基础上：WebXR 渲染、观众平台（vr_rig）、手柄与预览操作（vr_input）、VR 提示面板（vr_panel）、帧率保障（vr_perf）、
// 着色器氛围特效（vr_fx）、可选的场景补丁（vr_patches）。
// 平面版的后期管线（泛光/色差/故障）在 VR 双眼渲染下不使用；场景写入的后期参数会被忽略。
import * as THREE from 'three';
import { loadProject, loadFonts, makeEnv, PAL } from '../../web/src/lib.js';
import { Features } from '../../web/src/features.js';
import { Timeline } from '../../web/src/timeline.js';
import { Spectrum } from '../../web/src/spectrum.js';
import { createWorlds } from '../../web/src/worlds/index.js';
import { warmLyrics } from '../../web/src/lyrics.js';
import { VR_QUALITY, VR_WORLD, DEFAULT_MODE, setEye } from './vr_config.js';
import { adaptWorld } from './vr_rig.js';
import { createInput } from './vr_input.js';
import { createPanel } from './vr_panel.js';
import { attachFx } from './vr_fx.js';
import { PATCHES } from './vr_patches.js';
import { createPerf } from './vr_perf.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SHOW_FPS = q.has('fps');                                  // ?fps 在 VR 里显示帧率
const AUDIO_OFFSET = parseFloat(q.get('ao') || '0') || 0;       // ?ao=0.05 微调音画同步（秒，正数让画面提前）
const status = (s) => { $('status').textContent = s; };
addEventListener('error', (e) => status('出错：' + (e.message || e)));
addEventListener('unhandledrejection', (e) => status('出错：' + (e.reason && e.reason.message || e.reason)));

const project = await loadProject();
const vrp = project.vr || {};
if (vrp.eye) setEye(vrp.eye);
if (vrp.default_mode) DEFAULT_MODE.mode = vrp.default_mode;
Object.assign(VR_WORLD, vrp.world_modes || {});
for (const el of document.querySelectorAll('[data-title]')) { el.textContent = project.title || 'MV'; el.setAttribute('data-t', project.title || 'MV'); }
for (const el of document.querySelectorAll('[data-artist]')) el.textContent = project.artist || '';
{ const a = document.querySelector('.top a'); const u = (project.deploy || {}).site_url; if (a && u) { a.href = u; a.textContent = '← ' + u.replace(/^https?:\/\//, '').replace(/\/$/, ''); a.removeAttribute('data-zh'); a.removeAttribute('data-en'); } }
document.title = `${project.title || 'MV'} VR`;

const qSel = $('quality');
for (const [k, v] of Object.entries(VR_QUALITY)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; qSel.appendChild(o); }
qSel.value = (() => { try { return localStorage.getItem('mv_vr_quality') || 'std'; } catch (e) { return 'std'; } })();
if (!VR_QUALITY[qSel.value]) qSel.value = 'std';
qSel.onchange = () => { try { localStorage.setItem('mv_vr_quality', qSel.value); } catch (e) {} };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(PAL.bg);
renderer.toneMapping = THREE.NoToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('stage').appendChild(renderer.domElement);
addEventListener('resize', () => { if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight); });

status('加载字体…');
await loadFonts();
status('加载时间轴与音频特征…');
const [feat, tl, spec] = await Promise.all([Features.load('./data/features.json'), Timeline.load(), Spectrum.load('./data/spectrum.json')]);
warmLyrics(tl);
const loader = new THREE.TextureLoader();
const loadTex = (u) => new Promise((res) => loader.load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));
const avatarTex = project.endcard && project.endcard.avatar ? await loadTex(project.endcard.avatar) : null;
const ctx = { renderer, W: project.width || 1920, H: project.height || 1080, THREE, tl, feat, spec, project, env: makeEnv(renderer), loadTex, avatarTex, vr: true };

status('创建场景…');
const worlds = createWorlds(ctx);
const perf = createPerf(renderer);
const adapters = {}, extras = {};
for (const [k, w] of Object.entries(worlds)) {
  const A = adaptWorld(k, w);
  adapters[k] = A;
  const patch = PATCHES[k] ? PATCHES[k](w, A, ctx) : null;
  const fx = attachFx(k, A);
  perf.register(w.scene);
  extras[k] = { patch, fx };
}
const post = { s: {}, reset() { this.s = { bloom: 0.6, bloomR: 0.45, bloomT: 0.6, ab: 0.0022, glitch: 0, scan: 0.1, grain: 0.04, vig: 0.4, flash: [0, 0, 0], track: 0, warp: 0, pix: 0 }; } };
post.reset();
status('预编译着色器…');
for (const [k, w] of Object.entries(worlds)) { try { renderer.compile(w.scene, w.camera); } catch (e) { console.warn('compile', k, e); } }

const audio = new Audio(new URL('../audio/' + (vrp.audio || 'song.mp3').split('/').pop(), import.meta.url).href);
audio.preload = 'auto';
const secs = tl.sections;
const toggle = () => { if (audio.ended) audio.currentTime = 0; audio.paused ? audio.play() : audio.pause(); };
const jumpSec = (d) => {
  const S = tl.at(audio.currentTime);
  const i = Math.max(0, Math.min(secs.length - 1, S.index + d));
  audio.currentTime = secs[i].start + 0.01;
  if (audio.paused) audio.play();
};
const input = createInput(renderer, renderer.domElement, { onToggle: toggle, onNext: () => jumpSec(1), onPrev: () => jumpSec(-1) });
const panel = createPanel();

let mode = 'home';
const seek = $('seek'); seek.max = tl.duration;
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showHome() { mode = 'home'; document.body.classList.remove('preview'); audio.pause(); }
function startPreview() { mode = 'preview'; document.body.classList.add('preview'); audio.play(); }
$('bPreview').onclick = startPreview;
$('bHome').onclick = showHome;
$('bPlay').onclick = toggle;
seek.oninput = () => { audio.currentTime = +seek.value; };
addEventListener('keydown', (e) => {
  if (mode !== 'preview' || (e.target.closest && e.target.closest('input,select'))) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') audio.currentTime += 5;
  else if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  else if (e.code === 'PageDown') jumpSec(1); else if (e.code === 'PageUp') jumpSec(-1);
});

async function enterVR() {
  const qd = VR_QUALITY[qSel.value] || VR_QUALITY.std;
  renderer.xr.setFramebufferScaleFactor(qd.scale);
  const req = navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });   // 必须在点击事件里同步发起
  if (audio.ended) audio.currentTime = 0;
  audio.play();
  try {
    const session = await req;
    await renderer.xr.setSession(session);
    perf.setBase(qd.foveation);
    mode = 'vr'; document.body.classList.remove('preview');
    session.addEventListener('end', () => { showHome(); status('已退出 VR。可以再次进入，会从当前位置继续。'); });
  } catch (e) {
    audio.pause(); status('无法进入 VR：' + (e.message || e));
  }
}
$('bEnterVR').onclick = enterVR;
$('bVR2').onclick = enterVR;
const xrOK = navigator.xr ? await navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : false;
$('bEnterVR').disabled = !xrOK; $('bVR2').style.display = xrOK ? '' : 'none';
$('bPreview').disabled = false;
if (!xrOK) {
  $('xrnote').textContent = !window.isSecureContext
    ? '当前地址不是 HTTPS，浏览器不允许进入 VR。请用 https:// 地址（或本机 localhost）打开。'
    : '当前浏览器不支持 WebXR VR。请用 Quest 自带浏览器打开；电脑或手机可以先用预览模式。';
}
status('已就绪 · Ready');

let lastNow = performance.now(), curSec = null, fpsN = 0, fpsT = 0, fps = 0, uiT = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  const t = Math.max(0, Math.min(tl.duration - 0.001, audio.currentTime + AUDIO_OFFSET));
  const S = tl.at(t);
  const name = adapters[S.sec.world] ? S.sec.world : 'void';
  const A = adapters[name], w = worlds[name], X = extras[name];
  if (S.sec.id !== curSec) { curSec = S.sec.id; input.reset(); }
  input.update(dt, A.yaw);
  const xr = renderer.xr.isPresenting;
  perf.tick(dt, xr);
  A.begin();
  post.reset();
  perf.before(xr);
  const f = feat.at(t), k = tl.lyric(t);
  w.update({ t, f, S, k, tl, post, sec: S.sec, ctx });
  perf.after();
  if (X.patch) X.patch.after({ t, S, f, k, cam: w.camera });
  if (X.fx) X.fx.update(t, f);
  A.end(t, S, input.user);
  if (!xr) input.applyPreview(w.camera);

  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  let msg = null;
  if (xr) {
    if (audio.ended) msg = ['END', '扳机：从头再看一次'];
    else if (audio.paused) msg = ['❚❚  已暂停', '扳机：继续　握把：切换段落'];
    else if (SHOW_FPS) msg = [`${fps} fps`, `${S.sec.name} · 注视点 ${perf.foveation.toFixed(2)}`];
  }
  panel.set(msg, A.hud);
  if (mode === 'preview' && (uiT += dt) > 0.2) {
    uiT = 0; seek.value = t;
    $('info').textContent = `${fmt(t)} / ${fmt(tl.duration)}  ${S.sec.name}${SHOW_FPS ? '  ' + fps + 'fps' : ''}`;
    $('bPlay').textContent = audio.paused ? '播放' : '暂停';
  }
  renderer.render(w.scene, w.camera);
});

window.__vr = { renderer, worlds, adapters, audio, tl, input, perf, extras };
