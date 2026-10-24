// 通用歌词层：挂在镜头上（所有场景共用同一套逻辑，每个场景各建一个实例）。
// 显示"当前这一行"，每个字/词在自己的起唱时间入场；还没唱到的字以暗色预告。入场风格按段落 kind：
//   decode（verse / pre / 其他）：先闪过几个本行的随机字，像在检索，再锁定
//   stamp （chorus / interlude / outro）：从大砸到正常大小，白闪 + 红蓝错位
//   glitch（bridge）：横向乱跳、红蓝大幅错位，再锁定
// 用法（在场景 create 里）：const ly = makeLyricLayer(ctx, camera, { y: -0.3 });
//       在 update 里：ly.update(k, t, f)          （k = tl.lyric(t)，f = 音频特征）
// 场景也可以完全不用它，自己用 k.i / k.row / k.flat / k.times / k.age 做歌词画面（例如把字放进 3D 世界里）。
import * as THREE from 'three';
import { PAL, FONT_LYRIC, textTexture, hash, clamp, col } from './lib.js';

const CACHE = new Map();
function unitTex(u) {
  let e = CACHE.get(u);
  if (!e) {
    const t = textTexture(u, { font: FONT_LYRIC, size: 128, weight: '900', pad: 18 });
    e = { tex: t.tex, aspect: t.aspect }; CACHE.set(u, e);
  }
  return e;
}
// 预先生成歌词里所有单位的贴图（避免播放/导出时首次出现卡一下）
export function warmLyrics(tl) {
  for (const b of Object.values(tl.blocks)) for (const r of b.rows) for (const u of r) unitTex(u);
}

export function lyricStyle(sec) {
  const k = (sec && sec.kind) || '';
  if (sec && sec.lyricStyle) return sec.lyricStyle;
  if (k === 'bridge') return 'glitch';
  if (k === 'chorus' || k === 'interlude' || k === 'outro') return 'stamp';
  return 'decode';
}

export function makeLyricLayer(ctx, camera, { y = -0.3, dist = 10, height = 0.085, maxWidth = 0.86, colors = null } = {}) {
  const group = new THREE.Group(); group.position.z = -dist; group.renderOrder = 50;
  camera.add(group);
  const C = colors || { sung: 0xe8ecff, hot: PAL.a, pre: PAL.b, splitA: PAL.b, splitB: PAL.a };
  const N = 40, items = [];
  const mat = (c, o = 1, add = true) => new THREE.MeshBasicMaterial({ color: col(c), transparent: true, opacity: o, depthTest: false, depthWrite: false, toneMapped: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, mat(C.sung, 1, false)), a = new THREE.Mesh(geo, mat(C.splitA, 0.8)), b = new THREE.Mesh(geo, mat(C.splitB, 0.8));
    for (const x of [a, b, m]) { x.visible = false; x.renderOrder = 50; group.add(x); }
    items.push({ m, a, b });
  }
  const setTex = (mesh, u, h) => { const e = unitTex(u); if (mesh.material.map !== e.tex) { mesh.material.map = e.tex; mesh.material.needsUpdate = true; } mesh.scale.set(h * e.aspect, h, 1); return h * e.aspect; };

  function update(k, t, f = {}) {
    for (const it of items) it.m.visible = it.a.visible = it.b.visible = false;
    if (!k || !k.blk || !k.rows.length) return;
    let row = k.row, start = 0;
    if (row < 0) {                                         // 还没开始唱：第一个字前 0.8 秒预告第一行
      if (k.times.length && t < k.times[0] && k.times[0] - t < 0.8) row = 0; else return;
    }
    for (let r = 0; r < row; r++) start += k.rows[r].length;
    const units = k.rows[row];
    const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), visW = visH * camera.aspect;
    let h = visH * height;
    const gap = /^[\x00-\x7f]+$/.test(units.join('')) ? 0.35 : 0.04;   // 拉丁单词之间留空格
    let total = 0; for (const u of units) total += unitTex(u).aspect * h + gap * h; total -= gap * h;
    if (total > visW * maxWidth) { const s = visW * maxWidth / total; h *= s; total *= s; }
    const style = lyricStyle(k.sec);
    group.position.y = visH * y;
    let x = -total / 2;
    units.forEach((u, j) => {
      const idx = start + j, it = items[j]; if (!it) return;
      const age = t - k.times[idx], sung = age >= 0;
      let uu = u, sc = 1, dx = 0, split = 0, op = 1, c = C.sung;
      if (!sung) { op = clamp(0.22 + 0.25 * (1 - Math.min(1, -age / 2))); c = C.pre; }
      else if (style === 'decode') {
        if (age < 0.16) { const pool = units; uu = pool[Math.floor(hash(idx * 13.1 + Math.floor(t * 30)) * pool.length)]; c = C.hot; }
        op = age < 0.05 ? age / 0.05 : 1;
      } else if (style === 'stamp') {
        const e = clamp(age / 0.14); sc = 1 + (1 - e) * (1 - e) * 1.6; split = (1 - clamp(age / 0.35)) * 0.12; c = age < 0.08 ? 0xffffff : C.sung;
      } else if (style === 'glitch') {
        if (age < 0.3) { dx = (hash(idx + Math.floor(t * 24)) - 0.5) * 0.5; split = 0.25 * (1 - age / 0.3); }
      }
      if (sung && idx === k.i && k.next > 0.05) c = age < 0.12 ? 0xffffff : C.hot;   // 正在唱的字高亮
      const w = setTex(it.m, uu, h * sc);
      const cx = x + unitTex(u).aspect * h / 2;
      it.m.position.set(cx + dx * h, 0, 0); it.m.material.color.setHex(c); it.m.material.opacity = op; it.m.visible = true;
      if (split > 0.001) {
        for (const [mm, s] of [[it.a, -1], [it.b, 1]]) {
          setTex(mm, uu, h * sc); mm.position.set(cx + dx * h + s * split * h, 0, -0.01); mm.material.opacity = 0.7 * clamp(split * 8); mm.visible = true;
        }
      }
      x += unitTex(u).aspect * h + gap * h;
      void w;
    });
  }
  return { group, update };
}
