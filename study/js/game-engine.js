/**
 * 游戏引擎 - 整合所有系统的主控制器
 */
class GameEngine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    this.terrainGenerator = null;
    this.roadGenerator = null;
    this.vehicle = null;
    this.autopilot = null;
    
    this.isRunning = false;
    this.frameCount = 0;
    this.lastTime = 0;
    this.fps = 0;
    
    this.distance = 0;
    this.lastPosition = new THREE.Vector3();
    
    this.init();
  }

  /**
   * 初始化游戏
   */
  init() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createLights();
    this.createSystems();
    this.setupControls();
    this.setupEventListeners();
    
    this.start();
  }

  /**
   * 创建场景
   */
  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // 天空蓝
  }

  /**
   * 创建相机
   */
  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 15, 20);
  }

  /**
   * 创建渲染器
   */
  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    document.getElementById('game-container').appendChild(this.renderer.domElement);
  }

  /**
   * 创建光源
   */
  createLights() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    this.scene.add(ambientLight);
    
    // 方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);
  }

  /**
   * 创建游戏系统
   */
  createSystems() {
    // 地形生成器
    this.terrainGenerator = new TerrainGenerator();
    const terrain = this.terrainGenerator.createTerrainMesh();
    this.scene.add(terrain);
    
    // 道路生成器
    this.roadGenerator = new RoadGenerator(this.terrainGenerator);
    const road = this.roadGenerator.createRoadMesh();
    this.scene.add(road);
    
    // 车辆控制器
    this.vehicle = new VehicleController();
    this.scene.add(this.vehicle.getMesh());
    
    // 自动驾驶系统
    this.autopilot = new Autopilot(this.vehicle, this.roadGenerator);
    
    // 设置车辆初始位置
    this.autopilot.resetToRoadStart();
    this.lastPosition.copy(this.vehicle.position);
  }

  /**
   * 设置相机控制
   */
  setupControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0, 0);
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 键盘事件
    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key in this.vehicle.keys) {
        this.vehicle.keys[key] = true;
      }
      
      // 空格键切换自动驾驶
      if (key === ' ') {
        event.preventDefault();
        const isActive = this.autopilot.toggle();
        console.log('自动驾驶:', isActive ? '开启' : '关闭');
      }
    });

    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (key in this.vehicle.keys) {
        this.vehicle.keys[key] = false;
      }
    });

    // 窗口大小调整
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * 更新游戏状态
   */
  update() {
    // 更新车辆
    this.vehicle.update();
    
    // 更新自动驾驶
    this.autopilot.update();
    
    // 更新相机跟随
    this.updateCamera();
    
    // 更新UI
    this.updateUI();
    
    // 计算距离
    this.calculateDistance();
  }

  /**
   * 更新相机跟随
   */
  updateCamera() {
    const vehiclePos = this.vehicle.position;
    const vehicleDir = this.vehicle.getDirection();
    
    // 相机位置（车辆后方）
    const cameraOffset = new THREE.Vector3(
      -vehicleDir.x * 15,
      8,
      -vehicleDir.z * 15
    );
    
    this.camera.position.copy(vehiclePos).add(cameraOffset);
    this.camera.lookAt(vehiclePos);
    this.controls.target.copy(vehiclePos);
  }

  /**
   * 更新UI显示
   */
  updateUI() {
    // 更新FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = now;
    }
    
    document.getElementById('fps').textContent = this.fps;
    document.getElementById('speed').textContent = this.vehicle.getSpeed();
    document.getElementById('distance').textContent = Math.round(this.distance);
  }

  /**
   * 计算行驶距离
   */
  calculateDistance() {
    const currentPos = this.vehicle.position;
    const distance = this.lastPosition.distanceTo(currentPos);
    this.distance += distance;
    this.lastPosition.copy(currentPos);
  }

  /**
   * 渲染循环
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 动画循环
   */
  animate() {
    if (!this.isRunning) return;
    
    requestAnimationFrame(() => this.animate());
    
    this.update();
    this.controls.update();
    this.render();
  }

  /**
   * 启动游戏
   */
  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  /**
   * 停止游戏
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * 获取游戏状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      fps: this.fps,
      distance: this.distance,
      autopilot: this.autopilot.getStatus()
    };
  }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
  const game = new GameEngine();
  window.game = game; // 全局访问，便于调试
});

