// 05 夜·金色圣城（参考 ref-3 的建筑语言，改成夜景 + 巨构尺度）：墨青色夜空下，一条十几公里长的"圣道"夹在两排千米高的象牙白退台巨塔之间，
// 楼脚的金色泛光从下往上照亮塔身，竖向金色霓虹饰条勾出轮廓；尽头是一座比山还大的铜绿穹顶神殿，金尖刺进极光里。
// 观众是圣道上一粒尘：脚边是五米高的路灯，头顶是横跨两塔的金色廊桥（长 500 米）。
// 卡点：每拍一些楼层的通长灯带点亮；每 4 小节最后一拍负片闪；鼓点切片错位。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth, glowSprite } from '../lib.js';
import { makeLyricLayer } from '../lyrics.js';
import { cityMat, buildings, ringLayout, skyMat, wetGround } from './city.js';
import { beatAt, pulse } from './_glitch.js';
import { nightRig, envFromSky } from './pbr.js';
import { roofClutter, flyers, searchlights } from './dress.js';
import { camPath, applyCam, punchAt, E } from './cam.js';
import { fogSheets, aurora, motes } from './fx.js';
import { megaTower, megaBeacons, streetScale } from './mega.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 52, bg: 0x050b10, near: 0.5, far: 8000 });
  const sky = skyMat({ stops: [[-0.3, 0x030608], [0.0, 0x6a4a1c], [0.05, 0x1c2a2e], [0.3, 0x08131a], [1, 0x020508]], stars: 0.5,
    cloud: 0.45, cloudA: 0x3a4a48, cloudB: 0x141e22, cloudY: [0.03, 0.3], cloudScale: 2, levels: 16 }); scene.add(sky);
  nightRig(ctx, scene, { moon: 0x9ac8d8, moonI: 2.4, dir: [-0.5, 0.5, 0.4], hemiSky: 0x2a4048, hemiGround: 0x3a2a10, hemiI: 0.8, shadow: false, env: envFromSky(ctx, sky), envK: 0.9 });
  const mat = cityMat({ wall: 0x5a4f40, wall2: 0x38342e, rough: 0.55, wallH: 1500, lit: [0xffc86a, 0xffe2a8, 0x7ae8e0], dark: 0x060a0c, litP: 0.18, glow: 2.2,
    floorH: 3.0, colW: 1.6, winX: 0.34, winY: 0.86, neonP: 0.0, roof: 0x14181a, fog: 0x0a1418, fogNear: 400, fogFar: 6500, fogH: 120, flick: 0.05, seed: 5,
    slab: 0.18, trim: 0x8a6a30, trimP: 0.25, band: 0.06, warm: 0xffd27a, flood: 0.45, floodCol: 0x9a6a2a });
  const R = rng(505), list = [], towers = [];
  for (let i = 0; i < 16; i++) {                                   // 圣道两侧的巨塔：每 220 米一对
    const side = i % 2 ? 1 : -1, z = -60 - Math.floor(i / 2) * 230 - R() * 40;
    const w = 150 + R() * 110, h = 700 + R() * 700, x = side * (230 + w / 2 + R() * 50);
    towers.push(megaTower(list, { x, z, w, d: w * 0.9, h, tiers: 4, taper: 0.74, seed: 50 + i }));
  }
  list.push(...ringLayout(170, 1000, 3600, { seed: 51, hMin: 400, hMax: 1600, wMin: 120, wMax: 320 }));
  scene.add(buildings(mat, list, { reflect: true })); scene.add(wetGround(0x040a0d, 0.97, 10000));

  // 金色霓虹竖线：沿塔身边缘（巨塔上加粗到 2 米，远处才看得见）
  const goldLine = new THREE.MeshBasicMaterial({ color: col(0xffc060), toneMapped: false });
  const edges = [];
  list.slice(0, 120).forEach((b, i) => {
    if (i % 3 !== 0 || hash(i) < 0.3 || b.h < 60) return;
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.0, b.h, 2.0), goldLine); m.position.set(b.x + sx * b.w / 2, (b.y || 0) + b.h / 2, b.z + b.d / 2); scene.add(m); edges.push(m); }
  });
  // 穹顶（铜绿 + 青色边缘光）与金尖
  // 穹顶：暗青铜底 + 金色电路纹（极坐标"电路板"：同心环 / 经线 / 拐角 / 焊盘），电流脉冲沿走线奔跑，顶点向外扩散扫描环
  const domeMat = new THREE.ShaderMaterial({ toneMapped: false, uniforms: { uK: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 w = modelMatrix * vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uK, uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float seg(float d, float w){ return 1.0 - smoothstep(w, w + 0.05, abs(d)); }
      void main(){
        vec3 n = normalize(vP);
        float lat = asin(clamp(n.y, 0.0, 1.0)) / 1.5708;                  // 0 赤道 → 1 顶点
        float lon = atan(n.z, n.x) / 6.28318 + 0.5;
        float RN = 16.0; float ring = floor(lat * RN); float fv = fract(lat * RN);
        float cols = max(4.0, floor(64.0 * cos((ring + 0.5) / RN * 1.5708)));
        float cid = floor(lon * cols); float fu = fract(lon * cols);
        float h = h21(vec2(cid, ring)), h2 = h21(vec2(ring * 1.7, cid + 3.1));
        float tr = 0.0, flow = 0.0, pad = 0.0;
        if (h < 0.24)      { tr = seg(fv - 0.5, 0.055); flow = fu; }                                           // 沿纬线的走线
        else if (h < 0.46) { tr = seg(fu - 0.5, 0.055); flow = fv; }                                           // 沿经线的走线
        else if (h < 0.66) { tr = max(seg(fv - 0.5, 0.055) * step(0.5, fu), seg(fu - 0.5, 0.055) * step(0.5, fv)); flow = fu + fv; }   // L 形拐角
        else if (h < 0.78) { float d = length(vec2(fu, fv) - 0.5); pad = (1.0 - smoothstep(0.17, 0.2, d)) - (1.0 - smoothstep(0.08, 0.11, d)) * 0.8; tr = pad; }
        float pulse = pow(0.5 + 0.5 * sin(flow * 6.28318 - uT * (1.6 + h2 * 2.4) + h2 * 40.0), 10.0);
        float rib = seg(fract(lon * 24.0) - 0.5, 0.012) * 0.45;                                               // 经线肋
        float band = seg(fract(lat * RN / 4.0) - 0.0, 0.02) * 0.6;                                            // 每 4 环一道粗环线
        float sw0 = (fract(uT * 0.12) * 1.4 - lat) * 9.0; float sweep = exp(-sw0 * sw0);                              // 从赤道向顶点推进的扫描环
        float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vN), vV))), 2.6);
        vec3 base = vec3(0.05, 0.028, 0.012) + vec3(0.12, 0.06, 0.02) * (1.0 - lat) * 0.6;
        vec3 gold = vec3(1.0, 0.68, 0.24), hot = vec3(1.0, 0.95, 0.8);
        vec3 c = base + gold * (tr * 0.55 + rib + band) * (0.7 + uK) + hot * tr * pulse * (1.6 + uK * 2.0);
        c += gold * tr * sweep * 2.2 + vec3(1.0, 0.45, 0.15) * sweep * 0.25;
        c += vec3(1.0, 0.5, 0.18) * rim * (0.65 + uK) + vec3(0.6, 0.45, 0.2) * max(0., -vN.y) * 0.5;
        gl_FragColor = vec4(c, 1.0); }` });
  const goldMat = new THREE.MeshBasicMaterial({ color: col(0xffcf70), toneMapped: false });
  const ivory = new THREE.MeshBasicMaterial({ color: 0x2a2620, toneMapped: false });
  const palace = new THREE.Group(); palace.position.set(0, 0, -2300); palace.scale.setScalar(16); scene.add(palace);   // 神殿：穹顶半径 430 米，金尖高 1500 米
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 50, 48), ivory); drum.position.y = 25; palace.add(drum);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 44, 0.6), goldMat); c.position.set(Math.cos(a) * 26.6, 25, Math.sin(a) * 26.6); c.rotation.y = -a; palace.add(c); }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(27, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.position.y = 50; palace.add(dome);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 34, 12), goldMat); spire.position.y = 94; palace.add(spire);
  const halo = glowSprite(0xffc060, 70, 0.1); halo.position.set(0, 60, -40); palace.add(halo);
  for (let i = 0; i < 16; i++) {                                   // 塔顶的小穹顶
    const b = towers[(i * 5) % towers.length]; if (!b) continue;
    const r = b.w * 0.18 * Math.pow(0.8, 3);
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); d.position.set(b.x, b.top, b.z); scene.add(d);
    const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.1, r * 1.6, 8), goldMat); s.position.set(b.x, b.top + r + r * 0.7, b.z); scene.add(s);
  }
  // 金色廊桥（发光扶手）：横跨整条圣道的巨梁
  for (let i = 0; i < 6; i++) {
    const z = -140 - i * 300, y = 330 + (i % 2) * 280;
    const br = new THREE.Mesh(new THREE.BoxGeometry(560, 14, 34), ivory); br.position.set(0, y, z); scene.add(br);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(560, 1.6, 1.6), goldMat); rail.position.set(0, y + 9, z + 17); scene.add(rail);
    const rail2 = rail.clone(); rail2.position.z = z - 17; scene.add(rail2);
  }
  const roof = roofClutter(list, { seed: 52, color: 0x2a2620, beacon: 0xffc060, per: 8, maxB: 160 }); scene.add(roof);
  const beac = megaBeacons(towers.map((b) => new THREE.Vector3(b.x, b.top + b.h * 0.16 + 4, b.z)), { size: 70, color: 0xffc060 }); scene.add(beac);
  const beams = searchlights({ n: 5, seed: 53, area: 500, z0: -900, color: 0xffd08a, len: 520 }); beams.scale.setScalar(3.6); scene.add(beams);
  const fly = flyers({ n: 8, seed: 54, rad: [300, 1000], y: [150, 1000], speed: 0.03, light: 0xfff0c0, cone: 0xffe2a0 }); fly.position.z = -700; scene.add(fly);
  const street = streetScale({ center: [0, 0, 50], len: 560, width: 36, seed: 8, lamps: 40, cars: 90, lampColor: 0xffc860 }); scene.add(street);
  // 细节层：金色极光、地面金雾、漂浮的金粉
  const aur = aurora({ center: Math.PI, span: 2.8, radius: 5200, y: 2300, height: 2400, colors: [0xffc060, 0x38ffc8, 0x4a7aff], layers: 3, seed: 5, intensity: 0.85 }); scene.add(aur);
  const haze = fogSheets({ n: 6, y0: 20, y1: 1200, color: 0xb88a40, density: 0.13, seed: 5, size: 8000, scale: 0.0016, speed: 0.004 }); scene.add(haze);
  const gold = motes({ n: 900, box: [260, 160, 300], center: [0, 0, -80], color: 0xffd27a, size: 2.6, rise: 1.5, sway: 5, seed: 51 }); scene.add(gold);
  const rig = camPath([
    { u: 0, p: [0, 3, 120], l: [0, 560, -700], fov: 96 },                          // 站在圣道上仰望
    { u: 0.16, p: [-5, 3, 20], l: [4, 380, -900], fov: 92, roll: 0.05 },           // 沿圣道往前走
    { u: 0.34, p: [7, 2.6, -120], l: [0, 160, -2300], fov: 88, roll: -0.04 },      // 平视远处的神殿穹顶
    { u: 0.5, p: [-4, 3, -230], l: [-20, 520, -1400], fov: 94, roll: 0.06 },       // 走到圣道深处，再次仰望
    { u: 0.68, p: [10, 160, -330], l: [0, 480, -2300], fov: 84, roll: -0.1 },      // 离地升起
    { u: 0.84, p: [10, 420, -420], l: [0, 520, -2300], fov: 78, roll: -0.12 },     // 升到廊桥高度，穿过廊桥下方
    { u: 1, p: [-260, 1150, -300], l: [0, 600, -2300], fov: 62, roll: 0.05 }       // 高空回望，神殿与塔群尽收眼底
  ], { ease: E.io });
  const lyric = makeLyricLayer(ctx, camera, { y: -0.3, height: 0.08, colors: { sung: 0xfff4dc, hot: 0xffc060, pre: 0x7ae8e0, splitA: 0x7ae8e0, splitB: 0xffc060 } });

  function update({ t, f, S, k, tl, post }) {
    const B = beatAt(tl, t), p = S.p, bp = pulse(B.bp, 6);
    applyCam(camera, rig(p), { t, shake: 0.12 + f.kick * 0.35, punch: punchAt(B, 4) }); camera.position.y = Math.max(camera.position.y, 1.7);
    sky.position.copy(camera.position);
    roof.userData.tick(t); beams.userData.tick(t, B.beat, bp); fly.userData.tick(t); beac.userData.tick(t); street.userData.tick(t);
    const b16 = (((B.bar % 4) * 4 + B.beat % 4) + B.bp) / 16;
    const cd = Math.hypot(camera.position.x, camera.position.z + 900), wr = b16 * 2400, sy = -5 + ((B.bar % 4) + B.barp) / 4 * 1500;
    mat.userData.scan(sy, 0.7 * smooth(20, 160, Math.abs(sy - camera.position.y)), 0xffd27a);          // 扫描带经过镜头所在高度时淡掉，免得整屏冲白
    mat.userData.wave(0, -900, wr, (1 - b16) * 0.3 * smooth(40, 420, Math.abs(wr - cd)), 40 + b16 * 90, 0xffe0a0);   // 冲击波从镜头脚下荡过时同样淡掉
    aur.userData.tick(t, bp); haze.userData.tick(t, camera, bp * 0.3); gold.userData.tick(t, 0.9 + bp * 0.4);
    mat.userData.tick(t, B.beat, Math.pow(f.kick, 2) * 2.0 + (B.beat % 8 === 7 ? (1 - B.bp) * 1.5 : 0), B.b16, bp * 0.6);
    domeMat.uniforms.uK.value = bp * 0.6; domeMat.uniforms.uT.value = t;
    edges.forEach((m, i) => { m.visible = hash(i * 1.7 + B.beat * 0.31) > 0.18; });
    halo.material.opacity = 0.05 + f.vox * 0.06;
    const neg = B.beat % 16 === 15 && B.bp < 0.3;
    post.s.tint = neg ? [-1, -1, -1] : [1, 1, 1]; post.s.flash = neg ? [0.28, 0.25, 0.2] : [0, 0, 0];
    post.s.exposure = 1.1; post.s.bloom = 0.45 + bp * 0.12; post.s.bloomT = 0.72; post.s.bloomR = 0.45; post.s.fish = 0;
    post.s.ab = 0.0015 + f.kick * 0.006; post.s.glitch = Math.pow(f.kick, 3) * 0.25;
    post.s.scan = 0.04; post.s.grain = 0.03; post.s.vig = 0.55;
    lyric.update(k, t, f);
  }
  return { scene, camera, update };
}
