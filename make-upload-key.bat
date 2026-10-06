@echo off
rem Creates the key that signs Meal Map for Google Play (run once, before the first build-release.bat).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-upload-key.ps1
pause
