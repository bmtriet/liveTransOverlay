@echo off
setlocal

set "APP_EXE=%LOCALAPPDATA%\LiveTranslate Overlay\LiveTranslate Overlay.exe"
if exist "%APP_EXE%" (
  start "" "%APP_EXE%" %*
  exit /b 0
)

set "APP_EXE=%LOCALAPPDATA%\LiveTranslate Overlay\livetranslate-overlay.exe"
if exist "%APP_EXE%" (
  start "" "%APP_EXE%" %*
  exit /b 0
)

set "APP_EXE=%~dp0..\src-tauri\target\release\LiveTranslate Overlay.exe"
if exist "%APP_EXE%" (
  start "" "%APP_EXE%" %*
  exit /b 0
)

set "APP_EXE=%~dp0..\src-tauri\target\release\livetranslate-overlay.exe"
if exist "%APP_EXE%" (
  start "" "%APP_EXE%" %*
  exit /b 0
)

echo LiveTranslate Overlay was not found.
echo Install the per-user NSIS package, or build it with build-windows.cmd.
exit /b 1
