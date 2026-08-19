@echo off
REM Thin wrapper: sync all DevTree UI kits then strip Atelier subtitle for GameChangelog
setlocal
set "SYNC=%~dp0..\..\scripts\Sync-All-UiKit.ps1"
if not exist "%SYNC%" (
  echo Missing %SYNC%
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SYNC%"
if errorlevel 1 exit /b 1
REM GameChangelog: titlebar shows product name only (no Atelier subtitle).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path '%~dp0' 'ui\vendor\pc-command-kit\components\tool-chrome.js'; if (Test-Path $p) { $t=Get-Content -Raw $p; $pat=\"titleEl.innerHTML\s*=\s*\r?\n?\s*name \+ ' <em>L\\'Atelier PC Command</em>';\"; $t=[regex]::Replace($t,$pat,'titleEl.textContent = toolLabel();'); Set-Content -Path $p -Value $t -NoNewline -Encoding UTF8; Write-Host 'Patched tool-chrome.js (no Atelier subtitle)' }"
endlocal
