// 场景 hit：间奏「オ オ オ」。三记重击：巨大的オ砸屏，放射光芒、冲击环、飞散的锁链碎片，全屏故障与像素化。
import * as THREE from 'three';
import { PAL, col, KANA, makeChain, glyphMesh, glyphGeo, glowSprite, smooth, clamp, rng } from '../lib.js';

const STARTS0 = [0.15, 1.35, 2.55];     // 三个「オ」砸下的时间（相对本段起点，秒）

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x05000b);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 300); camera.position.set(0, 0, 16);
  scene.add(new THREE.AmbientLight(0x664466, 0.8));

  const rays = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uE: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uT,uE;varying vec2 vUv;
      void main(){ vec2 p=(vUv-0.5)*vec2(1.75,1.0); float a=atan(p.y,p.x), d=length(p);
        float r1=smoothstep(0.35,0.65,sin(a*26.0+uT*0.8)*0.5+0.5), r2=smoothstep(0.4,0.7,sin(a*13.0-uT*0.5+1.0)*0.5+0.5);
        vec3 c=mix(vec3(1.0,0.15,0.55)*r1, vec3(0.15,0.95,1.0)*r2, 0.5)*(0.3+uE*0.8);
        float fade=smoothstep(0.9,0.05,d)*(0.35+0.65*smoothstep(0.0,0.5,d)); gl_FragColor=vec4(c*fade,1.0);}`
  })); rays.position.z = -10; scene.add(rays);

  const O = glyphMesh(ctx.atlasF, 'オ', 0xffd2ec, 14, 1), Op = glyphMesh(ctx.atlasF, 'オ', PAL.pink, 14, 0.4), Oc = glyphMesh(ctx.atlasF, 'オ', PAL.cyan, 14, 0.35), Oo = glyphMesh(ctx.atlasO, 'オ', PAL.yellow, 14, 0.8);
  scene.add(Op, Oc, O, Oo);
  const rings = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 140), new THREE.MeshBasicMaterial({ color: i % 2 ? PAL.cyan : PAL.pink, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false })); m.position.z = -1; scene.add(m); return m; });

  // 锁链碎片
  const NS = 90, geo = new THREE.TorusGeometry(0.5, 0.125, 10, 20); geo.scale(0.78, 1.5, 0.78);
  const shards = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xe8ecff, metalness: 1, roughness: 0.15, envMap: ctx.env, envMapIntensity: 1.0 }), NS); shards.frustumCulled = false; scene.add(shards);
  const R = rng(2), dirs = [], tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < NS; i++) { const a = R() * Math.PI * 2, el = (R() - 0.5) * 1.4; dirs.push({ d: new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) * 0.7 + 0.35), sp: 10 + R() * 26, rot: new THREE.Vector3(R() * 6, R() * 6, R() * 6), sc: 0.5 + R() * 1.1 }); }

  const eyesF = ctx.makeEyeField([
    { pos: [-17, 8, -3], w: 10, iris: 'red', line: 'pink' }, { pos: [17, 7, -4], w: 11, iris: 'blue', line: 'cyan' }, { pos: [-15, -8, -4], w: 9, iris: 'ring_cyan', line: 'cyan' }, { pos: [15, -9, -3], w: 10, iris: 'orange', line: 'pink' }, { pos: [0, 12, -7], w: 12, iris: 'ring_pink', line: 'pink' }, { pos: [0, -12.5, -7], w: 12, iris: 'blue', line: 'cyan' }
  ]); scene.add(eyesF.group);
  // 假名噪声
  const noise = []; for (let i = 0; i < 70; i++) { const m = glyphMesh(ctx.atlasO, 'ア', [PAL.pink, PAL.cyan, PAL.yellow][i % 3], 1.4 + R() * 1.6, 0.6); m.position.set((R() - 0.5) * 42, (R() - 0.5) * 24, -3 - R() * 6); scene.add(m); noise.push(m); }
  const geoC = {}; const getG = (ch, s) => { const k = ch + s; return geoC[k] || (geoC[k] = glyphGeo(ctx.atlasO, ch, s, s)); };

  function update({ t, f, S, post, sec }) {
    const STARTS = sec.pulses || STARTS0;                // timing.json 里可用 pulses 指定三记重击的时间（相对本段起点）
    const lt = S.lt; let e0 = 0, age = 9, idx = -1;
    STARTS.forEach((s, i) => { if (lt >= s) { const a = lt - s, ee = Math.exp(-a * 5.5); if (i === STARTS.findLastIndex(x => lt >= x)) { e0 = ee; age = a; idx = i; } } });
    const big = 1 + e0 * 0.32;
    [O, Op, Oc, Oo].forEach(m => m.scale.setScalar(big));
    O.material.opacity = 0.22 + 0.3 * Math.min(1, e0 * 1.6 + 0.15); Op.position.set(-0.5 - e0 * 1.2, 0.15, -0.4); Oc.position.set(0.5 + e0 * 1.2, -0.15, -0.5); Oo.scale.setScalar(big * 1.12);
    rays.material.uniforms.uT.value = t; rays.material.uniforms.uE.value = e0;
    rings.forEach((m, i) => { const a = Math.max(0, age - i * 0.08); const s = 1 + a * (16 + i * 6); m.scale.setScalar(s); m.material.opacity = idx >= 0 ? Math.max(0, 0.9 - a * 1.1) : 0; });
    // 碎片：从最近一次砸击的中心炸开
    for (let i = 0; i < NS; i++) {
      const d = dirs[i], a = idx >= 0 ? age : 0, vis = idx >= 0 ? 1 : 0;
      const p = d.d.clone().multiplyScalar(a * d.sp * (1.1 - Math.exp(-a * 1.5)));
      e.set(d.rot.x + a * 3, d.rot.y + a * 2.2, d.rot.z + a * 3.7); q.setFromEuler(e);
      tmp.compose(p, q, new THREE.Vector3().setScalar(d.sc * vis * (1 - smooth(1.0, 1.2, a)))); shards.setMatrixAt(i, tmp);
    }
    shards.instanceMatrix.needsUpdate = true;
    noise.forEach((m, i) => { const st = Math.floor(t * 14 + i * 3.1); const h = ((Math.sin(st * 12.9898 + i) * 43758.5453) % 1 + 1) % 1; m.geometry = getG(KANA[Math.floor(h * KANA.length)], 1.4 + (i % 4) * 0.5); m.material.opacity = 0.15 + 0.5 * ((Math.sin(st * 78.233 + i * 5) * 43758.5453 % 1 + 1) % 1) * (0.4 + e0); });
    eyesF.update(t, camera, { opacity: 0.95, appear: 1, forceOpen: 0.1 + 0.9 * Math.min(1, e0 * 1.4), kick: e0 * 0.5 });
    camera.position.set((Math.sin(t * 53) * 0.15) * e0, (Math.cos(t * 47) * 0.15) * e0, 16 - e0 * 0.8);
    const s = post.s; s.bloom = 0.35 + e0 * 0.35; s.bloomT = 0.85; s.bloomR = 0.6; s.glitch = Math.max(s.glitch, 0.25 + e0 * 0.75); s.ab = 0.004 + e0 * 0.014; s.warp = e0 * 0.35; s.pix = e0 > 0.7 ? (e0 - 0.7) * 1.2 : 0; s.track = 0.5;
    s.flash = [e0 * 0.16, e0 * 0.02, e0 * 0.1];
  }
  return { scene, camera, update };
}
