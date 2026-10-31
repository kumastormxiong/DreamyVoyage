// CHAINEDGHOST VR 主程序。
// 直接复用原 MV（web/src）的全部场景、时间轴、歌词和音频特征（只读引用，不改动原程序），
// 在此基础上：WebXR 渲染、观众平台（vr_rig）、手柄与预览操作（vr_input）、VR 提示面板（vr_panel）。
// 原 MV 的后期管线（泛光 / 色差 / 故障）在 VR 双眼渲染下无法使用，这里不加载；场景脚本写入的后期参数会被忽略。
import * as THREE from 'three';
import { loadFonts, makeAtlas, KANA, makeEnv } from '../../web/src/lib.js';
import { Features } from '../../web/src/features.js';
import { Timeline } from '../../web/src/timeline.js';
import { createWorlds } from '../../web/src/worlds/index.js';
import { loadEyeTextures, makeEyeField } from '../../web/src/eyes.js';
import { Spectrum } from '../../web/src/spectrum.js';
import { VR_QUALITY, AUDIO_FILE } from './vr_config.js';
import { adaptWorld } from './vr_rig.js';
import { createInput } from './vr_input.js';
import { createPanel } from './vr_panel.js';
import { loadKanaFonts, twinify, setKanaTime, kanaGeo } from './vr_kana3d.js';
import { attachFx } from './vr_fx.js';
import { PATCHES } from './vr_patches.js';
import { createPerf } from './vr_perf.js';
import { createSinger, SINGER_LAYER } from './vr_singer.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SHOW_FPS = q.has('fps');                                  // ?fps 在 VR 里显示帧率
const AUDIO_OFFSET = parseFloat(q.get('ao') || '0') || 0;       // ?ao=0.05 微调音画同步（秒）
const status = (s) => { $('status').textContent = s; };
addEventListener('error', (e) => status('出错：' + (e.message || e)));
addEventListener('unhandledrejection', (e) => status('出错：' + (e.reason && e.reason.message || e.reason)));

// ---------- 画质选项 ----------
const qSel = $('quality');
for (const [k, v] of Object.entries(VR_QUALITY)) { const o = document.createElement('option'); o.value = k; o.textContent = v.label; qSel.appendChild(o); }
qSel.value = (() => { try { return localStorage.getItem('ghostchain_vr_quality') || 'std'; } catch (e) { return 'std'; } })();
if (!VR_QUALITY[qSel.value]) qSel.value = 'std';
qSel.onchange = () => { try { localStorage.setItem('ghostchain_vr_quality', qSel.value); } catch (e) {} };

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x06010d);
renderer.toneMapping = THREE.NoToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('stage').appendChild(renderer.domElement);
addEventListener('resize', () => { if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight); });

