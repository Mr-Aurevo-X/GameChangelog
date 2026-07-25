@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
python -m PyInstaller --noconfirm --clean GameChangelog.spec
if exist "dist\GameChangelog.exe" (
  copy /Y "dist\GameChangelog.exe" "GameChangelog.exe" >nul
  echo OK: GameChangelog.exe
) else (
  echo Build failed.
  exit /b 1
)
