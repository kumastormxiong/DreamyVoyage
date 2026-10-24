// 04 代码雨 · 子弹时间（意象致敬《黑客帝国》，全部原创）：观众站在一个由下落字符组成的圆柱形"数据空间"里，
// 字符取自本曲的倒序西语字母与"链魂虚空"等汉字；地面是深色玻璃，映出下方继续坠落的字符。
// 中心悬停着一团"被冻结的爆散"——数百枚拖着涟漪环的金属弹片。
// 编排：①俯冲穿过雨幕落地 → ②子弹时间：时间几乎停止，镜头绕中心 360° 环绕 → ③甩镜，时间恢复、弹片炸开
//       → ④超广角在悬浮的字符柱之间高速穿行（荷兰角）→ ⑤最后一小节冲击变焦，扎进一个字符。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, makeAtlas, clamp } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { beatAt, pulse } from './_glitch.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { shockRing, lightning, fogSheets, speedLines } from './fx.js';

function rainMat(atlas, { cols = 200, rows = 80, speed = 1, bright = 1, green = 0x3cff7a } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uT: { value: 0 }, uAtlas: { value: atlas.tex }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uN: { value: atlas.chars.length },
      uCR: { value: new THREE.Vector2(cols, rows) }, uSp: { value: speed }, uB: { value: bright }, uC: { value: col(green) }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT,uN,uSp,uB,uK; uniform vec2 uGrid,uCR; uniform vec3 uC; uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec2 g = vUv * uCR; vec2 id = floor(g); vec2 f = fract(g);
        float sp = (0.35 + h(vec2(id.x, 1.0)) * 0.9) * uSp;
        float head = fract(h(vec2(id.x, 2.0)) + uT * sp * 0.12) * uCR.y * 1.6;
        float d = head - (uCR.y - id.y);                         // 字符离"头"多远（向上拖尾）
        float on = d >= 0.0 ? exp(-d * 0.09) : 0.0;
        float gi = floor(h(id + floor(uT * (2.0 + h(id) * 6.0)) * 0.37) * uN);
        vec2 cell = vec2(mod(gi, uGrid.x), floor(gi / uGrid.x));
        vec2 auv = (cell + vec2(f.x, 1.0 - f.y) * 0.9 + 0.05) / uGrid; auv.y = 1.0 - auv.y;
        float glyph = texture2D(uAtlas, auv).r;
        vec3 c = mix(uC, vec3(0.85, 1.0, 0.9), smoothstep(1.5, 0.0, d)) * glyph * on * uB * (1.0 + uK);
        float fade = 1.0 - smoothstep(30.0, 140.0, length(vW - cameraPosition));
        gl_FragColor = vec4(c * fade, 1.0);
      }`
  });
}

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 70, bg: 0x000302 });
  const chars = [...new Set([...'ACDEFGILMNOPRSTUVZ0123456789ñóé¿¡', ...'魂'])];
  const atlas = makeAtlas(chars, 'filled', 96);
  const mats = [];
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 160, 96, 1, true), rainMat(atlas, { cols: 260, rows: 110, bright: 0.55 }));
  cyl.position.y = 20; scene.add(cyl); mats.push(cyl.material);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 200, 96, 1, true), rainMat(atlas, { cols: 300, rows: 120, bright: 0.22, speed: 0.6, green: 0x1a8a4a }));
  scene.add(inner); mats.push(inner.material);
  // 悬浮字符柱（视差）
  const R = rng(404), stripMat = rainMat(atlas, { cols: 1, rows: 40, bright: 0.7, speed: 1.4 }); mats.push(stripMat);
  const strips = new THREE.Group(); scene.add(strips);
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, r = 6 + R() * 34, h = 14 + R() * 30;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, h), stripMat); m.position.set(Math.cos(a) * r, h / 2 - 4 + R() * 10, Math.sin(a) * r); m.lookAt(0, m.position.y, 0); strips.add(m);
  }
  // 玻璃地面（半透明，透出下方的雨 = 倒影）
  const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshBasicMaterial({ color: 0x000a05, transparent: true, opacity: 0.78 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.PolarGridHelper(46, 24, 12, 64, 0x0c4a24, 0x082a16); grid.position.y = 0.02; grid.material.toneMapped = false; scene.add(grid);
  // 冻结的爆散：弹片 + 涟漪环
  const N = 420, shards = [];
  const sGeo = new THREE.CylinderGeometry(0.05, 0.12, 1.1, 6).rotateX(Math.PI / 2);
  const sMat = new THREE.MeshPhysicalMaterial({ color: 0xb8c8c0, metalness: 1, roughness: 0.15, emissive: 0x0a3a1a, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 800] });
  const sm = new THREE.InstancedMesh(sGeo, sMat, N); sm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sm.frustumCulled = false; scene.add(sm);
  const ringMat = new THREE.MeshBasicMaterial({ color: col(0x7affb0), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rm = new THREE.InstancedMesh(new THREE.TorusGeometry(0.35, 0.012, 4, 24), ringMat, N); rm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rm.frustumCulled = false; scene.add(rm);
  for (let i = 0; i < N; i++) { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); shards.push({ d: new THREE.Vector3(Math.cos(a) * s, u * 0.6 + 0.15, Math.sin(a) * s), v: 3 + R() * 9, ph: R() }); }
  scene.add(new THREE.HemisphereLight(0x3cff7a, 0x000000, 1.5));
  const key = new THREE.PointLight(0xbfffd8, 300, 40, 1.5); key.position.set(0, 6, 0); scene.add(key);
  // 细节层：地面信号环、弹片炸开时的电弧、贴地的绿色雾带、冲刺段的数据流线
  const ring = shockRing({ color: 0xe8fff0, color2: 0x1aff6a, size: 300, hex: 2.4 }); ring.position.y = 0.06; scene.add(ring);
  const arcs = lightning({ n: 5, color: 0xaaffd0 }); scene.add(arcs);
  const haze = fogSheets({ n: 4, y0: 1.5, y1: 30, color: 0x0a6a34, density: 0.22, seed: 4, additive: true, scale: 0.02 }); scene.add(haze);
  const warp = speedLines({ n: 500, rMin: 3, rMax: 30, depth: 180, len: 22, color: 0x7affb0, seed: 44 }); scene.add(warp);
  const aF = new THREE.Vector3(0, 4, 0), aT = new THREE.Vector3();
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.08, colors: { sung: 0xe8fff0, hot: 0x3cff7a, pre: 0x1a8a4a, splitA: 0x3cff7a, splitB: 0xffffff } });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1);
  // 弹片的"本地时间"：第 2、3 小节几乎停止（子弹时间），其余正常
  const rate = (bar) => (bar === 2 || bar === 3 ? 0.03 : 1);
  const tau = (bars) => { let s = 0; for (let b = 0; b < Math.floor(bars); b++) s += rate(b); return s + (bars - Math.floor(bars)) * rate(Math.floor(bars)); };
  const fall = camPath([{ u: 0, p: [0, 70, 30], l: [0, 0, 0], fov: 95, roll: 0.4 }, { u: 1, p: [0, 4.5, 9], l: [0, 4.2, 0], fov: 64, roll: 0 }], { ease: E.io });   // 终点与环绕的起点完全重合：坠落 → 子弹时间环绕是一个连续镜头
  const dash = camPath([{ u: 0, p: [-30, 3, 10], l: [30, 6, -10], fov: 108, roll: -0.25 }, { u: 0.5, p: [0, 7, -24], l: [30, 3, 20], fov: 112, roll: 0.3 }, { u: 1, p: [26, 2, 4], l: [-20, 8, 6], fov: 100, roll: -0.15 }], { ease: E.lin });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 7);
    const bars = S.lt / (240 / tl.bpm), bar = Math.floor(bars), bu = bars - bar;
    mats.forEach((m) => { m.uniforms.uT.value = t * (bar === 2 || bar === 3 ? 0.15 : 1); m.uniforms.uK.value = bp * 0.4 + f.kick * 0.3; });
    const T = tau(bars) * 1.0;
    shards.forEach((s, i) => {
      const r = 1.5 + s.v * (0.15 + T * 0.35);
      P.copy(s.d).multiplyScalar(r); P.y += 4;
      Q.setFromUnitVectors(Z, s.d); M.compose(P, Q, Sc); sm.setMatrixAt(i, M);
      P.addScaledVector(s.d, -0.8 - (i % 3) * 0.6); M.compose(P, Q, Sc.setScalar(1 + (i % 3) * 0.6)); rm.setMatrixAt(i, M); Sc.setScalar(1);
    });
    sm.instanceMatrix.needsUpdate = true; rm.instanceMatrix.needsUpdate = true;
    ringMat.opacity = bar === 2 || bar === 3 ? 0.22 : 0.08;
    let fish = 0, cam;
    if (bar < 2) cam = fall(bars / 2);
    else if (bar < 4) { const a = E.io((bars - 2) / 2) * Math.PI * 2, rr = 9 - Math.sin((bars - 2) / 2 * Math.PI) * 2; cam = { p: new THREE.Vector3(Math.sin(a) * rr, 4.5 + Math.sin(a * 2) * 1.2, Math.cos(a) * rr), l: new THREE.Vector3(0, 4.2, 0), fov: 64, roll: Math.sin(a) * 0.12 }; fish = 0; }
    else if (bar < 7) { cam = dash((bars - 4) / 3); fish = 0; }
    else { const u = E.inExpo(bu); cam = { p: new THREE.Vector3(10 - u * 4, 6, 10 - u * 4), l: new THREE.Vector3(-30, 14, -30), fov: 100 - u * 88, roll: 0.1 }; }
    applyCam(camera, cam, { t, shake: (bar === 2 || bar === 3) ? 0.02 : 0.15 + f.kick * 0.5, punch: (bar === 2 || bar === 3) ? 0 : punchAt(B, 6) });
    strips.rotation.y = t * 0.03;
    const ba = bu * 240 / tl.bpm;                                    // 本小节已过去的秒数
    ring.userData.set(ba * 80, Math.exp(-ba * 1.3) * (bar === 4 ? 0.9 : bar === 2 || bar === 3 ? 0.15 : 0.5), 4 + ba * 6, t);
    for (let i = 0; i < 5; i++) {
      const an = hash(B.beat * 2.1 + i) * 6.2832, rr = 14 + hash(B.beat * 3.3 + i) * 26;
      aT.set(Math.cos(an) * rr, 2 + hash(B.beat + i * 9) * 26, Math.sin(an) * rr);
      arcs.userData.bolt(i, aF, aT, B.b16 * 5 + i, bar >= 4 ? (hash(B.beat * 1.9 + i) > 0.35 ? 1 : 0) * Math.exp(-B.bp * 6) : 0, 0.15, 0.25);
    }
    haze.userData.tick(t, camera, bp * 0.4);
    warp.userData.tick(t, camera, bar >= 4 && bar < 7 ? 0.75 : 0, f.kick, 90);
    post.s.exposure = 1.0; post.s.bloom = 0.4 + bp * 0.15; post.s.bloomT = 0.7; post.s.bloomR = 0.4;
    post.s.ab = 0.002 + f.kick * 0.008; post.s.glitch = Math.pow(f.kick, 3) * 0.3 + (bar === 4 && bu < 0.1 ? (1 - bu * 10) * 0.6 : 0);
    post.s.fish = fish; post.s.scan = 0.04; post.s.grain = 0.04; post.s.vig = 0.6; post.s.sat = 0.9;
    post.s.flash = bar === 4 && bu < 0.08 ? [0.5, 0.9, 0.6] : [0, 0, 0];
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
