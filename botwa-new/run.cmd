@echo off
REM Script untuk menjalankan WhatsApp Bot

echo.
echo ========================================
echo   Bot WhatsApp Kelas 11 DPIB 2
echo ========================================
echo.

REM Cek apakah Node.js terinstall
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js tidak terinstall!
    echo Download dari: https://nodejs.org/
    pause
    exit /b 1
)

REM Cek apakah dependencies sudah diinstall
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Menjalankan bot...
echo Scan QR code dengan WhatsApp Anda!
echo.
echo Press Ctrl+C untuk stop bot
echo.

node index.js

pause
