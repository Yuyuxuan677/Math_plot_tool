@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Please install Node.js first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Check your network and try again.
    pause
    exit /b 1
  )
)

echo Starting JianTu...
echo Desktop: http://127.0.0.1:5173/
echo Phone: use the Network URL printed below (same Wi-Fi required).
timeout /t 2 >nul
start "" http://127.0.0.1:5173/
call npm run dev
pause
