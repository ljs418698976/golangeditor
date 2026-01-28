@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   GoFast Editor - Development Mode
echo ========================================
echo.

REM 检查并关闭占用 8080 端口的进程
echo [INFO] Checking for processes using port 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    echo [INFO] Found process using port 8080 (PID: %%a)
    echo [INFO] Stopping process...
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo [SUCCESS] Process stopped successfully
    ) else (
        echo [WARNING] Failed to stop process, it may have already stopped
    )
)

echo.
echo Starting backend server...
echo Backend will run on: http://localhost:8080
echo.
echo Note: For frontend development, run in another terminal:
echo   cd frontend
echo   npm run dev
echo.
echo ========================================
echo.

"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" run main.go
