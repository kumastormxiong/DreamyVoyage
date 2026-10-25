// 让整座万神殿随音乐“活”起来：用 Spark 的 dyno 着色器在世界坐标里改每个高斯点（位置、大小、颜色）。
//  · 基础：夜场变暗 + 主色染色 + 节拍冲击波 + 上升扫描带 + 地面低频光 + 穹顶中频光
//  · 地面清理：中央区域低处的高斯点（人群/地面拖影）直接隐藏，由 sets.js 的舞台地面代替
//  · assemble 开场：整座大厅的粒子从四面八方旋转汇聚成型
//  · shatter   爆散：重拍时整座大厅炸成粒子云，再慢慢复原
//  · gather    合成：一半的粒子汇聚成悬在空中的光球（再被下一段炸开）
//  · dissolve  飘散：粒子持续轻微漂浮、呼吸
//  · dream     梦核：粉彩虹彩色调、粒子变大变软、缓慢摇摆、部分碎片漂浮
//  · zoom      放大：整座大厅向外膨胀（副歌入口、片尾）
// 每个点的随机数只来自它的序号（hash），位置只由时间 t 决定，所以拖动进度条结果一致。
import * as THREE from 'three';
import { dyno } from '@sparkjsdev/spark';

export function createSplatFx(splat, cull) {
  const U = {
    p0: dyno.dynoVec4(new THREE.Vector4(0, 0, 0, 0)),     // kick, low, mid, high
    p1: dyno.dynoVec4(new THREE.Vector4(0, 1, 0, 0)),     // vox, dim, time, scan
    p2: dyno.dynoVec4(new THREE.Vector4(0, 0, 0, 0)),     // tint, floorGlow, domeGlow, flash
    p3: dyno.dynoVec4(new THREE.Vector4(0, 0, 0, 1)),     // dissolve, dream, shatter, assemble
    p4: dyno.dynoVec4(new THREE.Vector4(0, 0, cull.r, cull.h)), // gather, zoom, cullR, cullH
    p5: dyno.dynoVec4(new THREE.Vector4(0, 7, -7, 2.4)),   // 光球中心 xyz、半径
    rr: dyno.dynoVec4(new THREE.Vector4(-99, -99, -99, 0)), // 三个冲击波半径
    re: dyno.dynoVec4(new THREE.Vector4(0, 0, 0, 0)),     // 三个冲击波强度
    ca: dyno.dynoVec3(new THREE.Vector3(1, 0.2, 0.6)),
    cb: dyno.dynoVec3(new THREE.Vector3(0.2, 0.9, 1)),
  };
  const mod = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, p0: 'vec4', p1: 'vec4', p2: 'vec4', p3: 'vec4', p4: 'vec4', p5: 'vec4', rr: 'vec4', re: 'vec4', ca: 'vec3', cb: 'vec3' },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [
        'uint fx_pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }',
        'float fx_hf(uint v) { return float(fx_pcg(v) & 16777215u) / 16777215.0; }',
      ],
      statements: ({ inputs, outputs }) => dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        vec3 fx_c0 = ${inputs.gsplat}.center;
        float fx_t = ${inputs.p1}.z;
        // ---- 地面清理 ----
        float fx_keep = (${inputs.p4}.z > 0.0 && fx_c0.y < ${inputs.p4}.w && length(fx_c0.xz) < ${inputs.p4}.z) ? 0.0 : 1.0;
        // ---- 每点随机数与方向 ----
        uint fx_id = uint(${inputs.gsplat}.index);
        float fx_h1 = fx_hf(fx_id), fx_h2 = fx_hf(fx_id + 7919u), fx_h3 = fx_hf(fx_id + 104729u), fx_h4 = fx_hf(fx_id + 1299709u);
        vec3 fx_dir = normalize(vec3(fx_h1 - 0.5, fx_h2 - 0.4, fx_h3 - 0.5) + vec3(0.0001));
        vec3 fx_q = fx_c0;
        float fx_sz = 1.0;
        vec3 fx_add = vec3(0.0);
        float fx_alpha = 1.0;
        // 开场汇聚：每个点错开到达时间，沿螺旋飞回原位
        float fx_ta = smoothstep(fx_h4 * 0.55, fx_h4 * 0.55 + 0.45, ${inputs.p3}.w);
        float fx_inv = 1.0 - fx_ta;
        if (fx_inv > 0.0) {
          float fx_an = fx_inv * (1.5 + fx_h2 * 2.0);
          float fx_cs = cos(fx_an), fx_sn = sin(fx_an);
          fx_q.xz = vec2(fx_cs * fx_q.x - fx_sn * fx_q.z, fx_sn * fx_q.x + fx_cs * fx_q.z);
          fx_q += fx_dir * fx_inv * (10.0 + 16.0 * fx_h3);
          fx_q.y += fx_inv * 6.0;
          fx_sz *= mix(0.2, 1.0, fx_ta);
          fx_add += ${inputs.cb} * fx_inv * fx_ta * 3.0;
        }
        // 爆散
        float fx_sh = ${inputs.p3}.z;
        if (fx_sh > 0.0) {
          fx_q += fx_dir * fx_sh * (3.0 + 15.0 * fx_h3);
          fx_q.y += fx_sh * 2.0 * fx_h2;
          fx_sz *= 1.0 + fx_sh * 1.2;
          fx_add += mix(${inputs.ca}, vec3(1.0), 0.4) * fx_sh * 0.45;
        }
        // 合成光球：一半的粒子汇聚成球
        float fx_g = ${inputs.p4}.x;
        if (fx_g > 0.0) {
          float fx_sel = step(fx_h1, 0.4);
          float fx_gi = smoothstep(fx_h4 * 0.5, fx_h4 * 0.5 + 0.5, fx_g) * fx_sel;
          float fx_ga = fx_t * 0.9 + fx_h2 * 6.2831;
          vec3 fx_o = normalize(vec3(fx_h2 - 0.5, fx_h3 - 0.5, fx_h4 - 0.5) + vec3(0.0001));
          fx_o.xz = vec2(cos(fx_ga * 0.35) * fx_o.x - sin(fx_ga * 0.35) * fx_o.z, sin(fx_ga * 0.35) * fx_o.x + cos(fx_ga * 0.35) * fx_o.z);
          vec3 fx_orb = ${inputs.p5}.xyz + fx_o * (${inputs.p5}.w * (0.8 + 0.6 * fx_h3) + 0.3 * ${inputs.p0}.x);
          fx_q = mix(fx_q, fx_orb, fx_gi);
          fx_sz *= mix(1.0, 0.16, fx_gi);
          fx_add += mix(${inputs.ca}, ${inputs.cb}, fx_h3) * fx_gi * 1.3;
          fx_alpha *= 1.0 - 0.75 * fx_g * (1.0 - fx_sel);
        }
        // 飘散
        float fx_ds = ${inputs.p3}.x;
        if (fx_ds > 0.0) {
          fx_q += fx_dir * fx_ds * (0.8 + 3.2 * fx_h3) * (0.5 + 0.5 * sin(fx_t * 0.6 + fx_h1 * 6.2831));
          fx_q.y += fx_ds * 0.5 * sin(fx_t * 0.4 + fx_h2 * 6.2831);
        }
        // 梦核
        float fx_dr = ${inputs.p3}.y;
        if (fx_dr > 0.0) {
          fx_q += vec3(sin(fx_q.y * 0.7 + fx_t * 0.8 + fx_h1 * 6.2831), 0.35 * sin(fx_q.x * 0.5 + fx_t * 0.6), cos(fx_q.y * 0.6 + fx_t * 0.7 + fx_h2 * 6.2831)) * 0.22 * fx_dr * (0.3 + fx_h3);
          fx_q.y += fx_dr * step(0.84, fx_h1) * (0.5 + 0.5 * sin(fx_t * 0.5 + fx_h2 * 6.2831)) * 3.0;
          fx_sz *= 1.0 + fx_dr * (0.3 + 0.7 * fx_h3);
          fx_alpha *= 1.0 - 0.2 * fx_dr;
        }
        // 放大：整座大厅向外膨胀
        float fx_zm = ${inputs.p4}.y;
        fx_q = vec3(0.0, 1.3, 0.0) + (fx_q - vec3(0.0, 1.3, 0.0)) * (1.0 + fx_zm);
        fx_sz *= 1.0 + fx_zm;

        // ---- 颜色 ----
        vec3 fx_rgb = ${inputs.gsplat}.rgba.rgb;
        float fx_lum = dot(fx_rgb, vec3(0.299, 0.587, 0.114));
        float fx_dim = ${inputs.p1}.y + ${inputs.p2}.w;
        fx_dim *= mix(0.1, 1.0, smoothstep(0.3, ${inputs.p4}.w + 1.4, fx_c0.y));   // 低处起雾：人群拖影沉入黑暗
        float fx_d = length(fx_q - vec3(0.0, 1.3, 0.0));
        float fx_e = 0.0;
        for (int i = 0; i < 3; i++) {
          float fx_x = (fx_d - ${inputs.rr}[i]) / (1.2 + fx_d * 0.035);
          fx_e += exp(-fx_x * fx_x) * ${inputs.re}[i];
        }
        float fx_m = 0.5 + 0.5 * sin(fx_d * 0.3 - fx_t * 0.8);
        vec3 fx_col = mix(${inputs.ca}, ${inputs.cb}, fx_m);
        vec3 fx_out = fx_rgb * fx_dim;
        fx_out += fx_col * fx_e * (0.25 + fx_lum * 1.1);
        float fx_s = (fract(fx_q.y * 0.045 - fx_t * 0.07) - 0.5) * 9.0;
        fx_out += ${inputs.cb} * exp(-fx_s * fx_s) * ${inputs.p1}.w * (0.15 + fx_lum);
        fx_out += ${inputs.ca} * ${inputs.p0}.y * ${inputs.p2}.y * exp(-max(fx_q.y, 0.0) * 0.35) * (0.1 + fx_lum * 0.3);
        fx_out += ${inputs.cb} * ${inputs.p0}.z * ${inputs.p2}.z * smoothstep(5.0, 22.0, fx_q.y) * (0.1 + fx_lum * 0.6);
        vec3 fx_tc = mix(${inputs.ca}, ${inputs.cb}, clamp(fx_q.y / 22.0, 0.0, 1.0));
        fx_out = mix(fx_out, fx_out * (0.5 + 1.4 * fx_tc), ${inputs.p2}.x);
        if (fx_dr > 0.0) {                                           // 粉彩虹彩
          vec3 fx_pc = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fx_q.y * 0.03 + fx_t * 0.04 + fx_h3 * 0.15));
          fx_out = mix(fx_out, mix(vec3(fx_lum), fx_pc, 0.7) * 1.0 + 0.05, 0.38 * fx_dr);
        }
        fx_out += fx_add;
        ${outputs.gsplat}.center = fx_q;
        ${outputs.gsplat}.rgba.rgb = clamp(fx_out, 0.0, 1.0);
        ${outputs.gsplat}.rgba.a = ${inputs.gsplat}.rgba.a * fx_alpha * fx_keep;
        ${outputs.gsplat}.scales = ${inputs.gsplat}.scales * fx_sz * (1.0 + fx_e * 0.25) * fx_keep;
        if (fx_keep < 0.5) ${outputs.gsplat}.flags = 0u;
      `),
    });
    return { gsplat: d.apply({ gsplat, p0: U.p0, p1: U.p1, p2: U.p2, p3: U.p3, p4: U.p4, p5: U.p5, rr: U.rr, re: U.re, ca: U.ca, cb: U.cb }).gsplat };
  });
  splat.worldModifier = mod;
  splat.updateGenerator();

  return {
    // c: { t, f, style, ages[3], ev: { assemble, shatter, gather, zoom } }
    update(c) {
      const { f, style, ev } = c;
      U.p0.value.set(f.kick, f.low, f.mid, f.high);
      U.p1.value.set(f.vox, style.dim, c.t, style.pillars * f.hit * 0.9 + f.kick * 0.25 * style.bars);
      U.p2.value.set(style.tint, 0.8 * style.bars, 0.9, style.flash * f.hit * 0.9);
      U.p3.value.set(style.dissolve, style.dream, ev.shatter, ev.assemble);
      U.p4.value.set(ev.gather, ev.zoom, cull.r, cull.h);
      if (c.orb) U.p5.value.set(c.orb.x, c.orb.y, c.orb.z, 3.6);
      const R = (a) => a * 11, E = (a) => Math.exp(-a * 1.25) * (0.35 + 0.65 * style.shock);
      U.rr.value.set(R(c.ages[0]), R(c.ages[1]), R(c.ages[2]), 0);
      U.re.value.set(c.ages[0] < 3 ? E(c.ages[0]) : 0, c.ages[1] < 3 ? E(c.ages[1]) : 0, c.ages[2] < 3 ? E(c.ages[2]) : 0, 0);
      U.ca.value.set(style.ca.r, style.ca.g, style.ca.b);
      U.cb.value.set(style.cb.r, style.cb.g, style.cb.b);
      splat.updateVersion();
    },
    off() { splat.worldModifier = undefined; splat.updateGenerator(); },
  };
}
