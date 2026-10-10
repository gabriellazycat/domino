# TOPPLE — report-T3 (Solo mínimo)

## Entrega (GDD §15.4 T3)
- Planejamento (`Assets/Topple/Game/PlanningController.cs` + `PlanningData.cs`):
  grade 0,05 (snap normal 0,25, Alt fino), rotação 15°, fantasma verde/vermelho,
  traçar linha (L/Shift, espaçamento 0,40, desfazer em lote), desfazer/refazer,
  remover (botão direito), atalhos 1-9/Q/E/Ctrl+Z/Ctrl+Y/Enter (Input System, §14.6).
- Câmera livre: orbitar (botão do meio), WASD/setas, zoom (FOV 30°, §13.4).
- Simulação visível (`SimulationController.cs`): instancia prefabs, mesmas regras T1
  (knock §6, shove, fim por repouso/45 s), Peça Zero com impulso fixo (§4.1).
- ToppleCam básica: segue o knock mais recente, enquadra o gatilho antes.
- HUD mínimo (UI Toolkit, nomes estáveis): bandeja, DISPARAR, desfazer/refazer,
  linha, objetivo, aviso "sem alcance >2 m" (§14.4) e banner vitória/quebrada.
- Tutorial (`TutorialSetup` + `Tutorial.unity`): trigger travado, 3 soldados,
  mão de 10 comuns; layout mantido entre tentativas.
- `PlanningBot`: fileira a 0,40 m usando SÓ Select/SetRot/Place/Fire.

## Critério de aceite (verificado por execução)
- [x] Bot completa o tutorial: `steps=479 knocked=3/3` (só comandos de jogador).
- [x] Input simulado (mouse+teclado virtuais pela UI real): `win=True 3/3 em 8,3s`.
- [x] Caminho real do jogador (LoadScene da `Tutorial.unity` salva): mão 10,
      trigger presente, bot vence 3/3 — regressão do bug "bandeja zerada".
- [x] EditMode 19/19. PlayMode 7/7 (T1 intacto, golden `61a6e5d76f18`).
- [x] Build Windows com `Tutorial.unity`: `Result: Success`.

## Revisão jogador-humano (além dos bots)
- Estado de MonoBehaviour não serializa: mão/trigger/assinaturas reconstruídos no
  `Start` (`InitScenario` com guarda + limpeza de restos salvos).
- Células proibidas sobre inimigos, dica inicial de objetivo, cliques de knock.
