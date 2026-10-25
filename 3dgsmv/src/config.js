// vr3dgs 配置：模型摆放、画质档位、各段落（沿用 GhostChain MV 的 world 名）对应的视觉风格。
import * as THREE from 'three';

export const SPLAT_URL = 'assets/pantheon.sog';
export const AUDIO_URL = 'audio/ChainedGhost.mp3';
export const LIFT = 0.9;                // 观众抬高（米）：站在比地面略高的平台上，视野更开阔、离地面伪影更远
export const EYE = 1.6 + LIFT;          // 预览相机眼高（米）；VR 里是 rig 抬高 LIFT，再加头显自身高度

// 模型：SOG 里的万神殿是倒置的（地面朝 +Y），绕 X 轴翻 180° 摆正；约 3 倍放大后接近真实尺度，
// 观众站在大厅中心的地面上（原点）：实测地面在模型局部高度处，y=-2.25 把地面落到世界 y=0。可用网址参数微调：?s=3 缩放 &sy=-2.25 整体上下平移（米；-7.5 是漂在半空俯瞰的视角） &ry=0 绕竖轴转角度
export const SPLAT_XFORM = { scale: 3, y: -2.25, rotY: 0 };

// 画质：keep = 精简后保留的高斯点数（0 = 不精简，用 LoD）；grow = 保留的点放大倍数（补洞）；lod = 同屏最多渲染多少个高斯点（原模型 400 万，Spark 会按距离自动抽稀）；scale = VR 帧缓冲倍率；fov = 注视点渲染强度；
// fx = 是否让大厅随音乐发光；fxHz = 发光着色器刷新频率（0 = 每帧；头显上降频以省 GPU，可用网址参数 ?fx=0 完全关闭）
export const QUALITY = {
  high: { label: '高（电脑 · 完整模型 400 万点）', lod: 1500000, keep: 0, grow: 1, scale: 1.0,  fov: 0.3, fx: 1, fxHz: 0 },
  std:  { label: '标准（Quest 3 · 约 90 万点）',   lod: 0, keep: 900000, grow: 1.15,  scale: 0.85, fov: 0.6, fx: 1, fxHz: 30 },
  low:  { label: '省电（Quest 2 · 约 30 万大点）', lod: 0, keep: 300000, grow: 1.6,  scale: 0.7,  fov: 1.0, fx: 1, fxHz: 12 },
};

// 地面清理：半径 CULL_R、高度 CULL_H 以内的高斯点（人群/地面拖影）全部隐藏，换成舞台地面（?cr= ?ch= 可调；?cr=0 关闭）
export const CULL = { r: 17.5, h: 3.0 };
export const FLOOR_R = 22;

export const WALK_RADIUS = 7;           // 观众在大厅里最多走多远（米）
export const MOVE_SPEED = 2.5;
export const SNAP_TURN = Math.PI / 6;
export const PREVIEW_FOV = 75;

const P = 0xff2f8f, C = 0x3ff6ff, V = 0xa33cff, M = 0xff4fd8, Y = 0xffd84a, G = 0x7dffb0, O = 0xff8a3c, W = 0xffffff;

// 每个 world 的风格：pal 两种主色；dim 大厅亮度（0 全黑 ~ 1 原样）；tint 把大厅染成主色的程度；
// dissolve 万神殿粒子飘散 dream 梦核（粉彩虹彩+软化放大+漂浮） tunnel 光环隧道 city 霓虹城市 net 神经网络 debris 悬浮碎片 grid 复古网格地面 circuit 电路地面
// bars 近处频谱环；pillars 远处光柱；motes 漂浮光点；shock 节拍冲击波；rain 假名雨；helix DNA 螺旋；flash 重拍频闪；pitch 自动运镜仰角
const S = (pal, o) => ({ pal, dim: 0.3, tint: 0.5, bars: 0.5, pillars: 0.5, motes: 0.5, shock: 0.5, rain: 0, helix: 0, flash: 0, pitch: 0.12,
  dissolve: 0, dream: 0, tunnel: 0, city: 0, net: 0, debris: 0, grid: 0, circuit: 0, ...o });
