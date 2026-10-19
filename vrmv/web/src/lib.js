// 公共积木：色板、假名图集、文字贴图、霓虹环境、网格地面、落日、锁链、幽灵剪影
import * as THREE from 'three';

export const PAL = { pink: 0xff2f8f, magenta: 0xff4fd8, cyan: 0x3ff6ff, orange: 0xff8a3a, yellow: 0xffd84a, void: 0x06010d, violet: 0x2a0b4a, white: 0xffffff };
export const col = (h) => new THREE.Color(h);
export const KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split('');
export const JP_FONT = '"NotoSC9", "Yu Gothic", "Meiryo", "MS Gothic", sans-serif';

export const KANJI_FONT = '"DelaGothic", "NotoSC9", sans-serif';
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export async function loadFonts() {
  const defs = [['NotoSC9', 'assets/fonts/NotoSansSC-900.woff'], ['Exo2', 'assets/fonts/Exo2-800i.woff'], ['PS2P', 'assets/fonts/PressStart2P-400.woff'], ['DelaGothic', 'assets/fonts/DelaGothicOne-Regular.ttf'], ['Michroma', 'assets/fonts/Michroma-Regular.ttf'], ['SciKanji', 'assets/fonts/SciKanji-HYZhongHei.ttf']];
  for (const [name, url] of defs) {
    try { const f = new FontFace(name, `url(${url})`); await f.load(); document.fonts.add(f); } catch (e) { console.warn('font fail', name, e); }
  }
  await document.fonts.ready;
}

// ---- 假名图集：8×6 格，每格 256px；filled=实心，outline=描边空心
export function makeAtlas(chars, mode = 'filled', cell = 256, cols = 8) {
  const rows = Math.ceil(chars.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * cell;
  const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${cell * 0.78}px ${JP_FONT}`;
  chars.forEach((ch, i) => {
    const cx = (i % cols + 0.5) * cell, cy = (Math.floor(i / cols) + 0.5) * cell + cell * 0.04;
    if (mode === 'outline') { g.lineWidth = cell * 0.035; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.strokeText(ch, cx, cy); }
    else { g.fillStyle = '#fff'; g.fillText(ch, cx, cy); }
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  const idx = {}; chars.forEach((c, i) => { if (!(c in idx)) idx[c] = i; });
  return { tex, cols, rows, idx };
}
export function glyphGeo(atlas, ch, w = 1, h = 1) {
  const i = atlas.idx[ch]; const c = i % atlas.cols, r = Math.floor(i / atlas.cols);
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (c + uv.getX(k)) / atlas.cols, 1 - (r + 1 - uv.getY(k)) / atlas.rows);
  }
  return g;
}
export function glyphMesh(atlas, ch, color = PAL.pink, size = 1, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: col(color), opacity });
  return new THREE.Mesh(glyphGeo(atlas, ch, size, size), m);
}

// ---- 任意文字贴图（标题、虚空造物、终端字等）
export function textTexture(text, o = {}) {
  const { font = JP_FONT, size = 200, weight = '900', italic = false, fill = '#fff', stroke = null, strokeW = 0, pad = 60, chrome = false, glow = null, spacing = 0 } = o;
  const g0 = document.createElement('canvas').getContext('2d');
  const f = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  g0.font = f; if ('letterSpacing' in g0) g0.letterSpacing = spacing + 'px';
  const w = Math.ceil(g0.measureText(text).width + pad * 2), h = Math.ceil(size * 1.4 + pad * 2);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
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

// ---- 径向光晕贴图
export function glowTexture(inner = '255,255,255', size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${inner},1)`); gr.addColorStop(0.25, `rgba(${inner},0.45)`); gr.addColorStop(0.6, `rgba(${inner},0.1)`); gr.addColorStop(1, `rgba(${inner},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
export function glowSprite(rgb, size, opacity = 1) {
  const m = new THREE.MeshBasicMaterial({ map: glowTexture(rgb), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
}

// ---- 霓虹环境贴图（给铬金属反射用）
export function makeEnv(renderer) {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 v;
    void main(){ float y=v.y; vec3 top=vec3(0.03,0.0,0.09); vec3 hor=vec3(0.75,0.1,0.4); vec3 low=vec3(0.0,0.02,0.06);
      vec3 c=mix(hor,top,smoothstep(0.0,0.7,y)); c=mix(c,low,smoothstep(0.0,-0.35,y));
      float a=atan(v.z,v.x);
      c+=vec3(0.15,0.95,1.0)*smoothstep(0.93,0.99,sin(a*3.0+0.6))*smoothstep(-0.1,0.5,y)*1.5;
      c+=vec3(1.0,0.25,0.65)*smoothstep(0.95,0.995,sin(a*5.0+2.0))*smoothstep(-0.3,0.3,y)*1.4;
      c+=vec3(1.0,0.75,0.3)*smoothstep(0.985,1.0,sin(a*2.0+4.0))*smoothstep(0.0,0.5,y)*1.2;
      gl_FragColor=vec4(c,1.);}`
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(s, 0.02); pm.dispose();
  return rt.texture;
}

// ---- 星点
export function makeStars(n = 1800, radius = 160, size = 1.6, seed = 7) {
  const r = rng(seed), p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), rad = radius * (0.7 + r() * 0.3);
    p[i * 3] = Math.cos(a) * s * rad; p[i * 3 + 1] = Math.abs(u) * rad * 0.9 + 2; p[i * 3 + 2] = Math.sin(a) * s * rad;
    const k = r(); const cc = k < 0.15 ? [1, 0.45, 0.8] : k < 0.3 ? [0.4, 0.95, 1] : [1, 1, 1];
    c[i * 3] = cc[0]; c[i * 3 + 1] = cc[1]; c[i * 3 + 2] = cc[2];
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
}

