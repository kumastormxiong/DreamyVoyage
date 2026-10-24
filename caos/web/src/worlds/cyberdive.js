// 15 电子脑潜入（意象致敬《攻壳机动队》，全部原创）：
// 前两小节——雨夜运河城的正上方，镜头垂直俯冲，贴着楼缝扎向黑色水面；水面一闪白光 =「接入」。
// 之后进入"网络空间"：青绿色的数据塔阵向四面八方延伸，琥珀色的数据包沿着节点网络奔流，
// 一道道旋转的"防火墙"光环悬在下潜轴线上，镜头每小节穿过一环并桶滚；第 6 小节改为贴着数据塔顶高速平飞，
// 最后一小节冲击变焦扎进网络核心。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, skyMat } from './city.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, steam } from './dress.js';
import { beatAt, pulse } from './_glitch.js';
import { applyCam, punchAt, E } from './cam.js';
import { plasmaShell, shockRing, speedLines, motes } from './fx.js';

const NET = -3000;                                    // 网络空间所在高度（与城市分开）

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 80, bg: 0x010504 });
  const sky = skyMat({ stops: [[-0.3, 0x010303], [0.0, 0x0c2420], [0.1, 0x061412], [1, 0x000202]], stars: 0.2, cloud: 0.6, cloudA: 0x1a3a34, cloudB: 0x061210, cloudY: [0.05, 0.5], levels: 16 });
  scene.add(sky);
  nightRig(ctx, scene, { moon: 0x8ad0c0, moonI: 1.6, dir: [0.3, 0.8, 0.2], hemiSky: 0x1a3a34, hemiGround: 0x0a1010, hemiI: 1.0, size: 160, center: [0, 0, 0], env: envFromSky(ctx, sky) });
  // 运河城：两排高楼夹着一条水道
  const mat = cityMat({ wall: 0x3a4644, wall2: 0x2a3634, wallH: 100, lit: [0x9affe0, 0xffd08a, 0xffffff], dark: 0x040808, litP: 0.35, glow: 2.2,
    floorH: 3.0, colW: 2.2, neon: 0x2affd0, neon2: 0xffb020, neonP: 0.08, roof: 0x101616, fog: 0x061412, fogNear: 80, fogFar: 420, fogH: 20, seed: 151, band: 0.08, warm: 0x2affd0 });
  const R = rng(1515), list = [];
  for (let z = 200; z > -400; z -= 14 + R() * 10) for (const s of [-1, 1]) { const w = 14 + R() * 12; list.push({ x: s * (12 + w / 2 + R() * 4), z, w, d: 12 + R() * 6, h: 40 + R() * 110 }); }
  for (let i = 0; i < 160; i++) { const a = R() * Math.PI * 2, r = 70 + R() * 300; list.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 12 + R() * 18, d: 12 + R() * 18, h: 30 + R() * 140 }); }
  scene.add(buildings(mat, list, { reflect: true }));          // 湿地倒影：楼群沿 y=0 镜像一份，坠入水面时绿色楼体会延伸进地面
  scene.add(roofClutter(list, { seed: 1516 }));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(24, 700), new THREE.MeshStandardMaterial({ color: 0x020606, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.7 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.5, -100); scene.add(water);
  const vents = steam(list.slice(0, 40).filter((_, i) => i % 4 === 0).map((b) => new THREE.Vector3(b.x, b.h, b.z)), { color: 0x4a6a64, size: 9, n: 4, opacity: 0.3 }); scene.add(vents);
  // ---------- 网络空间 ----------
  const net = new THREE.Group(); net.position.y = NET; scene.add(net);
  const towers = [];
  for (let gx = -14; gx <= 14; gx++) for (let gz = -14; gz <= 14; gz++) { if (R() < 0.45) continue; towers.push({ x: gx * 24 + (R() - 0.5) * 6, z: gz * 24 + (R() - 0.5) * 6, w: 4 + R() * 10, d: 4 + R() * 10, h: 10 + Math.pow(R(), 2) * 160 }); }
  const pos = [], colA = [], teal = col(0x2affd0), amber = col(0xffb020);
  const E12 = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  towers.forEach((b, i) => {
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [b.x + x * b.w / 2, b.z + z * b.d / 2]);
    const V = [...P.map(([x, z]) => [x, -b.h, z]), ...P.map(([x, z]) => [x, 0, z])];
    const c = hash(i * 1.7) < 0.07 ? amber : teal;
    E12.forEach(([a, bb]) => { pos.push(...V[a], ...V[bb]); colA.push(c.r, c.g, c.b, c.r, c.g, c.b); });
  });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  const lineMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uK: { value: 0 }, uY: { value: 0 } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec3 vW; void main(){ vC = color; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uK,uY; varying vec3 vC; varying vec3 vW; void main(){ float d = length(vW - cameraPosition); float fade = (1.0 - smoothstep(80.0, 520.0, d)) * smoothstep(2.0, 20.0, d); float scan = exp(-abs(vW.y - uY) * 0.3); gl_FragColor = vec4(vC * (0.22 + uK * 0.4 + scan * 1.2) * fade, 1.0); }' });
  const lines = new THREE.LineSegments(lg, lineMat); lines.position.y = -260; lines.frustumCulled = false; net.add(lines);
  const solid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0x03201a, transparent: true, opacity: 0.55, toneMapped: false }), towers.length);
  const M = new THREE.Matrix4(); towers.forEach((b, i) => { M.compose(new THREE.Vector3(b.x, -260, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d)); solid.setMatrixAt(i, M); }); net.add(solid);
  // 节点网络 + 数据包
  const nodes = []; for (let i = 0; i < 140; i++) nodes.push(new THREE.Vector3((R() - 0.5) * 360, -40 - R() * 210, (R() - 0.5) * 360));
  const links = []; nodes.forEach((a, i) => { for (let j = i + 1; j < nodes.length; j++) if (a.distanceTo(nodes[j]) < 70 && links.length < 320) links.push([i, j]); });
  const np = []; links.forEach(([a, b]) => np.push(...nodes[a].toArray(), ...nodes[b].toArray()));
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
  net.add(new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: col(0x146a58), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, toneMapped: false })));
  const nm = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1.2, 0), new THREE.MeshBasicMaterial({ color: col(0x8affe8), toneMapped: false }), nodes.length);
  nodes.forEach((n, i) => { M.makeTranslation(n.x, n.y, n.z); nm.setMatrixAt(i, M); }); net.add(nm);
  const NPK = 900, pk = new Float32Array(NPK * 3), pkg = new THREE.BufferGeometry(); pkg.setAttribute('position', new THREE.BufferAttribute(pk, 3));
  const packets = new THREE.Points(pkg, new THREE.PointsMaterial({ color: col(0xffc040), size: 1.6, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); packets.frustumCulled = false; net.add(packets);
  const pkd = Array.from({ length: NPK }, () => ({ l: Math.floor(R() * links.length), ph: R(), sp: 0.2 + R() * 0.6 }));
  // 防火墙光环（沿下潜轴）
  const rings = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.position.y = -20 - i * 34; net.add(g);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(16, 0.25, 6, 96), new THREE.MeshBasicMaterial({ color: col(i % 2 ? 0x2affd0 : 0xffb020), toneMapped: false, transparent: true }));
    tor.rotation.x = Math.PI / 2; g.add(tor);
    for (let s = 0; s < 24; s++) { const a = s / 24 * Math.PI * 2; const seg = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.9), tor.material); seg.position.set(Math.cos(a) * 19, 0, Math.sin(a) * 19); seg.rotation.y = -a; if (s % 3) g.add(seg); }
    rings.push({ g, tor });
  }
  // 核心下方的"数据城市"：从 -520 的地面拔起的一片线框高楼 + 发光街格 + 窗点，末镜头往下看不再是黑的
  {
    const R2 = rng(1599), FL = -520, T2 = [], p2 = [], c2 = [], wp = [], wc = [], gp = [];
    for (let gx = -15; gx <= 15; gx++) for (let gz = -15; gz <= 15; gz++) {
      const x = gx * 26 + (R2() - 0.5) * 5, z = gz * 26 + (R2() - 0.5) * 5;
      if (R2() < 0.18 || Math.hypot(x, z) < 46) continue;
      T2.push({ x, z, w: 8 + R2() * 11, d: 8 + R2() * 11, h: 30 + Math.pow(R2(), 1.6) * 200 });
    }
    T2.forEach((b, i) => {
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [b.x + x * b.w / 2, b.z + z * b.d / 2]);
      const V = [...P.map(([x, z]) => [x, FL, z]), ...P.map(([x, z]) => [x, FL + b.h, z])];
      const c = hash(i * 2.3) < 0.1 ? amber : teal;
      E12.forEach(([a, bb]) => { p2.push(...V[a], ...V[bb]); c2.push(c.r, c.g, c.b, c.r, c.g, c.b); });
      for (let k = 0; k < 16 + Math.floor(b.h / 8); k++) {                     // 窗点贴在四个立面上
        const face = Math.floor(R2() * 4), u = R2() - 0.5, y = FL + 2 + R2() * (b.h - 3), wc0 = R2() < 0.22 ? amber : teal;
        const x = face < 2 ? b.x + u * b.w : b.x + (face === 2 ? -1 : 1) * (b.w / 2 + 0.1), z = face < 2 ? b.z + (face ? 1 : -1) * (b.d / 2 + 0.1) : b.z + u * b.d;
        wp.push(x, y, z); wc.push(wc0.r, wc0.g, wc0.b);
      }
    });
    for (let i = -400; i <= 400; i += 26) gp.push(i, FL + 0.2, -400, i, FL + 0.2, 400, -400, FL + 0.2, i, 400, FL + 0.2, i);
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3));
    const l2 = new THREE.LineSegments(g2, lineMat); l2.frustumCulled = false; net.add(l2);
    const s2 = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x03201a, toneMapped: false }), T2.length);
    T2.forEach((b, i) => { M.compose(new THREE.Vector3(b.x, FL, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d)); s2.setMatrixAt(i, M); }); s2.frustumCulled = false; net.add(s2);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    const win = new THREE.Points(wg, new THREE.PointsMaterial({ size: 1.7, vertexColors: true, sizeAttenuation: true, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); win.frustumCulled = false; net.add(win);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    net.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: col(0x1a8a70), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, toneMapped: false })));
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x021a16, toneMapped: false })); floorGlow.position.y = FL - 0.3; net.add(floorGlow);
  }
  const coreG = glowSprite(0x8affe8, 60, 0.8); coreG.position.y = -300; net.add(coreG);
  // 细节层：核心的等离子球、网络里升腾的数据光尘、接入瞬间水面荡开的信号环、下潜时的曲速线
  const plasma = plasmaShell({ radius: 20, color: 0x2affd0, color2: 0xffb020, detail: 4, scale: 1.2 }); plasma.position.y = -300; net.add(plasma);
  const bits = motes({ n: 1200, box: [340, 300, 340], center: [0, -150, 0], color: 0x2affd0, size: 3.0, rise: 5, sway: 6, seed: 152 }); net.add(bits);
  const jackRing = shockRing({ color: 0xffffff, color2: 0x2affd0, size: 600, hex: 3 }); jackRing.position.set(0, 0.9, -40); scene.add(jackRing);
  const streaks = speedLines({ n: 560, rMin: 4, rMax: 38, depth: 220, len: 28, color: 0x7affe8, seed: 153 }); scene.add(streaks);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.08, colors: { sung: 0xeafff8, hot: 0xffb020, pre: 0x2affd0, splitA: 0x2affd0, splitB: 0xffb020 } });
  const down = new THREE.Vector3();

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 6);
    const bars = S.lt / (240 / tl.bpm), bar = Math.floor(bars), bu = bars - bar;
    let cam, fish = 0, warp = 0;
    if (bar < 2) {                                         // 俯冲：从 260 米高垂直扎向水面
      const u = E.in(bars / 2), y = 260 - u * 255;
      cam = { p: new THREE.Vector3(Math.sin(u * 3) * 2, y, -40 + u * 10), l: new THREE.Vector3(0, y - 50, -60 - (1 - u) * 60), fov: 70 + u * 40, roll: u * 1.2 };
      fish = u * 0.35;
    } else if (bar < 5) {                                  // 网络空间：穿环下潜 + 桶滚
      const u = (bars - 2) / 3, y = NET - 5 - u * 210;
      cam = { p: new THREE.Vector3(Math.sin(u * 6) * 3, y, Math.cos(u * 6) * 3), l: new THREE.Vector3(0, y - 60, 8), fov: 100 - bp * 8, roll: u * Math.PI * 3 + E.whip(bu) * 0.8 };
      fish = 0; warp = 0.15;
    } else if (bar < 7) {                                  // 贴着数据塔顶高速平飞
      const u = (bars - 5) / 2;
      cam = { p: new THREE.Vector3(-260 + u * 520, NET - 245 + Math.sin(u * 9) * 4, 30 + Math.sin(u * 3) * 40), l: new THREE.Vector3(-200 + u * 520, NET - 262, 10), fov: 108, roll: Math.sin(u * 5) * 0.4 };
      fish = 0;
    } else {                                               // 冲击变焦扎进核心
      const u = E.inExpo(bu);
      cam = { p: new THREE.Vector3(0, NET - 200 - u * 80, 60 - u * 55), l: new THREE.Vector3(0, NET - 300, 0), fov: 90 - u * 70, roll: u * 0.6 };
      fish = 0;
    }
    applyCam(camera, cam, { t, shake: 0.2 + f.kick * 0.7, punch: punchAt(B, 7) });
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 1.5, B.b16, bp * 0.5); vents.userData.tick(t);
    lineMat.uniforms.uK.value = Math.max(f.kick, bp * 0.5); lineMat.uniforms.uY.value = NET - 260 - 160 + B.barp * 170;
    for (let i = 0; i < NPK; i++) { const d = pkd[i], [a, b] = links[d.l], u = (d.ph + t * d.sp) % 1; down.copy(nodes[a]).lerp(nodes[b], u); pk.set([down.x, down.y, down.z], i * 3); }
    pkg.attributes.position.needsUpdate = true;
    rings.forEach((r, i) => { r.g.rotation.y = t * (i % 2 ? 0.6 : -0.6); const near = Math.abs(camera.position.y - (NET + r.g.position.y)) < 8; r.tor.material.opacity = near ? 1 : 0.55 + bp * 0.3; r.g.scale.setScalar(1 + (near ? 0.1 : 0) + f.kick * 0.04); });
    coreG.material.opacity = 0.5 + bp * 0.4;
    const jack = bar === 2 && bu < 0.12 ? 1 - bu / 0.12 : 0;   // 接入闪白
    const ja = bar === 2 ? bu * 240 / tl.bpm : 99;
    jackRing.userData.set(ja * 150, Math.exp(-ja * 1.4) * 0.8, 5 + ja * 8, t);
    plasma.userData.tick(t, bp * 0.8, 0.5 + bp * 0.5); bits.userData.tick(t, 1);
    streaks.userData.tick(t, camera, bar < 2 ? E.in(bars / 2) * 0.8 : bar < 7 ? 0.8 : 1.0, f.kick, bar < 2 ? 60 + bars * 80 : 150);
    post.s.flash = [jack * 0.8, jack, jack * 0.95];
    post.s.exposure = 1.2; post.s.bloom = 0.5 + bp * 0.25; post.s.bloomT = 0.5; post.s.bloomR = 0.55;
    post.s.ab = 0.002 + f.kick * 0.01 + jack * 0.02; post.s.glitch = Math.pow(f.kick, 3) * 0.35 + jack * 0.8;
    post.s.fish = fish; post.s.warp = warp; post.s.scan = 0.05; post.s.grain = 0.045; post.s.vig = 0.6;
    post.s.hue = bar >= 2 && bar < 5 ? Math.sin(t * 0.8) * 0.12 : 0;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
