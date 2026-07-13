' ConstruGest - Arranque silencioso del backend local
' Este script arranca el backend Node.js en segundo plano sin mostrar ventanas.
' Se puede colocar en la carpeta de Inicio de Windows para arranque automatico.

Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Arrancar el backend en segundo plano
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c node src/app.js > backend.log 2>&1", 0, False
