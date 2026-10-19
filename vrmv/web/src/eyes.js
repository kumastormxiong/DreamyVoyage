// 漂浮的大眼睛（参考图的"满天眼睛"）。素材在 assets/eyes/（tools/make_eyes.py 生成）。
// 每只眼睛 = 巩膜 + 虹膜(可转动) + 眼线/睫毛(霓虹)，会眨眼、会东张西望；全部是时间 t 的纯函数，录制/逐帧结果一致。
import * as THREE from 'three';

const NAMES = ['eye_sclera', 'eye_line_pink', 'eye_line_cyan', 'iris_blue', 'iris_red', 'iris_orange', 'iris_ring_cyan', 'iris_ring_pink'];
export async function loadEyeTextures() {
  const loader = new THREE.TextureLoader(), T = {};
  await Promise.all(NAMES.map(n => new Promise((res) => loader.load(`assets/eyes/${n}.png`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; T[n] = t; res(); }))));
  return T;
}

const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function makeEye(T, { iris = 'blue', line = 'pink', width = 8, seed = 1, roll = 0, bright = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { sclera: { value: T.eye_sclera }, line: { value: T['eye_line_' + line] }, iris: { value: T['iris_' + iris] }, uOff: { value: new THREE.Vector2() }, uOpen: { value: 1 }, uOp: { value: 1 }, uBright: { value: bright } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D sclera,line,iris;uniform vec2 uOff;uniform float uOpen,uOp,uBright;varying vec2 vUv;
      void main(){
        float o=max(uOpen,0.035); vec2 uv=vec2(vUv.x,0.5+(vUv.y-0.5)/o);
        if(uv.y<0.0||uv.y>1.0){gl_FragColor=vec4(0.0);return;}
        vec4 s=texture2D(sclera,uv), ir=texture2D(iris,uv-uOff), l=texture2D(line,uv);
        vec3 c=mix(s.rgb,ir.rgb,ir.a*s.a);
        vec3 pre=l.rgb*l.a+c*s.a*(1.0-l.a); float a=l.a+s.a*(1.0-l.a);
        gl_FragColor=vec4(pre*uBright*uOp,a*uOp);}`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), mat);
  m.userData = { seed, roll, base: width }; m.frustumCulled = false;
  return m;
}

// 一组眼睛：specs = [{ pos:[x,y,z], w, iris, line, seed, roll }]
export function makeEyeField(T, specs) {
  const group = new THREE.Group(), eyes = specs.map((s, i) => {
    const e = makeEye(T, { iris: s.iris, line: s.line, width: s.w, seed: s.seed ?? i + 1, roll: s.roll ?? 0, bright: s.bright ?? 0.78 });
    e.position.set(...s.pos); e.userData.delay = s.delay ?? i * 0.25; group.add(e); return e;
  });
  // o: { opacity, appear(0..1 整体睁开进度), kick, forceOpen(0..1，覆盖眨眼) }
  function update(t, camera, o = {}) {
    const op = o.opacity ?? 1, appear = o.appear ?? 1;
    eyes.forEach((e, i) => {
      const u = e.userData, sd = u.seed;
      // 东张西望：每 1.4~2.6 秒换一个目标，约三成时间直视镜头
      const per = 1.4 + h1(sd) * 1.2, k = Math.floor(t / per + sd), fr = t / per + sd - k;
      const tg = (kk) => h1(kk * 9.3 + sd) < 0.3 ? [0, 0] : [(h1(kk * 3.1 + sd) - 0.5) * 0.2, (h1(kk * 5.7 + sd) - 0.5) * 0.07];
      const a = tg(k - 1), b = tg(k), w = sm(0, 0.12, fr);
      e.material.uniforms.uOff.value.set(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w);
      // 眨眼
      const per2 = 3.3 + h1(sd * 2) * 2.5, ph = (t + sd * 7.3) % per2, bl = ph < 0.16 ? Math.sin(ph / 0.16 * Math.PI) : 0;
      // 睁开进度：整体 appear 逐只依次睁开
      const ap = sm(0, 1, appear * (1 + 0.8) - (i / Math.max(1, eyes.length)) * 0.8);
      const open = (o.forceOpen != null ? o.forceOpen : 1 - bl * 0.96) * ap;
      e.material.uniforms.uOpen.value = open; e.material.uniforms.uOp.value = op * (open > 0.02 ? 1 : 0);
      e.quaternion.copy(camera.quaternion); e.rotateZ(u.roll + Math.sin(t * 0.3 + sd) * 0.03);
      e.scale.setScalar(1 + (o.kick || 0) * 0.04);
    });
    group.visible = op > 0.001 && appear > 0.001;
  }
  return { group, eyes, update };
}
