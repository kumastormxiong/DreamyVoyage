// 场景 city：Verse 2 / Pre-Chorus 2。雨夜赛博都市，沿街飞行；竖排假名霓虹招牌、窗灯闪烁的高楼、横跨街道的铬金属锁链。
import * as THREE from 'three';
import { PAL, col, KANA, makeGrid, makeSun, makeStars, makeSky, glyphMesh, glowSprite, smooth, clamp, lerp, rng, hash } from '../lib.js';
import { makeChain } from '../lib.js';
import { makeLyricLayer, makeCyberField, makeBlockField } from '../cyber.js';

const CHUNK = 260;

function buildingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlick: { value: 0 } },
    vertexShader: `varying vec3 vP;varying vec3 vL;varying vec3 vN;varying vec3 vC;
      void main(){ vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); vP=wp.xyz; vL=position; vC=instanceColor;
        vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime,uFlick;varying vec3 vP;varying vec3 vL;varying vec3 vN;varying vec3 vC;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 base=vec3(0.012,0.004,0.03); vec3 c=base;
        float side=1.0-step(0.5,abs(vN.y));
        vec2 uvw=vec2((vP.x+vP.z)*0.62,vP.y*0.42);
        vec2 cell=floor(uvw); vec2 f=fract(uvw);
        float win=step(0.18,f.x)*step(f.x,0.82)*step(0.2,f.y)*step(f.y,0.78);
        float seed=h(cell+vec2(vC.x*31.0,vC.y*17.0));
        float on=step(0.62,seed)*(0.55+0.45*step(0.5,h(cell+floor(uTime*0.7))));
        vec3 tint=mix(vec3(1.0,0.25,0.62),vec3(0.2,0.95,1.0),step(0.5,h(cell+3.7)));
        tint=mix(tint,vec3(1.0,0.78,0.3),step(0.9,h(cell+9.1)));
        c+=side*win*on*tint*0.7;
        vec3 a=abs(vL-vec3(0.0,0.5,0.0));
        float e=step(0.485,a.x)+step(0.485,a.y)+step(0.485,a.z);
        float edge=step(1.5,e);
        c+=edge*mix(vec3(0.2,0.95,1.0),vec3(1.0,0.2,0.6),vC.z)*1.1;
        c+=step(0.5,vN.y)*0.0;
        gl_FragColor=vec4(c,1.0);
      }`
  });
}

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x05000b); scene.fog = new THREE.FogExp2(0x2a0630, 0.0085);
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 800);
  const sky = makeSky(0x03000a, 0x1c0430, 0x8a1670, { midAt: 0.35, power: 0.5 }); scene.add(sky);
  scene.add(makeStars(900, 380, 1.3, 77));
  const moon = makeSun(52, 0.62); moon.position.set(0, 46, -330); scene.add(moon);
  const moonGlow = glowSprite('255,70,140', 520, 0.65); moonGlow.position.set(0, 44, -334); scene.add(moonGlow);

  // 街区（两段首尾相接循环滚动）
  const R = rng(91);
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const NB = 70;
  const makeChunk = (seed) => {
    const r = rng(seed), g = new THREE.Group();
    const inst = new THREE.InstancedMesh(bGeo, buildingMaterial(), NB); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let i = 0; i < NB; i++) {
      const side = i % 2 ? 1 : -1, w = 5 + r() * 8, d = 5 + r() * 9, h = 14 + Math.pow(r(), 1.6) * 70;
      const x = side * (13 + w / 2 + r() * (r() < 0.3 ? 30 : 6)), z = -(i / NB) * CHUNK - r() * 3;
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, d)); inst.setMatrixAt(i, m4);
      c.setRGB(r(), r(), r()); inst.setColorAt(i, c);
    }
    inst.frustumCulled = false; g.add(inst);
    // 竖排假名招牌
    for (let s = 0; s < 16; s++) {
      const side = s % 2 ? 1 : -1, len = 3 + Math.floor(r() * 3), x = side * (12.4 + r() * 0.2), y = 8 + r() * 28, z = -r() * CHUNK, colr = [PAL.pink, PAL.cyan, PAL.yellow, PAL.magenta][Math.floor(r() * 4)];
      for (let j = 0; j < len; j++) {
        const m = glyphMesh(ctx.atlasF, KANA[Math.floor(r() * KANA.length)], colr, 2.6, 0.95); m.position.set(x, y - j * 2.7, z); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(m);
      }
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.1, len * 2.7 + 0.5), new THREE.MeshBasicMaterial({ color: 0x05000b, transparent: true, opacity: 0.8 }));
      bar.position.set(x - side * 0.02, y - (len - 1) * 1.35, z - 0.0); bar.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(bar);
    }
    // 横跨街道的锁链（悬链线）
    for (let a = 0; a < 3; a++) {
      const ch = makeChain(90, ctx.env); const z = -(a + 0.5) * CHUNK / 3, hgt = 26 + r() * 10, W = 17;
      ch.layout((u) => new THREE.Vector3(-W + u * 2 * W, hgt - 11 * (1 - Math.pow(2 * u - 1, 2)), 0), { frac: 1, scale: 1.1, twist: a });
      ch.mesh.position.z = z; g.add(ch.mesh);
    }
    return g;
  };
  const chunks = [makeChunk(5), makeChunk(8)]; chunks.forEach(c => scene.add(c));
  const road = makeGrid({ speed: 40, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); road.material.uniforms.uFog.value = 0.011; scene.add(road);
  scene.add(new THREE.AmbientLight(0x553366, 0.7));
  // 参考图的构图：女孩悬浮在窄巷中央，天上全是眼睛
  const lyr = makeLyricLayer(ctx, camera, scene, { heroColor: 0xffd6ef, outline: PAL.cyan });
  const cf = makeCyberField({ n: 26, codes: 8, box: [40, 30, 200], seed: 21 }); scene.add(cf.group);
  const bf = makeBlockField({ n: 150, box: [46, 30, 200], seed: 61 }); scene.add(bf.mesh);
  const eyesF = ctx.makeEyeField([
    { pos: [-26, 52, -125], w: 34, iris: 'blue', line: 'pink' }, { pos: [24, 58, -140], w: 40, iris: 'red', line: 'cyan' }, { pos: [-2, 92, -170], w: 50, iris: 'ring_cyan', line: 'pink' },
    { pos: [-36, 60, -110], w: 20, iris: 'orange', line: 'cyan' }, { pos: [38, 63, -117], w: 22, iris: 'ring_pink', line: 'pink' }, { pos: [0, 40, -100], w: 16, iris: 'blue', line: 'cyan' }
  ]); scene.add(eyesF.group);

  // 雨
  const RN = 900, rp = new Float32Array(RN * 6), rtop = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) { const x = (R() - 0.5) * 90, y = R() * 50, z = 10 - R() * 130; rp.set([x, y, z, x, y, z], i * 6); rtop[i * 2] = 0; rtop[i * 2 + 1] = 1; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aTop', new THREE.BufferAttribute(rtop, 1));
  const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: 'attribute float aTop;uniform float uTime;varying float vA;void main(){vec3 p=position;p.y=mod(p.y-uTime*38.0,50.0);p.y+=aTop*2.6;vA=1.0-aTop*0.8;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
    fragmentShader: 'varying float vA;void main(){gl_FragColor=vec4(0.55,0.9,1.0,0.22*vA);}'
  })); rain.frustumCulled = false; scene.add(rain);

  function update({ t, f, S, k, post, sec }) {
    const pre = sec.mode === 'pre', speed = pre ? 60 : 44;
    const off = (t * speed) % CHUNK;
    chunks[0].position.z = off; chunks[1].position.z = off - CHUNK;
    chunks.forEach(c => c.children[0].material.uniforms.uTime.value = t);
    road.material.uniforms.uTime.value = t; road.material.uniforms.uSpeed.value = speed; road.material.uniforms.uCam.value.copy(camera.position); road.material.uniforms.uPulse.value = f.kick;
    rain.material.uniforms.uTime.value = t;
    moon.material.uniforms.uTime.value = t; moon.material.uniforms.uPulse.value = f.kick; moonGlow.material.opacity = 0.22 + f.kick * 0.08;
    const fx = sec.id === 'pre2' ? 1 : 0;   // Pre-Chorus 2：自由飞行镜头，幅度更大
    const hi = fx * Math.pow(Math.max(0, Math.sin(t * 0.5 + 5.09)), 2);   // Pre-Chorus 2：周期性拉升到高空镜头
    camera.position.set(Math.sin(t * 0.37) * (2.2 + fx * 6.8) + fx * Math.sin(t * 0.13) * 5, fx ? 9 + Math.sin(t * 0.6) * 2.5 + Math.sin(t * 0.27) * 2 + hi * 16 + f.kick * 0.12 : 5.2 + Math.sin(t * 0.6) * 0.5 + f.kick * 0.12, 6 + fx * Math.sin(t * 0.33) * 6);
    camera.lookAt(Math.sin(t * 0.23) * 4 + fx * (Math.sin(t * 0.41) * 14 + Math.sin(t * 0.17) * 6), 9 + Math.sin(t * 0.3) * 1.2 + fx * Math.sin(t * 0.36) * 4, -60); camera.rotation.z += Math.sin(t * 0.5) * (0.06 + fx * 0.12);
    camera.fov = 66 + f.kick * 2.5 + (pre ? S.p * 8 : 0); camera.updateProjectionMatrix();
    lyr.update(k, t, f); cf.update(t, f); bf.update(t, f);

    const noEyes = sec.id === 'verse2' || sec.id === 'pre2';   // 主歌2、预副歌2 暂不出现眼睛
    // Break 2：只保留中间 4 只眼睛，隐藏两只外侧的眼睛（其他段落不受影响）
    eyesF.eyes[3].visible = eyesF.eyes[4].visible = sec.id !== 'break2';
    eyesF.update(t, camera, { opacity: noEyes ? 0 : 0.9, appear: pre ? smooth(0, 5, S.lt) : 0.5 * smooth(3, 9, S.lt), kick: f.kick });
    const s = post.s; s.bloom = 0.4 + f.kick * 0.12; s.glitch = Math.max(s.glitch, f.hit * (pre ? 0.3 : 0.18)); s.track = 0.45; s.scan = 0.14; s.ab = 0.003 + f.hit * 0.002; s.warp = 0.06;
  }
  return { scene, camera, update };
}