// ---- 霓虹网格地面（无限滚动）
export function makeGrid({ size = 600, speed = 14, scale = 3, colA = PAL.magenta, colB = PAL.cyan, y = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpeed: { value: speed }, uScale: { value: scale }, uA: { value: col(colA) }, uB: { value: col(colB) }, uCam: { value: new THREE.Vector3() }, uPulse: { value: 0 }, uFog: { value: 0.012 } },
    vertexShader: 'varying vec3 vP;void main(){vec4 w=modelMatrix*vec4(position,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `uniform float uTime,uSpeed,uScale,uPulse,uFog;uniform vec3 uA,uB,uCam;varying vec3 vP;
    float gl(vec2 p,float w){vec2 g=abs(fract(p-0.5)-0.5)/fwidth(p);return 1.0-clamp(min(g.x,g.y)/w,0.,1.);}
    void main(){
      vec2 p=vec2(vP.x,vP.z-uTime*uSpeed)/uScale;
      float d=length(vP.xz-uCam.xz);
      float l1=gl(p,1.1), l2=gl(p/5.0,1.8);
      float fade=exp(-d*uFog);
      vec3 c=mix(uA,uB,smoothstep(8.,140.,d));
      float inten=(l1*0.55+l2*0.95)*fade*(1.0+uPulse*1.6);
      vec3 base=vec3(0.012,0.0,0.03)+uA*0.035*exp(-d*0.018);
      gl_FragColor=vec4(base+c*inten*1.25,1.0);}`
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}

// ---- 蒸汽波落日（带百叶缝）
export function makeSun(r = 20, gain = 0.95, cut = 0.58) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uGain: { value: gain } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uTime,uPulse,uGain;varying vec2 vUv;
    void main(){ vec2 p=vUv*2.-1.; float d=length(p); if(d>1.0)discard;
      float y=vUv.y;
      vec3 c=mix(vec3(1.0,0.10,0.52),vec3(1.0,0.50,0.14),smoothstep(0.12,0.55,y)); c=mix(c,vec3(1.0,0.92,0.32),smoothstep(0.55,0.95,y));
      if(y<${cut}){ float f=y*13.0-uTime*0.35; float k=fract(f); float w=mix(0.0,0.62,smoothstep(${cut},0.02,y)); if(k<w) discard; }
      float edge=smoothstep(1.0,0.965,d);
      gl_FragColor=vec4(c*(uGain+uPulse*0.3),edge);}`
  });
  return new THREE.Mesh(new THREE.CircleGeometry(r, 96), mat);
}

