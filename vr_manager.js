/**
 * Dreamy Voyage - WebXR VR Manager
 * 专门适配 Meta Quest 2 / Quest 3 / Quest Pro (Meta Quest Browser)
 * 
 * 核心升级：
 * 1. 默认纯净沉浸：
 *    - 进入 VR 模式后，菜单 (HUD) 与深空星尘默认隐藏，视野 100% 留给巨幕音乐视觉
 *    - 扣动手柄扳机键 (Trigger) 或按 A/X 键才唤出菜单与星尘
 *    - 在空白处扣动扳机或点击隐藏按钮可随时一键隐去菜单
 * 2. 巨幕尺寸大幅升级：
 *    - 巨幕高度翻倍 (向上延伸 50%，向下延伸 50%，覆盖全视野高耸苍穹)
 *    - 148° 环抱弧角，精确对称居中对齐于用户正前方
 * 3. 真全景 360° 无缝环幕空间 (彻底解决断层接缝与极点畸变)：
 *    - 采用双向连续对称 UV 映射算法 (0°→180°→360°)，在任何角度转身看均 100% 无缝
 *    - 摒弃会导致头顶脚底极端缩挤畸变的传统球极点，采用高耸全景无畸变圆柱巨像空间
 * 4. 菜单新增【画质档位即时切换 (1080P/1440P/4K/720P)】：
 *    - 默认采用 1080P 全高清，如遇卡顿可在 VR 菜单一键降档或升至 1440P/4K 影院级超采样
 * 5. 菜单新增【视觉预设 随机 ↔ 顺序 播放切换】
 * 6. 菜单内置【完整曲目点播列表 (In-VR Tracklist)】：
 *    - 分页浏览全部 77+ 首歌曲，射线点击即播并高亮当前曲目
 */

