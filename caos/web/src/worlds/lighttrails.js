// 16 光轨立交（副歌 3 后半）：像长曝光夜景照片——多层盘绕的高架立交桥上，一条条车灯光轨在流动：
// 一个方向是朱红尾灯、另一个方向是暖白前灯；钠灯琥珀色的路灯点缀，远处是黑色剪影般的城市。高空环绕俯瞰。
// 卡点：光轨的流速每拍"冲刺"一下（拍头最快），鼓点时全部光轨亮度跳一下；每 2 小节镜头硬切一个高度。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat, ground } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, flyers } from './dress.js';
import { applyCam, punchAt, E } from './cam.js';
import { fogSheets, speedLines, motes, shockRing } from './fx.js';

function ribbon(curve, n, w, yOff) {               // 沿曲线的平带：u = 沿线，v = 横向
  const pos = [], uv = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), tg = curve.getTangentAt(u), sd = new THREE.Vector3().crossVectors(tg, up).normalize().multiplyScalar(w / 2);
    pos.push(p.x - sd.x, p.y + yOff, p.z - sd.z, p.x + sd.x, p.y + yOff, p.z + sd.z); uv.push(u, 0, u, 1);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 50, bg: 0x03040a });
  const sky = skyMat({ stops: [[-0.3, 0x020308], [0.0, 0x1a1420], [0.08, 0x0a0c18], [1, 0x010206]], stars: 0.3 }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x8aa0d0, moonI: 1.8, dir: [0.4, 0.6, -0.5], hemiSky: 0x2a3048, hemiGround: 0x2a1408, hemiI: 1.0, size: 300, center: [0, 0, 0], env: envFromSky(ctx, sky) });
  const mat = cityMat({ wall: 0x3a4050, wall2: 0x2a3040, wallH: 160, lit: [0x8ad8ff, 0xffe2b0, 0xff8a5a], dark: 0x04060c, litP: 0.25, glow: 2.0,
    floorH: 2.6, colW: 1.8, neonP: 0.05, neon: 0x3ff0ff, neon2: 0xff3a3a, roof: 0x06080e, fog: 0x080a14, fogNear: 150, fogFar: 700, fogH: 30, seed: 16, band: 0.08, warm: 0x8ad8ff });
  const cityList = ringLayout(420, 170, 700, { seed: 161, hMin: 40, hMax: 260, wMin: 16, wMax: 40 }); scene.add(buildings(mat, cityList));
  const roof = roofClutter(cityList, { seed: 162 }); scene.add(roof); const fly = flyers({ n: 8, seed: 163, rad: [120, 260], y: [60, 160] }); scene.add(fly);
  { // 地面街灯网格 + 零星车灯：从高空看像金色的电路板
    const P = [], C = [], amber = col(0xffa040), red = col(0xff2a1a), white = col(0xfff0d8), RR = rng(77);
    for (let gx = -40; gx <= 40; gx++) for (let k = 0; k < 160; k++) { const x = gx * 14, z = -560 + k * 7; if (Math.hypot(x, z) > 560 || RR() < 0.35) continue; P.push(x, 0.5, z); C.push(amber.r, amber.g, amber.b); P.push(z, 0.5, x); C.push(amber.r, amber.g, amber.b); }
    for (let i = 0; i < 2500; i++) { const g = Math.round((RR() - 0.5) * 80) * 14, v = (RR() - 0.5) * 1100; const c = RR() < 0.5 ? red : white; if (RR() < 0.5) P.push(g + 2, 0.6, v); else P.push(v, 0.6, g + 2); C.push(c.r, c.g, c.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, vertexColors: true, toneMapped: false, sizeAttenuation: true })));
  }
  scene.add(ground(0x05060a));
  // 路线：若干条三维样条（不同高度的环线、匝道）
  const R = rng(1616), roads = [];
  const deckMat = new THREE.MeshBasicMaterial({ color: 0x0b0d14, toneMapped: false, side: THREE.DoubleSide });
  const trailMat = (red) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uC: { value: col(red ? 0xff2418 : 0xfff0d8) }, uDir: { value: red ? 1 : -1 }, uLanes: { value: 3 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uT,uK,uDir,uLanes; uniform vec3 uC; varying vec2 vUv;
      float h(float n){ return fract(sin(n * 78.233) * 43758.5453); }
      void main(){ float lane = floor(vUv.y * uLanes); float ly = fract(vUv.y * uLanes);
        float x = vUv.x * 160.0 + uDir * uT * (0.6 + h(lane) * 0.4);
        float seg = floor(x); float on = step(0.25, h(seg + lane * 31.0));
        float streak = smoothstep(0.0, 0.9, fract(x)) * on;
        float lq = (ly - 0.5) * 5.0; float core = exp(-lq * lq);
        gl_FragColor = vec4(uC * core * (0.35 + streak * (1.8 + uK)), 1.0); }`
  });
  const loops = [
    { pts: (u) => new THREE.Vector3(Math.cos(u) * 90, 22 + Math.sin(u * 2) * 6, Math.sin(u) * 60), red: true },
    { pts: (u) => new THREE.Vector3(Math.cos(u) * 86, 22 + Math.sin(u * 2) * 6, Math.sin(u) * 56), red: false },
    { pts: (u) => new THREE.Vector3(Math.cos(u + 1) * 140, 10 + Math.sin(u * 3) * 4, Math.sin(u + 1) * 40 - 20), red: false },
    { pts: (u) => new THREE.Vector3(Math.sin(u) * 60 - 20, 36 + Math.cos(u) * 8, Math.cos(u * 2) * 110), red: true },
    { pts: (u) => new THREE.Vector3(u * 70 - 220, 5, Math.sin(u * 0.7) * 30 + 70), red: true, open: true },
    { pts: (u) => new THREE.Vector3(u * 70 - 220, 5, Math.sin(u * 0.7) * 30 + 74), red: false, open: true },
    { pts: (u) => new THREE.Vector3(Math.sin(u * 0.5) * 30 + 40, 50 + Math.sin(u) * 3, u * 70 - 220), red: false, open: true },
  ];
  const lamps = [], curves = [];
  loops.forEach((L, i) => {
    const N = 120, P = [];
    for (let k = 0; k <= N; k++) { const u = L.open ? k / N * 6.3 : k / N * Math.PI * 2; P.push(L.pts(u)); }
    const curve = new THREE.CatmullRomCurve3(P, !L.open); curves.push(curve);
    const deck = new THREE.Mesh(ribbon(curve, 500, 7.5, -0.3), deckMat); scene.add(deck);
    const m = trailMat(L.red); const tr = new THREE.Mesh(ribbon(curve, 800, 6.0, 0.05), m); scene.add(tr); roads.push(m);
    for (let k = 0; k < 24; k++) { const p = curve.getPoint(k / 24); const g = glowSprite(0xffb04a, 5, 0.6); g.position.set(p.x, p.y + 6, p.z); scene.add(g); lamps.push(g); }
    for (let k = 0; k < 20; k++) { const p = curve.getPoint(k / 20); if (p.y < 4) continue; const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, p.y, 2.2), deckMat); c.position.set(p.x, p.y / 2 - 0.4, p.z); scene.add(c); }
  });
  // 细节层：低空暖雾、从立交升起的暖色火花、追车镜头里的流线、立交中心荡开的信号环
  const haze = fogSheets({ n: 4, y0: 6, y1: 60, color: 0x5a4030, density: 0.26, seed: 16, size: 1100 }); scene.add(haze);
  const sparks = motes({ n: 900, box: [380, 90, 300], center: [0, 0, 0], color: 0xffb04a, size: 2.4, rise: 3.0, sway: 4, seed: 166 }); scene.add(sparks);
  const warp = speedLines({ n: 520, rMin: 5, rMax: 36, depth: 220, len: 26, color: 0xffe0b0, seed: 167 }); scene.add(warp);
  const sig = shockRing({ color: 0xfff0d8, color2: 0xff3a2a, size: 900, hex: 5 }); sig.position.y = 0.7; scene.add(sig);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.08, colors: { sung: 0xfff4ea, hot: 0xff3a2a, pre: 0xffb04a, splitA: 0x8ad8ff, splitB: 0xff2418 } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 5);
    const flow = t * 8 + B.beat * 2.5 + (1 - Math.pow(1 - B.bp, 3)) * 2.5;      // 每拍冲刺
    roads.forEach((m) => { m.uniforms.uT.value = flow; m.uniforms.uK.value = Math.max(f.kick, bp * 0.4); });
    const shot = Math.floor(B.bar / 2), sp = ((B.bar % 2) + B.barp) / 2;
    let tilt = 0, fish = 0;
    if (shot % 2 === 0) {                              // 追车镜头：贴着光轨低飞，超广角 + 鱼眼
      const c = curves[[0, 3, 1, 2][(shot / 2) % 4]], u = (0.1 + shot * 0.17 + sp * 0.22) % 1;
      const P = c.getPointAt(u), T = c.getTangentAt(u), u2 = (u + 0.04) % 1, A = c.getPointAt(u2);
      applyCam(camera, { p: P.clone().add(new THREE.Vector3(0, 30 + Math.sin(sp * Math.PI) * 4, 0)).addScaledVector(T, -6), l: A.clone().add(new THREE.Vector3(0, 16, 0)), fov: 104 - sp * 10, roll: Math.sin(sp * Math.PI) * 0.3 }, { t, shake: 0.3 + f.kick * 0.6, punch: punchAt(B, 8) });
      fish = shot % 4 === 0 ? 0.26 : 0;
    } else {                                          // 高空移轴：微缩模型般的立交
      const A = 0.4 + shot * 1.3 + E.io(sp) * 0.6, H = 150 - sp * 40;
      applyCam(camera, { p: new THREE.Vector3(Math.sin(A) * 170, H, Math.cos(A) * 170), l: new THREE.Vector3(0, 8, 0), fov: 42, roll: 0 }, { t, shake: 0.1, punch: punchAt(B, 3) });
      tilt = 1.3;
    }
    roof.userData.tick(t); fly.userData.tick(t);
    const b4 = ((B.beat % 4) + B.bp) / 4;
    sig.userData.set(b4 * 520, (1 - b4) * 0.9, 8 + b4 * 12, t);
    mat.userData.wave(0, 0, 170 + b4 * 520, (1 - b4) * 0.9, 14 + b4 * 14, 0xffd8a0);
    haze.userData.tick(t, camera, bp * 0.3); sparks.userData.tick(t, 0.9 + bp * 0.5);
    warp.userData.tick(t, camera, shot % 2 === 0 ? 0.85 : 0, f.kick, 120);
    lamps.forEach((g, i) => { g.material.opacity = 0.4 + (hash(i + B.beat) > 0.85 ? 0.5 : 0); });
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 3) * 1.5, B.b16, bp * 0.3);
    post.s.bloom = 0.45 + bp * 0.15; post.s.bloomT = 0.6; post.s.bloomR = 0.45; post.s.tilt = tilt; post.s.fish = fish; post.s.exposure = 1.2;
    post.s.ab = 0.0015 + f.kick * 0.006; post.s.glitch = Math.pow(f.kick, 3) * 0.3; post.s.scan = 0.04; post.s.grain = 0.035; post.s.vig = 0.55;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
