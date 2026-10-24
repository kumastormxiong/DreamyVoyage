// 赛博都市积木：所有建筑的窗户、楼板、霓虹灯带都在着色器里按世界坐标程序生成（任意尺寸都不拉伸），
// 每个场景只需换一套配色/参数就能得到完全不同气质的城市。全部由 t / 拍子驱动，逐帧可复现。
//   cityMat(opts)          建筑材质（支持 InstancedMesh）：墙面渐变、三色亮窗、暗玻璃、竖向霓虹灯带、楼顶色、雾、按拍子闪烁、切片错位
//   buildings(mat, list)   list = [{x, y, z, w, d, h, ry}] → 一个 InstancedMesh（盒子底面在 y）
//   skyMat(opts)           天空球：多段渐变 + 色阶化的绘画云 + 星点 + 太阳
//   signMesh(text, opts)   霓虹招牌（横/竖），加色混合
//   ringLayout / scatter   360° 布局工具
import * as THREE from 'three';
import { col, rng, hash } from '../lib.js';
export { cityPBR as cityMat } from './pbr.js';

const V3 = (h) => col(h);
const NOISE = `
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=0.5; } return s; }`;

export function cityMatFlat(o = {}) {
  const d = {
    wall: 0x1a2030, wall2: 0x2a3348, wallH: 60, lit: [0xffb35a, 0xffd28a, 0xff7a3a], dark: 0x0a0d16, litP: 0.5, glow: 1.4,
    floorH: 3.2, colW: 2.6, winX: 0.62, winY: 0.55, neon: 0xff3fa4, neonP: 0.08, neon2: 0x3ff0ff, roof: 0x0e1018,
    fog: 0x0b1a3a, fogNear: 40, fogFar: 260, flick: 0.04, seed: 0, rim: 0x000000, rimK: 0, slab: 0.35, levelY: 9999,
    trim: 0x000000, trimP: 0
  };
  const p = { ...d, ...o };
  const U = {
    uWall: { value: V3(p.wall) }, uWall2: { value: V3(p.wall2) }, uWallH: { value: p.wallH },
    uLit0: { value: V3(p.lit[0]) }, uLit1: { value: V3(p.lit[1]) }, uLit2: { value: V3(p.lit[2]) }, uDark: { value: V3(p.dark) },
    uLitP: { value: p.litP }, uGlow: { value: p.glow }, uFloorH: { value: p.floorH }, uColW: { value: p.colW },
    uWinX: { value: p.winX }, uWinY: { value: p.winY }, uNeon: { value: V3(p.neon) }, uNeon2: { value: V3(p.neon2) }, uNeonP: { value: p.neonP },
    uRoof: { value: V3(p.roof) }, uFog: { value: V3(p.fog) }, uFogNear: { value: p.fogNear }, uFogFar: { value: p.fogFar },
    uT: { value: 0 }, uBeat: { value: 0 }, uFlick: { value: p.flick }, uSeed: { value: p.seed }, uRim: { value: V3(p.rim) }, uRimK: { value: p.rimK },
    uSlab: { value: p.slab }, uLevelY: { value: p.levelY }, uGAmt: { value: 0 }, uGBeat: { value: 0 }, uTrim: { value: V3(p.trim) }, uTrimP: { value: p.trimP },
    uPulse: { value: 0 }, uFogH: { value: p.fogH ?? 0 }, uBand: { value: p.band ?? 0.12 }, uWarm: { value: V3(p.warm ?? p.lit[0]) }, uFloodK: { value: p.flood ?? 0 }, uFlood: { value: V3(p.floodCol ?? p.lit[0]) }
  };
  const m = new THREE.ShaderMaterial({
    uniforms: U, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uGAmt,uGBeat; varying vec3 vW; varying vec3 vN; varying float vId;
      float gh(float n){return fract(sin(n*91.3458)*47453.5453);}
      void main(){
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix; vId = float(gl_InstanceID);
        #else
          mat4 im = mat4(1.0); vId = 0.0;
        #endif
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * im) * normal);
        float band = floor(wp.y * 0.35); float gr = gh(band * 1.37 + uGBeat * 3.17);
        vW = wp.xyz;
        wp.x += step(0.75, gr) * (gh(band * 1.93 + uGBeat) - 0.5) * uGAmt;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uWall,uWall2,uLit0,uLit1,uLit2,uDark,uNeon,uNeon2,uRoof,uFog,uRim,uTrim;
      uniform float uWallH,uLitP,uGlow,uFloorH,uColW,uWinX,uWinY,uNeonP,uFogNear,uFogFar,uT,uBeat,uFlick,uSeed,uRimK,uSlab,uLevelY,uTrimP,uPulse,uFogH,uBand,uFloodK; uniform vec3 uWarm,uFlood;
      varying vec3 vW; varying vec3 vN; varying float vId;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vN); vec3 c;
        float seed = vId * 7.31 + uSeed;
        if (abs(n.y) > 0.5) { c = uRoof * (0.8 + 0.4 * h(floor(vW.xz * 0.5) + seed)); }
        else {
          bool sx = abs(n.x) > abs(n.z);
          float along = sx ? vW.z : vW.x;
          float face = sx ? sign(n.x) : 2.0 * sign(n.z);
          vec2 cell = vec2(along / uColW, vW.y / uFloorH);
          vec2 id = floor(cell); vec2 f = fract(cell);
          float sd = seed + face * 3.7;
          float win = step(abs(f.x - 0.5), uWinX * 0.5) * step(abs(f.y - 0.45), uWinY * 0.5);
          float bLit = uLitP * (0.35 + 1.3 * h(vec2(vId, uSeed + 3.0)));                  // 每栋楼的亮窗率不同
          float lit = step(h(id + sd), bLit) * step(0.25, h(vec2(floor(id.y / 3.0), sd + 13.0)) + 0.3);
          lit = mix(lit, 1.0 - lit, step(1.0 - uFlick, h(id + sd + uBeat * 1.7)));
          lit *= step(vW.y, uLevelY);
          float pick = h(id * 1.7 + sd);
          vec3 lc = pick < 0.55 ? uLit0 : (pick < 0.85 ? uLit1 : uLit2);
          lc *= (0.55 + 0.45 * h(id + sd + 5.0)) * uGlow * (1.0 + uPulse * 0.6 * step(0.7, h(id + sd + 2.0)));
          lc *= mix(1.0, 0.55, step(0.5, f.x) * step(0.75, h(id + sd + 9.0)));      // 半拉的窗帘
          lc *= 0.7 + 0.6 * (1.0 - abs(f.y - 0.45) / max(uWinY, 0.01));                 // 窗内灯光：中间亮、边缘暗
          float ft = h(vec2(id.y, vId * 3.1 + uSeed));                                   // 楼层类型：通长灯带 / 全暗 / 普通
          if (ft < uBand) { win = step(abs(f.y - 0.45), uWinY * 0.42); lit = step(0.2, h(vec2(vId, id.y))); lc = uWarm * uGlow * (0.8 + 0.3 * sin(along * 0.3 + id.y)); }
          else if (ft < uBand + 0.22) lit = 0.0;
          vec3 wall = mix(uWall, uWall2, clamp(vW.y / uWallH, 0.0, 1.0)) * (0.6 + 0.6 * h(vec2(vId, uSeed + 7.0))) * (0.85 + 0.15 * h(vec2(0.0, floor(id.y / 5.0)) + sd));
          wall *= 1.0 - uSlab * step(0.88, f.y);                                     // 楼板线
          c = mix(wall, mix(uDark, lc, lit), win);
          float fw = max(fwidth(cell.x), fwidth(cell.y));                              // 远处窗格小于 ~2px 时淡成平均色，避免摩尔纹
          vec3 avg = mix(wall, mix(uDark, (uLit0 * 0.55 + uLit1 * 0.3 + uLit2 * 0.15) * 0.75 * uGlow, bLit), uWinX * uWinY);
          c = mix(c, avg, smoothstep(0.3, 0.75, fw));
          float ncol = step(1.0 - uNeonP, h(vec2(id.x, sd + 11.0)));                  // 竖向霓虹灯带
          float strip = ncol * step(abs(f.x - 0.5), 0.1) * step(mod(id.y + floor(h(vec2(id.x, sd)) * 7.0), 9.0), 5.0);
          vec3 nc = h(vec2(id.x, sd + 4.0)) < 0.5 ? uNeon : uNeon2;
          c = mix(c, nc * (1.5 + 0.5 * sin(uT * 4.0 + id.x * 1.3)), strip * (1.0 - win));
          float trim = step(1.0 - uTrimP, h(vec2(id.x, sd + 21.0))) * step(abs(f.x - 0.02), 0.03);
          c = mix(c, uTrim, trim);
          c *= sx ? (n.x > 0.0 ? 0.9 : 0.66) : (n.z > 0.0 ? 1.0 : 0.78);
          c += uFlood * uFloodK * (1.0 - smoothstep(0.0, uWallH * 0.35, vW.y)) * (1.0 - win * 0.5);   // 楼脚泛光
          c += uRim * uRimK * pow(max(0.0, 1.0 - abs(dot(n, normalize(cameraPosition - vW)))), 3.0);
        }
        float fg = smoothstep(uFogNear, uFogFar, length(vW - cameraPosition));
        if (uFogH > 0.0) fg = max(fg, (1.0 - smoothstep(0.0, uFogH, vW.y)) * 0.55 * smoothstep(10.0, 80.0, length(vW - cameraPosition)));
        gl_FragColor = vec4(mix(c, uFog, fg), 1.0);
      }`
  });
  m.userData.U = U;
  m.userData.tick = (t, beat, gAmt = 0, gBeat = 0, pulse = 0) => { U.uT.value = t; U.uBeat.value = beat; U.uGAmt.value = gAmt; U.uGBeat.value = gBeat; U.uPulse.value = pulse; };
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export function buildings(mat, list, { reflect = false } = {}) {
  if (reflect) {                                  // 湿地面倒影：同一批楼沿 y=0 镜像一份，配合半透明地面
    const g = new THREE.Group(); const a = buildings(mat, list); g.add(a);
    const b = buildings(mat, list); b.scale.y = -1; b.castShadow = false; b.receiveShadow = false; g.add(b); g.userData.real = a; return g;
  }
  const mesh = new THREE.InstancedMesh(BOX, mat, Math.max(1, list.length));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  list.forEach((b, i) => {
    Q.setFromEuler(E.set(b.rx || 0, b.ry || 0, b.rz || 0));
    M.compose(new THREE.Vector3(b.x, b.y || 0, b.z), Q, new THREE.Vector3(b.w, b.h, b.d)); mesh.setMatrixAt(i, M);
  });
  mesh.count = list.length; mesh.frustumCulled = false; mesh.userData.list = list; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
// 环形城市布局：在半径 [r0, r1] 的环带里撒 n 栋楼（360°），heightFn(r, a, R) → 高度
export function ringLayout(n, r0, r1, { seed = 1, wMin = 4, wMax = 12, hMin = 10, hMax = 60, skipArc = null } = {}) {
  const R = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    if (skipArc && Math.abs(Math.atan2(Math.sin(a - skipArc[0]), Math.cos(a - skipArc[0]))) < skipArc[1]) continue;
    const r = r0 + Math.pow(R(), 0.8) * (r1 - r0), w = wMin + R() * (wMax - wMin);
    out.push({ x: Math.sin(a) * r, z: -Math.cos(a) * r, w, d: wMin + R() * (wMax - wMin), h: hMin + Math.pow(R(), 1.6) * (hMax - hMin), ry: Math.round(R() * 4) * Math.PI / 2 + (R() < 0.2 ? R() * 0.4 : 0) });
  }
  return out;
}

export function skyMat(o = {}) {
  const p = { stops: [[-0.2, 0x050510], [0.0, 0x1a1030], [0.25, 0x302060], [1.0, 0x05030d]], cloudA: 0xffffff, cloudB: 0x888888, cloud: 0, cloudY: [0.02, 0.35], cloudScale: 3, levels: 6, stars: 0, sunDir: null, sunCol: 0xffffff, sunSize: 0.06, drift: 0.01, ...o };
  const st = p.stops.slice(0, 5); while (st.length < 5) st.push(st[st.length - 1]);
  const U = {
    uS0: { value: V3(st[0][1]) }, uS1: { value: V3(st[1][1]) }, uS2: { value: V3(st[2][1]) }, uS3: { value: V3(st[3][1]) }, uS4: { value: V3(st[4][1]) },
    uP: { value: new THREE.Vector4(st[1][0], st[2][0], st[3][0], st[4][0]) }, uP0: { value: st[0][0] },
    uCA: { value: V3(p.cloudA) }, uCB: { value: V3(p.cloudB) }, uCloud: { value: p.cloud }, uCY: { value: new THREE.Vector2(...p.cloudY) }, uCS: { value: p.cloudScale },
    uLv: { value: p.levels }, uStars: { value: p.stars }, uSun: { value: p.sunDir ? new THREE.Vector3(...p.sunDir).normalize() : new THREE.Vector3(0, -1, 0) },
    uSunC: { value: V3(p.sunCol) }, uSunS: { value: p.sunDir ? p.sunSize : 0 }, uT: { value: 0 }, uDrift: { value: p.drift }, uBeat: { value: 0 }, uSort: { value: 0 }
  };
  const m = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `
      uniform vec3 uS0,uS1,uS2,uS3,uS4,uCA,uCB,uSun,uSunC; uniform vec4 uP; uniform float uP0,uCloud,uCS,uLv,uStars,uSunS,uT,uDrift,uBeat,uSort; uniform vec2 uCY;
      varying vec3 vD;
      ${NOISE}
      void main(){
        vec3 v = normalize(vD); float y = v.y; float az = atan(v.z, v.x);
        if (uSort > 0.0) {                                    // 像素排序：按拍子把部分竖条往下拖
          float colI = floor(az * 60.0); float th = h21(vec2(colI, uBeat));
          if (th < uSort && y < th * 0.6) y = mix(y, th * 0.6, 0.85);
        }
        vec3 c = uS0;
        c = mix(c, uS1, smoothstep(uP0, uP.x, y)); c = mix(c, uS2, smoothstep(uP.x, uP.y, y));
        c = mix(c, uS3, smoothstep(uP.y, uP.z, y)); c = mix(c, uS4, smoothstep(uP.z, uP.w, y));
        if (uCloud > 0.0) {
          vec2 q = vec2(az * uCS * 1.6 + uT * uDrift, y * uCS * 7.0);
          float n = fbm(q + vec2(fbm(q * 0.7 + 3.0) * 1.5, 0.0));
          float band = smoothstep(uCY.x, uCY.x + 0.06, y) * (1.0 - smoothstep(uCY.y - 0.08, uCY.y, y));
          float cm = smoothstep(0.48, 0.72, n) * band * uCloud;
          float sh = smoothstep(0.45, 0.85, fbm(q * 1.7 + 9.0));
          vec3 cc = mix(uCB, uCA, sh);
          cm = floor(cm * uLv + 0.5) / uLv;
          c = mix(c, cc, cm);
        }
        if (uStars > 0.0) { vec2 g = vec2(az * 220.0, y * 140.0); float s = step(0.997, h21(floor(g))) * smoothstep(0.0, 0.25, y); c += s * uStars * (0.5 + 0.5 * h21(floor(g) + 3.0)); }
        if (uSunS > 0.0) { float d = 1.0 - dot(v, uSun); float disk = 1.0 - smoothstep(uSunS * 0.9, uSunS, d * 10.0); c = mix(c, uSunC, disk); c += uSunC * 0.25 * exp(-d * 30.0); }
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), m);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  mesh.userData.U = U;
  return mesh;
}

