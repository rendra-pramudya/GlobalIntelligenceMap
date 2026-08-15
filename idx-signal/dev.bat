@echo off
title IDX Signal - Development Mode
color 0B

echo.
echo ================================================
echo     IDX Signal - Development Mode
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

echo.
echo ================================================
echo Development Environment Ready
echo ================================================
echo.
echo Configuration:
echo   - Backend: http://localhost:3000
echo   - Frontend: Open public/index.html or http://localhost:3000
echo   - Data Source: Yahoo Finance (default)
echo   - Theme: Dark/Light mode toggle
echo.
echo Available Features:
echo   - Real stock data from Yahoo Finance API
echo   - Fundamental analysis (P/E, P/B, ROE, etc)
echo   - Technical analysis (RSI, MACD, MA50, MA200)
echo   - Trading signals with recommendations
echo   - Interactive price charts
echo   - Responsive TradingView-style interface
echo.
echo To use Fintech.id data source:
echo   1. Set environment variable: FINTECH_API_KEY=your_api_key
echo   2. Set environment variable: DATA_SOURCE=fintech-id
echo   3. Restart the server
echo.
echo ================================================
echo.
echo Starting development server...
echo Press Ctrl+C to stop
echo.

npm start

pause
