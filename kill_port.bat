@echo off
setlocal enabledelayedexpansion

REM ========================================
REM   关闭占用指定端口的进程工具
REM ========================================

REM 默认端口为 8080
set PORT=8080

REM 如果提供了参数,使用参数作为端口号
if not "%1"=="" set PORT=%1

echo ========================================
echo   Port Killer Tool
echo ========================================
echo.
echo [INFO] Checking for processes using port !PORT!...
echo.

REM 查找占用端口的进程
set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :!PORT! ^| findstr LISTENING') do (
    set FOUND=1
    echo [INFO] Found process using port !PORT! (PID: %%a)
    
    REM 获取进程名称
    for /f "tokens=1" %%b in ('tasklist /FI "PID eq %%a" /NH /FO TABLE 2^>nul') do (
        echo [INFO] Process name: %%b
    )
    
    echo [INFO] Stopping process...
    taskkill /F /PID %%a >nul 2>&1
    
    if !errorlevel! equ 0 (
        echo [SUCCESS] Process stopped successfully
    ) else (
        echo [ERROR] Failed to stop process
    )
    echo.
)

if !FOUND! equ 0 (
    echo [INFO] No process found using port !PORT!
)

echo.
echo [INFO] Cleaning up any remaining GoFastEditor processes by name...
taskkill /F /IM GoFastEditor* /T >nul 2>&1
if !errorlevel! equ 0 (
    echo [SUCCESS] Related processes cleaned up
) else (
    echo [INFO] No additional processes found by name
)

echo.
echo ========================================
echo   Done
echo ========================================

