@echo off
title Dreamy Voyage Music Player
echo ========================================================
echo   幻梦之旅 (Dreamy Voyage) - 炫酷音乐播放网页
echo ========================================================
echo.
echo 正在启动本地 HTTP 服务器 (端口 8000)...
start "Dreamy Voyage Server" python -m http.server 8000
timeout /t 2 /nobreak > nul
echo 正在浏览器中打开音乐播放器...
start http://localhost:8000
echo.
echo 服务已在后台运行，关闭此窗口不会停止服务。
echo 如需退出服务，请关闭弹出的 "Dreamy Voyage Server" 窗口。
pause
