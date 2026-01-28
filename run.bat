@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   GoFast Editor - Smart Start
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
taskkill /F /IM GoFastEditor* /T >nul 2>&1

echo.

REM 检查是否存在已编译的可执行文件
if exist "GoFastEditor.exe" (
    echo [INFO] Found compiled executable: GoFastEditor.exe
    echo [INFO] Starting from executable...
    echo.
    GoFastEditor.exe
) else (
    echo [INFO] Executable not found, using 'go run' mode...
    echo [INFO] Starting from source code...
    echo.
    "D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" run main.go
)
