# GDD §15.2 — Gerar assets: Unity -batchmode -quit -projectPath . -executeMethod Topple.Gen.AssetGenerator.GenerateAll
param([string]$UnityExe = "C:\Program Files\Unity\Editor\6000.3.25f1\Editor\Unity.exe")
$Project = Split-Path $PSScriptRoot -Parent
& $UnityExe -batchmode -quit -projectPath $Project -executeMethod Topple.Gen.AssetGenerator.GenerateAll -logFile -
if ($LASTEXITCODE -ne 0) { throw "GenerateAll falhou ($LASTEXITCODE)" }
