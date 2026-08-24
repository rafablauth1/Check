' Abre o CISPR 15 LABELO em modo desenvolvimento sem mostrar nenhuma janela
' de console (cmd) — só a janela do app aparece, como um programa instalado
' normal. Sempre le o codigo-fonte atual desta pasta (Git e "Executar no
' Claude Code" funcionam), diferente de builds empacotados (dist\win-unpacked).
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
lockFile  = scriptDir & "\.dev-lock"

Function PortaAberta()
  On Error Resume Next
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", "http://127.0.0.1:3000/", False
  http.Send
  PortaAberta = (Err.Number = 0)
  On Error Goto 0
End Function

If PortaAberta() Then
  ' servidor já de pé — abre o app na hora, sem aviso
  shell.Run "cmd /c npm run electron", 0, False
  WScript.Quit
End If

' Trava simples contra clique duplo: se já tem um lock recente (<60s), outra
' instância já está subindo o servidor — só espera, não inicia de novo.
precisaIniciar = True
If fso.FileExists(lockFile) Then
  idadeSeg = DateDiff("s", fso.GetFile(lockFile).DateLastModified, Now)
  If idadeSeg <= 60 Then precisaIniciar = False
End If

If precisaIniciar Then
  Set f = fso.CreateTextFile(lockFile, True) : f.Close
  shell.Popup "Abrindo o CISPR15 LABELO (modo dev)... aguarde alguns segundos.", 4, "CISPR15", 64
  shell.Run "cmd /c npm run dev", 0, False
End If

tentativas = 0
Do While (Not PortaAberta()) And tentativas < 60
  WScript.Sleep 1000
  tentativas = tentativas + 1
Loop

On Error Resume Next
fso.DeleteFile lockFile
On Error Goto 0

shell.Run "cmd /c npm run electron", 0, False
