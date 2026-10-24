// 真实质感的城市：MeshStandardMaterial（受光、投影、反射天空环境）+ 着色器注入的程序化立面。
//   cityPBR(opts)      与 city.js 的 cityMat 参数相同；立面 = 墙板噪声 + 竖梃 + 楼板 + 玻璃（低粗糙度、反射环境）+ 亮窗自发光（室内景深渐变）
//   nightRig(ctx, scene, o)  月光（可投影）+ 半球天光 + 环境贴图（由天空球生成）
//   envFromSky(ctx, sky)     天空球 → PMREM 环境贴图
// 雾在着色器里自己做（距离雾 + 贴地雾），与旧版一致；所有动态只由 t / 拍子决定。
import * as THREE from 'three';
import { col } from '../lib.js';

const V3 = (h) => col(h);

export function cityPBR(o = {}) {
  const d = {
    wall: 0x1a2030, wall2: 0x2a3348, wallH: 60, lit: [0xffb35a, 0xffd28a, 0xff7a3a], dark: 0x0a0d16, litP: 0.5, glow: 1.4,
    floorH: 3.2, colW: 2.6, winX: 0.62, winY: 0.55, neon: 0xff3fa4, neonP: 0.08, neon2: 0x3ff0ff, roof: 0x0e1018,
    fog: 0x0b1a3a, fogNear: 40, fogFar: 260, flick: 0.04, seed: 0, slab: 0.35, levelY: 9999, trim: 0x000000, trimP: 0,
    fogH: 0, band: 0.12, flood: 0, rough: 0.78, glassRough: 0.1, glassMetal: 0.65
  };
  const p = { ...d, ...o };
  const U = {
    uWall: { value: V3(p.wall) }, uWall2: { value: V3(p.wall2) }, uWallH: { value: p.wallH },
    uLit0: { value: V3(p.lit[0]) }, uLit1: { value: V3(p.lit[1]) }, uLit2: { value: V3(p.lit[2]) }, uDark: { value: V3(p.dark) },
    uLitP: { value: p.litP }, uGlow: { value: p.glow }, uFloorH: { value: p.floorH }, uColW: { value: p.colW },
    uWinX: { value: p.winX }, uWinY: { value: p.winY }, uNeon: { value: V3(p.neon) }, uNeon2: { value: V3(p.neon2) }, uNeonP: { value: p.neonP },
    uRoof: { value: V3(p.roof) }, uFog: { value: V3(p.fog) }, uFogNear: { value: p.fogNear }, uFogFar: { value: p.fogFar }, uFogH: { value: p.fogH },
    uT: { value: 0 }, uBeat: { value: 0 }, uFlick: { value: p.flick }, uSeed: { value: p.seed }, uSlab: { value: p.slab }, uLevelY: { value: p.levelY },
    uTrim: { value: V3(p.trim) }, uTrimP: { value: p.trimP }, uPulse: { value: 0 }, uBand: { value: p.band }, uWarm: { value: V3(p.warm ?? p.lit[0]) },
    uFloodK: { value: p.flood }, uFlood: { value: V3(p.floodCol ?? p.lit[0]) }, uGR: { value: p.glassRough }, uGM: { value: p.glassMetal }, uWR: { value: p.rough },
    uGAmt: { value: 0 }, uGBeat: { value: 0 },
    uScanY: { value: -9999 }, uScanK: { value: 0 }, uScanC: { value: V3(0x40ffff) },
    uWaveC: { value: new THREE.Vector2() }, uWaveR: { value: -100 }, uWaveK: { value: 0 }, uWaveW: { value: 6 }, uWaveCol: { value: V3(0xffffff) }
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: p.rough, metalness: 0.05, envMapIntensity: p.envK ?? 1.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN; varying float vGId; uniform float uGAmt, uGBeat;\nfloat gh2(float n){return fract(sin(n*91.3458)*47453.5453);}')
      .replace('#include <project_vertex>', `
        vec4 gwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gwp = instanceMatrix * gwp; vGId = float(gl_InstanceID);
          vGN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vGId = 0.0; vGN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        gwp = modelMatrix * gwp; vGW = gwp.xyz;
        float gband = floor(gwp.y * 0.35); float ggr = gh2(gband * 1.37 + uGBeat * 3.17);
        gwp.x += step(0.78, ggr) * (gh2(gband * 1.93 + uGBeat) - 0.5) * uGAmt;
        vec4 mvPosition = viewMatrix * gwp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW; varying vec3 vGN; varying float vGId;
        uniform vec3 uWall,uWall2,uLit0,uLit1,uLit2,uDark,uNeon,uNeon2,uRoof,uFog,uTrim,uWarm,uFlood;
        uniform float uWallH,uLitP,uGlow,uFloorH,uColW,uWinX,uWinY,uNeonP,uFogNear,uFogFar,uFogH,uT,uBeat,uFlick,uSeed,uSlab,uLevelY,uTrimP,uPulse,uBand,uFloodK,uGR,uGM,uWR;
        uniform float uScanY,uScanK,uWaveR,uWaveK,uWaveW; uniform vec3 uScanC,uWaveCol; uniform vec2 uWaveC;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
        vec3 gEmit; float gGlass; float gRough;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vGN); gEmit = vec3(0.0); gGlass = 0.0; gRough = uWR;
          float seed = vGId * 7.31 + uSeed;
          if (abs(n.y) > 0.5) {
            diffuseColor.rgb = uRoof * (0.7 + 0.5 * vn(vGW.xz * 0.4 + seed)) * (0.8 + 0.4 * hh(floor(vGW.xz * 0.25) + seed));
            gRough = 0.9;
          } else {
            bool sx = abs(n.x) > abs(n.z);
            float along = sx ? vGW.z : vGW.x;
            float face = sx ? sign(n.x) : 2.0 * sign(n.z);
            vec2 cell = vec2(along / uColW, vGW.y / uFloorH);
            vec2 id = floor(cell); vec2 f = fract(cell);
            float sd = seed + face * 3.7;
            float win = step(abs(f.x - 0.5), uWinX * 0.5) * step(abs(f.y - 0.45), uWinY * 0.5);
            float bLit = uLitP * (0.35 + 1.3 * hh(vec2(vGId, uSeed + 3.0)));
            float lit = step(hh(id + sd), bLit) * step(0.25, hh(vec2(floor(id.y / 3.0), sd + 13.0)) + 0.3);
            lit = mix(lit, 1.0 - lit, step(1.0 - uFlick, hh(id + sd + uBeat * 1.7)));
            lit *= step(vGW.y, uLevelY);
            float pick = hh(id * 1.7 + sd);
            vec3 lc = pick < 0.55 ? uLit0 : (pick < 0.85 ? uLit1 : uLit2);
            lc *= (0.5 + 0.5 * hh(id + sd + 5.0)) * uGlow * (1.0 + uPulse * 0.6 * step(0.7, hh(id + sd + 2.0)));
            float inner = vn(vec2(f.x * 6.0 + id.x * 3.0, f.y * 3.0 + id.y * 5.0));             // 室内：家具剪影 / 灯源位置
            lc *= mix(0.45, 1.25, smoothstep(0.25, 0.75, inner)) * (0.75 + 0.5 * (1.0 - f.y));
            lc *= mix(1.0, 0.35, step(0.55, f.x) * step(0.7, hh(id + sd + 9.0)));             // 拉了一半的窗帘
            float ft = hh(vec2(id.y, vGId * 3.1 + uSeed));
            if (ft < uBand) { win = step(abs(f.y - 0.45), uWinY * 0.42); lit = step(0.2, hh(vec2(vGId, id.y))); lc = uWarm * uGlow * (0.7 + 0.3 * vn(vec2(along * 0.15, id.y))); }
            else if (ft < uBand + 0.22) lit = 0.0;
            // 墙：大板 + 噪声 + 竖梃 + 楼板 + 风化
            float panel = vn(vec2(along * 0.08, vGW.y * 0.04) + seed) * 0.5 + vn(vec2(along * 0.9, vGW.y * 0.6) + seed) * 0.25;
            vec3 wall = mix(uWall, uWall2, clamp(vGW.y / uWallH, 0.0, 1.0)) * (0.65 + 0.5 * hh(vec2(vGId, uSeed + 7.0))) * (0.75 + panel * 0.6);
            wall *= 1.0 - uSlab * smoothstep(0.86, 0.9, f.y) * (1.0 - smoothstep(0.96, 1.0, f.y));
            wall *= 1.0 - 0.25 * smoothstep(0.03, 0.0, abs(f.x - 0.02));
            wall *= 0.55 + 0.45 * smoothstep(0.0, 6.0, vGW.y);                                 // 楼脚的接触阴影
            float fw = max(fwidth(cell.x), fwidth(cell.y)), far = smoothstep(0.35, 0.8, fw);
            gGlass = win * (1.0 - far * 0.6);
            diffuseColor.rgb = mix(wall, uDark, gGlass);
            gEmit = lc * lit * win;
            gEmit = mix(gEmit, (uLit0 * 0.55 + uLit1 * 0.3 + uLit2 * 0.15) * uGlow * 0.6 * bLit * uWinX * uWinY, far);
            float ncol = step(1.0 - uNeonP, hh(vec2(id.x, sd + 11.0)));
            float strip = ncol * step(abs(f.x - 0.5), 0.08) * step(mod(id.y + floor(hh(vec2(id.x, sd)) * 7.0), 9.0), 5.0);
            vec3 nc = hh(vec2(id.x, sd + 4.0)) < 0.5 ? uNeon : uNeon2;
            gEmit += nc * (2.2 + 0.6 * sin(uT * 4.0 + id.x * 1.3)) * strip * (1.0 - win);
            float trim = step(1.0 - uTrimP, hh(vec2(id.x, sd + 21.0))) * step(abs(f.x - 0.02), 0.03);
            gEmit += uTrim * trim * 1.5;
            gEmit += uFlood * uFloodK * (1.0 - smoothstep(0.0, uWallH * 0.35, vGW.y)) * (1.0 - win * 0.5) * 0.6;
            gRough = mix(uWR, uGR, gGlass);
          }
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(0.05, uGM, gGlass);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;
        {
          vec3 sn = normalize(vGN);
          // 全息扫描带：一道亮线沿楼体上下扫过，线下拖着竖向网格
          float sdy = vGW.y - uScanY;
          float sband = exp(-abs(sdy) * 1.4) * 1.8 + exp(-sdy * sdy * 0.004) * 0.3 * step(sdy, 0.0);
          float sgrid = 0.3 + 0.7 * step(0.82, fract((abs(sn.x) > abs(sn.z) ? vGW.z : vGW.x) * 0.31));
          totalEmissiveRadiance += uScanC * uScanK * sband * sgrid;
          // 冲击波：从中心向外扩散，贴着楼体和地面
          float wd = (length(vGW.xz - uWaveC) - uWaveR) / uWaveW;
          float wv = exp(-wd * wd) * 1.6 + step(wd, 0.0) * exp(min(wd, 0.0) * 0.35) * 0.18;
          wv *= exp(-vGW.y * 0.012) * (0.4 + 0.6 * vn(vGW.xz * 0.5 + vGW.y * 0.3));
          totalEmissiveRadiance += uWaveCol * uWaveK * wv;
        }`)
      .replace('#include <fog_fragment>', `
        { float dd = length(vGW - cameraPosition); float fg = smoothstep(uFogNear, uFogFar, dd);
          if (uFogH > 0.0) fg = max(fg, (1.0 - smoothstep(0.0, uFogH, vGW.y)) * 0.6 * smoothstep(10.0, 90.0, dd));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, fg); }`);
  };
  m.customProgramCacheKey = () => 'cityPBR';
  m.userData.U = U;
  m.userData.scan = (y, k, color) => { U.uScanY.value = y; U.uScanK.value = k; if (color != null) U.uScanC.value.set(color); };
  m.userData.wave = (x, z, r, k, w = 6, color) => { U.uWaveC.value.set(x, z); U.uWaveR.value = r; U.uWaveK.value = k; U.uWaveW.value = w; if (color != null) U.uWaveCol.value.set(color); };
  m.userData.tick = (t, beat, gAmt = 0, gBeat = 0, pulse = 0) => { U.uT.value = t; U.uBeat.value = beat; U.uGAmt.value = gAmt; U.uGBeat.value = gBeat; U.uPulse.value = pulse; };
  return m;
}

