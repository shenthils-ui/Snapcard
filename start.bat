@echo off
setlocal
cd /d "%~dp0"
set PORT=8787

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Please download and install the LTS version from:
  echo.
  echo       https://nodejs.org/
  echo.
  echo   Then double-click start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies. This happens only once...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist dist\index.html (
  echo First run: building the app. This happens only once...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

echo Starting Snapcard on http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"
node server\index.js
pause
