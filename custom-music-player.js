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
    document.body.appendChild(songTitleElement);

    // 从song-list.json文件加载歌曲列表
    fetch('song-list.json')
        .then(response => response.json())
        .then(data => {
            songList = data;
            if (songList.length > 0) {
                // 如果歌曲列表不为空，随机播放一首歌曲
                playRandomSong();
            }
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

    /**
     * 播放指定索引的歌曲
     * @param {number} index - 歌曲索引
     */
    function playSong(index) {
        if (index < 0 || index >= songList.length) return;
        const songName = songList[index];
        // 设置音频源并播放
        audio.src = `mp3s/${songName}`;
        audio.play();
        // 显示歌曲名称
        showSongTitle(songName);
    }

    /**
     * 显示歌曲名称，并在10秒后隐藏
     * @param {string} title - 歌曲名称
     */
    function showSongTitle(title) {
        // 去掉文件扩展名
        songTitleElement.textContent = title.replace('.mp3', '');
        // 添加show类使元素可见
        songTitleElement.classList.add('show');
        // 5秒后隐藏
        setTimeout(() => {
            songTitleElement.classList.remove('show');
        }, 10000);
    }

    /**
     * 播放列表中的下一首歌
     */
    function playNextSong() {
        // 循环播放列表
        currentSongIndex = (currentSongIndex + 1) % songList.length;
        playSong(currentSongIndex);
    }

    /**
     * 播放列表中的上一首歌
     */
    function playPrevSong() {
        // 循环播放列表（防止索引为负）
        currentSongIndex = (currentSongIndex - 1 + songList.length) % songList.length;
        playSong(currentSongIndex);
    }

    // 歌曲播放结束时自动播放下一首
    audio.addEventListener('ended', playNextSong);

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