(() => {
    'use strict';

    // 状态管理
    const state = {
        isVRActive: false,
        isSupported: false,
        displayMode: 'curved_screen', // 'curved_screen' (IMAX巨幕) | 'panoramic_360' (360°无缝全景)
        menuVisible: false, // 默认进入 VR 隐藏菜单，纯净呈现巨幕
        currentView: 'player', // 'player' (主播放控制) | 'tracklist' (选曲列表)
        tracklistPage: 0,
        songsPerPage: 8,
        hoveredButtonId: null,
        lastThumbstickTime: 0,
        thumbstickCooldown: 380, // 摇杆操作防抖毫秒数
        bridge: null // main.js 传入的播放状态控制桥
    };

    // Three.js 核心对象引用
    let renderer = null;
    let scene = null;
    let camera = null;
    let xrSession = null;
    let vrCanvas = null;

    // 场景构件
    let screenMesh = null;
    let panoramicMesh = null;
    let starParticles = null;
    let platformGroup = null;
    let visualizerTexture = null;

    // 控制器与射线
    let controllers = [];
    let controllerGrips = [];
    let controllerRays = [];
    let reticleMesh = null;
    let raycaster = null;

    // 3D 浮动 HUD 菜单
    let hudMesh = null;
    let hudCanvas = null;
    let hudCtx = null;
    let hudTexture = null;
    let hudButtons = [];

    // 防眩晕地面平台配置与状态
    const PLATFORM_TYPES = [
        { id: 'cyber_ring', nameEn: 'Cyber Ring', nameZh: '赛博光环' },
        { id: 'space_grid', nameEn: 'Space Grid', nameZh: '空间网格' },
        { id: 'hexagon_disc', nameEn: 'Hexagon Platform', nameZh: '六边浮台' },
        { id: 'minimal_disc', nameEn: 'Minimal Disc', nameZh: '极简暗盘' }
    ];

    const PLATFORM_OPACITIES = [
        { value: 1.0, labelEn: '100% Solid', labelZh: '100% 实体' },
        { value: 0.75, labelEn: '75% Clear', labelZh: '75% 清晰' },
        { value: 0.50, labelEn: '50% Medium', labelZh: '50% 半透' },
        { value: 0.25, labelEn: '25% Subtle', labelZh: '25% 微弱' },
        { value: 0.0, labelEn: '0% Hidden', labelZh: '0% (隐藏)' }
    ];

    let platformMeshes = {
        cyber_ring: null,
        space_grid: null,
        hexagon_disc: null,
        minimal_disc: null
    };

    let platformState = {
        type: (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_platform_type')) || 'cyber_ring',
        opacity: (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_platform_opacity') !== null)
            ? parseFloat(localStorage.getItem('dv_vr_platform_opacity'))
            : 0.75
    };
    if (isNaN(platformState.opacity)) platformState.opacity = 0.75;

    // 检查当前设备与浏览器是否支持 WebXR 沉浸式 VR
    async function checkXRSupport() {
        if (typeof navigator !== 'undefined' && navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-vr');
                state.isSupported = supported;
                return supported;
            } catch (e) {
                console.warn('[VRManager] WebXR 检查异常:', e);
                state.isSupported = false;
                return false;
            }
        }
        state.isSupported = false;
        return false;
    }

    // 初始化 Three.js 空间与 WebXR 渲染器
    function initThreeScene() {
        if (scene && renderer) return;

        // 1. 场景
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x010206);

        // 2. 相机 (WebXR 启动后相机会自动被 Quest 2 头部追踪驱动)
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 1.6, 0); // 默认人眼离地高 1.6 米

        // 3. WebGL 渲染器
        vrCanvas = document.createElement('canvas');
        vrCanvas.id = 'vr-webxr-canvas';
        vrCanvas.style.display = 'none';
        document.body.appendChild(vrCanvas);

        renderer = new THREE.WebGLRenderer({
            canvas: vrCanvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

        // 4. 获取源 Butterchurn 画布作为动态材质
        const sourceCanvas = document.getElementById('butterchurn-canvas');
        if (!sourceCanvas) {
            console.error('[VRManager] 未找到 #butterchurn-canvas 视觉画布');
            return;
        }

        visualizerTexture = new THREE.CanvasTexture(sourceCanvas);
        visualizerTexture.minFilter = THREE.LinearFilter;
        visualizerTexture.magFilter = THREE.LinearFilter;
        visualizerTexture.format = THREE.RGBAFormat;
        visualizerTexture.generateMipmaps = false;

        // 5. 构建高耸双倍高度 IMAX 巨幕 与 360° 无缝真全景
        buildScreenAndDome();

        // 6. 构建深空静态星尘环境 & 地面发光参考台
        buildEnvironment();

        // 7. 构建 3D 悬浮 HUD 菜单
        buildFloatingHUD();

        // 8. 构建手柄控制器与射线
        setupControllers();

        raycaster = new THREE.Raycaster();
    }

    // 构建双倍高度超巨 IMAX 微曲巨幕 与 360° 无缝真全景空间
    function buildScreenAndDome() {
        const screenMat = new THREE.MeshBasicMaterial({
            map: visualizerTexture,
            side: THREE.DoubleSide, // 双面渲染杜绝背面剔除
            toneMapped: false
        });

        // --- 方案 A: 双倍高度超巨 IMAX 微曲巨幕 (默认推荐) ---
        // 距离 4.2 米，高度翻倍至 5.2 米 (从眼平线 1.6 米处向上延伸至 4.2 米，向下延伸至 -1.0 米)
        // 弧角增至约 148° (Math.PI * 0.82)，形成震撼的上下左右全视野包裹
        const radius = 4.2;
        const height = 5.2;
        const arcAngle = Math.PI * 0.82;
        const thetaStart = Math.PI - arcAngle / 2; // 精确中心对齐在 -Z 轴 (用户正前方)

        const cylinderGeom = new THREE.CylinderGeometry(
            radius, radius, height, 64, 1, true, thetaStart, arcAngle
        );
        screenMesh = new THREE.Mesh(cylinderGeom, screenMat);
        screenMesh.scale.set(-1, 1, 1); // 水平镜像翻转使纹理左右方向正确
        screenMesh.position.set(0, 1.6, 0);
        scene.add(screenMesh);

        // --- 方案 B: 360° 天地全覆盖真全景球幕 (天顶、地底 100% 铺满，左右 360° 无缝对称平滑包裹) ---
        // 采用完整球体 SphereGeometry，完全包裹天穹天顶与脚底深渊，彻底消除上下露黑问题！
        // 结合对称镜像 UV 映射算法：在正前方(0°) U = 0.5 (正对特效最炫丽的核心舞台)，
        // 转至 90°(右) U = 1.0，转至 180°(后) U = 0.5，转至 270°(左) U = 0.0，转回 360°(前) U = 0.5。
        // 接缝处导数平滑对接自身，全视野转身 100% 连续无断层！
        const panoRadius = 22;
        const widthSegments = 80;
        const heightSegments = 40;
        const panoGeom = new THREE.SphereGeometry(
            panoRadius, widthSegments, heightSegments, -Math.PI / 2, Math.PI * 2, 0, Math.PI
        );

        function getMirroredU(frac) {
            if (frac <= 0.25) {
                return 0.5 + 2.0 * frac;
            } else if (frac <= 0.75) {
                return 1.5 - 2.0 * frac;
            } else {
                return 2.0 * frac - 1.5;
            }
        }

        const uvs = panoGeom.attributes.uv;
        for (let j = 0; j <= heightSegments; j++) {
            for (let i = 0; i <= widthSegments; i++) {
                const idx = j * (widthSegments + 1) + i;
                const fracU = (j === 0 || j === heightSegments)
                    ? ((i + 0.5) / widthSegments)
                    : (i / widthSegments);
                const u = getMirroredU(Math.min(1.0, Math.max(0.0, fracU)));
                uvs.setX(idx, u);
                const v = 1.0 - (j / heightSegments);
                uvs.setY(idx, v);
            }
        }
        uvs.needsUpdate = true;

        panoramicMesh = new THREE.Mesh(panoGeom, screenMat);
        panoramicMesh.scale.set(-1, 1, 1);
        panoramicMesh.position.set(0, 1.6, 0);
        panoramicMesh.visible = false; // 默认使用 IMAX 巨幕
        scene.add(panoramicMesh);
    }


    // 构建深空星尘与地台
    function buildEnvironment() {
        // 1. 星尘粒子 (默认隐藏，仅在唤出菜单时作为氛围点缀显示)
        const particleCount = 1200;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const colorPalette = [
            new THREE.Color(0x38bdf8), // 亮天蓝
            new THREE.Color(0xec4899), // 幻梦粉
            new THREE.Color(0x818cf8), // 紫罗兰
            new THREE.Color(0x2dd4bf)  // 碧绿
        ];

        for (let i = 0; i < particleCount; i++) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 8 + Math.random() * 25;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.max(0.2, r * Math.sin(phi) * Math.sin(theta));
            positions[i * 3 + 2] = r * Math.cos(phi);

            const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        const particleGeom = new THREE.BufferGeometry();
        particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMat = new THREE.PointsMaterial({
            size: 0.08,
            vertexColors: true,
            transparent: true,
            opacity: 0.65
        });

        starParticles = new THREE.Points(particleGeom, particleMat);
        starParticles.visible = false; // 默认隐藏星尘
        scene.add(starParticles);

        // 2. 地面防眩晕参考平台 (在巨幕模式与全景模式下均持久保留，锚定身体平衡)
        buildPlatform();
    }

    // 构建 4 款防眩晕地面参考平台 (极客赛博、全息网格、六边晶台、极简暗盘)
    function buildPlatform() {
        platformGroup = new THREE.Group();

        // ----------------------------------------------------
        // 样式 1: 赛博霓虹光环 (Cyber Ring)
        // ----------------------------------------------------
        const ringGroup = new THREE.Group();

        const ringBaseGeom = new THREE.CircleGeometry(2.4, 64);
        const ringBaseMat = new THREE.MeshBasicMaterial({
            color: 0x060a14,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        ringBaseMat.userData = { baseOpacity: 0.88 };
        const ringBaseMesh = new THREE.Mesh(ringBaseGeom, ringBaseMat);
        ringBaseMesh.rotation.x = -Math.PI / 2;
        ringBaseMesh.position.y = 0.008;
        ringGroup.add(ringBaseMesh);

        // 外层青色光环
        const ringOuterGeom = new THREE.RingGeometry(2.32, 2.4, 64);
        const ringOuterMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        ringOuterMat.userData = { baseOpacity: 0.85 };
        const ringOuterMesh = new THREE.Mesh(ringOuterGeom, ringOuterMat);
        ringOuterMesh.rotation.x = -Math.PI / 2;
        ringOuterMesh.position.y = 0.012;
        ringGroup.add(ringOuterMesh);

        // 中层品红光环
        const ringMidGeom = new THREE.RingGeometry(1.22, 1.28, 64);
        const ringMidMat = new THREE.MeshBasicMaterial({
            color: 0xec4899,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });
        ringMidMat.userData = { baseOpacity: 0.75 };
        const ringMidMesh = new THREE.Mesh(ringMidGeom, ringMidMat);
        ringMidMesh.rotation.x = -Math.PI / 2;
        ringMidMesh.position.y = 0.014;
        ringGroup.add(ringMidMesh);

        // 内层青色圆环
        const ringInnerGeom = new THREE.RingGeometry(0.38, 0.42, 48);
        const ringInnerMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        ringInnerMat.userData = { baseOpacity: 0.8 };
        const ringInnerMesh = new THREE.Mesh(ringInnerGeom, ringInnerMat);
        ringInnerMesh.rotation.x = -Math.PI / 2;
        ringInnerMesh.position.y = 0.016;
        ringGroup.add(ringInnerMesh);

        // 4 向十字罗盘刻度线 (指示正前、后、左、右防迷向)
        const tickGeom = new THREE.PlaneGeometry(0.04, 0.9);
        const tickMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide
        });
        tickMat.userData = { baseOpacity: 0.65 };

        // 前后刻度
        const tickForward = new THREE.Mesh(tickGeom, tickMat);
        tickForward.rotation.x = -Math.PI / 2;
        tickForward.position.set(0, 0.015, -1.75);
        ringGroup.add(tickForward);

        const tickBack = new THREE.Mesh(tickGeom, tickMat);
        tickBack.rotation.x = -Math.PI / 2;
        tickBack.position.set(0, 0.015, 1.75);
        ringGroup.add(tickBack);

        // 左右刻度
        const tickRight = new THREE.Mesh(tickGeom, tickMat);
        tickRight.rotation.x = -Math.PI / 2;
        tickRight.rotation.z = Math.PI / 2;
        tickRight.position.set(1.75, 0.015, 0);
        ringGroup.add(tickRight);

        const tickLeft = new THREE.Mesh(tickGeom, tickMat);
        tickLeft.rotation.x = -Math.PI / 2;
        tickLeft.rotation.z = Math.PI / 2;
        tickLeft.position.set(-1.75, 0.015, 0);
        ringGroup.add(tickLeft);

        platformMeshes.cyber_ring = ringGroup;
        platformGroup.add(ringGroup);

        // ----------------------------------------------------
        // 样式 2: 空间全息网格 (Space Grid)
        // ----------------------------------------------------
        const gridGroup = new THREE.Group();

        const gridBaseGeom = new THREE.CircleGeometry(2.5, 64);
        const gridBaseMat = new THREE.MeshBasicMaterial({
            color: 0x040813,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        gridBaseMat.userData = { baseOpacity: 0.88 };
        const gridBaseMesh = new THREE.Mesh(gridBaseGeom, gridBaseMat);
        gridBaseMesh.rotation.x = -Math.PI / 2;
        gridBaseMesh.position.y = 0.008;
        gridGroup.add(gridBaseMesh);

        // 空间网格线条 (5m x 5m，16 分割)
        const gridHelper = new THREE.GridHelper(5.0, 16, 0x38bdf8, 0x1e3a5f);
        gridHelper.position.y = 0.012;
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.75;
        gridHelper.material.userData = { baseOpacity: 0.75 };
        gridGroup.add(gridHelper);

        // 外围高亮青色边缘光圈
        const gridOuterGeom = new THREE.RingGeometry(2.44, 2.50, 64);
        const gridOuterMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        gridOuterMat.userData = { baseOpacity: 0.85 };
        const gridOuterMesh = new THREE.Mesh(gridOuterGeom, gridOuterMat);
        gridOuterMesh.rotation.x = -Math.PI / 2;
        gridOuterMesh.position.y = 0.014;
        gridGroup.add(gridOuterMesh);

        platformMeshes.space_grid = gridGroup;
        platformGroup.add(gridGroup);

        // ----------------------------------------------------
        // 样式 3: 未来六边形浮台 (Hexagon Platform)
        // ----------------------------------------------------
        const hexGroup = new THREE.Group();

        const hexBaseGeom = new THREE.CircleGeometry(2.4, 6);
        const hexBaseMat = new THREE.MeshBasicMaterial({
            color: 0x080c1a,
            transparent: true,
            opacity: 0.90,
            side: THREE.DoubleSide
        });
        hexBaseMat.userData = { baseOpacity: 0.90 };
        const hexBaseMesh = new THREE.Mesh(hexBaseGeom, hexBaseMat);
        hexBaseMesh.rotation.x = -Math.PI / 2;
        hexBaseMesh.rotation.z = Math.PI / 6; // 平整边缘对齐正前方
        hexBaseMesh.position.y = 0.008;
        hexGroup.add(hexBaseMesh);

        // 外围发光紫色六边形轮廓
        const hexOuterGeom = new THREE.RingGeometry(2.32, 2.40, 6);
        const hexOuterMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        hexOuterMat.userData = { baseOpacity: 0.85 };
        const hexOuterMesh = new THREE.Mesh(hexOuterGeom, hexOuterMat);
        hexOuterMesh.rotation.x = -Math.PI / 2;
        hexOuterMesh.rotation.z = Math.PI / 6;
        hexOuterMesh.position.y = 0.012;
        hexGroup.add(hexOuterMesh);

        // 内层同心青色六边形
        const hexInnerGeom = new THREE.RingGeometry(1.22, 1.28, 6);
        const hexInnerMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });
        hexInnerMat.userData = { baseOpacity: 0.75 };
        const hexInnerMesh = new THREE.Mesh(hexInnerGeom, hexInnerMat);
        hexInnerMesh.rotation.x = -Math.PI / 2;
        hexInnerMesh.rotation.z = Math.PI / 6;
        hexInnerMesh.position.y = 0.014;
        hexGroup.add(hexInnerMesh);

        // 核心粉色六边形晶核
        const hexCoreGeom = new THREE.CircleGeometry(0.35, 6);
        const hexCoreMat = new THREE.MeshBasicMaterial({
            color: 0xec4899,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        hexCoreMat.userData = { baseOpacity: 0.8 };
        const hexCoreMesh = new THREE.Mesh(hexCoreGeom, hexCoreMat);
        hexCoreMesh.rotation.x = -Math.PI / 2;
        hexCoreMesh.rotation.z = Math.PI / 6;
        hexCoreMesh.position.y = 0.016;
        hexGroup.add(hexCoreMesh);

        platformMeshes.hexagon_disc = hexGroup;
        platformGroup.add(hexGroup);

        // ----------------------------------------------------
        // 样式 4: 极简纯黑暗盘 (Minimal Disc)
        // ----------------------------------------------------
        const discGroup = new THREE.Group();

        const discMinimalGeom = new THREE.CircleGeometry(2.3, 64);
        const discMinimalMat = new THREE.MeshBasicMaterial({
            color: 0x060810,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        discMinimalMat.userData = { baseOpacity: 0.88 };
        const discMinimalMesh = new THREE.Mesh(discMinimalGeom, discMinimalMat);
        discMinimalMesh.rotation.x = -Math.PI / 2;
        discMinimalMesh.position.y = 0.008;
        discGroup.add(discMinimalMesh);

        // 细微石板灰边界
        const discBorderGeom = new THREE.RingGeometry(2.26, 2.30, 64);
        const discBorderMat = new THREE.MeshBasicMaterial({
            color: 0x64748b,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide
        });
        discBorderMat.userData = { baseOpacity: 0.55 };
        const discBorderMesh = new THREE.Mesh(discBorderGeom, discBorderMat);
        discBorderMesh.rotation.x = -Math.PI / 2;
        discBorderMesh.position.y = 0.012;
        discGroup.add(discBorderMesh);

        platformMeshes.minimal_disc = discGroup;
        platformGroup.add(discGroup);

        // 初始应用设置并加入场景
        updatePlatformAppearance();
        scene.add(platformGroup);
    }

    // 更新地面平台的样式与透明度
    function updatePlatformAppearance() {
        if (!platformGroup) return;

        for (const [key, subGroup] of Object.entries(platformMeshes)) {
            if (subGroup) {
                subGroup.visible = (key === platformState.type);
            }
        }

        const currentOpacity = platformState.opacity;
        if (currentOpacity <= 0.01) {
            platformGroup.visible = false;
        } else {
            platformGroup.visible = true;
            platformGroup.traverse(child => {
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        const base = (mat.userData && typeof mat.userData.baseOpacity === 'number')
                            ? mat.userData.baseOpacity
                            : (mat.opacity || 1.0);
                        mat.userData.baseOpacity = base;
                        mat.transparent = true;
                        mat.opacity = base * currentOpacity;
                    });
                }
            });
        }

        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('dv_vr_platform_type', platformState.type);
                localStorage.setItem('dv_vr_platform_opacity', platformState.opacity.toString());
            }
        } catch (e) {}
    }

    // 切换地面平台样式
    function cyclePlatformType() {
        const idx = PLATFORM_TYPES.findIndex(t => t.id === platformState.type);
        const nextIdx = (idx + 1) % PLATFORM_TYPES.length;
        platformState.type = PLATFORM_TYPES[nextIdx].id;
        updatePlatformAppearance();
        drawHUD();
    }

    // 切换地面平台透明度
    function cyclePlatformOpacity() {
        const idx = PLATFORM_OPACITIES.findIndex(o => Math.abs(o.value - platformState.opacity) < 0.05);
        const nextIdx = (idx + 1) % PLATFORM_OPACITIES.length;
        platformState.opacity = PLATFORM_OPACITIES[nextIdx].value;
        updatePlatformAppearance();
        drawHUD();
    }


    // 构建 3D 浮动玻璃拟态 HUD 菜单
    function buildFloatingHUD() {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 1080;
        hudCanvas.height = 720;
        hudCtx = hudCanvas.getContext('2d');

        hudTexture = new THREE.CanvasTexture(hudCanvas);
        hudTexture.minFilter = THREE.LinearFilter;
        hudTexture.magFilter = THREE.LinearFilter;

        const planeGeom = new THREE.PlaneGeometry(1.44, 0.96);
        const planeMat = new THREE.MeshBasicMaterial({
            map: hudTexture,
            transparent: true,
            opacity: 0.96,
            side: THREE.DoubleSide
        });

        hudMesh = new THREE.Mesh(planeGeom, planeMat);
        hudMesh.position.set(0, 1.35, -1.8);
        hudMesh.rotation.x = THREE.MathUtils.degToRad(8);
        hudMesh.visible = false; // 默认进入 VR 隐藏菜单
        scene.add(hudMesh);

        drawHUD();
    }

    // 绘制 3D 浮动 HUD 菜单
    function drawHUD() {
        if (!hudCtx) return;
        const ctx = hudCtx;
        const w = hudCanvas.width;
        const h = hudCanvas.height;

        ctx.clearRect(0, 0, w, h);
        hudButtons = [];

        // 1. 半透明深蓝黑底板与霓虹流动边框
        const cornerRadius = 36;
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, 24, 20, w - 48, h - 40, cornerRadius);
        ctx.fillStyle = 'rgba(7, 12, 24, 0.94)';
        ctx.fill();

        ctx.lineWidth = 3.5;
        const borderGrad = ctx.createLinearGradient(0, 0, w, h);
        borderGrad.addColorStop(0, '#38bdf8');
        borderGrad.addColorStop(0.5, '#ec4899');
        borderGrad.addColorStop(1, '#818cf8');
        ctx.strokeStyle = borderGrad;
        ctx.stroke();
        ctx.restore();

        const trackInfo = state.bridge ? state.bridge.getTrackInfo() : {
            title: 'Dreamy Voyage',
            preset: 'BUTTERCHURN REVERIE',
            isPlaying: true,
            isChinese: false
        };
        const isZh = trackInfo.isChinese;
        const playbackMode = state.bridge && state.bridge.getPlaybackMode ? state.bridge.getPlaybackMode() : 'random';
        const isSongShuffle = (playbackMode === 'random');

        const presetMode = state.bridge && state.bridge.getPresetPlaybackMode ? state.bridge.getPresetPlaybackMode() : 'random';
        const isPresetShuffle = (presetMode === 'random');

        const qualityLabel = state.bridge && state.bridge.getQualityLabel ? state.bridge.getQualityLabel() : '1080P';

        // ==========================================
        // 视图分支 A：曲目点播列表 (Tracklist View)
        // ==========================================
        if (state.currentView === 'tracklist') {
            const rawSongList = state.bridge && state.bridge.getSongList ? state.bridge.getSongList() : [];
            const currentSong = state.bridge && state.bridge.getCurrentSong ? state.bridge.getCurrentSong() : '';
            const totalSongs = rawSongList.length;
            const totalPages = Math.max(1, Math.ceil(totalSongs / state.songsPerPage));
            if (state.tracklistPage >= totalPages) state.tracklistPage = totalPages - 1;
            if (state.tracklistPage < 0) state.tracklistPage = 0;

            // 标题栏
            ctx.save();
            ctx.font = '900 24px "Orbitron", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'left';
            ctx.fillText(isZh ? '🎵 选曲播放 (Tracklist)' : '🎵 Select Track (Tracklist)', 60, 65);

            ctx.font = '600 16px "Orbitron", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(`${isZh ? '第' : 'Page'} ${state.tracklistPage + 1} / ${totalPages} ${isZh ? '页 (共 ' + totalSongs + ' 首)' : '(Total ' + totalSongs + ')'}`, 400, 65);
            ctx.restore();

            // 返回主控制面板按钮
            hudButtons.push({
                id: 'btn-tracklist-back',
                x: 770, y: 30, w: 250, h: 48,
                icon: '⬅', labelEn: 'Back to Player', labelZh: '返回控制面板',
                isOutline: true,
                onClick: () => {
                    state.currentView = 'player';
                    drawHUD();
                }
            });

            // 分隔线
            ctx.beginPath();
            ctx.moveTo(60, 96);
            ctx.lineTo(w - 60, 96);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 渲染当前页 8 首歌曲 (2 列 x 4 行)
            const startIndex = state.tracklistPage * state.songsPerPage;
            const pageSongs = rawSongList.slice(startIndex, startIndex + state.songsPerPage);

            const colWidth = 460;
            const rowHeight = 76;
            const startY = 112;
            const col1X = 60;
            const col2X = 560;

            pageSongs.forEach((song, idx) => {
                const globalIdx = startIndex + idx;
                const col = idx % 2;
                const row = Math.floor(idx / 2);
                const btnX = col === 0 ? col1X : col2X;
                const btnY = startY + row * (rowHeight + 14);
                const isCurrentPlaying = (song === currentSong);

                const songTitle = state.bridge && state.bridge.formatTrackTitle
                    ? state.bridge.formatTrackTitle(song)
                    : song.replace(/\.mp3$/i, '');

                hudButtons.push({
                    id: `btn-song-pick-${globalIdx}`,
                    x: btnX, y: btnY, w: colWidth, h: rowHeight,
                    songName: song,
                    songTitle: songTitle,
                    isCurrentPlaying,
                    isSongItem: true,
                    onClick: () => {
                        if (state.bridge && state.bridge.selectSong) {
                            state.bridge.selectSong(song);
                        }
                        drawHUD();
                    }
                });
            });

            // 底部翻页栏
            const prevDisabled = state.tracklistPage === 0;
            const nextDisabled = state.tracklistPage >= totalPages - 1;

            hudButtons.push({
                id: 'btn-page-prev',
                x: 60, y: 485, w: 220, h: 58,
                icon: '◀', labelEn: 'Prev Page', labelZh: '上一页',
                disabled: prevDisabled,
                onClick: () => {
                    if (state.tracklistPage > 0) {
                        state.tracklistPage--;
                        drawHUD();
                    }
                }
            });

            hudButtons.push({
                id: 'btn-page-next',
                x: 800, y: 485, w: 220, h: 58,
                icon: '▶', labelEn: 'Next Page', labelZh: '下一页',
                disabled: nextDisabled,
                onClick: () => {
                    if (state.tracklistPage < totalPages - 1) {
                        state.tracklistPage++;
                        drawHUD();
                    }
                }
            });

            // 底部提示
            ctx.save();
            ctx.font = '500 14px "Orbitron", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.textAlign = 'center';
            ctx.fillText(isZh ? '💡 扣动手柄扳机键 (Trigger) 点击曲目即可切歌 · 瞄准空白处扣动扳机可隐去菜单' : '💡 Pull Trigger to select song · Pull in empty space to hide HUD', w / 2, 665);
            ctx.restore();

        } else {
            // ==========================================
            // 视图分支 B：主播放控制视图 (Player View)
            // ==========================================

            // 顶部徽标与正在播放信息
            ctx.save();
            ctx.font = '900 24px "Orbitron", sans-serif';
            ctx.fillStyle = '#f472b6';
            ctx.textAlign = 'left';
            ctx.fillText('ECHOSFALL VR', 60, 58);

            // 右上角模式徽章
            const modeText = state.displayMode === 'curved_screen' ? 'IMAX 148° SCREEN' : '360° SEAMLESS PANORAMA';
            ctx.font = '700 15px "Orbitron", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'right';
            ctx.fillText(modeText, 930, 58);
            ctx.restore();

            // 右上角极速隐藏按钮
            hudButtons.push({
                id: 'btn-quick-hide',
                x: 955, y: 32, w: 65, h: 42,
                icon: '✕', labelEn: '', labelZh: '',
                isOutline: true,
                onClick: () => {
                    hideMenu();
                }
            });

            // 正在播放曲目名称
            ctx.save();
            ctx.font = '800 30px "Orbitron", -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            const displayTitle = trackInfo.title || 'Echoes in the Fog';
            ctx.fillText(displayTitle.length > 38 ? displayTitle.substring(0, 36) + '...' : displayTitle, 60, 105);

            // 当前视觉特效预设名称
            ctx.font = '600 19px "Orbitron", sans-serif';
            ctx.fillStyle = '#a5f3fc';
            const displayPreset = 'FX: ' + (trackInfo.preset || 'Cosmic Pulse');
            ctx.fillText(displayPreset.length > 50 ? displayPreset.substring(0, 48) + '...' : displayPreset, 60, 140);

            // 分隔线
            ctx.beginPath();
            ctx.moveTo(60, 165);
            ctx.lineTo(w - 60, 165);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // 第一行控制按钮：切歌、播放控制与选曲列表
            hudButtons.push(
                {
                    id: 'btn-prev-track',
                    x: 60, y: 185, w: 150, h: 68,
                    icon: '⏮', labelEn: 'Prev Track', labelZh: '上一曲',
                    onClick: () => {
                        if (state.bridge && state.bridge.prevTrack) state.bridge.prevTrack();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-play-pause',
                    x: 225, y: 185, w: 210, h: 68,
                    isPrimary: true,
                    icon: '⏯', labelEn: 'Play / Pause', labelZh: '播放 / 暂停',
                    onClick: () => {
                        if (state.bridge && state.bridge.togglePlayPause) state.bridge.togglePlayPause();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-next-track',
                    x: 450, y: 185, w: 150, h: 68,
                    icon: '⏭', labelEn: 'Next Track', labelZh: '下一曲',
                    onClick: () => {
                        if (state.bridge && state.bridge.nextTrack) state.bridge.nextTrack();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-open-tracklist',
                    x: 615, y: 185, w: 405, h: 68,
                    icon: '📜', labelEn: 'Pick Song (77 Tracks)', labelZh: '选曲点播 (77首曲目)',
                    isSpecial: true,
                    onClick: () => {
                        state.currentView = 'tracklist';
                        drawHUD();
                    }
                }
            );

            // 第二行控制按钮：切换预设、预设随机模式、画质分档切换
            hudButtons.push(
                {
                    id: 'btn-prev-preset',
                    x: 60, y: 265, w: 150, h: 68,
                    icon: '◀', labelEn: 'Prev FX', labelZh: '上一特效',
                    onClick: () => {
                        if (state.bridge && state.bridge.prevPreset) state.bridge.prevPreset();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-next-preset',
                    x: 225, y: 265, w: 210, h: 68,
                    icon: '🪄', labelEn: 'Next FX', labelZh: '切换特效',
                    onClick: () => {
                        if (state.bridge && state.bridge.nextPreset) state.bridge.nextPreset();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-toggle-preset-mode',
                    x: 450, y: 265, w: 270, h: 68,
                    icon: '🎨',
                    labelEn: isPresetShuffle ? 'FX: Shuffle' : 'FX: Sequential',
                    labelZh: isPresetShuffle ? '特效: 随机循环' : '特效: 顺序播放',
                    onClick: () => {
                        if (state.bridge && state.bridge.togglePresetPlaybackMode) {
                            state.bridge.togglePresetPlaybackMode();
                        }
                        drawHUD();
                    }
                },
                {
                    id: 'btn-cycle-quality',
                    x: 735, y: 265, w: 285, h: 68,
                    icon: '💎',
                    labelEn: `Quality: ${qualityLabel}`,
                    labelZh: `画质: ${qualityLabel} (可调)`,
                    isQuality: true,
                    onClick: () => {
                        if (state.bridge && state.bridge.cycleQualityTier) {
                            state.bridge.cycleQualityTier();
                        }
                        drawHUD();
                    }
                }
            );

            // 第三行控制按钮：歌曲随机模式、巨幕/全景视角、视角居中
            hudButtons.push(
                {
                    id: 'btn-toggle-song-mode',
                    x: 60, y: 345, w: 310, h: 68,
                    icon: isSongShuffle ? '🔀' : '🔁',
                    labelEn: isSongShuffle ? 'Songs: Shuffle' : 'Songs: Sequential',
                    labelZh: isSongShuffle ? '曲目: 随机播放' : '曲目: 顺序播放',
                    onClick: () => {
                        if (state.bridge && state.bridge.togglePlaybackMode) {
                            state.bridge.togglePlaybackMode();
                        }
                        drawHUD();
                    }
                },
                {
                    id: 'btn-toggle-display-mode',
                    x: 385, y: 345, w: 330, h: 68,
                    icon: '🌐',
                    labelEn: state.displayMode === 'curved_screen' ? 'View: IMAX Screen' : 'View: 360° Panorama',
                    labelZh: state.displayMode === 'curved_screen' ? '视角: IMAX超巨幕' : '视角: 360°真全景',
                    onClick: () => {
                        toggleDisplayMode();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-recenter',
                    x: 730, y: 345, w: 290, h: 68,
                    icon: '🎯', labelEn: 'Recenter View', labelZh: '视角正前居中',
                    onClick: () => {
                        recenterHUD();
                    }
                }
            );

            // 第四行控制按钮：防眩晕地面平台样式与透明度调节
            const currentTypeObj = PLATFORM_TYPES.find(t => t.id === platformState.type) || PLATFORM_TYPES[0];
            const currentOpacityObj = PLATFORM_OPACITIES.find(o => Math.abs(o.value - platformState.opacity) < 0.05) || PLATFORM_OPACITIES[1];

            hudButtons.push(
                {
                    id: 'btn-cycle-platform-type',
                    x: 60, y: 425, w: 495, h: 68,
                    icon: '🛡️',
                    labelEn: `Platform: ${currentTypeObj.nameEn} (Cycle)`,
                    labelZh: `地台样式: ${currentTypeObj.nameZh} (点击切换)`,
                    isPlatformType: true,
                    onClick: () => {
                        cyclePlatformType();
                    }
                },
                {
                    id: 'btn-cycle-platform-opacity',
                    x: 570, y: 425, w: 450, h: 68,
                    icon: '🔆',
                    labelEn: `Platform Opacity: ${currentOpacityObj.labelEn}`,
                    labelZh: `地台透明度: ${currentOpacityObj.labelZh}`,
                    isPlatformOpacity: true,
                    onClick: () => {
                        cyclePlatformOpacity();
                    }
                }
            );

            // 第五行控制按钮：退出 VR 与 隐藏菜单
            hudButtons.push(
                {
                    id: 'btn-exit-vr',
                    x: 60, y: 505, w: 530, h: 68,
                    isDanger: true,
                    icon: '🚪', labelEn: 'Exit VR Mode', labelZh: '退出 VR 沉浸模式',
                    onClick: () => {
                        exitVR();
                    }
                },
                {
                    id: 'btn-hide-hud',
                    x: 605, y: 505, w: 415, h: 68,
                    isOutline: true,
                    icon: '✕', labelEn: 'Hide Menu (Pure Visual)', labelZh: '隐藏菜单 (纯享视觉)',
                    onClick: () => {
                        hideMenu();
                    }
                }
            );

            // 底部手柄提示
            ctx.save();
            ctx.font = '500 14px "Orbitron", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.textAlign = 'center';
            const hintText = isZh
                ? '💡 瞄准空白处扣动扳机或按 A/X 键可隐藏菜单 · 摇杆左右切特效 · 摇杆上下切歌 · 侧握居中'
                : '💡 Pull Trigger in empty space or press A/X to toggle HUD · Stick [←→] FX · Stick [↑↓] Track';
            ctx.fillText(hintText, w / 2, 665);
            ctx.restore();
        }

        // ==========================================
        // 统一渲染所有按钮外观与悬停状态
        // ==========================================
        hudButtons.forEach(btn => {
            const isHover = (state.hoveredButtonId === btn.id);
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, btn.x, btn.y, btn.w, btn.h, btn.isSongItem ? 16 : 22);

            if (btn.disabled) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.stroke();
            } else if (isHover) {
                // 悬停高亮发光
                ctx.fillStyle = btn.isDanger ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.38)';
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = btn.isDanger ? '#ef4444' : '#38bdf8';
                ctx.shadowColor = btn.isDanger ? '#ef4444' : '#38bdf8';
                ctx.shadowBlur = 18;
                ctx.stroke();
            } else if (btn.isSongItem) {
                if (btn.isCurrentPlaying) {
                    ctx.fillStyle = 'rgba(236, 72, 153, 0.22)';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#f472b6';
                    ctx.shadowColor = '#f472b6';
                    ctx.shadowBlur = 12;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
                    ctx.fill();
                    ctx.lineWidth = 1.2;
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
                    ctx.stroke();
                }
            } else if (btn.isPrimary) {
                // 主操作按钮 (播放/暂停)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            } else if (btn.isSpecial) {
                // 选曲按钮 (霓虹高光)
                ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#38bdf8';
                ctx.stroke();
            } else if (btn.isQuality) {
                // 画质分档按钮 (金色微光)
                ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#f59e0b';
                ctx.stroke();
            } else if (btn.isPlatformType) {
                // 地台样式按钮 (科技青色微光)
                ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#38bdf8';
                ctx.stroke();
            } else if (btn.isPlatformOpacity) {
                // 地台透明度按钮 (幻梦粉微光)
                ctx.fillStyle = 'rgba(236, 72, 153, 0.16)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#f472b6';
                ctx.stroke();
            } else if (btn.isDanger) {
                // 退出按钮
                ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
                ctx.stroke();
            } else {
                // 常规按钮
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
                ctx.stroke();
            }
            ctx.restore();


            // 绘制文字与图标
            ctx.save();
            const centerX = btn.x + btn.w / 2;
            const centerY = btn.y + btn.h / 2;

            if (btn.isSongItem) {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = '600 18px "Orbitron", -apple-system, sans-serif';
                ctx.fillStyle = btn.isCurrentPlaying ? '#ffffff' : (isHover ? '#ffffff' : '#e0f2fe');

                const prefix = btn.isCurrentPlaying ? '🎵 ' : '▶ ';
                const maxChars = 26;
                const titleStr = btn.songTitle.length > maxChars ? btn.songTitle.substring(0, maxChars - 1) + '...' : btn.songTitle;
                ctx.fillText(`${prefix}${titleStr}`, btn.x + 20, centerY);

                if (btn.isCurrentPlaying) {
                    ctx.textAlign = 'right';
                    ctx.font = '700 13px "Orbitron", sans-serif';
                    ctx.fillStyle = '#f472b6';
                    ctx.fillText(isZh ? '正在播放' : 'PLAYING', btn.x + btn.w - 18, centerY);
                }
            } else {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const labelText = (isZh ? btn.labelZh : btn.labelEn);

                if (btn.isPrimary) {
                    const isPlaying = trackInfo.isPlaying;
                    const icon = isPlaying ? '⏸' : '▶';
                    const actionLabel = isPlaying ? (isZh ? '暂停音乐' : 'Pause') : (isZh ? '播放音乐' : 'Play');
                    ctx.font = '800 24px "Orbitron", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(`${icon} ${actionLabel}`, centerX, centerY);
                } else {
                    ctx.font = '700 18px "Orbitron", -apple-system, sans-serif';
                    ctx.fillStyle = btn.disabled ? 'rgba(255, 255, 255, 0.25)' : (isHover ? '#ffffff' : (btn.isDanger ? '#fca5a5' : '#e0f2fe'));
                    ctx.fillText(`${btn.icon || ''} ${labelText || ''}`, centerX, centerY);
                }
            }
            ctx.restore();
        });

        if (hudTexture) {
            hudTexture.needsUpdate = true;
        }
    }

    // 辅助圆角矩形
    function roundRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    // 构建 Quest 2 手柄控制器与激光束
    function setupControllers() {
        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);

            // 激光光束
            const rayGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -3.5)
            ]);
            const rayMat = new THREE.LineBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.55
            });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            controller.add(rayLine);
            scene.add(controller);

            // 手柄握把几何体
            const grip = renderer.xr.getControllerGrip(i);
            const wandGeom = new THREE.CylinderGeometry(0.016, 0.022, 0.16, 16);
            const wandMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
            const wandMesh = new THREE.Mesh(wandGeom, wandMat);
            wandMesh.rotation.x = -Math.PI / 4;
            grip.add(wandMesh);

            const glowRingGeom = new THREE.TorusGeometry(0.022, 0.003, 8, 24);
            const glowRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
            const glowRing = new THREE.Mesh(glowRingGeom, glowRingMat);
            glowRing.position.set(0, 0.05, -0.05);
            wandMesh.add(glowRing);

            scene.add(grip);

            controllers.push(controller);
            controllerGrips.push(grip);
            controllerRays.push(rayLine);

            // 监听扳机键触发点击
            controller.addEventListener('selectstart', () => onControllerSelect(controller, i));
            controller.addEventListener('squeezestart', () => recenterHUD());
        }

        // 射线命中点高亮光斑
        const reticleGeom = new THREE.RingGeometry(0.015, 0.026, 32);
        const reticleMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        reticleMesh = new THREE.Mesh(reticleGeom, reticleMat);
        reticleMesh.visible = false;
        scene.add(reticleMesh);
    }

    // 扳机键 (Trigger) 点击处理
    function onControllerSelect(controller, controllerIndex) {
        if (!state.menuVisible) {
            // 默认菜单处于隐藏状态，扣动任意手柄扳机键立刻唤出菜单与星尘
            showMenu();
            return;
        }

        // 如果菜单处于唤起状态：检查是否命中了按钮
        if (state.hoveredButtonId) {
            const btn = hudButtons.find(b => b.id === state.hoveredButtonId);
            if (btn && !btn.disabled && typeof btn.onClick === 'function') {
                pulseControllerHaptic(controllerIndex, 0.5, 60);
                btn.onClick();
                return;
            }
        }

        // 如果扳机扣在空白无按钮区域：自然隐去菜单，进入纯享视觉模式
        hideMenu();
    }

    // 唤起菜单与星尘
    function showMenu() {
        state.menuVisible = true;
        if (hudMesh) hudMesh.visible = true;
        if (starParticles) starParticles.visible = true;
        recenterHUD();
        drawHUD();
        pulseControllerHaptic(0, 0.25, 40);
        pulseControllerHaptic(1, 0.25, 40);
    }

    // 隐藏菜单与星尘 (纯享巨幕)
    function hideMenu() {
        state.menuVisible = false;
        if (hudMesh) hudMesh.visible = false;
        if (starParticles) starParticles.visible = false;
        if (reticleMesh) reticleMesh.visible = false;
        pulseControllerHaptic(0, 0.15, 30);
        pulseControllerHaptic(1, 0.15, 30);
    }

    // 触发 Quest 2 手柄物理震动
    function pulseControllerHaptic(controllerIndex, intensity = 0.4, durationMs = 50) {
        if (!xrSession) return;
        const source = xrSession.inputSources[controllerIndex];
        if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
            try {
                source.gamepad.hapticActuators[0].pulse(intensity, durationMs);
            } catch (e) {}
        }
    }

    // 将 3D HUD 居中召唤到用户正前方视野
    function recenterHUD() {
        if (!camera || !hudMesh) return;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
        forward.normalize();

        const targetPos = camera.position.clone().add(forward.clone().multiplyScalar(1.8));
        targetPos.y = Math.max(1.1, camera.position.y - 0.2);

        hudMesh.position.copy(targetPos);
        hudMesh.lookAt(camera.position.x, targetPos.y, camera.position.z);
        hudMesh.rotation.x += THREE.MathUtils.degToRad(8);
    }

    // 切换 [IMAX 巨幕模式] ↔ [360° 无缝真全景模式]
    function toggleDisplayMode() {
        if (state.displayMode === 'curved_screen') {
            state.displayMode = 'panoramic_360';
            screenMesh.visible = false;
            panoramicMesh.visible = true;
        } else {
            state.displayMode = 'curved_screen';
            screenMesh.visible = true;
            panoramicMesh.visible = false;
        }
        drawHUD();
    }

    // 每帧交互轮询：射线检测、手柄按键与摇杆盲操
    function updateXRFrame() {
        if (!xrSession) return;

        // 1. 摇杆与按键盲操检测
        const now = performance.now();
        if (now - state.lastThumbstickTime > state.thumbstickCooldown) {
            for (let i = 0; i < xrSession.inputSources.length; i++) {
                const source = xrSession.inputSources[i];
                if (!source || !source.gamepad) continue;
                const gp = source.gamepad;

                const stickX = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
                const stickY = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);

                // 摇杆左右倾斜：切换预设
                if (stickX > 0.62) {
                    state.lastThumbstickTime = now;
                    pulseControllerHaptic(i, 0.35, 40);
                    if (state.bridge && state.bridge.nextPreset) state.bridge.nextPreset();
                    drawHUD();
                    break;
                } else if (stickX < -0.62) {
                    state.lastThumbstickTime = now;
                    pulseControllerHaptic(i, 0.35, 40);
                    if (state.bridge && state.bridge.prevPreset) state.bridge.prevPreset();
                    drawHUD();
                    break;
                }

                // 摇杆上下倾斜：切歌
                if (stickY > 0.65) {
                    state.lastThumbstickTime = now;
                    pulseControllerHaptic(i, 0.35, 40);
                    if (state.bridge && state.bridge.nextTrack) state.bridge.nextTrack();
                    drawHUD();
                    break;
                } else if (stickY < -0.65) {
                    state.lastThumbstickTime = now;
                    pulseControllerHaptic(i, 0.35, 40);
                    if (state.bridge && state.bridge.prevTrack) state.bridge.prevTrack();
                    drawHUD();
                    break;
                }

                // 按键检测：Button 4 (A 或 X 键) 切换菜单与星尘显隐
                if (gp.buttons && gp.buttons.length > 4 && gp.buttons[4].pressed) {
                    state.lastThumbstickTime = now;
                    if (state.menuVisible) {
                        hideMenu();
                    } else {
                        showMenu();
                    }
                    break;
                }
            }
        }

        // 2. 射线拾取 HUD 按钮 (仅在菜单可见时执行拾取运算)
        let anyHover = null;
        let hitPoint = null;

        if (state.menuVisible && hudMesh && hudMesh.visible) {
            const tempMatrix = new THREE.Matrix4();
            for (let i = 0; i < controllers.length; i++) {
                const controller = controllers[i];
                tempMatrix.identity().extractRotation(controller.matrixWorld);

                raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                const intersects = raycaster.intersectObject(hudMesh);
                if (intersects.length > 0) {
                    const hit = intersects[0];
                    hitPoint = hit.point;
                    const uv = hit.uv;
                    const canvasX = uv.x * hudCanvas.width;
                    const canvasY = (1 - uv.y) * hudCanvas.height;

                    for (const btn of hudButtons) {
                        if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
                            canvasY >= btn.y && canvasY <= btn.y + btn.h) {
                            anyHover = btn.id;
                            break;
                        }
                    }
                    if (anyHover) break;
                }
            }
        }

        // 处理悬停光标与触觉微震
        if (hitPoint && reticleMesh && state.menuVisible) {
            reticleMesh.position.copy(hitPoint);
            reticleMesh.position.add(raycaster.ray.direction.clone().multiplyScalar(-0.01));
            reticleMesh.lookAt(camera.position);
            reticleMesh.visible = true;
        } else if (reticleMesh) {
            reticleMesh.visible = false;
        }

        if (state.hoveredButtonId !== anyHover) {
            state.hoveredButtonId = anyHover;
            if (anyHover) {
                pulseControllerHaptic(0, 0.15, 20);
                pulseControllerHaptic(1, 0.15, 20);
            }
            drawHUD();
        }
    }

    // WebXR 专属主渲染循环
    function onXRAnimationLoop(timestamp, frame) {
        if (!state.isVRActive || !renderer) return;

        // 1. 同步更新 Butterchurn 画面到 3D 空间材质
        if (state.bridge && state.bridge.renderButterchurnFrame) {
            try {
                state.bridge.renderButterchurnFrame();
            } catch (err) {}
        }
        if (visualizerTexture) {
            visualizerTexture.needsUpdate = true;
        }

        // 2. 轮询手柄、射线与交互
        updateXRFrame();

        // 3. 提交立体双目渲染
        renderer.render(scene, camera);
    }

    // 启动 WebXR VR 沉浸会话
    async function enterVR() {
        if (!state.isSupported) {
            const ok = await checkXRSupport();
            if (!ok) {
                alert('当前浏览器未检测到 WebXR 沉浸式设备支持。\n请使用 Meta Quest 2 打开 Meta Quest 浏览器访问本网址！');
                return;
            }
        }

        initThreeScene();

        try {
            xrSession = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });

            await renderer.xr.setSession(xrSession);
            state.isVRActive = true;

            // 默认进入 VR 隐藏菜单，纯净展现巨幕视觉
            state.menuVisible = false;
            if (hudMesh) hudMesh.visible = false;
            if (starParticles) starParticles.visible = false;
            if (reticleMesh) reticleMesh.visible = false;

            xrSession.addEventListener('end', onSessionEnded);

            if (state.bridge && state.bridge.onSessionStart) {
                state.bridge.onSessionStart();
            }

            // 预设好居中角度
            recenterHUD();
            drawHUD();

            // 启动 WebXR 驱动的动画循环
            renderer.setAnimationLoop(onXRAnimationLoop);
            console.log('[VRManager] WebXR 沉浸式 VR 会话启动成功！');
        } catch (err) {
            console.error('[VRManager] 启动 WebXR 异常:', err);
            alert('启动 VR 失败: ' + (err.message || err));
        }
    }

    // 退出 VR
    async function exitVR() {
        if (xrSession) {
            try {
                await xrSession.end();
            } catch (e) {
                console.warn('[VRManager] xrSession.end 异常:', e);
            }
        }
    }

    // WebXR 会话结束恢复流程
    function onSessionEnded() {
        state.isVRActive = false;
        xrSession = null;

        if (renderer) {
            renderer.setAnimationLoop(null);
        }

        if (state.bridge && state.bridge.onSessionEnd) {
            state.bridge.onSessionEnd();
        }

        console.log('[VRManager] WebXR 沉浸式 VR 会话已安全退出');
    }

    // 暴露全局 VR 控制接口
    window.VRManager = {
        checkSupport: checkXRSupport,
        isSupported: () => state.isSupported,
        isActive: () => state.isVRActive,
        enterVR,
        exitVR,
        showMenu,
        hideMenu,
        setPlaybackBridge: (bridge) => {
            state.bridge = bridge;
        },
        updateHUD: () => {
            if (state.isVRActive) {
                drawHUD();
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            checkXRSupport().catch(() => undefined);
        });
    }
})();
