/**
 * 地形生成器 - 使用柏林噪声生成起伏地形
 */
class TerrainGenerator {
  constructor() {
    this.size = 200;
    this.segments = 100;
    this.heightScale = 10;
    this.noiseScale = 0.1;
    this.octaves = 4;
    this.persistence = 0.5;
    this.lacunarity = 2.0;
  }

  /**
   * 简化的柏林噪声实现
   */
  noise(x, z) {
    const n = Math.sin(x * 0.1) * Math.cos(z * 0.1) + 
              Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.5 +
              Math.sin(x * 0.02) * Math.cos(z * 0.02) * 0.25;
    return n;
  }

  /**
   * 分形布朗运动 (fBm)
   */
  fbm(x, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  /**
   * 生成地形高度图
   */
  generateHeightMap() {
    const heights = [];
    const step = this.size / this.segments;

    for (let x = 0; x <= this.segments; x++) {
      heights[x] = [];
      for (let z = 0; z <= this.segments; z++) {
        const worldX = (x - this.segments / 2) * step;
        const worldZ = (z - this.segments / 2) * step;
        
        const height = this.fbm(
          worldX * this.noiseScale, 
          worldZ * this.noiseScale,
          this.octaves,
          this.persistence,
          this.lacunarity
        ) * this.heightScale;
        
        heights[x][z] = height;
      }
    }

    return heights;
  }

  /**
   * 创建 Three.js 地形网格
   */
  createTerrainMesh() {
    const geometry = new THREE.PlaneGeometry(
      this.size, 
      this.size, 
      this.segments, 
      this.segments
    );

    const heights = this.generateHeightMap();
    const positions = geometry.attributes.position.array;
    const colors = [];

    // 设置顶点高度和颜色
    for (let i = 0; i < positions.length; i += 3) {
      const x = Math.floor((positions[i] + this.size / 2) / this.size * this.segments);
      const z = Math.floor((positions[i + 2] + this.size / 2) / this.size * this.segments);
      
      const height = heights[Math.min(x, this.segments)][Math.min(z, this.segments)];
      positions[i + 1] = height;

      // 根据高度设置颜色
      const normalizedHeight = (height + this.heightScale) / (this.heightScale * 2);
      let color;

      if (normalizedHeight < 0.2) {
        // 水面 - 蓝色
        color = new THREE.Color(0x0066cc);
      } else if (normalizedHeight < 0.4) {
        // 沙滩 - 黄色
        color = new THREE.Color(0xffd700);
      } else if (normalizedHeight < 0.7) {
        // 草地 - 绿色
        color = new THREE.Color(0x228b22);
      } else if (normalizedHeight < 0.9) {
        // 岩石 - 灰色
        color = new THREE.Color(0x696969);
      } else {
        // 雪山 - 白色
        color = new THREE.Color(0xffffff);
      }

      colors.push(color.r, color.g, color.b);
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = 'terrain';

    return mesh;
  }

  /**
   * 获取指定位置的地形高度
   */
  getHeightAt(x, z) {
    const step = this.size / this.segments;
    const gridX = Math.floor((x + this.size / 2) / step);
    const gridZ = Math.floor((z + this.size / 2) / step);
    
    if (gridX < 0 || gridX >= this.segments || gridZ < 0 || gridZ >= this.segments) {
      return 0;
    }

    const worldX = (gridX - this.segments / 2) * step;
    const worldZ = (gridZ - this.segments / 2) * step;
    
    return this.fbm(
      worldX * this.noiseScale, 
      worldZ * this.noiseScale,
      this.octaves,
      this.persistence,
      this.lacunarity
    ) * this.heightScale;
  }
}

