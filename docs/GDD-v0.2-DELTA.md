# TOPPLE — Delta vivo sobre o GDD v0.2

> O arquivo `TOPPLE — Game Design Document.docx` (v0.2, 09/out/2026) está
> CONGELADO como baseline. Este documento é o registro vivo de tudo que mudou,
> foi calibrado, preenchido ou criado a mais durante a implementação.
> Convenção: cada item cita a seção do GDD, o antes/depois e o motivo.
> Números finais viram dados em `Content/` na T5.

## Status do MVP (T0-T3 + batch1)
- T0 bootstrap, T1 núcleo/simulação, T2 geradores, T3 solo mínimo: PRONTOS e
  verificados (ver `Artifacts/report-T*.md`).
- Batch1 (melhorias pedidas pelo dono): peças 2-materiais, trilha em arco (P),
  câmera follow (C), fases 2-3, UI polida: PRONTO.
- Cobertura human-sim em andamento (ver seção 5).

## 1. Calibragens autorizadas (§13.2 "a calibrar na T1", §17 "pontos de partida")
| Item (GDD) | Passou a ser | Motivo / prova |
|---|---|---|
| Atrito madeira 0,5 (§13.2) | 0,75 | Com 0,5 as bases patinam e a onda decai (tilt 71°→24° em 12 peças) |
| `sleepThreshold` 0,05 (§13.2) | 0,01 | 0,05 foi pensado p/ peças pequenas; peças de 0,8 m tombam a ~0,03 m/s e congelavam no meio da queda |
| Limiar de impacto do Soldado (§6, sem número) | 0,25 N·s | Repouso ≈0,08; queda de dominó ≈1,0. "Cai com qualquer impacto" |
| Limiar de repouso/fim de sim (§4.2, sem número) | 0,08 m/s por 2 s | Medido; 500 corpos dormem rápido (carga 45 s em 1,19 s) |
| Raio da zona proibida (§4.1/§9, sem número) | Rot-aware (extensão da peça + base Ø0,50 + 2 cm) | Círculo fixo ou impedia kill frontal ou deixava pop de spawn |
| Passo da trilha em curva | 0,35 m, snap fino 0,05 | Curvas 0,25 desalinhavam; 0,45 deixava vão além do alcance |
| Tamanho da gravação (§9/§17: ~1-2 MB) | ~8,6 KB medidos | Só corpos acordados + GZip (500 corpos, 45 s) |

## 2. Regras esclarecidas (GDD definia, faltava o como)
- Morte por impacto (§6): corpo arremessado p/ longe do golpe, força proporcional
  ao impulso (janela 0,35 s reafirmada, determinística). Encadeia soldado→soldado
  e entrega o "esmagar o exército" do pitch. Animação final na T3/T7.
- Gatilho (§4.1, "impulso inicial sempre o mesmo"): giro no lugar
  (eixo = up × direção, 4,5 rad/s), sem empurrar a base (empurrar desliza).
- Rotação interna em graus exatos; o fio §9 continua em passos 0-23 (quantizado
  só na transmissão T6). Passos de 15° matavam curvas (degraus laterais).
- Spawn com despenetração determinística (jitter de ±2 mm criava pop).
- `KeepLeanersAwake` opt-in (default off p/ preservar o golden T1).

## 3. Conteúdo novo pedido pelo dono (fora do GDD)
- Trilha inteligente (P): arco de curvatura constante + reta, fantasma do caminho,
  commit em 1 desfazer. Guia p/ solver T5: curvas saudáveis têm ≤11 peças e raio
  amplo; pelotões densos matam por contato; cadeias balísticas, não.
- Câmera follow por trás (C) no planejamento; ToppleCam básica na sim.
- Fases artesanais 2-3 (`Curva do Muro`, `Peso Pesado`) + progressão + obstáculos
  estáticos + zona de construção destacada + sol com sombras + dica de objetivo
  + cliques de knock. Solver e ~20 arquétipos continuam T5.
