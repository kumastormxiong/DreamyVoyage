# 自动驾驶游戏 - Three.js + WebGPU

一个使用 Three.js 和柏林噪声生成的自动驾驶游戏，具有程序化地形和自动道路生成功能。

## 功能特性

- 🌍 **程序化地形生成** - 使用柏林噪声创建起伏的地形
- 🛣️ **自动道路生成** - 智能生成蜿蜒的道路网络
- 🚗 **自动驾驶系统** - 车辆可以沿着道路自动行驶
- 🎮 **手动控制** - 支持 WASD 键盘控制
- 📊 **实时UI** - 显示速度、FPS、行驶距离等信息
- 🎨 **美观渲染** - 基于高度的地形着色和光照

## 文件结构

```
study/
├── game.html              # 主游戏页面
├── css/
│   └── game.css           # 游戏样式
├── js/
│   ├── terrain-generator.js  # 地形生成器
│   ├── road-generator.js     # 道路生成器
│   ├── vehicle-controller.js # 车辆控制器
│   ├── autopilot.js          # 自动驾驶系统
│   └── game-engine.js       # 游戏引擎
├── config/
│   └── game-config.json      # 游戏配置文件
└── README.md                 # 说明文档
```

## 控制说明

- **WASD** - 手动控制车辆（前进/后退/左转/右转）
- **空格键** - 切换自动驾驶模式
- **鼠标拖拽** - 旋转相机视角
- **滚轮** - 缩放视角

## 技术实现

### 地形生成
- 使用简化的柏林噪声算法
- 分形布朗运动 (fBm) 生成自然地形
- 基于高度的地形着色（水面、沙滩、草地、岩石、雪山）

### 道路生成
- 随机路径生成算法
- 平滑的道路转向
- 道路网格生成和渲染

### 自动驾驶
- 路径跟随算法
- 前瞻点计算
- 平滑转向控制

### 车辆物理
- 简化的车辆动力学
- 速度限制和摩擦力
- 车轮动画

## 扩展开发

### 添加新功能
1. 在 `js/` 目录下创建新的模块文件
2. 在 `game-engine.js` 中集成新模块
3. 更新 `game.html` 引入新的脚本文件

### 修改配置
编辑 `config/game-config.json` 文件来调整：
- 地形参数（大小、高度、噪声）
- 道路参数（宽度、长度）
- 车辆参数（速度、转向）
- 相机参数（视角、跟随距离）

### 自定义地形
修改 `terrain-generator.js` 中的噪声函数：
```javascript
// 自定义噪声函数
noise(x, z) {
  // 你的噪声实现
  return customNoiseValue;
}
```

### 添加新车辆类型
扩展 `vehicle-controller.js`：
```javascript
class CustomVehicle extends VehicleController {
  constructor() {
    super();
    // 自定义车辆参数
  }
}
```

## 运行游戏

1. 启动本地服务器：
   ```bash
   python -m http.server 5500
   ```

2. 打开浏览器访问：
   ```
   http://127.0.0.1:5500/study/game.html
   ```

## 性能优化

- 地形LOD（细节层次）系统
- 视锥体剔除
- 纹理压缩
- 批量渲染

## 未来计划

- [ ] 添加更多车辆类型
- [ ] 实现交通系统
- [ ] 添加天气效果
- [ ] 支持移动端触控
- [ ] 多人联机功能
- [ ] 关卡编辑器

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 许可证

MIT License

