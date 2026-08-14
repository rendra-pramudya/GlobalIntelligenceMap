@echo off
setlocal

echo Updating dependencies...

cd /d "%~dp0world-map\server"
call npm install

cd /d "%~dp0world-map\client"
call npm install

cd /d "%~dp0idx-signal"
call npm install

echo.
echo Starting World Map server, client, and IDX Signal...

:: Start IDX Signal server in a new window
start "IDX Signal - Server" cmd /k "cd /d "%~dp0idx-signal" && npm start"

:: Give the server a moment to bind
timeout /t 2 /nobreak >nul

:: Start the World Map server in a new window
start "World Map - Server" cmd /k "cd /d "%~dp0world-map\server" && npm run dev"

:: Give the server a moment to bind before starting the client
timeout /t 2 /nobreak >nul

:: Start the World Map client in a new window
start "World Map - Client" cmd /k "cd /d "%~dp0world-map\client" && npm run dev"

echo.
echo IDX Signal:  http://localhost:3000
echo World Map Server:  http://localhost:3001
echo World Map Client:  http://localhost:5173
echo.
echo Close the terminal windows (or run stop_server.bat) to stop.
endlocal
