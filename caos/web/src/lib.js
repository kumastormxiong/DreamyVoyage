// 公共积木：色板、字体、文字贴图、光晕、星点、霓虹网格、落日、环境贴图、确定性随机数。
// 场景只能用这里的 rng(seed)/hash(n) 取随机数，不能用 Math.random() —— 否则逐帧导出不可复现。
import * as THREE from 'three';

export let PROJECT = {};
export let PAL = { a: 0xff2f8f, b: 0x3ff6ff, c: 0xff4fd8, d: 0xffd84a, bg: 0x06010d, white: 0xffffff };
export let FONT_DISPLAY = '"Exo2", sans-serif';
export let FONT_LYRIC = '"NotoSC9", "Yu Gothic", "Microsoft YaHei", sans-serif';

export const col = (h) => new THREE.Color(h);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const ease = { out: (x) => 1 - Math.pow(1 - clamp(x), 3), inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }, back: (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); } };

// 读取 project.json：色板、字体、标题。base = 网页相对 web/ 的路径（VR 版用 <base> 指向 web/，所以同样是 './'）
export async function loadProject(url = './project.json') {
  try { PROJECT = await fetch(url).then((r) => r.json()); } catch (e) { PROJECT = {}; }
  const st = PROJECT.style || {};
  if (st.palette && st.palette.length >= 4) {
    const h = st.palette.map((x) => parseInt(x.replace('#', ''), 16));
    PAL = { a: h[0], b: h[1], c: h[2], d: h[3], bg: st.bg ? parseInt(st.bg.replace('#', ''), 16) : (h[4] ?? 0x06010d), white: 0xffffff };
  }
  if (st.font_display) FONT_DISPLAY = `"${st.font_display}", sans-serif`;
  if (st.font_lyric) FONT_LYRIC = `"${st.font_lyric}", "Yu Gothic", "Microsoft YaHei", sans-serif`;
  return PROJECT;
}

export async function loadFonts() {
  for (const [name, url] of PROJECT.fonts || []) {
    try { const f = new FontFace(name, `url(${url})`); await f.load(); document.fonts.add(f); } catch (e) { console.warn('字体加载失败', name, url); }
  }
  await document.fonts.ready;
}

// ---- 文字贴图（标题、歌词、署名……）。chrome=铬金属渐变，glow=发光色
export function textTexture(text, o = {}) {
  const { font = FONT_LYRIC, size = 200, weight = '900', italic = false, fill = '#fff', stroke = null, strokeW = 0, pad = 60, chrome = false, glow = null, spacing = 0 } = o;
  const g0 = document.createElement('canvas').getContext('2d');
  const f = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  g0.font = f; if ('letterSpacing' in g0) g0.letterSpacing = spacing + 'px';
  const w = Math.ceil(g0.measureText(text).width + pad * 2), h = Math.ceil(size * 1.4 + pad * 2);
  const cv = document.createElement('canvas'); cv.width = Math.max(2, w); cv.height = h;
  const g = cv.getContext('2d'); g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = spacing + 'px';
  const cx = w / 2 + spacing / 2, cy = h / 2 + size * 0.04;
  if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.18; }
  if (chrome) {
    const gr = g.createLinearGradient(0, cy - size * 0.55, 0, cy + size * 0.55);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.42, '#ffd1ee'); gr.addColorStop(0.5, '#ff5fb0'); gr.addColorStop(0.52, '#3a0a4a'); gr.addColorStop(0.74, '#ff4fd8'); gr.addColorStop(1, '#ffe9a8');
    g.fillStyle = gr;
  } else g.fillStyle = fill;
  if (stroke && strokeW) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, cx, cy); }
  g.fillText(text, cx, cy);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { tex, w, h, aspect: w / h, canvas: cv };
}
export function textMesh(text, height, o = {}, additive = true) {
  const t = textTexture(text, o);
  const m = new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * t.aspect, height), m); mesh.userData.tex = t;
  return mesh;
}

