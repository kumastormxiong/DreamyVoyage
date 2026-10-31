import * as THREE from 'three';
import { Envs, ENV_DEFS, PAL, U } from './envs.js';
import { Stage, FX } from './stage.js';
import { Lights } from './lights.js';
import { UI } from './ui.js';
import { Controls } from './input.js';
import { Music } from './audio.js';
import { clamp } from './util.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const quest3 = /Quest 3/i.test(navigator.userAgent);
const qual = Q.get('q') || (quest3 ? 'high' : 'mid');
const FB = { low: 0.8, mid: 1.0, high: 1.25 }[qual] ?? 1.0;

// ---------- 渲染器 / 场景 / 玩家平台 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(1); renderer.xr.setFramebufferScaleFactor(FB);
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
};
const app = { renderer, scene, camera, rig, st, statusText: '正在加载 …' };
window.DM = { app, U, PAL };

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
  app.rebuildEnvMap(); fadeT = 1; ui.say('环境：' + d.zh + ' ' + d.en); ui.invalidate();
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
app.next = () => { if (st.mode === 'gallery') { stage.index = (stage.index + 1) % stage.count; ui.invalidate(); } else stage.next(1); };
app.prev = () => { if (st.mode === 'gallery') { stage.index = (stage.index + stage.count - 1) % stage.count; ui.invalidate(); } else stage.next(-1); };
app.resetStage = () => { stage.resetTransform(); ui.say('模型已重置'); ui.invalidate(); };
app.resetRig = () => {
  rig.position.set(0, 0, st.mode === 'gallery' ? 0 : 2.5); rig.rotation.set(0, 0, 0); controls.yaw = 0; controls.pitch = 0;
};
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
  if (!started && !renderer.xr.isPresenting) { controls.yaw = Math.sin(T * 0.12) * 0.45; controls.pitch = -0.05; }   // 启动页背景：缓慢摇镜
  controls.update(dt);
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
  const manifest = await (await fetch('./models.json')).json();
  await stage.init(manifest);
  app.setEnv(Number(Q.get('env') ?? 0)); app.applyFx();
  if (Q.has('ui')) app.toggleUI(Q.get('ui') !== '0'); else app.toggleUI(!TEST);
  ui.tab = Number(Q.get('tab') ?? 0);
  if (Q.get('gallery') === '1') { st.mode = 'gallery'; stage.setMode('gallery'); app.resetRig(); stage.setHover(-1); } else app.resetRig();
  await stage.showModel(Number(Q.get('model') ?? 0), { instant: TEST });
  if (Q.get('scale')) stage.setScale(Number(Q.get('scale')));
  if (Q.get('rot') === '0') { st.autoRotate = false; stage.autoRotate = false; }
  window.__booted = true; document.body.classList.add('ready');
  if (TEST) startDesktop();
}
function startDesktop() { started = true; document.getElementById('launcher')?.classList.add('hide'); app.toggleUI(st.uiOpen); app.userGesture(); }
async function startVR() {
  if (!navigator.xr) { alert('此浏览器不支持 WebXR'); return; }
  try {
    if (st.music) music.start();           // 必须在点击手势内启动音频
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'layers'] });
    await renderer.xr.setSession(session); started = true;
    document.getElementById('launcher')?.classList.add('hide');
  } catch (e) { console.error(e); alert('无法进入 VR：' + e.message); }
}
renderer.xr.addEventListener('sessionstart', () => { ui.dom.style.display = 'none'; app.resetRig(); app.toggleUI(true); camera.position.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.6, 0); app.toggleUI(st.uiOpen); document.getElementById('launcher')?.classList.remove('hide'); started = false; });
window.DM.startVR = startVR; window.DM.startDesktop = startDesktop;
if (Q.has('fps')) { const d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', right: '10px', top: '8px', color: '#0f0', font: '14px monospace', zIndex: 50 }); document.body.appendChild(d); let t0 = performance.now(); setInterval(() => { const dt = (performance.now() - t0) / 1000; d.textContent = renderer.info.render.calls + ' calls · ' + Math.round(renderer.info.render.triangles / 1000) + 'k tris · ' + Math.round(fcount / dt) + ' fps'; fcount = 0; t0 = performance.now(); }, 1000); }
boot().catch((e) => { console.error(e); const el = document.getElementById('status'); if (el) el.textContent = '加载失败：' + e.message; });
