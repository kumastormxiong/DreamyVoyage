// 炫酷着色器库（所有场景共用）。全部是纯 t / 拍子的函数，无随机、无累积状态。
//   fogSheets   体积雾片：多层 fbm 噪声大平面，跟随相机，可加色（霓虹雾）或普通混合（阴霾）
//   aurora      极光幕：弯曲的光帘，边缘起伏 + 竖向射线 + 三色渐变
//   shockRing   冲击波：地面扩散的环 + 六角网格尾迹
//   plasmaShell 等离子球壳：菲涅尔 + 域扭曲噪声 + 亮脉络
//   lightning   闪电：中点位移 + 分叉，每次落雷重算顶点（由 seed 决定，可复现）
//   speedLines  速度线 / 曲速星流：绕视线的径向线束，随相机走
//   ripples     雨滴涟漪：湿地面上随机出现的同心环
//   motes       浮尘 / 火星 / 萤光：循环上升的点精灵
//   fractalSky  碎形天空：折叠距离场的辉光步进，穿行在发光的纤维里
import * as THREE from 'three';
import { col, rng, hash } from '../lib.js';

export const NOISE = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn3(p); p = p * 2.02 + vec3(7.1, 3.3, 5.7); a *= 0.5; } return s; }
`;

const ADD = { transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending };

// ---------------------------------------------------------------- 体积雾片
export function fogSheets({ n = 6, size = 900, y0 = 2, y1 = 60, color = 0x40608a, density = 0.5, scale = 0.012, speed = 0.015, seed = 1, additive = false } = {}) {
  const g = new THREE.Group(), items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uT: { value: 0 }, uC: { value: col(color) }, uD: { value: density }, uS: { value: scale * (0.8 + 0.5 * hash(i + seed)) }, uSp: { value: speed * (i % 2 ? 1 : -1) },
        uOff: { value: new THREE.Vector2(hash(i * 3 + seed) * 100, hash(i * 5 + seed) * 100) }, uK: { value: 0 }, uR: { value: size * 0.5 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE + `uniform float uT,uD,uS,uSp,uK,uR; uniform vec3 uC; uniform vec2 uOff; varying vec3 vW;
        void main(){
          vec2 q = vW.xz * uS + uOff + vec2(uT * uSp, uT * uSp * 0.6);
          float n = smoothstep(0.34, 0.82, fbm(q));
          float dist = length(vW.xz - cameraPosition.xz);
          float fade = (1.0 - smoothstep(uR * 0.3, uR, dist)) * smoothstep(0.0, 9.0, abs(cameraPosition.y - vW.y));
          gl_FragColor = vec4(uC, n * uD * fade * (1.0 + uK));
        }`
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m);
    mesh.position.y = n > 1 ? y0 + (y1 - y0) * i / (n - 1) : y0; mesh.renderOrder = 5; mesh.frustumCulled = false;
    g.add(mesh); items.push(mesh);
  }
  g.userData.tick = (t, camera, k = 0) => items.forEach((m) => { m.material.uniforms.uT.value = t; m.material.uniforms.uK.value = k; if (camera) { m.position.x = camera.position.x; m.position.z = camera.position.z; } });
  return g;
}

// ---------------------------------------------------------------- 极光幕
export function aurora({ radius = 700, height = 320, y = 20, center = Math.PI, span = 2.0, colors = [0x38ffb0, 0x3a7aff, 0xd040ff], layers = 3, seed = 1, intensity = 1 } = {}) {
  const g = new THREE.Group(), mats = [];
  for (let i = 0; i < layers; i++) {
    const m = new THREE.ShaderMaterial({
      ...ADD, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uI: { value: intensity }, uSeed: { value: seed * 7.3 + i * 11.1 }, uC1: { value: col(colors[0]) }, uC2: { value: col(colors[1]) }, uC3: { value: col(colors[2]) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: NOISE + `uniform float uT,uK,uI,uSeed; uniform vec3 uC1,uC2,uC3; varying vec2 vUv;
        void main(){
          float x = vUv.x * 9.0;
          float w = fbm(vec2(x * 0.55 + uSeed, uT * 0.05));
          float w2 = fbm(vec2(x * 1.6 - uT * 0.08, uSeed * 3.0 + uT * 0.03));
          float lo = 0.16 + 0.24 * w, y = vUv.y;
          float body = smoothstep(lo - 0.02, lo + 0.05, y) * exp(-max(y - lo, 0.0) * 3.0);
          float rays = 0.4 + 0.6 * vn(vec2(x * 26.0 + w * 7.0, uT * 0.18));
          rays *= 0.6 + 0.4 * vn(vec2(x * 6.0, y * 4.0 + uT * 0.2));
          float a = body * rays * (0.5 + 0.8 * w2) * (1.0 + uK * 0.8);
          vec3 c = mix(uC1, uC2, smoothstep(lo, lo + 0.35, y)); c = mix(c, uC3, smoothstep(lo + 0.25, lo + 0.85, y));
          float edge = smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
          gl_FragColor = vec4(c * a * edge * uI, 1.0);
        }`
    });
    const geo = new THREE.CylinderGeometry(radius - i * 40, radius - i * 40, height * (1 - i * 0.12), 160, 1, true, center - span / 2 + i * 0.12, span);
    const mesh = new THREE.Mesh(geo, m); mesh.position.y = y + i * 10; mesh.renderOrder = -5; mesh.frustumCulled = false;
    g.add(mesh); mats.push(m);
  }
  g.userData.tick = (t, k = 0, I) => mats.forEach((m, i) => { m.uniforms.uT.value = t * (1 + i * 0.15); m.uniforms.uK.value = k; if (I != null) m.uniforms.uI.value = I; });
  return g;
}

// ---------------------------------------------------------------- 冲击波
export function shockRing({ color = 0xffffff, color2 = 0x40a0ff, size = 700, hex = 3.2 } = {}) {
  const m = new THREE.ShaderMaterial({
    ...ADD, side: THREE.DoubleSide,
    uniforms: { uR: { value: 0 }, uW: { value: 4 }, uA: { value: 0 }, uT: { value: 0 }, uSize: { value: size }, uHex: { value: hex }, uC1: { value: col(color) }, uC2: { value: col(color2) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `uniform float uR,uW,uA,uT,uSize,uHex; uniform vec3 uC1,uC2; varying vec2 vUv;
      float hexd(vec2 p){ p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
      void main(){
        vec2 p = (vUv - 0.5) * uSize; float r = length(p); float ang = atan(p.y, p.x);
        float jag = uW * 0.7 * (vn(vec2(ang * 5.0, uT * 2.0)) - 0.5);
        float d = r - uR + jag;
        float ring = exp(-d * d / (uW * uW));
        float inside = 1.0 - step(0.0, d);
        float wake = inside * exp(min(d, 0.0) / (uR * 0.3 + 6.0));
        vec2 q = p / uHex; vec2 s = vec2(1.0, 1.7320508);
        vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
        vec2 gv = dot(a, a) < dot(b, b) ? a : b;
        float edge = 1.0 - smoothstep(0.0, 0.07, 0.5 - hexd(gv));
        float cell = h21(floor(q * 0.5) + floor(uT * 3.0));
        float v = ring * 1.6 + wake * (edge * 0.9 + 0.05 + 0.25 * step(0.9, cell) * edge);
        vec3 c = mix(uC2, uC1, clamp(ring + wake * 0.3, 0.0, 1.0));
        float far = 1.0 - smoothstep(uSize * 0.25, uSize * 0.5, r);
        gl_FragColor = vec4(c * v * uA * far, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m); mesh.frustumCulled = false; mesh.renderOrder = 4;
  mesh.userData.set = (r, a, w = 4, t = 0) => { m.uniforms.uR.value = r; m.uniforms.uA.value = a; m.uniforms.uW.value = w; m.uniforms.uT.value = t; mesh.visible = a > 0.002; };
  return mesh;
}

// ---------------------------------------------------------------- 等离子球壳
export function plasmaShell({ radius = 3, color = 0x3ff6ff, color2 = 0xff2f8f, detail = 5, scale = 1.1 } = {}) {
  const m = new THREE.ShaderMaterial({
    ...ADD,
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uI: { value: 1 }, uScale: { value: scale / radius * 2.5 }, uC1: { value: col(color) }, uC2: { value: col(color2) } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: NOISE + `uniform float uT,uK,uI,uScale; uniform vec3 uC1,uC2; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 N = normalize(vN), V = normalize(vV);
        float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
        float f2 = fres * fres;
        vec3 q = vP * uScale + vec3(0.0, uT * 0.4, 0.0);
        float n = fbm3(q + fbm3(q * 1.7 + uT * 0.2) * 1.5);
        float vein = 1.0 - smoothstep(0.0, 0.07, abs(n - 0.5));
        vec3 c = mix(uC1, uC2, n);
        vec3 o = c * (f2 * 1.6 + 0.12) + uC2 * vein * (1.5 + uK * 3.0) + uC1 * uK * 0.35;
        gl_FragColor = vec4(o * uI, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), m); mesh.frustumCulled = false;
  mesh.userData.tick = (t, k = 0, I = 1) => { m.uniforms.uT.value = t; m.uniforms.uK.value = k; m.uniforms.uI.value = I; };
  return mesh;
}

// ---------------------------------------------------------------- 闪电
export function lightning({ n = 4, color = 0xbfd8ff, maxSeg = 420 } = {}) {
  const g = new THREE.Group(), bolts = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(maxSeg * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, 0);
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.frustumCulled = false; g.add(m); bolts.push({ m, geo, pos });
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  g.userData.bolt = (i, from, to, seed, alpha = 1, jag = 0.2, branch = 0.3) => {
    const b = bolts[i];
    if (alpha <= 0.002) { b.m.material.opacity = 0; b.geo.setDrawRange(0, 0); return; }
    let c = 0; const pos = b.pos;
    const push = (a, e) => { if (c >= maxSeg) return; const o = c * 6; pos[o] = a.x; pos[o + 1] = a.y; pos[o + 2] = a.z; pos[o + 3] = e.x; pos[o + 4] = e.y; pos[o + 5] = e.z; c++; };
    const rec = (a, e, disp, depth, sd) => {
      if (depth === 0) { push(a, e); return; }
      const mid = tmpA.copy(a).add(e).multiplyScalar(0.5).clone();
      const dir = tmpB.copy(e).sub(a).clone(); const len = dir.length();
      const off = new THREE.Vector3(hash(sd * 1.1) - 0.5, hash(sd * 2.3) - 0.5, hash(sd * 3.7) - 0.5).cross(dir);
      if (off.lengthSq() > 1e-6) off.normalize().multiplyScalar(disp * len * (hash(sd * 5.1) + 0.2));
      mid.add(off);
      rec(a, mid, disp * 0.55, depth - 1, sd * 2 + 1); rec(mid, e, disp * 0.55, depth - 1, sd * 2 + 2);
      if (depth >= 3 && hash(sd * 7.7) < branch) { const end = mid.clone().addScaledVector(dir, 0.45).addScaledVector(off, 3); rec(mid, end, disp * 0.6, depth - 2, sd * 3 + 5); }
    };
    rec(from, to, jag, 6, (seed % 997) * 1.37 + 1);
    b.geo.setDrawRange(0, c * 2); b.geo.attributes.position.needsUpdate = true; b.m.material.opacity = alpha;
  };
  return g;
}

// ---------------------------------------------------------------- 速度线 / 曲速星流
export function speedLines({ n = 520, rMin = 5, rMax = 44, depth = 240, len = 18, color = 0xaaddff, seed = 3 } = {}) {
  const R = rng(seed), pos = new Float32Array(n * 6), at = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = rMin + Math.pow(R(), 0.65) * (rMax - rMin), x = Math.cos(a) * r, y = Math.sin(a) * r * 0.7, ph = R(), sp = 0.5 + R();
    pos.set([x, y, 0, x, y, 0], i * 6); at.set([0, ph, sp, 1, ph, sp], i * 6);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aA', new THREE.BufferAttribute(at, 3));
  const m = new THREE.ShaderMaterial({
    ...ADD, uniforms: { uT: { value: 0 }, uI: { value: 0 }, uK: { value: 0 }, uSpeed: { value: 60 }, uDepth: { value: depth }, uLen: { value: len }, uC: { value: col(color) } },
    vertexShader: `attribute vec3 aA; uniform float uT,uK,uSpeed,uDepth,uLen; varying float vA;
      void main(){ float travel = mod(aA.y * uDepth + uT * aA.z * uSpeed, uDepth); float z = -uDepth + travel;
        z -= aA.x * uLen * (0.4 + aA.z) * (1.0 + uK * 2.0);
        vA = smoothstep(-uDepth, -uDepth * 0.75, z) * (1.0 - smoothstep(-8.0, 1.0, z)) * (1.0 - aA.x * 0.85);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, z, 1.0); }`,
    fragmentShader: 'uniform float uI; uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC * vA * uI, 1.0); }'
  });
  const mesh = new THREE.LineSegments(geo, m); mesh.frustumCulled = false;
  mesh.userData.tick = (t, camera, I = 1, k = 0, speed = 60) => { m.uniforms.uT.value = t; m.uniforms.uI.value = I; m.uniforms.uK.value = k; m.uniforms.uSpeed.value = speed; mesh.visible = I > 0.002; if (camera) { mesh.position.copy(camera.position); mesh.quaternion.copy(camera.quaternion); } };
  return mesh;
}

// ---------------------------------------------------------------- 雨滴涟漪
export function ripples({ size = 360, y = 0.08, color = 0xbfe8ff, cell = 2.6 } = {}) {
  const m = new THREE.ShaderMaterial({
    ...ADD,
    uniforms: { uT: { value: 0 }, uI: { value: 1 }, uCell: { value: cell }, uC: { value: col(color) }, uR: { value: size * 0.5 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: NOISE + `uniform float uT,uI,uCell,uR; uniform vec3 uC; varying vec3 vW;
      float layer(vec2 p, float cs, float sd){
        vec2 id = floor(p / cs), f = fract(p / cs) - 0.5; float h = h21(id + sd);
        float ph = fract(uT * (0.45 + 0.4 * h) + h * 7.0);
        vec2 off = (vec2(h21(id + sd + 2.1), h21(id + sd + 5.9)) - 0.5) * 0.5;
        float d = length(f - off), r = ph * 0.55;
        float ring = exp(-(d - r) * (d - r) * 420.0) * (1.0 - ph) * step(0.4, h21(id + sd + 13.7));
        return ring;
      }
      void main(){
        vec2 p = vW.xz; float dist = length(vW.xz - cameraPosition.xz);
        float v = layer(p, uCell, 0.0) + layer(p + 17.0, uCell * 1.7, 5.0) * 0.8;
        gl_FragColor = vec4(uC * v * uI * (1.0 - smoothstep(10.0, uR, dist)), 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m); mesh.position.y = y; mesh.frustumCulled = false; mesh.renderOrder = 3;
  mesh.userData.tick = (t, camera, I = 1) => { m.uniforms.uT.value = t; m.uniforms.uI.value = I; if (camera) { mesh.position.x = camera.position.x; mesh.position.z = camera.position.z; } };
  return mesh;
}

// ---------------------------------------------------------------- 浮尘 / 火星 / 萤光
export function motes({ n = 600, box = [200, 80, 200], center = [0, 0, 0], color = 0xffd890, size = 3, rise = 2, sway = 3, seed = 9, follow = false } = {}) {
  const R = rng(seed), pos = new Float32Array(n * 3), rr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos.set([R() * box[0], R() * box[1], R() * box[2]], i * 3); rr.set([R(), R(), R()], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aR', new THREE.BufferAttribute(rr, 3));
  const m = new THREE.ShaderMaterial({
    ...ADD, uniforms: { uT: { value: 0 }, uI: { value: 1 }, uBox: { value: new THREE.Vector3(...box) }, uCenter: { value: new THREE.Vector3(...center) }, uRise: { value: rise }, uSway: { value: sway }, uSize: { value: size }, uC: { value: col(color) } },
    vertexShader: `attribute vec3 aR; uniform float uT,uRise,uSway,uSize; uniform vec3 uBox,uCenter; varying float vTw; varying float vF;
      void main(){ vec3 p = position; p.y = mod(position.y + uT * uRise * (0.4 + aR.x), uBox.y);
        p.x += sin(uT * 0.4 + aR.y * 6.2831) * uSway; p.z += cos(uT * 0.35 + aR.z * 6.2831) * uSway;
        p += uCenter - vec3(uBox.x, 0.0, uBox.z) * 0.5;
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uSize * (260.0 / max(-mv.z, 1.0)) * (0.5 + aR.x), 1.0, 14.0);
        vTw = 0.55 + 0.45 * sin(uT * (1.0 + aR.z * 3.0) + aR.y * 20.0);
        vF = smoothstep(0.0, 0.12, p.y / uBox.y) * (1.0 - smoothstep(0.8, 1.0, p.y / uBox.y)) * (1.0 - smoothstep(60.0, 260.0, -mv.z)) * smoothstep(3.0, 16.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform float uI; uniform vec3 uC; varying float vTw; varying float vF; void main(){ float d = length(gl_PointCoord - 0.5); float a = 1.0 - smoothstep(0.0, 0.5, d); a *= a; gl_FragColor = vec4(uC * a * vTw * vF * uI, 1.0); }'
  });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false;
  pts.userData.tick = (t, I = 1, camera) => { m.uniforms.uT.value = t; m.uniforms.uI.value = I; if (follow && camera) m.uniforms.uCenter.value.set(camera.position.x, center[1], camera.position.z); };
  return pts;
}

// ---------------------------------------------------------------- 碎形天空
export function fractalSky({ c1 = 0xff3fa4, c2 = 0x3ff0ff, shape = 1.0, speed = 0.4, intensity = 0.6 } = {}) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uI: { value: intensity }, uShape: { value: shape }, uSpeed: { value: speed }, uC1: { value: col(c1) }, uC2: { value: col(c2) }, uO: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT,uI,uShape,uSpeed; uniform vec3 uC1,uC2,uO; varying vec3 vD;
      float de(vec3 p){
        float s = 1.0; float ca = cos(uT * 0.05 + 0.6), sa = sin(uT * 0.05 + 0.6);
        for (int i = 0; i < 5; i++) {
          p = abs(p) - vec3(0.9, 0.75, 0.6) * uShape;
          p.xy = mat2(ca, -sa, sa, ca) * p.xy; p.yz = mat2(ca, sa, -sa, ca) * p.yz;
          p *= 1.35; s *= 1.35;
        }
        return (length(p.xy) - 0.12) / s;
      }
      void main(){
        vec3 rd = normalize(vD); vec3 ro = uO * 0.02 + vec3(0.0, 0.0, uT * uSpeed);
        float tt = 0.4; vec3 acc = vec3(0.0);
        for (int i = 0; i < 56; i++) {
          vec3 p = ro + rd * tt; float d = de(p);
          float g = 0.012 / (0.01 + abs(d) * 7.0);
          acc += mix(uC1, uC2, 0.5 + 0.5 * sin(tt * 0.9 + uT * 0.25)) * g * exp(-tt * 0.07);
          tt += max(abs(d) * 0.75, 0.035);
        }
        gl_FragColor = vec4(acc * uI * 0.35, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), m); mesh.renderOrder = -90; mesh.frustumCulled = false;
  mesh.userData.tick = (t, camera, I) => { m.uniforms.uT.value = t; if (I != null) m.uniforms.uI.value = I; if (camera) { mesh.position.copy(camera.position); m.uniforms.uO.value.copy(camera.position); } };
  return mesh;
}
