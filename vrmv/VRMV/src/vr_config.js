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

// 虚拟歌手（vr_singer.js）：混元3D 人物，每个有歌词的段落由一位出现在观众左前方唱歌，显示在所有内容之前
// 人物模型由 tools/singer/process.mjs 从 3D Model/*.glb 生成（每个 6 万三角面）；landmark 坐标（米）是去掉节点旋转后的模型坐标
export const SINGER = {
  pos: [-0.55, 0, -1.35],                  // 相对观众视线（hud）：左 0.55 米、前 1.35 米
  eyeDrop: 0.06,                           // 人物眼睛比观众视线低多少（米）
  fadeIn: 0.9, fadeOut: 0.6,               // 段落开始显形 / 结束消失（秒）
  mouthW: 0.03, jaw: 0.014,                // 半个嘴宽默认值、最大张嘴幅度（米）
  // 转头：一直看着观众；tau 为跟随的平滑时间（秒），超出 maxYaw / maxPitch（弧度）时停在极限角度
  look: { tau: 0.25, maxYaw: 0.7, maxPitch: 0.35 },
  // 头发物理：弹簧（频率 Hz、阻尼比）、风、手柄推开的半径和力度
  hair: { hz: 1.1, zeta: 0.25, wind: 0.5, handR: 0.2, push: 45, drag: 7, max: 0.12, ctl: 24, len: 0.35 },
  env: 0.7, key: 0.75, rim: 0.4, rimA: 0xff2f8f, rimB: 0x3ff6ff,
};
export const SINGERS = {
  g1: { url: '../assets/singer/g1.glb', mouth: [0.0044, 0.7595, 0.19], cornerL: [-0.0276, 0.7598, 0.183], cornerR: [0.0364, 0.7598, 0.183],
        eyeL: [-0.0454, 0.8297, 0.2091], eyeR: [0.0558, 0.8309, 0.2092] },
  g2: { url: '../assets/singer/g2.glb', mouth: [-0.0954, 0.7605, 0.078], cornerL: [-0.1248, 0.7642, 0.0684], cornerR: [-0.0689, 0.7564, 0.0682],
        eyeL: [-0.1543, 0.8214, 0.0366], eyeR: [-0.0679, 0.8398, 0.049] },
  g3: { url: '../assets/singer/g3.glb', mouth: [0.0849, 0.7256, 0.0718], cornerL: [0.0527, 0.7262, 0.0735], cornerR: [0.0963, 0.7268, 0.0445],
        eyeL: [0.0645, 0.7914, 0.1034], eyeR: [0.1337, 0.7898, 0.0863] },
  g4: { url: '../assets/singer/g4.glb', mouth: [0.0459, 0.8379, 0.1898], cornerL: [0.0261, 0.8394, 0.184], cornerR: [0.0664, 0.8395, 0.1826],
        eyeL: [-0.002, 0.9036, 0.2066], eyeR: [0.0933, 0.9052, 0.1942] },
  g5: { url: '../assets/singer/g5.glb', mouth: [0.0065, 0.7922, 0.1174], cornerL: [-0.021, 0.7948, 0.1124], cornerR: [0.0344, 0.7947, 0.1059],
        eyeL: [-0.0491, 0.8684, 0.1328], eyeR: [0.0535, 0.8684, 0.1319] },
};
// 段落 → 人物（不在表里的段落没有歌手）
export const SINGER_BY_SECTION = {
  verse1: 'g5', pre1: 'g1', chorus1: 'g1', verse2: 'g3', pre2: 'g3',
  chorus2: 'g4', bridge: 'g2', chorus3: 'g1', outro: 'g5', dna: 'g4',
};
