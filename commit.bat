@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo No changes to commit.
  pause
  exit /b 0
)

rem Commit message: argument 1, or typed, or automatic timestamp
set "MSG=%~1"
if "%MSG%"=="" set /p "MSG=Commit message (Enter = auto): "
if "%MSG%"=="" (
  for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH.mm"') do set "MSG=update %%t"
)

git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] Commit failed.
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo [ERROR] Push failed. Check your network or run "git pull --rebase" first.
  pause
  exit /b 1
)

echo Done.
pause
