/**
 * Dreamy Voyage - WebXR VR Manager
 * 专门适配 Meta Quest 2 / Quest 3 / Quest Pro (Meta Quest Browser)
 *
 * 2026-10 重构要点：
 * 1. 全景投影改为 vr_pano.js：隧道球 (默认) / 穹顶镜湖 / 改良柱面，背后不再有竖向接缝。
 * 2. 共享 GL 上下文：Three.js 直接复用 Butterchurn 的 WebGL2 上下文，Butterchurn 每帧输出到
 *    一张 FBO 纹理供全景球直接采样，去掉了每帧整张画面的跨上下文拷贝 (失败时自动回退兼容模式)。
 * 3. 时空回响层 (echo) 改为 GPU 内部拷贝，并合并进全景着色器，不再多画一层全屏球。
 * 4. 裸手：vr_gestures.js (One Euro 滤波 + 归一化迟滞阈值 + 肩部指向射线) 与
 *    vr_handfx.js (5 种手部外观 + 捏合/张掌/握拳/推掌/挥击/拍手/拉弦特效)。
 * 5. 菜单固定在空间中：空捏不再开关或挪动菜单；掌心朝向自己捏住 0.6 秒唤出 / 收起。
 *    按钮点击 = 在同一按钮上捏下并松开。
 * 6. 菜单新增：投影切换、性能面板、注视点渲染 (默认关闭)。
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
        pressedButtonId: null, // 裸手捏住未松开的按钮
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

    // 裸手追踪：手势引擎 (vr_gestures.js) + 手部外观与手势特效 (vr_handfx.js)
    const HAND_FX_MODES = (window.DVHandFx && window.DVHandFx.STYLES) || [
        { id: 'constellation', nameEn: 'Holo Constellation', nameZh: '全息星座', icon: '✨' }
    ];
    const DEFAULT_HAND_FX = 'constellation';

    let currentHandFx = (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_hand_fx')) || DEFAULT_HAND_FX;
    if (!HAND_FX_MODES.some(m => m.id === currentHandFx)) {
        currentHandFx = DEFAULT_HAND_FX;
    }

    let hands = [];
    let handTracker = null;
    let handFx = null;
    let handRaycaster = null;
    let handPointerLines = [];
    const handPress = [null, null]; // 每只手当前按住的按钮 {btnId, t0}
    const handInputs = [{ joints: null }, { joints: null }];
    let lastXRTime = 0;

    // 全景投影 / 性能面板 / 注视点渲染
    // 默认恢复经典柱面；存储键升级为 v2，让之前选过的隧道/穹顶回到经典画面
    const PROJECTIONS = (window.DVPano && window.DVPano.PROJECTIONS) || [{ id: 'classic', nameZh: '经典柱面', nameEn: 'Classic Cylinder', icon: '🎞️', aspect: 2 }];
    const PROJECTION_KEY = 'dv_vr_projection_v2';
    let currentProjection = (typeof localStorage !== 'undefined' && localStorage.getItem(PROJECTION_KEY)) || 'classic';
    if (!PROJECTIONS.some(p => p.id === currentProjection)) currentProjection = 'classic';
    let panoYaw = 0;
    let skyFlash = 0;

    const FOVEATION_LEVELS = [
        { value: 0, labelZh: '关 (满画质)', labelEn: 'Off (Full)' },
        { value: 0.33, labelZh: '低', labelEn: 'Low' },
        { value: 0.66, labelZh: '中', labelEn: 'Medium' },
        { value: 1.0, labelZh: '高', labelEn: 'High' }
    ];
    let foveationLevel = (typeof localStorage !== 'undefined' && localStorage.getItem('dv_vr_foveation') !== null)
        ? parseFloat(localStorage.getItem('dv_vr_foveation')) : 0;
    if (isNaN(foveationLevel)) foveationLevel = 0;

    let perfVisible = false;
    let perfMesh = null;
    let perfCanvas = null;
    let perfCtx = null;
    let perfTexture = null;
    const perfStats = { frameMs: 13.9, jsMs: 0, bcMs: 0, calls: 0, tris: 0, lastDraw: 0 };

    // 共享 GL 上下文 (Butterchurn 与 Three.js 同一个 WebGL2 上下文)
    let sharedGL = null; // { gl, fbo, tex, w, h, redirect }
    let usingSharedGL = false;
    let panoMaterial = null;

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

    // 方案 C: 历史帧时空回响 (Tunnel Echo)：每 4 帧在 GPU 上把当前画面缩拷到 512² 渲染目标
    let echoRT = null;
    let echoScene = null;
    let echoCam = null;
    let echoMat = null;
    let tunnelTexture = null;
    let tunnelMeshScreen = null;
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

    // ==========================================
    // 共享 GL 上下文：Three.js 复用 Butterchurn 的 WebGL2 上下文
    // ==========================================
    function wantSharedGL() {
        try {
            return localStorage.getItem('dv_vr_shared_gl') !== 'false';
        } catch (e) {
            return true;
        }
    }

    function createSharedRenderer(sourceCanvas) {
        if (typeof WebGL2RenderingContext === 'undefined') return null;
        const gl = sourceCanvas.getContext('webgl2');
        if (!gl || typeof gl.bindVertexArray !== 'function') return null;

        const proto = WebGL2RenderingContext.prototype;
        sharedGL = {
            gl, fbo: null, tex: null, w: 0, h: 0, redirect: false,
            maxUnits: Math.min(32, gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) || 16)
        };

        // Butterchurn 最终输出时会绑定默认帧缓冲 (null)；渲染期间把它重定向到我们的 FBO
        gl.bindFramebuffer = function (target, fb) {
            if (fb === null && sharedGL.redirect && sharedGL.fbo) fb = sharedGL.fbo;
            return proto.bindFramebuffer.call(gl, target, fb);
        };
        // Butterchurn 的上下文没有开 MSAA / 深度；XR 图层用自己的帧缓冲，这里让 Three 以 MSAA + 深度创建 XR 图层
        gl.getContextAttributes = function () {
            const a = proto.getContextAttributes.call(gl);
            if (!a) return a;
            return Object.assign({}, a, { antialias: true, depth: true, alpha: false, stencil: false });
        };

        const r = new THREE.WebGLRenderer({
            canvas: sourceCanvas,
            context: gl,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        // 注意：不要调用 setSize / setPixelRatio，否则会改动网页上 Butterchurn 画布的尺寸
        r.resetState();
        gl.bindVertexArray(null);
        return r;
    }

    function ensureSharedTarget(w, h) {
        const s = sharedGL;
        const gl = s.gl;
        if (s.tex && s.w === w && s.h === h) return;
        const proto = WebGL2RenderingContext.prototype;
        if (s.tex) gl.deleteTexture(s.tex);
        if (s.fbo) gl.deleteFramebuffer(s.fbo);
        s.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, s.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        s.fbo = gl.createFramebuffer();
        proto.bindFramebuffer.call(gl, gl.FRAMEBUFFER, s.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, s.tex, 0);
        proto.bindFramebuffer.call(gl, gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        s.w = w;
        s.h = h;
        // 直接把这张 GL 纹理交给 Three 的纹理对象 (version 保持 0，Three 不会再上传)
        const props = renderer.properties.get(visualizerTexture);
        props.__webglTexture = s.tex;
        props.__webglInit = true;
        console.log(`[VRManager] 共享 GL 输出纹理: ${w}x${h}`);
    }

    // 在共享上下文中渲染一帧 Butterchurn 到 FBO，之后恢复 Three 的 GL 状态
    function renderButterchurnShared(xrFramebuffer) {
        const gl = sharedGL.gl;
        const size = state.bridge.getVisualizerSize ? state.bridge.getVisualizerSize() : null;
        if (!size || !size.w || !size.h) return false;
        renderer.resetState();
        gl.bindVertexArray(null);
        ensureSharedTarget(size.w, size.h);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        sharedGL.redirect = true;
        try {
            state.bridge.renderButterchurnFrame();
        } finally {
            sharedGL.redirect = false;
            // Butterchurn 会在纹理单元 0-4、12 上残留 WebGL2 采样器对象 (mipmap 过滤)，
            // 不解绑的话 Three 采样这些单元上的无 mipmap 纹理会得到全黑
            for (let u = 0; u < sharedGL.maxUnits; u++) gl.bindSampler(u, null);
            gl.bindVertexArray(null);
            renderer.resetState();
            if (xrFramebuffer) renderer.state.bindXRFramebuffer(xrFramebuffer);
        }
        return true;
    }

    // 时空回响：GPU 内部把当前画面缩拷到 512² 渲染目标
    function updateEcho() {
        if (!echoRT || !echoScene) return;
        const xrWas = renderer.xr.enabled;
        renderer.xr.enabled = false;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(echoRT);
        renderer.render(echoScene, echoCam);
        renderer.setRenderTarget(prev);
        renderer.xr.enabled = xrWas;
    }

    // 初始化 Three.js 空间与 WebXR 渲染器
    function initThreeScene() {
        if (scene && renderer) return;

        // 1. 场景
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x010206);

        // 2. 相机 (WebXR 启动后由头部追踪驱动)
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);
        camera.position.set(0, 1.6, 0);

        const sourceCanvas = document.getElementById('butterchurn-canvas');
        if (!sourceCanvas) {
            console.error('[VRManager] 未找到 #butterchurn-canvas 视觉画布');
            return;
        }

        // 3. WebGL 渲染器：优先共享 Butterchurn 的上下文，失败则回退到独立画布 (兼容模式)
        usingSharedGL = false;
        if (wantSharedGL()) {
            try {
                renderer = createSharedRenderer(sourceCanvas);
                usingSharedGL = !!renderer;
            } catch (e) {
                console.warn('[VRManager] 共享 GL 上下文初始化失败，回退兼容模式:', e);
                renderer = null;
                usingSharedGL = false;
            }
        }
        if (!renderer) {
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
        }
        renderer.xr.enabled = true;
        console.log(`[VRManager] 渲染管线: ${usingSharedGL ? '共享 GL 上下文 (零拷贝)' : '兼容模式 (CanvasTexture 拷贝)'}`);

        // 4. Butterchurn 画面纹理
        if (usingSharedGL) {
            visualizerTexture = new THREE.Texture();
        } else {
            visualizerTexture = new THREE.CanvasTexture(sourceCanvas);
            visualizerTexture.format = THREE.RGBAFormat;
        }
        visualizerTexture.wrapS = THREE.ClampToEdgeWrapping;
        visualizerTexture.wrapT = THREE.ClampToEdgeWrapping;
        visualizerTexture.minFilter = THREE.LinearFilter;
        visualizerTexture.magFilter = THREE.LinearFilter;
        visualizerTexture.generateMipmaps = false;

        // 5. 时空回响渲染目标
        echoRT = new THREE.WebGLRenderTarget(512, 512, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        });
        echoRT.texture.generateMipmaps = false;
        tunnelTexture = echoRT.texture;
        echoScene = new THREE.Scene();
        echoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        echoMat = new THREE.MeshBasicMaterial({ map: visualizerTexture, depthTest: false, depthWrite: false });
        echoScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), echoMat));

        // 6. 场景构件
        buildScreenAndDome();
        buildEnvironment();
        buildFloatingHUD();
        buildPerfPanel();
        setupControllers();
        setupHands();

        raycaster = new THREE.Raycaster();

        if (usingSharedGL) {
            renderer.resetState();
            sharedGL.gl.bindVertexArray(null);
        }
    }

    // 构建 IMAX 微曲立体巨幕 (Plan B) 与 360° 全景球 (vr_pano.js)
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

        const tunnelMat = new THREE.MeshBasicMaterial({
            map: tunnelTexture,
            transparent: true,
            opacity: 0.38,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // --- IMAX 微曲立体巨幕：距离 4.2 米，高 5.2 米，弧角约 148° ---
        const radius = 4.2;
        const height = 5.2;
        const arcAngle = Math.PI * 0.82;
        const thetaStart = Math.PI - arcAngle / 2;

        const cylinderGeom = new THREE.CylinderGeometry(
            radius, radius, height, 128, 64, true, thetaStart, arcAngle
        );
        screenMesh = new THREE.Mesh(cylinderGeom, screenShaderMat);
        screenMesh.scale.set(-1, 1, 1);
        screenMesh.position.set(0, 1.6, 0);
        screenMesh.visible = (state.displayMode === 'curved_screen');
        scene.add(screenMesh);

        // --- 巨幕时空隧道外层壳 (半径 5.6m，叠加历史帧) ---
        const tunnelCylinderGeom = new THREE.CylinderGeometry(
            5.6, 5.6, 6.9, 64, 16, true, thetaStart, arcAngle
        );
        tunnelMeshScreen = new THREE.Mesh(tunnelCylinderGeom, tunnelMat);
        tunnelMeshScreen.scale.set(-1, 1, 1);
        tunnelMeshScreen.position.set(0, 1.6, 0);
        tunnelMeshScreen.visible = vrStereoEnabled && (state.displayMode === 'curved_screen');
        scene.add(tunnelMeshScreen);

        // --- 360° 全景球：投影 / 涟漪 / 回响全部在 vr_pano.js 的单个着色器内完成 ---
        panoMaterial = window.DVPano.createMaterial(THREE, { texture: visualizerTexture, echoTexture: tunnelTexture });
        window.DVPano.setProjection(panoMaterial, currentProjection);
        window.DVPano.setTunnelYaw(panoMaterial, panoYaw);
        panoMaterial.uniforms.uStereoOn.value = vrStereoEnabled ? 1.0 : 0.0;
        panoMaterial.uniforms.uEchoAmt.value = vrStereoEnabled ? 0.38 : 0.0;

        const panoGeom = new THREE.SphereGeometry(22, 96, 48);
        panoramicMesh = new THREE.Mesh(panoGeom, panoMaterial);
        panoramicMesh.position.set(0, 1.6, 0);
        panoramicMesh.renderOrder = -10;
        panoramicMesh.frustumCulled = false;
        panoramicMesh.visible = (state.displayMode === 'panoramic_360');
        scene.add(panoramicMesh);
    }

    // ==========================================
    // 性能面板 (懒跟随头部，每 0.4 秒刷新一次)
    // ==========================================
    function buildPerfPanel() {
        perfCanvas = document.createElement('canvas');
        perfCanvas.width = 512;
        perfCanvas.height = 224;
        perfCtx = perfCanvas.getContext('2d');
        perfTexture = new THREE.CanvasTexture(perfCanvas);
        perfTexture.minFilter = THREE.LinearFilter;
        perfTexture.generateMipmaps = false;
        perfMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.42, 0.18375),
            new THREE.MeshBasicMaterial({ map: perfTexture, transparent: true, depthTest: false, depthWrite: false })
        );
        perfMesh.renderOrder = 100;
        perfMesh.visible = false;
        scene.add(perfMesh);
    }

    const _perfTmp = new THREE.Vector3();
    function updatePerfPanel(now) {
        if (!perfMesh) return;
        perfMesh.visible = perfVisible;
        if (!perfVisible) return;
        const fwd = _perfTmp.set(0, 0, -1).applyQuaternion(camera.quaternion);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
        fwd.normalize();
        // 视野左下方 (避开正前方的菜单)
        const tx = camera.position.x + fwd.x * 0.85 + fwd.z * 0.45;
        const ty = camera.position.y - 0.42;
        const tz = camera.position.z + fwd.z * 0.85 - fwd.x * 0.45;
        perfMesh.position.x += (tx - perfMesh.position.x) * 0.06;
        perfMesh.position.y += (ty - perfMesh.position.y) * 0.06;
        perfMesh.position.z += (tz - perfMesh.position.z) * 0.06;
        perfMesh.lookAt(camera.position);

        if (now - perfStats.lastDraw < 400) return;
        perfStats.lastDraw = now;
        const ctx = perfCtx;
        const w = perfCanvas.width, h = perfCanvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(4, 8, 18, 0.82)';
        roundRect(ctx, 4, 4, w - 8, h - 8, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const fps = 1000 / Math.max(1, perfStats.frameMs);
        ctx.font = '800 30px "Orbitron", monospace';
        ctx.fillStyle = fps >= 68 ? '#a3e635' : (fps >= 55 ? '#fbbf24' : '#f87171');
        ctx.textAlign = 'left';
        ctx.fillText(`${fps.toFixed(1)} FPS · ${perfStats.frameMs.toFixed(1)} ms`, 22, 46);
        ctx.font = '600 20px "Orbitron", monospace';
        ctx.fillStyle = '#e0f2fe';
        ctx.fillText(`JS ${perfStats.jsMs.toFixed(2)} ms · Butterchurn ${perfStats.bcMs.toFixed(2)} ms`, 22, 84);
        ctx.fillText(`Draw calls ${perfStats.calls} · Tris ${(perfStats.tris / 1000).toFixed(1)}k`, 22, 114);
        const size = state.bridge && state.bridge.getVisualizerSize ? state.bridge.getVisualizerSize() : null;
        const proj = PROJECTIONS.find(p => p.id === currentProjection) || PROJECTIONS[0];
        ctx.fillStyle = '#a5f3fc';
        ctx.font = '600 17px "Orbitron", monospace';
        ctx.fillText(`${usingSharedGL ? 'GL: Shared (zero-copy)' : 'GL: Compat (copy)'} · BC ${size ? size.w + '×' + size.h : '-'}`, 22, 150);
        ctx.fillText(`${proj.nameEn} · Foveation ${foveationLevel}`, 22, 182);
        perfTexture.needsUpdate = true;
    }

    function togglePerfPanel() {
        perfVisible = !perfVisible;
        perfStats.lastDraw = 0;
        drawHUD();
    }

    function applyFoveation() {
        try {
            const bl = xrSession && xrSession.renderState && xrSession.renderState.baseLayer;
            if (bl && ('fixedFoveation' in bl)) bl.fixedFoveation = foveationLevel;
        } catch (e) {}
    }

    function cycleFoveation() {
        let idx = FOVEATION_LEVELS.findIndex(f => Math.abs(f.value - foveationLevel) < 0.05);
        idx = (idx + 1) % FOVEATION_LEVELS.length;
        foveationLevel = FOVEATION_LEVELS[idx].value;
        try { localStorage.setItem('dv_vr_foveation', String(foveationLevel)); } catch (e) {}
        applyFoveation();
        drawHUD();
    }

    // ==========================================
    // 全景投影切换
    // ==========================================
    function getDesiredVisualizerSize() {
        if (state.displayMode === 'curved_screen') return { w: 2048, h: 1024 };
        const p = PROJECTIONS.find(x => x.id === currentProjection) || PROJECTIONS[0];
        return p.aspect === 2 ? { w: 2048, h: 1024 } : { w: 1536, h: 1536 };
    }

    function requestVisualizerResize() {
        if (state.isVRActive && state.bridge && typeof state.bridge.resizeVisualizer === 'function') {
            try { state.bridge.resizeVisualizer(); } catch (e) {}
        }
    }

    function setProjectionMode(id) {
        if (!PROJECTIONS.some(p => p.id === id)) return;
        const before = getDesiredVisualizerSize();
        currentProjection = id;
        try { localStorage.setItem(PROJECTION_KEY, id); } catch (e) {}
        if (panoMaterial) window.DVPano.setProjection(panoMaterial, id);
        const after = getDesiredVisualizerSize();
        if (before.w !== after.w || before.h !== after.h) requestVisualizerResize();
        drawHUD();
    }

    function cycleProjection() {
        const idx = PROJECTIONS.findIndex(p => p.id === currentProjection);
        setProjectionMode(PROJECTIONS[(idx + 1) % PROJECTIONS.length].id);
    }

    // 重新对准：菜单回到正前方，隧道中心也对准当前朝向
    function recenterView() {
        recenterHUD();
        if (!camera) return;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        panoYaw = Math.atan2(-fwd.x, -fwd.z);
        if (panoMaterial) window.DVPano.setTunnelYaw(panoMaterial, panoYaw);
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
        if (panoMaterial) {
            panoMaterial.uniforms.uEchoAmt.value = vrStereoEnabled ? 0.38 : 0.0;
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
            ctx.fillText(isZh ? '💡 指向曲目捏合再松开 (或扣动扳机) 即可切歌 · 掌心朝向自己捏住 0.6 秒收起菜单' : '💡 Point & pinch-release (or Trigger) to play · Palm toward you + hold pinch to hide', w / 2, 665);
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
            const projBadge = PROJECTIONS.find(p => p.id === currentProjection) || PROJECTIONS[0];
            const modeText = state.displayMode === 'curved_screen' ? 'IMAX 148° SCREEN' : ('360° ' + projBadge.nameEn.toUpperCase());
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
                        recenterView();
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

            // 第五行控制按钮：退出 VR、裸手5大光效切换 与 隐藏菜单
            const currentHandFxObj = HAND_FX_MODES.find(m => m.id === currentHandFx) || HAND_FX_MODES[0];
            hudButtons.push(
                {
                    id: 'btn-exit-vr',
                    x: 60, y: 505, w: 270, h: 68,
                    isDanger: true,
                    icon: '🚪', labelEn: 'Exit VR', labelZh: '退出 VR',
                    onClick: () => {
                        exitVR();
                    }
                },
                {
                    id: 'btn-cycle-hand-fx',
                    x: 345, y: 505, w: 375, h: 68,
                    icon: currentHandFxObj.icon,
                    labelEn: `Hand FX: ${currentHandFxObj.nameEn}`,
                    labelZh: `裸手光效: ${currentHandFxObj.nameZh}`,
                    isHandFx: true,
                    onClick: () => {
                        cycleHandFx();
                    }
                },
                {
                    id: 'btn-hide-hud',
                    x: 735, y: 505, w: 285, h: 68,
                    isOutline: true,
                    icon: '✕', labelEn: 'Hide Menu', labelZh: '隐藏菜单 (纯享)',
                    onClick: () => {
                        hideMenu();
                    }
                }
            );

            // 第六行：全景投影 / 性能面板 / 注视点渲染
            const projObj = PROJECTIONS.find(p => p.id === currentProjection) || PROJECTIONS[0];
            const fovObj = FOVEATION_LEVELS.reduce((a, b) => (Math.abs(b.value - foveationLevel) < Math.abs(a.value - foveationLevel) ? b : a));
            hudButtons.push(
                {
                    id: 'btn-cycle-projection',
                    x: 60, y: 585, w: 310, h: 60,
                    icon: projObj.icon,
                    labelEn: `Projection: ${projObj.nameEn}`,
                    labelZh: `全景投影: ${projObj.nameZh}`,
                    accent: '#38bdf8',
                    onClick: () => {
                        cycleProjection();
                    }
                },
                {
                    id: 'btn-toggle-perf',
                    x: 385, y: 585, w: 310, h: 60,
                    icon: '📊',
                    labelEn: perfVisible ? 'Perf Panel: On' : 'Perf Panel: Off',
                    labelZh: perfVisible ? '性能面板: 开' : '性能面板: 关',
                    accent: '#a3e635',
                    onClick: () => {
                        togglePerfPanel();
                    }
                },
                {
                    id: 'btn-cycle-foveation',
                    x: 710, y: 585, w: 310, h: 60,
                    icon: '👁',
                    labelEn: `Foveation: ${fovObj.labelEn}`,
                    labelZh: `注视点渲染: ${fovObj.labelZh}`,
                    accent: '#fbbf24',
                    onClick: () => {
                        cycleFoveation();
                    }
                }
            );

            // 底部操作提示
            ctx.save();
            ctx.font = '500 14px "Orbitron", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'center';
            const hintText = isZh
                ? '✋ 掌心朝向自己捏住 0.6 秒 唤出/收起菜单 · 指向按钮捏合再松开 = 点击 · 手柄: 扳机点击 / A·X 开关菜单'
                : '✋ Palm toward you + hold pinch 0.6s: menu · Point & pinch-release: click · Controller: Trigger / A·X';
            ctx.fillText(hintText, w / 2, 670);
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
            } else if (state.pressedButtonId === btn.id) {
                // 裸手捏住中 (松开即点击)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
                ctx.fill();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#ffffff';
                ctx.shadowColor = '#7dd3fc';
                ctx.shadowBlur = 26;
                ctx.stroke();
            } else if (isHover) {
                // 悬停高亮发光
                ctx.fillStyle = btn.isDanger ? 'rgba(239, 68, 68, 0.45)' : (btn.isHandFx ? 'rgba(192, 132, 252, 0.45)' : 'rgba(56, 189, 248, 0.38)');
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = btn.isDanger ? '#ef4444' : (btn.isHandFx ? '#c084fc' : '#38bdf8');
                ctx.shadowColor = btn.isDanger ? '#ef4444' : (btn.isHandFx ? '#c084fc' : '#38bdf8');
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
            } else if (btn.isHandFx) {
                // 裸手光效专属渐变发光底板
                const fxGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y + btn.h);
                fxGrad.addColorStop(0, '#00f2fe');
                fxGrad.addColorStop(0.5, '#c084fc');
                fxGrad.addColorStop(1, '#f472b6');
                ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
                ctx.fill();
                ctx.lineWidth = 2.0;
                ctx.strokeStyle = fxGrad;
                ctx.shadowColor = '#c084fc';
                ctx.shadowBlur = 8;
                ctx.stroke();
            } else if (btn.accent) {
                // 第六行功能按钮 (自带强调色)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
                ctx.fill();
                ctx.lineWidth = 1.8;
                ctx.strokeStyle = btn.accent;
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
                } else if (btn.isHandFx) {
                    ctx.font = '700 16px "Orbitron", -apple-system, sans-serif';
                    ctx.fillStyle = isHover ? '#ffffff' : '#f5d0fe';
                    ctx.fillText(`${btn.icon || ''} ${labelText || ''}`, centerX, centerY);
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
            // 注意：裸手捏合也会触发系统级 select 事件 —— 来自手的事件一律忽略，裸手交互只走手势引擎
            controller.addEventListener('selectstart', (e) => {
                if (e && e.data && e.data.hand) return;
                onControllerSelect(controller, i);
            });
            controller.addEventListener('squeezestart', (e) => {
                if (e && e.data && e.data.hand) return;
                recenterHUD();
            });
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
    // 裸手追踪：手势引擎 (vr_gestures.js) + 手部特效 (vr_handfx.js) + 菜单指向交互
    // ==========================================
    function setupHands() {
        handRaycaster = new THREE.Raycaster();

        for (let i = 0; i < 2; i++) {
            const hand = renderer.xr.getHand(i);
            hand.userData.handedness = null;
            hand.addEventListener('connected', (event) => {
                hand.userData.handedness = (event.data && event.data.handedness) || null;
            });
            hand.addEventListener('disconnected', () => {
                hand.userData.handedness = null;
            });
            scene.add(hand);
            hands.push(hand);

            // 菜单指向射线 (仅菜单打开且手掌不朝向自己时显示)
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
            g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.6, 0.95, 1.0, 0.05, 0.25, 0.4]), 3).setUsage(THREE.DynamicDrawUsage));
            const line = new THREE.Line(g, new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            line.frustumCulled = false;
            line.visible = false;
            line.renderOrder = 30;
            scene.add(line);
            handPointerLines.push(line);
        }

        if (!window.DVGestures || !window.DVHandFx) {
            console.warn('[VRManager] 手势模块未加载 (vr_gestures.js / vr_handfx.js)');
            return;
        }
        handTracker = new window.DVGestures.HandTracker(THREE);
        handFx = new window.DVHandFx.HandFX(THREE, scene, {
            panoUniforms: panoMaterial ? panoMaterial.uniforms : null,
            onSkyRipple: (dir, color, strength) => {
                if (panoMaterial && state.displayMode === 'panoramic_360') {
                    window.DVPano.addRipple(panoMaterial, dir, color, strength, panoMaterial.uniforms.uTime.value);
                }
            },
            onFlash: (amount) => {
                skyFlash = Math.max(skyFlash, amount);
            }
        });
        handFx.setStyle(currentHandFx);
    }

    function cycleHandFx() {
        const idx = HAND_FX_MODES.findIndex(m => m.id === currentHandFx);
        setHandFxMode(HAND_FX_MODES[(idx + 1) % HAND_FX_MODES.length].id);
    }

    function setHandFxMode(modeId) {
        if (!HAND_FX_MODES.some(m => m.id === modeId)) modeId = DEFAULT_HAND_FX;
        currentHandFx = modeId;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem('dv_vr_hand_fx', currentHandFx);
        } catch (e) {}
        if (handFx) handFx.setStyle(currentHandFx);
        drawHUD();
    }

    // 把 Three 的手部关节按左右手整理成手势引擎的输入
    function gatherHandInputs() {
        handInputs[0].joints = null;
        handInputs[1].joints = null;
        for (let i = 0; i < hands.length; i++) {
            const hand = hands[i];
            if (!hand || !hand.joints) continue;
            const wrist = hand.joints['wrist'];
            if (!wrist || !wrist.visible) continue;
            const hd = hand.userData.handedness;
            const idx = hd === 'left' ? 0 : (hd === 'right' ? 1 : i);
            handInputs[idx].joints = hand.joints;
        }
    }

    // 指向 HUD 的命中测试；stickyId 对应的按钮判定区域外扩 (防止在按钮边缘抖出抖进)
    function hitTestHUD(origin, dir, stickyId) {
        if (!hudMesh || !hudMesh.visible) return null;
        handRaycaster.set(origin, dir);
        const hits = handRaycaster.intersectObject(hudMesh);
        if (!hits.length) return null;
        const hit = hits[0];
        const cx = hit.uv.x * hudCanvas.width;
        const cy = (1 - hit.uv.y) * hudCanvas.height;
        let found = null;
        if (stickyId) {
            const sb = hudButtons.find(b => b.id === stickyId);
            const m = 20;
            if (sb && cx >= sb.x - m && cx <= sb.x + sb.w + m && cy >= sb.y - m && cy <= sb.y + sb.h + m) found = sb.id;
        }
        if (!found) {
            for (const btn of hudButtons) {
                if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
                    found = btn.id;
                    break;
                }
            }
        }
        return { btnId: found, point: hit.point };
    }

    function refreshPressedState() {
        const p = handPress[0] || handPress[1];
        const id = p ? p.btnId : null;
        if (state.pressedButtonId !== id) {
            state.pressedButtonId = id;
            drawHUD();
        }
    }

    function onGestureEvent(ev, t) {
        switch (ev.type) {
            case 'summon': {
                // 掌心朝向自己捏住 0.6 秒：唤出 / 收起菜单
                if (state.menuVisible) hideMenu();
                else showMenu();
                break;
            }
            case 'pinchStart': {
                if (ev.summonCandidate || !state.menuVisible) break;
                const hs = handTracker.hands[ev.hand];
                if (!hs.aimValid || hs.palmFacing >= 0.35) break;
                // 用约 90ms 前的射线方向判定按下目标 (捏合时手会带动射线)
                const hit = hitTestHUD(hs.aimOrigin, ev.aimDir || hs.aimDir, state.hoveredButtonId);
                if (hit && hit.btnId) {
                    const btn = hudButtons.find(b => b.id === hit.btnId);
                    if (btn && !btn.disabled) {
                        handPress[ev.hand] = { btnId: hit.btnId, t0: t };
                        refreshPressedState();
                    }
                }
                break;
            }
            case 'pinchEnd': {
                const p = handPress[ev.hand];
                if (!p) break;
                handPress[ev.hand] = null;
                if (!ev.interrupted) {
                    const hs = handTracker.hands[ev.hand];
                    let still = false;
                    if (hs.valid && hs.aimValid) {
                        const hit = hitTestHUD(hs.aimOrigin, hs.aimDir, p.btnId);
                        still = !!(hit && hit.btnId === p.btnId);
                    }
                    // 在同一按钮上松开 (或快速点按) 才算点击
                    if (still || (t - p.t0) < 0.45) {
                        const btn = hudButtons.find(b => b.id === p.btnId);
                        if (btn && !btn.disabled && typeof btn.onClick === 'function') {
                            btn.onClick();
                        }
                    }
                }
                refreshPressedState();
                break;
            }
            default:
                break;
        }
    }

    const _lineTmp = new THREE.Vector3();
    // 每帧：手势识别 -> 菜单交互 -> 手部特效
    function updateHands(timeSec, dt, audio, viewHalfH) {
        const result = { anyActive: false, hoveredBtn: null, hitPoint: null, hitDir: null, pinchStrength: 0 };
        if (!handTracker) return result;

        gatherHandInputs();
        handTracker.beat.update(timeSec, dt, audio.levels, audio.bass);
        const events = handTracker.update(timeSec, dt, handInputs, camera.position, camera.quaternion);
        for (const ev of events) onGestureEvent(ev, timeSec);

        let pressHover = null;
        for (let h = 0; h < 2; h++) {
            const hs = handTracker.hands[h];
            const line = handPointerLines[h];
            if (!hs.valid) {
                if (line) line.visible = false;
                continue;
            }
            result.anyActive = true;
            const canPoint = state.menuVisible && hudMesh && hudMesh.visible && hs.aimValid && hs.palmFacing < 0.35 && !hs.pinchSummon;
            if (!canPoint) {
                if (line) line.visible = false;
                continue;
            }
            const sticky = handPress[h] ? handPress[h].btnId : state.hoveredButtonId;
            const hit = hitTestHUD(hs.aimOrigin, hs.aimDir, sticky);
            const end = hit ? hit.point : _lineTmp.copy(hs.aimOrigin).addScaledVector(hs.aimDir, 0.7);
            if (line) {
                const pos = line.geometry.attributes.position;
                pos.setXYZ(0, hs.aimOrigin.x, hs.aimOrigin.y, hs.aimOrigin.z);
                pos.setXYZ(1, end.x, end.y, end.z);
                pos.needsUpdate = true;
                const col = line.geometry.attributes.color;
                const k = 0.5 + hs.pinchStrength * 0.5;
                col.setXYZ(0, 0.6 * k + 0.3, 0.95 * k, 1.0 * k);
                col.needsUpdate = true;
                line.visible = true;
            }
            if (hit && hit.btnId) {
                const entry = { btn: hit.btnId, point: hit.point, dir: hs.aimDir, pinch: hs.pinchStrength };
                if (handPress[h]) pressHover = entry;
                else if (!result.hoveredBtn) {
                    result.hoveredBtn = entry.btn;
                    result.hitPoint = entry.point;
                    result.hitDir = entry.dir;
                    result.pinchStrength = entry.pinch;
                }
            }
        }
        if (pressHover) {
            result.hoveredBtn = pressHover.btn;
            result.hitPoint = pressHover.point;
            result.hitDir = pressHover.dir;
            result.pinchStrength = pressHover.pinch;
        }

        if (handFx) {
            handFx.update({
                t: timeSec,
                dt,
                camera,
                tracker: handTracker,
                bass: audio.bass,
                beatPulse: handTracker.beat.pulse,
                bands: audio.bands,
                viewHalfH
            });
        }
        return result;
    }

    function cleanUpHands() {
        if (handTracker) handTracker.reset();
        if (handFx) handFx.clear();
        handPointerLines.forEach(l => { l.visible = false; });
        handPress[0] = handPress[1] = null;
        state.pressedButtonId = null;
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
        } else {
            state.displayMode = 'curved_screen';
            if (screenMesh) screenMesh.visible = true;
            if (panoramicMesh) panoramicMesh.visible = false;
            if (tunnelMeshScreen) tunnelMeshScreen.visible = vrStereoEnabled;
        }
        // 巨幕用 2:1，全景按投影决定 (隧道/穹顶为方形)
        requestVisualizerResize();
        drawHUD();
    }

    // 每帧交互轮询：手柄按键与摇杆、射线拾取、悬停光标
    const _ctrlMatrix = new THREE.Matrix4();
    function updateXRFrame(timestamp, bass, handResult) {
        if (!xrSession) return;

        let anyHover = null;
        let hitPoint = null;
        let hitDir = null;
        let pinchStrength = 0;

        if (handResult && handResult.anyActive) {
            // 裸手处于激活状态：隐藏传统手柄实体与射线
            for (let i = 0; i < controllerGrips.length; i++) {
                if (controllerGrips[i]) controllerGrips[i].visible = false;
                if (controllerRays[i]) controllerRays[i].visible = false;
            }
            if (handResult.hoveredBtn) {
                anyHover = handResult.hoveredBtn;
                hitPoint = handResult.hitPoint;
                hitDir = handResult.hitDir;
                pinchStrength = handResult.pinchStrength;
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

                    // Button 4 (A 或 X 键) 切换菜单
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
                for (let i = 0; i < controllers.length; i++) {
                    const controller = controllers[i];
                    _ctrlMatrix.identity().extractRotation(controller.matrixWorld);

                    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_ctrlMatrix);

                    const intersects = raycaster.intersectObject(hudMesh);
                    if (intersects.length > 0) {
                        const hit = intersects[0];
                        hitPoint = hit.point;
                        hitDir = raycaster.ray.direction;
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

        // 悬停光标：随捏合力度收缩，给出“快按下了”的反馈
        if (hitPoint && reticleMesh && state.menuVisible) {
            reticleMesh.position.copy(hitPoint);
            if (hitDir) reticleMesh.position.addScaledVector(hitDir, -0.01);
            reticleMesh.lookAt(camera.position);
            const s = 1.0 - pinchStrength * 0.45;
            reticleMesh.scale.set(s, s, s);
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

    // 读取音频：低音能量 + 8 段频谱 + Butterchurn 电平
    const audioState = { bass: 0, bands: new Float32Array(8), levels: null };
    function readAudio() {
        const b = state.bridge;
        let spec = null;
        if (b && typeof b.getAudioSpectrum === 'function') {
            try { spec = b.getAudioSpectrum(); } catch (e) {}
        }
        if (spec && spec.length >= 32) {
            let s = 0;
            for (let i = 0; i < 4; i++) s += spec[i];
            audioState.bass = s / (4 * 255);
            for (let k = 0; k < 8; k++) {
                let a = 0;
                for (let j = 0; j < 4; j++) a += spec[k * 4 + j];
                audioState.bands[k] = a / (4 * 255);
            }
        } else if (b && typeof b.getAudioBassEnergy === 'function') {
            try { audioState.bass = b.getAudioBassEnergy(); } catch (e) { audioState.bass = 0; }
            audioState.bands.fill(audioState.bass);
        }
        audioState.levels = null;
        if (b && typeof b.getAudioLevels === 'function') {
            try { audioState.levels = b.getAudioLevels(); } catch (e) {}
        }
        return audioState;
    }

    let viewHalfH = 960;

    // WebXR 专属主渲染循环
    function onXRAnimationLoop(timestamp, frame) {
        if (!state.isVRActive || !renderer) return;
        const tStart = performance.now();
        const timeSec = timestamp / 1000;
        let dt = lastXRTime ? (timestamp - lastXRTime) / 1000 : 1 / 72;
        lastXRTime = timestamp;
        if (!(dt > 0)) dt = 1 / 72;
        dt = Math.min(dt, 0.1);
        perfStats.frameMs += (dt * 1000 - perfStats.frameMs) * 0.05;

        // 1. 渲染一帧 Butterchurn
        const bcStart = performance.now();
        if (state.bridge && state.bridge.renderButterchurnFrame) {
            try {
                if (usingSharedGL) {
                    const session = (frame && frame.session) || xrSession;
                    const bl = session && session.renderState && session.renderState.baseLayer;
                    renderButterchurnShared(bl ? bl.framebuffer : null);
                } else {
                    state.bridge.renderButterchurnFrame();
                    if (visualizerTexture) visualizerTexture.needsUpdate = true;
                }
            } catch (err) {
                console.warn('[VRManager] Butterchurn 渲染异常:', err);
            }
        }
        perfStats.bcMs += ((performance.now() - bcStart) - perfStats.bcMs) * 0.05;

        // 2. 音频
        const audio = readAudio();
        const bass = audio.bass;

        // 3. 时空回响 (每 4 帧一次 GPU 缩拷)
        frameCounter++;
        if (vrStereoEnabled && frameCounter % 4 === 0) {
            try { updateEcho(); } catch (e) {}
        }

        const stereoActive = vrStereoEnabled ? 1.0 : 0.0;
        if (screenMesh && screenMesh.material && screenMesh.material.uniforms) {
            screenMesh.material.uniforms.uAudioBass.value = bass;
            screenMesh.material.uniforms.uStereoOn.value = stereoActive;
        }
        if (panoMaterial) {
            const u = panoMaterial.uniforms;
            u.uTime.value = timeSec;
            u.uAudioBass.value = bass;
            u.uStereoOn.value = stereoActive;
            u.uEchoAmt.value = vrStereoEnabled ? 0.38 : 0.0;
            u.uFlash.value = skyFlash;
        }
        skyFlash *= Math.exp(-dt * 5.0);
        if (tunnelMeshScreen) tunnelMeshScreen.visible = vrStereoEnabled && (state.displayMode === 'curved_screen');

        // 4. 裸手手势与特效、手柄交互
        const handResult = updateHands(timeSec, dt, audio, viewHalfH);
        updateXRFrame(timestamp, bass, handResult);
        updatePerfPanel(performance.now());

        perfStats.jsMs += ((performance.now() - tStart) - perfStats.jsMs) * 0.05;

        // 5. 提交立体双目渲染
        renderer.render(scene, camera);
        perfStats.calls = renderer.info.render.calls;
        perfStats.tris = renderer.info.render.triangles;
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
            lastXRTime = 0;

            // 默认进入 VR 隐藏菜单，纯净展现视觉
            state.menuVisible = false;
            if (hudMesh) hudMesh.visible = false;
            if (starParticles) starParticles.visible = false;
            if (reticleMesh) reticleMesh.visible = false;

            xrSession.addEventListener('end', onSessionEnded);

            const bl = xrSession.renderState && xrSession.renderState.baseLayer;
            if (bl && bl.framebufferHeight) viewHalfH = bl.framebufferHeight / 2;
            applyFoveation();

            if (state.bridge && state.bridge.onSessionStart) {
                state.bridge.onSessionStart();
            }

            recenterHUD();
            drawHUD();

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
        lastXRTime = 0;

        if (renderer) {
            renderer.setAnimationLoop(null);
        }

        cleanUpHands();

        // 共享上下文：把 GL 状态恢复为默认值，交还给网页端的 Butterchurn
        if (usingSharedGL && renderer && sharedGL) {
            try {
                renderer.resetState();
                sharedGL.gl.bindVertexArray(null);
                for (let u = 0; u < sharedGL.maxUnits; u++) sharedGL.gl.bindSampler(u, null);
                sharedGL.gl.pixelStorei(sharedGL.gl.UNPACK_FLIP_Y_WEBGL, false);
                sharedGL.gl.pixelStorei(sharedGL.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                sharedGL.redirect = false;
            } catch (e) {}
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
        },
        toggleVRStereo,
        setVRStereoEnabled,
        getVRStereoEnabled: () => vrStereoEnabled,
        cyclePlatformSize,
        setPlatformSize,
        getPlatformSize: () => platformState.size,
        cycleHandFx,
        setHandFxMode,
        getHandFxMode: () => currentHandFx,
        getHandFxModes: () => HAND_FX_MODES,
        setProjectionMode,
        getProjectionMode: () => currentProjection,
        getProjections: () => PROJECTIONS,
        getDesiredVisualizerSize,
        isSharedGL: () => usingSharedGL,
        setSharedGLEnabled: (enabled) => {
            try { localStorage.setItem('dv_vr_shared_gl', enabled ? 'true' : 'false'); } catch (e) {}
        },
        getSharedGLEnabled: wantSharedGL
    };

    // 仅供离线自动化测试使用 (页面设置 window.__DV_TEST__ = true 时才暴露内部函数)
    if (typeof window !== 'undefined' && window.__DV_TEST__) {
        window.VRManager.__test = {
            initThreeScene,
            renderButterchurnShared,
            updateEcho,
            get renderer() { return renderer; },
            get scene() { return scene; },
            get camera() { return camera; },
            get panoMaterial() { return panoMaterial; },
            get usingSharedGL() { return usingSharedGL; },
            get sharedGL() { return sharedGL; },
            onXRAnimationLoop,
            showMenu,
            togglePerfPanel,
            drawHUD,
            get hudMesh() { return hudMesh; },
            get hands() { return hands; },
            get state() { return state; },
            get perfVisible() { return perfVisible; },
            // 模拟一个 XR 会话 (无输入源)，用于离线跑通每帧主循环
            forceSession(fake) {
                xrSession = fake;
                state.isVRActive = !!fake;
            }
        };
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            checkXRSupport().catch(() => undefined);
        });
    }
})();
