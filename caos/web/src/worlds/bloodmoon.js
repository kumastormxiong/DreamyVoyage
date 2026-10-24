// 17 血月电塔（第二次 ¡ohohoh! 间奏，低音全开）：地平线上一轮巨大的血红色月亮，前面是一排排黑色剪影的格构电塔、
// 天线桅杆与下垂的高压线。天空在鼓点上被"像素排序"往下拖拽，月面随低音呼吸；正中是被撕裂的 ¡ohohoh!。
// 卡点：每拍像素排序换一次条纹，每小节镜头推近一档（zoom punch），鼓点全屏红色闪。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { skyMat, ground } from './city.js';
import { makeSplitWord, beatAt, pulse, LYRIC_FONT } from './_glitch.js';
import { applyCam, punchAt, E } from './cam.js';
import { searchlights } from './dress.js';
import { lightning, fogSheets, motes, aurora, shockRing } from './fx.js';

function lattice(H, base, top, sections, arms) {      // 格构电塔：四条腿 + 每节水平环 + X 斜撑 + 横担
  const P = [], leg = (y) => { const w = base + (top - base) * (y / H); return [[-w, -w], [w, -w], [w, w], [-w, w]].map(([x, z]) => [x, y, z]); };
  for (let s = 0; s < sections; s++) {
    const y0 = H * s / sections, y1 = H * (s + 1) / sections, A = leg(y0), B = leg(y1);
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; P.push(...A[k], ...B[k], ...B[k], ...B[n], ...A[k], ...B[n], ...A[n], ...B[k]); }
  }
  arms.forEach(([y, w]) => { P.push(-w, y, 0, w, y, 0, -w, y, 0, 0, y + w * 0.3, 0, w, y, 0, 0, y + w * 0.3, 0); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); return g;
}

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 45, bg: 0x070103 });
  const sky = skyMat({ stops: [[-0.3, 0x020001], [0.0, 0x3a060a], [0.05, 0x160205], [0.3, 0x060102], [1, 0x010000]], stars: 0.25 });
  scene.add(sky);
  scene.add(ground(0x050102));
  const moonMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uK,uT; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 c = vUv - 0.5; float d = length(c); if (d > 0.5) discard;
        float m = n2(c * 6.0) * 0.6 + n2(c * 14.0) * 0.4;
        vec3 col = mix(vec3(1.0, 0.16, 0.08), vec3(0.55, 0.03, 0.04), smoothstep(0.35, 0.75, m));
        col *= 0.55 + 0.35 * (1.0 - d * 1.6) + uK * 0.35;
        float band = step(0.5, fract(vUv.y * 18.0 - uT)) * step(vUv.y, 0.35);   // 下半部的横向切口
        col *= 1.0 - band * 0.85;
        gl_FragColor = vec4(col, smoothstep(0.5, 0.48, d)); }` });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), moonMat); moon.position.set(0, 70, -700); scene.add(moon);
  const halo = glowSprite(0xff2010, 600, 0.15); halo.position.set(0, 70, -705); scene.add(halo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const R = rng(1717), towers = [];
  for (let i = 0; i < 9; i++) {                         // 一排向远处延伸的电塔
    const z = -60 - i * 70, x = (i % 2 ? 1 : -1) * 30 + Math.sin(i) * 20;
    const H = 70 + R() * 20, g = new THREE.LineSegments(lattice(H, 7, 1.5, 9, [[H * 0.72, 16], [H * 0.86, 12]]), lineMat); g.position.set(x, 0, z); scene.add(g); towers.push({ x, z, H });
  }
  for (let i = 0; i < 26; i++) {                        // 360° 外围
    const a = R() * Math.PI * 2, r = 160 + R() * 300, H = 40 + R() * 80;
    const g = new THREE.LineSegments(lattice(H, 5, 1, 7, [[H * 0.75, 10]]), lineMat); g.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r); scene.add(g);
  }
  // 桅杆
  [[-120, -420, 200], [140, -500, 240], [60, -260, 120]].forEach(([x, z, h]) => {
    const g = new THREE.LineSegments(lattice(h, 2.5, 0.6, 26, []), lineMat); g.position.set(x, 0, z); scene.add(g);
  });
  // 高压线（下垂的悬链线）
  for (let i = 0; i + 1 < towers.length; i++) {
    const A = towers[i], B = towers[i + 1];
    for (const off of [-14, -8, 8, 14]) {
      const pts = []; for (let k = 0; k <= 20; k++) { const u = k / 20; pts.push(new THREE.Vector3(A.x + off + (B.x - A.x) * u, A.H * 0.72 + (B.H - A.H) * 0.72 * u - Math.sin(u * Math.PI) * 9, A.z + (B.z - A.z) * u)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
  }
  // 巨物：三座 500 米级的格构巨塔矗立在镜头旁（对比脚下几十米的普通电塔），血月被它们的横担一刀刀切开
  [[-105, -170, 520], [125, -240, 600], [-20, -420, 700]].forEach(([x, z, H], i) => {
    const g = new THREE.LineSegments(lattice(H, 50, 5, 16, [[H * 0.7, 130], [H * 0.84, 100], [H * 0.94, 60]]), lineMat); g.position.set(x, 0, z); scene.add(g);
    towers.push({ x, z, H });
  });
  // 细节层：血色极光、贴地红雾、升腾的火星、劈向电塔的雷、从脚下荡开的红色信号环
  const aur = aurora({ center: Math.PI, span: 2.4, radius: 900, y: 200, height: 320, colors: [0xff2010, 0xff7a2a, 0x8a1aff], layers: 3, seed: 17, intensity: 0.45 }); scene.add(aur);
  const haze = fogSheets({ n: 4, y0: 2, y1: 44, color: 0x4a0a0e, density: 0.45, seed: 17, size: 1000 }); scene.add(haze);
  const embers = motes({ n: 900, box: [260, 120, 360], center: [0, 0, -150], color: 0xff4a2a, size: 2.6, rise: 4, sway: 5, seed: 177 }); scene.add(embers);
  const storm = lightning({ n: 3, color: 0xffd0c0 }); scene.add(storm);
  const rRing = shockRing({ color: 0xff8a70, color2: 0xff1a10, size: 1000, hex: 6 }); rRing.position.set(0, 0.3, -60); scene.add(rRing);
  const sF = new THREE.Vector3(), sT = new THREE.Vector3();
  const big = makeSplitWord(9, [0xff2010, 0xff9a8a, 0xffffff]); big.group.position.set(0, 40, -200); scene.add(big.group);
  const beams = searchlights({ n: 3, seed: 171, area: 300, z0: -380, color: 0xff3020, len: 600 }); scene.add(beams);
  const lyric = makeLyricLayer(ctx, camera, { y: -0.34, height: 0.07, colors: { sung: 0xfff0ea, hot: 0xff3a2a, pre: 0x8a2a2a, splitA: 0xff8a7a, splitB: 0xff2010 } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 6), p = S.p;
    // 整场三个互不重复的镜头（只切 2 次）：
    // ① 希区柯克"眩晕变焦"——机位后撤、FOV 同步收窄，电塔大小不变而血月越来越大
    // ② 贴地鱼眼仰拍，从高压线下方横掠
    // ③ 起重机式升空，从塔顶高度俯看电塔阵列，镜头缓缓转向血月
    let fish = 0;
    if (p < 0.4) {
      const u = E.io(p / 0.4), dist = 60 + u * 260, fovv = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) * 120 / (dist + 60)) * 180 / Math.PI;
      applyCam(camera, { p: new THREE.Vector3(Math.sin(t * 0.2) * 4, 22, -60 + dist), l: new THREE.Vector3(0, 52, -500), fov: fovv, roll: 0 }, { t, shake: 0.1 + f.kick * 0.4 });
    } else if (p < 0.74) {
      const u = E.io((p - 0.4) / 0.34);
      applyCam(camera, { p: new THREE.Vector3(-60 + u * 120, 3, -120 - u * 40), l: new THREE.Vector3(-10 + u * 20, 60, -700), fov: 104, roll: 0.2 - u * 0.4 }, { t, shake: 0.3 + f.kick * 0.8, punch: punchAt(B, 8) });
      fish = 0.2;
    } else {
      const u = E.io((p - 0.74) / 0.26);
      applyCam(camera, { p: new THREE.Vector3(70 - u * 60, 20 + u * 150, 20 - u * 40), l: new THREE.Vector3(-30 + u * 30, 60 - u * 20, -300 - u * 200), fov: 72 - u * 14, roll: -0.12 + u * 0.12 }, { t, shake: 0.12 + f.kick * 0.4, punch: punchAt(B, 8) * 0.5 });
    }
    beams.userData.tick(t, B.beat, f.kick);
    aur.userData.tick(t, f.low * 0.5); haze.userData.tick(t, camera, f.kick * 0.4); embers.userData.tick(t, 0.9 + bp * 0.5);
    const b4 = ((B.beat % 4) + B.bp) / 4;
    rRing.userData.set(b4 * 600, (1 - b4) * 0.5, 10 + b4 * 14, t);
    for (let i = 0; i < 3; i++) {
      const tw = towers[Math.floor(hash(B.beat * 1.7 + i) * towers.length)];
      sF.set(tw.x + (hash(B.beat + i) - 0.5) * 120, 300, tw.z - 80); sT.set(tw.x, tw.H, tw.z);
      storm.userData.bolt(i, sF, sT, B.b16 * 3 + i, (B.beat % 2 === 1 ? 1 : 0) * Math.exp(-B.bp * 7) * (hash(B.b16 + i) > 0.3 ? 1 : 0.35) * (hash(B.beat * 0.6 + i) > 0.3 ? 1 : 0), 0.14, 0.32);
    }
    sky.userData.U.uSort.value = 0.35 + f.kick * 0.4; sky.userData.U.uBeat.value = B.beat;
    moonMat.uniforms.uK.value = f.low * 0.4 + bp * 0.3; moonMat.uniforms.uT.value = t * 0.6;
    moon.scale.setScalar(1 + f.low * 0.04);
    halo.material.opacity = 0.1 + f.low * 0.1;
    const w = k.i >= 0 ? k.flat[k.i] : (B.beat % 4 === 0 && B.bp < 0.5 ? 'CAOS' : null);
    big.set(w, LYRIC_FONT);
    if (w) big.update(0.4 + f.kick * 2.5, k.i >= 0 ? 0.75 : 0.35, B.b16, 2 + f.kick * 8);
    const r = Math.pow(f.kick, 3) * 0.08; post.s.flash = [r, 0, r * 0.1];
    post.s.bloom = 0.35 + f.low * 0.15; post.s.bloomT = 0.7; post.s.bloomR = 0.5; post.s.fish = fish; post.s.exposure = 1.35;
    post.s.ab = 0.002 + f.kick * 0.01; post.s.glitch = Math.pow(f.kick, 2) * 0.4; post.s.scan = 0.08; post.s.grain = 0.05; post.s.vig = 0.6;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
