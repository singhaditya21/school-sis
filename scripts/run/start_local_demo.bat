@echo off
title ScholarMind Local Demo Start
echo ========================================================
echo Starting ScholarMind Native Local Demo Environment
echo ========================================================
echo.

echo [1/3] Starting Database Services (Docker)...
docker compose up -d postgres redis
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker services. Is Docker Desktop running?
    pause
    exit /b 1
)
echo Database services started successfully.
echo.

echo [2/3] Starting Next.js Web Application...
start "ScholarMind Web (Next.js)" cmd /k "cd apps\web && npm run dev"
echo Web App is booting up in a new terminal window...
echo.

echo [3/3] Starting Python AI Agents Backend...
start "ScholarMind Agents (FastAPI)" cmd /k "cd services\agents && pip install -r requirements.txt && python -m uvicorn src.main:app --host 0.0.0.0 --port 8083 --reload"
echo AI Agents are booting up in a new terminal window...
echo.

echo ========================================================
echo 🌟 Web Application will be at: http://localhost:3000
echo 🤖 AI Agent API will be at:   http://localhost:8083
echo ========================================================
echo Keep the new terminal windows open to monitor the logs.
echo If this is your first time, the servers might take a minute to install dependencies.
echo.
pause
