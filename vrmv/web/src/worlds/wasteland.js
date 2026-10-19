// 场景 wasteland（Bridge，138.5–147.75 秒）：故障废土。龟裂的地面在扭曲，断裂的摩天楼只剩线框，
// 死掉的落日，数据线像蛇一样穿过废墟，画面不时撕裂、闪回。取代了原来与 break 1 重复的梦核场景。
import * as THREE from 'three';
import { PAL, col, makeSky, makeSun, makeStars, glowSprite, rng } from '../lib.js';
import { makeCableSet, makeCyberField, makeLyricLayer, makeFlashCards, makeBlockField, makeDataStream } from '../cyber.js';

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x080208);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
  scene.add(makeSky(0x06000c, 0x3a0820, 0xff5a2a, { midAt: 0.28, power: 0.6 }));
  scene.add(makeStars(500, 380, 1.1, 21));
  const sun = makeSun(44, 0.55); sun.position.set(0, 26, -340); scene.add(sun);
  const sunGlow = glowSprite('255,110,60', 520, 0.5); sunGlow.position.set(0, 26, -342); scene.add(sunGlow);

  // 龟裂的地面（顶点位移 + 故障错位 + 裂纹）
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 200, 200), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: `uniform float uTime;varying vec2 vUv;varying float vH;varying vec3 vW;
      void main(){
        vec3 p = position;
        float h = sin(p.x*0.045+1.3)*2.6 + sin(p.y*0.07+p.x*0.02)*2.2 + sin(p.x*0.21)*0.6*sin(p.y*0.17);
        float cell = floor(p.y*0.25);
        float glitchOn = step(0.93, fract(sin(cell*12.9)*43758.5));
        h += glitchOn * sin(p.x*0.8 + uTime*2.0) * 1.2;
        h *= smoothstep(14.0, 70.0, abs(p.x) + abs(p.y)*0.2);
        p.z = h; vH = h; vUv = uv; vW = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float uTime;uniform float uPulse;varying vec2 vUv;varying float vH;varying vec3 vW;
      void main(){
        vec2 g = vW.xy / 6.0;
        float band = floor(vW.y * 0.6 + uTime * 3.0);
        float sh = step(0.94, fract(sin(band*91.7)*43758.5)) * (fract(sin(band*3.1)*999.0) - 0.5) * 1.2;
        g.x += sh;
        vec2 gg = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
        float line = 1.0 - clamp(min(gg.x, gg.y) / 1.4, 0.0, 1.0);
        vec3 base = vec3(0.03, 0.0, 0.05) + vec3(0.1, 0.0, 0.06) * clamp(vH * 0.12 + 0.5, 0.0, 1.0);
        vec3 lc = mix(vec3(1.0, 0.2, 0.55), vec3(0.2, 0.95, 1.0), smoothstep(-2.0, 3.0, vH));
        float crack = step(0.985, fract(vW.x * 0.031 + sin(vW.y * 0.07) * 1.3));
        vec3 c = base + lc * line * (0.55 + uPulse) + vec3(1.0, 0.4, 0.2) * crack * 0.35;
        float fade = smoothstep(420.0, 60.0, length(vW.xy));
        gl_FragColor = vec4(c * (0.25 + 0.75 * fade), 1.0);
      }`
  }));
  terrain.rotation.x = -Math.PI / 2; terrain.position.y = -6; scene.add(terrain);

  // 断裂的摩天楼：实体 + 线框
  const R = rng(33), NB = 90;
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const solid = new THREE.InstancedMesh(bGeo, new THREE.MeshBasicMaterial({ color: 0x0a0410 }), NB);
  const wire = new THREE.InstancedMesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xff3a8a, wireframe: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), NB);
  solid.frustumCulled = false; wire.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < NB; i++) {
    const side = i % 2 ? 1 : -1, w = 6 + R() * 10, d = 6 + R() * 10, h = 8 + Math.pow(R(), 2.2) * 70;
    const x = side * (16 + R() * 60), z = -R() * 440 - 10;
    const broken = R() < 0.3, hh = broken ? h * (0.3 + R() * 0.4) : h;
    m4.compose(new THREE.Vector3(x, -6, z), q, new THREE.Vector3(w, hh, d));
    solid.setMatrixAt(i, m4); wire.setMatrixAt(i, m4);
  }
  scene.add(solid, wire);

  // 数据线：一根蛇形的数据包串，穿过整个废墟
  const stream = makeDataStream((u) => new THREE.Vector3(Math.sin(u * 34) * 26, 4 + Math.sin(u * 11) * 5, -u * 420 + 10), { segs: 700, radius: 0.16 }); scene.add(stream.mesh);
  const cf = makeCyberField({ n: 24, codes: 8, box: [60, 32, 220], seed: 51 }); scene.add(cf.group);
  const bf = makeBlockField({ n: 110, box: [60, 30, 300], seed: 71 }); scene.add(bf.mesh);
  const lyr = makeLyricLayer(ctx, camera, scene, { heroColor: 0xffc2e6, outline: PAL.cyan });
  const fc = makeFlashCards(camera, scene, { dist: 4.2, seed: 13 });

  function update({ t, f, S, k, post }) {
    camera.position.set(Math.sin(t * 0.4) * 2.2, 4.8 + Math.sin(t * 0.7) * 0.4 + f.kick * 0.1, 20 - S.lt * 2.2);
    camera.lookAt(Math.sin(t * 0.3) * 3, 3, -90);
    camera.rotation.z += Math.sin(t * 0.6) * 0.05 * (1 + f.hit);
    terrain.material.uniforms.uTime.value = t; terrain.material.uniforms.uPulse.value = f.kick * 0.6 + f.hit * 0.3;
    sun.material.uniforms.uTime.value = t; sun.material.uniforms.uPulse.value = f.kick * 0.4;
    sunGlow.material.opacity = 0.3 + f.kick * 0.1;
    stream.update(t, 1 + f.kick * 0.6 + f.hit * 0.4);
    cf.update(t, f); bf.update(t, f);
    lyr.update(k, t, f);
    fc.update(t, 0.12 + f.hit * 0.5);
    const s = post.s; s.glitch = Math.max(s.glitch, 0.18 + f.hit * 0.5); s.ab = 0.006 + f.hit * 0.01; s.scan = 0.2; s.warp = 0.08; s.grain = 0.12; s.bloom = 0.55 + f.kick * 0.2; s.bloomT = 0.6; s.track = 0.6;
  }
  return { scene, camera, update };
}
