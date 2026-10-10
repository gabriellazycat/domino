# TOPPLE — report-T0 (Bootstrap)

## Entrega
- Projeto Unity **6000.3.25f1** URP em `GitHub/Topple` (sobrescrito; era 2018.3.7f1 vazio).
- `Packages/manifest.json` fixado: URP **17.3.0**, Input System, Localization **1.5.2**,
  Test Framework, TextMeshPro **4.0.0**, FizzySteamworks **6.0.1** + Steamworks.NET (Git/UPM).
- Mirror **v96.9.22** via `Tools/Packages/Mirror-96.9.22.unitypackage` (14.247.299 bytes) —
  Mirror não publica `package.json` na raiz; `.unitypackage` é o caminho oficial.
- Estrutura `Assets/Topple/{Core,Content,Sim,Game,UI,Net,Gen,Tests}` + `Assets/Generated`
  + `Artifacts/` + `Tools/*.ps1` + `docs/open-questions.md`. asmdefs por módulo.
- `ISession` + `LocalSession` funcionais; `MirrorSession` esqueleto (rede na T6).
  Mensagens `§9.6` como structs `NetworkMessage` (sem Command/Rpc).
- Cena `Assets/Topple/Game/Bootstrap.unity` (Main Camera FOV 30° + Directional #FFE9C4 1.1).

## Critério de aceite (GDD §15.4 T0)
- [x] Compila sem erros (batchmode quit, sem `error CS`).
- [x] Teste EditMode de exemplo passa: **5/5 Passed, 0 Failed**
  (`Artifacts/results-editmode.xml`, `testcasecount=5 result=Passed`).
- [x] Build Windows gera executável: `Builds/Windows/Topple.exe` (667.136 bytes),
  `Build Finished, Result: Success`.

## Comandos (GDD §15.2, em `Tools/`)
- `GenerateAll.ps1` → `Topple.Gen.AssetGenerator.GenerateAll` (esqueleto; fiéis na T2)
- `TestEditMode.ps1` / `TestPlayMode.ps1` → `-runTests -testPlatform EditMode/PlayMode`
- `BuildWindows.ps1` → `Topple.Gen.BuildWindows.Build`
