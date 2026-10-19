// 场景 void：Intro。虚空里浮出幽灵剪影，被铬金属锁链螺旋缠绕，标题 CHAINEDGHOST 故障闪现。
import * as THREE from 'three';
import { PAL, col, JP_FONT, makeStars, makeGrid, makeGhost, glowSprite, textMesh, smooth, clamp, rng } from '../lib.js';
import { makeChain } from '../lib.js';

// 光圈外侧的散开粒子：沿光圈向外渐渐散开并淡出，颜色粉青渐变；关闭深度测试，层叠在剪影之上
const ringDustMat = (c1, c2, a, spread, speed) => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uK: { value: 0 }, uA: { value: a }, uR: { value: 6.6 }, uSpread: { value: spread }, uSpeed: { value: speed }, uC1: { value: col(c1) }, uC2: { value: col(c2) } },
  vertexShader: `
    attribute float aAng; attribute float aSeed;
    uniform float uT,uK,uA,uR,uSpread,uSpeed;
    varying float vA; varying float vS;
    void main(){
      float life=fract(uT*uSpeed+aSeed);
      float ang=aAng+uT*0.1*(0.6+aSeed)+life*0.7;
      float rad=uR*(0.99+0.02*sin(aSeed*31.0))+life*uSpread*(0.5+0.9*aSeed);
      vec2 p=vec2(cos(ang),sin(ang))*rad;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,0.0,1.0);
      float fade=smoothstep(0.0,0.12,life)*pow(1.0-life,1.6);
      float ok=step(5.9,rad);
      vA=uA*fade*ok*(0.55+0.45*sin(uT*2.0+aSeed*40.0))*(1.0+uK*0.4);
      gl_PointSize=(3.0+7.0*aSeed)*(1.0+life*1.8);
      vS=aSeed;
    }`,
  fragmentShader: `
    uniform vec3 uC1,uC2; varying float vA; varying float vS;
    void main(){
      float d=length(gl_PointCoord-0.5);
      float a=smoothstep(0.5,0.0,d); a*=a;
      vec3 c=mix(uC1,uC2,vS);
      gl_FragColor=vec4(c*a*vA*2.6,a*vA);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
});

const makeRingDust = (c1, c2, a, spread, speed, n, seed) => {
  const R = rng(seed);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), ang = new Float32Array(n), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { ang[i] = R() * Math.PI * 2; sd[i] = R(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.Points(g, ringDustMat(c1, c2, a, spread, speed));
  m.frustumCulled = false; m.renderOrder = -2;   // 先于剪影绘制，让剪影的半透明体挡住光圈
  return m;
};

// 3D 光圈材质：暗色金属管身 + 菲涅尔霓虹边缘 + 沿环流动的光带。front=true 的半环在剪影之后绘制（挡住头像），back 的半环在剪影之前绘制（被头像遮住）
const ringMat = (colA, colB, side) => new THREE.ShaderMaterial({
  uniforms: { uA: { value: col(colA) }, uB: { value: col(colB) }, uTime: { value: 0 }, uSide: { value: side } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV; varying vec2 vU; varying float vZ;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vZ = wp.z;
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz);
      vU = uv;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uSide;
    varying vec3 vN; varying vec3 vV; varying vec2 vU; varying float vZ;
    void main(){
      if (uSide * vZ < 0.0) discard;
      float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float edge = pow(fr, 2.2);
      float flow = 0.5 + 0.5 * sin(vU.x * 6.2831 * 10.0 - uTime * 2.4);
      vec3 tint = mix(uA, uB, 0.5 + 0.5 * sin(vU.x * 6.2831 * 2.0 + uTime * 0.6));
      vec3 body = vec3(0.015, 0.0, 0.03);
      vec3 glow = tint * (edge * (1.6 + 1.0 * flow) + 0.18);
      gl_FragColor = vec4(body + glow, 1.0);
    }`,
  transparent: true, depthWrite: true, depthTest: true, toneMapped: false, side: THREE.DoubleSide,
});

