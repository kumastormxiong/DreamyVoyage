// 城市细节装饰（所有场景共用，控制数量以减轻渲染压力）：
//   roofClutter(list, mat)    楼顶设备：空调机组、水箱、天线、楼顶小屋 + 红色航标（实例化，一次绘制）
//   searchlights(o)           探照灯光柱（加色体积锥），按拍子扫动
//   flyers(o)                 飞行器：机身 + 闪烁航灯 + 前照灯光锥，沿闭合曲线飞行
//   steam(o)                  楼顶蒸汽 / 烟（柔边 Sprite，缓慢上升）
//   billboards(list, o)       楼面巨屏（故障屏着色器），挂在楼的正面
import * as THREE from 'three';
import { col, rng, hash, glowSprite, glowTexture } from '../lib.js';
import { glitchScreenMat, tickScreen } from './_glitch.js';

export function roofClutter(list, { seed = 1, color = 0x1a1c22, per = 3, maxB = 220, beacon = 0xff2a1a } = {}) {
  const R = rng(seed), boxes = [], cyl = [], beacons = [];
  list.slice(0, maxB).forEach((b) => {
    if (b.h < 12 || b.w < 5) return;
    const y = (b.y || 0) + b.h;
    for (let i = 0; i < per; i++) {
      const w = 1 + R() * Math.min(5, b.w * 0.3), d = 1 + R() * Math.min(5, b.d * 0.3), h = 0.8 + R() * 3;
      boxes.push({ x: b.x + (R() - 0.5) * (b.w - w), y, z: b.z + (R() - 0.5) * (b.d - d), w, d, h });
    }
    if (R() < 0.35) cyl.push({ x: b.x + (R() - 0.5) * b.w * 0.5, y, z: b.z + (R() - 0.5) * b.d * 0.5, r: 1.2 + R() * 1.5, h: 3 + R() * 3 });
    if (R() < 0.3) { const ah = 6 + R() * 20; cyl.push({ x: b.x, y, z: b.z, r: 0.15, h: ah }); beacons.push(new THREE.Vector3(b.x, y + ah, b.z)); }
  });
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5 });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, Math.max(1, boxes.length));
  boxes.forEach((b, i) => { M.compose(new THREE.Vector3(b.x, b.y, b.z), Q, new THREE.Vector3(b.w, b.h, b.d)); bm.setMatrixAt(i, M); }); bm.count = boxes.length;
  const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), mat, Math.max(1, cyl.length));
  cyl.forEach((c, i) => { M.compose(new THREE.Vector3(c.x, c.y, c.z), Q, new THREE.Vector3(c.r, c.h, c.r)); cm.setMatrixAt(i, M); }); cm.count = cyl.length;
  bm.castShadow = cm.castShadow = true; bm.receiveShadow = cm.receiveShadow = true;
  g.add(bm, cm);
  // 航标：一次性画成 Points
  const pg = new THREE.BufferGeometry().setFromPoints(beacons);
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: col(beacon), size: 2.2, sizeAttenuation: true, map: glowTexture('255,255,255', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  g.add(pts);
  g.userData.tick = (t) => { pts.material.opacity = 0.3 + 0.7 * (Math.sin(t * 3.3) > 0.2 ? 1 : 0); };
  return g;
}

const coneMat = (c) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  uniforms: { uC: { value: col(c) }, uI: { value: 1 } },
  vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 w = modelMatrix * vec4(position,1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'uniform vec3 uC; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 3.0); float a = pow(clamp(vY, 0.0, 1.0), 2.4) * e * uI * 0.16; gl_FragColor = vec4(uC * a, 1.0); }'
});
// 光柱：底部在 base 点，朝 dir 方向，长 len
export function lightCone(color, len = 300, r = 22) {
  const geo = new THREE.CylinderGeometry(r, 0.6, len, 32, 1, true).translate(0, -len / 2, 0).rotateX(Math.PI);   // 尖端在原点、沿 +y 张开
  const m = new THREE.Mesh(geo, coneMat(color)); m.frustumCulled = false; return m;
}
export function searchlights({ n = 6, seed = 3, area = 200, z0 = -150, color = 0xcfe0ff, len = 420 } = {}) {
  const R = rng(seed), g = new THREE.Group(), items = [];
  for (let i = 0; i < n; i++) {
    const m = lightCone(color, len, 16 + R() * 10); m.position.set((R() - 0.5) * area, 0, z0 + (R() - 0.5) * area * 0.6);
    g.add(m); items.push({ m, ph: R() * 6, sp: 0.3 + R() * 0.4, tilt: 0.25 + R() * 0.35 });
  }
  g.userData.tick = (t, beat = 0, k = 0) => items.forEach((s, i) => {
    const a = Math.sin(t * s.sp + s.ph) * 0.6 + (hash(i + Math.floor(beat / 4)) - 0.5) * 0.4;
    s.m.rotation.set(Math.sin(t * s.sp * 0.7 + s.ph) * s.tilt, 0, a * 0.6);
    s.m.material.uniforms.uI.value = 0.7 + k * 0.8;
  });
  return g;
}

