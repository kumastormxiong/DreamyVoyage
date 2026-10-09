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
        displayMode: 'panoramic_360', // 'panoramic_360' (360°无缝全景) | 'curved_screen' (IMAX巨幕)
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

    // 裸手追踪 (WebXR Hand Tracking) 与 Shader 手部模型系统
    let hands = [];
    let handModels = [];
    let handPinchBurstMesh = null;
    let handRaycaster = null;
    let handPointingRays = [];

    // 残影与光带系统 (Ribbon Trails & Motion Echo Ghosts)
    const TRAIL_HISTORY_LEN = 24;
    let handTrails = [];
    let handGhosts = [];

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

    // 3D VR 立体视觉 (B+C 方案) 与地台尺寸
    const PLATFORM_SIZES = [
        { value: 0.7, labelEn: '0.7x Compact', labelZh: '0.7x 紧凑' },
        { value: 1.0, labelEn: '1.0x Standard', labelZh: '1.0x 标准' },
        { value: 1.3, labelEn: '1.3x Wide', labelZh: '1.3x 宽阔' },
        { value: 1.6, labelEn: '1.6x Expansive', labelZh: '1.6x 广阔' }
    ];

    let vrStereoEnabled = (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_stereo_enabled') !== null)
        ? (localStorage.getItem('dv_vr_stereo_enabled') !== 'false')
        : true; // 默认开启 3D 立体视觉 (B+C 方案)

    let platformState = {
        type: (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_platform_type')) || 'cyber_ring',
        opacity: (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_platform_opacity') !== null)
            ? parseFloat(localStorage.getItem('dv_vr_platform_opacity'))
            : 0.75,
        size: (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_platform_size') !== null)
            ? parseFloat(localStorage.getItem('dv_vr_platform_size'))
            : 1.0
    };
    if (isNaN(platformState.opacity)) platformState.opacity = 0.75;
    if (isNaN(platformState.size)) platformState.size = 1.0;

    // 方案 C: 历史帧时空隧道分层 (Tunnel Echo) 状态
    let tunnelCanvas = null;
    let tunnelCtx = null;
    let tunnelTexture = null;
    let tunnelMeshScreen = null;
    let tunnelMeshPano = null;
    let frameCounter = 0;

    // 方案 B: 实时亮度 + 音频低频能量复合深度位移着色器 (Stereoscopic Displacement Shader)
    const stereoVertexShader = `
        uniform sampler2D uTexture;
        uniform float uDepthScale;
        uniform float uAudioBass;
        uniform float uStereoOn;

        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
            vUv = uv;
            vNormal = normal;

            // 采样 Butterchurn 视觉纹理获取像素亮度
            vec4 texColor = texture2D(uTexture, uv);
            float luminance = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));

            // Plan B: 亮度 + 低频音频能量深度位移网格
            // 基准点 0.35：亮部 (>0.35) 凸向用户，暗部 (<0.35) 凹陷深空
            // normal 在内凹曲面指向外侧，故 -normal 为朝向用户的法向量
            float disp = (luminance - 0.35) * uDepthScale * (1.0 + uAudioBass * 0.45) * uStereoOn;
            vec3 newPos = position - normal * disp;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
    `;

    const stereoFragmentShader = `
        uniform sampler2D uTexture;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
            vec4 col = texture2D(uTexture, vUv);
            gl_FragColor = vec4(col.rgb, col.a * uOpacity);
        }
    `;

    // 360° 无畸变三平面非同质投影着色器 (Triplanar Spherical Mapping Shaders)
    // 彻底解决两极菊花状畸变 (Zenith/Nadir Pinching) 与左右镜像穿帮 (Mirroring)
    const triplanarPanoVertexShader = `
        uniform float uAudioBass;
        uniform float uStereoOn;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
            vNormal = normal;
            vWorldPos = position;

            // 随音乐低音能量产生轻微的全景空间呼吸律动
            float bassPulse = uAudioBass * 0.35 * uStereoOn;
            vec3 displaced = position + normal * bassPulse;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
    `;

    const triplanarPanoFragmentShader = `
        uniform sampler2D uTexture;
        uniform float uOpacity;
        uniform float uAudioBass;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
            // 球心指向当前片元的 3D 归一化方向向量
            vec3 n = normalize(vWorldPos);

            // 三向混合权重：高次幂 (6.0) 保证三轴过渡极其自然平滑，杜绝重影
            vec3 blendWeights = pow(abs(n), vec3(6.0));
            blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

            // 1. Z 轴正交投影 (正前 / 正后视野)
            vec2 uvZ = vec2(n.x, n.y) * 0.5 + 0.5;

            // 2. X 轴正交投影 (正左 / 正右视野)
            // 关键：旋转 90 度并加入非对称相位偏移，彻底打破左右镜像对称！
            vec2 uvX = vec2(n.z, n.y) * 0.5 + 0.5;
            uvX = vec2(uvX.y, 1.0 - uvX.x) + vec2(0.37, 0.63);

            // 3. Y 轴正交投影 (天顶头顶 / 地底脚底视野)
            // 关键：正交平铺俯视，完全消除极点收缩与螺旋畸变！
            vec2 uvY = vec2(n.x, n.z) * 0.5 + 0.5;
            uvY = vec2(1.0 - uvY.x, uvY.y) + vec2(0.5, 0.5);

            // 采样 Butterchurn 2D 纹理 (fract 保证连续无缝平铺)
            vec4 colZ = texture2D(uTexture, fract(uvZ));
            vec4 colX = texture2D(uTexture, fract(uvX));
            vec4 colY = texture2D(uTexture, fract(uvY));

            // 三平面平滑加权融合
            vec4 finalColor = colZ * blendWeights.z + 
                              colX * blendWeights.x + 
                              colY * blendWeights.y;

            // 低音能量注入微妙微光增益
            finalColor.rgb += finalColor.rgb * (uAudioBass * 0.12);

            gl_FragColor = vec4(finalColor.rgb, finalColor.a * uOpacity);
        }
    `;

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

        // 初始化方案 C 历史帧时空隧道分层画布与纹理
        tunnelCanvas = document.createElement('canvas');
        tunnelCanvas.width = 512;
        tunnelCanvas.height = 512;
        tunnelCtx = tunnelCanvas.getContext('2d');
        tunnelTexture = new THREE.CanvasTexture(tunnelCanvas);
        tunnelTexture.minFilter = THREE.LinearFilter;
        tunnelTexture.magFilter = THREE.LinearFilter;
        tunnelTexture.generateMipmaps = false;

        // 5. 构建高耸双倍高度 IMAX 巨幕 与 360° 无缝真全景
        buildScreenAndDome();

        // 6. 构建深空静态星尘环境 & 地面发光参考台
        buildEnvironment();

        // 7. 构建 3D 悬浮 HUD 菜单
        buildFloatingHUD();

        // 8. 构建手柄控制器与射线
        setupControllers();

        // 9. 构建 WebXR 裸手追踪与炫酷 Shader 残影系统
        setupHands();

        raycaster = new THREE.Raycaster();
    }

    // 构建双倍高度超巨 IMAX 微曲立体巨幕 (Plan B) 与 360° 无缝真全景立体空间 + 时空隧道外层壳 (Plan C)
    function buildScreenAndDome() {
        const screenShaderMat = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: visualizerTexture },
                uDepthScale: { value: 0.55 },
                uAudioBass: { value: 0.0 },
                uStereoOn: { value: vrStereoEnabled ? 1.0 : 0.0 },
                uOpacity: { value: 1.0 }
            },
            vertexShader: stereoVertexShader,
            fragmentShader: stereoFragmentShader,
            side: THREE.DoubleSide
        });

        const panoShaderMat = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: visualizerTexture },
                uAudioBass: { value: 0.0 },
                uStereoOn: { value: vrStereoEnabled ? 1.0 : 0.0 },
                uOpacity: { value: 1.0 }
            },
            vertexShader: triplanarPanoVertexShader,
            fragmentShader: triplanarPanoFragmentShader,
            side: THREE.BackSide
        });

        const tunnelPanoMat = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: tunnelTexture },
                uAudioBass: { value: 0.0 },
                uStereoOn: { value: vrStereoEnabled ? 1.0 : 0.0 },
                uOpacity: { value: 0.38 }
            },
            vertexShader: triplanarPanoVertexShader,
            fragmentShader: triplanarPanoFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false
        });

        const tunnelMat = new THREE.MeshBasicMaterial({
            map: tunnelTexture,
            transparent: true,
            opacity: 0.38,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        // --- 方案 A/B: 双倍高度超巨 IMAX 微曲立体巨幕 (128x64 细分网格位移) ---
        // 距离 4.2 米，高度翻倍至 5.2 米 (从眼平线 1.6 米处向上延伸至 4.2 米，向下延伸至 -1.0 米)
        // 弧角增至约 148° (Math.PI * 0.82)，形成震撼的上下左右全视野包裹
        const radius = 4.2;
        const height = 5.2;
        const arcAngle = Math.PI * 0.82;
        const thetaStart = Math.PI - arcAngle / 2; // 精确中心对齐在 -Z 轴 (用户正前方)

        const cylinderGeom = new THREE.CylinderGeometry(
            radius, radius, height, 128, 64, true, thetaStart, arcAngle
        );
        screenMesh = new THREE.Mesh(cylinderGeom, screenShaderMat);
        screenMesh.scale.set(-1, 1, 1); // 水平镜像翻转使纹理左右方向正确
        screenMesh.position.set(0, 1.6, 0);
        scene.add(screenMesh);

        // --- 方案 C: 巨幕时空隧道外层壳 (半径 5.6m，后退 1.4m，叠加历史帧流动) ---
        const tunnelRadius = 5.6;
        const tunnelHeight = 6.9;
        const tunnelCylinderGeom = new THREE.CylinderGeometry(
            tunnelRadius, tunnelRadius, tunnelHeight, 64, 16, true, thetaStart, arcAngle
        );
        tunnelMeshScreen = new THREE.Mesh(tunnelCylinderGeom, tunnelMat);
        tunnelMeshScreen.scale.set(-1, 1, 1);
        tunnelMeshScreen.position.set(0, 1.6, 0);
        tunnelMeshScreen.visible = vrStereoEnabled && (state.displayMode === 'curved_screen');
        scene.add(tunnelMeshScreen);

        // --- 方案 B: 360° 天地全覆盖真全景球幕 (三平面无畸变非镜像投影) ---
        const panoRadius = 22;
        const widthSegments = 96;
        const heightSegments = 48;
        const panoGeom = new THREE.SphereGeometry(
            panoRadius, widthSegments, heightSegments
        );

        panoramicMesh = new THREE.Mesh(panoGeom, panoShaderMat);
        panoramicMesh.scale.set(-1, 1, 1);
        panoramicMesh.position.set(0, 1.6, 0);
        panoramicMesh.visible = (state.displayMode === 'panoramic_360');
        scene.add(panoramicMesh);

        // --- 方案 C: 全景时空隧道外层球壳 (三平面无畸变时空回响) ---
        const tunnelPanoRadius = 26;
        const tunnelPanoGeom = new THREE.SphereGeometry(
            tunnelPanoRadius, 64, 32
        );

        tunnelMeshPano = new THREE.Mesh(tunnelPanoGeom, tunnelPanoMat);
        tunnelMeshPano.scale.set(-1, 1, 1);
        tunnelMeshPano.position.set(0, 1.6, 0);
        tunnelMeshPano.visible = vrStereoEnabled && (state.displayMode === 'panoramic_360');
        scene.add(tunnelMeshPano);
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

        // 统一应用地台大小缩放 (0.7x ~ 1.6x)
        const sz = platformState.size || 1.0;
        platformGroup.scale.set(sz, 1, sz);

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
                localStorage.setItem('dv_vr_platform_size', platformState.size.toString());
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

    // 切换地面平台大小
    function cyclePlatformSize() {
        const curSize = platformState.size;
        const idx = PLATFORM_SIZES.findIndex(s => Math.abs(s.value - curSize) < 0.05);
        const nextIdx = (idx + 1) % PLATFORM_SIZES.length;
        platformState.size = PLATFORM_SIZES[nextIdx].value;
        updatePlatformAppearance();
        drawHUD();
    }

    function setPlatformSize(size) {
        const num = parseFloat(size);
        if (!isNaN(num) && num > 0) {
            platformState.size = num;
            updatePlatformAppearance();
            drawHUD();
        }
    }

    // 切换 3D VR 立体视觉开关
    function toggleVRStereo() {
        setVRStereoEnabled(!vrStereoEnabled);
    }

    function setVRStereoEnabled(enabled) {
        vrStereoEnabled = !!enabled;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('dv_vr_stereo_enabled', String(vrStereoEnabled));
            }
        } catch (e) {}
        const stereoVal = vrStereoEnabled ? 1.0 : 0.0;
        if (screenMesh && screenMesh.material && screenMesh.material.uniforms) {
            screenMesh.material.uniforms.uStereoOn.value = stereoVal;
        }
        if (panoramicMesh && panoramicMesh.material && panoramicMesh.material.uniforms) {
            panoramicMesh.material.uniforms.uStereoOn.value = stereoVal;
        }
        if (tunnelMeshScreen) {
            tunnelMeshScreen.visible = vrStereoEnabled && (state.displayMode === 'curved_screen');
        }
        if (tunnelMeshPano) {
            tunnelMeshPano.visible = vrStereoEnabled && (state.displayMode === 'panoramic_360');
        }
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

            // 第三行控制按钮：歌曲随机模式、巨幕/全景视角、3D立体/2D标准、视角居中
            hudButtons.push(
                {
                    id: 'btn-toggle-song-mode',
                    x: 60, y: 345, w: 220, h: 68,
                    icon: isSongShuffle ? '🔀' : '🔁',
                    labelEn: isSongShuffle ? 'Songs: Shuffle' : 'Songs: Order',
                    labelZh: isSongShuffle ? '歌曲: 随机' : '歌曲: 顺序',
                    onClick: () => {
                        if (state.bridge && state.bridge.togglePlaybackMode) {
                            state.bridge.togglePlaybackMode();
                        }
                        drawHUD();
                    }
                },
                {
                    id: 'btn-toggle-display-mode',
                    x: 290, y: 345, w: 235, h: 68,
                    icon: '🌐',
                    labelEn: state.displayMode === 'curved_screen' ? 'View: IMAX' : 'View: 360°',
                    labelZh: state.displayMode === 'curved_screen' ? '视角: IMAX巨幕' : '视角: 360°全景',
                    onClick: () => {
                        toggleDisplayMode();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-toggle-vr-stereo',
                    x: 535, y: 345, w: 255, h: 68,
                    icon: '🧊',
                    labelEn: vrStereoEnabled ? '3D: Depth Active' : '3D: 2D Flat',
                    labelZh: vrStereoEnabled ? '3D立体: 已开启' : '3D立体: 2D平面',
                    isVRStereo: true,
                    onClick: () => {
                        toggleVRStereo();
                    }
                },
                {
                    id: 'btn-recenter',
                    x: 800, y: 345, w: 220, h: 68,
                    icon: '🎯', labelEn: 'Recenter', labelZh: '正前居中',
                    onClick: () => {
                        recenterHUD();
                    }
                }
            );

            // 第四行控制按钮：防眩晕地面平台样式、透明度与尺寸调节
            const currentTypeObj = PLATFORM_TYPES.find(t => t.id === platformState.type) || PLATFORM_TYPES[0];
            const currentOpacityObj = PLATFORM_OPACITIES.find(o => Math.abs(o.value - platformState.opacity) < 0.05) || PLATFORM_OPACITIES[1];
            const currentSizeObj = PLATFORM_SIZES.find(s => Math.abs(s.value - platformState.size) < 0.05) || PLATFORM_SIZES[1];

            hudButtons.push(
                {
                    id: 'btn-cycle-platform-type',
                    x: 60, y: 425, w: 310, h: 68,
                    icon: '🛡️',
                    labelEn: `Platform: ${currentTypeObj.nameEn}`,
                    labelZh: `地台: ${currentTypeObj.nameZh}`,
                    isPlatformType: true,
                    onClick: () => {
                        cyclePlatformType();
                    }
                },
                {
                    id: 'btn-cycle-platform-opacity',
                    x: 385, y: 425, w: 310, h: 68,
                    icon: '🔆',
                    labelEn: `Opacity: ${currentOpacityObj.labelEn}`,
                    labelZh: `透明度: ${currentOpacityObj.labelZh}`,
                    isPlatformOpacity: true,
                    onClick: () => {
                        cyclePlatformOpacity();
                    }
                },
                {
                    id: 'btn-cycle-platform-size',
                    x: 710, y: 425, w: 310, h: 68,
                    icon: '📏',
                    labelEn: `Size: ${currentSizeObj.labelEn}`,
                    labelZh: `尺寸: ${currentSizeObj.labelZh}`,
                    isPlatformSize: true,
                    onClick: () => {
                        cyclePlatformSize();
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
            } else if (btn.isVRStereo) {
                // 3D 立体视觉按钮 (紫色电光)
                ctx.fillStyle = vrStereoEnabled ? 'rgba(168, 85, 247, 0.22)' : 'rgba(255, 255, 255, 0.08)';
                ctx.fill();
                ctx.lineWidth = 2.0;
                ctx.strokeStyle = vrStereoEnabled ? '#c084fc' : 'rgba(255, 255, 255, 0.35)';
                if (vrStereoEnabled) {
                    ctx.shadowColor = '#c084fc';
                    ctx.shadowBlur = 10;
                }
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
            } else if (btn.isPlatformSize) {
                // 地台尺寸按钮 (翡翠青绿微光)
                ctx.fillStyle = 'rgba(45, 212, 191, 0.16)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = '#2dd4bf';
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
                    const fontSize = (btn.w < 260) ? 16 : 18;
                    ctx.font = `700 ${fontSize}px "Orbitron", -apple-system, sans-serif`;
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

    // ==========================================
    // 裸手追踪 (WebXR Hand Tracking) 与 Shader 手部特效系统
    // ==========================================

    const JOINT_NAMES = [
        'wrist',
        'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
        'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
        'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
        'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
        'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
    ];

    const BONE_CONNECTIONS = [
        ['wrist', 'thumb-metacarpal'],
        ['thumb-metacarpal', 'thumb-phalanx-proximal'],
        ['thumb-phalanx-proximal', 'thumb-phalanx-distal'],
        ['thumb-phalanx-distal', 'thumb-tip'],
        ['wrist', 'index-finger-metacarpal'],
        ['index-finger-metacarpal', 'index-finger-phalanx-proximal'],
        ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate'],
        ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'],
        ['index-finger-phalanx-distal', 'index-finger-tip'],
        ['wrist', 'middle-finger-metacarpal'],
        ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal'],
        ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate'],
        ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'],
        ['middle-finger-phalanx-distal', 'middle-finger-tip'],
        ['wrist', 'ring-finger-metacarpal'],
        ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal'],
        ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate'],
        ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'],
        ['ring-finger-phalanx-distal', 'ring-finger-tip'],
        ['wrist', 'pinky-finger-metacarpal'],
        ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal'],
        ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate'],
        ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'],
        ['pinky-finger-phalanx-distal', 'pinky-finger-tip']
    ];

    function setupHands() {
        handRaycaster = new THREE.Raycaster();

        // 捏合光爆环特效
        const burstGeom = new THREE.RingGeometry(0.008, 0.032, 24);
        const burstMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        handPinchBurstMesh = new THREE.Mesh(burstGeom, burstMat);
        handPinchBurstMesh.visible = false;
        scene.add(handPinchBurstMesh);

        for (let i = 0; i < 2; i++) {
            const hand = renderer.xr.getHand(i);
            scene.add(hand);
            hands.push(hand);

            const isLeft = (i === 0);
            const mainColorHex = isLeft ? 0x06b6d4 : 0xa855f7; // 左手赛博青，右手电光紫
            const accentColorHex = isLeft ? 0x38bdf8 : 0xc084fc;

            // 1. 关节能量球 Shader
            const jointGeom = new THREE.SphereGeometry(1, 10, 8);
            const jointMat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color(mainColorHex) },
                    uAudioBass: { value: 0.0 }
                },
                vertexShader: `
                    varying vec3 vNormal;
                    void main() {
                        vNormal = normalize(normalMatrix * normal);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uAudioBass;
                    varying vec3 vNormal;
                    void main() {
                        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
                        rim = pow(rim, 1.5);
                        vec3 col = uColor * (1.2 + uAudioBass * 0.9) + vec3(rim * 0.7);
                        gl_FragColor = vec4(col, 0.88);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            // 2. 骨骼流光管 Shader
            const boneGeom = new THREE.CylinderGeometry(0.0032, 0.0032, 1, 8);
            const boneMat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color(accentColorHex) },
                    uAudioBass: { value: 0.0 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    varying vec3 vNormal;
                    void main() {
                        vUv = uv;
                        vNormal = normalize(normalMatrix * normal);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uAudioBass;
                    varying vec2 vUv;
                    varying vec3 vNormal;
                    void main() {
                        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
                        float pulse = sin(vUv.y * 14.0) * 0.2 + 0.8;
                        vec3 col = uColor * pulse * (1.1 + uAudioBass * 0.7) + vec3(rim * 0.5);
                        gl_FragColor = vec4(col, 0.72);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            // 关节模型字典
            const jointMeshes = {};
            JOINT_NAMES.forEach(jName => {
                const mesh = new THREE.Mesh(jointGeom, jointMat);
                let radius = 0.0068;
                if (jName === 'wrist') radius = 0.013;
                else if (jName.endsWith('-tip')) radius = 0.0055;
                mesh.scale.set(radius, radius, radius);
                mesh.visible = false;
                scene.add(mesh);
                jointMeshes[jName] = mesh;
            });

            // 骨骼光管列表
            const boneMeshes = [];
            BONE_CONNECTIONS.forEach(([jA, jB]) => {
                const mesh = new THREE.Mesh(boneGeom, boneMat);
                mesh.visible = false;
                scene.add(mesh);
                boneMeshes.push({ mesh, jA, jB });
            });

            // 指尖指向激光
            const rayGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -2.8)
            ]);
            const rayMat = new THREE.LineBasicMaterial({
                color: mainColorHex,
                transparent: true,
                opacity: 0.65,
                blending: THREE.AdditiveBlending
            });
            const handRayLine = new THREE.Line(rayGeom, rayMat);
            handRayLine.visible = false;
            scene.add(handRayLine);
            handPointingRays.push(handRayLine);

            // 捏合聚能环
            const pinchAuraGeom = new THREE.TorusGeometry(0.015, 0.0028, 8, 24);
            const pinchAuraMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const pinchAura = new THREE.Mesh(pinchAuraGeom, pinchAuraMat);
            pinchAura.visible = false;
            scene.add(pinchAura);

            // 保存手部容器状态
            handModels.push({
                hand,
                index: i,
                jointMat,
                boneMat,
                jointMeshes,
                boneMeshes,
                pinchAura,
                handRayLine,
                isPinching: false,
                lastPinchActionTime: 0,
                handedness: isLeft ? 'left' : 'right',
                active: false
            });

            // 构建手指跟随流光光带 (Ribbon Trail)
            const trailGeom = new THREE.BufferGeometry();
            const maxVertices = TRAIL_HISTORY_LEN * 2;
            const trailPositions = new Float32Array(maxVertices * 3);
            const trailUvs = new Float32Array(maxVertices * 2);
            trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            trailGeom.setAttribute('uv', new THREE.BufferAttribute(trailUvs, 2));

            for (let k = 0; k < TRAIL_HISTORY_LEN; k++) {
                const u = k / (TRAIL_HISTORY_LEN - 1);
                trailUvs[(k * 2) * 2] = u;
                trailUvs[(k * 2) * 2 + 1] = 0.0;
                trailUvs[(k * 2 + 1) * 2] = u;
                trailUvs[(k * 2 + 1) * 2 + 1] = 1.0;
            }
            trailGeom.attributes.uv.needsUpdate = true;

            const trailShaderMat = new THREE.ShaderMaterial({
                uniforms: {
                    uHeadColor: { value: new THREE.Color(mainColorHex) },
                    uTailColor: { value: new THREE.Color(accentColorHex) },
                    uAudioBass: { value: 0.0 },
                    uTime: { value: 0.0 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uHeadColor;
                    uniform vec3 uTailColor;
                    uniform float uAudioBass;
                    uniform float uTime;
                    varying vec2 vUv;

                    void main() {
                        float alpha = pow(vUv.x, 2.2);
                        float edge = sin(vUv.y * 3.1415926);
                        vec3 col = mix(uTailColor, uHeadColor, vUv.x);
                        col += vec3(0.25, 0.2, 0.15) * uAudioBass;
                        float pulse = sin(uTime * 8.0 + vUv.x * 6.28) * 0.15 + 0.85;
                        gl_FragColor = vec4(col * pulse, alpha * edge * 0.82 * (0.8 + uAudioBass * 0.4));
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const trailMesh = new THREE.Mesh(trailGeom, trailShaderMat);
            trailMesh.frustumCulled = false;
            scene.add(trailMesh);

            handTrails.push({
                mesh: trailMesh,
                material: trailShaderMat,
                history: []
            });

            // 监听 WebXR Hand 原生事件
            hand.addEventListener('connected', (event) => {
                const handedness = (event.data && event.data.handedness) || (i === 0 ? 'left' : 'right');
                handModels[i].handedness = handedness;
            });
            hand.addEventListener('pinchstart', () => onHandPinchTrigger(i, true));
            hand.addEventListener('pinchend', () => onHandPinchTrigger(i, false));
        }

        // 构建时空虚影分身池 (每手 6 个残影)
        const GHOST_COUNT_PER_HAND = 6;
        for (let i = 0; i < 2; i++) {
            const ghostsForHand = [];
            const isLeft = (i === 0);
            const ghostColorHex = isLeft ? 0x06b6d4 : 0xa855f7;

            for (let g = 0; g < GHOST_COUNT_PER_HAND; g++) {
                const ghostGroup = new THREE.Group();
                ghostGroup.visible = false;

                const ghostMat = new THREE.MeshBasicMaterial({
                    color: ghostColorHex,
                    transparent: true,
                    opacity: 0.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    wireframe: true
                });

                const ghostJoints = [];
                for (let k = 0; k < 10; k++) {
                    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), ghostMat);
                    ghostGroup.add(sp);
                    ghostJoints.push(sp);
                }

                scene.add(ghostGroup);
                ghostsForHand.push({
                    group: ghostGroup,
                    material: ghostMat,
                    joints: ghostJoints,
                    life: 0.0,
                    maxLife: 0.42,
                    active: false
                });
            }
            handGhosts.push(ghostsForHand);
        }
    }

    // 捏合动作统一处理器 (Quest 标准交互: 空中捏合呼出/隐藏菜单，对准按钮捏合触发点击)
    function onHandPinchTrigger(handIndex, isStart) {
        if (!isStart) return;

        const now = performance.now();
        const hModel = handModels[handIndex];
        if (!hModel) return;
        if (now - (hModel.lastPinchActionTime || 0) < 280) return; // 防抖 280ms
        hModel.lastPinchActionTime = now;

        // 触发光爆环特效
        const hand = hands[handIndex];
        const indexTip = hand && hand.joints && hand.joints['index-finger-tip'];
        if (handPinchBurstMesh && indexTip && indexTip.visible) {
            handPinchBurstMesh.position.copy(indexTip.position);
            handPinchBurstMesh.lookAt(camera.position);
            handPinchBurstMesh.scale.set(1, 1, 1);
            handPinchBurstMesh.material.opacity = 0.95;
            handPinchBurstMesh.visible = true;
        }

        // 1. 如果菜单处于隐藏状态：空中捏合直接唤出菜单与星尘
        if (!state.menuVisible) {
            showMenu();
            return;
        }

        // 2. 如果菜单处于打开状态：检查是否命中了 HUD 按钮
        if (state.hoveredButtonId) {
            const btn = hudButtons.find(b => b.id === state.hoveredButtonId);
            if (btn && !btn.disabled && typeof btn.onClick === 'function') {
                pulseControllerHaptic(handIndex, 0.5, 60);
                btn.onClick();
                return;
            }
        }

        // 3. 空白区域捏合：自然隐藏菜单
        hideMenu();
    }

    // 每帧更新裸手追踪、骨骼位置、捏合状态、流光残影与分身虚影
    function updateHandTracking(timestamp, bass) {
        let anyHandActive = false;
        let handHoveredBtn = null;
        let handHitPoint = null;

        for (let i = 0; i < handModels.length; i++) {
            const hModel = handModels[i];
            const hand = hands[i];
            if (!hand || !hand.joints) continue;

            const wrist = hand.joints['wrist'];
            const isHandVisible = !!(wrist && wrist.visible);

            if (isHandVisible) {
                anyHandActive = true;
                hModel.active = true;

                // 裸手激活时，隐藏传统手柄实体与射线
                if (controllerGrips[i]) controllerGrips[i].visible = false;
                if (controllerRays[i]) controllerRays[i].visible = false;

                // 更新关节着色器 Uniforms
                hModel.jointMat.uniforms.uAudioBass.value = bass;
                hModel.boneMat.uniforms.uAudioBass.value = bass;

                // 更新 25 个关节位置
                JOINT_NAMES.forEach(jName => {
                    const jObj = hand.joints[jName];
                    const mObj = hModel.jointMeshes[jName];
                    if (jObj && jObj.visible) {
                        mObj.position.copy(jObj.position);
                        mObj.visible = true;
                    } else if (mObj) {
                        mObj.visible = false;
                    }
                });

                // 更新 24 根骨骼光管位置与方向
                hModel.boneMeshes.forEach(({ mesh, jA, jB }) => {
                    const objA = hand.joints[jA];
                    const objB = hand.joints[jB];
                    if (objA && objA.visible && objB && objB.visible) {
                        const pA = objA.position;
                        const pB = objB.position;
                        mesh.position.set((pA.x + pB.x) * 0.5, (pA.y + pB.y) * 0.5, (pA.z + pB.z) * 0.5);
                        const dist = pA.distanceTo(pB);
                        mesh.scale.set(1, Math.max(dist, 0.001), 1);
                        const dir = new THREE.Vector3().subVectors(pB, pA).normalize();
                        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                        mesh.visible = true;
                    } else {
                        mesh.visible = false;
                    }
                });

                // 实时距离计算辅助判断捏合 (Double-check pinch)
                const thumbTip = hand.joints['thumb-tip'];
                const indexTip = hand.joints['index-finger-tip'];
                if (thumbTip && thumbTip.visible && indexTip && indexTip.visible) {
                    const pinchDist = thumbTip.position.distanceTo(indexTip.position);
                    const pinchCenter = new THREE.Vector3().addVectors(thumbTip.position, indexTip.position).multiplyScalar(0.5);
                    hModel.pinchAura.position.copy(pinchCenter);

                    if (pinchDist < 0.022 && !hModel.isPinching) {
                        hModel.isPinching = true;
                        onHandPinchTrigger(i, true);
                    } else if (pinchDist > 0.032 && hModel.isPinching) {
                        hModel.isPinching = false;
                        onHandPinchTrigger(i, false);
                    }

                    if (hModel.isPinching) {
                        hModel.pinchAura.visible = true;
                        hModel.pinchAura.scale.setScalar(1.2 + Math.sin(timestamp * 0.02) * 0.25);
                        hModel.pinchAura.material.opacity = 0.92;
                    } else {
                        hModel.pinchAura.visible = false;
                    }
                }

                // 指尖射线与 HUD 碰撞检测
                const indexIntermediate = hand.joints['index-finger-phalanx-intermediate'];
                if (indexTip && indexTip.visible && indexIntermediate && indexIntermediate.visible) {
                    const rayDir = new THREE.Vector3().subVectors(indexTip.position, indexIntermediate.position).normalize();
                    hModel.handRayLine.position.copy(indexTip.position);
                    hModel.handRayLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), rayDir);
                    hModel.handRayLine.visible = state.menuVisible;

                    if (state.menuVisible && hudMesh && hudMesh.visible) {
                        handRaycaster.set(indexTip.position, rayDir);
                        const intersects = handRaycaster.intersectObject(hudMesh);
                        if (intersects.length > 0) {
                            const hit = intersects[0];
                            const uv = hit.uv;
                            const canvasX = uv.x * hudCanvas.width;
                            const canvasY = (1 - uv.y) * hudCanvas.height;

                            for (const btn of hudButtons) {
                                if (canvasX >= btn.x && canvasX <= btn.x + btn.w &&
                                    canvasY >= btn.y && canvasY <= btn.y + btn.h) {
                                    handHoveredBtn = btn.id;
                                    handHitPoint = hit.point;
                                    break;
                                }
                            }
                        }
                    }
                }

                // 流光光带跟随特效更新
                const trail = handTrails[i];
                if (indexTip && indexTip.visible) {
                    const pIndex = indexTip.position.clone();
                    const pinkyTip = hand.joints['pinky-finger-tip'];
                    const pPinky = (pinkyTip && pinkyTip.visible)
                        ? pinkyTip.position.clone()
                        : pIndex.clone().add(new THREE.Vector3(0.04, 0, 0));

                    trail.history.unshift({ index: pIndex, pinky: pPinky });
                    if (trail.history.length > TRAIL_HISTORY_LEN) trail.history.pop();

                    const posAttr = trail.mesh.geometry.attributes.position;
                    for (let k = 0; k < trail.history.length; k++) {
                        const h = trail.history[k];
                        posAttr.setXYZ(k * 2, h.index.x, h.index.y, h.index.z);
                        posAttr.setXYZ(k * 2 + 1, h.pinky.x, h.pinky.y, h.pinky.z);
                    }
                    if (trail.history.length > 0) {
                        const lastH = trail.history[trail.history.length - 1];
                        for (let k = trail.history.length; k < TRAIL_HISTORY_LEN; k++) {
                            posAttr.setXYZ(k * 2, lastH.index.x, lastH.index.y, lastH.index.z);
                            posAttr.setXYZ(k * 2 + 1, lastH.pinky.x, lastH.pinky.y, lastH.pinky.z);
                        }
                    }
                    posAttr.needsUpdate = true;
                    trail.material.uniforms.uAudioBass.value = bass;
                    trail.material.uniforms.uTime.value = timestamp * 0.001;
                    trail.mesh.visible = true;
                }

                // 时空虚影残影分身检测与释放
                if (!hModel.lastWristPos) hModel.lastWristPos = wrist.position.clone();
                const speed = wrist.position.distanceTo(hModel.lastWristPos) * 60.0;
                hModel.lastWristPos.copy(wrist.position);

                const nowTime = performance.now();
                if (speed > 0.20 && (nowTime - (hModel.lastGhostTime || 0)) > 60) {
                    hModel.lastGhostTime = nowTime;
                    const ghosts = handGhosts[i];
                    const freeGhost = ghosts.find(g => !g.active) || ghosts[0];
                    freeGhost.active = true;
                    freeGhost.life = freeGhost.maxLife;
                    freeGhost.group.position.copy(wrist.position);
                    freeGhost.group.scale.set(1.0, 1.0, 1.0);
                    freeGhost.material.opacity = 0.65;
                    freeGhost.group.visible = true;

                    const snapJoints = [
                        'thumb-tip', 'thumb-phalanx-proximal',
                        'index-finger-tip', 'index-finger-phalanx-proximal',
                        'middle-finger-tip', 'middle-finger-phalanx-proximal',
                        'ring-finger-tip', 'ring-finger-phalanx-proximal',
                        'pinky-finger-tip', 'pinky-finger-phalanx-proximal'
                    ];
                    snapJoints.forEach((jName, idx) => {
                        if (idx < freeGhost.joints.length && hand.joints[jName] && hand.joints[jName].visible) {
                            freeGhost.joints[idx].position.subVectors(hand.joints[jName].position, wrist.position);
                            freeGhost.joints[idx].visible = true;
                        }
                    });
                }
            } else {
                hModel.active = false;
                Object.values(hModel.jointMeshes).forEach(m => m.visible = false);
                hModel.boneMeshes.forEach(b => b.mesh.visible = false);
                if (hModel.pinchAura) hModel.pinchAura.visible = false;
                if (hModel.handRayLine) hModel.handRayLine.visible = false;
                if (handTrails[i] && handTrails[i].mesh) handTrails[i].mesh.visible = false;
            }

            // 更新手部正在消散的残影分身
            const ghosts = handGhosts[i];
            if (ghosts) {
                ghosts.forEach(g => {
                    if (g.active) {
                        g.life -= 0.016;
                        if (g.life <= 0) {
                            g.active = false;
                            g.group.visible = false;
                        } else {
                            const progress = 1.0 - (g.life / g.maxLife);
                            g.material.opacity = (1.0 - progress) * 0.6;
                            g.group.scale.setScalar(1.0 + progress * 0.12);
                        }
                    }
                });
            }
        }

        // 光爆环消散动效
        if (handPinchBurstMesh && handPinchBurstMesh.visible) {
            handPinchBurstMesh.scale.addScalar(0.08);
            handPinchBurstMesh.material.opacity -= 0.06;
            if (handPinchBurstMesh.material.opacity <= 0.01) {
                handPinchBurstMesh.visible = false;
            }
        }

        return {
            anyActive: anyHandActive,
            hoveredBtn: handHoveredBtn,
            hitPoint: handHitPoint
        };
    }

    function cleanUpHands() {
        handModels.forEach(hm => {
            hm.active = false;
            hm.isPinching = false;
            if (hm.pinchAura) hm.pinchAura.visible = false;
            if (hm.handRayLine) hm.handRayLine.visible = false;
            Object.values(hm.jointMeshes).forEach(m => m.visible = false);
            hm.boneMeshes.forEach(b => b.mesh.visible = false);
        });
        handTrails.forEach(t => {
            t.history = [];
            if (t.mesh) t.mesh.visible = false;
        });
        handGhosts.forEach(ghosts => {
            ghosts.forEach(g => {
                g.active = false;
                if (g.group) g.group.visible = false;
            });
        });
        if (handPinchBurstMesh) handPinchBurstMesh.visible = false;
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
            if (screenMesh) screenMesh.visible = false;
            if (panoramicMesh) panoramicMesh.visible = true;
            if (tunnelMeshScreen) tunnelMeshScreen.visible = false;
            if (tunnelMeshPano) tunnelMeshPano.visible = vrStereoEnabled;
        } else {
            state.displayMode = 'curved_screen';
            if (screenMesh) screenMesh.visible = true;
            if (panoramicMesh) panoramicMesh.visible = false;
            if (tunnelMeshScreen) tunnelMeshScreen.visible = vrStereoEnabled;
            if (tunnelMeshPano) tunnelMeshPano.visible = false;
        }
        drawHUD();
    }

    // 每帧交互轮询：射线检测、手柄按键与摇杆盲操、裸手追踪与特效
    function updateXRFrame(timestamp = performance.now(), bass = 0.0) {
        if (!xrSession) return;

        // 0. 更新裸手追踪、Shader手部模型、捏合识别、流光残影与分身虚影
        const handResult = updateHandTracking(timestamp, bass);

        let anyHover = null;
        let hitPoint = null;

        if (handResult.anyActive) {
            // 裸手处于激活状态：隐藏控制器握把与射线
            for (let i = 0; i < controllerGrips.length; i++) {
                if (controllerGrips[i]) controllerGrips[i].visible = false;
                if (controllerRays[i]) controllerRays[i].visible = false;
            }
            if (handResult.hoveredBtn) {
                anyHover = handResult.hoveredBtn;
                hitPoint = handResult.hitPoint;
            }
        } else {
            // 裸手未激活时：恢复手柄实体与射线
            for (let i = 0; i < controllerGrips.length; i++) {
                if (controllerGrips[i]) controllerGrips[i].visible = true;
                if (controllerRays[i]) controllerRays[i].visible = state.menuVisible;
            }

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

            // 2. 控制器射线拾取 HUD 按钮
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

        // 2. 方案 B: 提取音频能量更新立体位移着色器
        let bass = 0.0;
        if (state.bridge && typeof state.bridge.getAudioBassEnergy === 'function') {
            try {
                bass = state.bridge.getAudioBassEnergy();
            } catch (e) {}
        }

        const stereoActive = vrStereoEnabled ? 1.0 : 0.0;
        if (screenMesh && screenMesh.material && screenMesh.material.uniforms) {
            screenMesh.material.uniforms.uAudioBass.value = bass;
            screenMesh.material.uniforms.uStereoOn.value = stereoActive;
        }
        if (panoramicMesh && panoramicMesh.material && panoramicMesh.material.uniforms) {
            panoramicMesh.material.uniforms.uAudioBass.value = bass;
            panoramicMesh.material.uniforms.uStereoOn.value = stereoActive;
        }

        // 3. 方案 C: 历史帧时空隧道分层 (每 4 帧抽样一次到 512x512 隧道画布，零额外 TBDR 开销)
        if (vrStereoEnabled) {
            frameCounter++;
            if (frameCounter % 4 === 0 && tunnelCanvas && tunnelCtx && tunnelTexture) {
                const sourceCanvas = document.getElementById('butterchurn-canvas');
                if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
                    try {
                        tunnelCtx.drawImage(sourceCanvas, 0, 0, tunnelCanvas.width, tunnelCanvas.height);
                        tunnelTexture.needsUpdate = true;
                    } catch (e) {}
                }
            }
            if (tunnelMeshScreen) tunnelMeshScreen.visible = (state.displayMode === 'curved_screen');
            if (tunnelMeshPano) tunnelMeshPano.visible = (state.displayMode === 'panoramic_360');
        } else {
            if (tunnelMeshScreen) tunnelMeshScreen.visible = false;
            if (tunnelMeshPano) tunnelMeshPano.visible = false;
        }

        // 4. 轮询手柄、裸手与交互
        updateXRFrame(timestamp, bass);

        // 5. 提交立体双目渲染
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

        cleanUpHands();

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
        },
        toggleVRStereo,
        setVRStereoEnabled,
        getVRStereoEnabled: () => vrStereoEnabled,
        cyclePlatformSize,
        setPlatformSize,
        getPlatformSize: () => platformState.size
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            checkXRSupport().catch(() => undefined);
        });
    }
})();
