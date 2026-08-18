Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$proc = Get-Process | Where-Object { $_.ProcessName -like 'book-manager*' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$r = New-Object W+RECT
[W]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
"RECT $($r.Left),$($r.Top) $($r.Right),$($r.Bottom)"
