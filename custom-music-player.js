/**
 * 自定义音乐播放器
 * 功能：为slowroads.io游戏添加自定义音乐播放功能
 * 支持：播放本地音乐文件、显示歌曲名称、键盘控制、播放历史记录
 */

document.addEventListener('DOMContentLoaded', () => {
    // 创建音频对象
    const audio = new Audio();
    // 存储歌曲列表
    let songList = [];
    // 当前播放歌曲的索引
    let currentSongIndex = -1;
    // 播放历史记录（最多保存10首）
    let playHistory = [];
    // 历史记录显示状态
    let historyVisible = false;
    // 当前选中的历史记录索引
    let selectedHistoryIndex = -1;

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

    // 创建历史记录显示元素
    const historyElement = document.createElement('div');
    historyElement.id = 'play-history';
    historyElement.className = 'play-history';
    document.body.appendChild(historyElement);

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
                tipElement.textContent = 'O\u00A0\u00A0&\u00A0\u00A0L\u00A0\u00A0\u00A0\u00A0♪\u00A0\u00A0↑\u00A0\u00A0↓\u00A0\u00A0·';
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
     * 添加歌曲到播放历史
     * @param {string} songName - 歌曲名称
     */
    function addToHistory(songName) {
        // 如果已经存在，先移除
        const existingIndex = playHistory.indexOf(songName);
        if (existingIndex !== -1) {
            playHistory.splice(existingIndex, 1);
        }
        // 添加到开头
        playHistory.unshift(songName);
        // 保持最多10首
        if (playHistory.length > 10) {
            playHistory = playHistory.slice(0, 10);
        }
    }

    /**
     * 显示播放历史记录
     */
    function showPlayHistory() {
        if (playHistory.length === 0) {
            historyElement.innerHTML = '<div class="history-item">暂无播放历史</div>';
        } else {
            let html = '<div class="history-title">播放历史 (按 ↑↓ 选择，回车播放，或直接点击)</div>';
            playHistory.forEach((song, index) => {
                const songName = song.replace(/^\d+-/, '').replace(/\.mp3$/, '');
                const selectedClass = index === selectedHistoryIndex ? 'selected' : '';
                html += `<div class="history-item ${selectedClass}" data-index="${index}" onclick="window.playHistorySongByIndex(${index})">${index + 1}. ${songName}</div>`;
            });
            historyElement.innerHTML = html;
        }
        historyElement.classList.add('show');
        historyVisible = true;
        selectedHistoryIndex = 0; // 默认选中第一首
    }

    /**
     * 隐藏播放历史记录
     */
    function hidePlayHistory() {
        historyElement.classList.remove('show');
        historyVisible = false;
        selectedHistoryIndex = -1;
    }

    /**
     * 选择历史记录中的歌曲
     * @param {number} direction - 1为向下，-1为向上
     */
    function selectHistoryItem(direction) {
        if (!historyVisible || playHistory.length === 0) return;
        
        selectedHistoryIndex += direction;
        if (selectedHistoryIndex < 0) {
            selectedHistoryIndex = playHistory.length - 1;
        } else if (selectedHistoryIndex >= playHistory.length) {
            selectedHistoryIndex = 0;
        }
        
        // 更新显示
        showPlayHistory();
    }

    /**
     * 播放选中的历史记录歌曲
     */
    function playSelectedHistorySong() {
        if (!historyVisible || selectedHistoryIndex < 0 || selectedHistoryIndex >= playHistory.length) return;
        
        const selectedSong = playHistory[selectedHistoryIndex];
        // 找到歌曲在songList中的索引
        const songIndex = songList.indexOf(selectedSong);
        if (songIndex !== -1) {
            currentSongIndex = songIndex;
            playSong(currentSongIndex);
        }
        hidePlayHistory();
    }

    /**
     * 通过索引播放历史记录中的歌曲（供onclick调用）
     */
    function playHistorySongByIndex(index) {
        if (index < 0 || index >= playHistory.length) return;
        
        const selectedSong = playHistory[index];
        // 找到歌曲在songList中的索引
        const songIndex = songList.indexOf(selectedSong);
        if (songIndex !== -1) {
            currentSongIndex = songIndex;
            playSong(currentSongIndex);
        }
        hidePlayHistory();
    }

    // 将函数暴露到全局作用域，供onclick调用
    window.playHistorySongByIndex = playHistorySongByIndex;

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
        // 添加到播放历史
        addToHistory(songName);
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
        // 12秒后隐藏
        setTimeout(() => {
            songTitleElement.classList.remove('show');
        }, 12000);
    }

    // 切歌时也要淡出再切换
    function playNextSong() {
        fadeVolume(0, 1000, false);
        setTimeout(() => {
            currentSongIndex = Math.floor(Math.random() * songList.length);
            playSong(currentSongIndex);
        }, 2000);
    }
    function playPrevSong() {
        fadeVolume(0, 1000, false);
        setTimeout(() => {
            currentSongIndex = Math.floor(Math.random() * songList.length);
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
        // 如果历史记录显示中，优先处理历史记录相关按键
        if (historyVisible) {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                selectHistoryItem(-1);
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                selectHistoryItem(1);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                playSelectedHistorySong();
                return;
            }
            if (event.key === 'Escape' || event.key === '·') {
                event.preventDefault();
                hidePlayHistory();
                return;
            }
        }

        // 常规音乐控制按键
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
        if (event.key === '·') {
            // ·键：显示播放历史
            if (!historyVisible) {
                showPlayHistory();
            }
        }
    });
});
