// 舞台布景：把原 MV 的场景语言搬进万神殿。
//  · floor   舞台地面（不透明，盖住地面伪影）：同心圆 + 频谱环；高速公路段变成滚动霓虹网格，CPU 段变成电路板
//  · tunnel  副歌的光环隧道：一串光环沿歌词墙方向向观众飞来
//  · city    霓虹城市：大厅外圈拔地而起的摩天楼，高度跟频谱
//  · net     神经网络：悬在半空的节点与连线，脉冲沿线流动
//  · debris  悬浮碎片：荒原/重拍时漂浮、被冲击波推开
// 全部由时间 t、频谱和风格参数决定，没有随机数（布局用固定种子）和累积状态。
import * as THREE from 'three';

const ADD = THREE.AdditiveBlending;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createSets({ scene, floorR }) {
  const root = new THREE.Group(); root.name = 'sets'; scene.add(root);
  const tmp = new THREE.Color(), dummy = new THREE.Object3D();

  // ================= 地面 =================
  const spec = new Float32Array(32);
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uKick: { value: 0 }, uGrid: { value: 0 }, uCircuit: { value: 0 }, uYaw: { value: 0 }, uFR: { value: floorR },
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uSpec: { value: spec },
    },
    vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uKick, uGrid, uCircuit, uYaw, uFR; uniform vec3 uA, uB; uniform float uSpec[32]; varying vec2 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float line(float x, float w){ float d = min(fract(x), 1.0 - fract(x)); return 1.0 - smoothstep(0.0, w, d); }
      void main(){
        float r = length(vP), ang = atan(vP.y, vP.x);
        float k = clamp(r / uFR, 0.0, 1.0);
        vec3 col = vec3(0.010, 0.009, 0.020) + vec3(0.03, 0.02, 0.05) * (1.0 - k) * 0.6;
        vec3 cm = mix(uA, uB, k);
        // 同心圆 + 放射线 + 频谱
        float rg = line(r / 2.0, 0.02 + r * 0.0015);
        float sp = line(ang / 6.2831853 * 32.0 + 0.5, 0.035) * smoothstep(2.0, 5.0, r);
        float v = uSpec[int(clamp(r / uFR * 32.0, 0.0, 31.0))];
        float base = 1.0 - max(uGrid, uCircuit) * 0.85;
        col += cm * (rg * 0.22 + sp * 0.07 + v * 0.20 * (0.35 + 0.65 * rg)) * base;
        col += uA * exp(-r * 0.16) * uKick * 0.22 * base;
        // 复古网格：沿歌词墙方向滚动
        vec2 g = vec2(cos(uYaw) * vP.x - sin(uYaw) * vP.y, sin(uYaw) * vP.x + cos(uYaw) * vP.y);
        float gl = max(line(g.x / 1.6, 0.025), line(g.y / 1.6 + uTime * 0.5, 0.025));
        col += mix(uA, uB, 0.5 + 0.5 * sin(g.y * 0.2 + uTime)) * gl * uGrid * (0.35 + v * 0.8) * (1.0 - 0.5 * k);
        // 电路板
        vec2 cp = vP * 0.9; vec2 ci = floor(cp), lc = fract(cp);
        float h = hash(ci), h2 = hash(ci + 17.0);
        float tr = h < 0.5 ? 1.0 - smoothstep(0.0, 0.05, abs(lc.y - 0.5)) : 1.0 - smoothstep(0.0, 0.05, abs(lc.x - 0.5));
        tr *= step(0.35, h2);
        float pad = 1.0 - smoothstep(0.08, 0.13, length(lc - 0.5)); pad *= step(0.8, h2);
        float pulse = step(0.82, fract(h * 13.0 + uTime * (0.4 + h2 * 0.6)));
        col += (mix(uA, uB, h2) * (tr * (0.18 + pulse * 0.9) + pad * 0.8)) * uCircuit * (0.5 + v) * (1.0 - 0.6 * k);
        col *= smoothstep(uFR, uFR - 3.0, r);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR, 128), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.renderOrder = -10; floor.frustumCulled = false; root.add(floor);

  // ================= 光环隧道 =================
  const NR = 40, ringGeo = new THREE.RingGeometry(0.93, 1.0, 72);
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: ADD, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
  const rings = new THREE.InstancedMesh(ringGeo, tunnelMat, NR); rings.frustumCulled = false; rings.renderOrder = 6;
  for (let i = 0; i < NR; i++) rings.setColorAt(i, tmp.setRGB(1, 1, 1));
  const tunnelG = new THREE.Group(); tunnelG.add(rings); root.add(tunnelG);

  // ================= 霓虹城市 =================
  const NC = 96, rc = rng(31);
  const cityLay = [];
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2 + (rc() - 0.5) * 0.05, r = 10.5 + rc() * 7.5;
    cityLay.push({ a, r, w: 0.8 + rc() * 1.4, h: 3 + rc() * 11, band: Math.floor(rc() * 28), ph: rc() * 6.28 });
  }
  const cityGeo = new THREE.BoxGeometry(1, 1, 1); cityGeo.translate(0, 0.5, 0);
  const cityMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
    vertexShader: `
      varying vec3 vW; varying vec3 vL; varying vec3 vCol;
      void main(){
        vL = position;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime, uAmt; varying vec3 vW; varying vec3 vL; varying vec3 vCol;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float edge = max(smoothstep(0.40, 0.5, abs(vL.x)), smoothstep(0.40, 0.5, abs(vL.z)));
        float top = smoothstep(0.97, 1.0, vL.y);
        vec2 cell = vec2((vW.x + vW.z) * 2.0, vW.y * 1.5); vec2 ci = floor(cell), lc = fract(cell);
        float on = step(0.6, hash(ci + floor(uTime * 0.6 * hash(ci.yx))));
        float win = on * step(0.18, lc.x) * step(lc.x, 0.82) * step(0.2, lc.y) * step(lc.y, 0.7);
        float a = (edge * 0.55 + top * 0.9 + win * 0.55) * uAmt;
        gl_FragColor = vec4(vCol * a, a * 0.85);
      }`,
  });
  const city = new THREE.InstancedMesh(cityGeo, cityMat, NC); city.frustumCulled = false; city.renderOrder = 4;
  for (let i = 0; i < NC; i++) city.setColorAt(i, tmp.setRGB(1, 1, 1));
  root.add(city);

  // ================= 神经网络 =================
  const NN = 64, rn = rng(77), nodes = [];
  for (let i = 0; i < NN; i++) {
    const u = rn() * 2 - 1, a = rn() * 6.2831, rr = 5 + rn() * 6, s = Math.sqrt(1 - u * u);
    nodes.push(new THREE.Vector3(Math.cos(a) * s * rr, u * rr * 0.75, Math.sin(a) * s * rr));
  }
  const segs = [], seen = new Set();
  for (let i = 0; i < NN; i++) {
    const d = nodes.map((n, j) => [n.distanceTo(nodes[i]), j]).filter((x) => x[1] !== i).sort((x, y) => x[0] - y[0]).slice(0, 3);
    for (const [, j] of d) { const key = i < j ? i + '_' + j : j + '_' + i; if (!seen.has(key)) { seen.add(key); segs.push([i, j]); } }
  }
  const lp = new Float32Array(segs.length * 6), lt = new Float32Array(segs.length * 2), lph = new Float32Array(segs.length * 2);
  segs.forEach(([i, j], k) => {
    nodes[i].toArray(lp, k * 6); nodes[j].toArray(lp, k * 6 + 3);
    lt[k * 2] = 0; lt[k * 2 + 1] = 1; lph[k * 2] = lph[k * 2 + 1] = rn();
  });
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3)); netGeo.setAttribute('aT', new THREE.BufferAttribute(lt, 1)); netGeo.setAttribute('aPh', new THREE.BufferAttribute(lph, 1));
  const netU = { uTime: { value: 0 }, uAmt: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uKick: { value: 0 } };
  const lineMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD, uniforms: netU,
    vertexShader: `attribute float aT; attribute float aPh; varying float vT; varying float vPh; void main(){ vT = aT; vPh = aPh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uAmt, uKick; uniform vec3 uA, uB; varying float vT; varying float vPh;
      void main(){ float p = fract(uTime * 0.28 + vPh); float d = (vT - p) * 5.0; float pu = exp(-d * d); float a = (0.12 + pu * 1.0 + uKick * 0.25) * uAmt; gl_FragColor = vec4(mix(uA, uB, vPh) * a, a); }`,
  });
  const netLines = new THREE.LineSegments(netGeo, lineMat); netLines.frustumCulled = false;
  const np = new Float32Array(NN * 3); nodes.forEach((n, i) => n.toArray(np, i * 3));
  const nph = new Float32Array(NN); for (let i = 0; i < NN; i++) nph[i] = rn();
  const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(np, 3)); ptGeo.setAttribute('aPh', new THREE.BufferAttribute(nph, 1));
  const ptMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD, uniforms: netU,
    vertexShader: `attribute float aPh; uniform float uTime, uAmt, uKick; varying float vPh; varying float vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vPh = aPh; vP = 0.5 + 0.5 * sin(uTime * 1.6 + aPh * 40.0);
        gl_PointSize = clamp(420.0 / max(-mv.z, 0.5), 2.0, 64.0) * (0.6 + 0.6 * vP + uKick * 0.6) * uAmt; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uA, uB; varying float vPh; varying float vP;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p, p) * 4.0; float a = exp(-d * 4.0); gl_FragColor = vec4(mix(uA, uB, vPh) * a * (0.8 + vP), a); }`,
  });
  const netPts = new THREE.Points(ptGeo, ptMat); netPts.frustumCulled = false;
  const netG = new THREE.Group(); netG.position.y = 7.5; netG.add(netLines, netPts); netG.renderOrder = 6; root.add(netG);

  // ================= 悬浮碎片 =================
  const ND = 150, rd = rng(5), deb = [];
  for (let i = 0; i < ND; i++) deb.push({ a: rd() * 6.2831, r: 4 + rd() * 11, y: 1 + rd() * 13, s: 0.15 + rd() * 0.5, sp: (rd() - 0.5) * 0.25, rx: rd() * 6.28, ry: rd() * 6.28, w: 0.2 + rd(), ph: rd() * 6.28 });
  const debMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: ADD, depthWrite: false, wireframe: true });
  const debris = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), debMat, ND); debris.frustumCulled = false; debris.renderOrder = 5;
  for (let i = 0; i < ND; i++) debris.setColorAt(i, tmp.setRGB(1, 1, 1));
  root.add(debris);

  const white = new THREE.Color(1, 1, 1);
  return {
    root,
    // c: { t, f, spec, style, ev, yaw }
    update(c) {
      const { t, f, style, ev, yaw } = c;
      spec.set(c.spec);
      const U = floorMat.uniforms;
      U.uTime.value = t; U.uKick.value = f.kick; U.uGrid.value = style.grid; U.uCircuit.value = style.circuit; U.uYaw.value = yaw;
      U.uA.value.copy(style.ca); U.uB.value.copy(style.cb);

      // 隧道
      const tw = style.tunnel;
      rings.visible = tw > 0.01;
      if (rings.visible) {
        tunnelG.rotation.y = yaw; tunnelG.position.y = 2.6;
        const speed = 3.2 + 8 * f.low * 0.0, L = NR * 2.8;
        for (let i = 0; i < NR; i++) {
          const z = ((i * 2.8 + t * (4.5 + 0.5 * tw)) % L) - L * 0.72;
          const k = Math.min(1, Math.max(0, 1 - Math.abs(z + 14) / 62));
          const wob = 1 + 0.18 * c.spec[(i * 3) % 32] + 0.06 * Math.sin(t * 1.3 + i);
          dummy.position.set(0, 0, z); dummy.rotation.set(0, 0, t * 0.12 * (i % 2 ? 1 : -1)); dummy.scale.setScalar(5.0 * wob * (0.5 + 0.5 * tw)); dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
          tmp.copy(i % 2 ? style.ca : style.cb).multiplyScalar(k * k * (0.5 + 1.1 * f.kick + 0.6 * f.hit) * tw * 1.2);
          rings.setColorAt(i, tmp);
        }
        rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true;
      }

      // 城市
      const cw = style.city;
      city.visible = cw > 0.01;
      if (city.visible) {
        cityMat.uniforms.uTime.value = t; cityMat.uniforms.uAmt.value = Math.min(1.6, cw * 1.4);
        for (let i = 0; i < NC; i++) {
          const b = cityLay[i], v = c.spec[b.band];
          const g = cw * cw * (3 - 2 * cw);
          dummy.position.set(Math.cos(b.a) * b.r, -0.2, Math.sin(b.a) * b.r); dummy.rotation.set(0, -b.a, 0);
          dummy.scale.set(b.w, Math.max(0.02, b.h * (0.35 + 0.65 * v + 0.12 * Math.sin(t * 0.8 + b.ph)) * g), b.w); dummy.updateMatrix();
          city.setMatrixAt(i, dummy.matrix);
          tmp.copy(style.ca).lerp(style.cb, (i % 7) / 7); city.setColorAt(i, tmp);
        }
        city.instanceMatrix.needsUpdate = true; city.instanceColor.needsUpdate = true;
      }

      // 神经网络
      const nw = style.net;
      netG.visible = nw > 0.01;
      if (netG.visible) {
        netG.rotation.y = t * 0.05; netG.position.y = 7.5 + 0.4 * Math.sin(t * 0.3);
        netU.uTime.value = t; netU.uAmt.value = nw; netU.uKick.value = f.kick; netU.uA.value.copy(style.ca); netU.uB.value.copy(style.cb);
      }

      // 碎片
      const dw = style.debris;
      debris.visible = dw > 0.01;
      if (debris.visible) {
        debMat.opacity = Math.min(0.9, 0.2 + dw * 0.6);
        for (let i = 0; i < ND; i++) {
          const b = deb[i], a = b.a + t * b.sp, r = b.r * (1 + ev.shatter * 0.8);
          dummy.position.set(Math.cos(a) * r, b.y + 0.6 * Math.sin(t * 0.5 + b.ph) + ev.shatter * 2, Math.sin(a) * r);
          dummy.rotation.set(b.rx + t * b.w, b.ry + t * b.w * 0.7, 0); dummy.scale.setScalar(b.s * dw * (1 + f.kick * 0.5)); dummy.updateMatrix();
          debris.setMatrixAt(i, dummy.matrix);
          tmp.copy(style.ca).lerp(style.cb, (i % 5) / 5); debris.setColorAt(i, tmp);
        }
        debris.instanceMatrix.needsUpdate = true; debris.instanceColor.needsUpdate = true;
      }
    },
  };
}
