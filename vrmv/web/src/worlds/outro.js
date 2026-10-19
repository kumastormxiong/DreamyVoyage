
// 场景 outro（157–200 秒）：数据雨越下越密，歌词假名在镜头前逐个点亮，电路网格在脚下延伸，数据线像柱子一样升起。
// 之后的 200–226 秒由 soul / flash / soulvoid 三个场景接手（魂字与锁链都在那里）。
import * as THREE from 'three';
import { PAL, col, KANA, JP_FONT, KANJI_FONT, makeGrid, makeStars, hash, smooth, lerp, makeGlyphBank } from '../lib.js';
import { makeChain } from '../lib.js';
import { makeLyricLayer, makeCyberField } from '../cyber.js';

// 数据雨：列更窄、每列两条雨流、尾巴更长，画面比之前密集得多
const RW = 1280, RH = 720, CW = 14, CH = 16, NC = Math.floor(RW / CW), TAIL = 20, STREAMS = 2;

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x03000a);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  scene.add(makeStars(1200, 260, 1.4, 40)); scene.add(new THREE.AmbientLight(0x553355, 0.8));

  const rcv = document.createElement('canvas'); rcv.width = RW; rcv.height = RH; const rg = rcv.getContext('2d');
  const rtex = new THREE.CanvasTexture(rcv); rtex.colorSpace = THREE.SRGBColorSpace;
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(89.5, 50.4), new THREE.MeshBasicMaterial({ map: rtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  rain.position.z = -40; scene.add(rain);
  function drawRain(t, inten) {
    rg.clearRect(0, 0, RW, RH); rg.font = `700 ${CH - 2}px ${JP_FONT}`; rg.textAlign = 'center'; rg.textBaseline = 'middle';
    const P = RH + TAIL * CH;   // 一条雨流走完一圈的周期
    for (let c = 0; c < NC; c++) {
      for (let s = 0; s < STREAMS; s++) {
        const id = c + s * 0.37;   // 同一列的两条雨流用不同的随机种子
        if (hash(id * 1.7 + 0.5) > inten) continue;
        const sp = 0.45 + hash(id * 3.1) * 0.9, head = ((t * sp * 11 + hash(id * 5.3) * P)) % P;
        const warm = hash(id * 9.7) > 0.5;
        for (let r = 0; r < TAIL; r++) {
          const y = head - r * CH; if (y < -CH || y > RH + CH) continue;
          const a = Math.pow(1 - r / TAIL, 1.6) * (r === 0 ? 1 : 0.8);
          const ch = KANA[Math.floor(hash(id * 13.1 + r * 7.7 + Math.floor(t * 5 + c % 5) * 1.3) * KANA.length)];
          rg.fillStyle = r === 0 ? `rgba(255,255,255,${a})` : warm ? `rgba(255,70,160,${a * 0.9})` : `rgba(70,240,255,${a * 0.9})`;
          rg.fillText(ch, c * CW + CW / 2, y);
        }
      }
    }
    rtex.needsUpdate = true;
  }

  const grid = makeGrid({ y: -9, speed: 8, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); grid.material.uniforms.uFog.value = 0.02; scene.add(grid);
  const strands = makeChain(240, ctx.env); strands.mesh.frustumCulled = false; scene.add(strands.mesh);
  const cf = makeCyberField({ n: 18, codes: 6, box: [45, 30, 160], seed: 61 }); scene.add(cf.group);
  const eyesF = ctx.makeEyeField([
    { pos: [-24, 10, -26], w: 12, iris: 'blue', line: 'pink' }, { pos: [24, 15, -30], w: 13, iris: 'red', line: 'cyan' }, { pos: [-9, 17, -34], w: 11, iris: 'ring_cyan', line: 'pink' },
    { pos: [-27, -2, -24], w: 10, iris: 'orange', line: 'cyan' }, { pos: [8, 20, -38], w: 15, iris: 'ring_pink', line: 'cyan' }
  ]); scene.add(eyesF.group);
  const lyr = makeLyricLayer(ctx, camera, scene, { heroColor: 0xffd6ef, outline: PAL.cyan });

  // ヌ 阶段（171.18 秒起）：中心主字 ヌ 震动 → 大量静止的 ヌ 副本从慢到快弹出，逐渐铺满屏幕 → 一直保持到场景切换
  const KT0 = 171.18, KT1 = KT0 + 0.9;                  // ヌ 出现于 KT0；KT1 起开始震动并复制
  const kRoot = new THREE.Group(); if (camera.parent !== scene) scene.add(camera); camera.add(kRoot); kRoot.position.set(0, 0, -6);
  // 多字体 × 多配色的 ヌ 贴图（画布绘制，不依赖假名图集）
  const NU_FONTS = [`900 200px ${KANJI_FONT}`, `900 200px ${JP_FONT}`, `700 200px "Yu Gothic"`, `400 200px Meiryo`, `900 200px "MS Gothic"`, `400 200px serif`, `900 200px sans-serif`, `700 200px monospace`];
  const NU_COLS = [                                      // [填充色, 描边色]
    ['#ff8fd0', '#3ff6ff'], ['#3ff6ff', '#ff8fd0'], ['#ff2f8f', '#ffe600'],
    ['#b050ff', '#3ff6ff'], ['#2fe8a0', '#ff2fd0'], ['#ff3b6b', '#00d8ff']
  ];
  const nuTex = [];
  NU_FONTS.forEach((font) => NU_COLS.forEach(([fill, stroke]) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 14; g.strokeStyle = stroke; g.strokeText('ヌ', 128, 136);
    g.fillStyle = fill; g.fillText('ヌ', 128, 136);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; nuTex.push(tx);
  }));
  const pickTex = (idx) => nuTex[Math.floor(hash(idx * 6.7 + 9) * nuTex.length)];

  // 中心主字（唯一震动的 ヌ）
  // 震动的 ヌ 与歌词里 2:50 那个 ヌ 同款（同一字库、粉字青描边、同一位置），并画在所有图层之上
  const heroF = makeGlyphBank(ctx.atlasF, 0xffd6ef, 1, 0.8), heroO = makeGlyphBank(ctx.atlasO, PAL.cyan, 1, 0.7);
  [[heroO, 999], [heroF, 1000]].forEach(([bank, ro]) => {
    kRoot.add(bank.group); bank.group.visible = false;
    bank.group.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.depthWrite = false; o.renderOrder = ro; } });
  });

  // 静止副本（不抖动）：字号、颜色各不相同；弹出时间呈“先慢后快”（数量随时间近似二次增长），172.2 秒起、173.05 秒前后基本铺满
  // 铺满阶段的黑色渐隐层：背景从 174 秒起逐渐变黑，ヌ 的间隙里只剩纯黑；盖在背景之上、ヌ 之下
  const fadeBlack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
  fadeBlack.position.set(0, 0, -0.5); fadeBlack.renderOrder = 50; fadeBlack.visible = false; kRoot.add(fadeBlack);
  const statics = [];
  const addStatic = (nx, ny, sc, spawn, idx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pickTex(idx), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.6 }));
    m.visible = false; m.renderOrder = 100 + statics.length; kRoot.add(m);
    statics.push({ nx, ny, sc, spawn, m });
  };
  const spawnOf = (i) => 173.0 + 2.5 * Math.sqrt(hash(i * 4.1 + 2));   // 2:54 起开始铺满屏幕   // sqrt：早期稀疏，后期密集
  const SC = 18, SR = 12, NS = SC * SR;
  for (let r = 0; r < SR; r++) for (let c = 0; c < SC; c++) {          // 满屏网格，位置有轻微随机偏移
    const i = r * SC + c;
    addStatic((c + 0.5) / SC * 2 - 1 + (hash(i * 2.3) - 0.5) * 0.1, (r + 0.5) / SR * 2 - 1 + (hash(i * 5.9) - 0.5) * 0.1, 0.3 + hash(i * 1.7 + 3) * 0.4, spawnOf(i), i);
  }
  for (let i = 0; i < 60; i++) {                                       // 随机大副本，补满缝隙
    addStatic((hash(i * 11.3 + 3) - 0.5) * 2.1, (hash(i * 2.9 + 8) - 0.5) * 2.1, 0.6 + hash(i * 3.3 + 1) * 0.5, spawnOf(NS + i), NS + i);
  }

  function update({ t, f, S, k, post }) {
    const lt = S.lt;
    drawRain(t, lerp(0.35, 1.0, smooth(0, 28, lt)));
    rain.material.opacity = 0.6 + f.kick * 0.2;
    strands.layout((u) => {
      const a = u * Math.PI * 6 + t * 0.4;
      return new THREE.Vector3(Math.cos(a) * (7 + 3 * Math.sin(u * 9 + t)), -9 + u * 26, -18 + Math.sin(a) * 6);
    }, { frac: smooth(0, 6, lt), scale: 1, twist: t * 0.3, samples: 500 });
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.5;
    cf.update(t, f);
    eyesF.update(t, camera, { opacity: 0.85, appear: smooth(0, 10, lt), kick: f.kick });
    // ヌ 阶段：中心主字震动 → 静止副本逐渐铺满屏幕 → 一直保持到场景切换；这期间假名大字让位（底部字条仍然显示）
    const vEnd = S.sec.end;
    const kOn = t >= KT1 && t < vEnd;
    if (kOn) {
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 6, halfW = halfH * 16 / 9;
      const amp = 0.4 + 2.6 * smooth(KT1, KT1 + 1.5, t);     // 主字震动幅度逐渐变大
      const beat = f.kick * 0.5 + f.hit * 0.5;
      const shk = amp * (1 + beat * 0.8);
      const jx = (Math.sin(t * 47 + 9) * 0.02 + (hash(Math.floor(t * 24)) - 0.5) * 0.07) * halfH * shk;
      const jy = (Math.cos(t * 41 + 5) * 0.02 + (hash(Math.floor(t * 24) + 7) - 0.5) * 0.07) * halfH * shk;
      const hs = halfH * 0.66 * (1 + beat * 0.1), hy = halfH * -0.34 + jy;   // 歌词大字的同一位置与尺寸
      fadeBlack.visible = true; fadeBlack.material.opacity = smooth(174.0, 175.0, t); fadeBlack.scale.set(2 * halfW * 1.1, 2 * halfH * 1.1, 1);
      heroF.group.visible = heroO.group.visible = true;
      const a = heroF.show('ヌ', 0.95); a.position.set(jx, hy, 0.02); a.scale.setScalar(hs);
      const b = heroO.show('ヌ', 0.8); b.position.set(jx + halfH * 0.01, hy - halfH * 0.01, 0); b.scale.setScalar(hs * 1.04);
      for (const s of statics) {                             // 静止副本：只缩放弹出，不抖动
        if (t < s.spawn) { s.m.visible = false; continue; }
        s.m.visible = true;
        s.m.position.set(s.nx * halfW, s.ny * halfH, 0.005);
        s.m.scale.setScalar(s.sc * halfH * smooth(0, 0.12, t - s.spawn));
      }
    } else {
      heroF.group.visible = heroO.group.visible = false;
      fadeBlack.visible = false;
      for (const s of statics) s.m.visible = false;
    }
    if (kOn && k && k.i >= 0) { const flat = k.flat.slice(); flat[k.i] = ' '; lyr.update({ ...k, flat }, t, f); }
    else lyr.update(k, t, f);
    camera.position.set(Math.sin(t * 0.2) * 2.2, 3.6 + Math.sin(t * 0.33) * 0.4, 18 - smooth(0, 42, lt) * 4);
    camera.lookAt(0, 2.4, 0);
    const s = post.s; s.bloom = 0.3 + f.kick * 0.08; s.glitch = Math.max(s.glitch, f.hit * 0.2); s.ab = 0.0015 + f.hit * 0.002; s.track = 0.4; s.scan = 0.13;
  }
  return { scene, camera, update };
}
