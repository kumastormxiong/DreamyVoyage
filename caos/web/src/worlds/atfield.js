// 06 六角力场 · 巨构降临（意象致敬《新世纪福音战士》，全部原创）：停电的夜城上空悬着一个巨大的深蓝晶体八面体，
// 棱线发青光、核心缓慢搏动；探照灯从城市各处汇聚到它身上。每个小节第一拍，它面前展开一面橙色六角力场，
// 冲击点的六角格一圈圈涟漪扩散；屏幕上是红黑的紧急警告 HUD。最后一小节地平线升起十字光柱，接入 drop 前的上扬。
// 运镜：街面超广角仰拍推进 → 急速升空环绕巨构 → 力场冲击特写（冲击变焦）→ 大全景环绕 → 后撤 + 鱼眼迎接十字光柱。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, textMesh, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat, wetGround } from './city.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, lightCone } from './dress.js';
import { beatAt, pulse, DISPLAY_FONT } from './_glitch.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { plasmaShell, lightning, shockRing, fogSheets, motes } from './fx.js';

const EP = new THREE.Vector3(0, 170, -240);          // 巨构位置

function hexMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uA: { value: 0 }, uR: { value: 0 }, uHit: { value: new THREE.Vector2(0, 0) }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uA,uR,uT; uniform vec2 uHit; varying vec2 vP;
      vec4 hex(vec2 p){ vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h; vec2 g = dot(a,a) < dot(b,b) ? a : b; return vec4(g, p - g); }
      void main(){
        vec2 p = vP / 7.0; vec4 hx = hex(p); vec2 g = abs(hx.xy);
        float edge = smoothstep(0.42, 0.5, max(dot(g, normalize(vec2(1.0, 1.7320508))), g.x));
        float d = length(hx.zw * 7.0 - uHit);
        float rq = (d - uR) * 0.06; float ring = exp(-rq * rq);
        float fill = exp(-d * 0.012);
        float a = (edge * (0.18 + ring * 1.4) + ring * 0.2 + fill * 0.05) * uA;
        a *= 1.0 - smoothstep(60.0, 95.0, length(vP));
        vec3 c = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.5), ring);
        gl_FragColor = vec4(c * a, 1.0);
      }`
  });
}

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 70, bg: 0x04040a });
  const sky = skyMat({ stops: [[-0.3, 0x020205], [0.0, 0x2a0e14], [0.08, 0x120a1a], [0.4, 0x06060e], [1, 0x020206]], stars: 0.5, cloud: 0.6, cloudA: 0x3a1a26, cloudB: 0x0c0810, cloudY: [0.15, 0.6], cloudScale: 1.3, levels: 16 });
  scene.add(sky);
  nightRig(ctx, scene, { moon: 0x7a8ab8, moonI: 1.6, dir: [-0.3, 0.6, -0.6], hemiSky: 0x2a2a44, hemiGround: 0x1a0808, hemiI: 0.9, size: 260, center: [0, 0, -120], env: envFromSky(ctx, sky) });
  const mat = cityMat({ wall: 0x3a3c46, wall2: 0x2a2c36, wallH: 120, lit: [0xffe0b0, 0xff4020, 0xffffff], dark: 0x05060a, litP: 0.12, glow: 2.0,
    floorH: 3.2, colW: 2.4, neon: 0xff2a10, neon2: 0xff8a1a, neonP: 0.04, roof: 0x14141a, fog: 0x0a0610, fogNear: 120, fogFar: 600, fogH: 18, seed: 61, band: 0.03, warm: 0xff3a1a, flood: 0.25, floodCol: 0xff2a10 });
  const list = ringLayout(420, 30, 420, { seed: 611, hMin: 20, hMax: 160, wMin: 10, wMax: 28 }).filter((b) => Math.abs(b.x) > 18 + b.w / 2 || b.z < -200);   // 留出一条正对巨构的大道
  scene.add(buildings(mat, list, { reflect: true })); scene.add(wetGround(0x040306, 0.8));
  const roof = roofClutter(list, { seed: 612 }); scene.add(roof);
  // 巨构：晶体八面体 + 发光棱线 + 核心
  const ent = new THREE.Group(); ent.position.copy(EP); scene.add(ent);
  const crys = new THREE.Mesh(new THREE.OctahedronGeometry(60, 0), new THREE.MeshStandardMaterial({ color: 0x0a1a4a, metalness: 0.9, roughness: 0.08, envMapIntensity: 2.5, flatShading: true }));
  crys.scale.y = 1.35; ent.add(crys);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(crys.geometry), new THREE.LineBasicMaterial({ color: col(0x6ae0ff), toneMapped: false, transparent: true }));
  edges.scale.copy(crys.scale).multiplyScalar(1.01); ent.add(edges);
  const core = glowSprite(0x8ae8ff, 160, 0.5); ent.add(core);
  // 细节层：晶体外的等离子电晕、落雷、地面冲击波、血色低雾与升腾的余烬
  const shell = plasmaShell({ radius: 78, color: 0x3ad8ff, color2: 0xff5a2a, detail: 4, scale: 1.0 }); shell.scale.y = 1.3; ent.add(shell);
  const bolts = lightning({ n: 5, color: 0xcfeaff }); scene.add(bolts);
  const ring = shockRing({ color: 0xffe0b0, color2: 0xff5a1a, size: 760 }); ring.position.set(0, 0.4, -240); scene.add(ring);
  const haze = fogSheets({ n: 4, y0: 4, y1: 60, color: 0x5a2030, density: 0.38, seed: 6 }); scene.add(haze);
  const embers = motes({ n: 700, box: [300, 160, 300], center: [0, 0, -200], color: 0xff6a2a, size: 2.8, rise: 4, sway: 6, seed: 61 }); scene.add(embers);
  const bFrom = new THREE.Vector3(), bTo = new THREE.Vector3();
  const entLight = new THREE.PointLight(0x6ae0ff, 30000, 500, 1.4); ent.add(entLight);
  // 六角力场
  const hm = hexMat(); const hexP = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), hm); hexP.position.set(0, 150, -150); scene.add(hexP);
  // 汇聚的探照灯
  const R = rng(613), beams = [];
  for (let i = 0; i < 9; i++) {
    const c = lightCone(i % 3 ? 0xdce8ff : 0xff6a3a, 300, 10); const a = (i / 9) * Math.PI * 2;
    c.position.set(Math.cos(a) * 160, 0, -240 + Math.sin(a) * 160); scene.add(c); beams.push(c);
  }
  // 十字光柱
  const crossMat = new THREE.MeshBasicMaterial({ color: col(0xfff0d8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const cross = new THREE.Group(); cross.position.set(0, 0, -520); scene.add(cross);
  const cv = new THREE.Mesh(new THREE.PlaneGeometry(40, 900), crossMat); cv.position.y = 450; cross.add(cv);
  const ch = new THREE.Mesh(new THREE.PlaneGeometry(520, 34), crossMat); ch.position.y = 330; cross.add(ch);
  const crossGlow = glowSprite(0xff9a4a, 700, 0); crossGlow.position.y = 300; cross.add(crossGlow);
  // 紧急 HUD（挂在镜头上）
  const hud = new THREE.Group(); hud.position.z = -6; camera.add(hud);
  const red = '#ff2a10';
  const W1 = textMesh('WARNING', 0.42, { font: DISPLAY_FONT, size: 120, weight: '800', fill: red, pad: 16 }, false); W1.position.set(-2.6, 2.1, 0); hud.add(W1);
  const W2 = textMesh('UNKNOWN ENTITY', 0.2, { font: DISPLAY_FONT, size: 110, weight: '700', fill: '#ff8a5a', pad: 12 }, false); W2.position.set(-2.6, 1.72, 0); hud.add(W2);
  const W3 = textMesh('EMERGENCY', 0.42, { font: DISPLAY_FONT, size: 120, weight: '800', fill: red, pad: 16 }, false); W3.position.set(2.7, -2.0, 0); hud.add(W3);
  const barMat = new THREE.MeshBasicMaterial({ color: col(0xff2a10), transparent: true, toneMapped: false });
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.06), barMat); b.position.set(0, i ? -2.35 : 2.45, 0); hud.add(b); }
  hud.children.forEach((m) => { m.material.depthTest = false; m.renderOrder = 60; });
  const lyric = makeLyricLayer(ctx, camera, { y: -0.26, height: 0.08, colors: { sung: 0xfff2e8, hot: 0xff8a1a, pre: 0x6ae0ff, splitA: 0x6ae0ff, splitB: 0xff2a10 } });
  const street = camPath([{ u: 0, p: [6, 2, 150], l: [0, 150, -240], fov: 100, roll: -0.1 }, { u: 1, p: [-4, 4, 60], l: [0, 170, -240], fov: 92, roll: 0.06 }], { ease: E.lin });
  const tgt = new THREE.Vector3();

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), bp = pulse(B.bp, 6);
    const bars = S.lt / (240 / tl.bpm), bar = Math.floor(bars), bu = bars - bar;
    ent.rotation.set(0, t * 0.25, Math.sin(t * 0.3) * 0.05); ent.position.y = EP.y + Math.sin(t * 0.6) * 4;
    core.material.opacity = 0.35 + bp * 0.4 + f.vox * 0.2; edges.material.opacity = 0.6 + bp * 0.4;
    entLight.intensity = 20000 + bp * 30000;
    // 力场：每小节第一拍展开，冲击点涟漪
    const hitAge = B.barp * 240 / tl.bpm;
    hm.uniforms.uA.value = Math.exp(-hitAge * 1.6) * (bar === 4 ? 1 : bar >= 1 ? 0.45 : 0.2); hm.uniforms.uR.value = hitAge * 90;
    hm.uniforms.uHit.value.set((hash(B.bar) - 0.5) * 80, (hash(B.bar + 3) - 0.5) * 60);
    hexP.lookAt(camera.position);
    shell.userData.tick(t, bp * 0.8, 0.45 + bp * 0.45);
    ring.userData.set(hitAge * 260, Math.exp(-hitAge * 1.3) * (bar >= 1 ? 1 : 0.4), 7 + hitAge * 8, t);
    mat.userData.wave(0, -240, hitAge * 260, Math.exp(-hitAge * 1.3) * 0.9, 8 + hitAge * 10, 0xff7a3a);
    for (let i = 0; i < 5; i++) {                                   // 落雷：每拍重新取形，指数衰减，16 分音符上频闪
      const ang = hash(B.beat * 1.7 + i) * 6.2832, rr = 40 + hash(B.beat * 2.9 + i) * 120;
      bFrom.set(EP.x + (hash(B.beat + i * 5) - 0.5) * 60, EP.y - 30, EP.z + (hash(B.beat + i * 7) - 0.5) * 40);
      bTo.set(Math.cos(ang) * rr, 0, -240 + Math.sin(ang) * rr);
      bolts.userData.bolt(i, bFrom, bTo, B.b16 * 5 + i, (hash(B.beat * 3.1 + i) > 0.4 ? 1 : 0) * Math.exp(-B.bp * 6) * (bar >= 1 ? 1 : 0.4) * (hash(B.b16 + i) > 0.25 ? 1 : 0.35), 0.16, 0.3);
    }
    haze.userData.tick(t, camera, bp * 0.3); embers.userData.tick(t, 0.9 + bp * 0.5);
    beams.forEach((c, i) => { tgt.copy(ent.position).add(new THREE.Vector3(Math.sin(t * 0.7 + i) * 30, Math.cos(t * 0.5 + i) * 20, 0)); c.lookAt(tgt); c.rotateX(Math.PI / 2); c.material.uniforms.uI.value = 0.7 + bp * 0.6; });
    const cr = bar === 7 ? E.out(bu) : 0; crossMat.opacity = cr; cv.scale.y = 0.2 + cr * 0.8; ch.scale.x = cr; crossGlow.material.opacity = cr * 0.08; crossMat.opacity = cr * 0.85;
    // 运镜
    let cam, fish = 0;
    if (bar < 2) cam = street(bars / 2);
    else if (bar < 4) { const u = E.io((bars - 2) / 2), a = -0.6 + u * 2.2, r = 260 - u * 60; cam = { p: new THREE.Vector3(EP.x + Math.sin(a) * r, 30 + u * 190, EP.z + Math.cos(a) * r), l: EP, fov: 80 - u * 15, roll: Math.sin(u * Math.PI) * 0.35 }; }
    else if (bar === 4) { const u = E.expo(bu); cam = { p: new THREE.Vector3(30 - u * 10, 140, -60 - u * 30), l: new THREE.Vector3(hm.uniforms.uHit.value.x, 150 + hm.uniforms.uHit.value.y, -150), fov: 75 - u * 35, roll: 0.15 }; }
    else if (bar < 7) { const u = (bars - 5) / 2, a = 1.6 + u * 2.4; cam = { p: new THREE.Vector3(EP.x + Math.sin(a) * 420, 120 + Math.sin(u * Math.PI) * 80, EP.z + Math.cos(a) * 420), l: new THREE.Vector3(0, 110, -240), fov: 62, roll: -0.08 }; }
    else { const u = E.io(bu); cam = { p: new THREE.Vector3(0, 40 + u * 30, 160 + u * 120), l: new THREE.Vector3(0, 200, -400), fov: 90 + u * 20, roll: 0 }; fish = 0; }
    applyCam(camera, cam, { t, shake: 0.25 + f.kick * 0.6 + cr * 1.5, punch: punchAt(B, 6) });
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 1.5, B.b16, bp * 0.6);
    roof.userData.tick(t);
    const blink = B.beat % 2 === 0 ? 1 : 0.35;
    hud.children.forEach((m, i) => { m.material.opacity = (bar >= 2 ? blink : 0.15) * (i < 3 ? 1 : 0.7); });
    hud.position.x = (hash(B.b16) - 0.5) * f.kick * 0.2;
    post.s.exposure = 1.15; post.s.bloom = 0.5 + bp * 0.2 + cr * 0.2; post.s.bloomT = 0.6; post.s.bloomR = 0.55;
    post.s.ab = 0.002 + f.kick * 0.01; post.s.glitch = Math.pow(f.kick, 3) * 0.3 + (bar === 4 && bu < 0.1 ? 0.5 : 0);
    post.s.fish = fish; post.s.scan = 0.06; post.s.grain = 0.05; post.s.vig = 0.6;
    post.s.flash = [cr * 0.08, cr * 0.05, cr * 0.03];
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
