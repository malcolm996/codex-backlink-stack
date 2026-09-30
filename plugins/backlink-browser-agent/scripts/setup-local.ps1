$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bridgeDir = Join-Path $root 'bridge'
$extensionDir = Join-Path $root 'extension'
$configPath = Join-Path $bridgeDir 'config.local.json'
$generatedPath = Join-Path $extensionDir 'generated_config.js'
$dataDir = Join-Path $bridgeDir 'data'

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (Test-Path -LiteralPath $configPath) {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} else {
  $config = Get-Content -LiteralPath (Join-Path $bridgeDir 'config.example.json') -Raw | ConvertFrom-Json
}

if (-not $config.token -or $config.token -eq 'replace-with-a-long-random-token') {
  $config.token = 'bba_local_' + ([guid]::NewGuid().ToString('N')) + ([guid]::NewGuid().ToString('N')).Substring(0, 16)
}

$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding utf8
@"
export const INSTALL_CONFIG = {
  bridgeUrl: 'http://127.0.0.1:17831',
  token: '$($config.token)'
};
"@ | Set-Content -LiteralPath $generatedPath -Encoding utf8

Write-Output "Created local bridge config: $configPath"
Write-Output "Created local extension config: $generatedPath"
Write-Output 'Add Feishu credentials only to bridge/config.local.json on this computer.'
