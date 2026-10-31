import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;

// 色相(0..1) + 饱和度 → 颜色（饱和度 0 = 白）
export function hsColor(h, s, out = new THREE.Color()) {
  return out.setHSL(((h % 1) + 1) % 1, s, 0.5 + 0.5 * (1 - s));
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 着色器公共部分：噪声、网格线、统一变量、雾
export const GLSL_NOISE = /* glsl */`
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

export const GLSL_GRID = /* glsl */`
float gridL(vec2 p, float s, float w){
  vec2 q = p / s; vec2 fw = max(fwidth(q), vec2(1e-4));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float l = 1.0 - min(min(g.x, g.y) / w, 1.0);
  return l * (1.0 - smoothstep(0.25, 0.8, max(fw.x, fw.y)));
}`;

export const GLSL_HDR = /* glsl */`
uniform float uT, uGlow, uAud, uFog, uRain;
uniform vec3 uA, uB, uC, uTop, uMid, uBot, uFogCol;
vec3 fogMix(vec3 c, float d){ float f = 1.0 - exp(-uFog * uFog * d * d); return mix(c, uFogCol, f); }
`;