// ---- 铬金属锁链（InstancedMesh）
export function makeChain(maxN, env, { link = 1, color = 0xe8ecff, rough = 0.16, emissive = 0x1a0310, tube = 1 } = {}) {
  const geo = new THREE.TorusGeometry(0.5, 0.125 * tube, 12, 28); geo.scale(0.78, 1.5, 0.78);
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, envMap: env, envMapIntensity: 1.0, emissive, emissiveIntensity: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, maxN); mesh.frustumCulled = false; mesh.count = 0;
  const pitch = 0.98 * link;
  const tmp = { p: new THREE.Vector3(), t: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), s: new THREE.Vector3() };
  // fn(u)->Vector3, u∈[0,1]；按弧长均匀布置，maxLen=沿路径最多布置到的长度比例(0..1)
  function layout(fn, { frac = 1, twist = 0, scale = 1, samples = 240 } = {}) {
    const pts = [], cum = [0];
    for (let i = 0; i <= samples; i++) { pts.push(fn(i / samples)); if (i) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); }
    const total = cum[samples] * frac, step = pitch * scale;
    const n = Math.min(maxN, Math.max(0, Math.floor(total / step)));
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step; while (seg < samples - 1 && cum[seg + 1] < s) seg++;
      const f = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      tmp.p.lerpVectors(pts[seg], pts[seg + 1], f);
      tmp.t.subVectors(pts[Math.min(samples, seg + 1)], pts[seg]).normalize();
      tmp.x.crossVectors(tmp.t, tmp.up); if (tmp.x.lengthSq() < 1e-4) tmp.x.set(1, 0, 0); tmp.x.normalize();
      tmp.z.crossVectors(tmp.x, tmp.t).normalize();
      const ang = (i % 2 ? Math.PI / 2 : 0) + twist;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const xx = tmp.x.clone().multiplyScalar(c).addScaledVector(tmp.z, sn), zz = tmp.z.clone().multiplyScalar(c).addScaledVector(tmp.x, -sn);
      tmp.m.makeBasis(xx, tmp.t, zz); tmp.m.setPosition(tmp.p);
      tmp.m.scale(tmp.s.set(scale, scale, scale));
      mesh.setMatrixAt(i, tmp.m);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; return n;
  }
  return { mesh, layout, pitch };
}

