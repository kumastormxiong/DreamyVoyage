/**
 * DREAMY VOYAGE // BUTTERCHURN VISUALIZER ENGINE
 * Integrates Butterchurn with Web Audio API to drive full-screen audio-reactive music visuals.
 * NOTE: Presets do NOT switch automatically during track playback.
 * Presets only change randomly with a natural 3.0s cross-fade when switching tracks or on manual click.
 */

class ButterchurnBackgroundEngine {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = null;
        this.visualizer = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.presets = {};
        this.presetNames = [];
        this.currentPresetIndex = 0;
        this.currentPresetName = '';
        this.isRendering = false;

        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);
    }

    initPresets() {
        // Reuse DreamyVoyage root preset library (supports all 1720+ presets and name registry)
        if (window.echosfallPresetNames && Array.isArray(window.echosfallPresetNames) && window.echosfallPresetNames.length > 0) {
            this.presetNames = window.echosfallPresetNames;
        } else if (window.echosfallPresets && typeof window.echosfallPresets === 'object') {
            this.presetNames = Object.keys(window.echosfallPresets);
        } else if (window.butterchurnPresets && typeof window.butterchurnPresets.getPresets === 'function') {
            this.presets = window.butterchurnPresets.getPresets();
            this.presetNames = Object.keys(this.presets);
        }

        if (window.echosfallPresets && typeof window.echosfallPresets === 'object') {
            this.presets = Object.assign({}, window.echosfallPresets);
        }
    }

    /**
     * Initializes Butterchurn once AudioContext and audio node are available.
     * @param {AudioContext} audioCtx 
     * @param {AudioNode} audioNode 
     */
    init(audioCtx, audioNode) {
        if (!this.canvas) {
            this.canvas = document.getElementById(this.canvasId);
        }
        if (!this.canvas) return;

        this.audioContext = audioCtx || this.audioContext;
        if (audioNode) {
            this.sourceNode = audioNode;
        }

        if (this.visualizer) {
            if (this.sourceNode) {
                try {
                    this.visualizer.connectAudio(this.sourceNode);
                } catch (e) {
                    console.warn('[Butterchurn] connectAudio error:', e);
                }
            }
            return;
        }

        const bc = (window.butterchurn && typeof window.butterchurn.createVisualizer === 'function')
            ? window.butterchurn
            : ((window.butterchurn && window.butterchurn.default && typeof window.butterchurn.default.createVisualizer === 'function')
                ? window.butterchurn.default
                : null);

        if (!bc) {
            console.warn('[Butterchurn] Library not detected, fallback background will remain active.');
            return;
        }

        try {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

            this.canvas.width = Math.floor(width * dpr);
            this.canvas.height = Math.floor(height * dpr);

            this.visualizer = bc.createVisualizer(this.audioContext, this.canvas, {
                width: this.canvas.width,
                height: this.canvas.height,
                pixelRatio: 1,
                textureRatio: 1
            });

            if (this.sourceNode) {
                this.visualizer.connectAudio(this.sourceNode);
            }

            this.initPresets();
            if (this.presetNames.length > 0) {
                // Initial preset: pick a dreamy or cosmic preset
                const pickedName = this.findPreset('Nebula') || this.findPreset('Dreamy') || this.findPreset('Cyber') || this.presetNames[0];
                this.currentPresetIndex = this.presetNames.indexOf(pickedName);
                if (this.currentPresetIndex === -1) this.currentPresetIndex = 0;
                this.loadPreset(this.presetNames[this.currentPresetIndex], 0.0);
            }

            this.startRenderLoop();
            // NOTE: Auto-cycling during playback is disabled per user request!
            console.log('[Butterchurn] Audio visualizer active with', this.presetNames.length, 'presets (reusing DreamyVoyage presets library)!');
        } catch (err) {
            console.error('[Butterchurn] Initialization error:', err);
        }
    }

    findPreset(keyword) {
        return this.presetNames.find(n => n.toLowerCase().includes(keyword.toLowerCase()));
    }

    /**
     * Smoothly blend into a target preset.
     * Reuses DreamyVoyage homepage preset loader (asynchronous fetch with memory cache).
     * @param {string} presetName 
     * @param {number} blendTime Seconds for natural crossfade
     */
    async loadPreset(presetName, blendTime = 3.0) {
        if (!this.visualizer || !presetName) return;

        let presetData = this.presets[presetName];
        if (!presetData) {
            try {
                // Reuse homepage preset library: load JSON format presets from ../presets/ on demand
                const res = await fetch(`../presets/${encodeURIComponent(presetName)}.json`);
                if (res.ok) {
                    presetData = await res.json();
                    this.presets[presetName] = presetData; // In-memory cache
                }
            } catch (err) {
                console.warn('[Butterchurn] Fetch preset failed:', presetName, err);
            }
        }

        if (presetData) {
            try {
                this.visualizer.loadPreset(presetData, blendTime);
                this.currentPresetName = presetName;
                this.updatePresetLabels();
            } catch (e) {
                console.warn('[Butterchurn] Load preset failed:', e);
            }
        }
    }

    /**
     * Randomly select a preset with smooth 3s transition (called on track switch).
     * @param {number} blendTime 
     */
    async randomPreset(blendTime = 3.0) {
        if (this.presetNames.length === 0) {
            this.initPresets();
        }
        if (this.presetNames.length === 0) return;

        let nextIdx = Math.floor(Math.random() * this.presetNames.length);
        if (nextIdx === this.currentPresetIndex && this.presetNames.length > 1) {
            nextIdx = (nextIdx + 1) % this.presetNames.length;
        }
        this.currentPresetIndex = nextIdx;
        const nextName = this.presetNames[this.currentPresetIndex];
        await this.loadPreset(nextName, blendTime);
    }

    /**
     * Cycle to next preset in list.
     * @param {number} blendTime 
     */
    async nextPreset(blendTime = 3.0) {
        if (this.presetNames.length === 0) {
            this.initPresets();
        }
        if (this.presetNames.length === 0) return;
        this.currentPresetIndex = (this.currentPresetIndex + 1) % this.presetNames.length;
        const nextName = this.presetNames[this.currentPresetIndex];
        await this.loadPreset(nextName, blendTime);
    }

    updatePresetLabels() {
        const labels = document.querySelectorAll('.hud-preset-name, #hud-preset-name');
        const cleanName = this.currentPresetName.replace(/^BC-\d+\s*-\s*/, '').slice(0, 22);
        labels.forEach(el => {
            el.textContent = cleanName || 'Cyber Flow';
        });
    }

    startRenderLoop() {
        if (this.isRendering) return;
        this.isRendering = true;

        const render = () => {
            if (this.visualizer) {
                try {
                    this.visualizer.render();
                } catch (e) {
                    // Suppress transient render errors
                }
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    handleResize() {
        if (!this.visualizer || !this.canvas) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        this.visualizer.setRendererSize(this.canvas.width, this.canvas.height);
    }
}

window.ButterchurnEngine = new ButterchurnBackgroundEngine('butterchurn-canvas');
