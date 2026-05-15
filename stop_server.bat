@echo off
echo Stopping World Map server and client...

:: Kill node processes on port 3001 (server)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Killing server process %%p on port 3001
    taskkill /PID %%p /F >nul 2>&1
)

:: Kill node processes on port 5173 (vite dev client)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo Killing client process %%p on port 5173
    taskkill /PID %%p /F >nul 2>&1
)

echo Done.
