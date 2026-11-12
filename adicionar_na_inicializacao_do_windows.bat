@echo off
chcp 65001 >nul
echo ========================================================
echo  Adicionando GPU Analyzer Pro na Inicializacao do Windows
echo ========================================================
echo.

set SCRIPT_DIR=%~dp0
set TARGET=%SCRIPT_DIR%iniciar_em_segundo_plano.vbs
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GPU_Analyzer_Background.lnk

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [SUCESSO] GPU Analyzer Pro configurado para iniciar em segundo plano com o Windows!
    echo O monitor continuara buscando promocoes mesmo com o navegador fechado.
) else (
    echo [AVISO] Nao foi possivel criar o atalho automaticamente.
)
echo.
pause
