/**
 * 车辆控制器 - 处理车辆物理和输入
 */
class VehicleController {
  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.rotation = 0;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.angularVelocity = 0;
    
    // 车辆参数
    this.maxSpeed = 0.3;
    this.acceleration = 0.02;
    this.friction = 0.95;
    this.turnSpeed = 0.08;
    this.brakeForce = 0.98;
    
    // 输入状态
    this.keys = {
      w: false, s: false, a: false, d: false
    };
    
    // 车辆网格
    this.vehicleGroup = null;
    this.wheels = [];
    
    this.createVehicle();
  }

  /**
   * 创建车辆3D模型
   */
  createVehicle() {
    this.vehicleGroup = new THREE.Group();
    
    // 车身
    const bodyGeometry = new THREE.BoxGeometry(1.5, 0.6, 3);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff4757 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    this.vehicleGroup.add(body);

    // 车轮
    const wheelGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x2c2c2c });
    
    const wheelPositions = [
      [-0.6, 0.25, 1], [0.6, 0.25, 1],
      [-0.6, 0.25, -1], [0.6, 0.25, -1]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.rotation.z = Math.PI / 2;
      this.vehicleGroup.add(wheel);
      this.wheels.push(wheel);
    });

    this.vehicleGroup.position.copy(this.position);
    this.vehicleGroup.rotation.y = this.rotation;
  }

  /**
   * 处理键盘输入
   */
  handleInput() {
    // 前进后退
    if (this.keys.w) {
      this.velocity.x += Math.sin(this.rotation) * this.acceleration;
      this.velocity.z += Math.cos(this.rotation) * this.acceleration;
    } else if (this.keys.s) {
      this.velocity.x -= Math.sin(this.rotation) * this.acceleration * 0.5;
      this.velocity.z -= Math.cos(this.rotation) * this.acceleration * 0.5;
    } else {
      this.velocity.multiplyScalar(this.friction);
    }

    // 转向
    if (this.keys.a && this.velocity.length() > 0.01) {
      this.rotation -= this.turnSpeed * (this.velocity.length() / this.maxSpeed);
    }
    if (this.keys.d && this.velocity.length() > 0.01) {
      this.rotation += this.turnSpeed * (this.velocity.length() / this.maxSpeed);
    }

    // 限制最大速度
    if (this.velocity.length() > this.maxSpeed) {
      this.velocity.normalize().multiplyScalar(this.maxSpeed);
    }
  }

  /**
   * 更新车辆位置和旋转
   */
  update() {
    this.handleInput();
    
    // 更新位置
    this.position.add(this.velocity);
    
    // 更新车辆网格
    if (this.vehicleGroup) {
      this.vehicleGroup.position.copy(this.position);
      this.vehicleGroup.rotation.y = this.rotation;
      
      // 旋转车轮
      this.wheels.forEach((wheel, index) => {
        wheel.rotation.x += this.velocity.length() * 0.2;
        if (index < 2) { // 前轮转向
          wheel.rotation.y = (this.keys.a ? -0.3 : 0) + (this.keys.d ? 0.3 : 0);
        }
      });
    }
  }

  /**
   * 获取车辆速度（km/h）
   */
  getSpeed() {
    return Math.round(this.velocity.length() * 100);
  }

  /**
   * 获取车辆方向向量
   */
  getDirection() {
    return new THREE.Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );
  }

  /**
   * 设置车辆位置
   */
  setPosition(x, y, z) {
    this.position.set(x, y, z);
    if (this.vehicleGroup) {
      this.vehicleGroup.position.copy(this.position);
    }
  }

  /**
   * 设置车辆旋转
   */
  setRotation(angle) {
    this.rotation = angle;
    if (this.vehicleGroup) {
      this.vehicleGroup.rotation.y = this.rotation;
    }
  }

  /**
   * 获取车辆网格（用于添加到场景）
   */
  getMesh() {
    return this.vehicleGroup;
  }
}

