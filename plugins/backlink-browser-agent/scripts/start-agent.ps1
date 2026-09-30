$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bridgeUrl = 'http://127.0.0.1:17831/health'
$profile = Join-Path $root 'chrome-profile'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

$bridgeReady = $false
try {
  $bridgeReady = (Invoke-RestMethod -Uri $bridgeUrl -TimeoutSec 2).ok
} catch {}
if (-not $bridgeReady) {
  Start-Process -FilePath (Get-Command node).Source -ArgumentList 'bridge/server.js' -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  for ($index = 0; $index -lt 20; $index++) {
    try {
      if ((Invoke-RestMethod -Uri $bridgeUrl -TimeoutSec 1).ok) { $bridgeReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
}
if (-not $bridgeReady) { throw 'Local bridge failed to start' }

$running = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like ('*' + $profile + '*') } | Select-Object -First 1
if (-not $running) {
  New-Item -ItemType Directory -Force -Path $profile | Out-Null
  Start-Process -FilePath $chrome -ArgumentList @(
    '--user-data-dir=' + $profile,
    '--remote-debugging-port=9223',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-minimized',
    'http://127.0.0.1:17831/demo/'
  ) -WindowStyle Minimized | Out-Null
}
Write-Output 'Backlink Browser Agent is running in quiet mode.'

