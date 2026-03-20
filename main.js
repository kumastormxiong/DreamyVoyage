/**
 * DreamyVoyage - 炫酷音乐播放网页 (极致全景 WebGL 液态 Shader & 2D 圆弧频谱融合版)
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const introOverlay = document.getElementById('intro-overlay');
    const app = document.getElementById('app');
    
    const audio = document.getElementById('audio-core');
    const coverImg = document.getElementById('cover-img');
    const songTitle = document.getElementById('song-title');
    const progressTrack = document.getElementById('progress-track');
    const progressFill = document.getElementById('progress-fill');
    const progressHandle = document.querySelector('.progress-handle');
    const currentTimeEl = document.getElementById('current-time');
    const durationTimeEl = document.getElementById('duration-time');

    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnList = document.getElementById('btn-list');
    const btnShare = document.getElementById('btn-share');

    const drawer = document.getElementById('songs-drawer');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const songListContainer = document.getElementById('song-list');

    const shareModal = document.getElementById('share-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const posterContainer = document.getElementById('poster-container');

    // 双 Canvas 渲染
    const bgCanvas = document.getElementById('webgl-canvas'); // 供 WebGL Shader 极光背景用
    const spCanvas = document.getElementById('spectre-canvas'); // 供 2D 音频圆形频谱用
    const spCtx = spCanvas.getContext('2d');
    const gl = bgCanvas.getContext('webgl');

    // 播放状态变量
    let songList = [];
    let currentSongIndex = 0;
    let isPlaying = false;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    function resizeCanvas() {
        bgCanvas.width = spCanvas.width = window.innerWidth;
        bgCanvas.height = spCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getQueryParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    async function loadSongs() {
        if (window.songList && window.songList.length > 0) {
            songList = window.songList;
            renderSongList();

            const songParam = getQueryParam('song');
            if (songParam !== null) {
                const index = parseInt(songParam);
                if (!isNaN(index) && index >= 0 && index < songList.length) {
                    currentSongIndex = index;
                }
            }
            loadSong(currentSongIndex);
        }
    }

    function renderSongList() {
        songListContainer.innerHTML = '';
        songList.forEach((songPath, index) => {
            let displayTitle = songPath.replace('.mp3', '');
            if (displayTitle.includes('-')) displayTitle = displayTitle.split('-')[1];

            const item = document.createElement('div');
            item.className = 'song-item';
            if (index === currentSongIndex) item.className += ' active';
            item.innerHTML = `
                <span class="song-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="song-item-title">${displayTitle}</span>
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                drawer.classList.remove('open');
                currentSongIndex = index;
                loadSong(index);
                playAudio();
            });
            songListContainer.appendChild(item);
        });
    }

    function loadSong(index) {
        currentSongIndex = index;
        const songPath = songList[index];
        audio.src = `./mp3s/${songPath}`;
        
        let displayTitle = songPath.replace('.mp3', '');
        if (displayTitle.includes('-')) displayTitle = displayTitle.split('-')[1];
        songTitle.innerText = displayTitle;

        const items = document.querySelectorAll('.song-item');
        items.forEach((item, i) => { i === index ? item.classList.add('active') : item.classList.remove('active'); });

        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        currentTimeEl.innerText = "0:00";
    }

    function startExperience() {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }

        playAudio(); 
        initWebGL(); // 初始化底层 WebGL 极光流
        startVisualizer();  // 启动上层 2D 圆形声浪线
    }

    introOverlay.addEventListener('click', startExperience);
    introOverlay.addEventListener('touchstart', startExperience);

    function setupAudioAnalyser() {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; 
        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    function playAudio() {
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        audio.play().catch(e => console.log('自动播放锁：', e));
        isPlaying = true;
        btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
        document.querySelector('.player-card').classList.add('playing');
    }

    function pauseAudio() {
        audio.pause();
        isPlaying = false;
        btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
        document.querySelector('.player-card').classList.remove('playing');
    }

    btnPlayPause.addEventListener('click', (e) => { e.stopPropagation(); isPlaying ? pauseAudio() : playAudio(); });
    btnNext.addEventListener('click', (e) => { e.stopPropagation(); currentSongIndex = (currentSongIndex + 1) % songList.length; loadSong(currentSongIndex); playAudio(); });
    btnPrev.addEventListener('click', (e) => { e.stopPropagation(); currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length; loadSong(currentSongIndex); playAudio(); });

    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;
            currentTimeEl.innerText = formatTime(audio.currentTime);
            durationTimeEl.innerText = formatTime(audio.duration);
        }
    });

    progressTrack.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = progressTrack.getBoundingClientRect();
        audio.currentTime = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * audio.duration;
    });

    audio.addEventListener('ended', () => btnNext.click());

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    btnList.addEventListener('click', (e) => { e.stopPropagation(); drawer.classList.add('open'); });
    closeDrawerBtn.addEventListener('click', (e) => { e.stopPropagation(); drawer.classList.remove('open'); });

    // ==========================================
    // 5.1 底层：全景 WebGL 梦幻 FBM 极光 Shader 
    // ==========================================
    let glProgram;

    const vsSource = `
        attribute vec2 position;
        varying vec2 vUv;
        void main() {
            vUv = position * 0.5 + 0.5; // 投射到 0-1
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // 翻译用户提供的 skyShader 包含 FBM 和极光的 Shader
    const fsSource = `
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        varying vec2 vUv;

        // 配色方案（蒸汽波/赛博）：紫黑、粉红、蓝、黄绿
        vec3 uColorA = vec3(0.16, 0.03, 0.24); // #2a083e (紫黑)
        vec3 uColorB = vec3(1.0, 0.31, 0.85); // #ff4fd8 (粉红)
        vec3 uColorC = vec3(0.2, 0.96, 1.0);  // #33f6ff (赛博蓝)
        vec3 uColorD = vec3(0.84, 1.0, 0.35); // #d7ff5a (亮黄绿)

        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 5; i += 1) {
                value += amplitude * noise(p);
                p *= 2.0;
                amplitude *= 0.5;
            }
            return value;
        }

        void main() {
            vec2 p = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
            float t = iTime * 0.4; // 减慢速度

            // 极光和流态
            float auroraA = sin(p.x * 2.0 + t * 0.4 + fbm(p * 1.4) * 4.0);
            float auroraB = sin(p.y * 3.4 - t * 0.35 + fbm(p * 2.1) * 3.0);
            float curtain = smoothstep(0.0, 1.0, fbm(p * 1.7 + vec2(0.0, t * 0.08)));

            vec3 base = mix(uColorA, uColorB, clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0));
            base = mix(base, uColorC, 0.5 + 0.5 * auroraA * auroraB);
            base += uColorD * (0.25 + curtain * 0.45) * smoothstep(0.2, 0.9, auroraA * 0.5 + 0.5);

            gl_FragColor = vec4(base, 1.0);
        }
    `;

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function initWebGL() {
        if (!gl) return console.log('WebGL 不可用，自动降级至双向 2D 贴片');
        const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        glProgram = gl.createProgram();
        gl.attachShader(glProgram, vs);
        gl.attachShader(glProgram, fs);
        gl.linkProgram(glProgram);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1,
        ]), gl.STATIC_DRAW);

        const posLocation = gl.getAttribLocation(glProgram, 'position');
        gl.enableVertexAttribArray(posLocation);
        gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

        requestAnimationFrame(bgRenderLoop);
    }

    function bgRenderLoop(now) {
        requestAnimationFrame(bgRenderLoop);
        if (!gl || !glProgram) return;

        gl.viewport(0, 0, bgCanvas.width, bgCanvas.height);
        gl.useProgram(glProgram);

        gl.uniform2f(gl.getUniformLocation(glProgram, 'iResolution'), bgCanvas.width, bgCanvas.height);
        gl.uniform1f(gl.getUniformLocation(glProgram, 'iTime'), now * 0.001);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ==========================================
    // 5.2 上层：2D Circular Music Visualizer (恢复)
    // ==========================================
    let hue = 280;

    function startVisualizer() {
        function renderLoop() {
            requestAnimationFrame(renderLoop);

            // 让 2D 画布透明度累加流，承托底层 WebGL 画皮
            spCtx.clearRect(0, 0, spCanvas.width, spCanvas.height);

            let lowFreqValue = 0;
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                lowFreqValue = dataArray[3] || 0; 
            }

            const centerX = spCanvas.width / 2;
            const centerY = spCanvas.height / 2;

            // 特效 fallback 描绘：只有当 WEBGL 初始化失败时才画底盘背景，避免重复叠加
            if (!gl) {
                spCtx.fillStyle = 'rgba(5, 4, 10, 0.2)';
                spCtx.fillRect(0, 0, spCanvas.width, spCanvas.height);
                // 绘制极光液态球
                spCtx.save();
                spCtx.globalCompositeOperation = 'screen';
                const rad1 = (spCanvas.width * 0.5) + (lowFreqValue * 0.8);
                const grad1 = spCtx.createRadialGradient(centerX - 100, centerY - 100, 0, centerX - 100, centerY - 100, rad1);
                grad1.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.3)`); grad1.addColorStop(1, 'rgba(0,0,0,0)');
                spCtx.fillStyle = grad1; spCtx.fillRect(0,0,spCanvas.width,spCanvas.height);
                spCtx.restore();
            }

            // 绘制圆形粒子波纹（用户想要的放射状前置声谱线）
            if (isPlaying && analyser) {
                const baseRadius = window.innerWidth < 480 ? 95 : 120; 
                const lineCount = dataArray.length;
                const angleStep = (Math.PI * 2) / lineCount;

                spCtx.save();
                spCtx.translate(centerX, centerY);
                
                for (let i = 0; i < lineCount; i++) {
                    const value = dataArray[i];
                    const barHeight = value * 0.5 + (10 * Math.sin(Date.now() * 0.002 + i)); 
                    const angle = i * angleStep;

                    const x1 = Math.cos(angle) * baseRadius;
                    const y1 = Math.sin(angle) * baseRadius;
                    const x2 = Math.cos(angle) * (baseRadius + barHeight);
                    const y2 = Math.sin(angle) * (baseRadius + barHeight);

                    spCtx.shadowBlur = 15;
                    spCtx.shadowColor = `hsl(${(hue + i * 2) % 360}, 100%, 60%)`;
                    spCtx.strokeStyle = `hsl(${(hue + i) % 360}, 100%, 65%)`;
                    spCtx.lineWidth = window.innerWidth < 480 ? 3 : 5;
                    spCtx.beginPath(); spCtx.moveTo(x1, y1); spCtx.lineTo(x2, y2); spCtx.stroke();
                }
                spCtx.restore();
                spCtx.shadowBlur = 0; 
            }

            // 极光彩环脉冲
            if (isPlaying && dataArray) {
                spCtx.save();
                spCtx.shadowBlur = 30;
                spCtx.shadowColor = `hsla(${hue}, 100%, 65%, 0.5)`;
                spCtx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.4)`;
                spCtx.lineWidth = 5;
                spCtx.beginPath();
                spCtx.arc(centerX, centerY, 135 + lowFreqValue * 0.4, 0, Math.PI * 2);
                spCtx.stroke();
                spCtx.restore();
            }

            hue = (hue + 0.15) % 360; 
        }
        renderLoop();
    }

    // 6. 系统 SharePanel 与海报生成板并存
    btnShare.addEventListener('click', (e) => {
        e.stopPropagation();
        posterContainer.innerHTML = '<p style="color:var(--neon-cyan)">正在初始化分享...</p>';

        const posterCanvas = document.createElement('canvas');
        const pCtx = posterCanvas.getContext('2d');
        posterCanvas.width = 1080;
        posterCanvas.height = 1920;

        const imgCover = new Image();
        imgCover.crossOrigin = "anonymous";
        imgCover.src = coverImg.src;

        imgCover.onload = () => {
            const gradient = pCtx.createLinearGradient(0, 0, 0, 1920);
            gradient.addColorStop(0, '#0a0815'); gradient.addColorStop(0.5, '#12071a'); gradient.addColorStop(1, '#050308');
            pCtx.fillStyle = gradient; pCtx.fillRect(0, 0, 1080, 1920);

            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.08)'; pCtx.lineWidth = 2;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            const coverSize = 650;
            const coverX = (1080 - coverSize) / 2;
            const coverY = 250;
            
            pCtx.save(); pCtx.shadowBlur = 60; pCtx.shadowColor = '#00f2ff'; pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize); pCtx.restore();

            pCtx.font = "italic 36px 'Orbitron', sans-serif"; pCtx.fillStyle = "#ff007f"; pCtx.textAlign = "center"; pCtx.fillText("Now Playing Tracks", 1080/2, 940);

            pCtx.font = "bold 68px 'Orbitron', 'PingFang SC', sans-serif";
            pCtx.fillStyle = "#ffffff"; pCtx.shadowColor = "rgba(0, 242, 255, 0.8)"; pCtx.shadowBlur = 12;
            pCtx.fillText(songTitle.innerText, 1080/2, 1020); pCtx.shadowBlur = 0;

            // ===== 包含中英文专辑名字 =====
            pCtx.font = "bold 46px 'PingFang SC', 'Microsoft YaHei', sans-serif";
            pCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
            pCtx.fillText("幻 梦 之 旅", 1080/2, 1100);

            pCtx.font = "italic bold 32px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#ff007f";
            pCtx.fillText("DreamyVoyage", 1080/2, 1155);

            const shareUrl = `https://dreamy.voyage/?song=${currentSongIndex}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=ffffff&bgcolor=000000&data=${encodeURIComponent(shareUrl)}`;

            const imgQR = new Image();
            imgQR.crossOrigin = "anonymous";
            imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 250; const qrX = (1080 - qrSize) / 2; const qrY = 1320;
                pCtx.save(); pCtx.shadowBlur = 35; pCtx.shadowColor = '#b53cff'; pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize); pCtx.restore();

                pCtx.font = "26px 'Orbitron', sans-serif"; pCtx.fillStyle = "rgba(0, 242, 255, 0.6)";
                pCtx.fillText("长 按 保存 ，扫 码 进 入 幻 梦 腔 体", 1080/2, 1630);

                posterCanvas.toBlob((blob) => {
                    const file = new File([blob], 'dreamy_share.png', { type: 'image/png' });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({ files: [file], title: `DreamyVoyage - ${songTitle.innerText}`, text: '一起潜入幻梦腔体的声色流吧 🎧' }).catch(() => fallbackToShowPoster(posterCanvas));
                    } else if (navigator.share) {
                        navigator.share({ title: `DreamyVoyage - ${songTitle.innerText}`, text: `我在听：${songTitle.innerText}`, url: shareUrl }).catch(() => fallbackToShowPoster(posterCanvas));
                    } else {
                        fallbackToShowPoster(posterCanvas);
                    }
                }, 'image/png');
            };
            function fallbackToShowPoster(canvas) {
                const finalPoster = new Image(); finalPoster.src = canvas.toDataURL('image/png');
                posterContainer.innerHTML = ''; posterContainer.appendChild(finalPoster); shareModal.classList.remove('hidden-modal');
            }
            imgQR.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">二维码加载失败</p>'; };
        };
        imgCover.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">海报加载出错</p>'; };
    });

    closeModalBtn.addEventListener('click', (e) => { e.stopPropagation(); shareModal.classList.add('hidden-modal'); });

    loadSongs();
});
