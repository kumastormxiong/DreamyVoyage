/**
 * DreamyVoyage - 炫酷音乐播放网页逻辑 (梦幻模糊极光版)
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

    const canvas = document.getElementById('webgl-canvas'); 
    const ctx = canvas.getContext('2d');

    // 播放状态
    let songList = [];
    let currentSongIndex = 0;
    let isPlaying = false;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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
        } else {
            console.error('加载歌单失败: window.songList 未找到');
            songTitle.innerText = "歌单加载失败";
        }
    }

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

    function startExperience() {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }

        playAudio(); 
        startVisualizer(); 
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
    // 5. 纯 2D Canvas 液态梦幻极光背景
    // ==========================================
    let hue = 280; 

    function startVisualizer() {
        function renderLoop() {
            requestAnimationFrame(renderLoop);

            // A. 水墨微透叠加，制造液体流动 & 极其模棚的感觉
            ctx.fillStyle = 'rgba(5, 4, 10, 0.15)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let audioIntensity = 1; 
            let lowFreqValue = 0;
            
            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                audioIntensity = (sum / dataArray.length / 30) + 1; 
                lowFreqValue = dataArray[3] || 0; // 低频
            }

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const time = Date.now() * 0.0008;

            // B. 绘制液态极光晕染叠加 (不再使用小球粒子)
            ctx.save();
            ctx.globalCompositeOperation = 'screen'; // 颜色亮化叠加，产生爆炸视觉通透感

            // 极光 1：左上
            const rad1 = (canvas.width * 0.45) + (lowFreqValue * 0.8);
            const x1 = canvas.width * 0.3 + 100 * Math.sin(time * 0.7);
            const y1 = canvas.height * 0.3 + 80 * Math.cos(time * 0.5);
            const grad1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, rad1);
            grad1.addColorStop(0, `hsla(${(hue) % 360}, 100%, 65%, 0.4)`);
            grad1.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad1;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 极光 2：右下
            const rad2 = (canvas.width * 0.5) + (lowFreqValue * 1.2);
            const x2 = canvas.width * 0.7 + 120 * Math.cos(time * 0.6);
            const y2 = canvas.height * 0.7 + 90 * Math.sin(time * 0.8);
            const grad2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, rad2);
            grad2.addColorStop(0, `hsla(${(hue + 120) % 360}, 100%, 60%, 0.35)`);
            grad2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad2;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 极光 3：中心大背板脉冲板
            const rad3 = (canvas.width * 0.6) + (lowFreqValue * 0.5);
            const grad3 = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, rad3);
            grad3.addColorStop(0, `hsla(${(hue + 240) % 360}, 100%, 55%, 0.25)`);
            grad3.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad3;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.restore();

            // C. 水波极光环脉冲 (范围加大)
            if (isPlaying && dataArray) {
                ctx.save();
                ctx.shadowBlur = 40;
                ctx.shadowColor = `hsla(${hue}, 100%, 65%, 0.6)`;
                ctx.strokeStyle = `hsla(${hue}, 100%, 75%, 0.4)`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                // 膨胀系数大幅度增加
                ctx.arc(centerX, centerY, 140 + lowFreqValue * 0.6, 0, Math.PI * 2);
                ctx.stroke();
                
                // 第二层极光环，更远
                ctx.shadowColor = `hsla(${(hue + 60) % 360}, 100%, 65%, 0.4)`;
                ctx.strokeStyle = `hsla(${(hue + 60) % 360}, 100%, 75%, 0.2)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 200 + lowFreqValue * 0.9, 0, Math.PI * 2);
                ctx.stroke();

                ctx.restore();
            }

            hue = (hue + 0.12) % 360; 
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
            gradient.addColorStop(0, '#0a0815');
            gradient.addColorStop(0.5, '#12071a');
            gradient.addColorStop(1, '#050308');
            pCtx.fillStyle = gradient;
            pCtx.fillRect(0, 0, 1080, 1920);

            // 绘制网格板线
            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.08)';
            pCtx.lineWidth = 2;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            const coverSize = 650;
            const coverX = (1080 - coverSize) / 2;
            const coverY = 250;
            
            pCtx.save();
            pCtx.shadowBlur = 60;
            pCtx.shadowColor = '#00f2ff';
            pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize);
            pCtx.restore();

            pCtx.font = "italic 36px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#ff007f";
            pCtx.textAlign = "center";
            pCtx.fillText("Now Playing Tracks", 1080/2, 950);

            // 歌曲标题
            pCtx.font = "bold 66px 'Orbitron', 'PingFang SC', sans-serif";
            pCtx.fillStyle = "#ffffff";
            pCtx.shadowColor = "rgba(0, 242, 255, 0.8)";
            pCtx.shadowBlur = 12;
            pCtx.fillText(songTitle.innerText, 1080/2, 1030);
            pCtx.shadowBlur = 0;

            // ===== 追加专辑中英文名称 =====
            pCtx.font = "bold 46px 'PingFang SC', 'Microsoft YaHei', sans-serif";
            pCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
            pCtx.fillText("幻 梦 之 旅", 1080/2, 1110);

            pCtx.font = "italic bold 32px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#ff007f";
            pCtx.fillText("DreamyVoyage", 1080/2, 1165);

            const shareUrl = `https://dreamy.voyage/?song=${currentSongIndex}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=ffffff&bgcolor=000000&data=${encodeURIComponent(shareUrl)}`;

            const imgQR = new Image();
            imgQR.crossOrigin = "anonymous";
            imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 250;
                const qrX = (1080 - qrSize) / 2;
                const qrY = 1320;

                pCtx.save();
                pCtx.shadowBlur = 35;
                pCtx.shadowColor = '#b53cff';
                pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize);
                pCtx.restore();

                pCtx.font = "26px 'Orbitron', sans-serif";
                pCtx.fillStyle = "rgba(0, 242, 255, 0.6)";
                pCtx.fillText("长 按 保存 ，扫 码 进 入 幻 梦 腔 体", 1080/2, 1630);

                posterCanvas.toBlob((blob) => {
                    const file = new File([blob], 'dreamy_share.png', { type: 'image/png' });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({
                            files: [file],
                            title: `DreamyVoyage - ${songTitle.innerText}`,
                            text: '一起潜入幻梦腔体的声色流吧 🎧',
                        }).catch((err) => {
                            console.log('系统分享取消:', err);
                            fallbackToShowPoster(posterCanvas);
                        });
                    } else if (navigator.share) {
                        navigator.share({
                            title: `DreamyVoyage - ${songTitle.innerText}`,
                            text: `正在听：${songTitle.innerText}`,
                            url: shareUrl
                        }).catch(() => fallbackToShowPoster(posterCanvas));
                    } else {
                        fallbackToShowPoster(posterCanvas);
                    }
                }, 'image/png');
            };
            
            function fallbackToShowPoster(canvas) {
                const finalPoster = new Image();
                finalPoster.src = canvas.toDataURL('image/png');
                posterContainer.innerHTML = '';
                posterContainer.appendChild(finalPoster);
                shareModal.classList.remove('hidden-modal');
            }

            imgQR.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">二维码加载失败</p>'; };
        };
        imgCover.onerror = () => { posterContainer.innerHTML = '<p style="color:#ff007f">海报加载出错</p>'; };
    });

    closeModalBtn.addEventListener('click', (e) => { e.stopPropagation(); shareModal.classList.add('hidden-modal'); });

    loadSongs();
});
