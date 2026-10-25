// 舞台：所有音乐内容都发生在万神殿里面。
//  · bars    观众脚边一圈频谱柱（32 频段镜像成 64 根）
//  · pillars 大厅外围一圈直冲穹顶的光柱，亮度跟频段
//  · shocks  每个底鼓从脚下扩散出去的冲击波（地面光环；同一时刻 splatfx 里还有球面冲击波照亮墙壁）
//  · motes   漂浮的光点
//  · rain    假名雨（沿用 MV 的五十音墙）
//  · helix   DNA 双螺旋（沿用 MV 的 dna 段落）
//  · 标题牌  开场与片尾的 CHAINEDGHOST / 虚空造物
// 画面只由时间 t 和预先分析好的音频特征决定，没有 Math.random / 跨帧累积，拖动进度条也不会乱。
import * as THREE from 'three';

const ADD = THREE.AdditiveBlending;
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function boxMat(mode) {
  // mode 0：柱顶最亮（频谱柱）  mode 1：柱底最亮、向上渐隐（光柱）
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uMode: { value: mode } },
    vertexShader: `
      varying float vH; varying vec3 vCol; varying float vFace;
      void main(){
        vH = position.y;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uMode; varying float vH; varying vec3 vCol;
      void main(){
        float g = uMode < 0.5 ? (0.25 + 0.75 * vH) : pow(1.0 - vH, 1.6);
        gl_FragColor = vec4(vCol * g, g * 0.85);
      }`,
  });
}

function billboardGeo(count, attrs) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  g.instanceCount = count;
  for (const [name, [arr, size]] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size));
  return g;
}

