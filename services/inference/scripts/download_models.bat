@echo off
REM ScholarMind Model Download Script for Windows
REM Downloads Qwen 2.5 7B Instruct (GGUF) and Nomic Embed Text v1.5 (GGUF)

SET MODEL_DIR=%~dp0..\models

IF NOT EXIST "%MODEL_DIR%" mkdir "%MODEL_DIR%"

echo ========================================
echo ScholarMind Model Downloader
echo ========================================
echo.
echo Models will be downloaded to: %MODEL_DIR%
echo.
echo Required disk space: ~6 GB
echo.

REM Download Qwen 2.5 7B Instruct Q5_K_M (~5.5 GB)
echo [1/2] Downloading Qwen 2.5 7B Instruct (Q5_K_M)...
echo       Size: ~5.5 GB
echo       Source: HuggingFace (bartowski/Qwen2.5-7B-Instruct-GGUF)
echo.

IF EXIST "%MODEL_DIR%\qwen2.5-7b-instruct-q5_k_m.gguf" (
    echo   Already exists, skipping.
) ELSE (
    curl -L -o "%MODEL_DIR%\qwen2.5-7b-instruct-q5_k_m.gguf" ^
        "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q5_K_M.gguf"
    IF ERRORLEVEL 1 (
        echo ERROR: Failed to download Qwen model
        exit /b 1
    )
)

echo.

REM Download Nomic Embed Text v1.5 F16 (~270 MB)
echo [2/2] Downloading Nomic Embed Text v1.5 (F16)...
echo       Size: ~270 MB
echo       Source: HuggingFace (nomic-ai/nomic-embed-text-v1.5-GGUF)
echo.

IF EXIST "%MODEL_DIR%\nomic-embed-text-v1.5-f16.gguf" (
    echo   Already exists, skipping.
) ELSE (
    curl -L -o "%MODEL_DIR%\nomic-embed-text-v1.5-f16.gguf" ^
        "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.f16.gguf"
    IF ERRORLEVEL 1 (
        echo ERROR: Failed to download Nomic Embed model
        exit /b 1
    )
)

echo.
echo ========================================
echo Download complete!
echo ========================================
echo.
echo Models location: %MODEL_DIR%
echo.
echo Next steps:
echo   1. Start llama-server for LLM:
echo      llama-server --model models/qwen2.5-7b-instruct-q5_k_m.gguf --port 9001 --ctx-size 16384 --n-gpu-layers 35
echo.
echo   2. Start llama-server for embeddings:
echo      llama-server --model models/nomic-embed-text-v1.5-f16.gguf --port 9002 --embedding --ctx-size 8192
echo.