- Enter confirma o banner (vitória→próxima, derrota→de novo); guardas anti-duplo.
- Ctrl+Z/Y por composite `ButtonWithOneModifier` (gate manual disparava no Ctrl só).

## 4. Overrides autorizados pelo dono
- Packs/ferramentas externas discretas permitidos (GDD §13/§15 pediam só código):
  regra free/CC0, vendored com hash, mesmo `visualId`, sem cara de IA; declarar
  na Steam (§11). Até aqui: nada externo usado (tudo segue gerado por código).
- Mirror via `.unitypackage` vendored (não via Git/UPM: sem `package.json` na raiz).
- Pasta `Topple` recriada em Unity 6000.3.25f1 URP (era 2018 vazia).

## 5. Cobertura human-sim (resposta a "só bots?")
Bots provam mecânica; p/ gente de verdade: mouse/teclado virtuais (linha, trilha,
desfazer, girar, remover, follow), botões via métodos Press* (Humble Object),
zeramento das 3 fases só pela UI, layout da HUD, retry humano (visível varia).
NÃO coberto (sem viewport headless): hit-test de mouse em botão, audibilidade
real, feel/diversão, FPS em GPU real — playtest humano pendente.
Achados reais vindos dessa cobertura: jogo mudo (sem AudioListener), Enter do
banner re-disparava o Fire, Ctrl sozinho desfazia, cena salva sem mão/trigger.

## 6. Lacunas do GDD ainda abertas (T4/T5)
Loja/preços, 8 relíquias novas, par/combo-meta, contratos de porta, modo
Relaxado, Preview (F), telas completas T4, multiplayer T6, polimento T7.
Seções §9.3/§9.4 não existem no docx (Duelo/assíncrono = P2, fora do v1.0).

## 7. Fix paridade humano-bot (10/out/2026, pedido do dono)
- Atrito ao vivo = headless (0,75): `PrefabGen` agora aplica `SimBuilder.Wood`
  em peças/soldado/mesa; `TutorialSetup.Build` aplica no chão e chama
  `EnsurePhysicsDefaults`; `SimulationController.StartSim` garante defaults.
  Antes os prefabs usavam o default 0,4, patinavam e a onda decaía — bot
  (headless) vencia e humano (ao vivo) perdia a mesma fileira de 10 peças.
- Áudio único: `Build` desliga câmeras E ouvintes antigos; `InitScenario`
  mantém exatamente 1 `AudioListener` ativo (na Main Camera). Cena salva
  `Tutorial.unity` passa a guardar `Camera` + `AudioListener` (antes só
  `CameraController`/`PlanningInput`, sem `Camera`).
- Mão fase 1 = 12 comuns: trilha (0,0)→(4,0) custa ~11 peças e commita.

## 8. Trilha padrão + tabuleiro vazio (10/out/2026, pedido do dono)
- Trilha sempre ligada: `ArmPathDefault()` no `LoadPhase` e no retry; `CommitPath`
  rearma em vez de desarmar; `Esc`/`P` viram no-op; `btn-path` fixo "Trilha: on".
  Peça única = 2 cliques na mesma célula. Botão direito remove (não cancela).
- Linha desativada sem apagar código: `LineOn` sempre `false`, `wantLine` falso,
  `L`/`Shift` ignorados; `PlaceLine`/`TryPlaceLine`/`LinePoints` mantidos;
  `btn-line` escondido (`display:none`).
- Sem Peça Zero: fase começa com `Count==0`, nada travado; a 1ª peça do jogador
  (menor `InstanceId`) recebe o impulso e cai primeiro (ao vivo e headless).
  `TriggerGx/Gz/Deg` viram sugestão de direção + mira da câmera (soldados).

## 9. Clique na UI + órbita com botão direito (10/out/2026, pedido do dono)
- `OverUI` nunca achava a HUD (`GetComponent` no objeto errado; HUD mora no
  filho "HUD"): clique em botão vazava p/ o chão e abria trilha. Agora usa
  referência (`Planning.Hud`, com fallback `GetComponentInChildren`) e o clique
  que começa na UI é engolido.
