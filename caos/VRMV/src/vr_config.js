// VRMV 配置：只属于 VR 版的参数，平面 MV 不读取这里。1 个场景单位 = 1 米。
// project.json 的 vr.world_modes / vr.default_mode / vr.eye 会在启动时覆盖这里的同名设置。

export let EYE = 1.6;                 // 观众眼睛离脚下平台的高度（米）
export const setEye = (v) => { EYE = v; };

// 画质：VR 帧缓冲倍率 + 注视点渲染强度（0 关 ~ 1 最强）
export const VR_QUALITY = {
  high: { label: '高（Quest 3）', scale: 1.0, foveation: 0.3 },
  std:  { label: '标准', scale: 0.85, foveation: 0.6 },
  low:  { label: '省电（Quest 2）', scale: 0.7, foveation: 1.0 },
};

// 观众平台跟随方式：
//   follow：平滑跟着原 MV 镜头位置走（去掉抖动、侧倾、俯仰），tau 越大越平滑   —— 适合缓慢推进的镜头
//   anchor：每段开始站在原镜头位置，之后不动，观众自己转头走动                 —— 适合镜头抖动/快速环绕的场景（防晕）
//   fixed ：站在指定位置 eye:[x,y,z]，面朝 look:[x,y,z]                         —— 适合需要精确站位的场景
export const DEFAULT_MODE = { mode: 'follow', tau: 1.2 };
export const VR_WORLD = {
  tunnel: { mode: 'anchor' },        // 隧道本身在飞，观众站定即可
  endcard: { mode: 'anchor' },
};

// 被替换掉的原物体移到这个图层（镜头不渲染）
export const HIDE_LAYER = 7;

// VR 着色器特效（vr_fx.js）：nebula 星云穹顶，motes 身边的能量光点。颜色可用 project 色板
const P = 0xff2f8f, C = 0x3ff6ff, M = 0xff4fd8;
export const VR_FX = {
  void:    { nebula: { a: P, b: C, i: 0.3 }, motes: { a: P, b: C, n: 1200 } },
  grid:    { motes: { a: M, b: C, n: 700 } },
  tunnel:  { motes: { a: M, b: C, n: 900, rMax: 14 } },
  endcard: { nebula: { a: P, b: C, i: 0.22 }, motes: { a: P, b: C, n: 900 } },
};

export const PREVIEW_FOV = 75;
export const MOVE_SPEED = 2.5;        // 摇杆 / WASD 移动速度（米/秒）
export const SNAP_TURN = Math.PI / 6; // 右摇杆每次转 30°
