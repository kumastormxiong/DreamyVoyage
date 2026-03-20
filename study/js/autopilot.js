/**
 * 自动驾驶系统 - 让车辆沿着道路自动行驶
 */
class Autopilot {
  constructor(vehicle, roadGenerator) {
    this.vehicle = vehicle;
    this.road = roadGenerator;
    this.isActive = false;
    this.currentRoadIndex = 0;
    this.lookAheadDistance = 3;
    this.targetPoint = null;
    this.steeringAngle = 0;
    this.speed = 0.2;
  }

  /**
   * 激活/关闭自动驾驶
   */
  toggle() {
    this.isActive = !this.isActive;
    return this.isActive;
  }

  /**
   * 更新自动驾驶逻辑
   */
  update() {
    if (!this.isActive) return;

    // 获取车辆当前位置
    const vehiclePos = this.vehicle.position;
    
    // 找到最近的道路点
    const closest = this.road.getClosestRoadPoint(vehiclePos.x, vehiclePos.z);
    this.currentRoadIndex = closest.index;
    
    // 获取目标点（前瞻点）
    this.targetPoint = this.road.getNextTargetPoint(
      this.currentRoadIndex, 
      this.lookAheadDistance
    );
    
    if (!this.targetPoint) return;
    
    // 计算转向角度
    this.calculateSteering();
    
    // 应用控制
    this.applyControl();
  }

  /**
   * 计算转向角度
   */
  calculateSteering() {
    const vehiclePos = this.vehicle.position;
    const vehicleDir = this.vehicle.getDirection();
    
    // 计算到目标点的方向
    const targetDir = new THREE.Vector3(
      this.targetPoint.x - vehiclePos.x,
      0,
      this.targetPoint.z - vehiclePos.z
    ).normalize();
    
    // 计算角度差
    const currentAngle = Math.atan2(vehicleDir.x, vehicleDir.z);
    const targetAngle = Math.atan2(targetDir.x, targetDir.z);
    
    let angleDiff = targetAngle - currentAngle;
    
    // 标准化角度差到 [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // 计算转向强度
    this.steeringAngle = Math.max(-1, Math.min(1, angleDiff * 2));
  }

  /**
   * 应用自动驾驶控制
   */
  applyControl() {
    // 设置车辆输入状态
    this.vehicle.keys.w = true;  // 持续前进
    this.vehicle.keys.s = false;
    
    // 根据转向角度设置左右转向
    if (this.steeringAngle > 0.1) {
      this.vehicle.keys.d = true;
      this.vehicle.keys.a = false;
    } else if (this.steeringAngle < -0.1) {
      this.vehicle.keys.a = true;
      this.vehicle.keys.d = false;
    } else {
      this.vehicle.keys.a = false;
      this.vehicle.keys.d = false;
    }
  }

  /**
   * 获取当前状态信息
   */
  getStatus() {
    return {
      isActive: this.isActive,
      currentRoadIndex: this.currentRoadIndex,
      steeringAngle: this.steeringAngle,
      targetPoint: this.targetPoint
    };
  }

  /**
   * 设置前瞻距离
   */
  setLookAheadDistance(distance) {
    this.lookAheadDistance = Math.max(1, Math.min(10, distance));
  }

  /**
   * 设置目标速度
   */
  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(0.5, speed));
  }

  /**
   * 重置到道路起点
   */
  resetToRoadStart() {
    if (this.road.roadPoints.length > 0) {
      const startPoint = this.road.roadPoints[0];
      this.vehicle.setPosition(startPoint.x, startPoint.height, startPoint.z);
      
      // 设置初始方向
      if (this.road.roadPoints.length > 1) {
        const nextPoint = this.road.roadPoints[1];
        const angle = Math.atan2(
          nextPoint.x - startPoint.x,
          nextPoint.z - startPoint.z
        );
        this.vehicle.setRotation(angle);
      }
      
      this.currentRoadIndex = 0;
    }
  }
}