// ---------- 复用原 MV 的资源 ----------
status('加载字体…');
await loadFonts();
status('加载时间轴与音频特征…');
const [feat, tl] = await Promise.all([Features.load('./data/features.json'), Timeline.load()]);
const spec = await Spectrum.load('./data/spectrum.json');
status('加载贴图…');
const loader = new THREE.TextureLoader();
const ld = (u) => new Promise((res, rej) => loader.load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
const [ghostTex, avatarTex, eyeT] = await Promise.all([ld('assets/avatar_ghost.png'), ld('assets/avatar_full.png'), loadEyeTextures()]);
const ctx = {
  renderer, W: 1920, H: 1080, THREE, ghostTex, avatarTex, eyeT, tl, feat, spec,
  makeEyeField: (specs) => makeEyeField(eyeT, specs),
  env: makeEnv(renderer),
  atlasF: makeAtlas(KANA, 'filled'), atlasO: makeAtlas(KANA, 'outline'),
};
status('加载立体字…');
await loadKanaFonts();
for (const ch of KANA) kanaGeo(ch);                 // 预先生成 46 个立体假名，避免播放中卡顿
status('创建场景…');
const worlds = createWorlds(ctx);
const perf = createPerf(renderer);
const adapters = {}, extras = {};
let twinCount = 0;
for (const [k, w] of Object.entries(worlds)) {
  const A = adaptWorld(k, w);
  adapters[k] = A;
  const patch = PATCHES[k] ? PATCHES[k](w, A, ctx) : null;   // 先打补丁（city 会复制街区），再做立体字
  const twins = twinify(w.scene, ctx.atlasF);
  const fx = attachFx(k, A);
  perf.register(w.scene);
  extras[k] = { patch, twins, fx };
  twinCount += twins.count;
}
console.log('立体假名替身：', twinCount);

// 后期参数的替身：场景脚本照常写入，VR 里不使用
const post = { s: {}, reset() { this.s = { bloom: 0.6, bloomR: 0.45, bloomT: 0.6, ab: 0.0022, glitch: 0, scan: 0.1, grain: 0.04, vig: 0.4, flash: [0, 0, 0], track: 0, warp: 0, pix: 0 }; } };
post.reset();

status('加载虚拟歌手…');
const singer = await createSinger(ctx).catch((e) => { console.warn('歌手模型加载失败，跳过', e); return null; });

status('预编译着色器…');
for (const [k, w] of Object.entries(worlds)) {
  if (singer) singer.attachForCompile(adapters[k].hud);
  w.camera.layers.enable(SINGER_LAYER);
  try { renderer.compile(w.scene, w.camera); } catch (e) { console.warn('compile', k, e); }
  w.camera.layers.disable(SINGER_LAYER);
  if (singer) singer.detach();
}

// ---------- 音频与播放控制 ----------
const audio = new Audio(new URL(AUDIO_FILE, import.meta.url).href);
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

// ---------- 页面状态：home（启动页）/ preview（浏览器预览）/ vr ----------
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
  // requestSession 与 play 都必须在点击事件里同步发起
  const req = navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  if (audio.ended) audio.currentTime = 0;
  audio.play();
  try {
    const session = await req;
    await renderer.xr.setSession(session);
    perf.setBase(qd.foveation);                       // 之后按实际帧率自动调整
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
    ? '当前地址不是 HTTPS，浏览器不允许进入 VR。请通过 https:// 地址（或本机 localhost）打开。'
    : '当前浏览器不支持 WebXR VR。请用 Quest 自带浏览器打开本页；电脑或手机可以先用预览模式。';
}
status('已就绪 · Ready');

// ---------- 主循环 ----------
let lastNow = performance.now();
let curSec = null, fpsN = 0, fpsT = 0, fps = 0, uiT = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  const t = Math.max(0, Math.min(tl.duration - 0.001, audio.currentTime + AUDIO_OFFSET));
  const S = tl.at(t);
  const name = adapters[S.sec.world] ? S.sec.world : 'void';
  const A = adapters[name], w = worlds[name];
  if (S.sec.id !== curSec) { curSec = S.sec.id; input.reset(); }
  input.update(dt, A.yaw);

  const xr = renderer.xr.isPresenting, X = extras[name];
  perf.tick(dt, xr);
  A.begin();
  post.reset();
  perf.before(xr);
  const f = feat.at(t), k = tl.kana(t);
  w.update({ t, f, S, k, tl, post, sec: S.sec, ctx });
  perf.after();
  if (X.patch) X.patch.after({ t, S, f, k, cam: w.camera });
  X.twins.sync(); setKanaTime(t);
  if (X.fx) X.fx.update(t, f);
  A.end(t, S, input.user);

  if (!xr) input.applyPreview(w.camera);
  if (singer) {
    // 观众眼睛与手柄的世界坐标（手柄姿态在 XR 参考空间里，参考空间原点就是观众平台 rig）
    const head = xr ? renderer.xr.getCamera() : w.camera;
    head.updateMatrixWorld(true);
    const viewer = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const hands = [0, 1].map((i) => {
      if (!xr) return window.__singerHands ? window.__singerHands[i] || null : null;
      const g = renderer.xr.getControllerGrip(i);
      return g.visible ? A.rig.localToWorld(g.position.clone()) : null;
    });
    singer.update(t, f, S, k, A, secs, { viewer, hands, dt });
  }

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
  // 歌手单独再画一遍：清空深度，画在所有内容之前（不被场景、歌词遮挡）
  if (singer && singer.visible) {
    const bg = w.scene.background, mask = w.camera.layers.mask;
    w.scene.background = null; w.camera.layers.set(SINGER_LAYER);
    renderer.autoClear = false; renderer.clearDepth();
    renderer.render(w.scene, w.camera);
    renderer.autoClear = true; w.camera.layers.mask = mask; w.scene.background = bg;
  }
});

window.__vr = { renderer, worlds, adapters, audio, tl, input, perf, extras, singer };   // 调试用
