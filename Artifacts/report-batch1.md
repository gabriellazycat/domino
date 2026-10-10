# TOPPLE — report-batch1 (melhorias: pecas, trilha, camera, fases, UI)

## Peças bem feitas (GDD §13.2)
- Caixa chanfrada com 2 submeshes: tampas ±Z com a textura da face, laterais com
  a cor solida da borda (3 materiais novos `*_edge` da ArtBible). Contact sheet
  revisada: creme com pips, heavy escura, rampa laranja — distinguiveis.
- Previews hermeticos (cena vazia): a Tutorial aberta contaminava o render.

## Trilha inteligente (pedido do jogador)
- `PlanningData.ArcPath`: arco de curvatura constante tangente a direcao inicial
  (como domino de verdade) + reta nos casos degenerados; rotacao EXATA pela
  tangente (fio §9 continua em passos, quantizado na transmissao T6).
- Modo trilha (P): clique-inicio, fantasma do caminho ao mover (verde/vermelho
  por custo), clique-destino commita em 1 desfazer; Esc/botao direito cancela.
  Commit so com mao suficiente ("Faltam N pecas" caso contrario).
- Snap fino 0,05 na trilha (0,25 quebra o alinhamento das curvas).

## Camera (pedido do jogador)
- Follow por tras (C, so no planejamento): atras do fantasma, olhando ao longo
  da direcao; roda = distancia, arrastar = offset de yaw. ToppleCam segue na sim.

## Fases 2-3 + progressao
- `Curva do Muro` (bloco + pelotao de 3) e `Peso Pesado` (arco + pelotao de 4),
  com botao Proxima fase no banner e nome da fase na HUD.
- Solucao roteirizada por fase prova solucao (sementes do solver T5).
- Obstaculos estaticos no SimWorld e na sim visivel; zona de construcao 24x16
  translucida (GDD §4.1); sol quente com sombras; camera enquadra a acao.
- Dica inicial de objetivo; cliques de knock (AudioManager); validade rot-aware.

## Fisica aprendida (guia p/ T5)
Curvas saudaveis: ate ~11 pecas, raio amplo, passo 0,35. Cauda longa sempre
decai; pelotoes densos matam por contato; spawn com despenetracao deterministica.

## Validacao (por execucao)
- [x] EditMode 25/25. PlayMode 10/10 (fases 2-3 vencidas 3/3 e 4/4).
- [x] GenerateAll idempotente (42 arquivos, zero diff), 0 refs quebradas.
- [x] Build Windows com Tutorial.unity: Success.
- [x] Screenshots planning/sim revisados (sol, sombras, pips, zona).