// 霓虹招牌：深色底板 + 发光描边 + 文字；vertical 时逐字竖排
const SIGN_CACHE = new Map();
export function signTex(text, { color = '#ff3fa4', vertical = false, bg = 'rgba(8,4,14,0.85)', font = '"NotoSC9","Exo2",sans-serif', size = 64 } = {}) {
  const key = [text, color, vertical, bg, size].join('|');
  if (SIGN_CACHE.has(key)) return SIGN_CACHE.get(key);
  const chars = [...text];
  const cv = document.createElement('canvas'); const g = cv.getContext('2d');
  g.font = `900 ${size}px ${font}`;
  const pad = size * 0.35;
  if (vertical) { cv.width = Math.ceil(size + pad * 2); cv.height = Math.ceil(chars.length * size * 1.05 + pad * 2); }
  else { cv.width = Math.ceil(g.measureText(text).width + pad * 2); cv.height = Math.ceil(size * 1.25 + pad * 2); }
  g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = color; g.lineWidth = size * 0.06; g.shadowColor = color; g.shadowBlur = size * 0.25;
  g.strokeRect(size * 0.12, size * 0.12, cv.width - size * 0.24, cv.height - size * 0.24);
  g.font = `900 ${size}px ${font}`; g.fillStyle = '#fff6f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) chars.forEach((ch, i) => g.fillText(ch, cv.width / 2, pad + size * 0.55 + i * size * 1.05));
  else g.fillText(text, cv.width / 2, cv.height / 2 + size * 0.04);
  g.shadowBlur = 0; g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.globalAlpha = 0.35; g.fillRect(0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const e = { tex, aspect: cv.width / cv.height }; SIGN_CACHE.set(key, e); return e;
}
export function signMesh(text, height, o = {}) {
  const e = signTex(text, o);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * e.aspect, height), new THREE.MeshBasicMaterial({ map: e.tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  m.userData.base = 1; return m;
}
export const SIGN_WORDS = ['CAOS', 'VERDAD', 'MOMENTO', 'GLITCH', 'VACIO', 'ECO', 'NOCHE', 'SUENO', 'NEON', 'ABIERTO', '24H', 'ESPEJO', 'ALMA', 'FANTASMA', 'CIBER', 'LUZ', 'HOTEL', 'BAR'];
export const pick = (arr, x) => arr[Math.floor(x * arr.length) % arr.length];

// 透明 PNG/面片的通用加色材质
export const addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });

// 地面（带雾的纯色平面）
export function ground(color, size = 1200, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: col(color), toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}

// 湿地面：半透明深色平面，盖在镜像楼群上 → 倒影
export function wetGround(color, opacity = 0.78, size = 2400) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity, toneMapped: false, depthWrite: true }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.renderOrder = 1; return m;
}
