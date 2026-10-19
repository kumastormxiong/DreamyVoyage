// 场景 endcard：落版。只有你的头像和「虚空造物」。头像外侧是一圈随音乐跳动的频谱直方图：
// 32 个频段左右对称成 64 根，底部为低频、顶部为高频；整圈随低频与鼓点轻微放大缩小。
import * as THREE from 'three';
import { PAL, col, JP_FONT, makeStars, makeGrid, glowSprite, textMesh, smooth } from '../lib.js';

const BANDS = 32;     // 每半圈的频段数，整圈共 64 根
const R0 = 4.0;       // 直方图内圈半径（头像圆盘约 3.6，留出间隙）
const HMAX = 0.8;     // 直方图最大长度（外圈约 4.8，在平面范围 5.8 之内）
const CY = 2.6;       // 头像与直方图的中心高度

// 频谱着色器：每个片元先算出所在角度对应的频段，再取该频段的振幅画一根径向直方柱
const specMat = (vals) => new THREE.ShaderMaterial({
  uniforms: { uB: { value: vals }, uA: { value: 0 }, uCLo: { value: col(PAL.pink) }, uCHi: { value: col(PAL.cyan) }, uR0: { value: R0 }, uHM: { value: HMAX } },
  vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform float uB[${BANDS}];uniform float uA,uR0,uHM;uniform vec3 uCLo,uCHi;varying vec2 vP;
    void main(){
      float r=length(vP);
      float ang=atan(vP.y,vP.x);
      float s=abs(fract(ang/6.2831853+0.25)*2.0-1.0);          // 0 在顶部，1 在底部，左右对称
      float fb=clamp((1.0-s)*${BANDS}.0,0.0,${BANDS}.0-0.001); // 底部为低频（0），顶部为高频
      float bi=floor(fb), bf=fract(fb);
      float v=0.0;
      for(int i=0;i<${BANDS};i++){ if(float(i)==bi) v=uB[i]; }
      float h=max(0.035,v)*uHM;                                 // 静音时保留一小截底座
      float rr=r-uR0;
      float inside=smoothstep(-0.03,0.0,rr)*(1.0-smoothstep(h-0.03,h,rr));
      float gap=smoothstep(0.18,0.26,bf)*(1.0-smoothstep(0.74,0.82,bf));
      float cap=smoothstep(h*0.5,h,rr);                         // 柱顶更亮
      vec3 bc=mix(uCLo,uCHi,bi/${BANDS}.0)*(0.5+0.9*v+0.45*cap);
      float base=exp(-rr*rr*1400.0)*0.55;                       // 内圈细线，标出圆盘边缘
      vec3 fc=bc*1.35*inside*gap+mix(uCLo,uCHi,0.5)*base;       // 略微提亮，让柱子超过泛光阈值、保留霓虹光晕
      gl_FragColor=vec4(fc*uA,1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x03000a);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300); camera.position.set(0, 1.4, 17);
  scene.add(makeStars(1400, 240, 1.4, 99));
  const grid = makeGrid({ y: -6.5, speed: 3, scale: 3, colA: PAL.magenta, colB: PAL.cyan }); grid.material.uniforms.uFog.value = 0.035; scene.add(grid);
  const hz = glowSprite('255,47,143', 120, 0.3); hz.scale.set(1.8, 0.2, 1); hz.position.set(0, -5.2, -40); scene.add(hz);

  const halo = glowSprite('255,70,170', 20, 0.55); halo.position.set(0, CY, -1); scene.add(halo);
  const haloC = glowSprite('63,246,255', 15, 0.3); haloC.position.set(1.2, 2.2, -1.2); scene.add(haloC);
  // 头像：参与泛光与后期处理（扫描线、颗粒、暗角）；不写深度，直方图从它旁边经过时不会被方形边缘切掉
  const avatar = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), new THREE.MeshBasicMaterial({ map: ctx.avatarTex, transparent: true, toneMapped: false, depthWrite: false })); avatar.position.set(0, CY, 0); scene.add(avatar);

  // 频谱直方图：与头像同一平面、中心对齐；数组由 ctx.spec 每帧写入
  const vals = new Array(BANDS).fill(0);
  const bars = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 11.6), specMat(vals));
  bars.position.set(0, CY, 0); scene.add(bars);

  const name = textMesh('虚空造物', 1.9, { font: JP_FONT, weight: '900', chrome: true, size: 220, glow: '#ff2f8f', stroke: '#ff2f8f', strokeW: 4, spacing: 36 }, false);
  name.position.set(0, -3.0, 0); scene.add(name);
  const nameG = name.clone(); nameG.material = name.material.clone(); nameG.material.blending = THREE.AdditiveBlending; nameG.scale.setScalar(1.012); nameG.position.set(0.05, -3.0, -0.05); scene.add(nameG);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false })); veil.position.set(0, 1.4, 14); veil.renderOrder = 99; scene.add(veil);

  function update({ t, f, S, post, sec }) {
    const lt = S.lt, end = sec.end - sec.start;
    const aA = smooth(0.2, 1.8, lt), aN = smooth(1.4, 2.8, lt);
    const vo = smooth(end - 1.4, end - 0.05, lt);            // 片尾黑场
    avatar.material.opacity = aA * (1 - vo); avatar.scale.setScalar(0.94 + 0.06 * smooth(0.2, 2.4, lt) + f.kick * 0.012);
    halo.material.opacity = 0.3 * aA + f.kick * 0.06; haloC.material.opacity = 0.18 * aA;
    // 频谱：读取当前时刻的 32 个频段，写入与着色器共享的数组
    ctx.spec.at(t, vals);
    bars.material.uniforms.uA.value = aA * (0.95 + 0.25 * f.kick);
    // 整圈轻微呼吸，并随低频与鼓点放大缩小；鼓点瞬间有一点抖动
    bars.scale.setScalar(1 + 0.02 * Math.sin(t * 1.6) + 0.035 * f.low + 0.025 * f.kick);
    bars.position.set(Math.sin(t * 37.0) * 0.012 * f.hit, CY + Math.cos(t * 29.0) * 0.012 * f.hit, 0);
    name.material.opacity = aN; nameG.material.opacity = aN * 0.3; name.position.y = -3.0 + Math.sin(t * 0.9) * 0.04; nameG.position.y = name.position.y;
    veil.material.opacity = vo;
    grid.material.uniforms.uTime.value = t; grid.material.uniforms.uCam.value.copy(camera.position); grid.material.uniforms.uPulse.value = f.kick * 0.3;
    camera.position.x = Math.sin(t * 0.18) * 0.7; camera.lookAt(0, 0.6, 0);
    const s = post.s; s.bloom = 0.8 + f.kick * 0.15; s.bloomR = 0.7; s.bloomT = 1.0; s.glitch = Math.max(s.glitch, (lt < 2.2 ? (1 - smooth(0.2, 2.2, lt)) * 0.35 : 0) + f.hit * 0.05); s.ab = 0.0022; s.track = 0.25; s.scan = 0.11; s.grain = 0.05;
  }
  return { scene, camera, update };
}
