// glitch art 公共积木（链魂 Glitch · Caos Español 专用）。全部只由 t / 拍子决定，可逐帧复现。
//   beatAt(tl,t)      → { beat, bar, bp(拍内相位), barp(小节内相位), b16(第几个16分音符) }
//   glitchScreenMat() → 像素排序 / 色块 / 彩条 / 雪花 四种故障画面，每拍换一次图案（uBeat）
//   glitchify(mat)    → 给任意 three 材质加"横向切片错位"（按世界坐标 y 分带，按拍子随机选带位移）
//   wordTex(word)     → 单词贴图缓存
import * as THREE from 'three';
import { PAL, col, textTexture, hash, clamp } from '../lib.js';

export const LYRIC_FONT = '"Michroma", "Exo2", sans-serif';
export const DISPLAY_FONT = '"Exo2", "NotoSC9", "Microsoft YaHei", sans-serif';

export function beatAt(tl, t) {
  const b = tl.beat(t);
  const beat = Math.floor(b.beat), bar = Math.floor(b.bar);
  return { beat, bar, bp: b.bp, barp: b.bar - bar, b16: Math.floor(b.beat * 4), raw: b.beat };
}
// 拍点脉冲：每拍开头 = 1，之后指数衰减（比 f.kick 规整，用于"卡点"的硬切与闪动）
export const pulse = (phase, k = 8) => Math.exp(-phase * k);

const GH = 'float gh(float n){return fract(sin(n*91.3458)*47453.5453);}';

