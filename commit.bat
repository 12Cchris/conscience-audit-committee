@echo off
cd /d "%~dp0"
git add -A
git commit -m "update %date% %time:~0,5%"
git push
pause
