@echo off
rem Builds the signed release of Meal Map for Google Play (MealMap-release-<version>.aab).
rem Needs: make-upload-key.bat run once, and the AdMob ids filled in in store-config.json.
rem Raise versionCode in store-config.json before every upload. Only run one build at a time.
setlocal
cd /d "%~dp0"

if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME if exist "F:\Applications\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=F:\Applications\Android Studio\jbr"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined JAVA_HOME (
  echo Android Studio's Java wasn't found.
  goto :error
)
if not defined ANDROID_HOME (
  echo The Android SDK wasn't found. Open Android Studio once and let it finish its setup.
  goto :error
)
if not exist android\keystore.properties (
  echo There's no upload key yet. Run make-upload-key.bat first.
  goto :error
)
if not exist node_modules call npm install --no-fund --no-audit || goto :error
node -e "const c=require('./store-config.json');const m=['admobAppId','bannerAdUnit','rewardedAdUnit'].filter(k=>!c[k]);if(m.length){console.log('Fill in '+m.join(', ')+' in store-config.json first (from apps.admob.com).');process.exit(1)}" || goto :error

echo Building the app's pages (real ads)...
call npm run build -- --mode release >nul || goto :error
call npx cap sync android || goto :error

echo Building the signed release...
pushd android
> local.properties echo sdk.dir=%ANDROID_HOME:\=/%
call .\gradlew.bat bundleRelease || (popd & goto :error)
popd
for /f "delims=" %%v in ('node -p "require('./store-config.json').versionName"') do set "VERSION=%%v"
copy /y android\app\build\outputs\bundle\release\app-release.aab "MealMap-release-%VERSION%.aab" >nul || goto :error

echo.
echo  Done: MealMap-release-%VERSION%.aab is in this folder. Upload it in the Play Console.
echo.
pause
goto :eof

:error
echo.
echo Something went wrong (see above).
pause
exit /b 1
