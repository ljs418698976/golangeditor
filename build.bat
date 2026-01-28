@echo off
echo ========================================
echo   GoFast Editor - Build Script
echo ========================================
echo.

echo [0/3] Stopping existing GoFast Editor and Cleaning...
taskkill /F /IM GoFastEditor* /T >nul 2>&1
del /F /Q GoFastEditor*.exe GoFastEditor*.exe~ >nul 2>&1

echo.
echo [1/3] Building Frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo Error: npm install failed
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo Error: Frontend build failed
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Building Go Backend...
"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" build -ldflags="-H windowsgui" -o GoFastEditor.exe .
if errorlevel 1 (
    echo Error: Go build failed
    echo Please make sure Go is installed correctly
    pause
    exit /b 1
)

echo.
echo [3/3] Build Complete!
echo ========================================
echo   Executable: GoFastEditor.exe
echo   Run: .\GoFastEditor.exe
echo ========================================
echo.
