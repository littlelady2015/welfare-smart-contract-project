@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset-demo-chain.ps1"
if errorlevel 1 (
  echo.
  echo Reset failed. Review the error above.
  pause
)
endlocal