export const WORLD_STYLE = {
  void:      S([P, C], { dim: 0.22, dissolve: 0.08, bars: 0.25, pillars: 0.4, motes: 0.7, shock: 0.25, pitch: 0.25 }),
  matrix:    S([C, G], { dim: 0.3, grid: 0.35, bars: 0.35, pillars: 0.25, motes: 0.3, shock: 0.1, rain: 1, pitch: 0.2 }),
  highway:   S([P, C], { dim: 0.38, grid: 1, tunnel: 0.3, bars: 0.9, pillars: 0.7, motes: 0.6, shock: 0.9, pitch: 0.1 }),
  hit:       S([W, C], { dim: 0.5, debris: 0.7, bars: 0.6, pillars: 0.9, motes: 0.4, shock: 1, flash: 1, pitch: 0.15 }),
  dream:     S([V, C], { dim: 0.3, dream: 1, dissolve: 0.2, bars: 0.3, pillars: 0.3, motes: 1, shock: 0.3, rain: 0.25, pitch: 0.35 }),
  cpu:       S([Y, C], { dim: 0.3, circuit: 1, bars: 1, pillars: 0.4, motes: 0.4, shock: 0.5, rain: 0.5, pitch: 0.1 }),
  city:      S([M, C], { dim: 0.35, city: 1, bars: 0.7, pillars: 0.6, motes: 0.5, shock: 0.6, pitch: 0.12 }),
  tunnel:    S([M, C], { dim: 0.42, tunnel: 1, bars: 1, pillars: 1, motes: 0.8, shock: 1, pitch: 0.4 }),
  wasteland: S([O, P], { dim: 0.3, debris: 1, dissolve: 0.35, bars: 0.4, pillars: 0.5, motes: 0.9, shock: 0.2, pitch: 0.08 }),
  outro:     S([P, C], { dim: 0.36, tunnel: 0.35, dissolve: 0.1, bars: 0.8, pillars: 0.8, motes: 0.8, shock: 0.8, pitch: 0.3 }),
  dna:       S([C, M], { dim: 0.25, dissolve: 0.12, bars: 0.3, pillars: 0.3, motes: 0.5, shock: 0.3, helix: 1, pitch: 0.45 }),
  soul:      S([P, C], { dim: 0.3, dream: 0.3, bars: 0.4, pillars: 0.7, motes: 1, shock: 0.4, pitch: 0.4 }),
  flash:     S([W, C], { dim: 0.6, debris: 0.8, bars: 0.7, pillars: 1, motes: 0.5, shock: 1, flash: 1, pitch: 0.2 }),
  neural:    S([C, Y], { dim: 0.3, net: 1, dream: 0.5, bars: 0.4, pillars: 0.5, motes: 1, shock: 0.3, rain: 0.4, pitch: 0.3 }),
  endcard:   S([P, C], { dim: 0.3, dream: 0.3, bars: 0.3, pillars: 0.6, motes: 0.8, shock: 0.3, pitch: 0.3 }),
};

const KEYS = ['dim', 'tint', 'bars', 'pillars', 'motes', 'shock', 'rain', 'helix', 'flash', 'pitch', 'dissolve', 'dream', 'tunnel', 'city', 'net', 'debris', 'grid', 'circuit'];
const _a = new THREE.Color(), _b = new THREE.Color();
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// 取 t 时刻的风格：段落切换后的前 1.4 秒从上一段平滑过渡
export function styleAt(tl, S0, out) {
  const cur = WORLD_STYLE[S0.sec.world] || WORLD_STYLE.void;
  const prevSec = tl.sections[Math.max(0, S0.index - 1)];
  const prev = WORLD_STYLE[prevSec.world] || cur;
  const k = S0.index === 0 ? 1 : sm(S0.lt / 1.4);
  for (const key of KEYS) out[key] = prev[key] + (cur[key] - prev[key]) * k;
  out.ca = out.ca || new THREE.Color(); out.cb = out.cb || new THREE.Color();
  out.ca.copy(_a.set(prev.pal[0]).lerp(_b.set(cur.pal[0]), k));
  _a.set(prev.pal[1]).lerp(_b.set(cur.pal[1]), k); out.cb.copy(_a);
  return out;
}
