/**
 * DreamyVoyage - 炫酷音乐播放网页核心逻辑 (2D 高级兼容版)
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

    const canvas = document.getElementById('webgl-canvas'); // 延用 ID，但改用 2D context
    const ctx = canvas.getContext('2d');

    // 播放状态变量
    let songList = [];
    let currentSongIndex = 0;
    let isPlaying = false;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    // 1. 初始化及自适应尺寸
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 2. 加载歌曲列表 (直连 song-list.js 规避跨域)
    async function loadSongs() {
        if (window.songList && window.songList.length > 0) {
            songList = window.songList;
            renderSongList();
            loadSong(0);
        } else {
            console.error('加载歌单失败: window.songList 未找到');
            songTitle.innerText = "歌单文件未找到";
        }
    }

    // 渲染抽屉列表
    function renderSongList() {
        songListContainer.innerHTML = '';
        songList.forEach((songPath, index) => {
            let displayTitle = songPath.replace('.mp3', '');
            if (displayTitle.includes('-')) {
                displayTitle = displayTitle.split('-')[1];
            }

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

    // 加载单首歌曲
    function loadSong(index) {
        currentSongIndex = index;
        const songPath = songList[index];
        audio.src = `./mp3s/${songPath}`;
        
        let displayTitle = songPath.replace('.mp3', '');
        if (displayTitle.includes('-')) {
            displayTitle = displayTitle.split('-')[1];
        }
        songTitle.innerText = displayTitle;

        const items = document.querySelectorAll('.song-item');
        items.forEach((item, i) => {
            if (i === index) item.classList.add('active');
            else item.classList.remove('active');
        });

        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        currentTimeEl.innerText = "0:00";
    }

    // 3. 进入页面：全屏任意点击解锁
    function startExperience() {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }

        playAudio(); 
        startVisualizer(); // 启动 2D 可视化
    }

    introOverlay.addEventListener('click', startExperience);
    introOverlay.addEventListener('touchstart', startExperience);

    function setupAudioAnalyser() {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // 较小的 fftSize 让频谱线条更洗炼
        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    // 4. 播放器控制
    function playAudio() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
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

    btnPlayPause.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isPlaying) pauseAudio();
        else playAudio();
    });

    btnNext.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSongIndex = (currentSongIndex + 1) % songList.length;
        loadSong(currentSongIndex);
        playAudio();
    });

    btnPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
        loadSong(currentSongIndex);
        playAudio();
    });

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
        const offsetX = e.clientX - rect.left;
        const percentage = Math.min(Math.max(offsetX / rect.width, 0), 1);
        audio.currentTime = percentage * audio.duration;
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
    // 5. 纯 2D Canvas 高阶动态背景 & 频带粒子流
    // ==========================================
    let hue = 280; 
    let particles = [];

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3;
            this.size = Math.random() * 3 + 1;
            this.opacity = Math.random() * 0.5 + 0.3;
            // 粒子主要使用蒸汽波粉、紫、蓝
            this.color = `hsla(${260 + Math.random() * 60}, 100%, 65%, ${this.opacity})`;
        }
        update(speedMult) {
            this.x += this.vx * speedMult;
            this.y += this.vy * speedMult;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(0, 242, 255, 0.4)';
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0; // 重置
        }
    }

    // 初始化 180 个粒子
    for (let i = 0; i < 180; i++) particles.push(new Particle());

    function startVisualizer() {
        function renderLoop() {
            requestAnimationFrame(renderLoop);

            // A. 背景微透，制造发光残影 (Vaporwave 拖尾特效)
            ctx.fillStyle = 'rgba(5, 4, 10, 0.2)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let audioIntensity = 1; 
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                audioIntensity = (sum / dataArray.length / 30) + 1; // 极光扩张阀值
            }

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            // B. 绘制放射状霓虹光谱环线 (Circular Music Visualizer)
            if (isPlaying && analyser) {
                const baseRadius = window.innerWidth < 480 ? 95 : 120; // 自适应圆盘半径
                const lineCount = dataArray.length;
                const angleStep = (Math.PI * 2) / lineCount;

                ctx.save();
                ctx.translate(centerX, centerY);
                
                for (let i = 0; i < lineCount; i++) {
                    const value = dataArray[i];
                    const barHeight = value * 0.45 + (10 * Math.sin(Date.now() * 0.002 + i)); // 线高随频段抖动
                    const angle = i * angleStep;

                    const x1 = Math.cos(angle) * baseRadius;
                    const y1 = Math.sin(angle) * baseRadius;
                    const x2 = Math.cos(angle) * (baseRadius + barHeight);
                    const y2 = Math.sin(angle) * (baseRadius + barHeight);

                    // 霓虹渐变线
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = `hsl(${(hue + i * 2) % 360}, 100%, 60%)`;
                    
                    ctx.strokeStyle = `hsl(${(hue + i) % 360}, 100%, 65%)`;
                    ctx.lineWidth = window.innerWidth < 480 ? 3 : 5;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
                ctx.shadowBlur = 0; // 再次重置
            }

            // C. 水波极光环脉冲
            if (isPlaying && dataArray) {
                const lowFreqValue = dataArray[3] || 0; // 抽取低频鼓点
                ctx.save();
                ctx.shadowBlur = 30;
                ctx.shadowColor = 'rgba(181, 60, 255, 0.4)';
                ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 0.3)`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 130 + lowFreqValue * 0.3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // D. 运行背景粒子流
            particles.forEach(p => {
                p.update(audioIntensity * 0.8);
                p.draw();
            });

            hue = (hue + 0.15) % 360; 
        }
        renderLoop();
    }

    // 6. 一键分享海报生成算法
    btnShare.addEventListener('click', (e) => {
        e.stopPropagation();
        posterContainer.innerHTML = '<p style="color:var(--neon-cyan)">正在生成炫酷海报...</p>';
        shareModal.classList.remove('hidden-modal');

        const posterCanvas = document.createElement('canvas');
        const pCtx = posterCanvas.getContext('2d');
        posterCanvas.width = 1080;
        posterCanvas.height = 1920;

        const imgCover = new Image();
        imgCover.crossOrigin = "anonymous";
        imgCover.src = coverImg.src;

        imgCover.onload = () => {
            const gradient = pCtx.createLinearGradient(0, 0, 0, 1920);
            gradient.addColorStop(0, '#0d0722');
            gradient.addColorStop(0.5, '#160a22');
            gradient.addColorStop(1, '#080510');
            pCtx.fillStyle = gradient;
            pCtx.fillRect(0, 0, 1080, 1920);

            // 绘制网格
            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.08)';
            pCtx.lineWidth = 2;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            const coverSize = 650;
            const coverX = (1080 - coverSize) / 2;
            const coverY = 280;
            
            pCtx.save();
            pCtx.shadowBlur = 60;
            pCtx.shadowColor = '#00f2ff';
            pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize);
            pCtx.restore();

            pCtx.font = "bold 64px 'Orbitron', 'PingFang SC', sans-serif";
            pCtx.fillStyle = "#ffffff";
            pCtx.textAlign = "center";
            pCtx.fillText(songTitle.innerText, 1080/2, 1040);

            pCtx.font = "32px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#ff007f";
            pCtx.fillText("Album: DreamyVoyage", 1080/2, 1110);

            const currentUrl = window.location.href;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=ffffff&bgcolor=000000&data=${encodeURIComponent(currentUrl)}`;

            const imgQR = new Image();
            imgQR.crossOrigin = "anonymous";
            imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 260;
                const qrX = (1080 - qrSize) / 2;
                const qrY = 1350;

                pCtx.save();
                pCtx.shadowBlur = 30;
                pCtx.shadowColor = '#ff007f';
                pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize);
                pCtx.restore();

                pCtx.font = "26px 'Orbitron', sans-serif";
                pCtx.fillStyle = "rgba(0, 242, 255, 0.6)";
                pCtx.fillText("长 按 保存 ，进 入 幻 梦 腔 体", 1080/2, 1680);

                const finalPoster = new Image();
                finalPoster.src = posterCanvas.toDataURL('image/png');
                posterContainer.innerHTML = '';
                posterContainer.appendChild(finalPoster);
            };
            imgQR.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">二维码加载失败</p>'; };
        };
        imgCover.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">海报生成出错</p>'; };
    });

    closeModalBtn.addEventListener('click', (e) => { e.stopPropagation(); shareModal.classList.add('hidden-modal'); });

    // 启动初始加载
    loadSongs();
});