export function flyers({ n = 8, seed = 5, rad = [80, 220], y = [40, 140], speed = 0.06, body = 0x15171d, light = 0xffffff, cone = 0xbfe8ff } = {}) {
  const R = rng(seed), g = new THREE.Group(), items = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: body, metalness: 0.8, roughness: 0.35 });
  for (let i = 0; i < n; i++) {
    const f = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 5.5), bodyMat); f.add(hull);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 1.6), bodyMat); fin.position.z = 1.2; f.add(fin);
    const red = glowSprite(0xff3020, 2.2, 1); red.position.set(-2.8, 0, 1.2); f.add(red);
    const grn = glowSprite(0x30ff80, 2.2, 1); grn.position.set(2.8, 0, 1.2); f.add(grn);
    const head = glowSprite(light, 3.5, 1); head.position.set(0, 0, -2.9); f.add(head);
    const beam = lightCone(cone, 60, 9); beam.rotation.x = -Math.PI / 2 - 0.35; beam.position.z = -2.8; beam.material.uniforms.uI.value = 0.6; f.add(beam);
    g.add(f); items.push({ f, r: rad[0] + R() * (rad[1] - rad[0]), y: y[0] + R() * (y[1] - y[0]), ph: R() * 6.28, sp: (speed * (0.6 + R() * 0.8)) * (R() < 0.5 ? 1 : -1), wob: R() * 6, red, grn });
  }
  g.userData.tick = (t) => items.forEach((it, i) => {
    const a = it.ph + t * it.sp, a2 = a + 0.01 * Math.sign(it.sp);
    it.f.position.set(Math.cos(a) * it.r, it.y + Math.sin(t * 0.5 + it.wob) * 4, Math.sin(a) * it.r);
    it.f.lookAt(Math.cos(a2) * it.r, it.y + Math.sin(t * 0.5 + it.wob) * 4, Math.sin(a2) * it.r);
    it.f.rotateZ(-Math.sign(it.sp) * 0.25);
    const blink = Math.sin(t * 6 + i) > 0.6 ? 1 : 0.15; it.red.material.opacity = blink; it.grn.material.opacity = blink;
  });
  return g;
}

let SMOKE = null;
function smokeTex() {
  if (SMOKE) return SMOKE;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const R = rng(99);
  for (let i = 0; i < 30; i++) { const x = 34 + R() * 60, y = 34 + R() * 60, r = 18 + R() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  SMOKE = new THREE.CanvasTexture(cv); return SMOKE;
}
export function steam(points, { color = 0x8a90a0, size = 14, n = 6, rise = 3, opacity = 0.5 } = {}) {
  const g = new THREE.Group(), items = [];
  points.forEach((p, k) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex(), color: col(color), transparent: true, depthWrite: false, opacity }));
      g.add(s); items.push({ s, p, ph: i / n, k });
    }
  });
  g.userData.tick = (t) => items.forEach(({ s, p, ph, k }) => {
    const u = (ph + t * 0.07 + k * 0.13) % 1;
    s.position.set(p.x + Math.sin(u * 4 + k) * 2, p.y + u * size * rise, p.z);
    const sc = size * (0.4 + u); s.scale.set(sc, sc, 1); s.material.opacity = opacity * Math.sin(u * Math.PI); s.material.rotation = u * 2 + k;
  });
  return g;
}

export function billboards(list, { seed = 7, n = 8, palette = [0xff3fa4, 0x3ff0ff, 0xffffff], amp = 0.55, minH = 30 } = {}) {
  const R = rng(seed), g = new THREE.Group(), mats = [];
  const cands = list.filter((b) => b.h > minH && b.w > 10);
  for (let i = 0; i < Math.min(n, cands.length); i++) {
    const b = cands[Math.floor(R() * cands.length)];
    const vert = R() < 0.5, w = vert ? b.w * 0.4 : b.w * 0.8, h = vert ? b.h * 0.35 : b.w * 0.35;
    const mat = glitchScreenMat({ seed: i + seed * 10, a: palette[i % palette.length], b: palette[(i + 1) % palette.length], c: palette[(i + 2) % palette.length], amp });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(b.x, (b.y || 0) + b.h * (0.45 + R() * 0.35), b.z + b.d / 2 + 0.3);
    g.add(m); mats.push(mat);
  }
  g.userData.tick = (t, beat, k) => mats.forEach((m, i) => tickScreen(m, t, beat, k, i * 13));
  return g;
}
