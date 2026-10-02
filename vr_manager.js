/**
 * Dreamy Voyage - WebXR VR Manager
 * 专门适配 Meta Quest 2 / Quest 3 / Quest Pro (Meta Quest Browser)
 * 
 * 核心功能：
 * 1. WebXR 会话生命周期管理 (全屏沉浸式立体 VR 体验)
 * 2. 空间视听映射：
 *    - [IMAX 巨幕模式] 120° 悬浮超宽曲面巨幕 (默认推荐，沉浸且无眩晕)
 *    - [360° 穹顶模式] 全包裹动态宇宙球体视界
 * 3. Quest 2 手柄 6DoF 空间交互：
 *    - 激光射线指针 (Laser Pointer) 与吸附光斑
 *    - 手柄物理震动触觉反馈 (Haptic Pulses)
 * 4. 3D 悬浮玻璃拟态交互菜单 (HUD)：
 *    - 播放/暂停、上一曲/下一曲、切换视觉预设、模式切换、视角居中、退出 VR
 * 5. Quest 2 物理按键与摇杆盲操：
 *    - 摇杆 上/下：切歌
 *    - 摇杆 左/右：切换 Butterchurn 视觉预设
 *    - A/X 键 或 Grip 侧握键：呼出/隐藏 3D 菜单
 *    - 扳机键 (Trigger)：点击光束选中的菜单按钮
 */

