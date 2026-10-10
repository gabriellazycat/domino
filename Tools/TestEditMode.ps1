# GDD §15.2 — Testes EditMode
param([string]$UnityExe = "C:\Program Files\Unity\Editor\6000.3.25f1\Editor\Unity.exe")
$Project = Split-Path $PSScriptRoot -Parent
& $UnityExe -batchmode -projectPath $Project -runTests -testPlatform EditMode -testResults "$Project\Artifacts\results-editmode.xml" -logFile -
if ($LASTEXITCODE -ne 0) { throw "Testes EditMode falharam ($LASTEXITCODE)" }
