// 真 3D 立体假名（VR 专用）。
//  · 字形来自 VRMV/assets/kana3d/*.json（tools/make_kana_fonts.mjs 从字体提取的 46 个假名）
//  · twinify()：扫描一个场景里所有"假名贴图平面"（原 MV 用 glyphMesh 画的字），给每个平面挂一个立体字"替身"，
//    原平面移到不渲染的图层。替身作为子物体，自动继承原场景对位置、缩放、显隐的所有控制；
//    每帧从原平面读取：哪个字（从贴图坐标反推）、颜色、透明度。原 MV 的代码完全不用改。
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { KANA, PAL } from '../../web/src/lib.js';
import { HIDE_LAYER } from './vr_config.js';

export const FONT_KEYS = ['light', 'thin', 'zen', 'dot', 'train'];   // 都是细字体；light 为默认
const fonts = {};
export async function loadKanaFonts() {
  const loader = new FontLoader();
  await Promise.all(FONT_KEYS.map(async (k) => {
    const r = await fetch(new URL(`../assets/kana3d/${k}.json`, import.meta.url));
    if (r.ok) fonts[k] = loader.parse(await r.json());
  }));
  if (!fonts.light) throw new Error('缺少 3D 字体 light.json');
}

// 字形几何：宽度 1 的方格内（与原 MV 图集一致：字高约 0.78），中心在原点，沿 z 方向挤出
const geoCache = new Map();
export function kanaGeo(ch, font = 'light', depth = 0.12) {
  const f = fonts[font] ? font : 'light';
  const key = `${f}|${ch}|${depth}`;
  let g = geoCache.get(key);
  if (g) return g;
  // 细字体：倒角很小，避免把笔画撑粗
  g = new TextGeometry(ch, { font: fonts[f], size: 0.78, depth, curveSegments: 5, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.004, bevelSegments: 1 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// 立体字材质：正面发光、侧面带流动光纹与边缘光，不依赖场景灯光（各场景灯光差异很大）
const TIME = { value: 0 };
export const setKanaTime = (t) => { TIME.value = t; };
const VS = `varying vec3 vN; varying vec3 vVN; varying vec3 vVP; varying float vZ; varying float vY;
void main(){ vN = normal; vZ = position.z; vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vVP = mv.xyz; vVN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`;
const FS = `uniform vec3 uColor; uniform vec3 uRim; uniform float uOpacity; uniform float uT; uniform float uGlow;
varying vec3 vN; varying vec3 vVN; varying vec3 vVP; varying float vZ; varying float vY;
void main(){
  float cap = abs(vN.z);
  // 正面：上亮下暗的渐变 + 一道缓慢扫过的高光，避免整块平涂
  float g = 0.62 + 0.45 * smoothstep(-0.42, 0.42, vY);
  float sweep = smoothstep(0.08, 0.0, abs(fract(vY * 0.8 - uT * 0.35) - 0.5) - 0.42);
  vec3 front = uColor * g * 0.95 + uRim * 0.18 * (1.0 - g) + vec3(sweep * 0.25);
  float band = 0.5 + 0.5 * sin(vZ * 70.0 - uT * 5.0);
  vec3 side = mix(uColor * 0.22, uRim, 0.45 + 0.4 * band);
  vec3 c = mix(side, front, smoothstep(0.55, 0.95, cap));
  if (vN.z < -0.6) c = uColor * 0.3;
  float fres = pow(1.0 - abs(dot(normalize(vVN), normalize(-vVP))), 2.5);
  c += uRim * fres * 0.7 * uGlow;
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`;
export function kanaMaterial(color = 0xffffff, rim = PAL.cyan) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uOpacity: { value: 1 }, uT: TIME, uGlow: { value: 1 } },
    vertexShader: VS, fragmentShader: FS, transparent: true, toneMapped: false,
  });
}

// 从贴图坐标反推平面上画的是哪个假名（glyphGeo 第 0 个顶点的 uv = 图集格子左上角）
const charCache = new WeakMap();
function charOf(geo, atlas) {
  let c = charCache.get(geo);
  if (c !== undefined) return c;
  const uv = geo.attributes && geo.attributes.uv;
  c = null;
  if (uv) {
    const col = Math.round(uv.getX(0) * atlas.cols), row = Math.round((1 - uv.getY(0)) * atlas.rows);
    c = KANA[row * atlas.cols + col] || null;
  }
  charCache.set(geo, c);
  return c;
}

const clearDepth = (renderer) => renderer.clearDepth();   // 原平面不做深度测试（叠在最上层）的，替身绘制前清深度，保证立体字自身遮挡正确
const PINK = new THREE.Color(PAL.pink), CYAN = new THREE.Color(PAL.cyan);

// root：场景；atlas：原 MV 的实心假名图集（ctx.atlasF）。宽度小于 minWidth 的小字（例如五十音表格子）保持平面
export function twinify(root, atlas, { minWidth = 0.95, font = 'light' } = {}) {
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.map === atlas.tex && o.geometry && o.geometry.parameters && o.geometry.parameters.width >= minWidth) targets.push(o);
  });
  const pairs = targets.map((o) => {
    const tw = new THREE.Mesh(kanaGeo('ア', font), kanaMaterial());
    tw.visible = false; tw.name = 'kana3d';
    if (o.material.depthTest === false) tw.onBeforeRender = clearDepth;
    o.add(tw);
    o.layers.set(HIDE_LAYER);
    return { o, tw, geo: null, ch: null };
  });
  return {
    count: pairs.length,
    sync() {
      for (const p of pairs) {
        const o = p.o;
        if (!o.visible) continue;                      // 父物体隐藏时替身也不会渲染
        if (o.geometry !== p.geo) {
          p.geo = o.geometry;
          const ch = charOf(o.geometry, atlas);
          if (ch && ch !== p.ch) p.tw.geometry = kanaGeo(ch, font);
          p.ch = ch;
          p.tw.scale.setScalar(o.geometry.parameters.width || 1);
        }
        const m = o.material, u = p.tw.material.uniforms;
        // 原平面字是加法混合（半透明也很亮），立体字用实体渲染，所以透明度放大一些
        const op = Math.min(1, m.opacity * 1.7);
        p.tw.visible = !!p.ch && m.visible !== false && op > 0.01;
        if (!p.tw.visible) continue;
        u.uColor.value.copy(m.color); u.uOpacity.value = op;
        u.uRim.value.copy(m.color.b > m.color.r ? PINK : CYAN);
        p.tw.material.depthWrite = op > 0.35;          // 写深度：立体字自身前后遮挡正确，不会透出背面
        p.tw.renderOrder = o.renderOrder;
      }
    },
  };
}
