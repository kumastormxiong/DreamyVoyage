// 场景 neural（218–226 秒）：AI 神经网络球体。冷白与金色的节点、连线构成一颗球形神经网络，
// 光脉冲沿连线传递；中央悬着全息的"魂"字。与前面的场景风格不同：深空、金白、无红蓝。
import * as THREE from 'three';
import { PAL, col, lerp, smooth, makeStars, textMesh, KANJI_FONT, rng } from '../lib.js';

const N = 380, RAD = 11, PN = 170;

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x03030a); scene.fog = new THREE.FogExp2(0x03030a, 0.01);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  scene.add(makeStars(900, 260, 1.2, 9));
  const R = rng(777);

  // 斐波那契球上的节点
  const P = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    P.push(new THREE.Vector3(Math.cos(th) * r * RAD, y * RAD, Math.sin(th) * r * RAD));
  }
  // 连线：每个节点连到最近的 3 个节点（去重）
  const edges = [], seen = new Set();
  for (let i = 0; i < N; i++) {
    const d = [];
    for (let j = 0; j < N; j++) if (j !== i) d.push([P[i].distanceToSquared(P[j]), j]);
    d.sort((a, b) => a[0] - b[0]);
    for (let q = 0; q < 3; q++) {
      const j = d[q][1], key = i < j ? i * N + j : j * N + i;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  const net = new THREE.Group(); scene.add(net);
  const pos = new Float32Array(edges.length * 6);
  edges.forEach(([i, j], e) => { pos.set([P[i].x, P[i].y, P[i].z, P[j].x, P[j].y, P[j].z], e * 6); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  net.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));

  // 节点
  const dummy = new THREE.Object3D();
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
  P.forEach((p, i) => {
    dummy.position.copy(p); dummy.scale.setScalar(1); dummy.updateMatrix(); nodes.setMatrixAt(i, dummy.matrix);
    nodes.setColorAt(i, new THREE.Color(i % 7 === 0 ? PAL.cyan : 0xfff1c2).multiplyScalar(1.1));
  });
  net.add(nodes);

  // 光脉冲：沿连线传递
  const pul = [];
  for (let i = 0; i < PN; i++) pul.push({ e: Math.floor(R() * edges.length), ph: R(), sp: 0.22 + R() * 0.6, dir: R() < 0.5 });
  const pm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), PN);
  for (let i = 0; i < PN; i++) pm.setColorAt(i, new THREE.Color(0xfff6d6).multiplyScalar(1.6));
  net.add(pm);

  // 中央：全息的 魂 字（始终面向镜头）
  // 字体换成科幻风格（SciKanji），并叠加红、蓝两层错位副本，做出光谱移位（RGB split）
  const SCI = '"SciKanji", "HYZhongHeiTi", "STKaiti", sans-serif';
  const kanji = textMesh('魂', 9, { font: SCI, weight: '700', size: 300, fill: '#fff3c4' }, true);
  const kR = textMesh('魂', 9, { font: SCI, weight: '700', size: 300, fill: '#ff2a55' }, true);
  const kB = textMesh('魂', 9, { font: SCI, weight: '700', size: 300, fill: '#27d8ff' }, true);
  // 全息覆盖：不参与深度测试，穿过前方节点仍清晰可读；去掉光晕避免糊成一团
  [kanji, kR, kB].forEach(m => { m.material.depthTest = false; m.renderOrder = 10; });
  const kg = new THREE.Group(); kg.add(kR, kB, kanji);
  scene.add(kg);

  function update({ t, f, S, post }) {
    const e = smooth(0, 1, S.p || 0);
    net.rotation.y = t * 0.06; net.rotation.x = Math.sin(t * 0.2) * 0.15;
    net.scale.setScalar(1 + f.kick * 0.02);
    for (let i = 0; i < PN; i++) {
      const p = pul[i], u0 = (p.ph + t * p.sp) % 1, u = p.dir ? u0 : 1 - u0;
      const [a, b] = edges[p.e], A = P[a], B = P[b];
      dummy.position.set(lerp(A.x, B.x, u), lerp(A.y, B.y, u), lerp(A.z, B.z, u));
      dummy.scale.setScalar(1 + f.kick * 1.2); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix);
    }
    pm.instanceMatrix.needsUpdate = true;
    // 镜头绕球体缓慢旋转并靠近
    const a = t * 0.12, rr = lerp(34, 26, e);
    camera.position.set(Math.cos(a) * rr, 4 + Math.sin(t * 0.3) * 2, Math.sin(a) * rr);
    camera.lookAt(0, 0, 0);
    camera.fov = 50 + f.kick * 1.5; camera.updateProjectionMatrix();
    kg.quaternion.copy(camera.quaternion);
    // 光谱移位：红层向左、蓝层向右错开，随节拍与命中抖动
    const sp = 0.32 + f.kick * 0.12 + f.hit * 0.35, wob = 1 + 0.25 * Math.sin(t * 7.3);
    kR.position.set(-sp * wob, sp * 0.25, 0); kB.position.set(sp * wob, -sp * 0.25, 0);
    const op = (0.5 + 0.12 * Math.sin(t * 4.0)) * (0.9 + f.kick * 0.1);
    kanji.material.opacity = op; kR.material.opacity = op * 0.85; kB.material.opacity = op * 0.85;
    // 3:51（231 秒）起：魂字抖动并加速放大，到场景结束（234 秒）时放大到 2.9 倍，抖动幅度 1.6，让字逼近光球边缘
    const q = Math.min(1, Math.max(0, (t - 231) / 3));
    const grow = 1 + 1.9 * q * q;
    const shk = q * 1.6;
    kg.position.set(Math.sin(t * 61) * shk, Math.cos(t * 47) * shk, 0);
    kg.scale.setScalar((1 + f.kick * 0.04) * grow);
    const s = post.s; s.bloom = 0.22 + f.kick * 0.08; s.glitch = Math.max(s.glitch, f.hit * 0.25); s.ab = 0.002 + f.hit * 0.003; s.track = 0.2; s.scan = 0.1;
  }
  return { scene, camera, update };
}
