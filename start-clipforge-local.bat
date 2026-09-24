@echo off
title ClipForge Local Video Worker
cd /d "%~dp0local-worker"

if not exist node_modules (
  echo Installiere lokale Abhaengigkeiten...
  call npm install
  if errorlevel 1 (
    echo npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo.
echo ClipForge Worker wird gestartet...
echo Voraussetzung: LTX Desktop muss geoeffnet sein.
echo.
npm start
pause
