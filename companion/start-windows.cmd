@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist node_modules\@openai\codex\bin\codex.js (
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server.mjs
pause
