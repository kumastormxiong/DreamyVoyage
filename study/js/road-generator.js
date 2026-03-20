/**
 * 道路生成器 - 自动生成蜿蜒的道路网络
 */
class RoadGenerator {
  constructor(terrainGenerator) {
    this.terrain = terrainGenerator;
    this.roadWidth = 8;
    this.roadSegments = 200;
    this.roadPoints = [];
    this.roadMesh = null;
  }

  /**
   * 生成道路路径点
   */
  generateRoadPath() {
    this.roadPoints = [];
    
    // 起始点
    let currentX = 0;
    let currentZ = 0;
    let direction = 0; // 角度（弧度）
    
    this.roadPoints.push({ x: currentX, z: currentZ, height: 0 });
    
    for (let i = 1; i < this.roadSegments; i++) {
      // 随机改变方向，但保持平滑
      const turnAngle = (Math.random() - 0.5) * 0.3; // 最大15度转弯
      direction += turnAngle;
      
      // 添加一些随机性，但避免急转弯
      const randomFactor = (Math.random() - 0.5) * 0.1;
      direction += randomFactor;
      
      // 计算下一个点
      const stepSize = 15;
      currentX += Math.sin(direction) * stepSize;
      currentZ += Math.cos(direction) * stepSize;
      
      // 获取地形高度
      const height = this.terrain.getHeightAt(currentX, currentZ);
      
      this.roadPoints.push({ 
        x: currentX, 
        z: currentZ, 
        height: height + 0.5 // 道路略高于地面
      });
    }
  }

  /**
   * 创建道路网格
   */
  createRoadMesh() {
    if (this.roadPoints.length === 0) {
      this.generateRoadPath();
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    // 为每个道路段创建四边形
    for (let i = 0; i < this.roadPoints.length - 1; i++) {
      const current = this.roadPoints[i];
      const next = this.roadPoints[i + 1];
      
      // 计算道路方向
      const dx = next.x - current.x;
      const dz = next.z - current.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      
      // 计算垂直方向
      const perpX = -dz / length * this.roadWidth / 2;
      const perpZ = dx / length * this.roadWidth / 2;
      
      // 创建道路段的四个顶点
      const v1 = new THREE.Vector3(
        current.x + perpX,
        current.height,
        current.z + perpZ
      );
      const v2 = new THREE.Vector3(
        current.x - perpX,
        current.height,
        current.z - perpZ
      );
      const v3 = new THREE.Vector3(
        next.x - perpX,
        next.height,
        next.z - perpZ
      );
      const v4 = new THREE.Vector3(
        next.x + perpX,
        next.height,
        next.z + perpZ
      );

      const startIndex = vertices.length / 3;
      
      // 添加顶点
      vertices.push(v1.x, v1.y, v1.z);
      vertices.push(v2.x, v2.y, v2.z);
      vertices.push(v3.x, v3.y, v3.z);
      vertices.push(v4.x, v4.y, v4.z);
      
      // 添加颜色（道路颜色）
      const roadColor = new THREE.Color(0x333333);
      for (let j = 0; j < 4; j++) {
        colors.push(roadColor.r, roadColor.g, roadColor.b);
      }
      
      // 添加索引（两个三角形组成四边形）
      indices.push(
        startIndex, startIndex + 1, startIndex + 2,
        startIndex, startIndex + 2, startIndex + 3
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true
    });

    this.roadMesh = new THREE.Mesh(geometry, material);
    this.roadMesh.name = 'road';
    
    return this.roadMesh;
  }

  /**
   * 获取道路上最接近指定点的位置
   */
  getClosestRoadPoint(x, z) {
    let closestPoint = null;
    let closestDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < this.roadPoints.length; i++) {
      const point = this.roadPoints[i];
      const distance = Math.sqrt(
        (point.x - x) ** 2 + (point.z - z) ** 2
      );
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
        closestIndex = i;
      }
    }

    return {
      point: closestPoint,
      index: closestIndex,
      distance: closestDistance
    };
  }

  /**
   * 获取道路方向（用于自动驾驶）
   */
  getRoadDirection(index) {
    if (index >= this.roadPoints.length - 1) {
      index = this.roadPoints.length - 2;
    }
    
    const current = this.roadPoints[index];
    const next = this.roadPoints[index + 1];
    
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const angle = Math.atan2(dx, dz);
    
    return {
      angle: angle,
      direction: new THREE.Vector3(dx, 0, dz).normalize()
    };
  }

  /**
   * 获取道路上的下一个目标点
   */
  getNextTargetPoint(currentIndex, lookAhead = 5) {
    const targetIndex = Math.min(currentIndex + lookAhead, this.roadPoints.length - 1);
    return this.roadPoints[targetIndex];
  }
}

