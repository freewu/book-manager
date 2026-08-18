$proc = Start-Process -FilePath "E:\work\github\book-manager\build\bin\book-manager.exe" -PassThru
Start-Sleep -Seconds 16
$p = "E:\work\github\book-manager\build\bin\data\probe.log"
Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Select ProcessName,Id | Format-Table -AutoSize | Out-File E:\work\github\book-manager\pp.out
if (Test-Path $p) {
  Get-Content $p | Out-File E:\work\github\book-manager\probeout.txt
} else {
  "NO-PROBE-FILE (`$p)" | Out-File E:\work\github\book-manager\probeout.txt
}
"EXTRA: " + (Get-ChildItem "E:\work\github\book-manager\build\bin\data" -ErrorAction SilentlyContinue | Select -ExpandProperty Name) | Out-File E:\work\github\book-manager\probeout.txt -Append
