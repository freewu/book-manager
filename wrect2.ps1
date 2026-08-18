Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W2 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$results = New-Object System.Collections.ArrayList
$cb = [W2+EnumProc]{ 
  param($h, $l)
  $pid2 = 0
  [W2]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  $len = [W2]::GetWindowTextLength($h)
  if ($len -gt 0) {
    $sb = New-Object System.Text.StringBuilder ($len+1)
    [W2]::GetWindowText($h, $sb, $len+1) | Out-Null
    $title = $sb.ToString()
    $r = New-Object W2+RECT
    [W2]::GetWindowRect($h, [ref]$r) | Out-Null
    $results.Add("PID=$pid2 TITLE=[$title] RECT=$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)") | Out-Null
  }
  return $true
}
[W2]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$results | Where-Object { $_ -like '*书架*' -or $_ -like '*book*' } | Out-File E:\work\github\book-manager\wout.txt
"CALLED"