export function envFromSky(ctx, sky, extra = []) {
  const s = new THREE.Scene(); s.add(sky.clone()); extra.forEach((o) => s.add(o));
  const pm = new THREE.PMREMGenerator(ctx.renderer); const rt = pm.fromScene(s, 0.02, 0.1, 1000); pm.dispose();
  return rt.texture;
}

// 夜景灯光：月光（投影）+ 半球光 + 环境贴图
export function nightRig(ctx, scene, o = {}) {
  const p = { moon: 0x8aa0d8, moonI: 2.6, dir: [-0.5, 0.7, -0.4], hemiSky: 0x34466a, hemiGround: 0x140c0c, hemiI: 1.3, shadow: true, size: 260, center: [0, 0, -60], env: null, envK: 1, ...o };
  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiI); scene.add(hemi);
  const L = new THREE.DirectionalLight(p.moon, p.moonI);
  const c = new THREE.Vector3(...p.center), dir = new THREE.Vector3(...p.dir).normalize();
  L.position.copy(c).addScaledVector(dir, 400); L.target.position.copy(c); scene.add(L); scene.add(L.target);
  if (p.shadow && !ctx.vr) {
    ctx.renderer.shadowMap.enabled = true; ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    L.castShadow = true; L.shadow.mapSize.set(2048, 2048);
    const sc = L.shadow.camera; sc.left = -p.size; sc.right = p.size; sc.top = p.size; sc.bottom = -p.size; sc.near = 1; sc.far = 900;
    L.shadow.bias = -0.0006; L.shadow.normalBias = 0.6; L.shadow.radius = 3;
  }
  if (p.env) { scene.environment = p.env; scene.environmentIntensity = p.envK; }
  return { hemi, moon: L };
}
export function shadowy(obj, cast = true, recv = true) { obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } }); return obj; }
