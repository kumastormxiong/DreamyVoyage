// 角色"活着"的动态：呼吸 + 发丝/衣摆轻微摆动。纯顶点着色器，不改模型、不增加文件大小。
// 展厅（src/stage.js）和游戏（game/game.js）共用；设置存在 localStorage（同源共享），随时可关。
import * as THREE from 'three';

const KEY = 'dm_life';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const LIFE = {
  on: true, breath: 1, hair: 1,
  uT: { value: 0 }, uA: { value: new THREE.Vector2(1, 1) },
};
try {
  const j = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (j) { LIFE.on = j.on !== false; LIFE.breath = clamp(+j.breath || 0, 0, 2.5); LIFE.hair = clamp(+j.hair || 0, 0, 2.5); }
} catch (e) { /* 无痕模式等：用默认值 */ }

export function setLife(o) {
  Object.assign(LIFE, o);
  try { localStorage.setItem(KEY, JSON.stringify({ on: LIFE.on, breath: LIFE.breath, hair: LIFE.hair })); } catch (e) { /* ignore */ }
}
// 每帧调用一次；boost 用来在"解锁"之类的时刻让动作更明显
export function tickLife(t, boost = 1) {
  LIFE.uT.value = t;
  LIFE.uA.value.set(LIFE.on ? LIFE.breath * boost : 0, LIFE.on ? LIFE.hair * boost : 0);
}

const DECL = 'uniform float uLT; uniform vec4 uLB; uniform float uLR; uniform vec2 uLA;\n';
const BODY = `#include <begin_vertex>
{ // LIFE：呼吸 + 摆动（位置的连续函数，不会撕裂网格）
  vec3 p0 = transformed; float H = max(uLB.y, 1e-4);
  float h = clamp((p0.y - uLB.x) / H, 0.0, 1.0);
  vec2 rv = p0.xz - uLB.zw; float rr = length(rv) / max(uLR, 1e-4);
  float br = sin(uLT * 1.75);
  float chest = smoothstep(0.22, 0.5, h) * (1.0 - smoothstep(0.75, 0.95, h));
  transformed.xz = uLB.zw + rv * (1.0 + 0.012 * uLA.x * br * chest);
  transformed.y += H * 0.004 * uLA.x * sin(uLT * 1.75 - 0.6) * smoothstep(0.08, 0.9, h);
  float m = smoothstep(0.30, 0.85, rr) * smoothstep(0.08, 0.32, h) * (0.45 + 0.55 * (1.0 - h));
  float A = H * 0.012 * uLA.y * m;
  float q = p0.y / H;
  transformed.x += A * (sin(uLT * 1.6 + q * 6.0 + p0.z / H * 2.0) + 0.5 * sin(uLT * 2.9 + p0.x / H * 5.0));
  transformed.z += A * 0.8 * sin(uLT * 1.3 + 1.7 + q * 5.0 + p0.x / H * 2.0);
}`;

// 给材质加上呼吸/摆动。mesh 用来取模型自身的包围盒（几何体坐标）。可叠加在别的 onBeforeCompile 之上；克隆材质后要重新调用。
export function lifeify(mat, mesh) {
  if (!mat || mat.userData.lifeOn) return;
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  mat.userData.lifeOn = true;
  mat.userData.uLB = { value: new THREE.Vector4(b.min.y, b.max.y - b.min.y, (b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2) };
  mat.userData.uLR = { value: Math.max((b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 2) };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.call(mat) : '';
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uLT = LIFE.uT; sh.uniforms.uLA = LIFE.uA; sh.uniforms.uLB = mat.userData.uLB; sh.uniforms.uLR = mat.userData.uLR;
    sh.vertexShader = DECL + sh.vertexShader.replace('#include <begin_vertex>', BODY);
  };
  mat.customProgramCacheKey = () => prevKey + '|life1';
  mat.needsUpdate = true;
}
