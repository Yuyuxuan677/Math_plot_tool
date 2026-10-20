@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。请先安装 Node.js 20 或更高版本，然后重新运行。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 首次运行，正在安装依赖，请稍等……
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查网络或 npm 配置后重试。
    pause
    exit /b 1
  )
)

echo.
echo 正在启动「简图 · 数学画板」……
echo 电脑访问：http://127.0.0.1:5173/
echo 手机访问：使用终端里显示的 Network 地址（需同一 Wi-Fi）
echo.
timeout /t 2 >nul
start "" http://127.0.0.1:5173/
call npm run dev
echo.
echo 服务已停止。
pause
