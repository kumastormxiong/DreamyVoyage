// 灯光：主光 + 两盏边缘光（方向光）+ 环境半球光。可调颜色（色相/饱和度）、强度、方位角、仰角；带可视化光球。
import * as THREE from 'three';
import { DEG, hsColor } from './util.js';
import { FX } from './stage.js';

// 预设：[色相, 饱和度, 强度, 方位角°, 仰角°]；环境光 [色相, 饱和度, 强度]
export const PRESETS = {
  cyber:  { zh: '赛博粉青', key: [0.78, 0.15, 1.8, 40, 35], A: [0.50, 1, 4.0, -115, 18], B: [0.86, 1, 4.0, 120, 14], amb: [0.72, 0.5, 0.45] },
  sunset: { zh: '日落橙紫', key: [0.08, 0.55, 2.2, 25, 28], A: [0.92, 0.9, 3.5, -120, 15], B: [0.62, 0.9, 3.0, 125, 10], amb: [0.85, 0.5, 0.4] },
  studio: { zh: '冷白棚拍', key: [0.58, 0.05, 2.8, 30, 40], A: [0.55, 0.6, 2.2, -110, 20], B: [0.0, 0.0, 1.6, 115, 12], amb: [0.6, 0.1, 0.5] },
  blood:  { zh: '血月红',   key: [0.02, 0.7, 2.2, 30, 30], A: [0.0, 1, 4.0, -120, 15], B: [0.09, 1, 3.5, 120, 12], amb: [0.98, 0.8, 0.35] },
  holo:   { zh: '全息青绿', key: [0.45, 0.3, 1.9, 35, 35], A: [0.47, 1, 4.0, -115, 18], B: [0.30, 1, 3.0, 120, 14], amb: [0.5, 0.7, 0.4] },
  aurora: { zh: '极光绿紫', key: [0.40, 0.25, 1.8, 30, 38], A: [0.40, 1, 3.6, -115, 18], B: [0.74, 1, 3.8, 120, 14], amb: [0.6, 0.6, 0.45] },
};

export class Lights {
  constructor(scene) {
    this.scene = scene; this.auto = false; this.autoSpeed = 12; this.orbsOn = true;
    const mk = (id, zh) => ({ id, zh, hue: 0, sat: 0, int: 1, az: 0, el: 20, color: new THREE.Color(), light: null });
    this.items = [mk('key', '主光 KEY'), mk('A', '边缘光 A'), mk('B', '边缘光 B'), mk('amb', '环境光 AMB')];
    const [key, A, B, amb] = this.items;
    key.light = new THREE.DirectionalLight(0xffffff, 1); A.light = new THREE.DirectionalLight(0xffffff, 1); B.light = new THREE.DirectionalLight(0xffffff, 1);
    amb.light = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.group = new THREE.Group(); this.group.name = 'lights';
    for (const it of this.items) { this.group.add(it.light); if (it.light.target) this.group.add(it.light.target); }
    scene.add(this.group);
    // 可视化光球
    this.orbs = new THREE.Group(); scene.add(this.orbs);
    for (const it of this.items.slice(0, 3)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, toneMapped: false }));
      const g = new THREE.Group(); g.add(m, halo); this.orbs.add(g, line); it.orb = { g, m, halo, line };
    }
    this.apply('cyber');
  }
  get(id) { return this.items.find((i) => i.id === id); }
  refresh(it) {
    hsColor(it.hue, it.sat, it.color);
    if (it.id === 'amb') { it.light.color.copy(it.color); it.light.groundColor.copy(it.color).multiplyScalar(0.12); it.light.intensity = it.int; }
    else { it.light.color.copy(it.color); it.light.intensity = it.int; }
    if (it.orb) { it.orb.m.material.color.copy(it.color).multiplyScalar(1.5); it.orb.halo.material.color.copy(it.color); it.orb.line.material.color.copy(it.color); }
  }
  set(id, key, v) { const it = this.get(id); it[key] = v; this.refresh(it); }
  apply(name) {
    const p = PRESETS[name]; if (!p) return;
    const put = (it, a) => { [it.hue, it.sat, it.int, it.az, it.el] = a; this.refresh(it); };
    put(this.get('key'), p.key); put(this.get('A'), p.A); put(this.get('B'), p.B);
    const am = this.get('amb'); [am.hue, am.sat, am.int] = p.amb; this.refresh(am);
    this.preset = name;
    FX.uRimA.value.copy(this.get('A').color); FX.uRimB.value.copy(this.get('B').color);
  }
  // 方位角 0 = 前方（+Z），顺时针增加
  dir(it, out = new THREE.Vector3()) {
    const az = it.az * DEG, el = it.el * DEG;
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  update(dt, center, scale, stageRot, gallery) {
    if (this.auto) for (const it of this.items.slice(0, 3)) it.az += this.autoSpeed * dt * (it.id === 'B' ? -1 : 1);
    FX.uRimA.value.copy(this.get('A').color); FX.uRimB.value.copy(this.get('B').color);
    const v = new THREE.Vector3(), dist = (gallery ? 14 : 2.1) * scale;
    for (const it of this.items.slice(0, 3)) {
      this.dir(it, v);
      it.light.position.copy(center).addScaledVector(v, 20); it.light.target.position.copy(center);
      it.light.target.updateMatrixWorld();
      const o = it.orb; o.g.visible = o.line.visible = this.orbsOn;
      o.g.position.copy(center).addScaledVector(v, dist); o.g.scale.setScalar(Math.max(0.045 * scale, 0.02) * (0.7 + 0.15 * it.int));
      const pos = o.line.geometry.attributes.position; pos.setXYZ(0, o.g.position.x, o.g.position.y, o.g.position.z); pos.setXYZ(1, center.x, center.y, center.z); pos.needsUpdate = true;
    }
  }
}
