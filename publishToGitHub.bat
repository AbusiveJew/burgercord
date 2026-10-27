@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   Publishing Burgercord to GitHub
echo   Target: https://github.com/handleSendMessage/burgercord
echo ========================================================
echo.

where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo [Burgercord] GitHub CLI (gh) is not found in PATH.
    echo Please install it from https://cli.github.com
    pause
    exit /b 1
)

call gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [Burgercord] GitHub authentication required.
    echo Opening browser to log into your GitHub account...
    call gh auth login -w -p https -h github.com
)

echo.
echo [Burgercord] Ensuring GitHub remote repository exists...
call gh repo create handleSendMessage/burgercord --public --source=. --remote=origin >nul 2>&1

echo.
echo [Burgercord] Pushing main branch to https://github.com/handleSendMessage/burgercord ...
call git push -u origin main

echo.
echo ========================================================
echo   Successfully published to GitHub!
echo   Repo: https://github.com/handleSendMessage/burgercord
echo ========================================================
pause
