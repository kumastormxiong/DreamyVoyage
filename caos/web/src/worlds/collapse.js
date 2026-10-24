// 07 数据坍缩（drop 前 5 秒的上扬）：前面所有城市的颜色被拉成一根根光线，从四面八方（360°）冲向中心的一个点，
// 速度、密度随上扬越来越快；16 分音符频闪，最后半小节整个画面被吸进中心并白闪 → 硬切进 drop。
import * as THREE from 'three';
import { col, makeStage, rng, hash, smooth } from '../lib.js';
import { beatAt } from './_glitch.js';
import { fractalSky, speedLines, plasmaShell } from './fx.js';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 75, bg: 0x030206 });
  const N = 1800, R = rng(707);
  const pal = [0xff7a2a, 0xffb347, 0xff4fb0, 0x4ff0ff, 0xd4a94f, 0xb3a0e6, 0xffd28a, 0x2fe0d0, 0xffffff];
  const pos = new Float32Array(N * 6), colA = new Float32Array(N * 6), seeds = [];
  for (let i = 0; i < N; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    seeds.push({ d: new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s), ph: R(), sp: 0.5 + R() });
    const c = col(pal[Math.floor(R() * pal.length)]);
    colA.set([c.r, c.g, c.b, c.r * 0.1, c.g * 0.1, c.b * 0.1], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  lines.frustumCulled = false; scene.add(lines);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, toneMapped: false }));
  scene.add(core);
  // 细节层：背后翻涌的碎形纤维、环绕视线的曲速星流、核心外的等离子球
  const fr = fractalSky({ c1: 0xff7a2a, c2: 0x4ff0ff, shape: 1.0, speed: 0.6, intensity: 0.2 }); scene.add(fr);
  const warp = speedLines({ n: 600, rMin: 3, rMax: 40, depth: 200, len: 24, color: 0xcfe8ff, seed: 71 }); scene.add(warp);
  const plasma = plasmaShell({ radius: 3, color: 0xffd28a, color2: 0x4ff0ff, scale: 1.2 }); scene.add(plasma);

  function update({ t, f, S, tl, post }) {
    const B = beatAt(tl, t), p = S.p, acc = 0.4 + p * p * 6;
    seeds.forEach((s, i) => {
      const r = 60 * (1 - ((s.ph + S.lt * 0.35 * s.sp * acc) % 1));                    // 从远处往中心收
      const len = 2 + p * 22 * s.sp;
      const a = s.d.clone().multiplyScalar(r + 1.5), b = s.d.clone().multiplyScalar(r + 1.5 + len);
      pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    });
    geo.attributes.position.needsUpdate = true;
    camera.position.set(0, 0, 8 - p * 6); camera.lookAt(0, 0, 0);
    camera.rotation.z = p * p * 4;
    core.rotation.set(t * 2, t * 3, 0); core.scale.setScalar(1 + p * 2 + f.kick * 0.5);
    const strobe = (B.b16 % 2 === 0 ? 1 : 0) * p;
    fr.userData.tick(t, camera, 0.15 + p * 0.55);
    warp.userData.tick(t, camera, 0.2 + p * 0.9, f.kick, 40 + p * 200);
    plasma.scale.setScalar(0.5 + p * 1.1 + f.kick * 0.2); plasma.userData.tick(t, f.kick, 0.25 + p * 0.45);
    lines.material.opacity = 0.5 + strobe * 0.5;
    const w = smooth(0.82, 1, p);
    post.s.flash = [w, w, w]; post.s.bloom = 0.5 + p * 0.8; post.s.bloomT = 0.4;
    post.s.ab = 0.004 + p * 0.02; post.s.warp = p * 0.5; post.s.glitch = strobe * 0.4 + Math.pow(f.kick, 2) * 0.3;
    post.s.scan = 0.1; post.s.grain = 0.05;
  }
  return { scene, camera, update };
}
