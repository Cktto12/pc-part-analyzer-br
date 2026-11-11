@echo off
title GPU ^& Build Analyzer Pro - HardwareBarato Live
cd /d "%~dp0"
echo Iniciando servidor...
if "%~1"=="" (
    python server.py --host 0.0.0.0 --port 8080
) else (
    python server.py %*
)
pause
