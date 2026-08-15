@echo off
title IDX Signal - Server Running
color 0A

echo.
echo ================================================
echo     IDX Signal - Stock Analysis Platform
echo ================================================
echo.
echo Starting server...
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Start the server
echo Server starting on http://localhost:3000
echo Press Ctrl+C to stop the server
echo.
echo ================================================
echo.

npm start

pause