// ---- 字符图集：把一组字（歌词里出现的所有字）画进一张贴图，用于大量重复的字（字雨、字墙）
export function makeAtlas(chars, mode = 'filled', cell = 192) {
  chars = [...new Set(chars)];
  const cols = Math.ceil(Math.sqrt(chars.length)), rows = Math.ceil(chars.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${cell * 0.74}px ${FONT_LYRIC}`;
  chars.forEach((ch, i) => {
    const cx = (i % cols + 0.5) * cell, cy = (Math.floor(i / cols) + 0.5) * cell + cell * 0.04;
    if (mode === 'outline') { g.lineWidth = cell * 0.035; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.strokeText(ch, cx, cy); }
    else { g.fillStyle = '#fff'; g.fillText(ch, cx, cy); }
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const idx = {}; chars.forEach((c, i) => { idx[c] = i; });
  return { tex, cols, rows, idx, chars };
}
export function glyphGeo(atlas, ch, w = 1, h = 1) {
  const i = atlas.idx[ch] ?? 0; const c = i % atlas.cols, r = Math.floor(i / atlas.cols);
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k)) / atlas.cols, 1 - (r + 1 - uv.getY(k)) / atlas.rows);
  return g;
}
export function glyphMesh(atlas, ch, color = PAL.a, size = 1, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: col(color), opacity });
  return new THREE.Mesh(glyphGeo(atlas, ch, size, size), m);
}

// ---- 径向光晕
export function glowTexture(inner = '255,255,255', size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${inner},1)`); gr.addColorStop(0.25, `rgba(${inner},0.45)`); gr.addColorStop(0.6, `rgba(${inner},0.1)`); gr.addColorStop(1, `rgba(${inner},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
export function glowSprite(hex, size, opacity = 1) {
  const c = col(hex), rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const m = new THREE.MeshBasicMaterial({ map: glowTexture(rgb), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
}

// ---- 星点（球壳分布）
export function makeStars(n = 1800, radius = 160, size = 1.6, seed = 7, color = 0xffffff) {
  const R = rng(seed), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, r = radius * (0.6 + R() * 0.4), s = Math.sqrt(1 - u * u);
    p.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
}

// ---- 霓虹网格地面（向镜头滚动），update(t) 由场景调用
export function makeGrid({ size = 600, speed = 14, scale = 3, colA = PAL.c, colB = PAL.b, y = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uT: { value: 0 }, uSpeed: { value: speed }, uScale: { value: scale }, uA: { value: col(colA) }, uB: { value: col(colB) }, uGain: { value: 1 } },
    vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uT,uSpeed,uScale,uGain;uniform vec3 uA,uB;varying vec3 vP;
      void main(){ vec2 p=vec2(vP.x,vP.y+uT*uSpeed)/uScale; vec2 g=abs(fract(p-0.5)-0.5)/fwidth(p);
        float l=1.0-min(min(g.x,g.y),1.0); float d=length(vP.xy)/${(size / 2).toFixed(1)};
        vec3 c=mix(uB,uA,smoothstep(0.0,0.6,d)); gl_FragColor=vec4(c*l*uGain,l*(1.0-smoothstep(0.35,1.0,d)));}`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat); m.rotation.x = -Math.PI / 2; m.position.y = y;
  m.userData.update = (t, gain = 1) => { mat.uniforms.uT.value = t; mat.uniforms.uGain.value = gain; };
  return m;
}

// ---- 复古落日（横条纹切口）
export function makeSun(r = 20, top = PAL.d, bottom = PAL.a) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, uniforms: { uT: { value: 0 }, uA: { value: col(top) }, uB: { value: col(bottom) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uT;uniform vec3 uA,uB;varying vec2 vUv;void main(){vec2 c=vUv-0.5;float d=length(c);if(d>0.5)discard;
      float y=vUv.y;float band=step(0.5,fract(y*14.0-uT*0.6));float cut=y<0.48?band:1.0;if(cut<0.5)discard;
      gl_FragColor=vec4(mix(uB,uA,y)*1.3,1.0-smoothstep(0.47,0.5,d));}`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat);
  m.userData.update = (t) => { mat.uniforms.uT.value = t; };
  return m;
}

// ---- 霓虹环境贴图（金属/铬材质反射用）
export function makeEnv(renderer) {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 v;
    void main(){ float y=v.y; vec3 top=vec3(0.03,0.0,0.09); vec3 hor=vec3(0.75,0.1,0.4); vec3 low=vec3(0.0,0.02,0.06);
      vec3 c=mix(hor,top,smoothstep(0.0,0.7,y)); c=mix(c,low,smoothstep(0.0,-0.35,y)); float a=atan(v.z,v.x);
      c+=vec3(0.15,0.95,1.0)*smoothstep(0.93,0.99,sin(a*3.0+0.6))*smoothstep(-0.1,0.5,y)*1.5;
      c+=vec3(1.0,0.25,0.65)*smoothstep(0.95,0.995,sin(a*5.0+2.0))*smoothstep(-0.3,0.3,y)*1.4;
      gl_FragColor=vec4(c,1.);}`
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(s, 0.02); pm.dispose();
  return rt.texture;
}

// ---- 场景基础：scene + camera（camera 必须加进 scene，挂在 camera 上的歌词层才会被渲染；VR 版也依赖这一点）
export function makeStage(ctx, { fov = 60, near = 0.1, far = 1000, bg = PAL.bg, fog = null } = {}) {
  const scene = new THREE.Scene(); scene.background = col(bg);
  if (fog) scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
  const camera = new THREE.PerspectiveCamera(fov, ctx.W / ctx.H, near, far);
  scene.add(camera);
  return { scene, camera };
}
