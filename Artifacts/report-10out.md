# TOPPLE — report 10/out/2026 (simplificação + trilha fundação)

## F0 — git
- `git init` em `Topple/` + commit baseline `fe63c8b` (pré-simplificação).
- `.gitignore` vigente: fora `Library/Temp/Builds/Logs/results-*.xml`, dentro
  `Tools/Packages` + `report-*.md`. `UserSettings/` + `InitTestScene*.unity`
  fora do repo (ruído local).

## F1 — deletes P1 (código morto fora, ~150 linhas)
- Linha: `PlanningData.LinePoints/TryPlaceLine`, `PlanningController.PlaceLine/
  SetLineMode/LineOn/LineSpacing`, `PlanningInput.LineAction`, HUD
  (`btn-line`, `PressLine`, `OnLineToggle`, `SyncLineText`), uxml + fallback.
- Redo: `PlanningData._redo/CanRedo/Redo()` + `Redo` dos 3 Acts + interface,
  `PlanningController.Redo`. `Undo` por trecho continua (único desfazer).
- Move: `PlanningData.TryMove/MoveAct`, `ISession/Local/MirrorSession.MovePiece`.
- Ping/combos: `PlanningInput.PingWheel/PathAction/ShiftDown`,
  `PlanningController.TogglePath/CancelPath`, HUD (`btn-path`, `PressPath`,
  `OnPathToggle`), `SyncModes()` sem args. Mantidos (vivos): `CancelPathSilent`
  (Fire), `CancelSelection` (Esc), `MovePieceMsg` (esqueleto T6).
- Testes: apagado `Line_EvenSpacing`; `Hand_UndoRedo` vira `Hand_Undo` (só Undo);
  `Locked_CannotRemove` sem `TryMove`; `Tools_*` sem `LineOn`, sem `btn-line/
  btn-path` na lista.

## F2 — Mirror examples fora
- Deletado `Assets/Mirror/Examples/` (~1,4k arquivos, dezenas de cenas demo).
- Core Mirror intacto (`Core/Editor/Transports/Components/...`); reimport via
  `Tools/Packages/Mirror-96.9.22.unitypackage` continua documentado.

## Trilha fundação (lote 10/out, DELTA §§8/11/13-15)
- Chão=reta / peça=continua (âncora sem custo, fork livre), commit por trecho,
  arrasto desenha, fantasma no hover, mira 0,25 m, X remove última, som UI,
  coach 3 passos, Esc cancela seleção, Recarregar, vitória imediata,
  encostou-derruba, piso anti-travamento, BoxSolid exata na hitbox.

## Como validar (Unity FECHADA — lockfile impede batch com Editor aberto)
- `Tools/GenerateAll.ps1` (42 arquivos, zero diff), `Tools/TestEditMode.ps1`
  (tudo verde), `Tools/TestPlayMode.ps1` (13/13), Play manual Tutorial.unity.
