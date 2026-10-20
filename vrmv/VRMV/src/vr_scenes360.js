// 全方位化补丁：原 MV 为固定机位的屏幕构图设计，内容只摆在正前方。这里不改场景代码，只在每帧 update 之后补全：
//  · 环绕复制（vr_ring.js）：把正前方的墙、窗口、字幕牌绕观众再复制几份，围成一圈（dream、matrix、flash、hit）
//  · 面向观众（billboard）：单张平面角色始终正对观众（void 幽灵、soul 魂字、endcard 头像和频谱）；
//    endcard 的主体整体挂到 HUD（跟着观众平台，保持原画面里正前方的位置）
//  · 全屏黑场 → 黑色球幕（flash、endcard）
//  · 远景补全：公路、废土、城市的身后
//  · 电路面板、数据方块的环形分布（vr_env.js）
// 识别物体的方法依赖原场景的结构（注释里写明），原场景大改后需要同步检查这里。
import * as THREE from 'three';
import { HIDE_LAYER } from './vr_config.js';
import { orbitClones, orbitCells } from './vr_ring.js';
import { makeRingEnv } from './vr_env.js';

const TAU = Math.PI * 2;
const A3 = [TAU / 3, TAU * 2 / 3];                  // 加上原来的一份，正好三等分一圈
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// 场景的直接子物体里挑出满足条件的（rig 不算）
const direct = (w, fn) => w.scene.children.filter((o) => o.name !== 'vrRig' && fn(o));
const isPlane = (o) => o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry';

// 全屏黑场的替身：以观众为中心的黑色球幕（原来是镜头前的一块黑色平面，转头就露馅）
function fadeSphere(w, A, order) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = order; m.frustumCulled = false; m.visible = false; w.scene.add(m);
  return { set(op) { m.material.opacity = op; m.visible = op > 0.001; if (m.visible) m.position.copy(A.center); } };
}

// 水平朝向观众（绕竖直轴）：obj 在 (ox, oz) 处，观众在 A.center
const yawToViewer = (A, ox, oz) => Math.atan2(A.center.x - ox, A.center.z - oz);

