param(
  [string]$ExtensionPath = (Join-Path $PSScriptRoot '..\extension')
)
$ErrorActionPreference = 'Stop'
$ExtensionPath = (Resolve-Path $ExtensionPath).Path

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BbaWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$extensionsWindow = Get-Process chrome | Where-Object { $_.MainWindowTitle -like '扩展程序*' } | Select-Object -First 1
if (-not $extensionsWindow) { throw 'Dedicated extensions window not found' }
[BbaWin32]::ShowWindow($extensionsWindow.MainWindowHandle, 9) | Out-Null
[BbaWin32]::SetForegroundWindow($extensionsWindow.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
node (Join-Path $PSScriptRoot 'click-load-unpacked-cdp.js') | Out-Null
Start-Sleep -Milliseconds 800

$dialogs = [System.Collections.Generic.List[object]]::new()
$callback = [BbaWin32+EnumWindowsProc]{
  param([IntPtr]$handle, [IntPtr]$state)
  if (-not [BbaWin32]::IsWindowVisible($handle)) { return $true }
  $titleBuffer = [Text.StringBuilder]::new(512)
  $classBuffer = [Text.StringBuilder]::new(128)
  [BbaWin32]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity) | Out-Null
  [BbaWin32]::GetClassName($handle, $classBuffer, $classBuffer.Capacity) | Out-Null
  [uint32]$windowProcessId = 0
  [BbaWin32]::GetWindowThreadProcessId($handle, [ref]$windowProcessId) | Out-Null
  if ($classBuffer.ToString() -eq '#32770' -and $titleBuffer.Length -gt 0) {
    $dialogs.Add([pscustomobject]@{ Handle=$handle; Title=$titleBuffer.ToString(); ProcessId=$windowProcessId })
  }
  return $true
}
[BbaWin32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
$dialog = $dialogs | Where-Object {
  $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  $process -and $process.ProcessName -eq 'chrome'
} | Select-Object -First 1
if (-not $dialog) { throw 'Chrome directory chooser was not found' }

$oldClipboard = $null
try { $oldClipboard = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch {}
Set-Clipboard -Value $ExtensionPath
[BbaWin32]::ShowWindow($dialog.Handle, 9) | Out-Null
[BbaWin32]::SetForegroundWindow($dialog.Handle) | Out-Null
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('%d')
Start-Sleep -Milliseconds 150
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 150
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 700
$root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog.Handle)
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1')
$button = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
if (-not $button) { throw 'Select Folder button not found' }
$patternObject = $null
if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$patternObject)) {
  ([System.Windows.Automation.InvokePattern]$patternObject).Invoke()
} elseif ($button.Current.NativeWindowHandle -ne 0) {
  [BbaWin32]::SendMessage([IntPtr]$button.Current.NativeWindowHandle, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
} else {
  throw 'Select Folder button is not invokable'
}
Start-Sleep -Seconds 2
if ($null -ne $oldClipboard) { Set-Clipboard -Value $oldClipboard }
Write-Output ('Directory chooser completed for ' + $ExtensionPath)