export function createStage({ scene, atlas, titleTex, avatarTex }) {
  const root = new THREE.Group(); root.name = 'stage'; scene.add(root);
  const specColor = new THREE.Color(), tmp = new THREE.Color();

  // ---------- 脚下：暗盘 + 光环 ----------
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; disc.renderOrder = 5; root.add(disc);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: ADD, depthWrite: false });
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.66, 1.74, 96), rimMat);
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; rim.renderOrder = 6; root.add(rim);

  // ---------- 频谱柱 ----------
  const NB = 64, barGeo = new THREE.BoxGeometry(1, 1, 1); barGeo.translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, boxMat(0), NB); bars.frustumCulled = false; bars.renderOrder = 8;
  for (let i = 0; i < NB; i++) bars.setColorAt(i, tmp.setRGB(1, 1, 1));
  root.add(bars);
  // ---------- 光柱 ----------
  const NP = 32, pilGeo = new THREE.BoxGeometry(1, 1, 1); pilGeo.translate(0, 0.5, 0);
  const pillars = new THREE.InstancedMesh(pilGeo, boxMat(1), NP); pillars.frustumCulled = false; pillars.renderOrder = 7;
  for (let i = 0; i < NP; i++) pillars.setColorAt(i, tmp.setRGB(1, 1, 1));
  root.add(pillars);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2 + 0.05;
    dummy.position.set(Math.cos(a) * 7.2, -0.5, Math.sin(a) * 7.2); dummy.rotation.set(0, -a, 0); dummy.scale.set(0.24, 32, 0.24); dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
  }

  // ---------- 地面冲击波 ----------
  const RMAX = 30;
  const shocks = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RMAX * 2, RMAX * 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: ADD,
      uniforms: { uR: { value: 0 }, uE: { value: 0 }, uCol: { value: new THREE.Color() } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uR, uE; uniform vec3 uCol; varying vec2 vP;
        void main(){ float d = length(vP); float x = (d - uR) / (0.35 + d * 0.05); float a = exp(-x * x) * uE * smoothstep(1.7, 2.6, d); gl_FragColor = vec4(uCol * a, a); }`,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 9; m.frustumCulled = false; root.add(m); shocks.push(m);
  }

  // ---------- 光点 ----------
  const NM = 1800, r1 = rng(11);
  const seedM = new Float32Array(NM * 4), rndM = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { seedM[i * 4] = r1(); seedM[i * 4 + 1] = r1(); seedM[i * 4 + 2] = r1(); seedM[i * 4 + 3] = r1(); rndM[i] = r1(); }
  const motesMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uTime: { value: 0 }, uHigh: { value: 0 }, uAmt: { value: 0.5 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } },
    vertexShader: `
      attribute vec4 aSeed; attribute float aRnd; uniform float uTime, uHigh, uAmt; uniform vec3 uA, uB;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){
        float ang = aSeed.x * 6.2831 + uTime * (0.03 + aSeed.w * 0.06) * (aSeed.w > 0.5 ? 1.0 : -1.0);
        float rad = 2.2 + aSeed.y * 11.0;
        float y = mod(aSeed.z * 18.0 + uTime * (0.15 + aSeed.w * 0.5), 18.0);
        vec3 c = vec3(cos(ang) * rad, y, sin(ang) * rad);
        c.x += sin(uTime * 0.7 + aSeed.z * 40.0) * 0.25; c.z += cos(uTime * 0.6 + aSeed.y * 30.0) * 0.25;
        float vis = clamp((uAmt - aRnd) * 6.0, 0.0, 1.0);
        float size = (0.04 + aSeed.w * 0.07) * (1.0 + uHigh * 1.6) * vis;
        vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * size * 2.0;
        vUv = uv; vCol = mix(uA, uB, aSeed.w);
        vA = (0.45 + 0.55 * sin(uTime * 2.0 + aSeed.x * 40.0)) * smoothstep(0.0, 1.5, y) * smoothstep(18.0, 14.0, y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){ vec2 p = vUv - 0.5; float d = dot(p, p) * 4.0; float a = exp(-d * 3.5) * vA; gl_FragColor = vec4(vCol * a * 1.6, a); }`,
  });
  const motes = new THREE.Mesh(billboardGeo(NM, { aSeed: [seedM, 4], aRnd: [rndM, 1] }), motesMat);
  motes.frustumCulled = false; motes.renderOrder = 10; root.add(motes);

  // ---------- 假名雨 ----------
  const COLS = 110, TRAIL = 14, NR = COLS * TRAIL, r2 = rng(23);
  const seedR = new Float32Array(NR * 4), jR = new Float32Array(NR), idR = new Float32Array(NR), rndR = new Float32Array(NR);
  for (let c = 0; c < COLS; c++) {
    const a = r2() * Math.PI * 2, rad = 4.6 + r2() * 4.4, sp = 1.6 + r2() * 3.2, ph = r2() * 40, id = r2() * 1000, rnd = r2();
    for (let j = 0; j < TRAIL; j++) { const i = c * TRAIL + j; seedR.set([a, rad, sp, ph], i * 4); jR[i] = j; idR[i] = id + j * 3.7; rndR[i] = rnd; }
  }
  const rainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uHigh: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
      uAtlas: { value: atlas.tex }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uCount: { value: atlas.count } },
    vertexShader: `
      attribute vec4 aSeed; attribute float aJ; attribute float aId; attribute float aRnd;
      uniform float uTime, uAmt, uHigh, uCount; uniform vec2 uGrid; uniform vec3 uA, uB;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      float h11(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
      void main(){
        float H = 16.0;
        float yh = H - mod(aSeed.w + uTime * aSeed.z, H + 10.0);
        float y = yh + aJ * 0.55;
        vec3 right = vec3(-sin(aSeed.x), 0.0, cos(aSeed.x));
        vec3 c = vec3(cos(aSeed.x) * aSeed.y, y, sin(aSeed.x) * aSeed.y);
        float cell = floor(h11(aId + floor(uTime * 2.5 + aJ * 1.7)) * uCount);
        float cc = mod(cell, uGrid.x), rr = floor(cell / uGrid.x);
        vUv = vec2((cc + uv.x) / uGrid.x, 1.0 - (rr + 1.0 - uv.y) / uGrid.y);
        float vis = clamp((uAmt - aRnd) * 6.0, 0.0, 1.0);
        float s = 0.36 * vis;
        vec3 wp = c + right * position.x * s + vec3(0.0, 1.0, 0.0) * position.y * s;
        float tail = pow(1.0 - aJ / 14.0, 1.6);
        vCol = aJ < 0.5 ? vec3(1.0) : mix(uA, uB, aRnd);
        vA = tail * smoothstep(0.0, 1.5, y) * smoothstep(H + 1.0, H - 3.0, y) * (0.55 + uHigh * 0.9);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){ vec2 t = texture2D(uAtlas, vUv).rg; float a = max(t.r, t.g * 0.3); gl_FragColor = vec4(vCol * (0.4 + t.r), a * vA); }`,
  });
  const rain = new THREE.Mesh(billboardGeo(NR, { aSeed: [seedR, 4], aJ: [jR, 1], aId: [idR, 1], aRnd: [rndR, 1] }), rainMat);
  rain.frustumCulled = false; rain.renderOrder = 11; root.add(rain);

  // ---------- DNA 螺旋 ----------
  const NS = 520, NRUNG = 90, SUB = 6, NH = NS * 2 + NRUNG * SUB;
  const kindH = new Float32Array(NH * 3);
  let hi = 0;
  for (let st = 0; st < 2; st++) for (let i = 0; i < NS; i++, hi++) kindH.set([0, i / NS, st], hi * 3);
  for (let r = 0; r < NRUNG; r++) for (let s = 0; s < SUB; s++, hi++) kindH.set([1, r / NRUNG, s / (SUB - 1)], hi * 3);
  const helixMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: ADD,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uMid: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } },
    vertexShader: `
      attribute vec3 aK; uniform float uTime, uAmt, uMid; uniform vec3 uA, uB;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      vec3 strand(float s, float id){ float a = s * 31.4159 + uTime * 0.45 + id * 3.14159; return vec3(cos(a) * 2.7, s * 32.0 - 1.5, sin(a) * 2.7); }
      void main(){
        vec3 c; float size; float pulse = 0.5 + 0.5 * sin(aK.y * 70.0 - uTime * 3.0);
        if (aK.x < 0.5) { c = strand(aK.y, aK.z); size = 0.11 * (1.0 + pulse * uMid * 1.2); vCol = mix(uA, uB, aK.z); }
        else { c = mix(strand(aK.y, 0.0), strand(aK.y, 1.0), aK.z); size = 0.055; vCol = mix(uB, uA, aK.z); }
        vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * size * 2.0 * uAmt;
        vUv = uv; vA = 0.5 + 0.7 * pulse * (0.4 + uMid);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){ vec2 p = vUv - 0.5; float a = exp(-dot(p, p) * 14.0) * vA; gl_FragColor = vec4(vCol * a * 1.5, a); }`,
  });
  const helix = new THREE.Mesh(billboardGeo(NH, { aK: [kindH, 3] }), helixMat);
  helix.frustumCulled = false; helix.renderOrder = 10; root.add(helix);

  // ---------- 标题牌 ----------
  const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, blending: ADD, depthWrite: false, opacity: 0 });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), titleMat); title.renderOrder = 22; title.frustumCulled = false; root.add(title);
  const avMat = new THREE.MeshBasicMaterial({ map: avatarTex, transparent: true, depthWrite: false, opacity: 0 });
  const avatar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), avMat); avatar.renderOrder = 22; avatar.frustumCulled = false; root.add(avatar);
  const place = (m, th, R, y) => { m.position.set(Math.cos(th) * R, y, Math.sin(th) * R); m.lookAt(0, y, 0); };

  const bandCol = (b, style, k) => tmp.copy(style.ca).lerp(style.cb, b / 31).multiplyScalar(k);

  return {
    root,
    // c: { t, dur, f, spec, style, ages, theta, xr }
    update(c) {
      const { t, f, spec, style } = c;
      // 脚下光环
      rimMat.color.copy(style.ca).lerp(style.cb, 0.5).multiplyScalar(0.55 + f.kick * 0.9);
      // 频谱柱
      for (let i = 0; i < NB; i++) {
        const b = i < 32 ? i : 63 - i, v = spec[b];
        const a = (i / NB) * Math.PI * 2, R = 3.6;
        dummy.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); dummy.rotation.set(0, -a, 0);
        dummy.scale.set(0.09, 0.05 + v * 1.3 * style.bars, 0.09); dummy.updateMatrix(); bars.setMatrixAt(i, dummy.matrix);
        bars.setColorAt(i, bandCol(b, style, 0.3 + v * 0.75));
      }
      bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true;
      // 光柱
      for (let i = 0; i < NP; i++) {
        const b = Math.min(31, Math.floor(i * 32 / NP)), v = spec[b];
        pillars.setColorAt(i, bandCol(b, style, (0.03 + v * 0.6) * style.pillars + f.hit * 0.15 * style.flash));
      }
      pillars.instanceColor.needsUpdate = true;
      // 冲击波
      for (let j = 0; j < 3; j++) {
        const age = c.ages[j], m = shocks[j];
        m.visible = age < 3.2 && style.shock > 0.02;
        if (m.visible) { m.material.uniforms.uR.value = age * 11; m.material.uniforms.uE.value = Math.exp(-age * 1.25) * (0.3 + 0.7 * style.shock) * 0.9; m.material.uniforms.uCol.value.copy(style.ca).lerp(style.cb, j / 3); }
      }
      // 光点 / 假名雨 / 螺旋
      const mu = motesMat.uniforms; mu.uTime.value = t; mu.uHigh.value = f.high; mu.uAmt.value = style.motes; mu.uA.value.copy(style.ca); mu.uB.value.copy(style.cb);
      const ru = rainMat.uniforms; ru.uTime.value = t; ru.uAmt.value = style.rain; ru.uHigh.value = f.high; ru.uA.value.copy(style.ca); ru.uB.value.copy(style.cb);
      rain.visible = style.rain > 0.01;
      const hu = helixMat.uniforms; hu.uTime.value = t; hu.uAmt.value = style.helix; hu.uMid.value = f.mid; hu.uA.value.copy(style.ca); hu.uB.value.copy(style.cb);
      helix.visible = style.helix > 0.01;
      // 标题牌：开场 1.2–14 秒、片尾最后 5.5 秒
      const a1 = sm((t - 1.2) / 2) * (1 - sm((t - 12.5) / 3)), a2 = sm((t - (c.dur - 5.6)) / 1.2);
      const ta = Math.max(a1, a2);
      titleMat.opacity = ta; avMat.opacity = ta; title.visible = avatar.visible = ta > 0.01;
      place(title, c.theta, 5.2, 3.0); place(avatar, c.theta, 5.2, 4.3);
    },
  };
}
