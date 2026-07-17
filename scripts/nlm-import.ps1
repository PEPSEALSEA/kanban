<#
.SYNOPSIS
  Create a NotebookLM notebook from an extracted ZIP of content .txt files.

.EXAMPLE
  .\scripts\nlm-import.ps1 -Title "คณิตเข้มข้น ติวสอบกลางภาค" -Dir ".\nlm-คณิตเข้มข้น-2026-07-16-20files"

.EXAMPLE
  .\scripts\nlm-import.ps1 -Title "ชีวะ ติวสอบกลางภาค" -Dir "D:\Downloads\extracted" -ExtraTextFile ".\outline.txt"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Dir,

  [string]$ExtraTextFile,

  [string]$ExtraTitle = 'แนวข้อสอบ / บันทึกเพิ่มเติม'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Assert-Nlm {
  if (-not (Get-Command nlm -ErrorAction SilentlyContinue)) {
    throw "nlm CLI not found. Install: pip install notebooklm-mcp-cli && nlm login"
  }
}

function Get-HeaderTitle([string]$path) {
  $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  foreach ($line in ($raw -split "`r?`n")) {
    $t = $line.Trim()
    if ($t -match '^#+\s+(.+)$') {
      return ($Matches[1].Trim() -replace '^\*+\s*', '' -replace '\*+$', '')
    }
  }
  foreach ($line in ($raw -split "`r?`n")) {
    $t = $line.Trim()
    if (-not $t) { continue }
    if ($t -match '^(Subject:|Date:|ID:|View:)') { continue }
    if ($t -match '^นี่คือ') { continue }
    return ($t -replace '^#+\s+', '' -replace '^\*+\s*', '').Trim()
  }
  return [System.IO.Path]::GetFileNameWithoutExtension($path)
}

function Ensure-Auth {
  $check = nlm login --check 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Auth expired — opening login..."
    nlm login 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "nlm login failed" }
  } else {
    Write-Host $check
  }
}

Assert-Nlm

if (-not (Test-Path -LiteralPath $Dir -PathType Container)) {
  throw "Directory not found: $Dir"
}

$manifestPath = Join-Path $Dir 'manifest.json'
$titleByFile = @{}
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
  foreach ($item in @($manifest.items)) {
    if ($item.file -and $item.title) {
      $titleByFile[$item.file] = [string]$item.title
    }
  }
  if (-not $PSBoundParameters.ContainsKey('Title') -and $manifest.suggestedTitle) {
    $Title = [string]$manifest.suggestedTitle
  }
  Write-Host "Loaded manifest: $($titleByFile.Count) titled files"
}

$txtFiles = @(Get-ChildItem -LiteralPath $Dir -Filter '*.txt' -File |
  Where-Object { $_.Name -ne 'README-IMPORT.txt' } |
  Sort-Object Name)

if ($txtFiles.Count -eq 0) {
  throw "No .txt content files in $Dir"
}

Write-Host "Files to import: $($txtFiles.Count)"
Ensure-Auth

$create = nlm notebook create $Title --json 2>&1
Write-Host $create
$obj = $create | ConvertFrom-Json
$nb = $obj.notebook_id
if (-not $nb) { $nb = $obj.id }
if (-not $nb) { throw "Failed to create notebook: $create" }
Write-Host "NOTEBOOK_ID=$nb"
Write-Host "URL=https://notebooklm.google.com/notebook/$nb"

if ($ExtraTextFile) {
  if (-not (Test-Path -LiteralPath $ExtraTextFile -PathType Leaf)) {
    throw "ExtraTextFile not found: $ExtraTextFile"
  }
  Write-Host "Adding extra text: $ExtraTextFile"
  nlm source add $nb --file $ExtraTextFile --title $ExtraTitle --wait --wait-timeout 180 2>&1 | Out-Host
}

$ok = 0
$fail = 0
foreach ($file in $txtFiles) {
  $title = $titleByFile[$file.Name]
  if (-not $title) { $title = Get-HeaderTitle $file.FullName }
  $title = $title.Trim()
  Write-Host "Upload $($file.Name) -> $title"
  $out = nlm source add $nb --file $file.FullName --title $title --wait --wait-timeout 180 2>&1
  Write-Host $out
  if ("$out" -match 'ready|Added source') { $ok++ } else { $fail++ }
}

# Rename any sources that kept filename titles
$sources = nlm source list $nb --json 2>&1 | ConvertFrom-Json
foreach ($s in @($sources)) {
  $wanted = $null
  if ($s.title -match '^(LC-\d+)\.txt$') {
    $id = $Matches[1]
    $matchFile = $txtFiles | Where-Object { $_.BaseName -eq $id } | Select-Object -First 1
    if ($matchFile) {
      $wanted = $titleByFile[$matchFile.Name]
      if (-not $wanted) { $wanted = Get-HeaderTitle $matchFile.FullName }
    }
  }
  if ($wanted -and $s.title -ne $wanted) {
    Write-Host "Rename $($s.title) -> $wanted"
    nlm source rename $s.id $wanted -n $nb 2>&1 | Out-Host
  }
}

Write-Host ""
Write-Host "==== DONE ok=$ok fail=$fail ===="
Write-Host "Notebook: https://notebooklm.google.com/notebook/$nb"
