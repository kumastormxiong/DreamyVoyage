/**
 * DREAMY VOYAGE // BLIND TEST EXPERIMENT ENGINE
 * Features:
 * - Blind random mystery track loading
 * - Anti-rush immersion window (15s scrub lock, permanently unlocked once 15s reached)
 * - Smooth drag & click seeking on progress bar
 * - 3 Silent scoring stages (10s, 60s, Outro) - No disruptive unlock sounds while listening!
 * - RMS Formula: round( sqrt( (s1^2 + s2^2 + s3^2) / 3 ) )
 * - UNIFIED DUAL BENCHMARK REVEAL CARD (Creator Score & Community Median Comparison in Single Window)
 * - Persistent Community Stats Engine (localStorage + mathematical median of all valid scorers)
 * - High-res PNG Certificate Canvas Export
 */

const ALBUM_DATA = [
    { id: 69, titleZH: "遐想绮丽", titleEN: "Daydreaming Gorgeous", authorScore: 86, file: "69-遐想绮丽-Daydreaming Gorgeous-Mastered.mp3", duration: "04:27", durSec: 267 },
    { id: 70, titleZH: "层次灵感", titleEN: "Level Inspiration", authorScore: 84, file: "70-层次灵感-Level Inspiration-Mastered.mp3", duration: "04:16", durSec: 256 },
    { id: 71, titleZH: "因果谬论", titleEN: "Causal Absurdity", authorScore: 87, file: "71-因果谬论-Causal Absurdity-Mastered.mp3", duration: "03:42", durSec: 222 },
    { id: 72, titleZH: "漩涡窒息感", titleEN: "Vortex Asphyxiation", authorScore: 85, file: "72-漩涡窒息感-Vortex Asphyxiation-Mastered.mp3", duration: "03:21", durSec: 201 },
    { id: 73, titleZH: "妄想独奏", titleEN: "Delusion Solo", authorScore: 85, file: "73-妄想独奏-Delusion Solo-Mastered.mp3", duration: "05:13", durSec: 313 },
    { id: 74, titleZH: "噪点彷徨", titleEN: "Noise Wandering", authorScore: 84, file: "74-噪点彷徨-Noise Wandering-Mastered.mp3", duration: "04:03", durSec: 243 },
    { id: 75, titleZH: "自如升华", titleEN: "Fluidity Sublime", authorScore: 85, file: "75-自如升华-Fluidity Sublime-Mastered.mp3", duration: "02:31", durSec: 151 },
    { id: 76, titleZH: "迷失进化", titleEN: "Lostness Evolution", authorScore: 86, file: "76-迷失进化-Lostness Evolution-Mastered.mp3", duration: "01:36", durSec: 96 },
    { id: 77, titleZH: "陶醉玄境", titleEN: "Enchantment Mystical", authorScore: 86, file: "77-陶醉玄境-Enchantment Mystical-Mastered.mp3", duration: "06:08", durSec: 368 }
];

/**
 * Reuse DreamyVoyage root song-list.js resource
 * Dynamically match and sync audio filenames with homepage
 */
function syncAlbumWithSongList(data) {
    if (!window.songList || !Array.isArray(window.songList)) return data;
    return data.map(item => {
        const prefix1 = `${item.id}-`;
        const prefix2 = item.id < 10 ? `0${item.id}-` : `${item.id}-`;
        const matched = window.songList.find(s => s.startsWith(prefix1) || s.startsWith(prefix2));
        if (matched) {
            return { ...item, file: matched };
        }
        return item;
    });
}

/**
 * Community Statistics Engine
 */
class CommunityStatsManager {
    constructor(onLiveStatsUpdated) {
        this.storageKey = 'DREAMY_VOYAGE_COMMUNITY_STATS_V2';
        this.apiEndpoint = window.D1_API_ENDPOINT || 'https://dreamy-blind-test-api.kuma-storm-xiong-5dc.workers.dev';
        this.onLiveStatsUpdated = onLiveStatsUpdated;
        this.data = this.loadData();
        this.fetchLiveStats();
    }

    getDefaultSeed() {
        return {
            69: { count: 87, scores: [84, 85, 86, 86, 85, 87, 86, 84, 86, 85, 86, 86, 87, 85] },
            70: { count: 64, scores: [82, 83, 84, 84, 83, 85, 84, 83, 84, 82, 84, 83, 83, 84] },
            71: { count: 112, scores: [86, 87, 88, 87, 86, 88, 87, 86, 87, 87, 86, 88, 87, 86] },
            72: { count: 78, scores: [84, 85, 85, 84, 86, 85, 84, 85, 85, 86, 84, 85, 85, 84] },
            73: { count: 95, scores: [84, 85, 86, 85, 84, 85, 85, 86, 85, 84, 85, 86, 85, 86] },
            74: { count: 58, scores: [82, 83, 84, 84, 83, 85, 84, 83, 84, 82, 84, 83, 84, 83] },
            75: { count: 73, scores: [83, 84, 85, 85, 84, 86, 85, 84, 85, 85, 84, 85, 84, 85] },
            76: { count: 81, scores: [85, 86, 86, 85, 87, 86, 85, 86, 86, 86, 85, 87, 86, 85] },
            77: { count: 90, scores: [85, 86, 86, 85, 87, 86, 85, 86, 87, 86, 85, 86, 86, 86] }
        };
    }

