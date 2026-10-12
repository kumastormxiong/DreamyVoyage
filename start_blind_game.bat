@echo off
title Dreamy Voyage - Blind Test Protocol
echo ========================================================
echo   DREAMY VOYAGE // BLIND TEST EXPERIMENT MINI-GAME
echo ========================================================
echo.
echo 正在启动本地服务器 (端口 8000，支持音频随意拖动快进)...
start "Dreamy Voyage Server" python server.py 8000
timeout /t 2 /nobreak > nul
echo 正在打开盲听小游戏...
start http://localhost:8000/blind-test-game/
echo.
echo 盲测小游戏已在浏览器中运行：http://localhost:8000/blind-test-game/
pause
