# GDD §15.2 — Testes PlayMode
param([string]$UnityExe = "C:\Program Files\Unity\Editor\6000.3.25f1\Editor\Unity.exe")
$Project = Split-Path $PSScriptRoot -Parent
& $UnityExe -batchmode -projectPath $Project -runTests -testPlatform PlayMode -testResults "$Project\Artifacts\results-playmode.xml" -logFile -
if ($LASTEXITCODE -ne 0) { throw "Testes PlayMode falharam ($LASTEXITCODE)" }
