// 3D 歌词：当前段落的假名按行排成一面绕着观众的弧形歌词墙，唱到哪个字哪个字就亮起、弹一下。
// 位置在每段开始时放在观众正前方，之后固定在大厅里（VR 里不会跟着头跑）。
import * as THREE from 'three';

const MAX = 64, RL = 3.4, SIZE = 0.34, STEP = 0.38, LINE = 0.46, YC = 2.4;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function createLyrics({ atlas, parent }) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  const aGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  geo.setAttribute('aCell', aCell); geo.setAttribute('aGlow', aGlow);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAtlas: { value: atlas.tex }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uAlpha: { value: 1 } },
    vertexShader: `
      attribute float aCell; attribute float aGlow; uniform vec2 uGrid;
      varying vec2 vUv; varying float vGlow; varying vec3 vCol;
      void main(){
        float c = mod(aCell, uGrid.x), r = floor(aCell / uGrid.x);
        vUv = vec2((c + uv.x) / uGrid.x, 1.0 - (r + 1.0 - uv.y) / uGrid.y);
        vGlow = aGlow;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; uniform float uAlpha;
      varying vec2 vUv; varying float vGlow; varying vec3 vCol;
      void main(){
        vec2 t = texture2D(uAtlas, vUv).rg;
        float a = max(t.r, t.g * 0.35);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol * (0.5 + 0.9 * t.r), a * vGlow * uAlpha);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.renderOrder = 20;
  const col = new THREE.Color(); for (let i = 0; i < MAX; i++) mesh.setColorAt(i, col.setRGB(1, 1, 1));
  parent.add(mesh);

  const dummy = new THREE.Object3D(), cA = new THREE.Color(), cW = new THREE.Color(1, 1, 1), cU = new THREE.Color(0.45, 0.55, 0.95);
  let alpha = 0;

  return {
    mesh,
    // c: { t, dt, k, theta（歌词墙正中的方位角）, style }
    update(c) {
      const { t, k, style } = c;
      const first = k.times && k.times.length ? k.times[0] : 1e9;
      const show = k.n > 0 && (k.i >= 0 || (t >= first - 1.6 && t < first));
      alpha += ((show ? 1 : 0) - alpha) * Math.min(1, c.dt * 6);
      mat.uniforms.uAlpha.value = alpha;
      mesh.visible = alpha > 0.01;
      if (!mesh.visible) return;
      const R = k.rows.length;
      let f = 0;
      for (let r = 0; r < R; r++) {
        const row = k.rows[r], n = row.length;
        const y = YC + ((R - 1) / 2 - r) * LINE;
        for (let ci = 0; ci < n && f < MAX; ci++, f++) {
          const th = c.theta + (ci - (n - 1) / 2) * (STEP / RL);
          const age = t - k.times[f];
          const sung = age >= 0;
          const pop = sung ? Math.exp(-age * 7) : 0;
          dummy.position.set(Math.cos(th) * RL, y + pop * 0.05, Math.sin(th) * RL);
          dummy.lookAt(0, y, 0);
          dummy.scale.setScalar(SIZE * (1 + pop * 0.5)); dummy.updateMatrix();
          mesh.setMatrixAt(f, dummy.matrix);
          aCell.array[f] = atlas.index.get(row[ci]) ?? 0;
          aGlow.array[f] = sung ? 0.85 + pop * 0.9 : 0.2;
          if (sung) cA.copy(style.ca).lerp(style.cb, clamp01((age - 1) / 4) * 0.6).lerp(cW, pop * 0.8); else cA.copy(cU);
          mesh.setColorAt(f, cA);
        }
      }
      for (; f < MAX; f++) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(f, dummy.matrix); }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      aCell.needsUpdate = true; aGlow.needsUpdate = true;
    },
  };
}
