// 场景 endcard：片尾。频谱光圈（32 频段 ×2 对称）围着头像/标题，下方署名（project.json 的 endcard.lines），最后 2 秒淡出到黑。
import * as THREE from 'three';
import { PAL, PROJECT, col, makeStage, makeStars, textMesh, smooth, hash } from '../lib.js';
import { DISPLAY_FONT, LYRIC_FONT, beatAt } from './_glitch.js';
import { aurora, fractalSky, motes } from './fx.js';
const FONT_DISPLAY = DISPLAY_FONT, FONT_LYRIC = '"Michroma", "NotoSC9", sans-serif';

export function create(ctx) {
  const { scene, camera } = makeStage(ctx, { fov: 50 });
  scene.add(makeStars(1800, 160, 1.3, 21));
  // 细节层：背后缓缓流动的极光、几乎看不见的碎形纤维、漂浮的星尘
  const aur = aurora({ center: Math.PI, span: 3.2, radius: 90, y: 24, height: 90, colors: [0x3ff6ff, 0x8a5aff, 0xff2f8f], layers: 3, seed: 20, intensity: 0.5 }); scene.add(aur);
  const fr = fractalSky({ c1: 0xff2f8f, c2: 0x3ff6ff, shape: 1.0, speed: 0.1, intensity: 0.1 }); scene.add(fr);
  const dust = motes({ n: 500, box: [40, 20, 30], center: [0, -2, -8], color: 0xbfefff, size: 1.8, rise: 0.5, sway: 2, seed: 20 }); scene.add(dust);
  const ec = PROJECT.endcard || {};
  const lines = ec.lines && ec.lines.length ? ec.lines : [PROJECT.title || '', PROJECT.artist || ''];
  const center = new THREE.Group(); center.position.set(0, 1.9, -8); scene.add(center);
  // 频谱光圈：一整块 shader 面片，片元里按角度切出 32 根径向柱（左右对称），
  // 柱子是霓虹青 / 洋红交替的切片条纹，顶端发光、内部扫描线，鼓点时整圈随机错位、RGB 分离，形成故障感。
  const SPN = 64, spBuf = new Float32Array(ctx.spec.nb || 32);
  const spData = new Uint8Array(SPN * 4), spTex = new THREE.DataTexture(spData, SPN, 1, THREE.RGBAFormat);
  spTex.magFilter = spTex.minFilter = THREE.NearestFilter; spTex.needsUpdate = true;
  const spec = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uSp: { value: spTex }, uT: { value: 0 }, uK: { value: 0 }, uAb: { value: 0.02 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uSp; uniform float uT, uK, uAb; varying vec2 vP;
      float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      float barLen(float cid, float v){ float j = (h1(cid * 3.1 + floor(uT * 18.0)) - 0.5) * 0.35 * uK * step(0.9, h1(cid + floor(uT * 9.0) * 7.3)); return 0.05 + v * 1.15 + j; }
      void main(){
        vec2 p = vP;
        p.x += step(0.955, h1(floor(vP.y * 13.0) + floor(uT * 20.0))) * uK * 0.12;          // 鼓点时随机横向撕裂的扫描行
        float r = length(p), a = atan(p.x, p.y), ab = abs(a);
        float cf32 = ab / 3.14159265 * 32.0, cid = floor(cf32), cf = fract(cf32);
        float u = ab / 3.14159265;
        float v = texture2D(uSp, vec2(min(u, 0.999), 0.5)).r;
        float inBar = (1.0 - smoothstep(0.80, 0.84, cf)) * smoothstep(0.10, 0.14, cf);
        float len = barLen(cid, v);
        float mR = step(0.0, r + uAb - 1.42) * (1.0 - smoothstep(len - 0.012, len + 0.01, r + uAb - 1.42));
        float dG = r - 1.42;
        float mG = step(0.0, dG) * (1.0 - smoothstep(len - 0.012, len + 0.01, dG));
        float mB = step(0.0, r - uAb - 1.42) * (1.0 - smoothstep(len - 0.012, len + 0.01, r - uAb - 1.42));
        float g = clamp(dG / max(len, 0.001), 0.0, 1.0);
        float stripe = 0.7 + 0.3 * sin(dG * 240.0);
        vec3 base = mod(cid, 2.0) < 1.0 ? vec3(0.25, 0.96, 1.0) : vec3(1.0, 0.18, 0.56);
        vec3 hot = mix(base, vec3(1.0), g * g * 0.7);
        float glow = exp(-max(dG - len, 0.0) * 7.0) * step(0.0, dG) * 0.22;
        vec3 col = hot * vec3(mR, mG, mB) * stripe * inBar + base * glow * inBar;
        float ring = (1.0 - smoothstep(0.0, 0.012, abs(r - 1.36))) * (0.35 + 0.65 * step(0.5, fract(a * 6.0 / 3.14159265 + 0.5))) * 0.45;
        col += vec3(1.0, 0.18, 0.56) * ring;
        col *= step(1.27, r) * (1.0 - step(3.0, r));
        gl_FragColor = vec4(col, 1.0);
      }` });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), spec); plane.position.set(0, 0, 0.005); center.add(plane);
  if (ctx.avatarTex) {
    const av = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshBasicMaterial({ map: ctx.avatarTex, transparent: true, toneMapped: false, color: 0xd2d2d2 }));   // 头像原图（略压亮度，避免被泛光吃掉）（透明 PNG）完整显示
    av.position.copy(center.position); av.position.z += 0.01; scene.add(av);   // 头像不跟着频谱圈旋转
  } else {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.16, 96), new THREE.MeshBasicMaterial({ color: col(PAL.b), transparent: true, toneMapped: false }));
    center.add(ring);
  }
  const texts = lines.map((s, i) => {
    const m = textMesh(s, i === 0 ? 1.2 : 0.45, { font: i === 0 ? FONT_DISPLAY : FONT_LYRIC, size: 160, italic: i === 0, chrome: i === 0, fill: '#d8f8ff', glow: i === 0 ? '#ff1f5a' : null, spacing: i === 0 ? 6 : 10 });
    m.position.set(0, -1.3 - i * 0.75, -8); scene.add(m); return m;
  });
  const black = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, toneMapped: false }));
  black.position.z = -0.5; black.renderOrder = 999; camera.add(black);

  function update({ t, f, S, post, ctx, tl }) {
    camera.position.set(0, 1.6, 0); camera.lookAt(0, 1.0, -8);
    const sp = ctx.spec.at(t, spBuf);
    for (let i = 0; i < SPN; i++) { const v = sp[Math.floor(i / SPN * sp.length)] || 0; spData[i * 4] = Math.min(255, Math.round(v * 255)); }
    spTex.needsUpdate = true;
    spec.uniforms.uT.value = t; spec.uniforms.uK.value = f.kick; spec.uniforms.uAb.value = 0.02 + f.kick * 0.05;
    plane.rotation.z = t * 0.05;
    aur.userData.tick(t, f.low * 0.5); fr.userData.tick(t, camera, 0.08 + f.low * 0.1); dust.userData.tick(t, 0.8);
    texts.forEach((m, i) => { m.material.opacity = smooth(0.6 + i * 0.5, 1.8 + i * 0.5, S.lt); });
    black.material.opacity = smooth(S.dur - 2.2, S.dur - 0.2, S.lt);
    const B = beatAt(tl, t);
    texts.forEach((m, i) => { m.position.x = hash(B.beat * 3 + i) > 0.8 && B.bp < 0.15 ? (hash(B.beat + i * 7) - 0.5) * 0.6 : 0; });
    post.s.bloom = 0.35 + f.low * 0.2; post.s.bloomT = 0.85; post.s.scan = 0.12; post.s.grain = 0.06;
    post.s.ab = 0.003 + f.kick * 0.01; post.s.glitch = Math.pow(f.kick, 3) * 0.3 * (1 - smooth(5, 7, S.lt));
  }
  return { scene, camera, update };
}