// ---- 故障屏幕
export function glitchScreenMat({ seed = 1, a = PAL.a, b = PAL.b, c = PAL.c, amp = 0.8, mode = -1 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uT: { value: 0 }, uSeed: { value: seed }, uBeat: { value: 0 }, uKick: { value: 0 }, uAmp: { value: amp }, uMode: { value: mode }, uOp: { value: 1 },
      uA: { value: col(a) }, uB: { value: col(b) }, uC: { value: col(c) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
    uniform float uT,uSeed,uBeat,uKick,uAmp,uMode,uOp; uniform vec3 uA,uB,uC; varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    ${GH}
    void main(){
      vec2 uv=vUv; float s=uSeed*13.7+uBeat*7.13;
      float m=uMode>=0.0?uMode:floor(gh(s+9.0)*4.0);
      float rows=6.0+floor(gh(s)*22.0); float ry=floor(uv.y*rows);
      float sh=(h(vec2(ry,s))-0.5)*step(0.55,h(vec2(ry,s+1.0)))*(0.25+uKick*0.6);
      uv.x=fract(uv.x+sh);
      vec3 c;
      if(m<1.0){                                   // 像素排序：每列一个阈值，阈值以上被竖向拖拽
        float cols=20.0+floor(gh(s+2.0)*90.0); float cx=floor(uv.x*cols);
        float thr=h(vec2(cx,s+3.0)); float y=uv.y; float sy=y>thr?thr+(y-thr)*0.04:y;
        float v=h(vec2(cx,floor(sy*36.0)+s));
        c=mix(uA,uB,step(0.5,v)); c=mix(c,uC,step(0.88,h(vec2(cx*3.0,floor(sy*10.0)+s))));
        c*=mix(0.2,1.0,fract(sy*2.0+gh(cx+s)));
      } else if(m<2.0){                            // 色块马赛克
        vec2 g=vec2(4.0+floor(gh(s+4.0)*18.0),3.0+floor(gh(s+5.0)*12.0)); vec2 id=floor(uv*g);
        float v=h(id+s); c=v<0.33?uA:(v<0.66?uB:uC); c*=step(0.35,h(id+s+7.0))*(0.4+0.6*h(id+s+3.0));
      } else if(m<3.0){                            // 坏掉的彩条
        float bx=floor(uv.x*7.0); vec3 bars[4]; bars[0]=uA; bars[1]=uB; bars[2]=uC; bars[3]=vec3(1.0);
        c=bars[int(mod(bx+floor(gh(s+6.0)*4.0),4.0))]*(uv.y>0.72?0.35:0.9);
        c*=step(0.12,h(vec2(floor(uv.y*60.0),s+bx)));
      } else {                                     // 雪花 + 一条亮带
        float n=h(floor(uv*vec2(160.0,90.0))+fract(uT*7.0)*100.0);
        c=vec3(n*0.55)+uB*smoothstep(0.03,0.0,abs(uv.y-fract(uT*0.7+gh(s))))*1.5;
      }
      c*=0.78+0.22*sin(vUv.y*380.0);               // 扫描线
      float e=smoothstep(0.0,0.02,vUv.x)*smoothstep(1.0,0.98,vUv.x)*smoothstep(0.0,0.02,vUv.y)*smoothstep(1.0,0.98,vUv.y);
      gl_FragColor=vec4(c*uAmp*(1.0+uKick*0.5),uOp*e);
    }`
  });
}
export function tickScreen(mat, t, beat, kick, seedShift = 0) {
  const u = mat.uniforms; u.uT.value = t; u.uBeat.value = beat + seedShift; u.uKick.value = kick;
}

// ---- 切片错位：按世界 y 坐标分成横带，每拍随机选几条带横向错开 uAmt 米
export function glitchify(mat, { bands = 2.2, seed = 0 } = {}) {
  const U = { uGBeat: { value: 0 }, uGAmt: { value: 0 }, uGBands: { value: bands }, uGSeed: { value: seed } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uGBeat,uGAmt,uGBands,uGSeed;\n${GH}`)
      .replace('#include <project_vertex>', `
        #ifdef USE_INSTANCING
          vec4 gwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 gwp = modelMatrix * vec4(transformed, 1.0);
        #endif
        float gband = floor(gwp.y * uGBands + uGSeed);
        float gr = gh(gband * 1.37 + uGBeat * 3.17);
        gwp.x += step(0.7, gr) * (gh(gband * 1.93 + uGBeat) - 0.5) * uGAmt;
        gwp.z += step(0.9, gr) * (gh(gband * 2.71 + uGBeat) - 0.5) * uGAmt;
        vec4 mvPosition = viewMatrix * gwp;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'glitchify';
  return U;
}

// ---- 单词贴图缓存（大字用）
const WT = new Map();
export function wordTex(word, font = LYRIC_FONT, size = 180) {
  const key = font + '|' + word;
  let e = WT.get(key);
  if (!e) { const t = textTexture(word, { font, size, weight: '400', pad: 30 }); e = { tex: t.tex, aspect: t.aspect }; WT.set(key, e); }
  return e;
}

// 三色错位大字：一个 group 里三块平面（红/青/白），用 setWord / update 控制
export function makeSplitWord(height = 2, colors = [PAL.a, PAL.b, 0xffffff]) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const layers = colors.map((c, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col(c), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.renderOrder = 20 + i; g.add(m); return m;
  });
  let cur = null;
  return {
    group: g,
    set(word, font) {
      if (word === cur) return; cur = word;
      if (!word) { layers.forEach((m) => { m.visible = false; }); return; }
      const e = wordTex(word, font);
      layers.forEach((m) => { m.material.map = e.tex; m.material.needsUpdate = true; m.scale.set(height * e.aspect, height, 1); m.visible = true; });
    },
    // split = 红蓝错开（米），op = 透明度，jit = 随机横移种子
    update(split, op, seed = 0, slice = 0) {
      const [r, b, w] = layers;
      r.position.set(-split + (hash(seed) - 0.5) * slice, (hash(seed + 3) - 0.5) * slice * 0.3, -0.01);
      b.position.set(split + (hash(seed + 1) - 0.5) * slice, 0, -0.02);
      w.position.set((hash(seed + 2) - 0.5) * slice * 0.5, 0, 0);
      r.material.opacity = op * 0.9; b.material.opacity = op * 0.9; w.material.opacity = op * clamp(1 - split * 2) * 0.8;
    }
  };
}

// 歌词层统一配色
export const LYRIC_COLORS = () => ({ sung: 0xf4f6ff, hot: PAL.c, pre: PAL.b, splitA: PAL.b, splitB: PAL.a });
