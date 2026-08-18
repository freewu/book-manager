$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333 --remote-allow-origins=*"
$proc = Start-Process -FilePath "E:\work\github\book-manager\build\bin\book-manager.exe" -PassThru
Start-Sleep -Seconds 15
if ($proc.HasExited) { "EXITED code=$($proc.ExitCode)" } else { "RUNNING pid=$($proc.Id)" }
