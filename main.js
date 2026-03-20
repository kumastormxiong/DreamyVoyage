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

    // 3. 进入页面：解锁 Audio 引擎（全屏任意位置触发）
    function startExperience() {
        introOverlay.style.opacity = '0';
        setTimeout(() => introOverlay.style.display = 'none', 800);
        app.classList.remove('hidden');

        // 解锁 Web Audio Context
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioAnalyser();
        }

        playAudio(); // 自动播放第一首
        initWebGL(); // 初始化 WebGL
    }

    introOverlay.addEventListener('click', startExperience);
    introOverlay.addEventListener('touchstart', startExperience);

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

    btnPlayPause.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止冒泡触发全屏点击（如果是以后）
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
        e.stopPropagation();
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
    btnList.addEventListener('click', (e) => { e.stopPropagation(); drawer.classList.add('open'); });
    closeDrawerBtn.addEventListener('click', (e) => { e.stopPropagation(); drawer.classList.remove('open'); });

    // ==========================================
    // 5. WebGL Shader 动态背景
    // ==========================================
    const gl = canvas.getContext('webgl');
    let program;
    let audioTexture;

    const vsSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // 用户提供的 ShaderToy 移植改造
    const fsSource = `
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        uniform float iTimeDelta;
        uniform sampler2D iChannel0;

        #define speed 5. 
        #define wave_thing
        #define audio_vibration_amplitude .125

        float jTime;

        float round(float x) { return floor(x + 0.5); }
        vec2 round(vec2 x) { return floor(x + 0.5); }
        vec3 round(vec3 x) { return floor(x + 0.5); }

        vec4 textureMirror(sampler2D tex, vec2 c){
            vec2 cf = fract(c);
            return texture2D(tex, mix(cf, 1.-cf, mod(floor(c), vec2(2.0))));
        }

        float amp(vec2 p){
            return smoothstep(1.,8.,abs(p.x));   
        }

        float pow512(float a){
            a*=a; a*=a; a*=a; a*=a; a*=a; a*=a; a*=a; a*=a; a*=a;
            return a;
        }

        float pow1d5(float a){
            return a*sqrt(a);
        }

        float hash21(vec2 co){
            return fract(sin(dot(co.xy,vec2(1.9898,7.233)))*45758.5433);
        }

        float hash(vec2 uv){
            float a = amp(uv);
            #ifdef wave_thing
            float w = a>0.?(1.-.4*pow512(.51+.49*sin((.02*(uv.y+.5*uv.x)-jTime)*2.))):0.;
            #else
            float w=1.;
            #endif
            return (a>0.? a*pow1d5(hash21(uv))*w : 0.) - (textureMirror(iChannel0,vec2((uv.x*29.+uv.y)*.03125,1.)).x)*audio_vibration_amplitude;
        }

        float edgeMin(float dx,vec2 da, vec2 db,vec2 uv){
            uv.x+=5.;
            vec3 c = fract((round(vec3(uv,uv.x+uv.y)))*(vec3(0,1,2)+0.61803398875));
            float a1 = textureMirror(iChannel0,vec2(c.y,0.)).x>.6?.15:1.;
            float a2 = textureMirror(iChannel0,vec2(c.x,0.)).x>.6?.15:1.;
            float a3 = textureMirror(iChannel0,vec2(c.z,0.)).x>.6?.15:1.;
            return min(min((1.-dx)*db.y*a3,da.x*a2),da.y*a1);
        }

        vec2 trinoise(vec2 uv){
            const float sq = 1.22474487; // sqrt(3/2)
            uv.x *= sq;
            uv.y -= .5*uv.x;
            vec2 d = fract(uv);
            uv -= d;

            bool c = dot(d,vec2(1))>1.;
            vec2 dd = 1.-d;
            vec2 da = c?dd:d,db = c?d:dd;
            
            float nn = hash(uv+float(c));
            float n2 = hash(uv+vec2(1,0));
            float n3 = hash(uv+vec2(0,1));

            float nmid = mix(n2,n3,d.y);
            float ns = mix(nn,c?n2:n3,da.y);
            float dx = da.x/db.y;
            return vec2(mix(ns,nmid,dx),edgeMin(dx,da, db,uv+d));
        }

        vec2 map(vec3 p){
            vec2 n = trinoise(p.xz);
            return vec2(p.y-2.*n.x,n.y);
        }

        vec3 grad(vec3 p){
            const vec2 e = vec2(.005,0);
            float a =map(p).x;
            return vec3(map(p+e.xyy).x-a, map(p+e.yxy).x-a, map(p+e.yyx).x-a)/e.x;
        }

        vec2 intersect(vec3 ro,vec3 rd){
            float d =0.,h=0.;
            for(int i = 0;i<60;i++){ 
                vec3 p = ro+d*rd;
                vec2 s = map(p);
                h = s.x;
                d+= h*.5;
                if(abs(h)<.003*d) return vec2(d,s.y);
                if(d>150.|| p.y>2.) break;
            }
            return vec2(-1);
        }

        void addsun(vec3 rd,vec3 ld,inout vec3 col){
            float sun = smoothstep(.21,.2,distance(rd,ld));
            if(sun>0.){
                float yd = (rd.y-ld.y);
                float a =sin(3.1*exp(-(yd)*14.)); 
                sun*=smoothstep(-.8,0.,a);
                col = mix(col,vec3(1.,.8,.4)*.75,sun);
            }
        }

        float starnoise(vec3 rd){
            float c = 0.;
            vec3 p = normalize(rd)*300.;
            for (float i=0.;i<4.;i++) {
                vec3 q = fract(p)-.5;
                vec3 id = floor(p);
                float c2 = smoothstep(.5,0.,length(q));
                c2 *= step(hash21(id.xz/id.y),.06-i*i*0.005);
                c += c2;
                p = p*.6+.5*p;
            }
            c*=c;
            float g = dot(sin(rd*10.512),cos(rd.yzx*10.512));
            c*=smoothstep(-3.14,-.9,g)*.5+.5*smoothstep(-.3,1.,g);
            return c*c;
        }

        vec3 gsky(vec3 rd,vec3 ld,bool mask){
            float haze = exp2(-5.*(abs(rd.y)-.2*dot(rd,ld)));
            float st = mask?(starnoise(rd))*(1.-min(haze,1.)):0.;
            vec3 back = vec3(.4,.1,.7)*(1.-.5*textureMirror(iChannel0,vec2(.5+.05*rd.x/rd.y,0.)).x*exp2(-.1*abs(length(rd.xz)/rd.y))*max(sign(rd.y),0.));
            vec3 col=clamp(mix(back,vec3(.7,.1,.4),haze)+st,0.,1.);
            if(mask)addsun(rd,ld,col);
            return col;  
        }

        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
            vec2 uv = (2.*fragCoord - iResolution.xy)/iResolution.y;
            const float shutter_speed = .25; 
            float dt = fract(hash21(fragCoord)+iTime)*shutter_speed;
            jTime = mod(iTime-dt*iTimeDelta,4000.);
            
            vec3 ro = vec3(0.,1,(-20000.+jTime*speed));
            vec3 rd = normalize(vec3(uv,4./3.));
            
            vec2 i = intersect(ro,rd);
            float d = i.x;
            vec3 ld = normalize(vec3(0,.125+.05*sin(.1*jTime),1));

            vec3 fog = d>0.?exp2(-d*vec3(.14,.1,.28)):vec3(0.);
            vec3 sky = gsky(rd,ld,d<0.);
            
            vec3 p = ro+d*rd;
            vec3 n = normalize(grad(p));
            float diff = max(dot(n,ld)+.1*n.y, 0.);
            vec3 col = vec3(.1,.11,.18)*diff;
            
            vec3 rfd = reflect(rd,n); 
            vec3 rfcol = gsky(rfd,ld,true);
            
            col = mix(col,rfcol,.05+.95*pow(max(1.+dot(rd,n),0.),5.));
            col = mix(col,vec3(.8,.1,.92),smoothstep(.05,.0,i.y));
            col = mix(sky,col,fog);
            
            if(d<0.) d=1e6;
            d=min(d,10.);
            fragColor = vec4(clamp(col,0.,1.), 1.0);
        }

        void main() {
            mainImage(gl_FragColor, gl_FragCoord.xy);
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
        if (!gl) return console.error('WebGL 不支持');

        const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1,
        ]), gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // 初始化音频纹理
        audioTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, audioTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        requestAnimationFrame(renderLoop);
    }

    let lastTime = 0;
    function renderLoop(now) {
        requestAnimationFrame(renderLoop);
        if (!gl || !program) return;

        const delta = (now - lastTime) * 0.001;
        lastTime = now;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);

        // Uniforms
        gl.uniform2f(gl.getUniformLocation(program, 'iResolution'), canvas.width, canvas.height);
        gl.uniform1f(gl.getUniformLocation(program, 'iTime'), now * 0.001);
        gl.uniform1f(gl.getUniformLocation(program, 'iTimeDelta'), delta > 0 ? delta : 1/60);

        // 更新音频纹理
        if (analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray);
            
            gl.bindTexture(gl.TEXTURE_2D, audioTexture);
            // 将 256 个字节塞入 256x1 宽度的 LUMINANCE 纹理
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, dataArray);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
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
            gradient.addColorStop(0, '#0a0b1e');
            gradient.addColorStop(0.5, '#130415');
            gradient.addColorStop(1, '#050308');
            pCtx.fillStyle = gradient;
            pCtx.fillRect(0, 0, 1080, 1920);

            // 绘制网格线背板
            pCtx.strokeStyle = 'rgba(0, 242, 255, 0.1)';
            pCtx.lineWidth = 2;
            for(let i=0; i<1080; i+=60) { pCtx.moveTo(i, 0); pCtx.lineTo(i, 1920); }
            for(let i=0; i<1920; i+=60) { pCtx.moveTo(0, i); pCtx.lineTo(1080, i); }
            pCtx.stroke();

            const coverSize = 650;
            const coverX = (1080 - coverSize) / 2;
            const coverY = 300;
            
            pCtx.save();
            pCtx.shadowBlur = 50;
            pCtx.shadowColor = '#b53cff';
            pCtx.drawImage(imgCover, coverX, coverY, coverSize, coverSize);
            pCtx.restore();

            pCtx.font = "bold 60px 'Orbitron', sans-serif, 'PingFang SC'";
            pCtx.fillStyle = "#ffffff";
            pCtx.textAlign = "center";
            pCtx.textBaseline = "middle";
            pCtx.fillText(songTitle.innerText, 1080/2, 1050);

            pCtx.font = "30px 'Orbitron', sans-serif";
            pCtx.fillStyle = "#00f2ff";
            pCtx.fillText("Album: DreamyVoyage", 1080/2, 1120);

            const currentUrl = window.location.href;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=ffffff&bgcolor=000000&data=${encodeURIComponent(currentUrl)}`;

            const imgQR = new Image();
            imgQR.crossOrigin = "anonymous";
            imgQR.src = qrUrl;

            imgQR.onload = () => {
                const qrSize = 250;
                const qrX = (1080 - qrSize) / 2;
                const qrY = 1350;

                pCtx.save();
                pCtx.shadowBlur = 20;
                pCtx.shadowColor = '#ff007f';
                pCtx.drawImage(imgQR, qrX, qrY, qrSize, qrSize);
                pCtx.restore();

                pCtx.font = "24px 'Orbitron', sans-serif";
                pCtx.fillStyle = "rgba(255,255,255,0.4)";
                pCtx.fillText("长按扫码，进入幻梦腔体", 1080/2, 1650);

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

    loadSongs();
});

