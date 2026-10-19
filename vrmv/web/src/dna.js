// 锁链双螺旋（DNA 式结构）：两根真锁链互相缠绕成双螺旋。每一圈的宽度都不一样，
// 并且有一道收缩/扩散的波从下往上传。另外用着色器画流动的光点，用粗的发光光管表示碱基对（横档）。
// 不含任何区块链符号或文字。
import * as THREE from 'three';
import { makeChain, lerp, clamp } from './lib.js';

const turnWidth = (i) => 0.78 + 0.28 * Math.sin(i * 2.37 + 0.8);   // 每一圈的基础宽度各不相同（旧版，其他场景保持不变）
const hashN = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const turnWidthWide = (i) => 0.5 + 1.1 * hashN(i * 3.7 + 1.3);   // wide 模式：每一圈的目标宽度（0.5 ~ 1.6 倍）
// wide 模式的宽度沿螺旋连续过渡（smoothstep 插值），相邻两圈之间没有突变，所以不会出现直角转弯
const wideWidth = (uf) => {
  const i = Math.floor(uf), f = uf - i, s = f * f * (3 - 2 * f);
  return turnWidthWide(i) + (turnWidthWide(i + 1) - turnWidthWide(i)) * s;
};

export function makeDNA(env, { height = 14, radius = 3.4, turns = 2.5, links = 110, spin = 0.5, scale = 0.6, rungs = 18, glowN = 700, wide = false, colorA = 0xe8ecff, colorB = 0xe8ecff, rungGain = 1, rungSat = 1 } = {}) {
  const A = makeChain(links, env, { color: colorA }), B = makeChain(links, env, { color: colorB });
  A.mesh.frustumCulled = false; B.mesh.frustumCulled = false;
  const group = new THREE.Group(); group.add(A.mesh, B.mesh);

  // 螺旋上一点的位置：半径随圈数变化，并且随时间收缩、扩散（wide 模式全部连续，没有突变）
  const point = (u, phase, t, out) => {
    const turnF = u * turns, turn = Math.floor(turnF);
    const breathe = wide ? 1 + 0.3 * Math.sin(t * 1.1 - u * 6.0 + turnF * 1.7) : 1 + 0.16 * Math.sin(t * 1.4 - u * 7.0 + turn * 0.9);
    const sk = wide ? 1 + 0.12 * Math.sin(turnF * 2.3 + (phase > 1 ? 1.9 : 0)) : 1;   // 两根锁链各自的宽度差异
    const r = radius * (wide ? wideWidth(turnF) : turnWidth(turn)) * breathe * sk;
    const a = turnF * Math.PI * 2 + phase + t * spin;
    return (out || new THREE.Vector3()).set(Math.cos(a) * r, lerp(0, height, u), Math.sin(a) * r);
  };

  // 流动光点：沿两根螺旋各布一串点，着色器里做亮度脉冲从下往上传
  const NG = glowN;
  const gpos = new Float32Array(NG * 2 * 3), gu = new Float32Array(NG * 2), gs = new Float32Array(NG * 2);
  for (let i = 0; i < NG; i++) for (let s = 0; s < 2; s++) { const k = i * 2 + s; gu[k] = i / (NG - 1); gs[k] = s; }
  const gGeo = new THREE.BufferGeometry();
  const gPosAttr = new THREE.BufferAttribute(gpos, 3);
  gGeo.setAttribute('position', gPosAttr);
  gGeo.setAttribute('aU', new THREE.BufferAttribute(gu, 1));
  gGeo.setAttribute('aS', new THREE.BufferAttribute(gs, 1));
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uP: { value: 1 }, uSize: { value: 70 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aU; attribute float aS; uniform float uT; uniform float uP; uniform float uSize; varying float vA; varying float vS;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float pulse = 0.5 + 0.5 * sin(uT * 3.0 - aU * 16.0 + aS * 3.1416);
        float on = step(aU, uP);
        gl_PointSize = on * (6.0 + 9.0 * pulse) * (uSize / -mv.z);
        vA = (0.3 + 0.7 * pulse) * on; vS = aS;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d); a *= a;
        vec3 c = mix(vec3(1.0, 0.3, 0.7), vec3(0.3, 0.95, 1.0), vS);
        gl_FragColor = vec4(c * a * vA * 1.8, a * vA);
      }`
  });
  const glow = new THREE.Points(gGeo, gMat); glow.frustumCulled = false; group.add(glow);

  // 碱基对横档：粗的发光光管（InstancedMesh + 着色器）。光管表面有能量脉冲从 A 流向 B，边缘亮、中心略暗
  const rr = 0.19 * Math.max(1, radius / 3.4);   // 横档半径：比之前粗得多，大尺寸时按比例加粗
  const rungGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false);   // 单位高度，沿 Y 轴，之后用矩阵拉伸到两根锁链之间
  const rungMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 0 }, uG: { value: rungGain }, uS: { value: rungSat } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying float vY; varying float vR; varying float vId;
      void main(){
        vY = position.y;
        vR = length(position.xz);
        vId = float(gl_InstanceID);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uT; uniform float uK; uniform float uG; uniform float uS;
      varying float vY; varying float vR; varying float vId;
      float hsh(float n){ return fract(sin(n * 91.7) * 43758.5453); }
      void main(){
        float h = hsh(vId);
        float w = fract(vY + 0.5 - uT * (0.5 + 0.3 * h) + h * 0.7);
        float flow = smoothstep(0.0, 0.18, w) * smoothstep(0.42, 0.18, w);
        float rim = clamp(vR * 2.0, 0.0, 1.0);
        float core = 0.45 + 0.55 * rim;
        vec3 cA = vec3(0.3, 0.95, 1.0), cB = vec3(1.0, 0.3, 0.7);
        vec3 col = mix(cA, cB, clamp(vY + 0.5, 0.0, 1.0));
        float gy = dot(col, vec3(0.299, 0.587, 0.114));
        col = clamp(vec3(gy) + (col - vec3(gy)) * uS, 0.0, 1.0);   // 饱和度：uS > 1 时颜色更鲜艳
        float bright = (0.25 + 0.9 * flow + 0.9 * uK) * core;
        gl_FragColor = vec4(col * bright * 0.9 * uG, 1.0);   // uG：亮度（泛光强度）增益
      }`,
  });
  const rungMesh = new THREE.InstancedMesh(rungGeo, rungMat, rungs);
  rungMesh.frustumCulled = false; group.add(rungMesh);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
  const qUp = new THREE.Vector3(0, 1, 0), quat = new THREE.Quaternion(), mtx = new THREE.Matrix4(), scl = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // prog：0..1 生长进度（锁链从下往上长出来）
  // link：null 为旧的边上升边长横档；0..1 为上升完成后，横档从下往上一个一个依次链接
  function update(t, f = {}, prog = 1, link = null) {
    const p = clamp(prog, 0, 1);
    A.layout((u) => point(u, 0, t), { frac: p, scale, samples: 500 });
    B.layout((u) => point(u, Math.PI, t), { frac: p, scale, samples: 500 });
    gMat.uniforms.uT.value = t; gMat.uniforms.uP.value = p;
    for (let i = 0; i < NG; i++) for (let s = 0; s < 2; s++) {
      const k = i * 2 + s; point(gu[k], s ? Math.PI : 0, t, pa);
      gpos[k * 3] = pa.x; gpos[k * 3 + 1] = pa.y; gpos[k * 3 + 2] = pa.z;
    }
    gPosAttr.needsUpdate = true;
    rungMat.uniforms.uT.value = t; rungMat.uniforms.uK.value = f.kick || 0;
    for (let j = 0; j < rungs; j++) {
      const u = (j + 0.5) / rungs;
      let done = false;
      // 横档在螺旋上升到一半之后才开始长出：从 A 锁链向 B 锁链逐渐伸展，越往上越晚长
      let grow;
      if (link === null) { const gp = clamp((p - (0.5 + 0.45 * u)) / 0.15, 0, 1); grow = gp * gp * (3 - 2 * gp); }
      else { const lp = clamp(link * rungs - j, 0, 1); grow = 1 - Math.pow(1 - lp, 3); }   // 每根横档占一段时间，依次由下往上链接
      if (grow > 0.001) {
        point(u, 0, t, pa); point(u, Math.PI, t, pb);
        dir.subVectors(pb, pa);
        const len = dir.length();
        if (len > 1e-4) {
          dir.divideScalar(len);
          mid.copy(pa).addScaledVector(dir, len * grow * 0.5);
          quat.setFromUnitVectors(qUp, dir);
          scl.set(rr, len * grow, rr);
          mtx.compose(mid, quat, scl);
          done = true;
        }
      }
      rungMesh.setMatrixAt(j, done ? mtx : ZERO);
    }
    rungMesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}
