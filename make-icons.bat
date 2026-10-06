@echo off
rem Makes every app icon, the splash screens and the Play Store icon from assets\logo.png
rem (a square image, ideally 1024x1024). Run build-android.bat or build-release.bat afterwards.
cd /d "%~dp0"
if not exist node_modules call npm install --no-fund --no-audit || goto :error
if not exist assets\logo.png echo assets\logo.png wasn't found, so the placeholder logo is used.
node scripts\make-icons.mjs || goto :error
pause
goto :eof

:error
echo Something went wrong (see above).
pause
exit /b 1
