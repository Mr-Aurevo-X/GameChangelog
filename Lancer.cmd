@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM SoT daily: Python host loads ui/ + host/ from disk (see README).
where python >nul 2>&1
if not errorlevel 1 (
  if exist "%~dp0host\host.py" (
    python "%~dp0host\host.py" %*
    endlocal
    exit /b %ERRORLEVEL%
  )
)

if exist "%~dp0GameChangelog.exe" (
  start "" "%~dp0GameChangelog.exe"
  endlocal
  exit /b 0
)

echo [ERROR] Python introuvable et GameChangelog.exe absent.
echo Installez Python ou lancez Build.cmd pour generer l'exe.
pause
endlocal
exit /b 1
