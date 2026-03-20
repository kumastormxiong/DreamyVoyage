/**
 * DreamyVoyage - 炫酷音乐播放网页核心逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const introOverlay = document.getElementById('intro-overlay');
    const enterBtn = document.getElementById('enter-btn');
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

    const canvas = document.getElementById('webgl-canvas');
    const ctx = canvas.getContext('2d');

    // 播放状态变量
    let songList = [];
    let currentSongIndex = 0;
    let isPlaying = false;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    // 1. 初始化尺寸
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 2. 加载歌曲列表
    async function loadSongs() {
        if (window.songList && window.songList.length > 0) {
            songList = window.songList;
            renderSongList();
            loadSong(0);
        } else {
            console.error('歌单为空或未加载成功');
            songTitle.innerText = "歌单未找到";
        }
    }


    // 渲染抽屉列表
    function renderSongList() {
        songListContainer.innerHTML = '';
        songList.forEach((songPath, index) => {
            // 切割出文件名中的纯歌曲名（去掉前面的序号和小尾巴）
            let displayTitle = songPath.replace('.mp3', '');
            if (displayTitle.includes('-')) {
                displayTitle = displayTitle.split('-')[1]; // 比如 "01-幻梦" -> "幻梦"
            }

            const item = document.createElement('div');
            item.className = 'song-item';
            if (index === currentSongIndex) item.className += ' active';
            
            item.innerHTML = `
                <span class="song-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="song-item-title">${displayTitle}</span>
            `;

            item.addEventListener('click', () => {
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
        
        // 更新 UI
        let displayTitle = songPath.replace('.mp3', '');
        if (displayTitle.includes('-')) {
            displayTitle = displayTitle.split('-')[1];
        }
        songTitle.innerText = displayTitle;

        // 标记Active
        const items = document.querySelectorAll('.song-item');
        items.forEach((item, i) => {
            if (i === index) item.classList.add('active');
            else item.classList.remove('active');
        });

        // 重置进度条
        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        currentTimeEl.innerText = "0:00";
    }

    // 3. 进入按钮：解锁 Audio 引擎
    enterBtn.addEventListener('click', () => {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        // 解锁 Web Audio Context
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }

        playAudio(); // 自动播放第一首
        startVisualizer();
    });

    function setupAudioAnalyser() {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
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
        audio.play().catch(e => console.log('自动播放需要交互：', e));
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

    btnPlayPause.addEventListener('click', () => {
        if (isPlaying) pauseAudio();
        else playAudio();
    });

    btnNext.addEventListener('click', () => {
        currentSongIndex = (currentSongIndex + 1) % songList.length;
        loadSong(currentSongIndex);
        playAudio();
    });

    btnPrev.addEventListener('click', () => {
        currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
        loadSong(currentSongIndex);
        playAudio();
    });

    // 音频时间更新
    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${progress}%`;
            progressHandle.style.left = `${progress}%`;

            currentTimeEl.innerText = formatTime(audio.currentTime);
            durationTimeEl.innerText = formatTime(audio.duration);
        }
    });

    // 进度条拖拽/点击
    progressTrack.addEventListener('click', (e) => {
        const rect = progressTrack.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.min(Math.max(offsetX / width, 0), 1);
        audio.currentTime = percentage * audio.duration;
    });

    // 自动播放下一首
    audio.addEventListener('ended', () => {
        btnNext.click();
    });

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // 抽屉开关
    btnList.addEventListener('click', () => drawer.classList.add('open'));
    closeDrawerBtn.addEventListener('click', () => drawer.classList.remove('open'));

    // 5. Canvas 动态渲染 (音频可视化 2D 粒子流)
    let hue = 280; // 基准色调
    let particles = [];

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 2;
            this.vy = (Math.random() - 0.5) * 2;
            this.size = Math.random() * 2 + 1;
            this.color = `hsl(${280 + Math.random() * 60}, 100%, 70%)`;
        }
        update(speedMult) {
            this.x += this.vx * speedMult;
            this.y += this.vy * speedMult;

            // 越界重置
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 初始化粒子
    for (let i = 0; i < 150; i++) particles.push(new Particle());

    function startVisualizer() {
        function renderLoop() {
            requestAnimationFrame(renderLoop);

            // 1. 半透明覆盖层制造运动残影模糊效果 (蒸汽波特色)
            ctx.fillStyle = 'rgba(5, 6, 8, 0.15)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let audioIntensity = 1; // 默认强度
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                audioIntensity = sum / dataArray.length / 40; // 缩放系数
                if (audioIntensity < 1) audioIntensity = 1;
            }

            // 2. 绘制背景发致霓虹圆环 (中心扩张频率)
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            if (isPlaying && analyser) {
                // 读取低频
                let bass = dataArray ? dataArray[2] : 0;
                let radius = 100 + bass * 0.5;

                ctx.save();
                ctx.shadowBlur = 40;
                ctx.shadowColor = 'rgba(255, 0, 127, 0.6)';
                ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // 绘制频谱线条 (星状散射)
                ctx.save();
                ctx.translate(centerX, centerY);
                for (let i = 0; i < dataArray.length; i += 4) {
                    const angle = (i / dataArray.length) * Math.PI * 2;
                    const h = dataArray[i] * 0.4;
                    const x1 = Math.cos(angle) * (radius + 5);
                    const y1 = Math.sin(angle) * (radius + 5);
                    const x2 = Math.cos(angle) * (radius + 5 + h);
                    const y2 = Math.sin(angle) * (radius + 5 + h);

                    ctx.strokeStyle = `hsl(${(hue + i) % 360}, 100%, 60%)`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // 3. 运行粒子
            particles.forEach(p => {
                p.update(audioIntensity);
                p.draw();
            });

            hue = (hue + 0.1) % 360; // 缓慢变色
        }
        renderLoop();
    }

    // 6. 一键分享海报生成算法
    btnShare.addEventListener('click', () => {
        posterContainer.innerHTML = '<p style="color:var(--neon-cyan)">正在生成炫酷海报...</p>';
        shareModal.classList.remove('hidden-modal');

        // 创建离屏 Canvas 构建海报
        const posterCanvas = document.createElement('canvas');
        const pCtx = posterCanvas.getContext('2d');
        
        // 设置海报尺寸 1080 x 1920 (标准手机海报比例)
        posterCanvas.width = 1080;
        posterCanvas.height = 1920;

        // 加载当前歌曲封面
        const imgCover = new Image();
        imgCover.crossOrigin = "anonymous";
        imgCover.src = coverImg.src;

        imgCover.onload = () => {
            // A. 背景：渐变
            const gradient = pCtx.createLinearGradient(0, 0, 0, 1920);
            gradient.addColorStop(0, '#0a0b1e');
            gradient.addColorStop(0.5, '#130415');
            gradient.addColorStop(1, '#050308');
            pCtx.fillStyle = gradient;
            pCtx.fillRect(0, 0, 1080, 1920);

            // 绘制网格线背板 (赛博朋克)
            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.1)';
            pCtx.lineWidth = 1;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            // B. 唱片封面
            const coverSize = 650;
            const coverX = (1080 - coverSize) / 2;
            const coverY = 300;
            
            pCtx.save();
            pCtx.shadowBlur = 50;
            pCtx.shadowColor = '#b53cff';
            pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize);
            pCtx.restore();

            // C. 绘制音乐名称
            pCtx.font = "bold 60px 'Orbitron', sans-serif, 'PingFang SC'";
            pCtx.fillStyle = "#ffffff";
            pCtx.textAlign = "center";
            pCtx.textBaseline = "middle";
            pCtx.fillText(songTitle.innerText, 1080/2, 1050);

            pCtx.font = "30px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#00f2ff";
            pCtx.fillText("Album: DreamyVoyage", 1080/2, 1120);

            // D. 生成二维码并贴合
            const currentUrl = window.location.href;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=ffffff&bgcolor=000000&data=${encodeURIComponent(currentUrl)}`;

            const imgQR = new Image();
            imgQR.crossOrigin = "anonymous";
            imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 250;
                const qrX = (1080 - qrSize) / 2;
                const qrY = 1350;

                // 二维码框阴影
                pCtx.save();
                pCtx.shadowBlur = 20;
                pCtx.shadowColor = '#ff007f';
                pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize);
                pCtx.restore();

                pCtx.font = "24px 'Orbitron', sans-serif";
                pCtx.fillStyle = "rgba(255,255,255,0.4)";
                pCtx.fillText("长按扫码，进入幻梦腔体", 1080/2, 1650);

                // 将 Canvas 转换为 IMG 输出
                const finalPoster = new Image();
                finalPoster.src = posterCanvas.toDataURL('image/png');
                posterContainer.innerHTML = '';
                posterContainer.appendChild(finalPoster);
            };

            imgQR.onerror = () => {
                 posterContainer.innerHTML = '<p style="color:#ff007f">二维码加载失败，请检查网络</p>';
            };
        };

        imgCover.onerror = () => {
            posterContainer.innerHTML = '<p style="color:#ff007f">海报生成出错，没能加载封皮</p>';
        };
    });

    closeModalBtn.addEventListener('click', () => shareModal.classList.add('hidden-modal'));

    // 启动初始加载
    loadSongs();
});
