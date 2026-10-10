# GDD §15.2 — Build Windows 64 bits
param([string]$UnityExe = "C:\Program Files\Unity\Editor\6000.3.25f1\Editor\Unity.exe")
$Project = Split-Path $PSScriptRoot -Parent
& $UnityExe -batchmode -quit -projectPath $Project -executeMethod Topple.Gen.BuildWindows.Build -logFile -
if ($LASTEXITCODE -ne 0) { throw "Build falhou ($LASTEXITCODE)" }
