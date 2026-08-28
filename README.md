# 幻梦之旅（Dreamy Voyage）- 炫酷音乐播放网页

## 项目简介

**幻梦之旅（Dreamy Voyage）** 是一个纯前端、高颜值、沉浸式的赛博朋克风格音乐播放网页应用。包含全景 WebGL 极光 Shader 背景、Web Audio 实时音频频谱可视化、卡片式播放器交互以及海报分享与 PWA 支持。

---

## ✨ 核心特性

- 🌌 **全景 WebGL 液态 FBM 极光 Shader**：纯 GLSL 片元着色器实时计算渲染梦幻液态极光背景，高斯模糊沉浸效果。
- 🎵 **2D 环形音频频谱可视化**：基于 Web Audio API (`AnalyserNode`) 实时提取音频频域数据，绘制律动声波圆环。
- 🎛️ **平滑交互与阻尼缓动**：60fps Lerp 缓动进度条，支持精确拖拽快进/快退。
- 📜 **侧边抽屉歌单**：支持移动端抽屉手势、点击切歌、上一首/下一首与自动连播。
- 📱 **响应式与移动端适配**：自适应桌面端与移动端屏幕，支持移动端全屏播放沉浸体验。
- 📤 **多功能分享海报**：动态结合 WebGL 画面截帧生成专属带二维码的分享海报，支持 Web Share API。
- ⚡ **PWA 渐进式应用支持**：内置 `manifest.json` 与 `sw.js` Service Worker，支持离线外壳与安装到桌面。

---

## 📁 目录结构

```text
DreamyVoyage/
├── index.html           # 播放器核心页面
├── main.js              # 播放控制、WebGL背景、音频可视化及海报生成逻辑
├── style.css            # 播放器赛博朋克风格样式表
├── mp3s/                # 音乐文件目录（包含全部50首原创音轨）
├── song-list.js         # 歌曲列表数据文件
├── song-list.json       # 歌曲列表 JSON 配置
├── cover.png            # 默认专辑封面
├── favicon_circle.png   # 网页图标
├── manifest.json        # PWA 配置文件
├── sw.js                # PWA Service Worker 离线缓存脚本
├── update_songs.py      # 自动扫描 mp3s 目录并更新歌单的 Python 脚本
├── run_update.bat       # 一键运行更新歌单脚本
└── start_player.bat     # 一键启动本地服务并在浏览器打开播放器
```

---

## 🚀 本地运行方式

由于浏览器的安全策略（Web Audio API 处理本地音频时，`file:///` 协议可能受 CORS 限制），建议使用本地 HTTP 服务运行：

### 方法一：一键启动（推荐，Windows）
双击根目录下的 **`start_player.bat`**，将自动启动本地 HTTP 服务并在默认浏览器中打开 `http://localhost:8000`。

### 方法二：Python 命令
打开终端进入项目根目录执行：
```bash
python -m http.server 8000
```
然后在浏览器中访问：`http://localhost:8000`

### 方法三：Node.js
```bash
npx http-server -p 8000
```
然后在浏览器中访问：`http://localhost:8000`

---

## 🎶 添加与更新歌曲

1. 将你的 `.mp3` 音频文件放入 `mp3s/` 文件夹中。
2. 双击运行 **`run_update.bat`**（或在终端运行 `python update_songs.py`）。
3. 脚本会自动重新扫描 `mp3s/` 目录并更新 `song-list.js`。
4. 刷新网页即可看到更新后的曲目。