// 莫比乌斯环带：扭转半圈、只有一个面的窄带。第二圈在 u=2π 处与第一圈接上，并把 v 翻转
const mobiusGeometry = (R, w, nu = 320, nv = 6) => {
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i < nu; i++) {
    const u = (i / nu) * Math.PI * 2;
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv - 0.5) * w;
      const r = R + v * Math.cos(u / 2);
      pos.push(r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2));
      uvs.push(i / nu, j / nv);
    }
  }
  const vid = (i, j) => (i === nu ? nv - j : i * (nv + 1) + j);   // i === nu 绕回第一圈，v 取反
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j), d = vid(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

// 一整圈光环（莫比乌斯环带）= 后半（renderOrder -1，先画，被剪影盖住）+ 前半（renderOrder 1，后画，盖在剪影上）
const makeRing3D = (R, tube, colA, colB) => {
  const geo = mobiusGeometry(R, tube * 6);
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const back = new THREE.Mesh(geo, ringMat(colA, colB, -1)); back.renderOrder = -1;
  const front = new THREE.Mesh(geo, ringMat(colA, colB, 1)); front.renderOrder = 1;
  g.add(back, front); g.userData.mats = [back.material, front.material];
  return g;
};

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x05010b);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 800);

  scene.add(makeStars(2600, 260, 1.7, 11));
  const grid = makeGrid({ speed: 3, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); grid.material.uniforms.uFog.value = 0.03; scene.add(grid);

  const hor = glowSprite('255,47,143', 140, 0.28); hor.scale.set(1.8, 0.16, 1); hor.position.set(0, 1.2, -70); scene.add(hor);
  const haloC = glowSprite('63,246,255', 22, 0.35); haloC.position.set(-2.5, 6.5, -2); scene.add(haloC);
  const haloP = glowSprite('255,47,143', 26, 0.5); haloP.position.set(2.8, 3.2, -3); scene.add(haloP);

  const ghost = makeGhost(ctx.ghostTex, 9); ghost.position.set(0, 4.9, 0); scene.add(ghost);

  // 两圈 3D 光环：倾斜、绕竖直轴旋转，所以前半会经过头像前面
  const ring = makeRing3D(6.6, 0.075, PAL.magenta, PAL.cyan);
  ring.rotation.x = 0.75; ring.position.set(0, 5.2, 0); scene.add(ring);
  const ring2 = makeRing3D(6.6, 0.075, PAL.cyan, PAL.magenta);
  ring2.rotation.x = -0.95; ring2.position.set(0, 5.2, 0); ring2.scale.setScalar(1.18); scene.add(ring2);
  // 光圈拖影：连续渐变的散开粒子，跟随光圈的位置、朝向与缩放，层叠在剪影之上
  const trails = [
    { m: makeRingDust(PAL.magenta, PAL.cyan, 0.9, 5.0, 0.2, 1600, 7), src: ring },
    { m: makeRingDust(PAL.magenta, PAL.cyan, 0.5, 7.0, 0.13, 1100, 19), src: ring },
    { m: makeRingDust(PAL.cyan, PAL.magenta, 0.8, 5.0, 0.18, 1600, 31), src: ring2 },
    { m: makeRingDust(PAL.cyan, PAL.magenta, 0.4, 7.0, 0.12, 1100, 43), src: ring2 },
  ];
  trails.forEach(({ m }) => scene.add(m));

  const chain = makeChain(260, ctx.env); scene.add(chain.mesh);
  const key = new THREE.DirectionalLight(0xff7ac8, 1.2); key.position.set(-6, 8, 8); scene.add(key);
  scene.add(new THREE.AmbientLight(0x331133, 0.6));

  const title = textMesh('CHAINEDGHOST', 2.5, { font: 'Exo2', italic: true, weight: '800', chrome: true, size: 190, glow: '#ff2f8f', stroke: '#ff2f8f', strokeW: 5, spacing: 22 }, false);
  title.position.set(0, 1.5, 7.5); title.material.color.setScalar(0.8); title.material.depthTest = false; title.renderOrder = 10; scene.add(title);   // 标题始终压在光环之上
  const titleG = title.clone(); titleG.material = title.material.clone(); titleG.material.blending = THREE.AdditiveBlending; titleG.material.opacity = 0.25; titleG.scale.setScalar(1.015); titleG.position.set(0.05, 1.5, 7.45); titleG.material.depthTest = false; titleG.renderOrder = 10; scene.add(titleG);

  const R = rng(5); const dn = 500, dp = new Float32Array(dn * 3), dsp = [];
  for (let i = 0; i < dn; i++) { dp[i * 3] = (R() - 0.5) * 40; dp[i * 3 + 1] = R() * 16; dp[i * 3 + 2] = (R() - 0.5) * 30; dsp.push(0.2 + R() * 0.8); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp.slice(), 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xff9ad8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(dust);

  const hide = (new URLSearchParams(location.search).get('hide') || '').split(',');
  const nameT = textMesh('虚空造物', 0.55, { font: JP_FONT, weight: '900', chrome: true, size: 220, glow: '#ff2f8f', stroke: '#ff2f8f', strokeW: 4, spacing: 36 }, false);
  nameT.position.set(0, 10.1, 1); nameT.material.depthTest = false; nameT.renderOrder = 10; scene.add(nameT);
  const parts = { ghost, chain: chain.mesh, title, titleG, grid, dust, hor, ring, ring2 };
  for (const k of hide) if (parts[k]) parts[k].visible = false;
  function update({ t, f, S, post }) {
    const lt = S.lt;
    camera.position.set(Math.sin(t * 0.21) * 0.9, 2.4 + Math.sin(t * 0.33) * 0.15, 15.5 - smooth(0, 20, lt) * 4.5);
    camera.lookAt(0, 4.3, 0);
    // 标题与名字钉在镜头前方固定位置（镜头推进时大小不变）
    { const fwd = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); camera.getWorldDirection(fwd);
      for (const [m, off, dst] of [[title, -1.95, 7.2], [titleG, -1.95, 7.19], [nameT, -3.0, 7.2]]) { m.quaternion.copy(camera.quaternion); m.position.copy(camera.position).addScaledVector(fwd, dst).addScaledVector(upv, off); } }
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.6;
    const u = ghost.material.uniforms; u.uTime.value = t; u.uGlitch.value = Math.max(f.hit * 0.35, smooth(2.2, 3.2, lt) * (1 - smooth(3.2, 4.0, lt)) * 1.0);
    u.uFade.value = smooth(0.4, 3.0, lt); ghost.position.y = 4.9 + Math.sin(t * 0.8) * 0.18;
    ring.rotation.y = t * 0.45; ring.rotation.x = 0.75 + Math.sin(t * 0.3) * 0.12;
    ring2.rotation.y = -t * 0.3; ring2.rotation.x = -0.95 + Math.sin(t * 0.22 + 1.3) * 0.1;
    ring.scale.setScalar(1 + f.kick * 0.05);
    [ring, ring2].forEach(g => g.userData.mats.forEach(m => { m.uniforms.uTime.value = t; }));
    trails.forEach(({ m, src }) => {
      m.position.copy(src.position); m.rotation.copy(src.rotation); m.scale.copy(src.scale);
      m.material.uniforms.uT.value = t; m.material.uniforms.uK.value = f.kick;
    });
    // 锁链螺旋：随时间长出来
    const grow = smooth(2.0, 12.0, lt); chain.mesh.visible = lt >= 2.0;   // 锁链从 2.0 秒开始出现
    chain.layout((x) => { const a = x * Math.PI * 2 * 3.2 + t * 0.55, r = 3.9 + 0.5 * Math.sin(x * 7 + t * 0.9) + f.kick * 0.15; return new THREE.Vector3(Math.cos(a) * r, 0.0 + x * 11.0, Math.sin(a) * r * 0.75 - 0.5); }, { frac: grow, scale: 0.62 });
    chain.mesh.position.set(0, 0, 0);
    // 标题
    const ta = smooth(3.5, 5.0, lt) * (1 - smooth(17, 19.5, lt)); const fl = (Math.sin(t * 40) > 0.4 && lt < 6.5) ? 0.55 : 1;
    nameT.material.opacity = smooth(5.5, 8.5, lt) * (1 - smooth(14.5, 17.5, lt)); nameT.visible = nameT.material.opacity > 0.01;
    title.material.opacity = ta * fl; titleG.material.opacity = ta * 0.12; title.position.x += (lt < 5.2 ? (Math.sin(t * 90) * 0.12 * (1 - smooth(3.5, 5.2, lt))) : 0); titleG.position.x += 0.04;
    const dpos = dust.geometry.attributes.position; for (let i = 0; i < dn; i++) { dpos.array[i * 3 + 1] = (dp[i * 3 + 1] + t * dsp[i] * 0.6) % 16; } dpos.needsUpdate = true;
    const s = post.s; s.bloom = 0.95 + f.kick * 0.3; s.bloomR = 0.7; s.glitch = Math.max(s.glitch, f.hit * 0.15); s.track = 0.6; s.scan = 0.13; s.ab = 0.0022 + f.hit * 0.002;
  }
  return { scene, camera, update };
}
