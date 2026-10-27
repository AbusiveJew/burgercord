@echo off
title Burgercord Installer
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% equ 0 (
    node installer\index.mjs --gui
    goto :eof
)

if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" installer\index.mjs --gui
    goto :eof
)

echo [Burgercord] Node.js is required to run the installer.
echo Please install Node.js from https://nodejs.org or run 'winget install OpenJS.NodeJS'
pause
