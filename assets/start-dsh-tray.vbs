' Launch DSH Web as a system-tray app, fully hidden (no console window).
' The path of dsh-web-tray.ps1 is substituted at install time by the
' dsh-tray-launcher host plugin.
Dim ws
Set ws = CreateObject("WScript.Shell")
ws.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Sta -File ""{{TRAY_SCRIPT}}""", 0, False
