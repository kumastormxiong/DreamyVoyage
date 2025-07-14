@echo off
REM 启动本地HTTP服务器
start "Slow Roads Server" python -m http.server 8000

REM 等待服务器启动
timeout /t 2 /nobreak > nul

REM 在默认浏览器中打开游戏页面
start http://localhost:8000