- Câmera orbita com arrasto do botão direito (e do meio, como antes); clique
  curto com direito remove peça (limiar 8 px, remoção no release). `Q/E` giram
  a peça, `C` follow, roda zoom, `WASD`/setas movem.

## 10. Laterais invisíveis do dominó (10/out/2026, pedido do dono)
- Causa: winding espelhado nas 4 laterais do `BeveledBox` e na cunha inteira —
  o Unity descartava as faces (só as tampas ±Z renderizavam; rampa era vista
  por dentro). Nunca se notou: física usa `BoxCollider` e nenhuma fase usa rampa.
- Fix no `MeshGen` (laterais com ordem espelhada, cunha toda espelhada) +
  textura da face nos 2 slots dos prefabs (todas as faces com a imagem).
- Tiling 2×2 nas laterais + wrap Repeat nas 3 texturas de face: sem tiling a
  face inteira espremia na faixa fina e os pips sumiam no filtro.
- Exige rodar `Tools/Topple/Generate All` (malhas só regeneram na Unity).

## 11. Encostou-derruba + curva que não morre (10/out/2026, pedido do dono)
- Encostou, derruba: `SimEnemy` agora cai no toque de qualquer corpo DINÂMICO
  (peça ou soldado arremessado), mesmo sem impulso — tombo no lugar (2,2 m/s,
  sem voadora exagerada); golpe forte mantém o arremesso. Chão/mesa/obstáculo
  são kinematic e nunca contam (repousar no chão não derruba). Vale ao vivo e
  headless (mesmo componente). Golden `cascade-v1` regenerado pela mudança.
- Pelotão morre junto (pedido do dono): derrubado espirra o vizinho até
  0,8 m (`SimEnemy.Splash`, em saltos A→B→C, determinístico) — sem isso a
  limpeza do último virava loteria de tumulto (a direção do arremesso foge
  do triângulo). Vale ao vivo e headless. Golden regenerado.
- Curva fechada adensa: `ArcPath` comprime o passo em raio < 1,2 m (mín. 60%,
  acima do piso 0,22; reta inalterada) — giro forte com passo largo caía fora
  do cone da próxima peça e a onda morria. Giro curto gasta poucas peças extras.
- Sem buraco evitável: `CurrentPath` costura vãos > 0,45 m com o ponto médio
  válido (3 passadas, respeita a mão); vão sem ponto médio vira aviso no commit
  ("vão de X m — a onda pode parar aí"), não silêncio.
- Mão 12→16 comuns nas 3 fases (folga p/ adensar curva; fileira reta usa ~12).

## 15. Trilha fundação prazerosa (10/out/2026, pedido do dono)
- Regra binária: chão vazio = reta (`ArcPath forceStraight`, ignora facing);
  clique numa peça = âncora (posição+rotação dela, sem custo) + arco tangente.
  *"Chão = reta, peça = continua."* Fork liberado (onda divide); Q/E só avulsa.
- Mira assistida 0,25 m: clique inicial perto de peça ancora nela.
- Commit por trecho (2 cliques ou arrasto); `Ctrl+Z` desfaz por trecho.
- Desenhar arrastando: pressão+movimento estica o fantasma, soltura confirma
  (clique seco = waypoint; limiar anti-acidental; clique que começa na UI anula).
- Fantasma sempre visível no hover (verde/vermelho) + motivo do inválido
  ("bloqueada", "sem peças"); custo do trecho no preview.
- `X` remove a última criada; som `ui_click` em colocar/remover/desfazer/recarregar.
- Mini-tutorial de gestos (3 passos até a 1ª vitória da sessão, sem PlayerPrefs).
- `Esc` cancela só a seleção; Recarregar (`Ctrl+Y`) zera a fase; sem botões
  de linha/trilha. Testes: L por âncora com 4 cliques só-UI, fork, troca de
  peça, arrasto sintético, EditMode (reta forçada, piso).