// ---- 幽灵剪影（头像抠图）+ 霓虹边缘光 + 故障
export function makeGhost(tex, height = 7) {
  const aspect = tex.image.width / tex.image.height;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uGlitch: { value: 0 }, uA: { value: col(PAL.pink) }, uB: { value: col(PAL.cyan) }, uFade: { value: 1 }, uGlow: { value: 1 }, uBright: { value: 1.25 }, uTexel: { value: new THREE.Vector2(1 / tex.image.width, 1 / tex.image.height) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D map;uniform float uTime,uGlitch,uFade,uGlow,uBright;uniform vec3 uA,uB;uniform vec2 uTexel;varying vec2 vUv;
    float h(float n){return fract(sin(n*12.9898)*43758.5453);}
    void main(){
      vec2 uv=vUv; float band=floor(uv.y*70.0); float tt=floor(uTime*14.0);
      float gl=step(0.9,h(band+tt*7.0))*uGlitch; uv.x+=gl*(h(band*3.0+tt)-0.5)*0.16;
      vec4 c=texture2D(map,uv);
      float ar=texture2D(map,uv+vec2(uGlitch*0.012,0.)).a, ab=texture2D(map,uv-vec2(uGlitch*0.012,0.)).a;
      float acc=0.0;
      for(int i=0;i<16;i++){ float a=float(i)/16.*6.28318; for(int k=1;k<=4;k++){ acc+=texture2D(map,uv+vec2(cos(a),sin(a))*uTexel*float(k)*9.0).a; } }
      acc/=64.0;
      float outside=(1.0-c.a)*smoothstep(0.0,0.55,acc);
      float inner=c.a*(1.0-smoothstep(0.55,0.97,acc));
      vec3 rim=mix(uA,uB,smoothstep(0.15,0.85,uv.x+ (uv.y-0.5)*0.25));
      vec3 body=c.rgb*uBright;
      body+=vec3(ar-c.a,0.0,ab-c.a)*0.6*uGlitch;
      float fadeB=smoothstep(0.0,0.2,uv.y);
      vec3 col=(body*c.a + rim*(inner*1.0+outside*0.5*uGlow))*fadeB;
      float a=max(c.a,outside*0.3)*fadeB;
      gl_FragColor=vec4(col*uFade,a*uFade);}`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat); mesh.userData.aspect = aspect; return mesh;
}

// ---- 假名字库：为 46 个假名各建一个网格（共用图集），按需显示其中一个
export function makeGlyphBank(atlas, color = PAL.pink, size = 1, opacity = 1) {
  const group = new THREE.Group(), map = {};
  for (const ch of Object.keys(atlas.idx)) { const m = glyphMesh(atlas, ch, color, size, opacity); m.visible = false; group.add(m); map[ch] = m; }
  let cur = null;
  return { group, map, show(ch, op = 1) { if (cur && cur !== map[ch]) cur.visible = false; cur = map[ch] || null; if (cur) { cur.visible = true; cur.material.opacity = op; } return cur; }, get current() { return cur; } };
}

// ---- 天空渐变球（顶/中/地平线 三色）
export function makeSky(top, mid, hor, { midAt = 0.22, power = 0.5, radius = 400 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: col(top) }, uMid: { value: col(mid) }, uHor: { value: col(hor) }, uMidAt: { value: midAt }, uPow: { value: power } },
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 uTop,uMid,uHor;uniform float uMidAt,uPow;varying vec3 v;
    void main(){ float y=max(v.y,0.0); vec3 c=mix(uHor,uMid,smoothstep(0.0,uMidAt,pow(y,uPow))); c=mix(c,uTop,smoothstep(uMidAt,0.9,pow(y,uPow))); gl_FragColor=vec4(c,1.0);}`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat); m.frustumCulled = false; return m;
}

// ---- 线框山脊（中间留出山谷）
export function makeRidge({ z = -110, h = 18, width = 320, seed = 1, color = PAL.cyan, valley = 26, fill = 0x05010c } = {}) {
  const r = rng(seed), pts = [], n = 110;
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i <= n; i++) {
    const x = (i / n - 0.5) * width, ax = Math.abs(x);
    const base = (Math.sin(x * 0.045 + ph[0]) * 0.5 + 0.5) * 0.6 + (Math.sin(x * 0.11 + ph[1]) * 0.5 + 0.5) * 0.3 + (Math.sin(x * 0.31 + ph[2]) * 0.5 + 0.5) * 0.1;
    const y = h * Math.pow(base, 1.3) * smooth(valley * 0.5, valley * 2.2, ax);
    pts.push(new THREE.Vector3(x, y, 0));
  }
  const shape = new THREE.Shape(); shape.moveTo(pts[0].x, -4); pts.forEach(p => shape.lineTo(p.x, p.y)); shape.lineTo(pts[n].x, -4);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: fill, side: THREE.DoubleSide })));
  const lg = new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false })));
  // 山体里的纵向霓虹线
  const seg = []; for (let i = 0; i <= n; i += 2) { const p = pts[i]; if (p.y > 0.6) { seg.push(p.x, p.y, 0.01, p.x, Math.max(-4, p.y * 0.0 - 1), 0.01); } }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28, toneMapped: false })));
  g.position.z = z; return g;
}