    loadData() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('Failed to load community stats from localStorage:', e);
        }
        const seed = this.getDefaultSeed();
        this.saveData(seed);
        return seed;
    }

    saveData(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save community stats:', e);
        }
    }

    async fetchLiveStats() {
        if (!this.apiEndpoint) return;
        try {
            const resp = await fetch(`${this.apiEndpoint}/api/stats`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.status === 'ok' && data.stats) {
                for (const tid in data.stats) {
                    const item = data.stats[tid];
                    if (!this.data[tid]) {
                        this.data[tid] = { count: item.count, scores: [item.median], median: item.median };
                    } else {
                        this.data[tid].count = item.count;
                        this.data[tid].median = item.median;
                    }
                }
                this.saveData(this.data);
                if (typeof this.onLiveStatsUpdated === 'function') {
                    this.onLiveStatsUpdated(this.data);
                }
            }
        } catch (e) {
            console.info('[D1 Sync] Offline or local mode active:', e.message);
        }
    }

    recordScore(trackId, finalScore, stages = {}) {
        if (!this.data[trackId]) {
            this.data[trackId] = { count: 0, scores: [] };
        }
        if (!Array.isArray(this.data[trackId].scores)) {
            this.data[trackId].scores = [];
        }
        this.data[trackId].scores.push(finalScore);
        this.data[trackId].count = (this.data[trackId].count || 0) + 1;
        this.saveData(this.data);

        // Background async submission to Cloudflare D1
        this.submitScoreToD1(trackId, finalScore, stages);

        return this.getTrackStats(trackId);
    }

    async submitScoreToD1(trackId, finalScore, stages = {}) {
        if (!this.apiEndpoint) return;
        try {
            const payload = {
                trackId: parseInt(trackId, 10),
                score: parseInt(finalScore, 10),
                stage1: stages.stage1 !== undefined && stages.stage1 !== null ? parseInt(stages.stage1, 10) : null,
                stage2: stages.stage2 !== undefined && stages.stage2 !== null ? parseInt(stages.stage2, 10) : null,
                stage3: stages.stage3 !== undefined && stages.stage3 !== null ? parseInt(stages.stage3, 10) : null
            };
            const resp = await fetch(`${this.apiEndpoint}/api/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                mode: 'cors'
            });
            if (resp.ok) {
                const res = await resp.json();
                if (res.status === 'ok' && res.median !== undefined) {
                    if (this.data[trackId]) {
                        this.data[trackId].count = res.count;
                        this.data[trackId].median = res.median;
                        this.saveData(this.data);
                    }
                    if (typeof this.onLiveStatsUpdated === 'function') {
                        this.onLiveStatsUpdated(this.data, trackId, res);
                    }
                }
            }
        } catch (e) {
            console.info('[D1 Sync] Score recorded locally (D1 sync offline):', e.message);
        }
    }

    getTrackStats(trackId) {
        const item = this.data[trackId] || { count: 1, scores: [85], median: 85 };
        const sorted = (item.scores && item.scores.length > 0) ? [...item.scores].sort((a, b) => a - b) : [];
        let median = item.median !== undefined ? item.median : 85;
        if (sorted.length > 0 && item.median === undefined) {
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        }
        return {
            count: item.count || 1,
            median: median
        };
    }
}

class BlindTestApp {
    constructor() {
        this.audio = document.getElementById('native-audio');
        this.tracks = syncAlbumWithSongList(ALBUM_DATA);
        this.currentTrack = null;
        this.ratedTrackIds = new Set();
        this.isPlaying = false;
        this.audioContext = null;
        this.analyser = null;
        this.audioSource = null;

        // Scoring states
        this.s1Unlocked = false;
        this.s2Unlocked = false;
        this.s3Unlocked = false;
        this.score1 = null;
        this.score2 = null;
        this.score3 = null;
        this.currentFinalScore = null;

        // Immersion scrubbing lock threshold (15s)
        this.scrubLockSeconds = 15;
        this.hasPassed15s = false;
        this.isDragging = false;

        // Card modes: 'creator' | 'community'
        this.currentBadgeMode = 'creator';
        this.communityManager = new CommunityStatsManager((data, updatedTrackId, res) => {
            this.handleLiveCommunityUpdate(data, updatedTrackId, res);
        });

        this.initDOM();
        this.bindEvents();
        this.loadRandomTrack();
        this.initVisualizer();
    }

    initDOM() {
        // Elements
        this.elPlayBtn = document.getElementById('btn-play');
        this.elPlayIcon = document.getElementById('play-icon');
        this.elPlayText = document.getElementById('play-text');
        this.elRerollBtn = document.getElementById('btn-reroll');
        this.elVolSlider = document.getElementById('vol-slider');

        // Prime 7 Restricted Selector & Matrix
        this.elBtnNextPrime7 = document.getElementById('btn-next-prime7-track');
        this.prime7Matrix = document.getElementById('prime7-matrix');

        // Butterchurn Preset & HUD Collapse Controls
        this.elBtnNextPreset = document.getElementById('btn-next-preset');
        this.elBtnToggleHud = document.getElementById('btn-toggle-hud');
        this.elBtnFloatingHud = document.getElementById('btn-floating-hud-toggle');
        this.elMainHudContainer = document.getElementById('main-hud-container');
        this.elPillCurrentScore = document.getElementById('pill-current-score');

        this.elCurrentTime = document.getElementById('time-current');
        this.elTotalTime = document.getElementById('time-total');
        this.elSeekBarTrack = document.getElementById('seek-bar-track');
        this.elSeekBarFill = document.getElementById('seek-bar-fill');
        this.elSeekThumb = document.getElementById('seek-thumb');
        this.elScrubIndicator = document.getElementById('scrub-indicator');
        this.elScrubStatusTop = document.getElementById('hud-scrub-status');
        this.elScrubToast = document.getElementById('scrub-toast');

        this.elMarker10 = document.getElementById('marker-10s');
        this.elMarker60 = document.getElementById('marker-60s');
        this.elMarkerOutro = document.getElementById('marker-outro');

        this.elCard1 = document.getElementById('stage-card-1');
        this.elCard2 = document.getElementById('stage-card-2');
        this.elCard3 = document.getElementById('stage-card-3');

        this.elBadge1 = document.getElementById('stage-badge-1');
        this.elBadge2 = document.getElementById('stage-badge-2');
        this.elBadge3 = document.getElementById('stage-badge-3');

        this.elRange1 = document.getElementById('range-s1');
        this.elRange2 = document.getElementById('range-s2');
        this.elRange3 = document.getElementById('range-s3');

        this.elDisplay1 = document.getElementById('display-s1');
        this.elDisplay2 = document.getElementById('display-s2');
        this.elDisplay3 = document.getElementById('display-s3');

        this.elPills1 = document.getElementById('pills-s1');
        this.elPills2 = document.getElementById('pills-s2');
        this.elPills3 = document.getElementById('pills-s3');

        this.elMedianPreview = document.getElementById('median-preview');
        this.elBtnSubmit = document.getElementById('btn-submit');
        this.elTestedCount = document.getElementById('hud-tested-count');
        this.elSubjectCode = document.getElementById('hud-subject-code');
        this.elGlitchHash = document.getElementById('glitch-hash');

        this.elModal = document.getElementById('reveal-modal');
        this.elBtnCloseModal = document.getElementById('btn-close-modal');
        this.elBtnShareBadge = document.getElementById('btn-share-badge');
        this.elBtnCopyReddit = document.getElementById('btn-copy-reddit');
        this.elBtnNextTrack = document.getElementById('btn-next-track');
        this.badgeCaptureArea = document.getElementById('badge-capture-area');

        // Welcome / Rules Modal
        this.elWelcomeModal = document.getElementById('welcome-modal');
        this.elBtnStartExperiment = document.getElementById('btn-start-experiment');
    }

    bindEvents() {
        // Play / Pause
        if (this.elPlayBtn) {
            this.elPlayBtn.addEventListener('click', () => this.togglePlay());
        }

        // Welcome Modal Start Button: dismiss modal and start playback!
        if (this.elBtnStartExperiment) {
            this.elBtnStartExperiment.addEventListener('click', () => {
                window.CyberFX.playClick();
                if (this.elWelcomeModal) this.elWelcomeModal.classList.remove('show');
                this.playAudio();
            });
        }

        // Prime 7 Next Track button -> Auto-play next track!
        if (this.elBtnNextPrime7) {
            this.elBtnNextPrime7.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.switchPrime7Track(1, true);
            });
        }

        // Legacy reroll button if present
        if (this.elRerollBtn) {
            this.elRerollBtn.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.loadRandomTrack();
            });
        }

        // Prime 7 Matrix Click -> Auto-play selected track!
        if (this.prime7Matrix) {
            this.prime7Matrix.addEventListener('click', (e) => {
                const pill = e.target.closest('.prime7-track-pill');
                if (!pill) return;
                const idx = parseInt(pill.dataset.index, 10);
                if (!isNaN(idx)) {
                    window.CyberFX.playClick();
                    this.loadTrackByIndex(idx, true);
                }
            });
        }

        // Butterchurn Preset Switcher
        if (this.elBtnNextPreset) {
            this.elBtnNextPreset.addEventListener('click', () => {
                window.CyberFX.playClick();
                if (window.ButterchurnEngine) {
                    window.ButterchurnEngine.nextPreset();
                }
            });
        }

        // Minimize HUD to enjoy full-screen visualizer
        if (this.elBtnToggleHud) {
            this.elBtnToggleHud.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.setHudMinimized(true);
            });
        }

        // Restore HUD from floating pill
        if (this.elBtnFloatingHud) {
            this.elBtnFloatingHud.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.setHudMinimized(false);
            });
        }

        // Volume
        if (this.elVolSlider) {
            this.elVolSlider.addEventListener('input', (e) => {
                this.audio.volume = parseFloat(e.target.value);
            });
        }

        // Audio events
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
        this.audio.addEventListener('ended', () => this.onAudioEnded());
        this.audio.addEventListener('error', (err) => this.onAudioError(err));

        // Smooth Scrubbing / Dragging (Desktop Mouse & Mobile Touch)
        const onDragStart = (e) => {
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            if (!this.hasPassed15s) {
                window.CyberFX.playWarning();
                this.flashScrubWarning();
                return;
            }
            this.isDragging = true;
            this.seekFromClientX(clientX);
        };

        const onDragMove = (e) => {
            if (!this.isDragging) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            this.seekFromClientX(clientX);
        };

        const onDragEnd = () => {
            if (this.isDragging) {
                this.isDragging = false;
            }
        };

        // Mouse events
        if (this.elSeekBarTrack) {
            this.elSeekBarTrack.addEventListener('mousedown', onDragStart);
        }
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);

        // Touch events
        if (this.elSeekBarTrack) {
            this.elSeekBarTrack.addEventListener('touchstart', onDragStart, { passive: true });
        }
        window.addEventListener('touchmove', onDragMove, { passive: true });
        window.addEventListener('touchend', onDragEnd);

        // Scoring Sliders & Pills
        this.setupScoreStage(1, this.elRange1, this.elDisplay1, this.elPills1, (v) => { this.score1 = v; });
        this.setupScoreStage(2, this.elRange2, this.elDisplay2, this.elPills2, (v) => { this.score2 = v; });
        this.setupScoreStage(3, this.elRange3, this.elDisplay3, this.elPills3, (v) => { this.score3 = v; });

        // Submit Button
        if (this.elBtnSubmit) {
            this.elBtnSubmit.addEventListener('click', () => this.submitScores());
        }

        // Modal handlers
        if (this.elBtnCloseModal) {
            this.elBtnCloseModal.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.elModal.classList.remove('show');
            });
        }

        // Unified Share or Download button
        if (this.elBtnShareBadge) {
            this.elBtnShareBadge.addEventListener('click', () => this.shareOrDownloadBadge());
        }

        // Copy Share Text
        if (this.elBtnCopyReddit) {
            this.elBtnCopyReddit.addEventListener('click', () => this.copyShareText());
        }

        // Next Track (Modal button -> Close modal and auto-play next track!)
        if (this.elBtnNextTrack) {
            this.elBtnNextTrack.addEventListener('click', () => {
                window.CyberFX.playClick();
                this.elModal.classList.remove('show');
                this.switchPrime7Track(1, true);
            });
        }
    }

    setHudMinimized(isMin) {
        if (isMin) {
            if (this.elMainHudContainer) this.elMainHudContainer.classList.add('minimized');
            if (this.elBtnFloatingHud) this.elBtnFloatingHud.classList.remove('hidden');
        } else {
            if (this.elMainHudContainer) this.elMainHudContainer.classList.remove('minimized');
            if (this.elBtnFloatingHud) this.elBtnFloatingHud.classList.add('hidden');
        }
    }

    switchPrime7Track(delta = 1, autoPlay = true) {
        if (!this.currentTrack) {
            this.loadTrackByIndex(0, autoPlay);
            return;
        }
        const currentIndex = this.tracks.findIndex(t => t.id === this.currentTrack.id);
        const nextIndex = (currentIndex + delta + this.tracks.length) % this.tracks.length;
        this.loadTrackByIndex(nextIndex, autoPlay);
    }

    loadTrackByIndex(index, autoPlay = false) {
        if (index < 0 || index >= this.tracks.length) index = 0;
        const picked = this.tracks[index];
        this.currentTrack = picked;

        // Reset state
        this.resetTrackState();

        // 100% Anonymous display: NEVER reveal track ID or sequence!
        if (this.elSubjectCode) this.elSubjectCode.textContent = 'ANONYMOUS STREAM';
        if (this.elGlitchHash) this.elGlitchHash.textContent = '[0x????]';

        // Update Prime 7 Matrix pills
        this.updatePrime7MatrixUI();

        // Transition Butterchurn Preset with smooth natural 3s cross-fade!
        if (window.ButterchurnEngine) {
            window.ButterchurnEngine.randomPreset(3.0);
        }

        // Set Audio source
        const audioSrc = `../mp3s/${encodeURIComponent(picked.file)}`;
        this.audio.src = audioSrc;
        this.audio.load();

        if (autoPlay) {
            const onCanPlay = () => {
                this.playAudio().catch(() => {});
            };
            this.audio.addEventListener('canplay', onCanPlay, { once: true });
            this.playAudio().catch(() => {});
        }
    }

    updatePrime7MatrixUI() {
        if (!this.prime7Matrix) return;
        const pills = this.prime7Matrix.querySelectorAll('.prime7-track-pill');
        pills.forEach((pill, idx) => {
            const track = this.tracks[idx];
            if (!track) return;
            if (this.currentTrack && track.id === this.currentTrack.id) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
            if (this.ratedTrackIds.has(track.id)) {
                pill.classList.add('rated');
            } else {
                pill.classList.remove('rated');
            }
        });
    }

    seekFromClientX(clientX) {
        if (!this.hasPassed15s) return;
        const dur = this.audio.duration || (this.currentTrack ? this.currentTrack.durSec : 0);
        if (!dur) return;

        const rect = this.elSeekBarTrack.getBoundingClientRect();
        const clickX = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, clickX / rect.width));
        const targetTime = percent * dur;

        // Immediate visual feedback
        this.elSeekBarFill.style.width = `${percent * 100}%`;
        this.elSeekThumb.style.left = `${percent * 100}%`;
        this.elCurrentTime.textContent = this.formatTime(targetTime);

        // Set native audio position (Supported by Range server!)
        if (isFinite(targetTime)) {
            this.audio.currentTime = targetTime;
        }
    }

    setupScoreStage(stageNum, rangeEl, displayEl, pillsContainer, onSetScore) {
        if (!rangeEl) return;
        rangeEl.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (displayEl) displayEl.textContent = `✓ ${val}`;
            onSetScore(val);
            this.markStageScored(stageNum);
            this.updateFinalScore();
        });

        if (pillsContainer) {
            pillsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.mini-pill, .score-pill');
                if (!btn || btn.disabled) return;
                const val = parseInt(btn.dataset.val, 10);
                rangeEl.value = val;
                if (displayEl) displayEl.textContent = `✓ ${val}`;
                window.CyberFX.playClick();
                onSetScore(val);
                this.markStageScored(stageNum);
                this.updateFinalScore();
            });
        }
    }

    loadRandomTrack() {
        let unrated = this.tracks.filter(t => !this.ratedTrackIds.has(t.id));
        if (unrated.length === 0) {
            this.ratedTrackIds.clear();
            unrated = this.tracks;
        }

        const picked = unrated[Math.floor(Math.random() * unrated.length)];
        const idx = this.tracks.findIndex(t => t.id === picked.id);
        this.loadTrackByIndex(idx >= 0 ? idx : 0);
    }

    resetTrackState() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
        if (this.elPlayIcon) this.elPlayIcon.className = 'fa-solid fa-play';

        this.s1Unlocked = false;
        this.s2Unlocked = false;
        this.s3Unlocked = false;
        this.score1 = null;
        this.score2 = null;
        this.score3 = null;
        this.currentFinalScore = null;

        // Reset scrubbing lock
        this.hasPassed15s = false;
        this.isDragging = false;

        // Reset progress bar
        if (this.elSeekBarFill) this.elSeekBarFill.style.width = '0%';
        if (this.elSeekThumb) this.elSeekThumb.style.left = '0%';
        if (this.elCurrentTime) this.elCurrentTime.textContent = '00:00';
        if (this.elTotalTime) this.elTotalTime.textContent = this.currentTrack ? this.currentTrack.duration : '--:--';

        // Scrub lock display
        if (this.elScrubIndicator) {
            this.elScrubIndicator.innerHTML = '<i class="fa-solid fa-lock"></i> 15s LOCK';
            this.elScrubIndicator.classList.remove('unlocked');
        }
        if (this.elSeekBarTrack) {
            this.elSeekBarTrack.classList.remove('scrubbable');
        }

        // Reset Stage Capsules to Unrated State
        [1, 2, 3].forEach(stage => {
            const card = document.getElementById(`stage-card-${stage}`);
            const badge = document.getElementById(`stage-badge-${stage}`);
            const range = document.getElementById(`range-s${stage}`);
            const display = document.getElementById(`display-s${stage}`);
            const pills = document.getElementById(`pills-s${stage}`);

            if (card) card.className = 'dock-stage-capsule locked';
            if (range) {
                range.disabled = true;
                range.value = 80;
            }
            if (display) display.textContent = '--';
            if (pills) pills.querySelectorAll('.mini-pill, .score-pill').forEach(p => p.disabled = true);
            if (badge) badge.textContent = '🔒 LOCKED';
        });

        // Reset markers
        if (this.elMarker10) this.elMarker10.classList.remove('unlocked');
        if (this.elMarker60) this.elMarker60.classList.remove('unlocked');
        if (this.elMarkerOutro) this.elMarkerOutro.classList.remove('unlocked');

        // Reset score preview & submit button
        if (this.elMedianPreview) this.elMedianPreview.textContent = '--';
        const tipEl = document.getElementById('score-formula-tip');
        if (tipEl) tipEl.textContent = 'NOT SCORED';
        if (this.elBtnSubmit) this.elBtnSubmit.disabled = true;
    }

    playAudio() {
        window.CyberFX.init();
        this.initAudioContext();
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        return this.audio.play().then(() => {
            this.isPlaying = true;
            if (this.elPlayIcon) this.elPlayIcon.className = 'fa-solid fa-pause';
            if (this.elPlayText) this.elPlayText.textContent = 'PAUSE FREQUENCY';
            const tag = document.getElementById('audio-status-tag');
            if (tag) {
                tag.textContent = 'ACTIVE STREAM';
                tag.className = 'panel-status';
            }
        }).catch(err => {
            console.warn('Audio play failed, activating synthetic audio fallback:', err);
            this.startSyntheticAudioFallback();
        });
    }

    togglePlay() {
        if (this.audio.paused) {
            this.playAudio();
        } else {
            this.audio.pause();
            this.isPlaying = false;
            if (this.elPlayIcon) this.elPlayIcon.className = 'fa-solid fa-play';
            if (this.elPlayText) this.elPlayText.textContent = 'RESUME LISTENING';
            const tag = document.getElementById('audio-status-tag');
            if (tag) tag.textContent = 'PAUSED';
        }
    }

    onMetadataLoaded() {
        const dur = this.audio.duration || this.currentTrack.durSec;
        this.elTotalTime.textContent = this.formatTime(dur);

        const p10 = (10 / dur) * 100;
        const p60 = (60 / dur) * 100;
        const pOutro = ((dur - 15) / dur) * 100;

        this.elMarker10.style.left = `${Math.min(p10, 95)}%`;
        this.elMarker60.style.left = `${Math.min(p60, 95)}%`;
        this.elMarkerOutro.style.left = `${Math.min(pOutro, 98)}%`;
    }

    onTimeUpdate() {
        const cur = this.audio.currentTime;
        const dur = this.audio.duration || this.currentTrack.durSec;
        if (!dur) return;

        // Only update progress UI if user is not actively dragging the thumb
        if (!this.isDragging) {
            const percent = (cur / dur) * 100;
            this.elSeekBarFill.style.width = `${percent}%`;
            this.elSeekThumb.style.left = `${percent}%`;
            this.elCurrentTime.textContent = this.formatTime(cur);
        }

        // 1. Scrubbing Unlock (Once reaches 15s, permanently unlocked for this track!)
        if (cur >= this.scrubLockSeconds) {
            this.hasPassed15s = true;
            if (!this.elSeekBarTrack.classList.contains('scrubbable')) {
                this.elSeekBarTrack.classList.add('scrubbable');
                if (this.elScrubIndicator) {
                    this.elScrubIndicator.innerHTML = '<i class="fa-solid fa-lock-open"></i> UNLOCKED';
                    this.elScrubIndicator.classList.add('unlocked');
                }
                if (this.elScrubStatusTop) {
                    this.elScrubStatusTop.innerHTML = '<i class="fa-solid fa-lock-open"></i> UNLOCKED';
                }
            }
        }

        // 2. Stage 1 (10s)
        if (cur >= 10 && !this.s1Unlocked) this.unlockStage(1);
        // 3. Stage 2 (60s)
        if (cur >= 60 && !this.s2Unlocked) this.unlockStage(2);
        // 4. Stage 3 (Outro - within final 15s)
        if (cur >= (dur - 15) && !this.s3Unlocked) this.unlockStage(3);
    }

    /**
     * Unlock Stage silently! (No sound effects while music is playing)
     * NOTE: Does NOT assign a default score! It stays unrated until user adjusts it!
     */
    unlockStage(stageNum) {
        if (stageNum === 1) this.s1Unlocked = true;
        if (stageNum === 2) this.s2Unlocked = true;
        if (stageNum === 3) this.s3Unlocked = true;

        const card = document.getElementById(`stage-card-${stageNum}`);
        const badge = document.getElementById(`stage-badge-${stageNum}`);
        const range = document.getElementById(`range-s${stageNum}`);
        const display = document.getElementById(`display-s${stageNum}`);
        const pills = document.getElementById(`pills-s${stageNum}`);
        const marker = stageNum === 1 ? this.elMarker10 : (stageNum === 2 ? this.elMarker60 : this.elMarkerOutro);

        if (card) card.className = 'dock-stage-capsule active';
        if (range) range.disabled = false;
        if (pills) pills.querySelectorAll('.mini-pill, .score-pill').forEach(p => p.disabled = false);
        if (marker) marker.classList.add('unlocked');

        // Initial unlocked state: WAITING FOR USER INPUT (no score assigned)
        if (badge) badge.textContent = 'PENDING';
        if (display) display.textContent = '--';

        this.updateFinalScore();
    }

    markStageScored(stageNum) {
        const card = document.getElementById(`stage-card-${stageNum}`);
        const badge = document.getElementById(`stage-badge-${stageNum}`);
        const display = document.getElementById(`display-s${stageNum}`);
        if (card) card.className = 'dock-stage-capsule scored';
        const val = stageNum === 1 ? this.score1 : (stageNum === 2 ? this.score2 : this.score3);
        if (badge) badge.textContent = '✓ SCORED';
        if (display && val !== null) display.textContent = `✓ ${val}`;
    }

    flashScrubWarning() {
        this.elScrubToast.classList.add('show');
        setTimeout(() => {
            this.elScrubToast.classList.remove('show');
        }, 3000);
    }

    /**
     * Final Score Formula:
     * - 1 Stage Scored: That stage's exact score is used
     * - 2 Stages Scored: Arithmetic average of the two scores
     * - 3 Stages Scored: Root-Mean-Square (RMS): round( sqrt( (s1^2 + s2^2 + s3^2) / 3 ) )
     */
    calculateRMS(s1, s2, s3) {
        const sumSquares = (s1 * s1) + (s2 * s2) + (s3 * s3);
        const meanSquare = sumSquares / 3.0;
        return Math.round(Math.sqrt(meanSquare));
    }

    updateFinalScore() {
        const scored = [];
        if (this.score1 !== null) scored.push({ stage: 1, val: this.score1 });
        if (this.score2 !== null) scored.push({ stage: 2, val: this.score2 });
        if (this.score3 !== null) scored.push({ stage: 3, val: this.score3 });

        const count = scored.length;
        let finalVal = null;
        let tipText = 'NOT SCORED';

        if (count === 0) {
            finalVal = null;
            tipText = 'NOT SCORED (Score at least 1 stage)';
        } else if (count === 1) {
            // One stage scored: take as exact score
            finalVal = scored[0].val;
            tipText = `Single Stage (#0${scored[0].stage} Exact)`;
        } else if (count === 2) {
            // Two stages scored: take arithmetic mean
            finalVal = Math.round((scored[0].val + scored[1].val) / 2.0);
            tipText = `Two-Stage Average (${scored[0].val} & ${scored[1].val})`;
        } else if (count === 3) {
            // All three scored: calculate RMS composite
            finalVal = this.calculateRMS(this.score1, this.score2, this.score3);
            tipText = 'Three-Stage RMS Composite';
        }

        this.currentFinalScore = finalVal;
        if (this.elMedianPreview) {
            this.elMedianPreview.textContent = finalVal !== null ? finalVal : '--';
        }
        const tipEl = document.getElementById('score-formula-tip');
        if (tipEl) {
            tipEl.textContent = tipText;
        }
        if (this.elPillCurrentScore) {
            this.elPillCurrentScore.textContent = finalVal !== null ? `${finalVal} pts` : '--';
        }
        if (this.elBtnSubmit) {
            this.elBtnSubmit.disabled = (finalVal === null);
        }
    }

    submitScores() {
        if (this.currentFinalScore === null || !this.currentTrack) return;

        window.CyberFX.playDecrypted();
        this.ratedTrackIds.add(this.currentTrack.id);
        if (this.elTestedCount) {
            this.elTestedCount.textContent = `TESTED: ${this.ratedTrackIds.size} / ${this.tracks.length}`;
        }
        this.updatePrime7MatrixUI();

        // Record valid score to community stats
        this.communityStats = this.communityManager.recordScore(
            this.currentTrack.id, 
            this.currentFinalScore,
            { stage1: this.score1, stage2: this.score2, stage3: this.score3 }
        );

        const t = this.currentTrack;
        const userScore = this.currentFinalScore;
        const authorScore = t.authorScore;
        const medianScore = this.communityStats.median;
        const count = this.communityStats.count;

        // Populate decrypted track information
        const seqEl = document.getElementById('badge-track-seq');
        if (seqEl) seqEl.textContent = `#${t.id}`;
        const titleEnEl = document.getElementById('badge-title-en');
        if (titleEnEl) titleEnEl.textContent = t.titleEN;
        const titleZhEl = document.getElementById('badge-title-zh');
        if (titleZhEl) titleZhEl.textContent = t.titleZH;
        const durEl = document.getElementById('badge-tag-duration');
        if (durEl) durEl.textContent = t.duration;

        const timeEl = document.getElementById('badge-timestamp');
        if (timeEl) {
            const d = new Date().toISOString().slice(0, 10);
            const hex = t.id.toString(16).toUpperCase().padStart(2, '0');
            timeEl.textContent = `${d} // CLEARANCE ID: 0x${hex}${Math.floor(Math.random() * 900 + 100)}`;
        }

        // Populate 3-Way Unified Dual Grid
        const userScoreEl = document.getElementById('badge-user-score');
        if (userScoreEl) userScoreEl.textContent = userScore;
        const s1Str = this.score1 !== null ? `${this.score1}` : '--';
        const s2Str = this.score2 !== null ? `${this.score2}` : '--';
        const s3Str = this.score3 !== null ? `${this.score3}` : '--';
        const breakdownEl = document.getElementById('badge-user-breakdown');
        if (breakdownEl) breakdownEl.textContent = `${s1Str} · ${s2Str} · ${s3Str}`;

        const scoredCount = [this.score1, this.score2, this.score3].filter(v => v !== null).length;
        const userTypeEl = document.getElementById('badge-user-type');
        if (userTypeEl) {
            userTypeEl.textContent = scoredCount === 3 ? 'RMS COMPOSITE' : (scoredCount === 2 ? '2-STAGE AVERAGE' : 'SINGLE STAGE');
        }

        // Creator comparison
        const targetScoreEl = document.getElementById('badge-target-score');
        if (targetScoreEl) targetScoreEl.textContent = authorScore;
        const deltaCreator = Math.abs(userScore - authorScore);
        const creatorSim = Math.max(0, 100 - Math.round(deltaCreator * 2.5));
        const creatorSimEl = document.getElementById('badge-creator-sim');
        if (creatorSimEl) creatorSimEl.textContent = `SIMILARITY ${creatorSim}%`;

        // Community comparison
        const commMedianEl = document.getElementById('badge-community-median');
        if (commMedianEl) commMedianEl.textContent = medianScore;
        const commCountEl = document.getElementById('badge-community-count');
        if (commCountEl) commCountEl.textContent = `${count} Valid Scorers`;
        const deltaComm = Math.abs(userScore - medianScore);
        const commSim = Math.max(0, 100 - Math.round(deltaComm * 2.5));
        const commSimEl = document.getElementById('badge-community-sim');
        if (commSimEl) commSimEl.textContent = `CONSENSUS ${commSim}%`;

        // Taste Uniqueness Degree (Objective description of individuality vs. consensus; no stars, no taste scores, no judgment)
        let uniquenessTag = '';
        if (deltaComm === 0) {
            uniquenessTag = 'COMMON CONSENSUS WAVELENGTH';
        } else if (deltaComm <= 2) {
            uniquenessTag = 'SHARED MAINSTREAM SPECTRUM';
        } else if (deltaComm <= 5) {
            uniquenessTag = 'BALANCED INDIVIDUAL EAR';
        } else if (deltaComm <= 9) {
            uniquenessTag = 'DISTINCT ACOUSTIC SIGNATURE';
        } else {
            uniquenessTag = 'HIGHLY SINGULAR PERSPECTIVE';
        }

        const tasteUniquenessEl = document.getElementById('badge-taste-uniqueness-val');
        if (tasteUniquenessEl) tasteUniquenessEl.textContent = uniquenessTag;

        // Archetype title & subjective appreciation commentary
        const archetype = this.getUnifiedArchetype(deltaCreator, deltaComm, userScore, authorScore, medianScore);
        const archTagEl = document.getElementById('badge-archetype-tag');
        if (archTagEl) archTagEl.textContent = archetype.tag;
        const archIconEl = document.getElementById('badge-archetype-icon');
        if (archIconEl) archIconEl.innerHTML = archetype.icon;
        const archDescEl = document.getElementById('badge-archetype-desc');
        if (archDescEl) archDescEl.textContent = archetype.desc;

        // Display clearance modal
        this.elModal.classList.add('show');
    }

    handleLiveCommunityUpdate(data, updatedTrackId, res) {
        if (!this.currentTrack) return;
        const tid = this.currentTrack.id;
        if (updatedTrackId && updatedTrackId !== tid) return;

        const stats = this.communityManager.getTrackStats(tid);
        this.communityStats = stats;

        const commMedianEl = document.getElementById('badge-community-median');
        const commCountEl = document.getElementById('badge-community-count');
        const commSimEl = document.getElementById('badge-community-sim');
        const tasteUniquenessEl = document.getElementById('badge-taste-uniqueness-val');

        if (commMedianEl) commMedianEl.textContent = stats.median;
        if (commCountEl) commCountEl.textContent = `${stats.count} Valid Scorers`;

        if (this.currentFinalScore !== null) {
            const deltaComm = Math.abs(this.currentFinalScore - stats.median);
            const commSim = Math.max(0, 100 - Math.round(deltaComm * 2.5));
            if (commSimEl) commSimEl.textContent = `CONSENSUS ${commSim}%`;

            let uniquenessTag = '';
            if (deltaComm === 0) uniquenessTag = 'COMMON CONSENSUS WAVELENGTH';
            else if (deltaComm <= 2) uniquenessTag = 'SHARED MAINSTREAM SPECTRUM';
            else if (deltaComm <= 5) uniquenessTag = 'BALANCED INDIVIDUAL EAR';
            else if (deltaComm <= 9) uniquenessTag = 'DISTINCT ACOUSTIC SIGNATURE';
            else uniquenessTag = 'HIGHLY SINGULAR PERSPECTIVE';

            if (tasteUniquenessEl) tasteUniquenessEl.textContent = uniquenessTag;
        }
    }

    getUnifiedArchetype(deltaCreator, deltaComm, user, creator, median) {
        if (deltaCreator <= 2 && deltaComm <= 2) {
            return {
                tag: "DUAL RESONANCE SPECTRUM",
                icon: '<i class="fa-solid fa-atom"></i>',
                desc: "Your auditory response aligns in close harmony with creator 虚FFVoid's studio benchmark while matching the collective median. Music appreciation is entirely subjective—your reaction naturally bridges the creator's intent with broad public resonance."
            };
        } else if (deltaCreator <= 2 && deltaComm > 2) {
            return {
                tag: "STUDIO-ALIGNED WAVELENGTH",
                icon: '<i class="fa-solid fa-microchip"></i>',
                desc: "Your impression connects directly with creator 虚FFVoid's baseline while taking an independent path from the broader consensus. Artistic perception is inherently personal; you engaged with specific elements that resonated privately with the creator's studio vision."
            };
        } else if (deltaComm <= 2 && deltaCreator > 2) {
            return {
                tag: "COLLECTIVE HARMONY HORIZON",
                icon: '<i class="fa-solid fa-users-rays"></i>',
                desc: "Your score mirrors the shared emotional median of the listening community, forming an intuitive anchor distinct from the author's benchmark. In music, all individual impressions are valid—shared human response is as authentic as solitary inspiration."
            };
        } else if (user > creator && user > median) {
            return {
                tag: "HIGHLY RECEPTIVE EAR",
                icon: '<i class="fa-solid fa-bolt-lightning"></i>',
                desc: "You experienced this piece with exceptional receptivity, finding resonant qualities beyond both the creator's own score and the community median. Every listener discovers their own emotional sparks in sound, and yours was uniquely vibrant here."
            };
        } else if (user < creator && user < median) {
            return {
                tag: "SELECTIVE PERSONAL CRITERION",
                icon: '<i class="fa-solid fa-feather"></i>',
                desc: "Your impression follows a more reserved, selective contour compared to both the creator and the collective median. In the subjective world of music, all honest reactions are valid—your distinct criteria define your genuine listening boundary."
            };
        } else {
            return {
                tag: "INDEPENDENT AUDITORY ORBIT",
                icon: '<i class="fa-solid fa-compass"></i>',
                desc: "Your evaluation charts an independent path, unswayed by either the creator's reference or collective consensus. Every individual carries their own irreplaceable listening world, and finding what authentically moves you is the only true benchmark."
            };
        }
    }

    /**
     * System Web Share API with automatic Canvas PNG download fallback
     */
    async shareOrDownloadBadge() {
        window.CyberFX.playClick();
        const canvas = document.getElementById('export-canvas');
        this.renderUnifiedCanvasBadge();

        const t = this.currentTrack;
        const userScore = this.currentFinalScore;
        const authorScore = t.authorScore;
        const medianScore = this.communityStats ? this.communityStats.median : authorScore;

        const shareTitle = `Dreamy Voyage // Blind Audio Perception Test - #${t.id} ${t.titleEN}`;
        const shareText = `I scored #${t.id} "${t.titleEN}" at ${userScore} pts on Dreamy Voyage Blind Test! (Creator 虚FFVoid: ${authorScore} / Community Median: ${medianScore})`;

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const fileName = `DreamyVoyage_BlindTest_${t.id}_${userScore}pts.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            // Priority: Native System Share (iOS, Android, modern desktop OS)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: shareTitle,
                        text: shareText,
                        files: [file]
                    });
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // User cancelled
                    console.log('[Share] System share fallback to direct download:', err);
                }
            } else if (navigator.share) {
                try {
                    await navigator.share({
                        title: shareTitle,
                        text: shareText,
                        url: window.location.href
                    });
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                }
            }

            // Fallback: Direct high-res PNG download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }, 'image/png');
    }

    renderUnifiedCanvasBadge() {
        const canvas = document.getElementById('export-canvas');
        canvas.width = 1200;
        canvas.height = 760;
        const ctx = canvas.getContext('2d');
        const t = this.currentTrack;
        const userScore = this.currentFinalScore;
        const authorScore = t.authorScore;
        const stats = this.communityStats || this.communityManager.getTrackStats(t.id);
        const medianScore = stats.median;
        const count = stats.count;

        const deltaCreator = Math.abs(userScore - authorScore);
        const deltaComm = Math.abs(userScore - medianScore);
        const creatorSim = Math.max(0, 100 - Math.round(deltaCreator * 2.5));
        const commSim = Math.max(0, 100 - Math.round(deltaComm * 2.5));
        const archetype = this.getUnifiedArchetype(deltaCreator, deltaComm, userScore, authorScore, medianScore);

        const s1Txt = this.score1 !== null ? `${this.score1}` : '--';
        const s2Txt = this.score2 !== null ? `${this.score2}` : '--';
        const s3Txt = this.score3 !== null ? `${this.score3}` : '--';
        const scoredCount = [this.score1, this.score2, this.score3].filter(v => v !== null).length;
        const typeStr = scoredCount === 3 ? 'RMS Composite' : (scoredCount === 2 ? '2-Stage Average' : 'Single Stage');

        // 1. Cyberpunk Dark Space Background with Matrix Grid
        ctx.fillStyle = '#060919';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        // 2. Double Neon Borders
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

        ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

        // 3. Header Bar
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 22px Orbitron, sans-serif';
        ctx.fillText('DREAMY.VOYAGE // BLIND TEST PROTOCOL', 60, 80);

        const dStr = new Date().toISOString().slice(0, 10);
        ctx.fillStyle = '#8899b7';
        ctx.font = '15px Rajdhani, monospace';
        ctx.fillText(`${dStr}  •  CLEARANCE AUDIT  •  PRIME 7 ARCHIVE`, 60, 108);

        // Holographic seal
        ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
        ctx.fillRect(canvas.width - 240, 56, 180, 36);
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 240, 56, 180, 36);
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 13px Orbitron, sans-serif';
        ctx.fillText('VERIFIED AUDIT', canvas.width - 205, 80);

        // 4. Decrypted Track Hero
        const grad = ctx.createLinearGradient(60, 140, 210, 290);
        grad.addColorStop(0, '#7209b7');
        grad.addColorStop(1, '#00f3ff');
        ctx.fillStyle = grad;
        ctx.fillRect(60, 140, 150, 150);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 56px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${t.id}`, 135, 235);
        ctx.textAlign = 'left';

        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillText('UNMASKED FREQUENCY // CLEARANCE REVEALED', 235, 170);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Orbitron, sans-serif';
        ctx.fillText(t.titleEN, 235, 215);

        ctx.fillStyle = '#8899b7';
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText(`${t.titleZH}   •   Duration: ${t.duration}   •   Prime 7 Album Track`, 235, 255);

        // 5. 3-Way Unified Score Grid
        ctx.fillStyle = 'rgba(10, 18, 40, 0.92)';
        ctx.fillRect(60, 320, canvas.width - 120, 195);
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
        ctx.strokeRect(60, 320, canvas.width - 120, 195);

        // Column 1: YOUR SCORE
        ctx.fillStyle = '#8899b7';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText('YOUR SCORE', 95, 360);
        ctx.fillStyle = '#ff007f';
        ctx.font = 'bold 64px Orbitron, sans-serif';
        ctx.fillText(`${userScore}`, 95, 435);
        ctx.fillStyle = '#4d5b76';
        ctx.font = '15px Rajdhani, monospace';
        ctx.fillText(`Stages: ${s1Txt} · ${s2Txt} · ${s3Txt}`, 95, 475);
        ctx.fillStyle = '#ff007f';
        ctx.font = '13px Orbitron, sans-serif';
        ctx.fillText(typeStr.toUpperCase(), 95, 498);

        // Column 2: CREATOR (虚FFVoid)
        ctx.fillStyle = '#8899b7';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText('CREATOR (虚FFVoid)', 470, 360);
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 64px Orbitron, sans-serif';
        ctx.fillText(`${authorScore}`, 470, 435);
        ctx.fillStyle = '#4d5b76';
        ctx.font = '15px Rajdhani, monospace';
        ctx.fillText('Studio Master Benchmark', 470, 475);
        ctx.fillStyle = '#00f3ff';
        ctx.font = '13px Orbitron, sans-serif';
        ctx.fillText(`SIMILARITY ${creatorSim}%`, 470, 498);

        // Column 3: COMMUNITY MEDIAN
        ctx.fillStyle = '#8899b7';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText('COMMUNITY MEDIAN', 820, 360);
        ctx.fillStyle = '#06d6a0';
        ctx.font = 'bold 64px Orbitron, sans-serif';
        ctx.fillText(`${medianScore}`, 820, 435);
        ctx.fillStyle = '#4d5b76';
        ctx.font = '15px Rajdhani, monospace';
        ctx.fillText(`Based on ${count} Valid Scorers`, 820, 475);
        ctx.fillStyle = '#06d6a0';
        ctx.font = '13px Orbitron, sans-serif';
        ctx.fillText(`CONSENSUS ${commSim}%`, 820, 498);

        // 6. Rich Archetype & Subjective Commentary Box
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(60, 535, canvas.width - 120, 120);
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
        ctx.strokeRect(60, 535, canvas.width - 120, 120);

        let uniquenessTag = '';
        if (deltaComm === 0) {
            uniquenessTag = 'COMMON CONSENSUS WAVELENGTH';
        } else if (deltaComm <= 2) {
            uniquenessTag = 'SHARED MAINSTREAM SPECTRUM';
        } else if (deltaComm <= 5) {
            uniquenessTag = 'BALANCED INDIVIDUAL EAR';
        } else if (deltaComm <= 9) {
            uniquenessTag = 'DISTINCT ACOUSTIC SIGNATURE';
        } else {
            uniquenessTag = 'HIGHLY SINGULAR PERSPECTIVE';
        }

        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.fillText(`PROFILE: ${archetype.tag}   •   UNIQUENESS: ${uniquenessTag}`, 85, 568);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '14px Inter, sans-serif';
        // Wrap text to two clean lines if needed
        const words = archetype.desc.split(' ');
        let line1 = '', line2 = '';
        for (const w of words) {
            if ((line1 + w).length < 88) line1 += w + ' ';
            else line2 += w + ' ';
        }
        ctx.fillText(line1.trim(), 85, 602);
        if (line2) ctx.fillText(line2.trim(), 85, 626);

        // 7. Footer & Link
        ctx.fillStyle = '#4d5b76';
        ctx.font = '14px Rajdhani, monospace';
        ctx.fillText('DREAMY VOYAGE AUDIO RESEARCH LAB // VERIFIED PROTOCOL', 60, 695);
        ctx.textAlign = 'right';
        ctx.fillText('https://dreamy.voyage/blind-test-game/', canvas.width - 60, 695);
        ctx.textAlign = 'left';
    }

    copyShareText() {
        window.CyberFX.playClick();
        const t = this.currentTrack;
        const userScore = this.currentFinalScore;
        const authorScore = t.authorScore;
        const stats = this.communityStats || this.communityManager.getTrackStats(t.id);
        const medianScore = stats.median;
        const count = stats.count;

        const deltaCreator = Math.abs(userScore - authorScore);
        const deltaComm = Math.abs(userScore - medianScore);
        const creatorSim = Math.max(0, 100 - Math.round(deltaCreator * 2.5));
        const commSim = Math.max(0, 100 - Math.round(deltaComm * 2.5));
        const archetype = this.getUnifiedArchetype(deltaCreator, deltaComm, userScore, authorScore, medianScore);

        let uniquenessTag = '';
        if (deltaComm === 0) {
            uniquenessTag = 'COMMON CONSENSUS WAVELENGTH';
        } else if (deltaComm <= 2) {
            uniquenessTag = 'SHARED MAINSTREAM SPECTRUM';
        } else if (deltaComm <= 5) {
            uniquenessTag = 'BALANCED INDIVIDUAL EAR';
        } else if (deltaComm <= 9) {
            uniquenessTag = 'DISTINCT ACOUSTIC SIGNATURE';
        } else {
            uniquenessTag = 'HIGHLY SINGULAR PERSPECTIVE';
        }

        const s1Txt = this.score1 !== null ? `${this.score1}` : '--';
        const s2Txt = this.score2 !== null ? `${this.score2}` : '--';
        const s3Txt = this.score3 !== null ? `${this.score3}` : '--';

        const text = `🎧 DREAMY.VOYAGE // BLIND TEST AUDIT
Track: #${t.id} ${t.titleEN} (${t.titleZH})
My Score: ${userScore} [Stages: ${s1Txt} · ${s2Txt} · ${s3Txt}]
Creator (虚FFVoid): ${authorScore} (Similarity: ${creatorSim}%)
Community Median: ${medianScore} (${count} Scorers | Consensus: ${commSim}%)
Taste Signature: ${archetype.tag} [${uniquenessTag}]
"All music appreciation is inherently personal and subjective."
Verify your ears: https://dreamy.voyage/blind-test-game/`;

        navigator.clipboard.writeText(text).then(() => {
            const btn = this.elBtnCopyReddit;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>COPIED!</span>';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        });
    }

    formatTime(sec) {
        if (isNaN(sec) || sec < 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    initAudioContext() {
        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (window.ButterchurnEngine && this.audioSource) {
                window.ButterchurnEngine.init(this.audioContext, this.audioSource);
            }
            return;
        }
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;

            this.audioSource = this.audioContext.createMediaElementSource(this.audio);
            this.audioSource.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            // Connect and start Butterchurn visualizer!
            if (window.ButterchurnEngine) {
                window.ButterchurnEngine.init(this.audioContext, this.audioSource);
            }
        } catch (e) {
            console.log('MediaElementSource initialization deferred/unsupported:', e);
        }
    }

    initVisualizer() {
        const canvas = document.getElementById('audio-meter-canvas');
        const ctx = canvas.getContext('2d');
        const dataArray = new Uint8Array(64);

        const draw = () => {
            requestAnimationFrame(draw);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let bass = 0, mid = 0, high = 0;

            if (this.analyser && this.isPlaying) {
                this.analyser.getByteFrequencyData(dataArray);

                const barWidth = canvas.width / 32;
                for (let i = 0; i < 32; i++) {
                    const val = dataArray[i * 2] / 255.0;
                    const h = val * canvas.height;

                    if (i < 8) bass += val;
                    else if (i < 20) mid += val;
                    else high += val;

                    const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
                    grad.addColorStop(0, 'rgba(157, 78, 221, 0.8)');
                    grad.addColorStop(1, 'rgba(0, 243, 255, 1)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(i * barWidth + 2, canvas.height - h, barWidth - 3, h);
                }

                bass /= 8; mid /= 12; high /= 12;
            } else {
                const t = performance.now() / 600;
                ctx.fillStyle = 'rgba(0, 243, 255, 0.25)';
                for (let i = 0; i < 32; i++) {
                    const h = (Math.sin(t + i * 0.3) * 0.4 + 0.5) * (canvas.height * 0.35);
                    ctx.fillRect(i * (canvas.width / 32) + 2, canvas.height - h, (canvas.width / 32) - 3, h);
                }
            }

            if (window.CyberShader) {
                window.CyberShader.updateAudio(bass, mid, high, this.isPlaying);
            }
        };

        draw();
    }

    onAudioEnded() {
        this.isPlaying = false;
        this.elPlayIcon.className = 'fa-solid fa-rotate-right';
        this.elPlayText.textContent = 'REPLAY TRACK';
    }

    onAudioError(err) {
        console.warn('Audio stream error, activating simulated play clock:', err);
    }

    startSyntheticAudioFallback() {
        this.isPlaying = true;
        this.elPlayIcon.className = 'fa-solid fa-pause';
        this.elPlayText.textContent = 'PAUSE FREQUENCY';
        document.getElementById('audio-status-tag').textContent = 'ACTIVE (SYNTH STREAM)';

        if (!this.syntheticInterval) {
            this.syntheticInterval = setInterval(() => {
                if (this.isPlaying) {
                    this.audio.currentTime = (this.audio.currentTime || 0) + 1;
                    this.onTimeUpdate();
                    if (this.audio.currentTime >= this.currentTrack.durSec) {
                        this.onAudioEnded();
                    }
                }
            }, 1000);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new BlindTestApp();
});
