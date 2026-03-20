@echo off
setlocal
title Study Server - DreamyVoyage

rem 优先使用 py 启动 5500 端口静态服务器
where py >nul 2>nul
if %errorlevel%==0 (
  start "Study Server" py -m http.server 5500
) else (
  start "Study Server" python -m http.server 5500
)

timeout /t 2 /nobreak >nul
start http://127.0.0.1:5500/study/learning-tracker.html

echo 已启动本地服务： http://127.0.0.1:5500
echo 若浏览器未自动打开，请手动访问上述地址。
pause


