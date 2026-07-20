$ErrorActionPreference = "Stop"

$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$toolsDir = Join-Path $repo ".tools"
$nodeDir = Join-Path $toolsDir "node"
$cacheDir = Join-Path $toolsDir "cache"
$extractDir = Join-Path $toolsDir "_node_extract"

function Assert-InRepo([string]$path) {
  $full = [System.IO.Path]::GetFullPath($path)
  if (-not $full.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho fora do projeto: $full"
  }
}

Assert-InRepo $toolsDir
Assert-InRepo $nodeDir
Assert-InRepo $cacheDir
Assert-InRepo $extractDir

$nodeExe = Join-Path $nodeDir "node.exe"
$npmCmd = Join-Path $nodeDir "npm.cmd"

if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
  Write-Host "Node portatil ja instalado em: $nodeDir"
  & $nodeExe -v
  & $npmCmd -v
  exit 0
}

New-Item -ItemType Directory -Force -Path $toolsDir, $cacheDir | Out-Null

Write-Host "Consultando versao LTS do Node.js..."
$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
$release = $index | Where-Object {
  $_.lts -ne $false -and $_.files -contains "win-x64-zip"
} | Select-Object -First 1

if (-not $release) {
  throw "Nao foi possivel localizar uma versao LTS win-x64 do Node.js."
}

$zipName = "node-$($release.version)-win-x64.zip"
$zipUrl = "https://nodejs.org/dist/$($release.version)/$zipName"
$zipPath = Join-Path $cacheDir $zipName

Write-Host "Baixando $zipName..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

if (Test-Path -LiteralPath $extractDir) {
  Remove-Item -LiteralPath $extractDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

Write-Host "Extraindo Node.js..."
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

$innerDir = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
if (-not $innerDir) {
  throw "Arquivo ZIP do Node.js nao possui pasta esperada."
}

if (Test-Path -LiteralPath $nodeDir) {
  Remove-Item -LiteralPath $nodeDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
Move-Item -Path (Join-Path $innerDir.FullName "*") -Destination $nodeDir
Remove-Item -LiteralPath $extractDir -Recurse -Force

if (-not ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd))) {
  throw "Instalacao portatil incompleta. node.exe/npm.cmd nao encontrados."
}

Write-Host ""
Write-Host "Node portatil instalado com sucesso em: $nodeDir"
& $nodeExe -v
& $npmCmd -v
Write-Host ""
Write-Host "Agora rode: scripts\deploy.bat"
