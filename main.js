/**
 * ECHOSFALL x DREAMY VOYAGE
 * Butterchurn 全屏音乐可视化流引擎
 * 移植自 Labyrinth-of-Echoes Echosfall 功能
 */

(() => {
    'use strict';

    // ==========================================
    // 常量与手势阈值配置 (与 Echosfall 完全一致)
    // ==========================================
    const SWIPE_DISTANCE = 64;
    const SWIPE_AXIS_RATIO = 1.18;
    const TAP_DISTANCE = 16;
    const DOUBLE_TAP_MS = 280;
    const PRESET_BLEND_DURATION_SECONDS = 2.5;
    const MAX_HISTORY_STACK = 40;

    // DOM 元素引用
    const canvas = document.getElementById('butterchurn-canvas');
    const introOverlay = document.getElementById('intro-overlay');
    const audio = document.getElementById('audio-core');
    const titleCard = document.getElementById('echosfall-title-card');
    const trackNameEl = document.getElementById('track-name');
    const presetNameEl = document.getElementById('preset-name');
    const heartPopContainer = document.getElementById('heart-pop-container');
    const heartPopBubble = document.querySelector('.heart-pop-bubble');
    const pauseModal = document.getElementById('echosfall-pause-modal');
    const loadingIndicator = document.getElementById('loading-indicator');

    // 暂停菜单按键
    const btnResume = document.getElementById('btn-resume');
    const btnModeToggle = document.getElementById('btn-mode-toggle');
    const modeIcon = document.getElementById('mode-icon');
    const modeText = document.getElementById('mode-text');
    const btnOpenCatalog = document.getElementById('btn-open-catalog');
    const btnToggleFavorite = document.getElementById('btn-toggle-favorite');
    const favoriteStatusIcon = document.getElementById('favorite-status-icon');
    const favoriteStatusText = document.getElementById('favorite-status-text');

    // 顶部状态栏按钮
    const btnTopCatalog = document.getElementById('btn-top-catalog');
    const btnTopFullscreen = document.getElementById('btn-top-fullscreen');

    // 歌单抽屉
    const catalogDrawer = document.getElementById('catalog-drawer');
    const catalogOverlay = document.getElementById('catalog-drawer-overlay');
    const btnCloseCatalog = document.getElementById('btn-close-catalog');
    const catalogList = document.getElementById('catalog-list');

    // ==========================================
    // 运行时状态
    // ==========================================
    let songList = [];
    let presets = {};
    let presetNames = [];
    let historyStack = [];
    let currentItem = null;
    let playbackMode = localStorage.getItem('echosfall_playback_mode') || 'random'; // 'random' | 'sequence'
    let favorites = new Set();
    try {
        const savedFavs = JSON.parse(localStorage.getItem('echosfall_favorites') || '[]');
        if (Array.isArray(savedFavs)) favorites = new Set(savedFavs);
    } catch (e) {
        console.warn('读取收藏记录失败:', e);
    }

    let isPaused = false;
    let hasStarted = false;
    let visualizer = null;
    let audioContext = null;
    let sourceNode = null;
    let gainNode = null;
    let renderAnimationFrameId = null;

    // 手势状态
    let pointerState = null;
    let lastTapAt = 0;
    let tapTimer = null;
    let titleTimer = null;

    // ==========================================
    // 初始化数据源 (Dreamy Voyage 音乐与预设)
    // ==========================================
    function initData() {
        if (window.songList && Array.isArray(window.songList)) {
            songList = window.songList;
        }

        if (window.echosfallPresets && typeof window.echosfallPresets === 'object') {
            presets = window.echosfallPresets;
            presetNames = Object.keys(presets);
        }

        // 如果未加载到预设，尝试从 butterchurnPresets (若有) 或内置基础预设填充
        if (presetNames.length === 0 && window.butterchurnPresets) {
            presets = window.butterchurnPresets.getPresets();
            presetNames = Object.keys(presets);
        }

        renderCatalog();
        updateModeButtonUI();
    }

    // 格式化歌曲展示标题
    function formatTrackTitle(rawName) {
        if (!rawName) return 'Dreamy Voyage Track';
        let title = rawName.replace(/\.mp3$/i, '');
        return title;
    }

    // 提取简略显示标题
    function formatShortTitle(rawName) {
        let title = formatTrackTitle(rawName);
        if (title.includes('-')) {
            const parts = title.split('-');
            if (parts.length >= 2) return parts.slice(1).join(' - ').trim();
        }
        return title;
    }

    // 渲染歌单抽屉列表
    function renderCatalog() {
        catalogList.innerHTML = '';
        songList.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'catalog-item';
            if (currentItem && currentItem.song === song) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <span class="catalog-item-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="catalog-item-title">${formatTrackTitle(song)}</span>
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                closeCatalog();
                const selectedPreset = pickPresetForSong(song, index);
                playItem({ song, presetName: selectedPreset }, true);
                if (isPaused) {
                    resumePlayback();
                }
            });

            catalogList.appendChild(item);
        });
    }

    function updateCatalogActive() {
        const items = catalogList.querySelectorAll('.catalog-item');
        items.forEach((el, idx) => {
            if (currentItem && songList[idx] === currentItem.song) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    // ==========================================
    // 预设选择与匹配策略
    // ==========================================
    function pickPresetForSong(song, index) {
        if (presetNames.length === 0) return 'Default Visualizer';
        if (playbackMode === 'sequence') {
            return presetNames[index % presetNames.length];
        }
        // 随机模式：挑选与上一个不同的预设
        const currentPreset = currentItem ? currentItem.presetName : '';
        const candidatePool = presetNames.filter(p => p !== currentPreset);
        const pool = candidatePool.length > 0 ? candidatePool : presetNames;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ==========================================
    // 队列控制 (下一首 / 上一首)
    // ==========================================
    function getNextItem() {
        if (songList.length === 0) return null;

        let nextSong = '';
        let nextPreset = '';

        if (playbackMode === 'sequence') {
            const currentSongIndex = currentItem ? songList.indexOf(currentItem.song) : -1;
            const nextIndex = (currentSongIndex + 1) % songList.length;
            nextSong = songList[nextIndex];
            nextPreset = pickPresetForSong(nextSong, nextIndex);
        } else {
            // 随机模式：避免与当前曲目连续相同
            const currentSong = currentItem ? currentItem.song : '';
            const available = songList.filter(s => s !== currentSong);
            const pool = available.length > 0 ? available : songList;
            nextSong = pool[Math.floor(Math.random() * pool.length)];
            nextPreset = pickPresetForSong(nextSong, Math.floor(Math.random() * presetNames.length));
        }

        return { song: nextSong, presetName: nextPreset };
    }

    function goNext() {
        const next = getNextItem();
        if (!next) return;

        if (currentItem) {
            historyStack.push(currentItem);
            if (historyStack.length > MAX_HISTORY_STACK) {
                historyStack.shift();
            }
        }

        playItem(next, true);
    }

    function goPrevious() {
        if (historyStack.length > 0) {
            const prev = historyStack.pop();
            playItem(prev, false);
        } else {
            // 没有历史栈时，如果是顺序播放则切上一首，随机则重随机
            if (songList.length === 0) return;
            const currentIndex = currentItem ? songList.indexOf(currentItem.song) : 0;
            const prevIndex = (currentIndex - 1 + songList.length) % songList.length;
            const prevSong = songList[prevIndex];
            const prevPreset = pickPresetForSong(prevSong, prevIndex);
            playItem({ song: prevSong, presetName: prevPreset }, false);
        }
    }

    // ==========================================
    // 播放核心与可视化切换
    // ==========================================
    async function playItem(item, isForward = true) {
        if (!item || !item.song) return;
        currentItem = item;
        updateCatalogActive();

        // 1. 触发曲名卡片动画 (与 Echosfall 原生规格一致: 7秒模糊进退动效)
        showTrackTitle(item.song, item.presetName);

        // 2. 加载并平滑过渡 Butterchurn 预设
        loadPresetIntoVisualizer(item.presetName);

        // 3. 切换音频并淡入
        const songUrl = `./mp3s/${encodeURIComponent(item.song)}`;
        audio.src = songUrl;

        try {
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            await audio.play();
            fadeInAudio();
            isPaused = false;
            hidePauseModal();
        } catch (err) {
            console.warn('[Echosfall] 音乐播放失败，等待手势激活:', err);
        }

        // 4. 后台预加载下一首歌曲与预设
        preloadNext();
    }

    function showTrackTitle(songName, presetName) {
        trackNameEl.innerText = formatTrackTitle(songName);
        presetNameEl.innerText = (presetName || 'REVERIE SPECTRUM').replace(/\.json$/i, '');

        // 重新挂载动画类
        titleCard.classList.remove('title-animate');
        // 强制重绘
        void titleCard.offsetWidth;
        titleCard.classList.add('title-animate');
    }

    function loadPresetIntoVisualizer(presetName) {
        if (!visualizer) return;
        try {
            let presetData = presets[presetName];
            if (presetData) {
                visualizer.loadPreset(presetData, PRESET_BLEND_DURATION_SECONDS);
            } else {
                // 如果是按需加载
                fetch(`./presets/${encodeURIComponent(presetName)}.json`)
                    .then(res => res.json())
                    .then(data => {
                        presets[presetName] = data;
                        visualizer.loadPreset(data, PRESET_BLEND_DURATION_SECONDS);
                    })
                    .catch(e => console.warn('[Echosfall] 加载预设文件异常:', e));
            }
        } catch (e) {
            console.warn('[Echosfall] visualizer.loadPreset 异常:', e);
        }
    }

    // 音量平滑淡入
    function fadeInAudio(duration = 0.55) {
        if (!gainNode || !audioContext) return;
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(1.0, now + duration);
    }

    // 音量平滑淡出并暂停
    function fadeOutAudioAndPause(duration = 0.65) {
        if (!gainNode || !audioContext) {
            audio.pause();
            return;
        }
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + duration);
        setTimeout(() => {
            if (isPaused) {
                audio.pause();
            }
        }, duration * 1000);
    }

    function pausePlayback() {
        if (isPaused) return;
        isPaused = true;
        fadeOutAudioAndPause(0.65);
        updatePauseModalUI();
        showPauseModal();
    }

    function resumePlayback() {
        if (!isPaused && hasStarted) return;
        isPaused = false;
        hidePauseModal();

        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => undefined);
        }

        audio.play().catch(e => console.warn('恢复播放拦截:', e));
        fadeInAudio(0.5);
    }

    // 预加载前瞻项
    function preloadNext() {
        const next = getNextItem();
        if (!next) return;

        // 预加载音频
        const preAudio = new Audio();
        preAudio.preload = 'metadata';
        preAudio.src = `./mp3s/${encodeURIComponent(next.song)}`;

        // 预加载预设
        if (!presets[next.presetName]) {
            fetch(`./presets/${encodeURIComponent(next.presetName)}.json`)
                .then(r => r.json())
                .then(json => { presets[next.presetName] = json; })
                .catch(() => undefined);
        }
    }

    // ==========================================
    // 收藏功能与心形跳动动效 (Double Tap)
    // ==========================================
    function toggleFavorite() {
        if (!currentItem || !currentItem.presetName) return;
        const pName = currentItem.presetName;
        const isFav = favorites.has(pName);

        if (isFav) {
            favorites.delete(pName);
        } else {
            favorites.add(pName);
        }

        try {
            localStorage.setItem('echosfall_favorites', JSON.stringify(Array.from(favorites)));
        } catch (e) {
            console.warn('写入收藏失败:', e);
        }

        // 触发 Echosfall 专属脉冲心形动效
        triggerHeartAnimation(!isFav);
        updatePauseModalUI();
    }

    function triggerHeartAnimation(isFavNow) {
        if (isFavNow) {
            heartPopBubble.classList.remove('unfavorited');
        } else {
            heartPopBubble.classList.add('unfavorited');
        }

        heartPopContainer.classList.remove('hidden');

        // 重新应用动画
        heartPopBubble.style.animation = 'none';
        void heartPopBubble.offsetWidth;
        heartPopBubble.style.animation = 'echosfallHeartPop 720ms ease-out both';

        setTimeout(() => {
            heartPopContainer.classList.add('hidden');
        }, 720);
    }

    // ==========================================
    // 暂停菜单与模式切换 UI
    // ==========================================
    function showPauseModal() {
        pauseModal.classList.remove('hidden');
    }

    function hidePauseModal() {
        pauseModal.classList.add('hidden');
    }

    function updateModeButtonUI() {
        if (playbackMode === 'random') {
            modeIcon.className = 'fa-solid fa-shuffle';
            modeText.innerText = '随机播放';
        } else {
            modeIcon.className = 'fa-solid fa-arrow-down-1-9';
            modeText.innerText = '顺序播放';
        }
    }

    function togglePlaybackMode() {
        playbackMode = (playbackMode === 'random') ? 'sequence' : 'random';
        localStorage.setItem('echosfall_playback_mode', playbackMode);
        updateModeButtonUI();
    }

    function updatePauseModalUI() {
        updateModeButtonUI();
        if (currentItem && currentItem.presetName) {
            const isFav = favorites.has(currentItem.presetName);
            if (isFav) {
                favoriteStatusIcon.className = 'fa-solid fa-heart';
                favoriteStatusText.innerText = '已收藏预设';
                btnToggleFavorite.style.color = '#fda4af';
                btnToggleFavorite.style.borderColor = 'rgba(244, 63, 94, 0.6)';
            } else {
                favoriteStatusIcon.className = 'fa-regular fa-heart';
                favoriteStatusText.innerText = '收藏当前预设';
                btnToggleFavorite.style.color = '#ffe4e6';
                btnToggleFavorite.style.borderColor = 'rgba(244, 63, 94, 0.32)';
            }
        }
    }

    // ==========================================
    // 抽屉控制
    // ==========================================
    function openCatalog() {
        catalogDrawer.classList.add('open');
        catalogOverlay.classList.remove('hidden');
    }

    function closeCatalog() {
        catalogDrawer.classList.remove('open');
        catalogOverlay.classList.add('hidden');
    }

    // ==========================================
    // Butterchurn 与 Web Audio 初始化
    // ==========================================
    function initWebAudio() {
        if (audioContext) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();

        sourceNode = audioContext.createMediaElementSource(audio);
        gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
    }

    function initButterchurnVisualizer() {
        if (visualizer) return;
        if (!window.butterchurn) {
            console.error('Butterchurn 核心库未载入');
            return;
        }

        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 根据移动端设备限制 DPR 与纹理尺寸，确保 60fps 丝滑流畅
        const pixelRatio = isMobile ? Math.min(window.devicePixelRatio || 1, 1.25) : Math.min(window.devicePixelRatio || 1, 2.0);
        const textureRatio = isMobile ? 0.68 : 1.0;

        try {
            visualizer = window.butterchurn.createVisualizer(audioContext, canvas, {
                width,
                height,
                pixelRatio,
                textureRatio
            });

            // 将 gainNode 频域数据连接到 visualizer
            visualizer.connectAudio(gainNode || sourceNode);
            resizeVisualizer();
            startRenderLoop();
        } catch (err) {
            console.error('Butterchurn 创建失败:', err);
        }
    }

    function resizeVisualizer() {
        if (!visualizer) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
        visualizer.setRendererSize(w, h);
    }

    function startRenderLoop() {
        if (renderAnimationFrameId) cancelAnimationFrame(renderAnimationFrameId);
        function loop() {
            if (visualizer) {
                visualizer.render();
            }
            renderAnimationFrameId = requestAnimationFrame(loop);
        }
        loop();
    }

    // ==========================================
    // 手势与触控状态机 (对齐 EchosfallFeed)
    // ==========================================
    function isInteractiveTarget(target) {
        if (!target) return false;
        if (target.closest && target.closest('[data-echosfall-control="true"]')) {
            return true;
        }
        const tag = target.tagName;
        return tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'SELECT';
    }

    function handlePointerDown(e) {
        if (isInteractiveTarget(e.target)) return;
        pointerState = {
            startX: e.clientX,
            startY: e.clientY
        };
    }

    function handlePointerUp(e) {
        if (isInteractiveTarget(e.target)) {
            pointerState = null;
            return;
        }

        const pointer = pointerState;
        pointerState = null;
        if (!pointer) return;

        const deltaX = e.clientX - pointer.startX;
        const deltaY = e.clientY - pointer.startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        const isVerticalSwipe = absY >= SWIPE_DISTANCE && absY >= absX * SWIPE_AXIS_RATIO;
        const isHorizontalSwipe = absX >= SWIPE_DISTANCE && absX >= absY * SWIPE_AXIS_RATIO;

        // 滑动切歌判定
        if (isVerticalSwipe || isHorizontalSwipe) {
            if (isPaused) {
                // 如果在暂停界面滑动，直接切歌并恢复播放
                resumePlayback();
            }

            // 竖向滑动：下划 (deltaY > 0) 或横向右滑 (deltaX > 0) 切下一首
            // 上划 (deltaY < 0) 或横向左滑 (deltaX < 0) 切上一首
            const goForward = isVerticalSwipe ? deltaY > 0 : deltaX > 0;
            if (goForward) {
                goNext();
            } else {
                goPrevious();
            }
            return;
        }

        // 点击判定
        if (Math.hypot(deltaX, deltaY) <= TAP_DISTANCE) {
            handleTap();
        }
    }

    function handleTap() {
        const now = Date.now();
        if (now - lastTapAt <= DOUBLE_TAP_MS) {
            // 双击：取消待触发的单击，执行收藏脉冲
            lastTapAt = 0;
            if (tapTimer !== null) {
                clearTimeout(tapTimer);
                tapTimer = null;
            }
            toggleFavorite();
            return;
        }

        // 单击：等待防抖，如果在此时间内没有第二次点击则打开暂停菜单
        lastTapAt = now;
        tapTimer = setTimeout(() => {
            tapTimer = null;
            if (isPaused) {
                resumePlayback();
            } else {
                pausePlayback();
            }
        }, DOUBLE_TAP_MS);
    }

    // 键盘切歌监听
    function handleKeyDown(e) {
        if (isInteractiveTarget(e.target)) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (isPaused) resumePlayback();
            goNext();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (isPaused) resumePlayback();
            goPrevious();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (isPaused) {
                resumePlayback();
            } else {
                pausePlayback();
            }
        }
    }

    // ==========================================
    // 入场体验开启 (手势解锁 Web Audio & 全屏)
    // ==========================================
    function startExperience() {
        if (hasStarted) return;
        hasStarted = true;

        introOverlay.style.opacity = '0';
        setTimeout(() => {
            introOverlay.style.display = 'none';
        }, 750);

        // 尝试触发全屏 (手机浏览器体验最佳)
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => undefined);
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            }
        } catch (e) {}

        // 初始化音频与 Butterchurn
        initWebAudio();
        initButterchurnVisualizer();

        // 检查 URL 是否带参 ?song=X
        const urlParams = new URLSearchParams(window.location.search);
        const songParam = urlParams.get('song');
        let initialIndex = 0;
        if (songParam !== null) {
            const idx = parseInt(songParam, 10);
            if (!isNaN(idx) && idx >= 0 && idx < songList.length) initialIndex = idx;
        }

        const firstSong = songList[initialIndex] || songList[0];
        const firstPreset = pickPresetForSong(firstSong, initialIndex);
        playItem({ song: firstSong, presetName: firstPreset }, true);
    }

    // 全屏切换
    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => undefined);
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => undefined);
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    // ==========================================
    // 事件挂载
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initData();

        // 首屏解锁
        introOverlay.addEventListener('click', startExperience);
        introOverlay.addEventListener('touchend', startExperience);

        // 全局手势
        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', () => { pointerState = null; });
        window.addEventListener('keydown', handleKeyDown);

        // 视口与缩放变化
        window.addEventListener('resize', resizeVisualizer);
        window.addEventListener('orientationchange', () => setTimeout(resizeVisualizer, 120));
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', resizeVisualizer);
        }

        // 音频播放结束自动切下一首
        audio.addEventListener('ended', () => {
            if (!isPaused) {
                goNext();
            }
        });

        // 暂停菜单按键
        btnResume.addEventListener('click', (e) => {
            e.stopPropagation();
            resumePlayback();
        });

        btnModeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlaybackMode();
        });

        btnOpenCatalog.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePauseModal();
            openCatalog();
        });

        btnToggleFavorite.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite();
        });

        // 顶部按钮
        btnTopCatalog.addEventListener('click', (e) => {
            e.stopPropagation();
            openCatalog();
        });

        btnTopFullscreen.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreen();
        });

        // 歌单抽屉按键
        btnCloseCatalog.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCatalog();
        });

        catalogOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCatalog();
        });
    });
})();
