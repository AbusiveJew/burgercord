@echo off
title Burgercord Installer
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" installer\index.mjs --gui
) else if exist "%USERPROFILE%\.gemini\antigravity\brain\78c526eb-fb16-4cb3-b952-27617fa29fa4\scratch\node\node-v22.14.0-win-x64\node.exe" (
    "%USERPROFILE%\.gemini\antigravity\brain\78c526eb-fb16-4cb3-b952-27617fa29fa4\scratch\node\node-v22.14.0-win-x64\node.exe" installer\index.mjs --gui
) else (
    node installer\index.mjs --gui
)
