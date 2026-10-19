// 歌词层（挂在镜头上，全曲共用）
//  A 入场：每个假名先从五十音表里弹射出来，落地时按段落风格入场——
//      decode（主歌 / 预副歌）：先闪过几个随机假名，像在检索字符表，再锁定
//      stamp （副歌 / 尾声）  ：从大砸到正常大小，白闪 + 红蓝错位 + 冲击波环 + 抖动
//      glitch（桥段）         ：横向乱跳、红蓝大幅错位，再锁定
//    之前唱过的 3 个假名变成空心残影，向画面深处退去
//  B 五十音表：右上角常驻一张传统竖排五十音表（右起ア行、上起ア段），唱到哪个字哪格点亮，
//    光标沿表格扫过，刚唱过的格子留下余温。整首歌按表格顺序循环念五十音，所以光标会一列列扫过去
import * as THREE from 'three';
import { PAL, KANA, glyphGeo, makeGlyphBank, glyphMesh, textMesh, hash, clamp } from './lib.js';

const TABLE = ['アイウエオ', 'カキクケコ', 'サシスセソ', 'タチツテト', 'ナニヌネノ', 'ハヒフヘホ', 'マミムメモ', 'ヤ・ユ・ヨ', 'ラリルレロ', 'ワ・・・ヲ', 'ン・・・・'];
export const KANA_CELL = {};      // 假名 → [列, 行]，列 0 = 最右边的ア行
TABLE.forEach((s, c) => [...s].forEach((ch, r) => { if (ch !== '・') KANA_CELL[ch] = [c, r]; }));
const COLS = TABLE.length, ROWS = 5;
export const FLY = 0.07;          // 从表格弹射到大字位置的飞行时间（秒）

// 段落 → 入场风格（按歌词块 id 判断）
export function lyricStyle(k) {
  const id = (k && k.blk && k.blk.id) || '';
  if (/^bridge/.test(id)) return 'glitch';
  if (/^(verse|pre)/.test(id)) return 'decode';
  return 'stamp';
}

const WHITE = new THREE.Color(0xffffff);
const hud = (o, ro = 40) => { o.traverse((m) => { if (m.material) { m.material.depthTest = false; m.material.depthWrite = false; } m.renderOrder = ro; }); return o; };
const lineMat = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false, blending: THREE.AdditiveBlending });
const addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

// ---------- B：五十音表面板（单位坐标：1 = 一格；原点在表格右上角，向左、向下延伸）----------
function makeKanaPanel(ctx) {
  const g = new THREE.Group();
  // 深色底板：让表格在任何背景上都看得清（普通混合，压暗背后的画面）
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 0.6, ROWS + 1.3), new THREE.MeshBasicMaterial({ color: 0x050010, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }));
  plate.position.set(-COLS / 2, -ROWS / 2 + 0.3, -0.05); plate.renderOrder = 39; g.add(plate);
  const P = (pts) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return geo; };
  const outer = [0, 0, 0, -COLS, 0, 0, -COLS, 0, 0, -COLS, -ROWS, 0, -COLS, -ROWS, 0, 0, -ROWS, 0, 0, -ROWS, 0, 0, 0, 0];
  const frame = new THREE.LineSegments(P(outer), lineMat(PAL.cyan, 0.4)); g.add(frame);
  const inner = [];
  for (let c = 1; c < COLS; c++) inner.push(-c, 0, 0, -c, -ROWS, 0);
  for (let r = 1; r < ROWS; r++) inner.push(0, -r, 0, -COLS, -r, 0);
  g.add(new THREE.LineSegments(P(inner), lineMat(0x8a5ac0, 0.1)));
  // 标题：表格上方右对齐
  const label = textMesh('KANA.TABLE // 46', 0.5, { font: 'Michroma', weight: '400', size: 110, fill: '#7ff9ff', pad: 20 });
  label.material.opacity = 0.6; label.position.set(-label.geometry.parameters.width / 2, 0.42, 0); g.add(label);
  // 当前列的竖条 + 光标
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, ROWS), addMat(PAL.pink, 0.08)); g.add(bar);
  const cur = new THREE.Group();
  const s = 0.48, k = 0.2, br = [];       // 四角括号
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) br.push(x * s, y * s, 0, x * s, y * (s - k), 0, x * s, y * s, 0, x * (s - k), y * s, 0);
  cur.add(new THREE.LineSegments(P(br), lineMat(0xffffff, 1)));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), addMat(PAL.pink, 0.22)); cur.add(glow);
  g.add(cur);
  // 每格：暗色空心底字 + 点亮时的实心字
  const cells = [];
  for (const ch of Object.keys(KANA_CELL)) {
    if (!(ch in ctx.atlasF.idx)) continue;
    const [c, r] = KANA_CELL[ch], x = -(c + 0.5), y = -(r + 0.5);
    const base = glyphMesh(ctx.atlasO, ch, 0xa88ae0, 0.8, 0.35); base.position.set(x, y, 0);
    const fill = glyphMesh(ctx.atlasF, ch, PAL.cyan, 0.8, 0); fill.position.set(x, y, 0.01);
    g.add(base, fill); cells.push({ ch, base, fill });
  }
  hud(g, 40); plate.renderOrder = 39;
  return { group: g, frame, bar, cur, glow, cells };
}

