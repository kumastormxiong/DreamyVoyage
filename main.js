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
    const DEFAULT_PRESET_BLEND_DURATION = 2.7; // butterchurn 官方推荐软切换混合时长
    const DEFAULT_PRESET_AUTO_CYCLE = 30; // 默认每个预设播放 30s 后自动软切换下一个预设
    const MAX_HISTORY_STACK = 40;

    // 7 档画质水平定义 (默认第 4 档 1080P 标准全高清)
    const QUALITY_TIERS = [
        { tier: 1, label: 'Tier 1 · 540P Eco (0.50x)', scale: 0.50, desc: '540P' },
        { tier: 2, label: 'Tier 2 · 720P Smooth (0.67x)', scale: 0.67, desc: '720P' },
        { tier: 3, label: 'Tier 3 · 900P Balanced (0.85x)', scale: 0.85, desc: '900P' },
        { tier: 4, label: 'Tier 4 · 1080P Standard (1.00x)', scale: 1.00, desc: '1080P' },
        { tier: 5, label: 'Tier 5 · 1440P High (1.25x)', scale: 1.25, desc: '1440P' },
        { tier: 6, label: 'Tier 6 · 1800P Ultra (1.50x)', scale: 1.50, desc: '1800P' },
        { tier: 7, label: 'Tier 7 · 4K Cinema (2.00x)', scale: 2.00, desc: '4K' },
    ];

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

    // 菜单按键与控件
    const btnResume = document.getElementById('btn-resume');
    const resumeIcon = document.getElementById('resume-icon');
    const resumeText = document.getElementById('resume-text');
    const btnModeToggle = document.getElementById('btn-mode-toggle');
    const modeIcon = document.getElementById('mode-icon');
    const modeText = document.getElementById('mode-text');
    const btnOpenCatalog = document.getElementById('btn-open-catalog');
    const btnToggleFavorite = document.getElementById('btn-toggle-favorite');
    const favoriteStatusIcon = document.getElementById('favorite-status-icon');
    const favoriteStatusText = document.getElementById('favorite-status-text');
    const btnNextPreset = document.getElementById('btn-next-preset');
    const btnShare = document.getElementById('btn-share');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const toastEl = document.getElementById('echosfall-toast');

    // 系统设置模态浮层控件
    const settingsModal = document.getElementById('settings-modal');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnBackSettings = document.getElementById('btn-back-settings');
    const qualityRangeSlider = document.getElementById('quality-range-slider');
    const qualityTierBadge = document.getElementById('quality-tier-badge');
    const cycleRangeSlider = document.getElementById('cycle-range-slider');
    const cycleDurationBadge = document.getElementById('cycle-duration-badge');
    const seedModeBadge = document.getElementById('seed-mode-badge');
    const seedInput = document.getElementById('seed-input');
    const btnApplySeed = document.getElementById('btn-apply-seed');
    const btnSeedDaily = document.getElementById('btn-seed-daily');
    const btnSeedRoll = document.getElementById('btn-seed-roll');
    const blendSegmentedGroup = document.getElementById('blend-segmented-group');
    const blendDurationBadge = document.getElementById('blend-duration-badge');
    const presetHudBadge = document.getElementById('preset-hud-badge');
    const presetHudSegmentedGroup = document.getElementById('preset-hud-segmented-group');
    const btnResetSettings = document.getElementById('btn-reset-settings');

    // 关于 Dreamy Voyage 模态浮层
    const btnOpenAbout = document.getElementById('btn-open-about');
    const aboutModal = document.getElementById('about-modal');
    const btnCloseAbout = document.getElementById('btn-close-about');
    const btnBackAbout = document.getElementById('btn-back-about');

    // 顶部状态栏与按钮
    const topStatusBar = document.getElementById('top-status-bar');
    const btnTopCatalog = document.getElementById('btn-top-catalog');
    const btnTopFullscreen = document.getElementById('btn-top-fullscreen');

    // 歌单抽屉
    const catalogDrawer = document.getElementById('catalog-drawer');
    const catalogOverlay = document.getElementById('catalog-drawer-overlay');
    const btnCloseCatalog = document.getElementById('btn-close-catalog');
    const catalogList = document.getElementById('catalog-list');

    // ==========================================
    // 运行时状态与系统偏好
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

    // 系统设置偏好状态
    let currentQualityTier = parseInt(localStorage.getItem('echosfall_quality_tier') || '4', 10);
    if (isNaN(currentQualityTier) || currentQualityTier < 1 || currentQualityTier > 7) currentQualityTier = 4;
    let presetCycleSeconds = parseInt(localStorage.getItem('echosfall_preset_cycle_seconds') || '30', 10);
    if (isNaN(presetCycleSeconds) || presetCycleSeconds < 0) presetCycleSeconds = 30;
    let presetBlendSeconds = parseFloat(localStorage.getItem('echosfall_preset_blend_seconds') || '2.7');
    if (isNaN(presetBlendSeconds) || presetBlendSeconds < 0) presetBlendSeconds = 2.7;
    let showInfoOnPresetSwitch = localStorage.getItem('echosfall_preset_hud_visible') !== 'false'; // 默认切换预设时显示信息框

    // 确定性随机种子与打乱序列状态
    let currentSeed = localStorage.getItem('echosfall_custom_seed') || getDailySeedString();
    let isCustomSeed = Boolean(localStorage.getItem('echosfall_custom_seed'));
    let shuffledSongList = [];
    let shuffledPresetList = [];
    let songSequenceIndex = 0;
    let presetSequenceIndex = 0;

    let isPaused = false;
    let hasStarted = false;
    let visualizer = null;
    let audioContext = null;
    let sourceNode = null;
    let gainNode = null;
    let renderAnimationFrameId = null;
    let presetAutoCycleTimer = null;

    // 手势状态
    let pointerState = null;
    let lastTapAt = 0;
    let tapTimer = null;
    let titleTimer = null;

    // ==========================================
    // 确定性伪随机数生成 (PRNG) 与种子打乱引擎
    // ==========================================
    function getDailySeedString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `DV-${year}-${month}-${day}`;
    }

    function hashStringSeed(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return function() {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return (h ^= h >>> 16) >>> 0;
        };
    }

    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function seededShuffle(array, rng) {
        const arr = array.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr;
    }

    function buildSeededSequences(maintainCurrent = true) {
        if (songList.length === 0) return;

        const hasher = hashStringSeed(currentSeed);
        const songRng = mulberry32(hasher());
        const presetRng = mulberry32(hasher());

        shuffledSongList = seededShuffle(songList, songRng);
        if (presetNames.length > 0) {
            shuffledPresetList = seededShuffle(presetNames, presetRng);
        } else {
            shuffledPresetList = [];
        }

        if (maintainCurrent && currentItem && currentItem.song) {
            const foundSongIdx = shuffledSongList.indexOf(currentItem.song);
            if (foundSongIdx !== -1) songSequenceIndex = foundSongIdx;
        } else {
            songSequenceIndex = 0;
        }

        if (maintainCurrent && currentItem && currentItem.presetName && shuffledPresetList.length > 0) {
            const foundPresetIdx = shuffledPresetList.indexOf(currentItem.presetName);
            if (foundPresetIdx !== -1) presetSequenceIndex = foundPresetIdx;
        } else {
            presetSequenceIndex = 0;
        }

        console.log(`[Echosfall] 种子 "${currentSeed}" 伪随机重排就绪: 曲目=${shuffledSongList.length}首, 预设=${shuffledPresetList.length}组`);
    }

    // ==========================================
    // 初始化数据源 (Dreamy Voyage 音乐与预设)
    // ==========================================
    function initData() {
        if (window.songList && Array.isArray(window.songList)) {
            songList = window.songList;
        }

        // 优先载入 1754 组全量预设名称列表
        if (window.echosfallPresetNames && Array.isArray(window.echosfallPresetNames) && window.echosfallPresetNames.length > 0) {
            presetNames = window.echosfallPresetNames;
            console.log(`[Echosfall] 成功载入完整移植的 ${presetNames.length} 组预设列表`);
        } else if (window.echosfallPresets && typeof window.echosfallPresets === 'object') {
            presetNames = Object.keys(window.echosfallPresets);
        }

        if (window.echosfallPresets && typeof window.echosfallPresets === 'object') {
            presets = Object.assign({}, window.echosfallPresets);
        }

        buildSeededSequences(false);
        renderCatalog();
        updateModeButtonUI();
        initSettingsUI();
    }

    // 格式化歌曲展示标题 (仅保留序号和中英文，去除其后的 -Mastered、-old 等其他后缀)
    function formatTrackTitle(rawName) {
        if (!rawName) return 'Dreamy Voyage Track';
        let title = rawName.replace(/\.mp3$/i, '').trim();
        const parts = title.split('-');
        if (parts.length >= 3) {
            return `${parts[0].trim()}-${parts[1].trim()}-${parts[2].trim()}`;
        }
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
        const drawerH3 = document.querySelector('.drawer-header h3');
        if (drawerH3) {
            drawerH3.innerHTML = `<i class="fa-solid fa-compact-disc"></i> Dreamy Tracks (${songList.length})`;
        }

        catalogList.innerHTML = '';
        songList.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = 'catalog-item';
            if (currentItem && currentItem.song === song) {
                item.classList.add('active');
            }

            const isFav = isTrackFavorited(song);

            item.innerHTML = `
                <span class="catalog-item-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="catalog-item-title">${formatTrackTitle(song)}</span>
                <button type="button" class="catalog-item-fav ${isFav ? 'active' : ''}" title="${isFav ? 'Remove Favorite' : 'Favorite'}" data-echosfall-control="true">
                    <i class="${isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
                </button>
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                closeCatalog();
                const songIdx = shuffledSongList.indexOf(song);
                if (songIdx !== -1) {
                    songSequenceIndex = songIdx;
                }
                const selectedPreset = (shuffledPresetList.length > 0)
                    ? shuffledPresetList[songSequenceIndex % shuffledPresetList.length]
                    : pickPresetForSong(song, index);
                if (shuffledPresetList.length > 0) {
                    presetSequenceIndex = songSequenceIndex % shuffledPresetList.length;
                }
                playItem({ song, presetName: selectedPreset }, true);
                if (isPaused) {
                    resumePlayback();
                }
            });

            const btnFav = item.querySelector('.catalog-item-fav');
            if (btnFav) {
                btnFav.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleTrackFavorite(song);
                });
            }

            catalogList.appendChild(item);
        });
    }

    function updateCatalogFavorites() {
        const items = catalogList.querySelectorAll('.catalog-item');
        items.forEach((item, idx) => {
            const song = songList[idx];
            const btnFav = item.querySelector('.catalog-item-fav');
            if (btnFav && song) {
                const isFav = isTrackFavorited(song);
                if (isFav) {
                    btnFav.classList.add('active');
                    btnFav.title = 'Remove Favorite';
                    btnFav.innerHTML = '<i class="fa-solid fa-heart"></i>';
                } else {
                    btnFav.classList.remove('active');
                    btnFav.title = 'Favorite';
                    btnFav.innerHTML = '<i class="fa-regular fa-heart"></i>';
                }
            }
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
    // 队列控制 (下一首 / 上一首，确定性伪随机双向往返)
    // ==========================================
    function goNext() {
        if (songList.length === 0 || isSongSwitching) return;

        let nextSong = '';
        let nextPreset = '';

        if (playbackMode === 'sequence') {
            const currentSongIndex = currentItem ? songList.indexOf(currentItem.song) : -1;
            const nextIndex = (currentSongIndex + 1) % songList.length;
            nextSong = songList[nextIndex];
            nextPreset = pickPresetForSong(nextSong, nextIndex);
        } else {
            // 种子打乱伪随机模式：按重排顺序平稳切向下一首
            if (shuffledSongList.length === 0) buildSeededSequences(true);
            songSequenceIndex = (songSequenceIndex + 1) % shuffledSongList.length;
            nextSong = shuffledSongList[songSequenceIndex];

            // 预设游标同步推进至序列下一项
            if (shuffledPresetList.length > 0) {
                presetSequenceIndex = (presetSequenceIndex + 1) % shuffledPresetList.length;
                nextPreset = shuffledPresetList[presetSequenceIndex];
            } else {
                nextPreset = pickPresetForSong(nextSong, songSequenceIndex);
            }
        }

        console.log(`[Echosfall] 切换至下一首 [${songSequenceIndex + 1}/${shuffledSongList.length}]: ${nextSong}`);
        playItem({ song: nextSong, presetName: nextPreset }, true);
    }

    function goPrevious() {
        if (songList.length === 0 || isSongSwitching) return;

        let prevSong = '';
        let prevPreset = '';

        if (playbackMode === 'sequence') {
            const currentSongIndex = currentItem ? songList.indexOf(currentItem.song) : 0;
            const prevIndex = (currentSongIndex - 1 + songList.length) % songList.length;
            prevSong = songList[prevIndex];
            prevPreset = pickPresetForSong(prevSong, prevIndex);
        } else {
            // 种子打乱伪随机模式：回退至刚才播放的上一首 (支持精准双向往返)
            if (shuffledSongList.length === 0) buildSeededSequences(true);
            songSequenceIndex = (songSequenceIndex - 1 + shuffledSongList.length) % shuffledSongList.length;
            prevSong = shuffledSongList[songSequenceIndex];

            // 预设游标同步回退至刚才呈现的上一个效果
            if (shuffledPresetList.length > 0) {
                presetSequenceIndex = (presetSequenceIndex - 1 + shuffledPresetList.length) % shuffledPresetList.length;
                prevPreset = shuffledPresetList[presetSequenceIndex];
            } else {
                prevPreset = pickPresetForSong(prevSong, songSequenceIndex);
            }
        }

        console.log(`[Echosfall] 回退至上一首 [${songSequenceIndex + 1}/${shuffledSongList.length}]: ${prevSong}`);
        playItem({ song: prevSong, presetName: prevPreset }, false);
    }

    // ==========================================
    // 播放核心与可视化切换
    // ==========================================
    let isSongSwitching = false;

    async function playItem(item, isForward = true) {
        if (!item || !item.song) return;
        if (isSongSwitching) return;
        isSongSwitching = true;

        currentItem = item;
        updateCatalogActive();
        updatePauseModalUI();

        // 1. 触发曲名卡片动画 (与 Echosfall 原生规格一致: 7秒模糊进退动效)
        showTrackTitle(item.song, item.presetName);

        // 2. 加载并平滑过渡 Butterchurn 预设 (2.7s 官方推荐软切换)
        loadPresetIntoVisualizer(item.presetName);

        // 3. 切歌音量平滑渐变切换：
        // 若当前已有音乐正在播放，先执行 0.4s 优雅渐隐，消除生硬切歌与杂音
        if (!audio.paused && audio.src && gainNode && audioContext) {
            const fadeOutDuration = 0.4;
            const now = audioContext.currentTime;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeOutDuration);
            await new Promise(r => setTimeout(r, fadeOutDuration * 1000));
        }

        const songUrl = `./mp3s/${encodeURIComponent(item.song)}`;
        audio.src = songUrl;
        audio.load();

        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => undefined);
        }

        // 新歌曲起步音量置零，随后 0.6s 优雅渐入
        if (gainNode && audioContext) {
            const now = audioContext.currentTime;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(0.0001, now);
        }

        try {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    fadeInAudio(0.6);
                    isPaused = false;
                    startPresetAutoCycle();
                    updatePlayPauseButtonUI();
                }).catch(err => {
                    console.warn('[Echosfall] 音乐播放等待手势激活:', err);
                });
            } else {
                fadeInAudio(0.6);
                isPaused = false;
                startPresetAutoCycle();
                updatePlayPauseButtonUI();
            }
        } catch (err) {
            console.warn('[Echosfall] 音乐播放启动异常:', err);
        } finally {
            isSongSwitching = false;
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

    function updatePresetTitle(presetName) {
        presetNameEl.innerText = (presetName || 'REVERIE SPECTRUM').replace(/\.json$/i, '');
        // 依据系统设置：切换预设时是否展示底部信息卡片 (关闭时纯净呈现流体视觉)
        if (showInfoOnPresetSwitch) {
            titleCard.classList.remove('title-animate');
            void titleCard.offsetWidth;
            titleCard.classList.add('title-animate');
        }
    }

    // 预设效果切换：切换至下一个预设 (向右)
    async function switchNextPreset(soft = true) {
        if (shuffledPresetList.length === 0) {
            if (presetNames.length > 0) buildSeededSequences(true);
            else return;
        }
        presetSequenceIndex = (presetSequenceIndex + 1) % shuffledPresetList.length;
        const nextPName = shuffledPresetList[presetSequenceIndex];
        const bTime = soft ? presetBlendSeconds : 0;
        console.log(`[Echosfall] 切换至下一个预设 [${presetSequenceIndex + 1}/${shuffledPresetList.length}]: ${nextPName} (blendTime: ${bTime}s)`);
        await loadPresetIntoVisualizer(nextPName, bTime);
        startPresetAutoCycle();
    }

    // 预设效果切换：回退至上一个预设 (向左，可回退到刚才看过的效果)
    async function switchPrevPreset(soft = true) {
        if (shuffledPresetList.length === 0) {
            if (presetNames.length > 0) buildSeededSequences(true);
            else return;
        }
        presetSequenceIndex = (presetSequenceIndex - 1 + shuffledPresetList.length) % shuffledPresetList.length;
        const prevPName = shuffledPresetList[presetSequenceIndex];
        const bTime = soft ? presetBlendSeconds : 0;
        console.log(`[Echosfall] 回退至上一个预设 [${presetSequenceIndex + 1}/${shuffledPresetList.length}]: ${prevPName} (blendTime: ${bTime}s)`);
        await loadPresetIntoVisualizer(prevPName, bTime);
        startPresetAutoCycle();
    }

    // 兼容原调用的随机切预设别名
    function switchRandomPreset(soft = true) {
        return switchNextPreset(soft);
    }

    // 预设自动轮播计时器 (支持系统设置中的自定义时长 / 0为关闭)
    function startPresetAutoCycle() {
        stopPresetAutoCycle();
        if (isPaused || !hasStarted || presetCycleSeconds <= 0) return;
        presetAutoCycleTimer = setTimeout(() => {
            console.log(`[Echosfall] 预设播放 ${presetCycleSeconds}s 到期，自动软切换至下一个预设`);
            switchNextPreset(true);
        }, presetCycleSeconds * 1000);
    }

    function stopPresetAutoCycle() {
        if (presetAutoCycleTimer !== null) {
            clearTimeout(presetAutoCycleTimer);
            presetAutoCycleTimer = null;
        }
    }

    async function loadPresetIntoVisualizer(presetName, blendTime = presetBlendSeconds) {
        if (!visualizer) return;
        try {
            let presetData = presets[presetName];
            if (!presetData) {
                // 如果是按需从 1754 组预设库异步拉取
                const res = await fetch(`./presets/${encodeURIComponent(presetName)}.json`);
                if (res.ok) {
                    presetData = await res.json();
                    presets[presetName] = presetData; // 内存高速缓存
                } else {
                    console.warn(`[Echosfall] 预设文件请求未响应: ${presetName}`);
                    return;
                }
            }

            if (presetData) {
                visualizer.loadPreset(presetData, blendTime);
                if (currentItem) {
                    currentItem.presetName = presetName;
                }
                updatePresetTitle(presetName);
            }
        } catch (e) {
            console.warn('[Echosfall] visualizer.loadPreset 异常:', e);
        }
    }

    // 音量平滑淡入 (默认 1.0s)
    function fadeInAudio(duration = 1.0) {
        if (!gainNode || !audioContext) return;
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(1.0, now + duration);
    }

    // 音量平滑淡出并暂停 (默认 1.0s)
    function fadeOutAudioAndPause(duration = 1.0) {
        if (!gainNode || !audioContext) {
            audio.pause();
            return;
        }
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + duration);
        setTimeout(() => {
            if (isPaused || audio.paused) {
                audio.pause();
            }
        }, duration * 1000);
    }

    // 同步控制菜单播放/暂停按键的图标与文案
    function updatePlayPauseButtonUI() {
        const isAudioPlaying = !audio.paused && !isPaused;
        if (resumeIcon && resumeText) {
            if (isAudioPlaying) {
                resumeIcon.className = 'fa-solid fa-pause';
                resumeText.innerText = 'Pause';
                btnResume.title = 'Pause Playback (1s Fade Out)';
            } else {
                resumeIcon.className = 'fa-solid fa-play';
                resumeText.innerText = 'Play';
                btnResume.title = 'Resume Playback (1s Fade In)';
            }
        }
    }

    // 切换播放 / 暂停 (1s 音量平滑渐变)
    function togglePlayPause() {
        const isAudioPlaying = !audio.paused && !isPaused;
        if (isAudioPlaying) {
            // 正在播放中：点击后 1s 内音量平滑变小，暂停播放音乐
            isPaused = true;
            stopPresetAutoCycle();
            fadeOutAudioAndPause(1.0);
            updatePlayPauseButtonUI();
        } else {
            // 处于暂停状态：再次点击，1s 内音量平滑变大，继续播放音乐
            isPaused = false;
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch(() => undefined);
            }
            if (gainNode && audioContext) {
                gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
            }
            audio.play().then(() => {
                fadeInAudio(1.0);
                startPresetAutoCycle();
                updatePlayPauseButtonUI();
            }).catch(e => {
                console.warn('[Echosfall] 恢复播放拦截:', e);
            });
            updatePlayPauseButtonUI();
        }
    }

    function pausePlayback() {
        if (isPaused) return;
        isPaused = true;
        stopPresetAutoCycle();
        fadeOutAudioAndPause(1.0);
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

        if (gainNode && audioContext) {
            gainNode.gain.cancelScheduledValues(audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
        }

        audio.play().catch(e => console.warn('恢复播放拦截:', e));
        fadeInAudio(1.0);
        startPresetAutoCycle();
        updatePlayPauseButtonUI();
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
    // 收藏功能与心形跳动动效 (Double Tap / Favorite Button)
    // ==========================================
    function isTrackFavorited(song) {
        if (!song) return false;
        return favorites.has(song) || favorites.has(formatTrackTitle(song));
    }

    function toggleTrackFavorite(song) {
        if (!song) return;
        const trackTitle = formatTrackTitle(song);
        const isFav = isTrackFavorited(song);

        if (isFav) {
            favorites.delete(song);
            favorites.delete(trackTitle);
        } else {
            favorites.add(song);
        }

        try {
            localStorage.setItem('echosfall_favorites', JSON.stringify(Array.from(favorites)));
        } catch (e) {
            console.warn('写入收藏失败:', e);
        }

        // 触发 Echosfall 专属脉冲心形动效
        triggerHeartAnimation(!isFav);
        updatePauseModalUI();
        updateCatalogFavorites();
    }

    function toggleFavorite() {
        if (!currentItem || !currentItem.song) return;
        toggleTrackFavorite(currentItem.song);
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
    // 菜单浮层与模式切换 UI (呼出菜单时音乐持续播放)
    // ==========================================
    function showPauseModal() {
        updatePauseModalUI();
        pauseModal.classList.add('visible');
        if (topStatusBar) topStatusBar.classList.add('visible');
    }

    function hidePauseModal() {
        pauseModal.classList.remove('visible');
        if (topStatusBar) topStatusBar.classList.remove('visible');
    }

    function updateModeButtonUI() {
        if (playbackMode === 'random') {
            modeIcon.className = 'fa-solid fa-shuffle';
            modeText.innerText = 'Shuffle';
        } else {
            modeIcon.className = 'fa-solid fa-arrow-down-1-9';
            modeText.innerText = 'Sequential';
        }
    }

    function togglePlaybackMode() {
        playbackMode = (playbackMode === 'random') ? 'sequence' : 'random';
        localStorage.setItem('echosfall_playback_mode', playbackMode);
        updateModeButtonUI();
    }

    function updatePauseModalUI() {
        updateModeButtonUI();
        updatePlayPauseButtonUI();
        if (currentItem && currentItem.song) {
            const isFav = isTrackFavorited(currentItem.song);
            if (isFav) {
                favoriteStatusIcon.className = 'fa-solid fa-heart';
                favoriteStatusText.innerText = 'Favorited';
                btnToggleFavorite.style.color = '#fda4af';
                btnToggleFavorite.style.borderColor = 'rgba(244, 63, 94, 0.6)';
            } else {
                favoriteStatusIcon.className = 'fa-regular fa-heart';
                favoriteStatusText.innerText = 'Favorite Track';
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
    // 关于 Dreamy Voyage 模态窗口控制
    // ==========================================
    function showAboutModal() {
        hidePauseModal();
        if (aboutModal) {
            aboutModal.classList.remove('hidden');
        }
    }

    function hideAboutModal() {
        if (aboutModal) {
            aboutModal.classList.add('hidden');
        }
    }

    // ==========================================
    // Butterchurn 与 Web Audio 初始化
    // ==========================================
    function initWebAudio() {
        if (audioContext) {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => undefined);
            }
            return;
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => undefined);
            }
            if (!sourceNode) {
                sourceNode = audioContext.createMediaElementSource(audio);
                gainNode = audioContext.createGain();
                gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

                sourceNode.connect(gainNode);
                gainNode.connect(audioContext.destination);
            }
        } catch (e) {
            console.warn('[Echosfall] Web Audio 初始化注意:', e);
        }
    }

    function getVisualizerDimensions() {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
        const screenW = Math.max(window.innerWidth || 0, 320);
        const screenH = Math.max(window.innerHeight || 0, 320);
        const isPortrait = isMobile && screenH > screenW;

        // 依据系统设置中 7 档画质精准计算 DPR 缩放倍率 (默认第 4 档 1080P)
        const tierObj = QUALITY_TIERS.find(t => t.tier === currentQualityTier) || QUALITY_TIERS[3];
        const baseDpr = window.devicePixelRatio || 1;
        const pixelRatio = Math.max(0.45, Math.min(baseDpr * tierObj.scale, 3.0));
        const textureRatio = currentQualityTier >= 5 ? 1.0 : (currentQualityTier <= 2 ? 0.75 : 1.0);

        let renderW = screenW;
        let renderH = screenH;

        if (isPortrait) {
            // 手机竖屏状态：横向宽屏模型渲染尺寸 (长边为宽，短边为高)，对齐 PC 端横屏方向且零拉伸
            renderW = Math.max(screenW, screenH);
            renderH = Math.min(screenW, screenH);

            canvas.classList.add('portrait-rotated');
            canvas.style.top = '50%';
            canvas.style.left = '50%';
            canvas.style.width = `${screenH}px`;
            canvas.style.height = `${screenW}px`;
            canvas.style.transform = 'translate(-50%, -50%) rotate(90deg)';
        } else {
            canvas.classList.remove('portrait-rotated');
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100vw';
            canvas.style.height = '100dvh';
            canvas.style.transform = 'none';
        }

        return {
            renderW,
            renderH,
            pixelRatio,
            textureRatio,
            isPortrait
        };
    }

    function initButterchurnVisualizer() {
        if (visualizer) return;

        const bc = (window.butterchurn && typeof window.butterchurn.createVisualizer === 'function')
            ? window.butterchurn
            : ((window.butterchurn && window.butterchurn.default && typeof window.butterchurn.default.createVisualizer === 'function')
                ? window.butterchurn.default
                : null);

        if (!bc || typeof bc.createVisualizer !== 'function') {
            console.error('[Echosfall] Butterchurn 核心库未载入或未找到 createVisualizer 构造函数');
            return;
        }

        const dims = getVisualizerDimensions();
        const bufferW = Math.max(Math.floor(dims.renderW * dims.pixelRatio), 320);
        const bufferH = Math.max(Math.floor(dims.renderH * dims.pixelRatio), 240);

        // 显式保证 WebGL 画布绘图物理缓冲全屏高清分辨率
        canvas.width = bufferW;
        canvas.height = bufferH;

        try {
            // 注意：Butterchurn 的 renderToScreen 会直接以传入的 width/height 作为 WebGL 视口尺寸 (gl.viewport)
            // 因此必须将 width/height 设定为实际的 canvas 绘图物理缓冲像素尺寸 (bufferW/bufferH)，配合 pixelRatio=1，
            // 才能确保着色器 100% 铺满整个画布，杜绝只渲染左下角 1/4 屏幕导致无法全屏的缺陷！
            visualizer = bc.createVisualizer(audioContext, canvas, {
                width: bufferW,
                height: bufferH,
                pixelRatio: 1,
                textureRatio: dims.textureRatio
            });

            // 将 gainNode 频域数据连接到 visualizer
            visualizer.connectAudio(gainNode || sourceNode);
            startRenderLoop();
            console.log(`[Echosfall] Butterchurn Visualizer [画质第 ${currentQualityTier} 档] 开启全屏渲染: ${bufferW}x${bufferH} (竖屏旋转对齐: ${dims.isPortrait})`);

            // 如果当前已有正在播放项，立即同步加载预设
            if (currentItem && currentItem.presetName) {
                loadPresetIntoVisualizer(currentItem.presetName);
            }
        } catch (err) {
            console.error('[Echosfall] Butterchurn 创建失败:', err);
        }
    }

    function resizeVisualizer() {
        if (!visualizer) return;
        const dims = getVisualizerDimensions();
        const bufferW = Math.max(Math.floor(dims.renderW * dims.pixelRatio), 320);
        const bufferH = Math.max(Math.floor(dims.renderH * dims.pixelRatio), 240);

        canvas.width = bufferW;
        canvas.height = bufferH;

        visualizer.setRendererSize(bufferW, bufferH, {
            pixelRatio: 1,
            textureRatio: dims.textureRatio
        });
        console.log(`[Echosfall] Visualizer [画质第 ${currentQualityTier} 档] 适配更新: ${bufferW}x${bufferH} (竖屏旋转对齐: ${dims.isPortrait})`);
    }

    let pendingCaptureResolve = null;

    function captureNextRenderFrame() {
        return new Promise((resolve) => {
            if (!visualizer) {
                resolve(null);
                return;
            }
            pendingCaptureResolve = (webglCanvas) => {
                try {
                    // 在同一个渲染调用栈内立即同步抓取 WebGL 帧缓冲，杜绝缓冲区交换变黑
                    const snapCanvas = document.createElement('canvas');
                    snapCanvas.width = webglCanvas.width;
                    snapCanvas.height = webglCanvas.height;
                    const snapCtx = snapCanvas.getContext('2d');
                    if (snapCtx) {
                        snapCtx.drawImage(webglCanvas, 0, 0);
                    }
                    resolve(snapCanvas);
                } catch (err) {
                    console.warn('[Echosfall] Synchronous snapshot copy error:', err);
                    resolve(null);
                }
            };
            // 兜底超时避免后台标签页 RAF 降频卡住
            setTimeout(() => {
                if (pendingCaptureResolve) {
                    const cb = pendingCaptureResolve;
                    pendingCaptureResolve = null;
                    cb(canvas);
                }
            }, 600);
        });
    }

    function startRenderLoop() {
        if (renderAnimationFrameId) cancelAnimationFrame(renderAnimationFrameId);
        function loop() {
            if (visualizer) {
                visualizer.render();
                if (pendingCaptureResolve) {
                    const cb = pendingCaptureResolve;
                    pendingCaptureResolve = null;
                    try {
                        cb(canvas);
                    } catch (e) {
                        console.warn('[Echosfall] Frame capture callback error:', e);
                    }
                }
            }
            renderAnimationFrameId = requestAnimationFrame(loop);
        }
        loop();
    }

    // ==========================================
    // 9:16 手机竖屏视觉快照生成 & 分享系统
    // ==========================================
    let toastTimeout = null;
    function showToast(message, duration = 3000) {
        if (!toastEl) return;
        toastEl.innerText = message;
        toastEl.classList.remove('hidden');

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastEl.classList.add('hidden');
        }, duration);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function generateShareUrl() {
        const songIdx = (currentItem && currentItem.song) ? songList.indexOf(currentItem.song) : 0;
        const presetIdx = (currentItem && currentItem.presetName) ? presetNames.indexOf(currentItem.presetName) : -1;

        let base = 'https://dreamy.voyage/';
        if (window.location.hostname && !window.location.hostname.includes('dreamy.voyage') && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            base = `${window.location.origin}${window.location.pathname}`;
        }

        const params = new URLSearchParams();
        if (songIdx >= 0) params.set('s', songIdx);
        if (presetIdx >= 0) params.set('p', presetIdx);

        return `${base}?${params.toString()}`;
    }

    async function generateClean916Snapshot() {
        const snapCanvas = await captureNextRenderFrame();
        const sourceCanvas = snapCanvas || canvas;

        const offCanvas = document.createElement('canvas');
        const targetW = 1080;
        const targetH = 1920;
        offCanvas.width = targetW;
        offCanvas.height = targetH;
        const ctx = offCanvas.getContext('2d');
        if (!ctx) return null;

        const dims = getVisualizerDimensions();

        // 1. 绘制视觉画布主体
        ctx.save();
        if (dims.isPortrait) {
            // 手机竖屏状态：原 canvas 在屏幕上应用了 rotate(90deg)
            // 保持一致将其顺时针旋转 90 度以呈现正向竖屏视觉
            ctx.translate(targetW / 2, targetH / 2);
            ctx.rotate(90 * Math.PI / 180);
            const scale = Math.max(targetW / sourceCanvas.height, targetH / sourceCanvas.width);
            const w = sourceCanvas.width * scale;
            const h = sourceCanvas.height * scale;
            ctx.drawImage(sourceCanvas, -w / 2, -h / 2, w, h);
        } else {
            // PC 端或横屏：居中裁剪充满 9:16 竖屏手机画幅
            const scale = Math.max(targetW / sourceCanvas.width, targetH / sourceCanvas.height);
            const w = sourceCanvas.width * scale;
            const h = sourceCanvas.height * scale;
            const ox = (targetW - w) / 2;
            const oy = (targetH - h) / 2;
            ctx.drawImage(sourceCanvas, ox, oy, w, h);
        }
        ctx.restore();

        // 2. 底部暗色优雅渐变背景衬托文字
        const grad = ctx.createLinearGradient(0, targetH - 420, 0, targetH);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.35, 'rgba(6, 8, 20, 0.65)');
        grad.addColorStop(0.7, 'rgba(5, 6, 15, 0.88)');
        grad.addColorStop(1, 'rgba(3, 4, 10, 0.96)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, targetH - 420, targetW, 420);

        // 细微极光渐变分割线
        const lineGrad = ctx.createLinearGradient(60, targetH - 240, targetW - 60, targetH - 240);
        lineGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        lineGrad.addColorStop(0.2, 'rgba(56, 189, 248, 0.6)');
        lineGrad.addColorStop(0.8, 'rgba(236, 72, 153, 0.6)');
        lineGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, targetH - 240);
        ctx.lineTo(targetW - 60, targetH - 240);
        ctx.stroke();

        // 3. 歌曲名称与视觉预设信息
        const trackTitle = currentItem ? formatTrackTitle(currentItem.song) : 'Dreamy Voyage';
        const presetTitle = currentItem ? (currentItem.presetName || 'Reverie Spectrum').replace(/\.json$/i, '') : 'Echosfall';

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        // 歌曲名称
        ctx.font = '700 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const maxTextW = targetW - 140;
        let displayTrack = trackTitle;
        if (ctx.measureText(displayTrack).width > maxTextW) {
            while (displayTrack.length > 3 && ctx.measureText(displayTrack + '...').width > maxTextW) {
                displayTrack = displayTrack.slice(0, -1);
            }
            displayTrack += '...';
        }
        ctx.fillText(`🎵  ${displayTrack}`, 70, targetH - 290);

        // 预设名称
        ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#94a3b8';
        let displayPreset = `Preset: ${presetTitle}`;
        if (ctx.measureText(displayPreset).width > maxTextW) {
            while (displayPreset.length > 3 && ctx.measureText(displayPreset + '...').width > maxTextW) {
                displayPreset = displayPreset.slice(0, -1);
            }
            displayPreset += '...';
        }
        ctx.fillText(displayPreset, 74, targetH - 195);

        // 底部品牌水印
        ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('DREAMY VOYAGE', 74, targetH - 120);

        ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'right';
        ctx.fillText('dreamy.voyage', targetW - 74, targetH - 120);

        ctx.restore();

        return new Promise((resolve) => {
            offCanvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png', 0.95);
        });
    }

    let isSharing = false;
    async function handleShare() {
        if (isSharing) return;
        isSharing = true;

        const originalHtml = btnShare ? btnShare.innerHTML : '';
        if (btnShare) {
            btnShare.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Generating...</span>';
        }

        try {
            const trackTitle = currentItem ? formatTrackTitle(currentItem.song) : 'Dreamy Track';
            const shareUrl = generateShareUrl();
            const blob = await generateClean916Snapshot();

            if (!blob) {
                showToast('Failed to generate snapshot');
                if (btnShare) btnShare.innerHTML = originalHtml;
                isSharing = false;
                return;
            }

            const fileName = `DreamyVoyage_${trackTitle.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            const shareData = {
                title: `Dreamy Voyage - ${trackTitle}`,
                text: `✨ Immerse in "${trackTitle}" on Dreamy Voyage: ${shareUrl}`,
                url: shareUrl
            };

            // 快照生成完毕，提前恢复按键状态，防止系统原生分享面板遮挡等待时按键一直停留在转圈中
            if (btnShare) {
                btnShare.innerHTML = originalHtml;
            }
            isSharing = false;

            let sharedSuccessfully = false;

            // 1. 尝试系统原生分享 (包含 9:16 图片文件)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share(Object.assign({}, shareData, { files: [file] }));
                    sharedSuccessfully = true;
                } catch (shareErr) {
                    if (shareErr.name === 'AbortError') {
                        return; // 用户在系统弹窗中主动关闭
                    }
                    console.warn('[Echosfall] 携带文件分享未完成，尝试降级分享:', shareErr);
                }
            }

            // 2. 降级尝试无文件原生分享 (部分系统平台仅支持文本和 URL)
            if (!sharedSuccessfully && navigator.share) {
                try {
                    downloadBlob(blob, fileName);
                    await navigator.share(shareData);
                    sharedSuccessfully = true;
                } catch (shareErr) {
                    if (shareErr.name === 'AbortError') return;
                    console.warn('[Echosfall] 原生文本分享未完成，进入剪贴板降级:', shareErr);
                }
            }

            // 3. 桌面端或不支持原生分享环境：自动保存 9:16 手机竖屏高清截图 + 复制定向短链接
            if (!sharedSuccessfully) {
                downloadBlob(blob, fileName);
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(shareUrl);
                        showToast('✨ Snapshot saved & link copied to clipboard!');
                    } else {
                        showToast('✨ Snapshot saved to downloads!');
                    }
                } catch (clipErr) {
                    showToast('✨ Snapshot saved to downloads!');
                }
            }
        } catch (err) {
            console.error('[Echosfall] 分享处理异常:', err);
            showToast('Share failed');
            if (btnShare) {
                btnShare.innerHTML = originalHtml;
            }
            isSharing = false;
        }
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
        if (!hasStarted) return;
        if (isInteractiveTarget(e.target)) return;
        pointerState = {
            startX: e.clientX,
            startY: e.clientY
        };
    }

    function handlePointerUp(e) {
        if (!hasStarted) {
            pointerState = null;
            return;
        }
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

        // 手势交互判定：
        // 1. 手机上下滑动：切换音乐 (下滑切下一首，上滑切上一首)
        if (isVerticalSwipe) {
            if (isPaused) {
                resumePlayback();
            }
            const goForward = deltaY > 0;
            if (goForward) {
                goNext();
            } else {
                goPrevious();
            }
            return;
        }

        // 2. 手机左右滑动：双向切换预设 (右滑切下一个，左滑回退至刚才看过的上一个)
        if (isHorizontalSwipe) {
            const goForward = deltaX > 0;
            if (goForward) {
                console.log('[Echosfall] 移动端右滑触发：切换下一个预设');
                switchNextPreset(true);
            } else {
                console.log('[Echosfall] 移动端左滑触发：回退至上一个预设');
                switchPrevPreset(true);
            }
            return;
        }

        // 点击判定
        if (Math.hypot(deltaX, deltaY) <= TAP_DISTANCE) {
            handleTap();
        }
    }

    function handleTap() {
        if (!hasStarted) return;
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

        // 单击：打开或关闭菜单（音乐持续播放不停止）
        lastTapAt = now;
        tapTimer = setTimeout(() => {
            tapTimer = null;
            if (!hasStarted) return;
            if (!pauseModal.classList.contains('visible')) {
                showPauseModal();
            } else {
                hidePauseModal();
            }
        }, DOUBLE_TAP_MS);
    }

    // 键盘监听 (PC 端：方向键上下切歌/回退，方向键左右切换预设/回退，空格键亦支持软切)
    function handleKeyDown(e) {
        if (isInteractiveTarget(e.target)) return;

        // 方向键左右：切换与回退预设 (右 = 下一个，左 = 上一个/刚才看过的效果)
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            console.log('[Echosfall] 方向键 ArrowRight：切换下一个预设');
            switchNextPreset(true);
            return;
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            console.log('[Echosfall] 方向键 ArrowLeft：回退至上一个预设');
            switchPrevPreset(true);
            return;
        }

        // 方向键上下：切换与回退音乐 (下 = 下一首，上 = 上一首/刚才听过的歌曲)
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (isPaused) resumePlayback();
            goNext();
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (isPaused) resumePlayback();
            goPrevious();
            return;
        }

        // 空格键：亦支持快捷软切换下一个预设
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            console.log('[Echosfall] 空格键触发：切换下一个预设');
            switchNextPreset(true);
            return;
        }

        // Escape 键：关闭打开的设置窗口、关于页面或暂停菜单
        if (e.key === 'Escape') {
            if (settingsModal && !settingsModal.classList.contains('hidden')) {
                e.preventDefault();
                hideSettingsModal();
                return;
            }
            if (aboutModal && !aboutModal.classList.contains('hidden')) {
                e.preventDefault();
                hideAboutModal();
                return;
            }
            if (pauseModal && pauseModal.classList.contains('visible')) {
                e.preventDefault();
                hidePauseModal();
                return;
            }
        }
    }

    // ==========================================
    // 入场体验开启 (手势解锁 Web Audio & 全屏)
    // ==========================================
    function startExperience() {
        if (hasStarted) return;
        hasStarted = true;

        introOverlay.style.pointerEvents = 'none';
        introOverlay.style.opacity = '0';
        setTimeout(() => {
            introOverlay.style.display = 'none';
        }, 600);

        // 尝试触发全屏 (手机浏览器体验最佳)
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => undefined);
            } else if (document.documentElement.webkitRequestFullscreen) {
                try {
                    const res = document.documentElement.webkitRequestFullscreen();
                    if (res && res.catch) res.catch(() => undefined);
                } catch (e) {}
            }
        } catch (e) {}

        // 初始化音频与 Butterchurn
        initWebAudio();
        initButterchurnVisualizer();

        // 检查 URL 是否带参 ?s=X 或 ?song=X 以及 ?p=Y 或 ?preset=Y
        const urlParams = new URLSearchParams(window.location.search);
        const songParam = urlParams.get('s') || urlParams.get('song');
        const presetParam = urlParams.get('p') || urlParams.get('preset');

        let initialSongIndex = -1;
        if (songParam !== null && songParam !== '') {
            const idx = parseInt(songParam, 10);
            if (!isNaN(idx) && idx >= 0 && idx < songList.length) {
                initialSongIndex = idx;
            } else {
                const decoded = decodeURIComponent(songParam).toLowerCase();
                const foundIdx = songList.findIndex(s => s.toLowerCase().includes(decoded));
                if (foundIdx !== -1) initialSongIndex = foundIdx;
            }
        }

        if (initialSongIndex === -1 && songList.length > 0) {
            if (shuffledSongList.length > 0) {
                songSequenceIndex = 0;
                initialSongIndex = songList.indexOf(shuffledSongList[0]);
            } else {
                initialSongIndex = Math.floor(Math.random() * songList.length);
            }
        }

        const firstSong = (initialSongIndex !== -1 && songList[initialSongIndex])
            ? songList[initialSongIndex]
            : (shuffledSongList[0] || songList[0]);

        let firstPreset = '';
        if (presetParam !== null && presetParam !== '') {
            const pIdx = parseInt(presetParam, 10);
            if (!isNaN(pIdx) && pIdx >= 0 && pIdx < presetNames.length) {
                firstPreset = presetNames[pIdx];
            } else {
                const decodedP = decodeURIComponent(presetParam).toLowerCase();
                const foundP = presetNames.find(p => p.toLowerCase().includes(decodedP));
                if (foundP) firstPreset = foundP;
            }
        }

        if (!firstPreset) {
            if (shuffledPresetList.length > 0) {
                presetSequenceIndex = 0;
                firstPreset = shuffledPresetList[0];
            } else {
                firstPreset = pickPresetForSong(firstSong, initialSongIndex);
            }
        }

        console.log(`[Echosfall] 开启首发体验: 歌曲[${initialSongIndex}]="${firstSong}", 预设="${firstPreset}"`);
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
    // 系统设置窗口 (System Settings Modal) 交互控制
    // ==========================================
    function setQualityTier(tier) {
        tier = Math.max(1, Math.min(7, parseInt(tier, 10) || 4));
        currentQualityTier = tier;
        localStorage.setItem('echosfall_quality_tier', String(tier));
        updateQualityUI();
        resizeVisualizer();
    }

    function updateQualityUI() {
        if (!qualityRangeSlider || !qualityTierBadge) return;
        qualityRangeSlider.value = currentQualityTier;
        const tierObj = QUALITY_TIERS.find(t => t.tier === currentQualityTier) || QUALITY_TIERS[3];
        qualityTierBadge.innerText = tierObj.label;
    }

    function setCycleDuration(seconds) {
        seconds = Math.max(0, parseInt(seconds, 10) || 0);
        presetCycleSeconds = seconds;
        localStorage.setItem('echosfall_preset_cycle_seconds', String(seconds));
        updateCycleUI();
        startPresetAutoCycle();
    }

    function updateCycleUI() {
        if (!cycleRangeSlider || !cycleDurationBadge) return;
        cycleRangeSlider.value = presetCycleSeconds;
        if (presetCycleSeconds === 0) {
            cycleDurationBadge.innerText = 'Disabled (Manual Only)';
            cycleDurationBadge.className = 'settings-badge badge-purple';
        } else if (presetCycleSeconds === 30) {
            cycleDurationBadge.innerText = '30s (Default)';
            cycleDurationBadge.className = 'settings-badge badge-purple';
        } else {
            cycleDurationBadge.innerText = `${presetCycleSeconds}s`;
            cycleDurationBadge.className = 'settings-badge badge-purple';
        }
    }

    function setPresetBlendDuration(seconds) {
        presetBlendSeconds = Math.max(0, parseFloat(seconds) || 0);
        localStorage.setItem('echosfall_preset_blend_seconds', String(presetBlendSeconds));
        updateBlendUI();
    }

    function updateBlendUI() {
        if (!blendDurationBadge) return;
        let desc = `${presetBlendSeconds}s`;
        if (presetBlendSeconds === 0) desc = 'Instant (0s)';
        else if (presetBlendSeconds === 1.5) desc = 'Smooth (1.5s)';
        else if (presetBlendSeconds === 2.7) desc = '2.7s (Dreamy Default)';
        else if (presetBlendSeconds === 4.5) desc = 'Ethereal (4.5s)';
        blendDurationBadge.innerText = desc;

        if (blendSegmentedGroup) {
            const btns = blendSegmentedGroup.querySelectorAll('.btn-segment');
            btns.forEach(btn => {
                const bVal = parseFloat(btn.getAttribute('data-blend'));
                if (Math.abs(bVal - presetBlendSeconds) < 0.1) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    function setPresetHudVisibility(visible) {
        showInfoOnPresetSwitch = Boolean(visible);
        localStorage.setItem('echosfall_preset_hud_visible', String(showInfoOnPresetSwitch));
        updatePresetHudUI();
    }

    function updatePresetHudUI() {
        if (!presetHudBadge) return;
        if (showInfoOnPresetSwitch) {
            presetHudBadge.innerText = 'Show Info Box (Default)';
            presetHudBadge.className = 'settings-badge badge-cyan';
        } else {
            presetHudBadge.innerText = 'Hidden (Pure Visual)';
            presetHudBadge.className = 'settings-badge badge-purple';
        }

        if (presetHudSegmentedGroup) {
            const btns = presetHudSegmentedGroup.querySelectorAll('.btn-segment');
            btns.forEach(btn => {
                const val = btn.getAttribute('data-hud');
                if ((val === 'show' && showInfoOnPresetSwitch) || (val === 'hide' && !showInfoOnPresetSwitch)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    function setCustomSeed(newSeed) {
        const cleanSeed = (newSeed || '').trim();
        if (!cleanSeed) {
            localStorage.removeItem('echosfall_custom_seed');
            currentSeed = getDailySeedString();
            isCustomSeed = false;
        } else {
            currentSeed = cleanSeed;
            isCustomSeed = true;
            localStorage.setItem('echosfall_custom_seed', cleanSeed);
        }
        buildSeededSequences(true);
        updateSeedUI();
    }

    function updateSeedUI() {
        if (!seedInput || !seedModeBadge) return;
        seedInput.value = currentSeed;
        if (isCustomSeed) {
            seedModeBadge.innerText = 'Custom Seed';
            seedModeBadge.className = 'settings-badge badge-cyan';
        } else {
            seedModeBadge.innerText = 'Daily Auto';
            seedModeBadge.className = 'settings-badge badge-amber';
        }
    }

    function resetAllSettingsToDefaults() {
        localStorage.removeItem('echosfall_quality_tier');
        localStorage.removeItem('echosfall_preset_cycle_seconds');
        localStorage.removeItem('echosfall_preset_blend_seconds');
        localStorage.removeItem('echosfall_preset_hud_visible');
        localStorage.removeItem('echosfall_custom_seed');

        currentQualityTier = 4;
        presetCycleSeconds = DEFAULT_PRESET_AUTO_CYCLE;
        presetBlendSeconds = DEFAULT_PRESET_BLEND_DURATION;
        showInfoOnPresetSwitch = true;
        currentSeed = getDailySeedString();
        isCustomSeed = false;

        buildSeededSequences(true);
        updateQualityUI();
        updateCycleUI();
        updateBlendUI();
        updatePresetHudUI();
        updateSeedUI();
        resizeVisualizer();
        startPresetAutoCycle();

        showToast('Settings restored to defaults');
    }

    function showSettingsModal() {
        if (!settingsModal) return;
        updateQualityUI();
        updateCycleUI();
        updateBlendUI();
        updatePresetHudUI();
        updateSeedUI();
        settingsModal.classList.remove('hidden');
    }

    function hideSettingsModal() {
        if (!settingsModal) return;
        settingsModal.classList.add('hidden');
    }

    function initSettingsUI() {
        updateQualityUI();
        updateCycleUI();
        updateBlendUI();
        updatePresetHudUI();
        updateSeedUI();
    }

    // ==========================================
    // 事件挂载
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initData();

        // 首屏解锁：严格采用移动端标准用户激活手势 (touchend / pointerup / click)
        // 注意：绝不能监听 touchstart，因移动端 WebKit/Blink 在 touchstart 阶段尚未授予媒体播放权限
        const triggerStart = (e) => {
            if (e) {
                e.stopPropagation();
            }
            startExperience();
        };

        introOverlay.addEventListener('click', triggerStart);
        introOverlay.addEventListener('touchend', triggerStart);
        introOverlay.addEventListener('pointerup', triggerStart);

        // 移动端音频自动重试保障：任何后续触摸自动 resume 并启动播放
        const ensureMobileAudioPlayback = () => {
            if (hasStarted && audio.paused && !isPaused) {
                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume().catch(() => undefined);
                }
                audio.play().then(() => {
                    fadeInAudio();
                }).catch(() => undefined);
            }
        };
        window.addEventListener('touchend', ensureMobileAudioPlayback, { passive: true });
        window.addEventListener('click', ensureMobileAudioPlayback);

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

        // 菜单浮层背景点击：点击各个功能按键之外的区域，关闭界面，继续播放音乐
        pauseModal.addEventListener('click', (e) => {
            if (e.target.closest('button, a')) {
                return;
            }
            e.stopPropagation();
            hidePauseModal();
        });

        // 菜单界面按键：暂停 / 播放切换 (1s 音量平滑渐变)
        btnResume.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlayPause();
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

        if (btnNextPreset) {
            btnNextPreset.addEventListener('click', (e) => {
                e.stopPropagation();
                switchNextPreset(true);
            });
        }

        if (btnShare) {
            btnShare.addEventListener('click', (e) => {
                e.stopPropagation();
                handleShare();
            });
        }

        // 打开系统设置窗口
        if (btnOpenSettings) {
            btnOpenSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                hidePauseModal();
                showSettingsModal();
            });
        }

        // 系统设置窗口按键与交互
        if (btnCloseSettings) {
            btnCloseSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                hideSettingsModal();
            });
        }

        if (btnBackSettings) {
            btnBackSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                hideSettingsModal();
            });
        }

        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target.closest('.settings-modal-dialog')) {
                    return;
                }
                e.stopPropagation();
                hideSettingsModal();
            });
        }

        if (qualityRangeSlider) {
            qualityRangeSlider.addEventListener('input', (e) => {
                setQualityTier(e.target.value);
            });
        }

        if (cycleRangeSlider) {
            cycleRangeSlider.addEventListener('input', (e) => {
                setCycleDuration(e.target.value);
            });
        }

        if (btnApplySeed) {
            btnApplySeed.addEventListener('click', (e) => {
                e.stopPropagation();
                setCustomSeed(seedInput.value);
                showToast(`Seed applied: ${currentSeed}`);
            });
        }

        if (btnSeedDaily) {
            btnSeedDaily.addEventListener('click', (e) => {
                e.stopPropagation();
                setCustomSeed('');
                showToast(`Daily seed restored: ${currentSeed}`);
            });
        }

        if (btnSeedRoll) {
            btnSeedRoll.addEventListener('click', (e) => {
                e.stopPropagation();
                const rndHex = Math.random().toString(36).substring(2, 8).toUpperCase();
                setCustomSeed(`DV-${rndHex}`);
                showToast(`New seed rolled: ${currentSeed}`);
            });
        }

        if (blendSegmentedGroup) {
            blendSegmentedGroup.addEventListener('click', (e) => {
                const segBtn = e.target.closest('.btn-segment');
                if (!segBtn) return;
                e.stopPropagation();
                const bVal = segBtn.getAttribute('data-blend');
                setPresetBlendDuration(bVal);
            });
        }

        if (presetHudSegmentedGroup) {
            presetHudSegmentedGroup.addEventListener('click', (e) => {
                const segBtn = e.target.closest('.btn-segment');
                if (!segBtn) return;
                e.stopPropagation();
                const hudMode = segBtn.getAttribute('data-hud');
                setPresetHudVisibility(hudMode === 'show');
            });
        }

        if (btnResetSettings) {
            btnResetSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                resetAllSettingsToDefaults();
            });
        }

        // 关于页面按键与背景交互
        if (btnOpenAbout) {
            btnOpenAbout.addEventListener('click', (e) => {
                e.stopPropagation();
                showAboutModal();
            });
        }

        if (btnCloseAbout) {
            btnCloseAbout.addEventListener('click', (e) => {
                e.stopPropagation();
                hideAboutModal();
            });
        }

        if (btnBackAbout) {
            btnBackAbout.addEventListener('click', (e) => {
                e.stopPropagation();
                hideAboutModal();
            });
        }

        if (aboutModal) {
            aboutModal.addEventListener('click', (e) => {
                if (e.target.closest('.about-modal-dialog')) {
                    return;
                }
                e.stopPropagation();
                hideAboutModal();
            });
        }

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
