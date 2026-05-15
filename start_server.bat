@echo off
setlocal

echo Installing dependencies...

cd /d "%~dp0world-map\server"
if not exist node_modules (
    echo   [server] npm install...
    npm install
)

cd /d "%~dp0world-map\client"
if not exist node_modules (
    echo   [client] npm install...
    npm install
)

echo.
echo Starting World Map server and client...

:: Start the server in a new window
start "World Map - Server" cmd /k "cd /d "%~dp0world-map\server" && npm run dev"

:: Give the server a moment to bind before starting the client
timeout /t 2 /nobreak >nul

:: Start the client in a new window
start "World Map - Client" cmd /k "cd /d "%~dp0world-map\client" && npm run dev"

echo.
echo Server:  http://localhost:3001
echo Client:  http://localhost:5173
echo.
echo Close the two terminal windows (or run stop_server.bat) to stop.
endlocal
