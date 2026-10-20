// VRMV 配置：只属于 VR 版的参数，原 MV 不读取这里。
// 1 个场景单位 = 1 米（WebXR 的世界单位就是米）。

export const EYE = 1.6;               // 观众眼睛离脚下平台的高度（米）
export const AUDIO_FILE = '../audio/ChainedGhost.mp3';   // 相对本文件夹 src/ 的路径

// 画质：VR 帧缓冲倍率 + 注视点渲染强度（0 关闭 ~ 1 最强，越强越省性能、边缘越模糊）
export const VR_QUALITY = {
  high: { label: '高（Quest 3）', scale: 1.0, foveation: 0.3 },
  std:  { label: '标准', scale: 0.85, foveation: 0.6 },
  low:  { label: '省电（Quest 2）', scale: 0.7, foveation: 1.0 },
};

// 观众平台的默认跟随方式：
//   follow：平台平滑地跟着原 MV 的镜头位置走（去掉抖动、侧倾和俯仰，只保留慢速移动），tau 越大越平滑
//   anchor：每段开始时站在原镜头的位置，之后不动，观众自己转头、走动
//   fixed：站在指定位置（eye 为眼睛坐标，look 为面朝的点）
export const DEFAULT_MODE = { mode: 'follow', tau: 1.2 };

export const VR_WORLD = {
  // DNA：站在双螺旋脚下的地面上仰望，锁链从身边升起，横档在头顶一根根接上
  dna: { mode: 'fixed', eye: [0, -10.4, 20], look: [0, -2, 0] },
  // 环绕镜头转得快的场景：改为每段固定站位，避免晕动
  neural: { mode: 'anchor' },
  // 五十音墙：站在弧形墙的圆心，墙的另两面由 vr_patches 复制补齐，围成一圈
  matrix: { mode: 'fixed', eye: [0, 4.2, 15], look: [0, 3.4, -2] },
  // 抖动镜头的场景：固定站位，抖动交给画面本身
  hit: { mode: 'anchor' },
  flash: { mode: 'anchor' },
};

// 被 3D 立体字替换掉的原平面字、被全方位特效替换的原屏幕特效，移到这个图层（镜头不渲染）
export const HIDE_LAYER = 7;

// 各场景的 VR 着色器特效（vr_fx.js）：nebula 星云穹顶，motes 身边的能量光点
const P = 0xff2f8f, C = 0x3ff6ff, M = 0xff4fd8, Y = 0xffd84a;
export const VR_FX = {
  void:    { nebula: { a: P, b: C, i: 0.32 }, motes: { a: P, b: C, n: 1400 } },
  matrix:  { motes: { a: C, b: 0x9fffd0, n: 900, rise: -0.4 } },
  neural:  { nebula: { a: C, b: Y, i: 0.18 }, motes: { a: C, b: Y, n: 1200 } },
  dna:     { nebula: { a: C, b: M, i: 0.22 }, motes: { a: C, b: M, n: 1400, rise: 0.5 } },
  outro:   { motes: { a: P, b: C, n: 1000 } },
  soul:    { nebula: { a: P, b: C, i: 0.28 }, motes: { a: P, b: C, n: 1400, rise: 0.4 } },
  flash:   { motes: { a: 0xffffff, b: C, n: 600 } },
  endcard: { nebula: { a: P, b: C, i: 0.22 }, motes: { a: P, b: C, n: 1000 } },
  tunnel:  { motes: { a: M, b: C, n: 900, rMax: 14 } },
  cpu:     { motes: { a: Y, b: C, n: 900 } },
};

// 穿越场景：飞过观众身后的物体，再往后飞多远才回收（米）。原 MV 一过镜头就消失，VR 里转头会看到
export const BEHIND = { tunnel: 30, highway: 40 };

// 尾奏 ヌ 全方位包围（vr_patches.js）
export const NU_SHELL = { count: 64, rMin: 7.5, rMax: 10.5, sizeMin: 1.8, sizeMax: 4.2, start: 173.0, spread: 1.8, black: [174.0, 175.0] };

// 预览模式（非 VR 浏览器）
export const PREVIEW_FOV = 75;
export const MOVE_SPEED = 2.5;        // 摇杆 / WASD 移动速度（米/秒）
export const SNAP_TURN = Math.PI / 6; // 右摇杆每次转 30°
