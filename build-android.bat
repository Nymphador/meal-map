@echo off
rem Builds a test version of the Android app (MealPlanner-test.apk) to install on a phone directly.
rem The signed release for the Play Store is set up later. Needs Android Studio (its Java and SDK).
rem Only run one build at a time: two at once lock each other out.
setlocal
cd /d "%~dp0"

if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME if exist "F:\Applications\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=F:\Applications\Android Studio\jbr"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined JAVA_HOME (
  echo Android Studio's Java wasn't found. Install Android Studio from https://developer.android.com/studio
  goto :error
)
if not defined ANDROID_HOME (
  echo The Android SDK wasn't found. Open Android Studio once and let it finish its setup.
  goto :error
)

echo Building the app's pages...
if not exist node_modules call npm install --no-fund --no-audit || goto :error
call npm run build >nul || goto :error
call npx cap sync android || goto :error

echo Building the Android app...
pushd android
> local.properties echo sdk.dir=%ANDROID_HOME:\=/%
call .\gradlew.bat assembleDebug || (popd & goto :error)
popd
copy /y android\app\build\outputs\apk\debug\app-debug.apk MealPlanner-test.apk >nul || goto :error

echo.
echo  Done: MealPlanner-test.apk is in this folder.
echo.
pause
goto :eof

:error
echo.
echo Something went wrong (see above).
pause
exit /b 1
