@echo off
title IDX Signal - Server Running
color 0A

echo.
echo ================================================
echo     IDX Signal - Stock Analysis Platform
echo ================================================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    echo.
)

echo Starting server...
echo.

:: Start server in background
start "" npm start

:: Wait for server to start
echo Waiting for server to start...
timeout /t 3 /nobreak

:: Open browser
echo Opening browser...
start http://localhost:3000

echo.
echo ================================================
echo Server is running on http://localhost:3000
echo ================================================
echo.
echo Press Ctrl+C in the npm console to stop the server
echo.

pause