(() => {
    'use strict';

    // 状态管理
    const state = {
        isVRActive: false,
        isSupported: false,
        displayMode: 'curved_screen', // 'curved_screen' | 'dome'
        menuVisible: true,
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
    let domeMesh = null;
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
    let hudNeedsRedraw = true;

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
        scene.background = new THREE.Color(0x02040a);

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

        // 5. 构建 3D 视觉巨幕 & 360° 穹顶
        buildScreenAndDome();

        // 6. 构建深空星尘环境 & 地面发光台
        buildEnvironment();

        // 7. 构建 3D 悬浮 HUD 菜单
        buildFloatingHUD();

        // 8. 构建手柄控制器与射线
        setupControllers();

        raycaster = new THREE.Raycaster();
    }

    // 构建 120° 弧形 IMAX 巨幕 与 360° 穹顶
    function buildScreenAndDome() {
        const screenMat = new THREE.MeshBasicMaterial({
            map: visualizerTexture,
            side: THREE.FrontSide,
            toneMapped: false
        });

        // --- 方案 A: 120° 弧形曲面 IMAX 巨幕 ---
        // 半径 4.2 米，高 2.5 米，圆弧角约 120° (Math.PI * 0.68)
        const radius = 4.2;
        const height = 2.55;
        const arcAngle = Math.PI * 0.68;
        const thetaStart = Math.PI * 1.5 - arcAngle / 2;

        const cylinderGeom = new THREE.CylinderGeometry(
            radius, radius, height, 48, 1, true, thetaStart, arcAngle
        );
        screenMesh = new THREE.Mesh(cylinderGeom, screenMat);
        // 水平翻转 X 轴，确保从圆心向前看时，纹理保持正向且不镜像
        screenMesh.scale.set(-1, 1, 1);
        screenMesh.position.set(0, 1.6, 0); // 居中置于眼平线高度
        scene.add(screenMesh);

        // --- 方案 B: 360° 全景沉浸穹顶球体 ---
        const sphereGeom = new THREE.SphereGeometry(22, 60, 40);
        domeMesh = new THREE.Mesh(sphereGeom, screenMat);
        domeMesh.scale.set(-1, 1, 1); // 内部反转面向视线
        domeMesh.position.set(0, 1.6, 0);
        domeMesh.visible = false; // 默认使用巨幕模式
        scene.add(domeMesh);
    }

    // 构建深空星尘与地台
    function buildEnvironment() {
        // 1. 星尘粒子 (1200 颗随机点缀在视界周围)
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
            // 球坐标随机分布
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 8 + Math.random() * 25;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.max(0.2, r * Math.sin(phi) * Math.sin(theta)); // 保持大部分在水平面及以上
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
        scene.add(starParticles);

        // 2. 地面发光参考台 (防止 VR 眩晕，提供空间感知锚点)
        platformGroup = new THREE.Group();

        // 黑色基座圆盘
        const discGeom = new THREE.CircleGeometry(2.4, 48);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x070b14,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        const discMesh = new THREE.Mesh(discGeom, discMat);
        discMesh.rotation.x = -Math.PI / 2;
        discMesh.position.y = 0.01;
        platformGroup.add(discMesh);

        // 霓虹光环 1
        const ringGeom1 = new THREE.RingGeometry(2.35, 2.4, 64);
        const ringMat1 = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });
        const ringMesh1 = new THREE.Mesh(ringGeom1, ringMat1);
        ringMesh1.rotation.x = -Math.PI / 2;
        ringMesh1.position.y = 0.015;
        platformGroup.add(ringMesh1);

        // 霓虹光环 2 (内环)
        const ringGeom2 = new THREE.RingGeometry(1.2, 1.23, 48);
        const ringMat2 = new THREE.MeshBasicMaterial({
            color: 0xec4899,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide
        });
        const ringMesh2 = new THREE.Mesh(ringGeom2, ringMat2);
        ringMesh2.rotation.x = -Math.PI / 2;
        ringMesh2.position.y = 0.016;
        platformGroup.add(ringMesh2);

        scene.add(platformGroup);
    }

    // 构建 3D 浮动玻璃拟态 HUD 菜单
    function buildFloatingHUD() {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 1024;
        hudCanvas.height = 512;
        hudCtx = hudCanvas.getContext('2d');

        hudTexture = new THREE.CanvasTexture(hudCanvas);
        hudTexture.minFilter = THREE.LinearFilter;
        hudTexture.magFilter = THREE.LinearFilter;

        const planeGeom = new THREE.PlaneGeometry(1.25, 0.625);
        const planeMat = new THREE.MeshBasicMaterial({
            map: hudTexture,
            transparent: true,
            opacity: 0.96,
            side: THREE.DoubleSide
        });

        hudMesh = new THREE.Mesh(planeGeom, planeMat);
        // 置于用户正前方 1.8 米，高度 1.35 米，微向上仰角 8 度，最舒适自然的人体工程学视角
        hudMesh.position.set(0, 1.35, -1.8);
        hudMesh.rotation.x = THREE.MathUtils.degToRad(8);
        scene.add(hudMesh);

        // 定义可点击按钮的绝对物理区域 (针对 1024x512 Canvas)
        hudButtons = [
            // 第一行控制按钮：切歌与播放控制
            {
                id: 'btn-prev-track',
                x: 104, y: 250, w: 230, h: 84,
                icon: '⏮', labelEn: 'Prev Track', labelZh: '上一曲',
                onClick: () => {
                    if (state.bridge && state.bridge.prevTrack) state.bridge.prevTrack();
                    drawHUD();
                }
            },
            {
                id: 'btn-play-pause',
                x: 397, y: 244, w: 230, h: 96,
                isPrimary: true,
                icon: '⏯', labelEn: 'Play / Pause', labelZh: '播放 / 暂停',
                onClick: () => {
                    if (state.bridge && state.bridge.togglePlayPause) state.bridge.togglePlayPause();
                    drawHUD();
                }
            },
            {
                id: 'btn-next-track',
                x: 690, y: 250, w: 230, h: 84,
                icon: '⏭', labelEn: 'Next Track', labelZh: '下一曲',
                onClick: () => {
                    if (state.bridge && state.bridge.nextTrack) state.bridge.nextTrack();
                    drawHUD();
                }
            },

            // 第二行控制按钮：视觉预设、模式、居中、退出
            {
                id: 'btn-switch-preset',
                x: 104, y: 370, w: 230, h: 76,
                icon: '🪄', labelEn: 'Next FX Preset', labelZh: '切换视觉特效',
                onClick: () => {
                    if (state.bridge && state.bridge.nextPreset) state.bridge.nextPreset();
                    drawHUD();
                }
            },
            {
                id: 'btn-toggle-mode',
                x: 397, y: 370, w: 230, h: 76,
                icon: '🌐', labelEn: 'Screen / Dome', labelZh: '巨幕 / 360°穹顶',
                onClick: () => {
                    toggleDisplayMode();
                    drawHUD();
                }
            },
            {
                id: 'btn-exit-vr',
                x: 690, y: 370, w: 230, h: 76,
                isDanger: true,
                icon: '🚪', labelEn: 'Exit VR', labelZh: '退出 VR',
                onClick: () => {
                    exitVR();
                }
            }
        ];

        drawHUD();
    }

    // 绘制 3D 浮动 HUD 菜单 (玻璃拟态 + 霓虹发光)
    function drawHUD() {
        if (!hudCtx) return;
        const ctx = hudCtx;
        const w = hudCanvas.width;
        const h = hudCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. 半透明深蓝黑底板与霓虹边框
        const cornerRadius = 36;
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, 30, 20, w - 60, h - 40, cornerRadius);
        ctx.fillStyle = 'rgba(7, 12, 24, 0.90)';
        ctx.fill();

        ctx.lineWidth = 3.5;
        const borderGrad = ctx.createLinearGradient(0, 0, w, h);
        borderGrad.addColorStop(0, '#38bdf8');
        borderGrad.addColorStop(0.5, '#ec4899');
        borderGrad.addColorStop(1, '#818cf8');
        ctx.strokeStyle = borderGrad;
        ctx.stroke();
        ctx.restore();

        // 2. 顶部品牌与曲目信息
        const trackInfo = state.bridge ? state.bridge.getTrackInfo() : {
            title: 'Dreamy Voyage',
            preset: 'BUTTERCHURN REVERIE',
            isPlaying: true,
            isChinese: false
        };

        // 标题徽标
        ctx.save();
        ctx.font = '900 24px "Orbitron", sans-serif';
        ctx.fillStyle = '#f472b6';
        ctx.textAlign = 'left';
        ctx.fillText('ECHOSFALL VR', 68, 68);

        // 模式徽章
        const modeText = state.displayMode === 'curved_screen' ? 'IMAX 120° SCREEN' : '360° COSMIC DOME';
        ctx.font = '700 16px "Orbitron", sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        ctx.fillText(modeText, w - 68, 68);

        // 正在播放曲目名称
        ctx.font = '800 34px "Orbitron", -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        const displayTitle = trackInfo.title || 'Echoes in the Fog';
        ctx.fillText(displayTitle.length > 38 ? displayTitle.substring(0, 36) + '...' : displayTitle, 68, 124);

        // 当前视觉特效预设名称
        ctx.font = '600 20px "Orbitron", sans-serif';
        ctx.fillStyle = '#a5f3fc';
        const displayPreset = 'FX: ' + (trackInfo.preset || 'Cosmic Pulse');
        ctx.fillText(displayPreset.length > 46 ? displayPreset.substring(0, 44) + '...' : displayPreset, 68, 162);

        // 状态分隔线
        ctx.beginPath();
        ctx.moveTo(68, 192);
        ctx.lineTo(w - 68, 192);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // 3. 渲染所有可交互按钮
        const isZh = trackInfo.isChinese;
        hudButtons.forEach(btn => {
            const isHover = (state.hoveredButtonId === btn.id);
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 24);

            if (isHover) {
                // 悬停态：高亮发光
                ctx.fillStyle = btn.isDanger ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.38)';
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = btn.isDanger ? '#ef4444' : '#38bdf8';
                ctx.shadowColor = btn.isDanger ? '#ef4444' : '#38bdf8';
                ctx.shadowBlur = 18;
                ctx.stroke();
            } else if (btn.isPrimary) {
                // 主操作按钮 (播放/暂停)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            } else if (btn.isDanger) {
                // 危险/退出按钮
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
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const centerX = btn.x + btn.w / 2;
            const centerY = btn.y + btn.h / 2;
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
                ctx.fillStyle = isHover ? '#ffffff' : (btn.isDanger ? '#fca5a5' : '#e0f2fe');
                ctx.fillText(`${btn.icon} ${labelText}`, centerX, centerY);
            }
            ctx.restore();
        });

        // 底部手柄快捷提示
        ctx.save();
        ctx.font = '500 14px "Orbitron", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'center';
        const hintText = isZh
            ? '💡 Quest 手柄盲操：摇杆[上下]切歌 · 摇杆[左右]切换特效 · [A/X键]开闭菜单 · [侧握Grip]居中'
            : '💡 Quest Controller: Stick [↑↓] Track · Stick [←→] FX Preset · Button [A/X] Menu · Grip [Recenter]';
        ctx.fillText(hintText, w / 2, h - 36);
        ctx.restore();

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

            // 激光光束 (薄圆柱线条，长 3.5 米)
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

            // 手柄握把几何体 (流线型科技手杖形态，自渲染无需下载庞大 GLTF)
            const grip = renderer.xr.getControllerGrip(i);
            const wandGeom = new THREE.CylinderGeometry(0.016, 0.022, 0.16, 16);
            const wandMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
            const wandMesh = new THREE.Mesh(wandGeom, wandMat);
            wandMesh.rotation.x = -Math.PI / 4;
            grip.add(wandMesh);

            // 握把霓虹环装饰
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

        // 射线命中点高亮光斑 (Reticle)
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
        if (!state.menuVisible || !hudMesh || !hudMesh.visible) {
            // 如果菜单处于隐藏状态，点击任意扳机键唤出菜单
            state.menuVisible = true;
            hudMesh.visible = true;
            recenterHUD();
            drawHUD();
            return;
        }

        if (state.hoveredButtonId) {
            const btn = hudButtons.find(b => b.id === state.hoveredButtonId);
            if (btn && typeof btn.onClick === 'function') {
                // 触发手柄触觉震动反馈 (Haptics)
                pulseControllerHaptic(controllerIndex, 0.5, 60);
                btn.onClick();
            }
        }
    }

    // 触发 Quest 2 手柄物理震动
    function pulseControllerHaptic(controllerIndex, intensity = 0.4, durationMs = 50) {
        if (!xrSession) return;
        const source = xrSession.inputSources[controllerIndex];
        if (source && source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
            try {
                source.gamepad.hapticActuators[0].pulse(intensity, durationMs);
            } catch (e) {
                // ignore
            }
        }
    }

    // 将 3D HUD 居中召唤到用户正前方视野
    function recenterHUD() {
        if (!camera || !hudMesh) return;

        // 计算当前相机水平朝向
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();

        // 放置在眼睛正前方 1.8 米，高度微低于人眼 0.2 米
        const targetPos = camera.position.clone().add(forward.clone().multiplyScalar(1.8));
        targetPos.y = Math.max(1.1, camera.position.y - 0.2);

        hudMesh.position.copy(targetPos);
        hudMesh.lookAt(camera.position);
        hudMesh.rotation.x += THREE.MathUtils.degToRad(8); // 微向上倾斜对准眼睛

        pulseControllerHaptic(0, 0.2, 40);
        pulseControllerHaptic(1, 0.2, 40);
    }

    // 切换 [IMAX 巨幕模式] ↔ [360° 宇宙穹顶模式]
    function toggleDisplayMode() {
        if (state.displayMode === 'curved_screen') {
            state.displayMode = 'dome';
            screenMesh.visible = false;
            domeMesh.visible = true;
            if (platformGroup) platformGroup.visible = false; // 穹顶模式隐藏地面，全空灵沉浸
        } else {
            state.displayMode = 'curved_screen';
            screenMesh.visible = true;
            domeMesh.visible = false;
            if (platformGroup) platformGroup.visible = true;
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

                // 轴数据 (Quest 2 手柄通常 axes[2] 为 X 轴, axes[3] 为 Y 轴；部分浏览器为 axes[0]/[1])
                const stickX = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
                const stickY = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);

                // 摇杆左右倾斜：切换预设 (左: 上一个预设, 右: 下一个预设)
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

                // 摇杆上下倾斜：切歌 (下: 下一首, 上: 上一首)
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

                // 按键检测：Button 4 (A 或 X 键) 切换菜单显隐
                if (gp.buttons && gp.buttons.length > 4 && gp.buttons[4].pressed) {
                    state.lastThumbstickTime = now;
                    state.menuVisible = !state.menuVisible;
                    if (hudMesh) hudMesh.visible = state.menuVisible;
                    if (state.menuVisible) recenterHUD();
                    pulseControllerHaptic(i, 0.4, 50);
                    break;
                }
            }
        }

        // 2. 射线拾取 HUD 按钮
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
        if (hitPoint && reticleMesh) {
            reticleMesh.position.copy(hitPoint);
            reticleMesh.position.add(raycaster.ray.direction.clone().multiplyScalar(-0.01)); // 防 Z-fighting
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

    // WebXR 专属主渲染循环 (由 Quest 2 72/90Hz 刷新率硬件精准节拍驱动)
    function onXRAnimationLoop(timestamp, frame) {
        if (!state.isVRActive || !renderer) return;

        // 1. 同步更新 Butterchurn 画面到 3D 空间材质
        if (state.bridge && state.bridge.renderButterchurnFrame) {
            state.bridge.renderButterchurnFrame();
        }
        if (visualizerTexture) {
            visualizerTexture.needsUpdate = true;
        }

        // 2. 旋转星尘背景与动画
        if (starParticles) {
            starParticles.rotation.y += 0.0003;
        }

        // 3. 轮询手柄、射线与交互
        updateXRFrame();

        // 4. 提交立体双目渲染
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
            // 请求 WebXR 沉浸式立体渲染会话
            xrSession = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });

            await renderer.xr.setSession(xrSession);
            state.isVRActive = true;

            // 监听会话结束事件 (用户在 Quest 系统菜单退出或拔下头显)
            xrSession.addEventListener('end', onSessionEnded);

            // 通知外部 (如暂停 2D 网页端的 requestAnimationFrame，适配 Quest 2 最佳 VR 分辨率)
            if (state.bridge && state.bridge.onSessionStart) {
                state.bridge.onSessionStart();
            }

            // 初始居中 HUD
            setTimeout(() => {
                recenterHUD();
                drawHUD();
            }, 200);

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

        // 通知外部恢复 2D 网页全屏渲染与原始画质
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
        setPlaybackBridge: (bridge) => {
            state.bridge = bridge;
        },
        updateHUD: () => {
            if (state.isVRActive) {
                drawHUD();
            }
        }
    };

    // 页面加载完成后自动检测一次
    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => {
            checkXRSupport().catch(() => undefined);
        });
    }
})();
