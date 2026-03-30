@echo off
cd services\agents
python -m uvicorn src.main:app --host 0.0.0.0 --port 8083 --reload
