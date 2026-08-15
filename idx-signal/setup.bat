@echo off
title IDX Signal - Setup
color 0A

echo.
echo ================================================
echo     IDX Signal - Installation Setup
echo ================================================
echo.

cd /d "%~dp0"

echo Checking for Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version

echo.
echo Installing npm dependencies...
echo.

call npm install

if errorlevel 1 (
    echo.
    echo ERROR: Installation failed!
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo Installation completed successfully!
echo ================================================
echo.
echo You can now run: start.bat
echo.

pause
