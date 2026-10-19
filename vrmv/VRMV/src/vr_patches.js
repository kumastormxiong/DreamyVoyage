// 针对个别场景的 VR 补丁：不改原场景代码，只在它每帧 update 之后调整物体。
//  · city / tunnel / highway：穿越场景里飞过观众身后的物体，原 MV 一过镜头就回收（转头会看到它们突然消失），
//    这里让它们继续往后飞一段距离、在雾里再回收
//  · outro：屏幕上铺满的平面 ヌ 换成从四面八方包围观众的立体 ヌ（数量更少、字更大、多种字体）
// 识别物体的方法依赖原场景的结构（注释里写明），原场景大改后需要同步检查这里。
import * as THREE from 'three';
import { PAL, hash, smooth } from '../../web/src/lib.js';
import { HIDE_LAYER, BEHIND, NU_SHELL, EYE } from './vr_config.js';
import { kanaGeo, kanaMaterial, FONT_KEYS } from './vr_kana3d.js';

// 把一组沿 z 轴循环的物体，重新放进 [cz + behind - period, cz + behind) 的窗口：身后保留 behind 米
const rewrap = (z, cz, behind, period) => cz + behind - (((cz + behind - z) % period) + period) % period;

export const PATCHES = {
  // city：两段街区 chunks[0]、chunks[1]（场景里第一个子物体是 InstancedMesh 的 Group），原 MV 每 260 米整段跳回，
  // 身后的楼会突然全部消失、前方的街区内容也会跳变。VR 里改为 4 段无缝循环（另外复制两段，共用几何体和材质）
  city(w) {
    const CH = 260;
    const chunks = w.scene.children.filter((o) => o.isGroup && o.children[0] && o.children[0].isInstancedMesh);
    if (chunks.length < 2) return null;
    const c0 = chunks[0].clone(), c1 = chunks[1].clone();
    w.scene.add(c0, c1);
    let D = 0, last = null;
    return {
      after() {
        const off = chunks[0].position.z;           // 原场景：off = (t × 速度) mod 260
        if (last !== null) { let d = off - last; if (d < -CH / 2) d += CH; if (d > CH / 2) d -= CH; D += d; }
        last = off;
        const base = ((D % (2 * CH)) + 2 * CH) % (2 * CH);
        chunks[0].position.z = base; chunks[1].position.z = base - CH;
        c0.position.z = base - 2 * CH; c1.position.z = base + CH;
      },
    };
  },

  // tunnel：26 个环（含环形 Torus 的 Group），间距 9
  tunnel(w) {
    const rings = w.scene.children.filter((o) => o.isGroup && o.children.some((c) => c.geometry && c.geometry.type === 'TorusGeometry'));
    if (!rings.length) return null;
    const period = rings.length * 9, behind = BEHIND.tunnel;
    return { after({ cam }) { for (const g of rings) g.position.z = rewrap(g.position.z, cam.position.z, behind, period); } };
  },

  // highway：7 座锁链拱门（带灯光子物体的 InstancedMesh），间距 52
  highway(w) {
    const arches = w.scene.children.filter((o) => o.isInstancedMesh && o.children.length && o.children[0].isMesh);
    if (!arches.length) return null;
    const period = arches.length * 52, behind = BEHIND.highway;
    return { after({ cam }) { for (const m of arches) m.position.z = rewrap(m.position.z, cam.position.z, behind, period); } };
  },

  // outro：原 MV 的 kRoot（挂在镜头上、子物体最多的 Group）里有：震动主字（假名图集，保留，自动变立体）、
  // 铺满屏幕的平面 ヌ（画布贴图）和变黑层（无贴图黑色平面）——后两者在 VR 里隐藏，换成全方位立体 ヌ 和黑色球幕
  outro(w, A, ctx) {
    const kRoot = A.hud.children.find((g) => g.isGroup && g.children.length > 100);
    if (kRoot) for (const c of kRoot.children) {
      const map = c.material && c.material.map;
      if (c.isMesh && map !== ctx.atlasF.tex && map !== ctx.atlasO.tex) c.layers.set(HIDE_LAYER);
    }
    const S = NU_SHELL;
    const shell = new THREE.Group(); shell.name = 'vrNuShell'; shell.position.y = EYE; shell.visible = false;
    A.rig.add(shell);
    const COLORS = [[0xff8fd0, PAL.cyan], [PAL.cyan, PAL.pink], [0xff2f8f, PAL.yellow], [0xb050ff, PAL.cyan], [0x2fe8a0, 0xff2fd0], [0xff3b6b, 0x00d8ff]];
    const mats = COLORS.map(([c, r]) => kanaMaterial(c, r));
    const items = [];
    const m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), O = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < S.count; i++) {
      // 斐波那契球面均匀分布 + 随机扰动：前后左右上下都有
      const y = 1 - 2 * (i + 0.5) / S.count, rr = Math.sqrt(1 - y * y), th = i * golden + hash(i * 3.1) * 0.4;
      const dir = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr).normalize();
      const r = S.rMin + hash(i * 7.7 + 1) * (S.rMax - S.rMin);
      const mesh = new THREE.Mesh(kanaGeo('ヌ', FONT_KEYS[i % FONT_KEYS.length], 0.16), mats[Math.floor(hash(i * 5.3 + 2) * mats.length)]);
      mesh.position.copy(dir).multiplyScalar(r);
      m4.lookAt(O, mesh.position, Math.abs(y) > 0.95 ? new THREE.Vector3(0, 0, 1) : up);   // 正面朝向观众
      mesh.quaternion.setFromRotationMatrix(m4);
      mesh.rotateZ((hash(i * 9.1) - 0.5) * 0.6);
      const size = S.sizeMin + hash(i * 2.3 + 4) * (S.sizeMax - S.sizeMin);
      const spawn = S.start + S.spread * Math.sqrt(hash(i * 4.1 + 2));   // 先慢后快
      mesh.visible = false; shell.add(mesh);
      items.push({ mesh, size, spawn });
    }
    // 黑色球幕：背景逐渐变黑，ヌ 之间只剩黑色（ヌ 在球幕内侧，不受影响）
    const black = new THREE.Mesh(new THREE.SphereGeometry(S.rMax + 1.5, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    shell.add(black);
    return {
      after({ t, S: sec }) {
        const on = sec.sec.world === 'outro' && t >= S.start - 0.2 && t < sec.sec.end;
        shell.visible = on;
        if (!on) return;
        for (const it of items) {
          const a = t - it.spawn;
          it.mesh.visible = a >= 0;
          if (a >= 0) it.mesh.scale.setScalar(it.size * smooth(0, 0.15, a));
        }
        black.material.opacity = smooth(S.black[0], S.black[1], t);
        black.visible = black.material.opacity > 0.001;
      },
    };
  },
};
