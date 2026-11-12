' Script de Inicialização Silenciosa em Segundo Plano para GPU & Build Analyzer Pro
' Executa o servidor Python sem abrir nenhuma janela preta no Windows.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

' 0 = Janela Oculta (Hidden), False = Não bloqueia a execução
WshShell.Run "python server.py --lan --no-browser", 0, False
