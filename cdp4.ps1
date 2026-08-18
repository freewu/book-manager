$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "E:\work\github\book-manager\build\bin\book-manager.exe"
$psi.UseShellExecute = $false
$psi.EnvironmentVariables["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--remote-debugging-port=9333 --remote-allow-origins=*"
$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 6
"STARTED $($p.Id)"
