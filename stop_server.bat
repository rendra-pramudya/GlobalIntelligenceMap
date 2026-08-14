@echo off
echo Stopping IDX Signal, World Map server and client...

:: Kill node processes on port 3000 (IDX Signal)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing IDX Signal process %%p on port 3000
    taskkill /PID %%p /F >nul 2>&1
)

:: Kill node processes on port 3001 (World Map server)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Killing World Map server process %%p on port 3001
    taskkill /PID %%p /F >nul 2>&1
)

:: Kill node processes on port 5173 (vite dev client)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo Killing World Map client process %%p on port 5173
    taskkill /PID %%p /F >nul 2>&1
)

echo Done.
