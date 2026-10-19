// 场景 tunnel：Chorus 2。数据隧道：由数据包环和假名环组成，向镜头飞来（已放慢），尽头是白热的门；歌词悬在镜头前。
import * as THREE from 'three';
import { PAL, col, glyphMesh, glyphGeo, glowSprite, makeStars, smooth, clamp, rng, hash } from '../lib.js';
import { makeChain } from '../lib.js';
import { makeLyricLayer, FLY } from '../lyrics.js';

export function create(ctx) {
  const scene = new THREE.Scene(); scene.background = col(0x04000a); scene.fog = new THREE.Fog(0x7a0f55, 20, 190);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 400);
  scene.add(new THREE.AmbientLight(0x664466, 0.8));

  const NR = 26, SP = 9, LEN = NR * SP, RAD = 8.2;
  const rings = [];
  for (let i = 0; i < NR; i++) {
    const g = new THREE.Group();
    const c = makeChain(72, ctx.env);
    c.layout((u) => { const a = u * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * RAD, Math.sin(a) * RAD, 0); }, { frac: 1, scale: 1.1, samples: 240 });
    g.add(c.mesh);
    const glyphs = [];
    if (i % 2 === 0) for (let j = 0; j < 14; j++) {
      const a = (j / 14) * Math.PI * 2, m = glyphMesh(ctx.atlasF, 'ア', i % 4 === 0 ? PAL.pink : PAL.cyan, 2.1, 0.95);
      m.position.set(Math.cos(a) * (RAD + 3.2), Math.sin(a) * (RAD + 3.2), 0); m.rotation.z = a - Math.PI / 2; g.add(m); glyphs.push(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RAD + 1.6, 0.04, 6, 120), new THREE.MeshBasicMaterial({ color: i % 2 ? PAL.cyan : PAL.magenta, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, toneMapped: false }));
    g.add(ring);
    scene.add(g); rings.push({ g, glyphs, i, ring });
  }

  // 速度线
  const R = rng(12), LN = 520, lp = new Float32Array(LN * 6), la = new Float32Array(LN * 2), lc = new Float32Array(LN * 6);
  for (let i = 0; i < LN; i++) {
    const a = R() * Math.PI * 2, r = 3 + R() * 20, x = Math.cos(a) * r, y = Math.sin(a) * r, z = -R() * 220;
    lp.set([x, y, z, x, y, z], i * 6); la[i * 2] = 0; la[i * 2 + 1] = 1;
    const cc = R() < 0.5 ? [1, 0.2, 0.6] : R() < 0.5 ? [0.2, 0.95, 1] : [1, 1, 1]; lc.set([...cc, ...cc], i * 6);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aEnd', new THREE.BufferAttribute(la, 1)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { uT: { value: 0 }, uSpeed: { value: 60 }, uLen: { value: 6 } },
    vertexShader: 'attribute float aEnd;uniform float uT,uSpeed,uLen;varying vec3 vC;varying float vA;void main(){vec3 p=position;p.z=mod(p.z+uT*uSpeed,220.0)-210.0+aEnd*uLen;vC=color;vA=1.0-aEnd*0.9;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
    fragmentShader: 'varying vec3 vC;varying float vA;void main(){gl_FragColor=vec4(vC,0.55*vA);}'
  })); lines.frustumCulled = false; scene.add(lines);

  // 尽头的门
  const portal = glowSprite('255,235,235', 90, 1); portal.position.set(0, 0, -205); scene.add(portal);
  const portal2 = glowSprite('255,70,150', 220, 0.8); portal2.position.set(0, 0, -208); scene.add(portal2);
  scene.add(makeStars(600, 220, 1.2, 3).translateZ(-100));
  const lyr = makeLyricLayer(ctx, camera, scene, { heroColor: 0xffd6ef, outline: PAL.cyan, heroY: -0.3, hold: true, disperseAt: 125 });
  // “ケ”（chorus2 末尾，118.3 秒起被保持）：122 秒起大幅震动、放大，1.4 秒内淡出消失；段内之后不再显示假名大字
  const KT = 122.0;
  const keFill = glyphMesh(ctx.atlasF, 'ケ', 0xff8fd0, 1, 0.55), keLine = glyphMesh(ctx.atlasO, 'ケ', PAL.cyan, 1, 0.5);
  keFill.visible = keLine.visible = false;
  const keRoot = new THREE.Group(); if (camera.parent !== scene) scene.add(camera); camera.add(keRoot); keRoot.position.set(0, 0, -6); keRoot.add(keFill, keLine);
  function keEffect(t, f, S) {
    const on = S.sec.id === 'chorus2' && t >= KT && t < KT + 1.4;
    keFill.visible = keLine.visible = on;
    if (!on) return;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 6;
    const p = clamp((t - KT) / 1.4), amp = 0.4 + 2.6 * smooth(0, 0.5, t - KT);   // 震动幅度迅速变大
    const jx = (hash(Math.floor(t * 40)) - 0.5) * halfH * 0.18 * amp + Math.sin(t * 73) * halfH * 0.05 * amp;
    const jy = (hash(Math.floor(t * 40) + 9) - 0.5) * halfH * 0.14 * amp + Math.cos(t * 61) * halfH * 0.04 * amp;
    const sc = halfH * 0.66 * 1.04 * (1 + 1.1 * p * p) * (1 + f.kick * 0.08);
    const a = 1 - smooth(0.4, 1.4, t - KT);
    keFill.position.set(jx, halfH * -0.3 + jy, 0.01); keLine.position.set(jx + halfH * 0.01, halfH * -0.3 + jy - halfH * 0.01, 0);
    keFill.scale.setScalar(sc); keLine.scale.setScalar(sc * 1.04);
    keFill.material.opacity = 0.6 * a; keLine.material.opacity = 0.5 * a;
  }

  // 副歌 3（apex）：歌词进入隧道——每个唱到的假名先从五十音表弹射进隧道深处，
  // 在镜头前方约 34 个单位处砸出巨字，然后迎面飞来、从镜头左右两侧擦过
  const WN = 8, WSIZE = 10, WV = 36, WDIST = 34, CAMZ = 4;
  const wgF = {}, wgO = {};
  const wGeoF = (ch) => wgF[ch] || (wgF[ch] = glyphGeo(ctx.atlasF, ch, 1, 1));
  const wGeoO = (ch) => wgO[ch] || (wgO[ch] = glyphGeo(ctx.atlasO, ch, 1, 1));
  const worldK = [];
  for (let i = 0; i < WN; i++) { const fi = glyphMesh(ctx.atlasF, 'ア', 0xffd6ef, 1, 0), ln = glyphMesh(ctx.atlasO, 'ア', PAL.cyan, 1, 0); fi.visible = ln.visible = false; scene.add(fi, ln); worldK.push({ fi, ln }); }
  const wCol = new THREE.Color(), WHITE = new THREE.Color(0xffffff), wTarget = new THREE.Vector3();
  const spawnPos = (j, v) => v.set((j % 2 ? 1 : -1) * 1.2, (hash(j * 3.7) - 0.5) * 3 + 0.4, CAMZ - WDIST);
  function worldKana(t, k, on) {
    let n = 0;
    if (on && k && k.i >= 0) for (let j = k.i; j >= 0 && n < WN; j--) {
      const a = t - k.times[j] - FLY; if (a > 1.1) break;   // 飞行期间（a<0）还没落地
      const ch = k.flat[j]; if (a < 0 || !(ch in ctx.atlasF.idx)) continue;
      const { fi, ln } = worldK[n++];
      const side = j % 2 ? 1 : -1;
      spawnPos(j, wTarget);
      const x = wTarget.x + side * a * a * 9, y = wTarget.y - a * 1.2, z = wTarget.z + a * WV;
      const e = Math.exp(-a * 24), sc = WSIZE * (1 + 0.7 * e);          // 落地瞬间从大砸到正常大小
      const fade = clamp(a / 0.03) * (1 - smooth(0.5, 0.85, a));        // 贴近镜头时淡出（隧道泛光很强，提早淡出避免一片白）
      fi.geometry = wGeoF(ch); ln.geometry = wGeoO(ch);
      fi.position.set(x, y, z); ln.position.set(x + 0.35, y - 0.35, z - 0.2);
      fi.rotation.z = ln.rotation.z = side * a * 0.35;
      fi.scale.setScalar(sc); ln.scale.setScalar(sc * 1.05);
      fi.material.color.copy(wCol.set(j % 2 ? 0xff9fd8 : 0xff5fb0)).lerp(WHITE, 0.6 * e);
      fi.material.opacity = 0.32 * fade + 0.25 * e; ln.material.opacity = 0.55 * fade;
      fi.visible = ln.visible = true;
    }
    for (; n < WN; n++) worldK[n].fi.visible = worldK[n].ln.visible = false;
  }

  const geoC = {}; const getG = (ch) => geoC[ch] || (geoC[ch] = glyphGeo(ctx.atlasF, ch, 2.1, 2.1));
  const SPEED = 24;   // 原来是 42，放慢到约一半
  function update({ t, f, S, k, post, sec }) {
    const flat = k.flat.length ? k.flat : ['ア'];
    const dist = t * SPEED, off = dist % LEN;
    rings.forEach((r) => {
      const z = -(((r.i * SP) - off + LEN) % LEN) + 6;
      const lap = Math.floor((dist - r.i * SP + 6) / LEN);
      r.g.position.z = z;
      r.g.rotation.z = t * (r.i % 2 ? 0.35 : -0.28) + r.i * 0.5;
      const near = clamp(1 - Math.abs(z + 12) / 40);
      r.ring.material.opacity = 0.35 + 0.55 * f.kick * near + 0.2;
      r.glyphs.forEach((m, j) => {
        const ch = flat[Math.abs((lap * NR + r.i) * 14 + j) % flat.length];
        m.visible = !(S.sec.id === 'chorus2' && t >= KT && ch === 'ケ');   // ケ 出现后，本段内环上的字也不再出现ケ
        if (ch in ctx.atlasF.idx) m.geometry = getG(ch);
      });
    });
    lines.material.uniforms.uT.value = t; lines.material.uniforms.uSpeed.value = SPEED * 1.8; lines.material.uniforms.uLen.value = 5 + f.low * 8;
    portal.material.opacity = 0.8 + f.kick * 0.2; portal.scale.setScalar(1 + f.kick * 0.1 + Math.sin(t * 3) * 0.03);
    const apex = !!(sec && sec.mode === 'apex');
    worldKana(t, k, apex);
    if (apex) lyr.update(k, t, f, { hideHero: true, target: k.i >= 0 ? spawnPos(k.i, wTarget) : null, targetSize: WSIZE, style: 'stamp' });   // 副歌 3：大字改为隧道里的巨字
    else lyr.update(k, t, f, { hideHero: S.sec.id === 'chorus2' && t >= KT });   // ケ 出现后，本段内不再显示假名大字
    keEffect(t, f, S);
    if (sec && sec.mode === 'apex') {
      // 副歌 3：镜头在锁链之间左右晃动、向前穿行
      camera.position.set(Math.sin(t * 0.9) * 3.0, Math.cos(t * 0.7) * 2.2, 4 + Math.sin(t * 0.5) * 2);
      camera.lookAt(Math.sin(t * 0.9 + 1.2) * 2.2, Math.cos(t * 0.7 + 0.6) * 1.6, -50);
      camera.rotation.z += Math.sin(t * 1.1) * 0.16 + f.kick * 0.02;
    } else {
      camera.position.set(Math.sin(t * 0.4) * 0.6, Math.cos(t * 0.3) * 0.5, 4);
      camera.lookAt(0, 0, -50); camera.rotation.z = Math.sin(t * 0.45) * 0.12 + f.kick * 0.02;
    }
    camera.fov = 72 + f.kick * 7; camera.updateProjectionMatrix();
    const s = post.s; s.bloom = 1.0 + f.kick * 0.4; s.bloomR = 0.6; s.glitch = Math.max(s.glitch, f.hit * 0.38); s.ab = 0.0045 + f.hit * 0.003 + f.kick * 0.0015; s.warp = 0.1; s.track = 0.2;
    s.flash = [f.kick * 0.05, f.kick * 0.015, f.kick * 0.04];
  }
  return { scene, camera, update };
}
