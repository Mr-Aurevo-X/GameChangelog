@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0GameChangelog.exe" (
  start "" "%~dp0GameChangelog.exe"
  endlocal
  exit /b 0
)
echo [ERROR] GameChangelog.exe introuvable.
pause
endlocal
exit /b 1
