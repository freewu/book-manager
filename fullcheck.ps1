Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WC {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$proc = Start-Process -FilePath "E:\work\github\book-manager\release\book-manager.exe" -PassThru
Start-Sleep -Seconds 14
$found = $null
$cb = [WC+EnumProc]{ 
  param($h, $l)
  $pid2 = 0
  [WC]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  $len = [WC]::GetWindowTextLength($h)
  if ($len -gt 0) {
    $sb = New-Object System.Text.StringBuilder ($len+1)
    [WC]::GetWindowText($h, $sb, $len+1) | Out-Null
    if ($sb.ToString() -like '*书架*') {
      $script:bookWin = $h
      $script:bookTitle = $sb.ToString()
    }
  }
  return $true
}
[WC]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if (-not $script:bookWin) { "NO-WINDOW"; exit }
[WC]::SetForegroundWindow($script:bookWin) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object WC+RECT
[WC]::GetWindowRect($script:bookWin, [ref]$r) | Out-Null
"TITLE=$script:bookTitle RECT=$($r.Left),$($r.Top),$($r.Right),$($r.Bottom) RUNNING=$(-not $proc.HasExited)" | Out-File E:\work\github\book-manager\wres.txt
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save("E:\work\github\book-manager\win.png")
"SAVED $w x $h"
