@echo off
setlocal enabledelayedexpansion
title Waiting for Docker Desktop Engine...
echo ========================================================
echo 🐳 Waiting for Docker Desktop to initialize...
echo ========================================================
echo Please wait. Once Docker completes its startup sequence,
echo the ScholarMind servers will automatically launch.
echo.

:loop
docker info >nul 2>&1
if !errorlevel! equ 0 (
    echo Docker Engine is running!
    echo Starting the ScholarMind Demo...
    call start_local_demo.bat
    exit /b 0
) else (
    timeout /t 5 /nobreak >nul
    goto loop
)
