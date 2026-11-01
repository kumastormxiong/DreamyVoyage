import * as THREE from 'three';
import { Envs, ENV_DEFS, PAL, U } from './envs.js';
import { Stage, FX } from './stage.js';
import { Lights } from './lights.js';
import { UI } from './ui.js';
import { Controls } from './input.js';
import { Music } from './audio.js';
import { clamp } from './util.js';
import { LIFE, setLife, tickLife } from './life.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const quest3 = /Quest 3/i.test(navigator.userAgent);
const qual = Q.get('q') || (quest3 ? 'high' : 'mid');
const FB = { low: 0.8, mid: 1.0, high: 1.25 }[qual] ?? 1.0;

// ---------- 渲染器 / 场景 / 玩家平台 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(Math.min(1, Math.max(0, parseFloat(new URLSearchParams(location.search).get('fov') ?? '0') || 0))); renderer.xr.setFramebufferScaleFactor(FB);
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 3500);
const rig = new THREE.Group(); rig.name = 'rig'; rig.add(camera); scene.add(rig);
camera.position.set(0, 1.6, 0);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- 应用状态 ----------
const st = {
  mode: 'showcase', autoRotate: true, scan: false, wire: false, rim: 1.2, exposure: 1.0,
  lightAuto: false, orbs: true, lightFollow: true, selLight: 0,
  envIdx: 0, fog: 1, hue: 0, glow: 1, envInt: 1, particles: 0.7, music: true, vol: 0.55, react: 1,
  speed: 6, autoSpeed: true, snap: true, invertY: false, uiOpen: true,
  rotSpeed: 0.35, galCount: 12, dropScale: 0.6, placeMode: false, spinPlaced: false, mainVisible: true, pass: false,
};
const app = { renderer, scene, camera, rig, st, statusText: '正在加载 …', sessionMode: null };
window.DM = { app, U, PAL, LIFE };
app.setLife = (o) => { setLife(o); ui.invalidate(); };

const envs = new Envs(scene);
const stage = new Stage(scene);
const lights = new Lights(scene);
const music = new Music();
Object.assign(app, { envs, stage, lights, music });
const ui = new UI(app); app.ui = ui;
const controls = new Controls(app); app.controls = controls;
scene.environmentIntensity = st.envInt;

