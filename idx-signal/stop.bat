@echo off
title IDX Signal - Stopping Server
color 0C

echo.
echo ================================================
echo     IDX Signal - Stopping Server
echo ================================================
echo.

echo Stopping server process...
taskkill /F /IM node.exe /T >nul 2>&1

if errorlevel 1 (
    echo No server process found running
) else (
    echo Server stopped successfully!
)

echo.
echo ================================================
echo.

pause
