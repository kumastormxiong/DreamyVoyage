/**
 * DREAMY VOYAGE // CYBERPUNK WEBGL SHADER & AUDIO ENGINE
 * Audio-reactive WebGL fragment shader with infinite neon grid, horizon nebula & cyber waves.
 */

class CyberShaderEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        this.startTime = performance.now();
        this.audioBass = 0.0;
        this.audioMid = 0.0;
        this.audioHigh = 0.0;
        this.isPlaying = false;

        if (!this.gl) {
            console.warn('WebGL not supported, falling back to CSS canvas background.');
            return;
        }

        this.initShaders();
        this.initBuffers();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.render = this.render.bind(this);
        requestAnimationFrame(this.render);
    }

    initShaders() {
        const gl = this.gl;

        // Vertex shader: Fullscreen quad
        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() {
                v_uv = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        // Fragment shader: Cyberpunk Synth Grid + Horizon Nebula + Audio Waves
        const fsSource = `
            precision mediump float;
            varying vec2 v_uv;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_bass;
            uniform float u_mid;
            uniform float u_high;
            uniform float u_active;

            // Pseudo-random noise
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

                // Deep Cyberpunk Space Colors
                vec3 spaceColor = vec3(0.02, 0.03, 0.08); // #050814
                vec3 cyanColor = vec3(0.0, 0.95, 1.0);    // #00f3ff
                vec3 magentaColor = vec3(1.0, 0.0, 0.5);  // #ff007f
                vec3 purpleColor = vec3(0.55, 0.05, 0.9); // #8c0de6

                vec3 finalColor = spaceColor;

                // 1. Horizon & Perspective 3D Grid
                float horizon = -0.15;
                if (uv.y < horizon) {
                    // Ground Plane
                    float depth = 1.0 / (abs(uv.y - horizon) + 0.001);
                    float forward = u_time * (1.8 + u_bass * 1.5);
                    vec2 gridPos = vec2(uv.x * depth * 2.2, depth * 1.2 + forward);

                    // Audio ripple distortion on grid
                    gridPos.x += sin(gridPos.y * 0.8 + u_time * 2.0) * (0.05 + u_mid * 0.15);

                    // Anti-aliased perspective grid without fwidth dependency
                    vec2 gridDist = abs(fract(gridPos - 0.5) - 0.5);
                    vec2 gridDelta = vec2(max(0.015, depth * 0.004));
                    vec2 grid = gridDist / gridDelta;
                    float line = clamp(1.0 - min(grid.x, grid.y), 0.0, 1.0);

                    // Fade grid with distance
                    float fade = smoothstep(25.0, 0.5, depth);
                    vec3 gridColor = mix(purpleColor, cyanColor, sin(gridPos.y * 0.1) * 0.5 + 0.5);
                    gridColor += magentaColor * (u_bass * 1.2);

                    finalColor += gridColor * line * fade * 0.85;

                    // Glow at ground horizon
                    finalColor += mix(magentaColor, cyanColor, uv.x + 0.5) * (depth * 0.015) * (0.8 + u_bass * 0.5);
                } else {
                    // Sky / Nebula / Synthwave Sun
                    vec2 skyUV = uv - vec2(0.0, horizon);

                    // Sun glow
                    vec2 sunPos = vec2(0.0, 0.15);
                    float distSun = length(skyUV - sunPos);
                    float sunGlow = 0.18 / (distSun + 0.18);
                    finalColor += mix(magentaColor, purpleColor, skyUV.y * 2.0) * sunGlow * (0.7 + u_bass * 0.6);

                    // Cyber Stars / Digital particles
                    vec2 starGrid = floor(skyUV * 28.0);
                    float starSeed = hash(starGrid);
                    if (starSeed > 0.94) {
                        float twinkle = sin(u_time * 4.0 + starSeed * 10.0) * 0.5 + 0.5;
                        finalColor += cyanColor * twinkle * (0.4 + u_high * 0.8);
                    }
                }

                // 2. Audio Waveform Ribbon across the horizon
                float waveY = horizon + sin(uv.x * 12.0 + u_time * 3.0) * (0.02 + u_mid * 0.08)
                                      + cos(uv.x * 24.0 - u_time * 4.0) * (0.01 + u_high * 0.04);
                float waveDist = abs(uv.y - waveY);
                float waveGlow = 0.004 / (waveDist + 0.004);
                finalColor += cyanColor * waveGlow * (0.6 + u_active * 0.8);

                // 3. Subtle Vignette
                vec2 centerUV = gl_FragCoord.xy / u_resolution - 0.5;
                float vignette = 1.0 - dot(centerUV, centerUV) * 0.8;
                finalColor *= vignette;

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        this.program = this.createProgram(gl, vsSource, fsSource);
        this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
        this.uTime = gl.getUniformLocation(this.program, 'u_time');
        this.uBass = gl.getUniformLocation(this.program, 'u_bass');
        this.uMid = gl.getUniformLocation(this.program, 'u_mid');
        this.uHigh = gl.getUniformLocation(this.program, 'u_high');
        this.uActive = gl.getUniformLocation(this.program, 'u_active');
    }

    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(gl, vsSource, fsSource) {
        const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    initBuffers() {
        const gl = this.gl;
        const positions = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0
        ]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    }

    resize() {
        if (!this.canvas || !this.gl) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    updateAudio(bass, mid, high, isPlaying) {
        // Smooth interpolation
        this.audioBass += (bass - this.audioBass) * 0.2;
        this.audioMid += (mid - this.audioMid) * 0.2;
        this.audioHigh += (high - this.audioHigh) * 0.2;
        this.isPlaying = isPlaying;
    }

    render() {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        gl.useProgram(this.program);

        const elapsed = (performance.now() - this.startTime) / 1000.0;
        gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uTime, elapsed);
        gl.uniform1f(this.uBass, this.audioBass);
        gl.uniform1f(this.uMid, this.audioMid);
        gl.uniform1f(this.uHigh, this.audioHigh);
        gl.uniform1f(this.uActive, this.isPlaying ? 1.0 : 0.2);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(this.render);
    }
}

/**
 * Procedural Cyber Sound Synthesizer (Zero External Dependencies)
 * Generates futuristic audio feedback: Unlock chimes, blips, error pulses, decode buzz.
 */
class CyberAudioFX {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playUnlock() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.3);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    playWarning() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.setValueAtTime(120, now + 0.1);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playDecrypted() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major Cyber Chord
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + i * 0.08);

            gain.gain.setValueAtTime(0.001, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.8);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.85);
        });
    }

    playClick() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }
}

window.CyberFX = new CyberAudioFX();
window.addEventListener('DOMContentLoaded', () => {
    window.CyberShader = new CyberShaderEngine('shader-canvas');
});
