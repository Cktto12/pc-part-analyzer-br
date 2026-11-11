@echo off
chcp 65001 >nul
title Publicando no GitHub - pc-part-analyzer-br
cd /d "%~dp0"
echo ========================================================
echo   PUBLICANDO NO GITHUB (pc-part-analyzer-br)
echo ========================================================
echo.
echo Enviando projeto para: https://github.com/Cktto12/pc-part-analyzer-br.git ...
echo (Se pedir autorizacao, confirme o login na janela que abrir)
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCESSO] Todos os arquivos foram enviados com sucesso!
    echo ========================================================
) else (
    echo ========================================================
    echo   [ERRO] Ocorreu uma falha no envio.
    echo ========================================================
)
echo.
pause
