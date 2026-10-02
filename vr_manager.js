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

        // --- 方案 B: 360° 无缝真全景环幕 (彻底消除接缝断层与极点缩挤畸变) ---
        // 采用全景对称镜像 UV 映射算法 (0°→180°→360°)，在任何角度转身看均 100% 连续无断层
        // 高度 9.2 米，半径 5.2 米，彻底避免传统球体在头顶/脚底把像素挤扁成一个漩涡的严重形变
        const panoRadius = 5.2;
        const panoHeight = 9.2;
        const panoSegments = 64;
        const panoGeom = new THREE.CylinderGeometry(
            panoRadius, panoRadius, panoHeight, panoSegments, 1, true, 0, Math.PI * 2
        );

        // 自定义 UV 贴图坐标：0° 到 180° (U: 0.0 -> 1.0)，180° 到 360° (U: 1.0 -> 0.0)
        // 这样在 0°(正前) 和 180°(正后) 两端接缝处 U 值完全平滑连续，杜绝任何撕裂线条！
        const uvs = panoGeom.attributes.uv;
        const numCols = panoSegments;
        for (let i = 0; i <= numCols; i++) {
            const frac = i / numCols;
            const uVal = frac <= 0.5 ? (frac * 2.0) : ((1.0 - frac) * 2.0);
            // 顶端顶点
            uvs.setX(i, uVal);
            // 底端顶点
            uvs.setX(i + (numCols + 1), uVal);
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

        // 2. 地面发光参考台
        platformGroup = new THREE.Group();

        const discGeom = new THREE.CircleGeometry(2.4, 48);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x050811,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        const discMesh = new THREE.Mesh(discGeom, discMat);
        discMesh.rotation.x = -Math.PI / 2;
        discMesh.position.y = 0.01;
        platformGroup.add(discMesh);

        // 霓虹光环
        const ringGeom1 = new THREE.RingGeometry(2.35, 2.4, 64);
        const ringMat1 = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ringMesh1 = new THREE.Mesh(ringGeom1, ringMat1);
        ringMesh1.rotation.x = -Math.PI / 2;
        ringMesh1.position.y = 0.015;
        platformGroup.add(ringMesh1);

        const ringGeom2 = new THREE.RingGeometry(1.2, 1.23, 48);
        const ringMat2 = new THREE.MeshBasicMaterial({
            color: 0xec4899,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const ringMesh2 = new THREE.Mesh(ringGeom2, ringMat2);
        ringMesh2.rotation.x = -Math.PI / 2;
        ringMesh2.position.y = 0.016;
        platformGroup.add(ringMesh2);

        platformGroup.visible = false; // 默认纯净视野
        scene.add(platformGroup);
    }

    // 构建 3D 浮动玻璃拟态 HUD 菜单
    function buildFloatingHUD() {
        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 1080;
        hudCanvas.height = 640;
        hudCtx = hudCanvas.getContext('2d');

        hudTexture = new THREE.CanvasTexture(hudCanvas);
        hudTexture.minFilter = THREE.LinearFilter;
        hudTexture.magFilter = THREE.LinearFilter;

        const planeGeom = new THREE.PlaneGeometry(1.44, 0.85);
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
            ctx.fillText(isZh ? '🎵 选曲播放 (Tracklist)' : '🎵 Select Track (Tracklist)', 60, 68);

            ctx.font = '600 16px "Orbitron", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(`${isZh ? '第' : 'Page'} ${state.tracklistPage + 1} / ${totalPages} ${isZh ? '页 (共 ' + totalSongs + ' 首)' : '(Total ' + totalSongs + ')'}`, 400, 68);
            ctx.restore();

            // 返回主控制面板按钮
            hudButtons.push({
                id: 'btn-tracklist-back',
                x: 770, y: 34, w: 250, h: 50,
                icon: '⬅', labelEn: 'Back to Player', labelZh: '返回控制面板',
                isOutline: true,
                onClick: () => {
                    state.currentView = 'player';
                    drawHUD();
                }
            });

            // 分隔线
            ctx.beginPath();
            ctx.moveTo(60, 102);
            ctx.lineTo(w - 60, 102);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 渲染当前页 8 首歌曲 (2 列 x 4 行)
            const startIndex = state.tracklistPage * state.songsPerPage;
            const pageSongs = rawSongList.slice(startIndex, startIndex + state.songsPerPage);

            const colWidth = 460;
            const rowHeight = 74;
            const startY = 125;
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
                x: 60, y: 500, w: 220, h: 58,
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
                x: 800, y: 500, w: 220, h: 58,
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
            ctx.fillText(isZh ? '💡 扣动手柄扳机键 (Trigger) 点击曲目即可切歌 · 瞄准空白处扣动扳机可隐去菜单' : '💡 Pull Trigger to select song · Pull in empty space to hide HUD', w / 2, 595);
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
            ctx.fillText('ECHOSFALL VR', 60, 64);

            // 右上角模式徽章
            const modeText = state.displayMode === 'curved_screen' ? 'IMAX 148° SCREEN' : '360° SEAMLESS PANORAMA';
            ctx.font = '700 15px "Orbitron", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'right';
            ctx.fillText(modeText, 930, 64);
            ctx.restore();

            // 右上角极速隐藏按钮
            hudButtons.push({
                id: 'btn-quick-hide',
                x: 955, y: 38, w: 65, h: 42,
                icon: '✕', labelEn: '', labelZh: '',
                isOutline: true,
                onClick: () => {
                    hideMenu();
                }
            });

            // 正在播放曲目名称
            ctx.save();
            ctx.font = '800 32px "Orbitron", -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            const displayTitle = trackInfo.title || 'Echoes in the Fog';
            ctx.fillText(displayTitle.length > 38 ? displayTitle.substring(0, 36) + '...' : displayTitle, 60, 115);

            // 当前视觉特效预设名称
            ctx.font = '600 20px "Orbitron", sans-serif';
            ctx.fillStyle = '#a5f3fc';
            const displayPreset = 'FX: ' + (trackInfo.preset || 'Cosmic Pulse');
            ctx.fillText(displayPreset.length > 48 ? displayPreset.substring(0, 46) + '...' : displayPreset, 60, 150);

            // 分隔线
            ctx.beginPath();
            ctx.moveTo(60, 175);
            ctx.lineTo(w - 60, 175);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            // 第一行控制按钮：切歌、播放控制与选曲列表
            hudButtons.push(
                {
                    id: 'btn-prev-track',
                    x: 60, y: 195, w: 160, h: 78,
                    icon: '⏮', labelEn: 'Prev Track', labelZh: '上一曲',
                    onClick: () => {
                        if (state.bridge && state.bridge.prevTrack) state.bridge.prevTrack();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-play-pause',
                    x: 240, y: 190, w: 220, h: 88,
                    isPrimary: true,
                    icon: '⏯', labelEn: 'Play / Pause', labelZh: '播放 / 暂停',
                    onClick: () => {
                        if (state.bridge && state.bridge.togglePlayPause) state.bridge.togglePlayPause();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-next-track',
                    x: 480, y: 195, w: 160, h: 78,
                    icon: '⏭', labelEn: 'Next Track', labelZh: '下一曲',
                    onClick: () => {
                        if (state.bridge && state.bridge.nextTrack) state.bridge.nextTrack();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-open-tracklist',
                    x: 660, y: 195, w: 360, h: 78,
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
                    x: 60, y: 295, w: 160, h: 74,
                    icon: '◀', labelEn: 'Prev FX', labelZh: '上一特效',
                    onClick: () => {
                        if (state.bridge && state.bridge.prevPreset) state.bridge.prevPreset();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-next-preset',
                    x: 240, y: 295, w: 220, h: 74,
                    icon: '🪄', labelEn: 'Next FX', labelZh: '切换特效',
                    onClick: () => {
                        if (state.bridge && state.bridge.nextPreset) state.bridge.nextPreset();
                        drawHUD();
                    }
                },
                {
                    id: 'btn-toggle-preset-mode',
                    x: 480, y: 295, w: 260, h: 74,
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
                    x: 760, y: 295, w: 260, h: 74,
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
                    x: 60, y: 390, w: 280, h: 74,
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
                    x: 360, y: 390, w: 310, h: 74,
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
                    x: 690, y: 390, w: 330, h: 74,
                    icon: '🎯', labelEn: 'Recenter HUD View', labelZh: '视角正前居中',
                    onClick: () => {
                        recenterHUD();
                    }
                }
            );

            // 第四行控制按钮：退出 VR 与 隐藏菜单
            hudButtons.push(
                {
                    id: 'btn-exit-vr',
                    x: 60, y: 485, w: 560, h: 70,
                    isDanger: true,
                    icon: '🚪', labelEn: 'Exit VR Mode', labelZh: '退出 VR 沉浸模式',
                    onClick: () => {
                        exitVR();
                    }
                },
                {
                    id: 'btn-hide-hud',
                    x: 640, y: 485, w: 380, h: 70,
                    isOutline: true,
                    icon: '✕', labelEn: 'Hide Menu (Pure Visual)', labelZh: '隐藏菜单 (纯享巨幕)',
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
            ctx.fillText(hintText, w / 2, 595);
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
