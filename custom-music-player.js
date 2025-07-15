/**
 * 自定义音乐播放器
 * 功能：为slowroads.io游戏添加自定义音乐播放功能
 * 支持：播放本地音乐文件、显示歌曲名称、键盘控制
 */

document.addEventListener('DOMContentLoaded', () => {
    // 创建音频对象
    const audio = new Audio();
    // 存储歌曲列表
    let songList = [];
    // 当前播放歌曲的索引
    let currentSongIndex = -1;

    // 创建显示歌曲名称的DOM元素
    const songTitleElement = document.createElement('div');
    songTitleElement.id = 'song-title';
    songTitleElement.style.userSelect = 'none'; // 禁止选中
    document.body.appendChild(songTitleElement);

    // 创建提示元素，使用与歌曲名称相同的样式类
    const tipElement = document.createElement('div');
    tipElement.id = 'song-tip';
    tipElement.className = 'song-title-tip'; // 新增样式类，和#song-title一致
    document.body.appendChild(tipElement);

    // 分步显示提示
    function showTip() {
        setTimeout(() => {
            tipElement.textContent = '幻\u00A0\u00A0梦\u00A0\u00A0\u00A0\u00A0之\u00A0\u00A0旅';
            tipElement.classList.add('show');
        }, 4000);
    
        // 5秒后淡出
        setTimeout(() => {
            tipElement.classList.remove('show');
            // 等待过渡结束再切换内容并淡入
            setTimeout(() => {
                tipElement.textContent = 'O\u00A0\u00A0&\u00A0\u00A0L\u00A0\u00A0\u00A0\u00A0♪\u00A0\u00A0↑\u00A0\u00A0↓';
                tipElement.classList.add('show');
            }, 2000); // 1s为CSS过渡时间
        }, 16000);
        // 11秒后最终淡出
        setTimeout(() => {
            tipElement.classList.remove('show');
        }, 25000);
    }

    // 从song-list.json文件加载歌曲列表
    fetch('song-list.json')
        .then(response => response.json())
        .then(data => {
            songList = data;
            // 不自动播放，等待点击splash-loader
        });

    /**
     * 随机播放歌曲
     */
    function playRandomSong() {
        if (songList.length === 0) return;
        // 随机选择一首歌曲
        currentSongIndex = Math.floor(Math.random() * songList.length);
        playSong(currentSongIndex);
    }

    // 音量淡入淡出函数
    function fadeVolume(target, duration, fadeIn = true) {
        const start = audio.volume;
        const end = fadeIn ? target : 0;
        const step = (end - start) / (duration / 50);
        let current = start;
        let count = 0;
        const interval = setInterval(() => {
            current += step;
            count += 1;
            if ((fadeIn && current >= end) || (!fadeIn && current <= end) || count > duration / 50) {
                audio.volume = end;
                clearInterval(interval);
            } else {
                audio.volume = Math.max(0, Math.min(1, current));
            }
        }, 50);
    }

    // 修改playSong，播放前淡入，播放结束前淡出
    function playSong(index) {
        if (index < 0 || index >= songList.length) return;
        const songName = songList[index];
        audio.src = `mp3s/${songName}`;
        audio.volume = 0;
        audio.play();
        // 头2秒淡入
        fadeVolume(1, 1000, true);
        showSongTitle(songName);
        // 监听淡出
        audio.onended = null;
        audio.ontimeupdate = function () {
            if (audio.duration && audio.currentTime > audio.duration - 2) {
                fadeVolume(1, 0, false); // 只触发一次
                audio.ontimeupdate = null;
            }
        };
    }

    /**
     * 显示歌曲名称，并在10秒后隐藏
     * @param {string} title - 歌曲名称
     */
    function showSongTitle(title) {
        // 去掉前缀数字和'-'，以及文件扩展名
        let name = ' - ' + title.replace(/^\d+-/, '').replace(/\.mp3$/, '') + ' - ';
        songTitleElement.textContent = name;
        // 添加show类使元素可见
        songTitleElement.classList.add('show');
        // 8秒后隐藏
        setTimeout(() => {
            songTitleElement.classList.remove('show');
        }, 8000);
    }

    // 切歌时也要淡出再切换
    function playNextSong() {
        fadeVolume(0, 1000, false);
        setTimeout(() => {
            currentSongIndex = (currentSongIndex + 1) % songList.length;
            playSong(currentSongIndex);
        }, 2000);
    }
    function playPrevSong() {
        fadeVolume(0, 1000, false);
        setTimeout(() => {
            currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
            playSong(currentSongIndex);
        }, 2000);
    }
    // 歌曲播放结束时自动播放下一首
    audio.addEventListener('ended', playNextSong);

    // 只有点击splash-loader后才开始显示提示和播放音乐
    const splashLoader = document.getElementById('splash-loader');
    if (splashLoader) {
        splashLoader.addEventListener('click', () => {
            showTip();
            setTimeout(() => {
                if (songList.length > 0) {
                    playRandomSong();
                }
            }, 12000);
        }, { once: true });
    }

    // 键盘快捷键
    document.addEventListener('keydown', (event) => {
        if (event.key === 'o') {
            // o键：播放上一首
            playPrevSong();
        }
        if (event.key === 'l') {
            // l键：播放下一首
            playNextSong();
        }
        if (event.key === 'm') {
            // m键：切换静音
            audio.muted = !audio.muted;
        }
    });
});
