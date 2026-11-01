// 展台：模型加载/缓存、霓虹边缘光材质补丁、展台模式（单个模型）与画廊模式（18 个模型围成一圈）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PAL, U } from './envs.js';
import { clamp } from './util.js';

export const PED_H = 0.55;       // 展台高度（米）
export const MODEL_H = 1.15;     // 模型归一化后的高度（米）
export const MAX_PLACED = 16;    // 场景里最多同时摆放的模型数
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// 材质补丁共享的 uniform（灯光模块会把 rimA/rimB 指向两盏边缘光的颜色对象）
export const FX = {
  uRim: { value: 1.2 }, uScan: { value: 0 }, uTime: { value: 0 },
  uRimA: { value: new THREE.Color(0x00e5ff) }, uRimB: { value: new THREE.Color(0xff2fd0) },
};

function patchMaterial(mat, yr) {
  mat.userData.uReveal = { value: 1 }; mat.userData.uYR = { value: new THREE.Vector2(yr[0], yr[1]) };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRim: FX.uRim, uScan: FX.uScan, uTime: FX.uTime, uRimA: FX.uRimA, uRimB: FX.uRimB, uReveal: mat.userData.uReveal, uYR: mat.userData.uYR });
    sh.vertexShader = 'varying float vLY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLY = position.y;');
    sh.fragmentShader = 'uniform float uRim, uScan, uTime, uReveal; uniform vec3 uRimA, uRimB; uniform vec2 uYR; varying float vLY;\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float ry = (vLY - uYR.x) / max(uYR.y - uYR.x, 1e-4);
        if (ry > uReveal) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 nW = inverseTransformDirection(normal, viewMatrix);
          float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
          vec3 rimC = mix(uRimB, uRimA, smoothstep(-0.6, 0.6, nW.x));
          totalEmissiveRadiance += rimC * fres * uRim;
          float sc = 0.5 + 0.5 * sin(ry * 140.0 - uTime * 3.0);
          totalEmissiveRadiance += mix(uRimA, uRimB, ry) * smoothstep(0.82, 1.0, sc) * uScan * 0.45;
          float edge = smoothstep(0.035, 0.0, abs(ry - uReveal)) * step(uReveal, 0.995);
          totalEmissiveRadiance += vec3(1.6, 2.0, 2.2) * edge; }`);
  };
  mat.customProgramCacheKey = () => 'neon-rim-v1';
  mat.needsUpdate = true;
}

function prepare(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  let yr = [0, 1], found = false;
  scene.traverse((o) => {
    if (o.isMesh && !found) {
      found = true; o.geometry.computeBoundingBox(); yr = [o.geometry.boundingBox.min.y, o.geometry.boundingBox.max.y]; o.frustumCulled = false;
    }
  });
  scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; for (const m of [].concat(o.material)) { if (!m.userData.uReveal) patchMaterial(m, yr); } } });
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const ref = Math.max(size.y, 0.85 * Math.max(size.x, size.z));   // 宽扁的模型（躺姿、爬行）按宽度归一化
  const k = MODEL_H / Math.max(ref, 1e-3);
  const holder = new THREE.Group(); holder.add(scene);
  scene.scale.multiplyScalar(k);
  scene.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
  holder.userData.mats = []; scene.traverse((o) => { if (o.isMesh) holder.userData.mats.push(...[].concat(o.material)); });
  holder.userData.size = new THREE.Vector3(size.x * k, size.y * k, size.z * k);
  return holder;
}
function disposeObj(o) {
  o.traverse((n) => {
    if (n.isMesh) {
      n.geometry?.dispose();
      for (const m of [].concat(n.material)) { for (const key of Object.keys(m)) if (m[key] && m[key].isTexture) m[key].dispose(); m.dispose(); }
    }
  });
}

function pedestal(r) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, PED_H, 48), new THREE.MeshStandardMaterial({ color: 0x08060f, metalness: 0.85, roughness: 0.28 }));
  body.position.y = PED_H / 2; g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.012 * (r / 0.6 + 0.4), 8, 72), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = PED_H + 0.002; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, 0.01, 8, 72), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.02; g.add(ring2);
  return { g, ring, ring2 };
}
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.font = '700 64px "Segoe UI",system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 12; x.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(0.62, 0.23, 1); return s;
}

export class Stage {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.name = 'stage'; scene.add(this.root);
    this.show = new THREE.Group(); this.gal = new THREE.Group(); this.root.add(this.show, this.gal);
    this.list = []; this.mode = 'showcase'; this.index = 0; this.autoRotate = true; this.rotSpeed = 0.35;
    this.cache = new Map();            // 展示档缓存 idx → Promise<holder>
    this.order = [];                   // 最近使用顺序（用来淘汰）
    this.cur = null; this.curIdx = -1; this.reveal = 1; this.loadId = 0;
    this.slots = []; this.hover = -1; this.galleryBuilt = false;
    this.onChange = null; this.onStatus = null;
    // 展台
    const p = pedestal(0.62); this.ped = p; this.show.add(p.g);
    this.holderGroup = new THREE.Group(); this.holderGroup.position.y = PED_H; this.show.add(this.holderGroup);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 1.9, 40, 1, true), new THREE.ShaderMaterial({
      uniforms: { uA: U.uA, uGlow: U.uGlow, uAud: U.uAud }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vY; void main(){ vY = position.y / 1.9 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uA; uniform float uGlow, uAud; varying float vY; void main(){ float a = pow(1.0 - vY, 2.0) * 0.16 * (1.0 + uAud); gl_FragColor = vec4(uA * a * uGlow, a);\n#include <colorspace_fragment>\n }',
    }));
    beam.position.y = PED_H + 0.95; this.show.add(beam); this.beam = beam;
    this.gal.visible = false;
    // 主展台的点选盒（射线选中主模型 = 取消选择已摆放的模型）
    const mh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    mh.scale.set(1.0, 1.45, 1.0); mh.position.y = PED_H + 0.62; this.show.add(mh); this.mainHit = mh;
    // 场景里摆放的多个模型（各自独立的位置/旋转/大小）
    this.scene = scene; this.placedGroup = new THREE.Group(); this.placedGroup.name = 'placed'; scene.add(this.placedGroup);
    this.placed = []; this.sel = -1; this.spinPlaced = false; this.mainVisible = true;
    this.galCount = 12; this.galPage = 0; this.galToken = 0; this.galDirty = true; this.galR = 4;
  }
  async init(manifest) {
    this.list = manifest;
  }
  get count() { return this.list.length; }
  get scale() { return this.root.scale.x; }
  // 世界坐标里模型的中心（灯光围绕它）
  center(out = new THREE.Vector3()) { return out.copy(this.root.position).addScaledVector(new THREE.Vector3(0, 1, 0), (PED_H + MODEL_H * 0.55) * this.scale); }

  // ---------- 画廊：每页 galCount 个（3/6/12/18/24），只加载当前页的低面数版本，翻页时释放上一页 ----------
  get galPages() { return Math.max(1, Math.ceil(this.list.length / this.galCount)); }
  setGallery(count, page = 0) {
    this.galCount = count; this.galPage = clamp(page, 0, this.galPages - 1); this.galDirty = true;
    if (this.mode === 'gallery') { this.rebuildGallery(); this.loadGalleryModels(); }
  }
  galleryPage(d) {
    const n = this.galPages; this.galPage = (((this.galPage + d) % n) + n) % n; this.galDirty = true;
    if (this.mode === 'gallery') { this.rebuildGallery(); this.loadGalleryModels(); }
  }
  slotOf(gi) { return this.slots.find((s) => s.gi === gi); }
  rebuildGallery() {
    ++this.galToken;
    for (const s of this.slots) { if (s.model) disposeObj(s.model); s.lab.material.map?.dispose(); s.lab.material.dispose(); }
    for (const c of [...this.gal.children]) { this.gal.remove(c); disposeObj(c); }
    this.slots = [];
    const N = this.list.length, base = this.galPage * this.galCount, M = Math.max(0, Math.min(this.galCount, N - base));
    const R = this.galR = Math.max(3.2, M * 0.42);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const big = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 8, 160), ringMat); big.rotation.x = Math.PI / 2; big.position.y = 0.03; this.gal.add(big);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.35, 0.02, 8, 120), ringMat); inner.rotation.x = Math.PI / 2; inner.position.y = 0.03; this.gal.add(inner);
    this.galRings = [ringMat];
    for (let k = 0; k < M; k++) {
      const gi = base + k, th = k / M * Math.PI * 2, slot = new THREE.Group();
      slot.position.set(Math.sin(th) * R, 0, -Math.cos(th) * R); slot.rotation.y = -th;
      const p = pedestal(0.5); p.ring.material = p.ring.material.clone(); slot.add(p.g);
      const lab = labelSprite(String(gi + 1).padStart(2, '0')); lab.position.set(0, PED_H + MODEL_H + 0.3, 0); slot.add(lab);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 1.5), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      hit.position.y = PED_H + 0.75; hit.userData.slot = gi; slot.add(hit);
      const holder = new THREE.Group(); holder.position.y = PED_H; slot.add(holder);
      this.gal.add(slot); this.slots.push({ slot, ped: p, holder, hit, lab, gi, loaded: false, hl: 0 });
    }
    this.galDirty = false;
  }
  async loadGalleryModels() {
    const token = ++this.galToken, queue = this.slots.filter((s) => !s.model), total = this.slots.length;
    const worker = async () => {
      while (queue.length && token === this.galToken) {
        const s = queue.shift();
        try {
          const g = await loader.loadAsync(this.list[s.gi].lod);
          if (token !== this.galToken) { disposeObj(g.scene); return; }
          const h = prepare(g); s.holder.add(h); s.loaded = true; s.model = h;
        } catch (e) { console.warn('LOD load failed', s.gi, e); }
        if (token === this.galToken) this.onStatus?.(`画廊 第${this.galPage + 1}/${this.galPages}页 · ${this.slots.filter((x) => x.loaded).length}/${total}`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // ---------- 场景里摆放多个模型 ----------
  async addPlaced(idx, pos, rotY = 0, scale = 1) {
    if (this.placed.length >= MAX_PLACED) return null;
    const group = new THREE.Group(); group.position.copy(pos); group.rotation.y = rotY; group.scale.setScalar(clamp(scale, 0.01, 120));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 8, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.012;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    hit.scale.set(0.8, MODEL_H, 0.8); hit.position.y = MODEL_H / 2;
    const inner = new THREE.Group(); group.add(ring, disc, hit, inner);
    const item = { idx, group, inner, ring, disc, hit, model: null, reveal: 0, hl: 0, removed: false };
    hit.userData.placed = item;
    this.placedGroup.add(group); this.placed.push(item); this.sel = this.placed.length - 1;
    try {
      const g = await loader.loadAsync(this.list[idx].lod);
      if (item.removed) { disposeObj(g.scene); return item; }
      const h = prepare(g); inner.add(h); item.model = h;
      const sz = h.userData.size; hit.scale.set(Math.max(sz.x, 0.3) * 1.1, sz.y * 1.05, Math.max(sz.z, 0.3) * 1.1); hit.position.y = sz.y * 0.525;
      for (const m of h.userData.mats) { m.userData.uReveal.value = 0; if (this.wire) m.wireframe = true; }
    } catch (e) { console.warn('place load failed', idx, e); }
    this.onStatus?.(`场景中 ${this.placed.length} 个模型`);
    return item;
  }
  removePlaced(item) {
    const i = this.placed.indexOf(item); if (i < 0) return;
    item.removed = true; this.placed.splice(i, 1); this.placedGroup.remove(item.group);
    disposeObj(item.group); item.group.traverse((n) => { if (n.material && !n.isMesh) n.material.dispose?.(); });
    if (this.sel === i) this.sel = Math.min(i, this.placed.length - 1); else if (this.sel > i) this.sel--;
    this.onStatus?.(`场景中 ${this.placed.length} 个模型`);
  }
  removeSelected() { if (this.sel >= 0) this.removePlaced(this.placed[this.sel]); }
  clearPlaced() { for (const it of [...this.placed]) this.removePlaced(it); this.sel = -1; }
  select(i) { this.sel = i < 0 || i >= this.placed.length ? -1 : i; }
  cycleSel(d) { const n = this.placed.length; if (!n) return; const k = this.sel + d; this.sel = k < -1 ? n - 1 : k >= n ? -1 : k; }   // -1 = 主展台
  get target() { return (this.sel >= 0 && this.placed[this.sel]) ? this.placed[this.sel].group : this.root; }
  get tgtScale() { return this.target.scale.x; }
  setMainVisible(v) { this.mainVisible = v; this.show.visible = this.mode === 'showcase' && v; }
  // 射线选中：摆放的模型或主展台模型
  pickItem(raycaster) {
    if (this.mode !== 'showcase') return null;
    this.root.updateMatrixWorld(true); this.placedGroup.updateMatrixWorld(true);
    const objs = this.placed.map((p) => p.hit); if (this.show.visible) objs.push(this.mainHit);
    const hits = raycaster.intersectObjects(objs, false); if (!hits.length) return null;
    const o = hits[0].object; return o.userData.placed ? { k: 'placed', item: o.userData.placed, dist: hits[0].distance } : { k: 'main', dist: hits[0].distance };
  }

  async getFull(i) {
    if (!this.cache.has(i)) {
      this.cache.set(i, loader.loadAsync(this.list[i].file).then((g) => prepare(g)).catch((e) => { this.cache.delete(i); throw e; }));
    }
    this.order = this.order.filter((x) => x !== i); this.order.push(i);
    while (this.order.length > 4) {      // 只保留最近 4 个（每个 ~35MB 显存）
      const old = this.order.shift(); if (old === this.curIdx) { this.order.push(old); break; }
      const p = this.cache.get(old); this.cache.delete(old); p?.then((h) => disposeObj(h)).catch(() => {});
    }
    return this.cache.get(i);
  }

  async showModel(i, { instant = false } = {}) {
    i = ((i % this.list.length) + this.list.length) % this.list.length;
    const id = ++this.loadId; this.index = i;
    this.onChange?.(i);
    this.onStatus?.(`加载 #${i + 1} …`);
    let h;
    try { h = await this.getFull(i); } catch (e) { console.error(e); this.onStatus?.('加载失败'); return; }
    if (id !== this.loadId) return;   // 期间又切换了
    if (this.cur) this.holderGroup.remove(this.cur);
    this.cur = h; this.curIdx = i; this.holderGroup.add(h);
    this.reveal = instant ? 1 : 0; for (const m of h.userData.mats) m.userData.uReveal.value = this.reveal;
    this.onStatus?.(`#${i + 1} / ${this.list.length}`);
    // 预加载相邻两个
    this.getFull((i + 1) % this.list.length).catch(() => {});
  }
  next(d = 1) { this.showModel(this.index + d); }

  setMode(mode) {
    const was = this.mode; this.mode = mode;
    this.show.visible = mode === 'showcase' && this.mainVisible; this.gal.visible = mode === 'gallery'; this.placedGroup.visible = mode === 'showcase';
    if (mode === 'gallery') {
      if (was !== 'gallery') { const pg = Math.floor(this.index / this.galCount); if (pg !== this.galPage) { this.galPage = pg; this.galDirty = true; } }
      if (this.galDirty) this.rebuildGallery();
      this.loadGalleryModels();
    }
  }

  // 射线拾取画廊里的模型 → 序号或 -1
  pick(raycaster) {
    if (this.mode !== 'gallery') return -1;
    this.root.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(this.slots.map((s) => s.hit), false);
    return hits.length ? hits[0].object.userData.slot : -1;   // 返回全局模型序号
  }
  setHover(i) { this.hover = i; }

  update(t, dt) {
    FX.uTime.value = t;
    const ringCol = PAL.a, pulse = U.uGlow.value * (1 + U.uAud.value * 0.8);
    this.ped.ring.material.color.copy(ringCol).multiplyScalar(1.6 * pulse);
    this.ped.ring2.material.color.copy(PAL.b).multiplyScalar(1.2 * pulse);
    if (this.mode === 'showcase') {
      if (this.cur) {
        if (this.autoRotate) this.holderGroup.rotation.y += this.rotSpeed * dt;
        if (this.reveal < 1) { this.reveal = Math.min(1, this.reveal + dt / 1.1); const e = this.reveal; for (const m of this.cur.userData.mats) m.userData.uReveal.value = e; }
      }
    } else {
      this.galRings[0].color.copy(PAL.b).multiplyScalar(1.2 * pulse);
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        s.hl += ((s.gi === this.hover ? 1 : s.gi === this.index ? 0.55 : 0) - s.hl) * Math.min(1, dt * 8);
        s.ped.ring.material.color.copy(PAL.a).multiplyScalar((0.5 + 2.2 * s.hl) * pulse);
        s.ped.ring2.material.color.copy(PAL.b).multiplyScalar((0.4 + 1.2 * s.hl) * pulse);
        if (s.model) { s.model.rotation.y = Math.sin(t * 0.5 + i) * 0.2 * (1 - s.hl) + s.hl * Math.sin(t * 1.2) * 0.35; s.model.scale.setScalar(1 + 0.08 * s.hl); }
        s.lab.material.opacity = 0.55 + 0.45 * s.hl;
      }
    }
    this.beam.visible = this.mode === 'showcase';
    if (this.mode === 'showcase') {
      for (let i = 0; i < this.placed.length; i++) {
        const it = this.placed[i], on = i === this.sel;
        it.hl += ((on ? 1 : 0) - it.hl) * Math.min(1, dt * 8);
        it.ring.material.color.copy(on ? PAL.b : PAL.a).multiplyScalar((0.5 + 1.8 * it.hl) * pulse); it.ring.material.opacity = 0.6 + 0.4 * it.hl;
        it.disc.material.color.copy(PAL.a).multiplyScalar(0.5 + it.hl);
        if (it.model) {
          if (this.spinPlaced) it.inner.rotation.y += this.rotSpeed * dt;
          if (it.reveal < 1) { it.reveal = Math.min(1, it.reveal + dt / 1.0); for (const m of it.model.userData.mats) m.userData.uReveal.value = it.reveal; }
        }
      }
    }
  }

  setWire(on) {
    for (const h of this.cache.values()) h.then((hh) => hh.userData.mats.forEach((m) => { m.wireframe = on; })).catch(() => {});
    for (const it of this.placed) it.model?.userData.mats.forEach((m) => { m.wireframe = on; });
    this.wire = on;
  }
  resetTransform() { this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); this.root.scale.setScalar(1); }
  setScale(s) { this.target.scale.setScalar(clamp(s, 0.01, 120)); }     // 缩放当前选中的对象（默认是主展台）
}