## 16. Vitória imediata ao zerar (10/out/2026, pedido do dono)
- Sim ao vivo encerrava só ao aquietar (2 s parado) ou 45 s: peça rolando sem
  fim prendia o jogo mesmo com todos derrubados. Agora `SimulationController`
  chama `Finish()` assim que `Knocked == Total`. Headless inalterado (golden).

## 17. Simplificação P1+P2 + git (10/out/2026, pedido do dono)
- `git init` + baseline `fe63c8b`; `UserSettings/` e `InitTestScene*` fora.
- Deletado (~150 linhas): linha, `Redo` do modelo (+ pilha `_redo`), `TryMove`,
  `PingWheel`/`PathAction`/`ShiftDown`, `TogglePath`/`CancelPath`, botões
  `btn-line`/`btn-path` (uxml+fallback+HUD), `MovePiece` das sessions. Vivo:
  `CancelPathSilent`, `CancelSelection`, `MovePieceMsg` (T6), `Undo` por trecho.
- `Assets/Mirror/Examples/` (~1,4k arquivos) deletado; core intacto.
- Testes: −`Line_EvenSpacing`, `Hand_Undo`, sem `TryMove`/`LineOn`.

## 14. Piso de espaçamento anti-travamento (10/out/2026, pedido do dono)
- Peças em curva fechada nasciam grudadas e TRAVAVAM em vez de tombar: o filtro
  só barrava a mesma célula, e na grade fina (0,05 m) vizinhas a 0,05-0,15 m
  passavam e intersectavam. Espaçamento agora tem piso e teto por construção:
  `FallRoom` (0,22 comum / 0,30 pesada) entre vizinhas novas, `IntersectGap`
  contra o tabuleiro, `WaveReach` 0,45 de teto (`DropCrowded` + `FillGaps`).
- Passo 0,35→0,38 (11/out/2026): a 0,35 as peças se apoiavam inclinadas (~10°,
  abaixo do wake de 12°) e ADORMECIAM EM ESCADA; a 0,40 a peça caía EM CIMA da
  próxima e a prendia (drape-pin, fase 3 travou na peça 9 com 0/4). 0,38 é o
  passo da cascata golden T1 (cadência ~19 passos/peça, prova determinística).
- Sleep 0,01→0,005 + `KeepLeanersAwake` default ON: escada adormecida matava a
  onda só no ao vivo (variação de thread; headless determinístico não mostrava).
  Margem 6x sobre tombo (~0,03 m/s); repouso real (0) continua dormindo.
- Ordem importa: `filter → fill → drop` ABRIA vão depois do remendo (fase 2
  perdeu 0/3 na UI); ordem final `filter → fill → drop → fill` (segundo
  remendo enxerga o vão que o drop abriu).

## 13. Recarregar fase + Esc cancela seleção + sem botão de trilha (10/out/2026)
- Botão Refazer virou **Recarregar** (botão + `Ctrl+Y`, no planejamento e na
  simulação): `LoadPhase(PhaseIndex)` — mão cheia, tabuleiro vazio. `Redo` do
  modelo continua existindo, sem chamada (mesma regra da linha: sem apagar).
- `Esc` com seleção de trilha em aberto desfaz a SELEÇÃO (volta a pedir o
  início, nada é removido); sem seleção, não faz nada. Trilha segue ligada.
- Botão `btn-path` escondido (`display:none`, como o de linha); `btn-redo`
  agora nasce com texto "Recarregar" (uxml + código + fallback).

## 12. Peça sólida exata na hitbox (10/out/2026, pedido do dono)
- Abordagem nova: fora a caixa chanfrada (`BeveledBox`, legado). `BoxSolid`
  constrói o paralelepípedo vértice por vértice com a MEDIDA EXATA do
  `BoxCollider` (0,40×0,80×0,12) — preenche a hitbox borda a borda, sem inseto
  de chanfro. 6 faces explícitas [BL,BR,TR,TL] vistas de fora + trava de prova
  no gerador (exceção se alguma face sair espelhada).
- Tampas ±Z com textura 1:1; laterais com tiling 2×2 (wrap Repeat).
- Exige `Tools/Topple/Generate All` com a Unity fora de Play (compila antes).
