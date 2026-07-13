' ConstruGest - Desinstalar arranque automatico
' Elimina el acceso directo de la carpeta de Inicio de Windows

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strStartup = WshShell.SpecialFolders("Startup")
strShortcutPath = strStartup & "\ConstruGest-Backend.lnk"

If fso.FileExists(strShortcutPath) Then
    fso.DeleteFile strShortcutPath
    MsgBox "Arranque automatico desactivado.", vbInformation, "ConstruGest"
Else
    MsgBox "No habia arranque automatico configurado.", vbInformation, "ConstruGest"
End If
