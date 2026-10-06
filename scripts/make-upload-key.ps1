# Creates the upload key that signs Meal Map for Google Play (meal-map-upload.jks in the project folder)
# and android/keystore.properties, which tells the release build where it is. Neither file is ever
# committed. Keep a copy of both (and the password) somewhere safe outside this PC: with Play App
# Signing a lost upload key can be replaced through Play support, but it takes days.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$keystore = Join-Path $root "meal-map-upload.jks"
$props = Join-Path $root "android\keystore.properties"

if (Test-Path $keystore) {
    Write-Host "meal-map-upload.jks already exists, so nothing was changed. (Delete it first only if you really mean to replace it.)"
    exit 1
}

$java = $env:JAVA_HOME
if (-not $java) {
    foreach ($candidate in @("F:\Applications\Android Studio\jbr", "$env:ProgramFiles\Android\Android Studio\jbr")) {
        if (Test-Path "$candidate\bin\keytool.exe") { $java = $candidate; break }
    }
}
if (-not $java) { Write-Host "Android Studio's Java wasn't found."; exit 1 }

function Read-Plain([string]$prompt) {
    $secure = Read-Host -AsSecureString $prompt
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "Choose a password for the upload key (at least 6 characters). It isn't shown as you type."
$password = Read-Plain "Password"
if ($password.Length -lt 6) { Write-Host "Too short."; exit 1 }
if ($password -ne (Read-Plain "Type it again")) { Write-Host "The two didn't match."; exit 1 }
if ($password.Contains('"') -or $password.Contains('\')) { Write-Host "Please avoid quote marks and backslashes."; exit 1 }

& "$java\bin\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore $keystore -alias upload `
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Meal Map" -storepass $password -keypass $password
if ($LASTEXITCODE -ne 0) { Write-Host "keytool failed."; exit 1 }

$path = $keystore -replace '\\', '/'
@(
    "# Made by make-upload-key.bat. Never commit or share this file.",
    "storeFile=$path",
    "storePassword=$password",
    "keyAlias=upload",
    "keyPassword=$password"
) | Set-Content -Encoding ascii $props

Write-Host ""
Write-Host "Done. Back up meal-map-upload.jks, android\keystore.properties and the password somewhere safe."
