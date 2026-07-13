' ConstruGest - Instalar arranque automatico con Windows
' Crea un acceso directo en la carpeta de Inicio de Windows

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
strStartup = WshShell.SpecialFolders("Startup")
strShortcutPath = strStartup & "\ConstruGest-Backend.lnk"

' Crear acceso directo
Set shortcut = WshShell.CreateShortcut(strShortcutPath)
shortcut.TargetPath = strScriptPath & "\start-local.vbs"
shortcut.WorkingDirectory = strScriptPath
shortcut.Description = "ConstruGest Backend Local"
shortcut.Save

MsgBox "Backend local configurado para arrancar con Windows." & vbCrLf & vbCrLf & "Se ha creado un acceso directo en:" & vbCrLf & strShortcutPath, vbInformation, "ConstruGest"