// ---------- 反射环境（PMREM）：由当前调色板生成，模型的金属/高光反射霓虹 ----------
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
app.rebuildEnvMap = () => {
  const s = new THREE.Scene();
  const g = new THREE.SphereGeometry(50, 32, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50; if (y > 0) c.copy(PAL.mid).lerp(PAL.top, Math.pow(y, 0.7)); else c.copy(PAL.mid).lerp(PAL.bot, Math.pow(-y, 0.6));
    c.multiplyScalar(0.9); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (color, k, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(PAL.a, 7, -30, 8, 22, 28, 9); panel(PAL.b, 7, 30, 6, 20, 28, 9); panel(PAL.c, 5, 0, 35, -10, 30, 8); panel(PAL.a, 4, 22, 4, -30, 24, 7); panel(PAL.b, 4, -26, 4, -26, 24, 7);
  const rt = pmrem.fromScene(s, 0.03); envRT?.dispose(); envRT = rt; scene.environment = rt.texture;
  g.dispose(); s.traverse((o) => { if (o.material) o.material.dispose(); });
};
app.paletteChanged = () => { U.uGlow.value = st.glow; envs.refreshPalette(); };
app.applyFx = () => { FX.uRim.value = st.rim; FX.uScan.value = st.scan ? 1 : 0; };
app.touchLight = () => ui.invalidate();

// ---------- 黑场淡入（切换环境时用）----------
const fade = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
fade.renderOrder = 2000; fade.frustumCulled = false; scene.add(fade); let fadeT = 0;

// ---------- 动作 ----------
app.setEnv = (i) => {
  i = (i + ENV_DEFS.length) % ENV_DEFS.length; st.envIdx = i;
  const d = envs.set(i);
  if (st.lightFollow) lights.apply(d.light);
  app.rebuildEnvMap(); fadeT = st.pass ? 0 : 1; ui.say('环境：' + d.zh + ' ' + d.en); ui.invalidate();
};
app.setMode = (m) => {
  if (st.mode === m) return;
  st.mode = m; stage.resetTransform(); stage.setMode(m); app.resetRig();
  if (m === 'showcase' && !stage.cur) stage.showModel(stage.index);
  ui.say(m === 'gallery' ? '画廊模式：指向模型，扳机选择' : '展台模式'); ui.invalidate();
};
app.selectModel = (i) => {
  if (st.mode !== 'showcase') { st.mode = 'showcase'; stage.resetTransform(); stage.setMode('showcase'); app.resetRig(); }
  stage.showModel(i); ui.invalidate();
};
app.next = () => { if (st.mode === 'gallery') app.galPage(1); else stage.next(1); };
app.prev = () => { if (st.mode === 'gallery') app.galPage(-1); else stage.next(-1); };
app.galPage = (d) => { stage.galleryPage(d); ui.say(`画廊 第 ${stage.galPage + 1}/${stage.galPages} 页`); ui.invalidate(); };
app.setGalCount = (n) => { st.galCount = n; stage.setGallery(n, Math.floor(stage.index / n)); ui.say(`画廊每页 ${n} 个`); ui.invalidate(); };
app.resetStage = () => { stage.resetTransform(); ui.say('模型已重置'); ui.invalidate(); };
app.resetRig = () => {
  rig.position.set(0, 0, st.mode === 'gallery' ? 0 : 2.5); rig.rotation.set(0, 0, 0); controls.yaw = 0; controls.pitch = 0;
};
// ---------- MR 透视 + 多模型摆放 ----------
const floorY = () => (st.pass ? rig.position.y : 0);
app.floorY = floorY;
app.setPassthrough = (on) => {
  st.pass = on; envs.group.visible = !on; renderer.setClearAlpha(on ? 0 : 1); fadeT = 0;
  ui.say(on ? 'MR 透视：开（背景为真实房间）' : 'MR 透视：关（虚拟环境）'); ui.invalidate();
};
app.toggleMR = () => {
  if (app.sessionMode === 'ar') app.setPassthrough(!st.pass);
  else if (app.sessionMode === 'vr') {
    try { localStorage.setItem('dm_want_mr', '1'); } catch (e) { /* 无痕模式 */ }
    ui.say('正在退出 VR … 回到页面后点「进入 MR 透视」');
    setTimeout(() => renderer.xr.getSession()?.end(), 900);
  } else ui.say('MR 透视只能在 Quest 头显浏览器里用');
  ui.invalidate();
};
app.placeAt = (pos) => {
  if (st.mode !== 'showcase') { ui.say('摆放只在展台模式使用'); return; }
  camera.getWorldPosition(tmpH);
  const yaw = Math.atan2(tmpH.x - pos.x, tmpH.z - pos.z);
  stage.addPlaced(stage.index, pos, yaw, st.dropScale).then((it) => {
    if (!it) ui.say('场景已满（最多 16 个），先移除几个'); else ui.say(`已放入 #${stage.index + 1}（场景 ${stage.placed.length} 个）`);
    ui.invalidate();
  });
  ui.invalidate();
};
app.addHere = () => {          // 放在面前 1.6 米的地面上，多个时左右错开
  rig.updateMatrixWorld(true); camera.getWorldPosition(tmpH); camera.getWorldDirection(tmpF); tmpF.y = 0; if (tmpF.lengthSq() < 1e-4) tmpF.set(0, 0, -1); tmpF.normalize();
  const right = new THREE.Vector3().crossVectors(tmpF, new THREE.Vector3(0, 1, 0)), k = stage.placed.length;
  const pos = tmpH.clone().addScaledVector(tmpF, 1.6).addScaledVector(right, (((k % 5) - 2) * 0.55) * Math.max(0.5, st.dropScale)); pos.y = floorY();
  app.placeAt(pos);
};
app.removeSel = () => { if (stage.sel < 0) { ui.say('先选中一个已摆放的模型'); return; } stage.removeSelected(); ui.say('已移除'); ui.invalidate(); };
app.clearPlaced = () => { stage.clearPlaced(); ui.say('场景已清空'); ui.invalidate(); };
app.setMainVisible = (v) => { st.mainVisible = v; stage.setMainVisible(v); ui.invalidate(); };
app.toggleMusic = () => { st.music = !st.music; if (st.music) music.start(); else music.stop(); ui.invalidate(); };
app.userGesture = () => { if (st.music && !music.on) music.start(); };
const tmpH = new THREE.Vector3(), tmpF = new THREE.Vector3();
function placeUI() {
  rig.updateMatrixWorld(true); camera.getWorldPosition(tmpH); camera.getWorldDirection(tmpF); tmpF.y = 0; if (tmpF.lengthSq() < 1e-4) tmpF.set(0, 0, -1); tmpF.normalize();
  const p = tmpH.clone().addScaledVector(tmpF, 1.05); p.y = tmpH.y - 0.1;
  ui.mesh.position.copy(rig.worldToLocal(p)); ui.mesh.lookAt(tmpH.x, tmpH.y - 0.05, tmpH.z);
}
app.toggleUI = (on) => {
  st.uiOpen = on ?? !st.uiOpen; const xr = renderer.xr.isPresenting;
  ui.mesh.visible = st.uiOpen && xr; ui.dom.style.display = st.uiOpen && !xr && started ? 'block' : 'none';
  if (st.uiOpen && xr) placeUI();
  ui.invalidate();
};
rig.add(ui.mesh);
stage.onStatus = (s) => { app.statusText = s; ui.invalidate(); const el = document.getElementById('status'); if (el) el.textContent = s; };
stage.onChange = () => ui.invalidate();

// ---------- 主循环 ----------
let last = performance.now(); let T = 0, started = false, frames = 0, fcount = 0; const camPos = new THREE.Vector3(), center = new THREE.Vector3();
function frame() {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now; T += dt;
  if (app.game && app.game.active) { app.game.frame(dt); fcount++; if (++frames === 8) window.__ready = true; return; }   // 音乐游戏接管画面（共用同一个渲染器 / XR 会话）
  if (!started && !renderer.xr.isPresenting) { controls.yaw = Math.sin(T * 0.12) * 0.45; controls.pitch = -0.05; }   // 启动页背景：缓慢摇镜
  controls.update(dt); tickLife(T);
  const audio = music.update(dt) * st.react;
  stage.update(T, dt);
  stage.center(center); lights.update(dt, center, stage.scale, 0, st.mode === 'gallery');
  rig.updateMatrixWorld(true); camera.getWorldPosition(camPos);
  U.uGlow.value = st.glow; U.uRain.value = st.particles;
  envs.update(T, dt, camPos, audio, st.fog / Math.pow(Math.max(1, stage.scale), 0.7));
  ui.update(dt);
  fade.position.copy(camPos); if (fadeT > 0) { fadeT = Math.max(0, fadeT - dt * 2.2); } fade.material.opacity = fadeT; fade.visible = fadeT > 0;
  renderer.render(scene, camera);
  fcount++; if (++frames === 8) window.__ready = true;
}
renderer.setAnimationLoop(frame);

// ---------- 启动 ----------
async function boot() {
  const manifest = await (await fetch(Q.get('manifest') || './models.json')).json();
  await stage.init(manifest); stage.rotSpeed = st.rotSpeed; stage.galCount = st.galCount;
  app.setEnv(Number(Q.get('env') ?? 0)); app.applyFx();
  if (Q.has('ui')) app.toggleUI(Q.get('ui') !== '0'); else app.toggleUI(!TEST);
  ui.tab = Number(Q.get('tab') ?? 0); if (Q.get('gc')) { st.galCount = Number(Q.get('gc')); stage.galCount = st.galCount; }
  if (Q.get('gallery') === '1') { st.mode = 'gallery'; stage.setMode('gallery'); app.resetRig(); stage.setHover(-1); } else app.resetRig();
  await stage.showModel(Number(Q.get('model') ?? 0), { instant: TEST });
  if (Q.get('scale')) stage.setScale(Number(Q.get('scale')));
  if (Q.get('rot') === '0') { st.autoRotate = false; stage.autoRotate = false; }
  window.__booted = true; document.body.classList.add('ready');
  if (TEST) startDesktop();
}
function startDesktop() { started = true; document.getElementById('launcher')?.classList.add('hide'); app.toggleUI(st.uiOpen); app.userGesture(); }
async function startXR(mode) {          // mode: 'vr' | 'ar'（ar = Quest 彩色/黑白透视，MR）
  if (!navigator.xr) { alert('此浏览器不支持 WebXR'); return; }
  try {
    if (st.music) music.start();           // 必须在点击手势内启动音频
    try { localStorage.removeItem('dm_want_mr'); } catch (e) { /* ignore */ }
    app.sessionMode = mode;
    const session = await navigator.xr.requestSession(mode === 'ar' ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'layers'] });
    await renderer.xr.setSession(session); started = true;
    document.getElementById('launcher')?.classList.add('hide');
  } catch (e) { app.sessionMode = null; console.error(e); alert((mode === 'ar' ? '无法进入 MR：' : '无法进入 VR：') + e.message); }
}
const startVR = () => startXR('vr'), startMR = () => startXR('ar');
renderer.xr.addEventListener('sessionstart', () => { ui.dom.style.display = 'none'; app.resetRig(); app.toggleUI(true); camera.position.set(0, 0, 0); app.setPassthrough(app.sessionMode === 'ar'); });
renderer.xr.addEventListener('sessionend', () => { app.sessionMode = null; app.setPassthrough(false); camera.position.set(0, 1.6, 0); app.toggleUI(st.uiOpen); document.getElementById('launcher')?.classList.remove('hide'); started = false; });
window.DM.startVR = startVR; window.DM.startMR = startMR; window.DM.startDesktop = startDesktop;
app.openGame = () => window.DM.openGame();
window.DM.openGame = async () => {      // 打开音乐游戏（按需加载）；游戏里「去展厅看看」会回到这里的展厅，VR 会话不中断
  try { controls.dropAll(true); const m = await import('../game/game.js'); if (!app.game) app.game = m.createGame(app); await app.game.activate(); }
  catch (e) { console.error(e); alert('无法打开音乐游戏：' + e.message); }
};
if (Q.has('fps')) { const d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', right: '10px', top: '8px', color: '#0f0', font: '14px monospace', zIndex: 50 }); document.body.appendChild(d); let t0 = performance.now(); setInterval(() => { const dt = (performance.now() - t0) / 1000; d.textContent = renderer.info.render.calls + ' calls · ' + Math.round(renderer.info.render.triangles / 1000) + 'k tris · ' + Math.round(fcount / dt) + ' fps'; fcount = 0; t0 = performance.now(); }, 1000); }
boot().catch((e) => { console.error(e); const el = document.getElementById('status'); if (el) el.textContent = '加载失败：' + e.message; });
