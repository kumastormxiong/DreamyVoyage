/**
 * DreamyVoyage - 炫酷音乐播放网页 (全景 WebGL 霓虹万花筒 Shader & 2D 圆弧频谱 & 进度条拖拽单次结算版)
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
    const drawerOverlay = document.getElementById('drawer-overlay');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const songListContainer = document.getElementById('song-list');

    const shareModal = document.getElementById('share-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const posterContainer = document.getElementById('poster-container');

    const bgCanvas = document.getElementById('webgl-canvas'); 
    const spCanvas = document.getElementById('spectre-canvas'); 
    const spCtx = spCanvas.getContext('2d');
    const gl = bgCanvas.getContext('webgl', { preserveDrawingBuffer: true });

    let songList = [];
    let currentSongIndex = 0;
    let isPlaying = false;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    // 进度条拖拽性能锁
    let isDragging = false; 
    let pendingTime = 0; // 拖拽中预定时间

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
                if (!isNaN(index) && index >= 0 && index < songList.length) currentSongIndex = index;
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
            item.style.setProperty('--delay', index);

            item.innerHTML = `
                <span class="song-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="song-item-title">${displayTitle}</span>
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDrawer();
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
        progressFill.style.width = '0%'; progressHandle.style.left = '0%'; currentTimeEl.innerText = "0:00";
    }

    function startExperience() {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen被阻：', e));
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }
        playAudio(); 
        initWebGL(); 
        startVisualizer(); 
    }

    introOverlay.addEventListener('click', startExperience);
    introOverlay.addEventListener('touchstart', startExperience);

    function setupAudioAnalyser() {
        analyser = audioContext.createAnalyser(); analyser.fftSize = 256; 
        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser); analyser.connect(audioContext.destination);
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
        audio.pause(); isPlaying = false;
        btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
        document.querySelector('.player-card').classList.remove('playing');
    }

    btnPlayPause.addEventListener('click', (e) => { e.stopPropagation(); isPlaying ? pauseAudio() : playAudio(); });
    btnNext.addEventListener('click', (e) => { e.stopPropagation(); currentSongIndex = (currentSongIndex + 1) % songList.length; loadSong(currentSongIndex); playAudio(); });
    btnPrev.addEventListener('click', (e) => { e.stopPropagation(); currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length; loadSong(currentSongIndex); playAudio(); });

    // 自动时间进度更新（仅在未拖动时生效）
    audio.addEventListener('timeupdate', () => {
        if (audio.duration && !isDragging) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${progress}%`; progressHandle.style.left = `${progress}%`;
            currentTimeEl.innerText = formatTime(audio.currentTime); durationTimeEl.innerText = formatTime(audio.duration);
        }
    });

    // ==========================================
    // 进度条微操拖拽（彻底解耦实时Range拉扯跳动）
    // ==========================================
    function updateProgress(clientX) {
        if (!audio.duration) return;
        const rect = progressTrack.getBoundingClientRect();
        const percentage = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        
        // 1. 实时更新排版的 UI 占用渲染，不碰 audio.currentTime
        progressFill.style.width = `${percentage * 100}%`;
        progressHandle.style.left = `${percentage * 100}%`;
        currentTimeEl.innerText = formatTime(percentage * audio.duration);
        
        // 2. 预存结算时间
        pendingTime = percentage * audio.duration; 
    }

    progressTrack.addEventListener('mousedown', (e) => { e.stopPropagation(); isDragging = true; updateProgress(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (isDragging) { e.preventDefault(); updateProgress(e.clientX); } });
    window.addEventListener('mouseup', (e) => { 
        if (isDragging) { 
            e.stopPropagation(); isDragging = false; 
            audio.currentTime = pendingTime; // 只有在释放的一刹那，才向浏览器请求断面，丝滑无跳跃
        } 
    });

    progressTrack.addEventListener('touchstart', (e) => { e.stopPropagation(); isDragging = true; updateProgress(e.touches[0].clientX); }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (isDragging) { e.preventDefault(); updateProgress(e.touches[0].clientX); } }, { passive: false });
    window.addEventListener('touchend', (e) => { 
        if (isDragging) { 
            e.stopPropagation(); isDragging = false; 
            audio.currentTime = pendingTime; // 触屏端结算
        } 
    });

    audio.addEventListener('ended', () => btnNext.click());

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function openDrawer() { drawer.classList.add('open'); drawerOverlay.classList.add('active'); }
    function closeDrawer() { drawer.classList.remove('open'); drawerOverlay.classList.remove('active'); }

    btnList.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(); });
    closeDrawerBtn.addEventListener('click', (e) => { e.stopPropagation(); closeDrawer(); });
    drawerOverlay.addEventListener('click', (e) => { e.stopPropagation(); closeDrawer(); });

    // ==========================================
    // 5.1 底层：全景 WebGL 霓虹万花筒 Cosine Palette Shader
    // ==========================================
    let glProgram;

    const vsSource = `
        attribute vec2 position;
        varying vec2 vUv;
        void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
    `;

    // 彻底重构：换用不会由于 FBM 导致色阶 Banding 的万花筒循环算法，霓虹感极强
    const fsSource = `
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        varying vec2 vUv;

        // Iq (Inigo Quilez) Cosine Palette 配色公式
        vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
            return a + b*cos( 6.28318*(c*t+d) );
        }

        void main() {
            vec2 p = (vUv * 2.0 - 1.0);
            p.x *= iResolution.x / iResolution.y;

            vec2 p_orig = p;
            float t = iTime * 0.18; // 速度调适，流淌感
            vec3 finalColor = vec3(0.0);

            // 3 次万花筒递归：在任何平台上都没有色阶断纹，不偏大爆 float
            for(float i = 0.0; i < 3.0; i++) {
                p = fract(p * 1.5) - 0.5;

                float d = length(p) * exp(-length(p_orig));

                // 蒸汽波霓虹色彩：选用高对比饱和色彩配方
                vec3 col = palette(length(p_orig) + i * 0.45 + t, 
                    vec3(0.5, 0.5, 0.5), 
                    vec3(0.5, 0.5, 0.5), 
                    vec3(1.0, 1.0, 1.0), 
                    vec3(0.26, 0.41, 0.66)
                );

                d = sin(d * 8.0 + t) / 8.0;
                d = abs(d);
                d = pow(0.012 / d, 1.2); // 增强霓虹线条对比

                finalColor += col * d;
            }

            // 抑制极端溢出，让色彩明朗霓虹
            gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
        }
    `;

    function createShader(gl, type, source) {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return null; }
        return shader;
    }

    function initWebGL() {
        if (!gl) return;
        const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        glProgram = gl.createProgram(); gl.attachShader(glProgram, vs); gl.attachShader(glProgram, fs); gl.linkProgram(glProgram);

        const positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

        const posLocation = gl.getAttribLocation(glProgram, 'position'); gl.enableVertexAttribArray(posLocation); gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

        requestAnimationFrame(bgRenderLoop);
    }

    function bgRenderLoop(now) {
        requestAnimationFrame(bgRenderLoop); if (!gl || !glProgram) return;
        gl.viewport(0, 0, bgCanvas.width, bgCanvas.height); gl.useProgram(glProgram);
        gl.uniform2f(gl.getUniformLocation(glProgram, 'iResolution'), bgCanvas.width, bgCanvas.height);
        gl.uniform1f(gl.getUniformLocation(glProgram, 'iTime'), now * 0.001);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ==========================================
    // 5.2 上层：2D Circular Music Visualizer 
    // ==========================================
    let hue = 280;

    function startVisualizer() {
        function renderLoop() {
            requestAnimationFrame(renderLoop);
            spCtx.clearRect(0, 0, spCanvas.width, spCanvas.height);

            let lowFreqValue = 0;
            if (analyser && dataArray) { analyser.getByteFrequencyData(dataArray); lowFreqValue = dataArray[3] || 0; }

            const centerX = spCanvas.width / 2;
            const centerY = spCanvas.height / 2;

            if (isPlaying && analyser) {
                const baseRadius = window.innerWidth < 480 ? 95 : 120; 
                const lineCount = dataArray.length; const angleStep = (Math.PI * 2) / lineCount;

                spCtx.save(); spCtx.translate(centerX, centerY);
                for (let i = 0; i < lineCount; i++) {
                    const value = dataArray[i]; const barHeight = value * 0.5 + (10 * Math.sin(Date.now() * 0.002 + i)); const angle = i * angleStep;
                    const x1 = Math.cos(angle) * baseRadius; const y1 = Math.sin(angle) * baseRadius;
                    const x2 = Math.cos(angle) * (baseRadius + barHeight); const y2 = Math.sin(angle) * (baseRadius + barHeight);

                    spCtx.shadowBlur = 15; spCtx.shadowColor = `hsl(${(hue + i * 2) % 360}, 100%, 60%)`;
                    spCtx.strokeStyle = `hsl(${(hue + i) % 360}, 100%, 65%)`; spCtx.lineWidth = window.innerWidth < 480 ? 3 : 5;
                    spCtx.beginPath(); spCtx.moveTo(x1, y1); spCtx.lineTo(x2, y2); spCtx.stroke();
                }
                spCtx.restore(); spCtx.shadowBlur = 0; 
            }

            if (isPlaying && dataArray) {
                spCtx.save(); spCtx.shadowBlur = 15; spCtx.shadowColor = `hsla(${hue}, 100%, 65%, 0.4)`;
                spCtx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.4)`; spCtx.lineWidth = 4;
                spCtx.beginPath(); spCtx.arc(centerX, centerY, 135 + lowFreqValue * 0.4, 0, Math.PI * 2); spCtx.stroke(); spCtx.restore();
            }
            hue = (hue + 0.12) % 360; 
        }
        renderLoop();
    }

    // 6. 系统海报生成 (动态背景 + 疏朗重排)
    btnShare.addEventListener('click', (e) => {
        e.stopPropagation(); posterContainer.innerHTML = '<p style="color:var(--neon-cyan)">正在初始化分享...</p>';
        const posterCanvas = document.createElement('canvas'); const pCtx = posterCanvas.getContext('2d');
        posterCanvas.width = 1080; posterCanvas.height = 1920;

        const imgCover = new Image(); imgCover.crossOrigin = "anonymous"; imgCover.src = coverImg.src;

        imgCover.onload = () => {
            if (gl) { pCtx.drawImage(bgCanvas, 0, 0, 1080, 1920); } 
            else { pCtx.fillStyle = '#0a0815'; pCtx.fillRect(0, 0, 1080, 1920); }

            // 海报底色蒙层透明度降下 50%
            pCtx.fillStyle = 'rgba(8, 4, 15, 0.52)'; pCtx.fillRect(0, 0, 1080, 1920);

            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.05)'; pCtx.lineWidth = 1;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            const coverSize = 580; const coverX = (1080 - coverSize) / 2; const coverY = 170;
            pCtx.save(); pCtx.shadowBlur = 60; pCtx.shadowColor = '#00f2ff'; pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize); pCtx.restore();

            pCtx.font = "italic 32px 'Orbitron', sans-serif"; pCtx.fillStyle = "#ff007f"; pCtx.textAlign = "center"; pCtx.fillText("Now Playing Tracks", 1080/2, 820);

            pCtx.font = "bold 66px 'Orbitron', 'PingFang SC', sans-serif"; pCtx.fillStyle = "#ffffff"; pCtx.shadowBlur = 12; pCtx.shadowColor = "rgba(0, 242, 255, 0.8)"; 
            pCtx.fillText(songTitle.innerText, 1080/2, 900); pCtx.shadowBlur = 0;

            const shareUrl = `https://dreamy.voyage/?song=${currentSongIndex}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=ffffff&bgcolor=000000&data=${encodeURIComponent(shareUrl)}`;

            const imgQR = new Image(); imgQR.crossOrigin = "anonymous"; imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 250; const qrX = (1080 - qrSize) / 2; const qrY = 1060; 
                pCtx.save(); pCtx.shadowBlur = 35; pCtx.shadowColor = '#b53cff'; pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize); pCtx.restore();

                pCtx.font = "24px 'Orbitron', sans-serif"; pCtx.fillStyle = "rgba(0, 242, 255, 0.5)"; pCtx.fillText("长 按 保存 ，扫 码 进 入 幻 梦 腔 体", 1080/2, 1360);

                pCtx.font = "bold 46px 'PingFang SC', 'Microsoft YaHei', sans-serif"; pCtx.fillStyle = "rgba(255, 255, 255, 0.85)"; pCtx.fillText("幻 梦 之 旅", 1080/2, 1650);
                pCtx.font = "italic bold 30px 'Orbitron', sans-serif"; pCtx.fillStyle = "#ff007f"; pCtx.fillText("DreamyVoyage", 1080/2, 1710);

                posterCanvas.toBlob((blob) => {
                    const file = new File([blob], 'dreamy_share.png', { type: 'image/png' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({ files: [file], title: `DreamyVoyage - ${songTitle.innerText}` }).catch(() => fallbackToShowPoster(posterCanvas));
                    } else if (navigator.share) {
                        navigator.share({ title: `DreamyVoyage - ${songTitle.innerText}`, url: shareUrl }).catch(() => fallbackToShowPoster(posterCanvas));
                    } else { fallbackToShowPoster(posterCanvas); }
                }, 'image/png');
            };
            function fallbackToShowPoster(canvas) { const finalPoster = new Image(); finalPoster.src = canvas.toDataURL('image/png'); posterContainer.innerHTML = ''; posterContainer.appendChild(finalPoster); shareModal.classList.remove('hidden-modal'); }
        };
    });

    closeModalBtn.addEventListener('click', (e) => { e.stopPropagation(); shareModal.classList.add('hidden-modal'); });

    loadSongs();
});