export const SCENES360 = {
  // dream：8 个系统弹窗在幽灵前方的半圆里。复制两份，三份各占 120°；锁链光环、花瓣、电路背景同样围成一圈
  // 弹窗 = 直接子物体里贴画布贴图的透明平面；花瓣 = 贴空心假名图集的平面；锁链 = 实例化网格
  dream(w, A, ctx) {
    const piv = new THREE.Vector3(0, 0, 14);
    // 弹窗宽 6.4–9.5 米；同样贴画布贴图的光晕（glowSprite 其实是大平面）宽几百米，要排除
    const wins = direct(w, (o) => isPlane(o) && o.material.map && o.material.map.isCanvasTexture && o.material.transparent && o.geometry.parameters.width < 12);
    const petals = direct(w, (o) => o.isMesh && o.material.map === ctx.atlasO.tex);
    const chains = direct(w, (o) => o.isInstancedMesh);
    const oc = [
      orbitClones(w.scene, [...wins, ...chains], { pivot: piv, angles: A3 }),
      orbitClones(w.scene, petals, { pivot: piv, angles: [Math.PI] }),
    ];
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 6, blocks: 0, seed: 31, r: [26, 46] });
    return { after(a) { for (const o of oc) o.sync(); env.after(a); } };
  },

  // matrix：五十音墙是 116° 的弧形，站在弧心（vr_config 里 matrix 用固定站位），把墙再复制两份围成一圈
  // 格子 = 40 个空 Group（每段歌词重建子物体：底板、边框、空心字、实心字）；只复制空心字和实心字
  matrix(w, A, ctx) {
    const piv = new THREE.Vector3(0, 0, 15);
    const cells = direct(w, (o) => o.isGroup && o.children.length === 0);
    if (cells.length !== 40) console.warn('matrix：格子数量不是 40，原场景结构可能变了', cells.length);
    const dust = direct(w, (o) => o.isMesh && o.material.map === ctx.atlasO.tex).filter((_, i) => i % 3 === 0);
    // 光晕（glowSprite 是贴画布贴图的大平面，宽 ≥100，不是 Sprite）、链、横扫的光束、大眼睛组
    const glow = (o) => isPlane(o) && o.material.isMeshBasicMaterial && o.material.map && o.material.map.isCanvasTexture && o.geometry.parameters.width >= 100;
    const rest = direct(w, (o) => glow(o) || o.isInstancedMesh || (isPlane(o) && o.material.isShaderMaterial && o.geometry.parameters.width < 5) || (o.isGroup && o.children.length > 0));
    const oc = [
      orbitCells(w.scene, cells, { pivot: piv, angles: A3, pick: [2, 3] }),
      orbitClones(w.scene, [...dust, ...rest], { pivot: piv, angles: A3 }),
    ];
    return { after() { for (const o of oc) o.sync(); } };
  },

  // flash：代码雨屏幕（89.5 米宽的平面，在观众前方 54 米）、碎裂的魂字、字幕、终端都在正前方。
  // 雨幕复制 4 份（每份约 79°，72° 间隔），其余复制 2 份；全屏黑场换成黑色球幕（压在大标题之下）
  flash(w, A) {
    const piv = new THREE.Vector3(0, 0, 14);
    const planes = direct(w, isPlane);
    const rain = planes.filter((o) => o.geometry.parameters.width > 80);
    const blk = planes.filter((o) => o.material.depthTest === false && o.renderOrder === 50)[0];
    const others = planes.filter((o) => !rain.includes(o) && o !== blk);
    const oc = [
      orbitClones(w.scene, rain, { pivot: piv, angles: [1, 2, 3, 4].map((k) => TAU * k / 5) }),
      orbitClones(w.scene, others, { pivot: piv, angles: A3 }),
    ];
    const sph = fadeSphere(w, A, 50);
    if (blk) blk.layers.set(HIDE_LAYER);
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 8, blocks: 0, seed: 77, r: [18, 36] });
    return {
      after(a) { for (const o of oc) o.sync(); sph.set(blk && blk.visible ? blk.material.opacity : 0); env.after(a); },
    };
  },

  // hit：三记重击的巨大「オ」、放射光芒、冲击环、飞散的锁链碎片、周围的眼睛都在观众前方。
  // 复制两份围成一圈（噪声假名也一样）；每一份都有自己的立体「オ」
  hit(w, A, ctx) {
    const piv = new THREE.Vector3(0, 0, 16);
    const noise = direct(w, (o) => isPlane(o) && o.material.map === ctx.atlasO.tex && o.geometry.parameters.width < 4);
    const big = direct(w, (o) => (o.isMesh || o.isGroup) && !noise.includes(o) && (o.children.length > 0 || o.isMesh));
    const oc = [orbitClones(w.scene, big, { pivot: piv, angles: A3 }), orbitClones(w.scene, noise, { pivot: piv, angles: A3 })];
    return { after() { for (const o of oc) o.sync(); } };
  },

  // endcard：头像、频谱圈、「虚空造物」是一组正对镜头的平面。整组挂到 HUD 下（跟着观众平台，始终在正前方约 17 米），
  // 星空、地面网格留在世界里；片尾黑场换成黑色球幕
  // 识别：头像 = 贴头像贴图；频谱 = 11.6 米宽的平面；名字 = y≈-3 的平面；光晕 = 靠近原点的精灵；黑场 = z=14 的平面
  endcard(w, A, ctx) {
    const hero = new THREE.Group(); hero.name = 'vrHero'; A.hud.add(hero);
    const veil = direct(w, (o) => isPlane(o) && o.position.z === 14)[0];
    const parts = direct(w, (o) => (o.isMesh && o !== veil && (o.material.map === ctx.avatarTex || (o.geometry.parameters && o.geometry.parameters.width === 11.6) || (isPlane(o) && Math.abs(o.position.y + 3) < 0.2 && o.position.z <= 0) ||
      (isPlane(o) && o.position.z < 0 && o.position.z > -2 && o.material.blending === THREE.AdditiveBlending))));   // 最后一条：两个光晕
    for (const o of parts) hero.add(o);
    if (parts.length !== 6) console.warn('endcard：主体物体数量不是 6，原场景结构可能变了', parts.length);
    if (veil) veil.layers.set(HIDE_LAYER);
    const sph = fadeSphere(w, A, 99);
    return {
      after({ cam }) {
        hero.position.copy(cam.position).negate();        // 保持原画面里主体与镜头的相对位置：正前方约 17 米
        sph.set(veil && veil.visible ? veil.material.opacity : 0);
      },
    };
  },

  // void：幽灵是一张正对 +z 的平面，光环的前后半环按世界 z 分前后——观众站到侧面或身后就错了。
  //  · 幽灵水平转向观众；光环着色器里的"前/后"改按观众方向判断
  //  · 标题、名字不动，保持原版的做法（每帧放在导演镜头前 7 米的世界位置）
  void(w, A) {
    const ghost = direct(w, (o) => isPlane(o) && o.material.isShaderMaterial && Math.abs(o.position.y - 4.9) < 0.3)[0];
    const U = { uCtr: { value: new THREE.Vector3(0, 5.2, 0) }, uView: { value: new THREE.Vector3(0, 0, 1) } };
    for (const g of direct(w, (o) => o.isGroup && o.userData.mats)) for (const m of g.userData.mats) {
      m.uniforms.uCtr = U.uCtr; m.uniforms.uView = U.uView;
      m.vertexShader = 'uniform vec3 uCtr; uniform vec3 uView;\n' + m.vertexShader.replace('vZ = wp.z;', 'vZ = dot(wp.xyz - uCtr, uView);');
      m.needsUpdate = true;
    }
    return {
      after() {
        if (ghost) ghost.rotation.y = yawToViewer(A, ghost.position.x, ghost.position.z);
        U.uView.value.set(A.center.x - U.uCtr.value.x, 0, A.center.z - U.uCtr.value.z);
        if (U.uView.value.lengthSq() < 1e-4) U.uView.value.set(0, 0, 1); else U.uView.value.normalize();
      },
    };
  },

  // soul：「魂」字、タマシイ 四个假名、合体冲击环都是正对 +z 的平面。收进一个舞台组，整体水平转向观众
  // 识别：魂字组 = 3 个子物体的 Group；假名组 = 4 个子物体的 Group；冲击环 = RingGeometry
  soul(w, A) {
    const stage = new THREE.Group(); stage.name = 'vrSoulStage'; w.scene.add(stage);
    const parts = direct(w, (o) => (o.isGroup && (o.children.length === 3 || o.children.length === 4)) || (o.isMesh && o.geometry.type === 'RingGeometry'));
    for (const o of parts) stage.add(o);
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 6, blocks: 0, seed: 14, r: [18, 34] });
    return { after(a) { stage.rotation.y = yawToViewer(A, 0, 0); env.after(a); } };
  },

  // highway：身后没有地平线。山脊和地平线光晕绕观众转 180° 复制到身后；电路面板、方块沿公路两侧循环，身后也有
  highway(w, A) {
    const piv = new THREE.Vector3(0, 0, 14);
    const ridges = direct(w, (o) => o.isGroup && o.children.some((c) => c.isLineSegments));
    const hz = direct(w, (o) => o.isMesh && o.position.z === -200);      // 地平线光晕（glowSprite 是平面）
    const oc = orbitClones(w.scene, [...ridges, ...hz], { pivot: piv, angles: [Math.PI] });
    const env = makeRingEnv(w, A, { mode: 'travel', codes: 10, blocks: 100, seed: 41, r: [16, 70], ahead: 160, behind: 90 });
    return { after(a) { oc.sync(); env.after(a); } };
  },

  // wasteland：断裂的摩天楼（实体 + 线框）和蛇形数据线都在前方 -10…-450。绕镜头起点转 180° 复制到身后
  wasteland(w, A) {
    const piv = new THREE.Vector3(0, 0, 20);
    const srcs = direct(w, (o) => o.isInstancedMesh || (o.isMesh && o.geometry.type === 'TubeGeometry'));
    const oc = orbitClones(w.scene, srcs, { pivot: piv, angles: [Math.PI] });
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 8, blocks: 90, seed: 51, r: [24, 50] });
    return { after(a) { oc.sync(); env.after(a); } };
  },

  // city：红色的月亮和天上的眼睛只在正前方。身后补一轮月亮和眼睛；电路面板、方块围成一圈
  // 月亮 = z=-330 的着色器平面，月晕 = z=-334 的精灵
  city(w, A) {
    const piv = new THREE.Vector3(0, 0, 6);
    const moon = direct(w, (o) => o.position.z === -330 || o.position.z === -334);
    const eyes = direct(w, (o) => o.isGroup && o.children.length > 0 && o.children.every((c) => c.isMesh && c.material.isShaderMaterial));
    const oc = orbitClones(w.scene, [...moon, ...eyes], { pivot: piv, angles: [Math.PI] });
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 8, blocks: 90, seed: 21, r: [24, 46] });
    return { after(a) { oc.sync(); env.after(a); } };
  },

  dna(w, A) {
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 6, blocks: 0, seed: 88, r: [26, 44] });
    return { after(a) { env.after(a); } };
  },

  outro(w, A) {
    const env = makeRingEnv(w, A, { mode: 'dome', codes: 6, blocks: 0, seed: 61, r: [20, 38] });
    return { after(a) { env.after(a); } };
  },
};
