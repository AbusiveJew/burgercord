@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Users\User\.gemini\antigravity\brain\78c526eb-fb16-4cb3-b952-27617fa29fa4\scratch\node\node-v22.14.0-win-x64;C:\Users\User\.gemini\antigravity\brain\78c526eb-fb16-4cb3-b952-27617fa29fa4\scratch\mingit\cmd;C:\Users\User\.gemini\antigravity\brain\78c526eb-fb16-4cb3-b952-27617fa29fa4\scratch\gh\bin;%PATH%"

echo ========================================================
echo   Publishing Burgercord to GitHub
echo   Target: https://github.com/mrvonderplanitz/burgercord
echo ========================================================
echo.

call gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [Burgercord] GitHub authentication required.
    echo Opening browser to log into your GitHub account (mrvonderplanitz)...
    call gh auth login -w -p https -h github.com
)

echo.
echo [Burgercord] Ensuring GitHub remote repository exists...
call gh repo create mrvonderplanitz/burgercord --public --source=. --remote=origin >nul 2>&1

echo.
echo [Burgercord] Pushing main branch to https://github.com/mrvonderplanitz/burgercord ...
call git push -u origin main

echo.
echo ========================================================
echo   Successfully published to GitHub!
echo   Repo: https://github.com/mrvonderplanitz/burgercord
echo ========================================================
pause