// ---------- 歌词层 ----------
//  hero:false  不画镜头前的大字（场景自己画，例如 highway 天空里的巨字），只保留五十音表和弹射
//  update(k, t, f, { hideHero, target, targetSize, style })
//    target / targetSize：弹射终点改为场景里的某个世界坐标（及字的世界尺寸）
export function makeLyricLayer(ctx, camera, scene, { heroColor = 0xffd6ef, outline = PAL.cyan, dist = 6, heroY = -0.34, heroH = 0.66, hold = false, disperseAt = 0, hero: useHero = true, panel: usePanel = true, panelCell = 0.088 } = {}) {
  if (camera.parent !== scene) scene.add(camera);
  const root = new THREE.Group(); camera.add(root);
  const heroR = makeGlyphBank(ctx.atlasF, PAL.pink, 1, 0), heroB = makeGlyphBank(ctx.atlasF, PAL.cyan, 1, 0);   // 红蓝错位副本
  const hero = makeGlyphBank(ctx.atlasF, heroColor, 1, 0.8), heroO = makeGlyphBank(ctx.atlasO, outline, 1, 0.7);
  const banks = [heroR, heroB, heroO, hero];
  banks.forEach((b) => { b.group.visible = false; root.add(b.group); });
  const heroCol = new THREE.Color(heroColor), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.5, 72), addMat(heroColor, 0)); ring.visible = false; root.add(ring);
  const gF = {}, gO = {};
  const geoF = (ch) => gF[ch] || (gF[ch] = glyphGeo(ctx.atlasF, ch, 1, 1));
  const geoO = (ch) => gO[ch] || (gO[ch] = glyphGeo(ctx.atlasO, ch, 1, 1));
  const trail = [0, 1, 2].map(() => { const m = glyphMesh(ctx.atlasO, KANA[0], PAL.cyan, 1, 0); m.visible = false; root.add(m); return m; });
  const proj = hud(glyphMesh(ctx.atlasF, KANA[0], 0xffffff, 1, 1), 42); proj.visible = false; root.add(proj);
  const beam = hud(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), addMat(0xffd6ef, 0)), 41); beam.visible = false; root.add(beam);
  const pan = makeKanaPanel(ctx); pan.group.visible = false; root.add(pan.group);
  let lastCh = null, holdT0 = 0;   // hold 模式：记住最后一个假名，直到下一个假名出现前一直保留

  function update(k, t, f, { hideHero = false, target = null, targetSize = 0, style = null } = {}) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * camera.aspect;
    root.position.set(0, 0, -dist);
    const flat = (k && k.flat) || [], times = (k && k.times) || [];
    const has = !!k && k.i >= 0;
    let ch = has ? flat[k.i] : null;
    if (hold) { if (ch && ch in hero.map) { if (ch !== lastCh) holdT0 = t; lastCh = ch; } else if (lastCh) ch = lastCh; }
    const held = hold && !(has && flat[k.i] === ch);   // 当前显示的是保持下来的旧假名
    // 保持的假名：振幅从出现时起逐渐变大（到 disperseAt 时达到最大），到 disperseAt 扩散消失
    const grow = !hold ? 0 : disperseAt > holdT0 ? clamp((t - holdT0) / (disperseAt - holdT0)) : clamp((t - holdT0) / 6);
    const dq = (hold && disperseAt && held) ? clamp((t - disperseAt) / 0.8) : 0, dis = dq * dq * (3 - 2 * dq);
    const fresh = has && !held;                         // 正在唱的假名（不是保持下来的）
    const age = fresh ? (k.age ?? 9) : 9;
    const sty = style || lyricStyle(k);
    const heroOn = useHero && !hideHero;

    // ---- B：五十音表 ----
    const cs = halfH * panelCell, px = halfW - halfH * 0.07, py = halfH * 0.86;
    const showPanel = usePanel && flat.length > 0;
    const inTable = (c) => !!c && !!KANA_CELL[c] && c in ctx.atlasF.idx;
    const curCh = has && inTable(flat[k.i]) ? flat[k.i] : null;
    const cellPos = (c) => [px - (KANA_CELL[c][0] + 0.5) * cs, py - (KANA_CELL[c][1] + 0.5) * cs];
    pan.group.visible = showPanel;
    if (showPanel) {
      pan.group.position.set(px, py, 0); pan.group.scale.setScalar(cs);
      const ka = has ? (k.age ?? 9) : 9;
      const L = {}; if (has) for (let j = 0; j <= k.i && j < flat.length; j++) L[flat[j]] = times[j];
      for (const c of pan.cells) {
        const isCur = c.ch === curCh;
        const h = L[c.ch] !== undefined && t >= L[c.ch] ? Math.exp(-(t - L[c.ch]) / 1.8) : 0;   // 余温：刚唱过的格子慢慢变暗
        c.fill.material.opacity = isCur ? 1 : 0.8 * h;
        c.fill.material.color.set(isCur ? 0xffffff : h > 0.5 ? PAL.pink : PAL.cyan);
        c.fill.scale.setScalar(isCur ? 1 + 0.4 * Math.exp(-ka * 14) : 1);
        c.base.material.opacity = 0.35 + 0.2 * h;
      }
      pan.frame.material.opacity = 0.35 + 0.35 * Math.exp(-ka * 9) + f.kick * 0.1;
      pan.cur.visible = pan.bar.visible = !!curCh;
      if (curCh) {   // 光标从上一个假名的格子滑到当前格子
        const [c1, r1] = KANA_CELL[curCh];
        const prev = k.i > 0 ? flat[k.i - 1] : null, pc = prev && KANA_CELL[prev] ? KANA_CELL[prev] : [c1, r1];
        const u = 1 - Math.pow(1 - clamp(ka / 0.06), 2);
        pan.cur.position.set(-(pc[0] + (c1 - pc[0]) * u + 0.5), -(pc[1] + (r1 - pc[1]) * u + 0.5), 0.02);
        pan.cur.scale.setScalar(1 + 0.25 * Math.exp(-ka * 16));
        pan.glow.material.opacity = 0.18 + 0.4 * Math.exp(-ka * 10);
        pan.bar.position.set(-(c1 + 0.5), -ROWS / 2, -0.01);
      }
    }

    // ---- 弹射：假名从表格飞到大字位置，身后拖一道光 ----
    const hy0 = halfH * heroY, hs0 = halfH * heroH;
    let tx = 0, ty = hy0, ts = hs0;
    if (target) {
      camera.updateMatrixWorld(); tmpV.copy(target); camera.worldToLocal(tmpV);
      if (tmpV.z < -0.1) { const s = dist / -tmpV.z; tx = tmpV.x * s; ty = tmpV.y * s; ts = (targetSize || 1) * s; }
    }
    const canFly = fresh && !!curCh && showPanel && (heroOn || !!target);
    proj.visible = canFly && age < FLY;
    if (proj.visible) {
      const [sx, sy] = cellPos(curCh), e = 1 - Math.pow(1 - age / FLY, 3);
      proj.geometry = geoF(curCh);
      proj.position.set(sx + (tx - sx) * e, sy + (ty - sy) * e, 0.05);
      proj.scale.setScalar(cs * 0.8 + (ts * 0.8 - cs * 0.8) * e);
    }
    beam.visible = canFly && age < 0.24;
    if (beam.visible) {
      const [sx, sy] = cellPos(curCh), e = 1 - Math.pow(1 - clamp(age / FLY), 3), q = 1 - age / 0.24;
      const ex = sx + (tx - sx) * e, ey = sy + (ty - sy) * e, len = Math.hypot(ex - sx, ey - sy);
      beam.position.set((sx + ex) / 2, (sy + ey) / 2, 0.04); beam.rotation.z = Math.atan2(ey - sy, ex - sx);
      beam.scale.set(Math.max(1e-3, len), halfH * (0.002 + 0.008 * q), 1);
      beam.material.opacity = 0.9 * q;
    }

    // ---- A：大字入场 ----
    const ea = canFly ? age - FLY : age;               // 落地后经过的时间（<0 表示还在飞）
    const show = heroOn && !(fresh && canFly && ea < 0) && !!ch && ch in hero.map && dis < 1;
    banks.forEach((b) => { b.group.visible = false; }); ring.visible = false;
    if (show) {
      let mul = 1, flash = 0, split = 0, sgn = 1, ringA = 0, ex = 0, ey = 0, showCh = ch, tint = null, vis = true;
      if (fresh && sty === 'stamp') {                    // 砸下来：大 → 正常，带一点回弹
        const e = Math.exp(-ea * 26);
        mul = 1 + 0.9 * e - 0.07 * Math.sin(clamp(ea / 0.22) * Math.PI) * (1 - e);
        flash = Math.exp(-ea * 22); split = halfH * 0.06 * Math.exp(-ea * 13);
        ringA = ea < 0.32 ? 1 - ea / 0.32 : 0;
        const sh = halfH * 0.03 * Math.exp(-ea * 16), s = Math.floor(t * 60);
        ex = (hash(s) - 0.5) * sh; ey = (hash(s + 3) - 0.5) * sh;
      } else if (fresh && sty === 'decode') {            // 检索：先闪过随机假名，再锁定
        if (ea < 0.09) { showCh = KANA[Math.floor(hash(Math.floor(t * 50) * 1.7 + k.i) * KANA.length)]; tint = PAL.cyan; split = halfH * 0.012; }
        else { const e = Math.exp(-(ea - 0.09) * 22); mul = 1 + 0.22 * e; flash = 0.6 * e; split = halfH * 0.02 * e; }
      } else if (fresh && sty === 'glitch') {            // 故障：横向乱跳、红蓝大幅错位
        if (ea < 0.14) { const s = Math.floor(t * 40); ex = (hash(s * 1.3 + k.i) - 0.5) * halfH * 0.3; split = halfH * 0.09; sgn = hash(s + 7) < 0.5 ? -1 : 1; vis = hash(s * 2.1) > 0.25; }
        else { const e = Math.exp(-(ea - 0.14) * 20); mul = 1 + 0.25 * e; split = halfH * 0.03 * e; flash = 0.4 * e; }
      }
      const beat = f.kick * 0.6 + f.hit * 0.4;
      const amp = (0.4 + beat * 3) * (1 + grow * 6) * (1 + dis * 4);   // hold 模式：振幅随保持时间增大
      const jx = hold ? Math.sin(t * 53.0) * halfH * 0.012 * amp + (hash(Math.floor(t * 30)) - 0.5) * halfH * 1.2 * dis : 0;
      const jy = hold ? Math.cos(t * 47.0) * halfH * 0.008 * amp + (hash(Math.floor(t * 30) + 5) - 0.5) * halfH * 1.0 * dis : 0;
      const sc = hs0 * (1 + f.kick * 0.05 + (hold ? beat * 0.06 : 0)) * (1 + dis * 2.5) * mul;
      const X = jx + ex, Y = hy0 + jy + ey;
      if (hold && Math.sin(t * 41.0) > 0.9 - beat * 0.5) vis = false;   // hold 模式：随节拍闪烁
      if (vis) {
        hero.group.visible = heroO.group.visible = true;
        const a = hero.show(showCh, Math.min(1, (0.55 + 0.4 * flash) * (1 - dis)));
        a.material.color.copy(tint !== null ? tmpC.set(tint) : heroCol).lerp(WHITE, flash);
        a.position.set(X, Y, 0); a.scale.setScalar(sc);
        const b = heroO.show(showCh, 0.45 * (1 - dis)); b.position.set(X + halfH * 0.01, Y - halfH * 0.01, -0.02); b.scale.setScalar(sc * 1.04);
        const so = clamp(split / (halfH * 0.03));
        if (so > 0.02) {
          heroR.group.visible = heroB.group.visible = true;
          const r = heroR.show(showCh, 0.5 * so * (1 - dis)); r.position.set(X - split * sgn, Y, -0.01); r.scale.setScalar(sc);
          const c = heroB.show(showCh, 0.5 * so * (1 - dis)); c.position.set(X + split * sgn, Y, -0.01); c.scale.setScalar(sc);
        }
        if (ringA > 0) { ring.visible = true; ring.position.set(X, Y, -0.03); ring.scale.setScalar(hs0 * (0.5 + (1 - ringA) * 1.7)); ring.material.opacity = 0.8 * ringA * ringA; }
      }
    }

    // ---- A：残影——前 3 个假名变成空心字，向画面深处退去 ----
    for (let s = 0; s < 3; s++) {
      const m = trail[s], j = has ? k.i - 1 - s : -1, c = j >= 0 ? flat[j] : null;
      const tr = c && j + 1 < times.length ? t - times[j + 1] : 9;
      if (!heroOn || !c || !(c in ctx.atlasO.idx) || tr < 0 || tr > 0.9 || dis > 0) { m.visible = false; continue; }
      const side = j % 2 ? 1 : -1;
      m.visible = true; m.geometry = geoO(c);
      m.position.set(side * tr * halfH * 0.45, hy0 + tr * halfH * 0.22, -tr * 9);
      m.scale.setScalar(hs0 * (1 - tr * 0.15));
      m.material.color.set(j % 2 ? PAL.cyan : PAL.pink);
      m.material.opacity = 0.55 * Math.exp(-tr * 3.0);
    }
  }
  return { root, update };
}
