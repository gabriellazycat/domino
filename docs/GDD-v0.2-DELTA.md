# DOMINOTION — Delta vivo sobre o GDD v0.2

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
| Massa da Pesada 2,0 kg (§13.2) | 1,0 kg | A 2,0 kg (4x a comum) a onda de comuns não tombava a pesada e morria nela; a 1,0 a comum derruba. Pesadão continua caindo por toque de pesada (massa-independente) |
| Massa das peças jogáveis | 0,25 kg uniforme | Pedido do dono: qualquer massa diferente travava a onda entre tipos; tudo igual = uma derruba a outra. Inimigos mantêm 1,0/3,0 kg. Vale headless (SimBuilder) e ao vivo (prefabs, exige Generate All) |
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
- Peças: encostou, derruba (12/out/2026, pedido do dono — roçar sem cair não
  existe mais): corpo DINÂMICO que encosta em peça EM PÉ (tilt < 25°, após
  0,25 s de assentamento) tomba ela p/ longe do contato (chute 4,5 rad/s,
  igual ao gatilho; consome no passo como `CheckKnocked`). A onda vira cadeia
  garantida por contato — a física ainda anima cada queda. Kinematic (chão,
  mesa, rampa, patrulheiro em loop) nunca conta; peça já caindo não sofre
  novo chute. Vale ao vivo (`SimulationController`) e headless (`SimWorld`,
  mesmo componente). Golden `cascade-v1` regenerado pela mudança + prova
  `Chain_GrazeStillKnocks` (desvio lateral 0,35 com 0,05 de face).
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

## 18. Deckbuilder + HUD dinâmica (11/out/2026, pedido do dono)
- Run: `RunState` puro (deck/vida 10/tentativas 3/fase, dano brutal 1/sobrevivente,
  `ToppleRng` com seed, sem UnityEngine) + `RewardPool.Draft3` (pesos por fase:
  pesada f1+, rampa f1+, grande/explosiva f2+, torre/corrida f3+, fork f4+;
  3 opções distintas, determinístico). Mão da fase = cópia do deck.
- Fluxo: vitória paga draft e avança; derrota com tentativas = retry; sem
  tentativas = dano, morte = fim de run, senão draft de consolação e avança
  machucado. Última fase = vitória da run. `RestartRun` reseta tudo.
- HUD: bandeja dinâmica (`ScrollView tray`, mostra possuídos + selecionado,
  1-8), `Última [X]` (= `RemoveLast`), `SetActions` (DISPARAR apagado sem peças),
  `SetSimDim` (barra esmaece na sim), `SetRun` (vida + tentativas no objetivo),
  `SetCoach(texto, pulseBtn)`, draft no banner (again/next + 3º botão),
  `ShowRunEnd` (Novo run). Guardas: `IsDraftOpen` bloqueia Enter/Next duplo;
  `PressAgain/PressNext` respeitam draft como os cliques; atalhos 1-8 só no
  planejamento ativo. Fallback de build espelha uxml (tray + 4 ações + banner).
- Regra da cabeça: com peças, trilha só continua de cabeça (sem filhos;
  fork aceita 2); chão longe de cabeça = "Continue da última peça!";
  remoção só da ponta ("Tem continuação — remova da ponta!").
   `WaveReach` por peça (torre 1,0 m, big 0,60 m, demais 0,45 m).
- `Pular fase` (cheat de teste, pedido do dono): botão após DISPARAR (`btn-skip`,
  `PressSkip`, presente no fallback de build); avança sem dano, sem draft e sem
  gastar tentativa (`SkipPhase` → `LoadPhase` seguinte; na última encerra como
  desistência). Ignorado com draft aberto. Prova `Skip_AdvancesPhaseViaUI`.

## 19. Deckbuilder: linguagem + regras finas (11/out/2026, pedido do dono)
- Bandeja 8-vs-7 tipos: o GDD lista 7 peças jogáveis; a HUD mostra 8 (inclui
  Rampa). Mantido 8: Rampa é jogável no MVP (draft "2 Rampas" f1+, peso 15) e
  a bandeja reflete o `PieceId` real — GDD será atualizado na T5.
- Tokens USS adiados p/ T4: cor por tipo hoje é inline no `PlanningHUD`
  (dicionário código→cor); `PlanningHUD.uss` só tem layout. `tokens.uss`
  entra com as telas completas T4.
- Toque-de-pesada (refino §6/pesadão estrito): pesadão ignora toque/tilt/splash
  de pelotão; cai por impulso ≥2,0 N·s, TOQUE de pesada (`_touchedHeavy`,
  qualquer `collision.impulse > 1e-4` de `SimPiece Heavy`) ou blast/queda.
  Comum/runner encostando não derrubam (prova `Brute_SurvivesCommonWave`).
- Splash com epsilon: `d² ≤ R² + 1e-6` (R continua 0,8 m do design). 0,8 exato
  + jitter ±0,002 de spawn virava roleta (coluna da fase 5); número intacto.
- Fallback nunca-colide: `Draft3` sempre devolve 3 opções distintas; se a
  tabela não der (fase 0 tem 2 entradas), completa com "N Comuns" de rótulo
  inédito (3, 4, 5…) — sem colisão de `Label` no draft.
- Mãos de prova ≠ economia: `PhaseSolvabilityTests` usa 112C/24B/8H p/ provar
  existência de solução física; economia real do deck (`StartingCommons`,
  `RewardPool`, f1+) é T5. Sementes do solver: rotas P4–P10 no teste.
- Draft sem par dominado (relato do dono: "3 vs 4 Comuns"): UM pack puro-comum
  por draft, com qtd escalável (4+fase: f0=4 … f9=13); "5 Comuns" estático saiu
  (escada 3-vs-5 colidia do mesmo jeito). Rampa desde f0 (era f1): 1º draft em
  3 eixos — combustível (comuns) × qualidade (pesada) × ferramenta (rampa).
  Fallback virou segurança inalcançável (f0 já tem 3 entradas). Trava de prova
  `Draft3_SemParDominado` (fases 0–9 × 30 seeds, máx. 1 puro-comum por draft).
- Rampa fora do draft + fork promovido (pedido do dono): "2 Rampas" saiu da
  tabela (trava `Draft3_SemRampa`); 3º eixo de f0 virou "1 Grande" (alcance).
  Bifurcação desde f2 (era f4), pesos 14→18 e 12→14 — chega antes do Garfo.
- Bifurcação de verdade (pedido do dono): 1 carta = 2 corpos comuns lado a lado
  (±0,25 m da perpendicular, vão interno 0,10 — quem chega encosta nas duas de
  uma vez); cada metade é cabeça própria (MaxChildren 1 p/ todos = 2 pontos p/
  continuar, 1 em cada peça, como dominó real). Par com mesmo pai, linha B
  encadeia, metades A ficam ramos; reembolso gêmeo (1ª metade 0, última 1; undo
  do par 1). Prefab virou meia-comum laranja (exige Generate All). Provas
  `Fork_PlacesPairWithTwoHeads_NormalOne` + `Fork_TwinRefundAndUndo`.

## 20. Gramática de puzzle + corrente obrigatória (12/out/2026, pedido do dono)
- Camada 1 do problema "olhe→trace→vença": bastava começar do lado do inimigo
  e 1 peça vencia. Agora a 1ª trilha SÓ nasce no trigger fixo (`BeginPathAt`
  recusa fora do trigger com tabuleiro vazio: "Comece no trigger!"; tolerância
  0,25 m). Trava de prova `PhaseTrigger_SinglePieceCanNeverKill`: trigger a
  >1,2 m de todo soldado E waypoint (torre cobre 1,0 m) = peça única nunca
  alcança. Vale p/ humano, bot e testes (prova usa `TryPlacePath` direto).
- Gramática das 10 fases (o "pensar", mesma mecânica em todas, sem sistema novo):
  terreno que veta o óbvio (muros/vãos), cadáver-arma (derrubar A sobre B —
  arremesso+splash já fazem), interceptação (mirar onde o patrulheiro VAI
  estar), escassez que força partilha (deck contado + fork-par como decisão).
  Matriz por fase (dominante/secundária): P1 lima (—), P2 terreno, P3 lima,
  P4 escassez+cadáver, P5 interceptação+splash, P6 partilha(fork)+contorno,
  P7 lima+alcance, P8 duas-frentes(blasts)+standoff, P9 grade+interceptação,
  P10 arcos+standoff.
- Par por fase (soft, p/ estrelas da Fase B): 12/12/12/16/64/88/12/48/20/96.
  Não bloqueia (calibra com dados); prova só exige par > 0.
- Regra das rotas de prova (solver T5): joints ≤90° entre pernas, sem reversão.
  Reversão gera loop gigante no `ArcPath` (ramo longo em vez de curva fechada):
  esgota a mão, empilha peças via interpenetração e a onda nasce morta
  (P5/P6 zerados com nem a peça 0 tombando). P8 (boxy) prova o inverso: 18/18.
- Peça tomba p/ onde APONTA (facing), não p/ a normal do contato: a normal
  re-apontava a queda e matava curvas (regressão da fase 2, 0/4); facing segue
  a tangente que o autor traçou. Ondas ficam mais rápidas (~10 passos/peça).
- Chute 6,5 (era 4,5): drape-pin — queda levemente desalinhada deitava SOBRE a
  próxima e a prendia (<20° p/ sempre, sem novo contato p/ re-chutar); com mais
  energia a queda atravessa em vez de deitar. Golden regenerado de novo
  (hash atual `e45640c4ee90`; era `95c5e9fd6a59` no T1).
- Rescue anti-drape (capado): peça que levou o 1º chute e ficou APOIADA
  (8-25°) em contato persistido (Stay) ganha UM 2º chute 0,5 s depois (máx. 2
  chutes; em pé e quieta sem chute anterior nunca re-chuta; >25° não). Limiar
  em 8° (3° interferia na serpentina saudável: re-chutes redirecionavam quedas
  e quebravam a cadeia — P10 29→24). A sim continua assentando (sem vibração
  perpétua); só a onda tem seguro.
- Juntas: alongar a perna ATRAVÉS da junta em vez de remendá-la (junta perto de
  soldado filtra os primeiros pontos e abre vão > reach). Padrão: perna única
  que passa matando de passagem + curva em espaço aberto (P4v6).
- Bifurcação de verdade (pedido do dono): 1 carta = 2 corpos comuns lado a lado
  (±0,25 m da perpendicular, vão interno 0,10 — quem chega encosta nas duas de
  uma vez); cada metade é cabeça própria (MaxChildren 1 p/ todos = 2 pontos p/
  continuar, 1 em cada peça, como dominó real). Par com mesmo pai, linha B
  encadeia, metades A ficam ramos; reembolso gêmeo (1ª metade 0, última 1; undo
  do par 1). Prefab virou meia-comum laranja (exige Generate All). Provas
  `Fork_PlacesPairWithTwoHeads_NormalOne` + `Fork_TwinRefundAndUndo`.

## 21. Fork no deck base + leitura de split/timing (13/out/2026, pedido do dono)
- Deck base `10C → 10C+1F` (`ToppleRules.StartingForks`, `RunState.NewRun`): split
  e timing jogáveis desde P1, sem depender de sorte no draft. `FirstAvailable`
  continua comum (ordem do enum); bot tutorial inalterado (9 comuns).
- P1 ganha bloco-aula ao norte (fora da linha do bot): ensina contorno no
  tutorial. P5/P6 sem mudança de geometria neste slice (provas físicas
  preservadas); timing emerge do comprimento dos ramos + patrulha desenhada.
- Leitura intuitiva, sem tela nova: hint do fork `1 carta → 2 corpos`
  (`PlanningController.ShowPathPreview`), `Bifurcou — continue de cada ponta
  laranja` no commit, patrulha com discos + linhas do loop
  (`SpawnPatrolMarkers`), coach contextual P6/P5 pós-tutorial (`DriveCoach`).
  Testes: `RunStateTests` atualizados (total 11).
- Mapa/inimigos (fases com prova preservada): P2 muro em L (2 blocos extras ao
  norte, curva sul forçada, rota intacta 4/4); P5 patrulheiro 0,3→0,5 e P9
  0,3→0,45 (interceptação com timing, rotas intactas 9/9 e 24/24); P6 trigger
  oeste (-1,0 m, tronco longo, 12/12); P8 SEM bloco central (sobrepunha as
  fileiras internas — pop no spawn, 9/18; densidade já veta o meio, 18/18).
  Verde: EditMode 37/37 + PlayMode 28/28, golden `e45640c4ee90` intacto.
- Marcador do trigger (`SpawnTriggerMarker`): disco verde + seta na direção
  inicial, sem colisor/física, some na sim com os previews; câmera enquadra
  soldados + trigger; coach `1/3 Clique no marcador VERDE`. Report do dono:
  sem indicação de onde começar.
- Explosiva parada não detona (`SimPiece.ConsumeBlast(now)`): contato no
  assentamento (< `ArmAt`) é descartado em vez de explodir no t≈0 — blast
  nascendo encostada matava por proximidade e os corpos derrubavam as peças
  vizinhas ("só de existir já derruba"). Só a onda detona. Prova
  `  Blast_SpawnContactDoesNotDetonateBeforeArmed`; `Brute_DiesToBlast` intacta
  (contato pós-armado).

## 22. Run infinita + ouro + loja (13/out/2026, pedido do dono)
- Fim da run de 10 fases removido: `PhaseForDepth(depth)` recicla os 10
  templates + escala mista por ciclo (+2 soldados além do mais distante, em
  zigue-zague 0,55/±0,2; patrulha +0,1/ciclo até 0,8; 1 soldado vira pesadão a
  cada 2 ciclos, teto +2; par += 2/extras). Ciclo 0 intacto (provas físicas).
  Corrige o bug da derrota-avançada na fase 10 caindo em `ShowRunEnd(true)`.
- Ouro: vitória paga `GoldForPhase(estrelas, 1ª-tentativa)` (eficiência = peças
  ≤ par); derrota-avançada paga metade de 1 estrela. `RunState.Gold` (+
  `ExtraAttempts` p/ a loja). HUD: `❤·▶·◉` na linha da run.
- Loja em tela única no banner (`ShowShop`): 3 ofertas (`SlotCost×5`), reroll
  (10+5/uso; draft também tem reroll), +2 vida (15, teto 10), +1 tentativa na
  próxima (12, teto +2). Sair avança. Guardas `IsShopOpen` como no draft;
  `PressShop*` p/ testes; sem ouro = apagado. Relíquias cortadas pelo dono.
-   Fluxo: banner → draft → loja → próxima. Testes: `Shop_BuyRerollHealLeave`,
  `Infinite_LoadsBeyondPhase10`, invariantes do provider (EditMode, prof. 0–29).

## 23. Passe visual Inscryption+Balatro (13/out/2026, pedido do dono)
- `ToppleJuice` (só visual, sem física/lógica): fundo quase-preto quente,
  ambiente baixo, sol mais quente, feltro escuro (instância — nunca o asset
  gerado), vela quente tremeluzente sem sombra, poeira no knock (no ponto do
  `LastKnockPoint`), flash da vela + puff grande na vitória, pulso do marcador.
- `TopplePulseUnlit` p/ o trigger (fallback p/ Lit em código se faltar).
- HUD carta-estilo só por USS aditivo (nomes/APIs intactos): banner com borda
  âmbar, hover nos botões, `.shop-card` com borda dourada, objetivo dourado com
  ouro. Sem Volume/bloom (exigiria ref de assembly — follow-up com Unity fechada).

## 24. Revisão humana/QoL (13/out/2026, pedido do dono)
- `Pular fase` escondido na release (`!Debug.isDebugBuild` → display:none; segue
  existindo p/ `Q()` nos testes). Calibragem de dificuldade sem cheat à vista.
- Par no objetivo: `Peças n/par` ao vivo (par apertado legível antes do DISPARAR).
- Patrulha em âmbar (discos+linhas), muros em cinza, trigger em verde: 3 leituras,
  3 cores. README com controles/atual e contagens (41 + 31).

## 25. Patrulha empurra, só queda mata (13/out/2026, pedido do dono)- Caminho da patrulha é CONSTRUÍVEL: `IsValidCell` não barra mais `PatrolSegs`
  (só corpo do inimigo barra); hint avisa `(na rota da patrulha!)` no hover e no preview.
- `SimEnemy.TryBulldoze` (no passo, headless+ao vivo): patrulheiro em ronda a
  ≤0,55m de peça EM PÉ aplica chute (2,4 m/s + tombo) com cooldown 0,35s —
  estraga o caminho parado. Peça caindo não sofre (ela que mata).
- `NoteTouch`: patrulheiro ignora encosto manso (impulso < 0,25 N·s); peça
  caindo (~0,5+) mata normal. Splash/blast/queda inalterados.
-   Provas: `Patroller_BulldozesStandingPiece`, `Patrol_PathIsBuildable`;
  `Patroller_StopsWhenKnocked` intacta. Verde 42+33 com P5 9/9 (a onda chega
  antes da patrulha nos trechos críticos) — re-solve adiado até o playtest
  pedir.

## 26. Geração procedural de verdade (13/out/2026, pedido do dono)
- Report do dono: Tutorial.unity mostrava as mesmas 10 fases (o "infinito" era
  reciclagem com escala). Agora `MapGen` (puro, `Topple.Core`): rota de
  referência primeiro (2-4 pernas, juntas ≤90°), 2-5 grupos de 2-5 ao longo
  dela (fileira 0,6 m, gap ≥1,0 m entre grupos), veto por grupo (muro OU
  patrulha), pesadão (prof. 6+), patrulha 0,3→0,8, trigger alternando quadrante,
  par = rota + 2/soldado, fallback anti-fase-vazia. Prof. 0-9 intactas; 10+ geradas.
- Testes: `MapGen_StructuralInvariants` (20 seeds × 10 profs) + invariantes do
  provider; determinismo por (seed da run, profundidade).

## 27. Cena Procedural desde a fase 1 (13/out/2026, pedido do dono)
- Report do dono: Tutorial.unity mostrava as mesmas 10 (procedural só da 11+).
  Agora `Procedural.unity` (dup da Tutorial + `ProceduralFromStart: 1` no YAML):
  `PhaseForDepth(d, seed, proc)` gera tudo desde a 1; Tutorial intacta.
- `RunState.Seed` guarda a semente (mapas derivam dela); cena registrada no
  build settings; teste espelho `ProceduralScene_StartsGeneratedFromPhase1`.
  Verde 42+34.

## 28. Curva, ponte-vão e buraco no gerador (13/out/2026, pedido do dono)
- Report do dono: procedural começava difícil + faltavam pontes/buracos.
- Curva em tabela: prof 0-1 (1 grupo 2-3, sem veto), 2-3 (só muro), 4-5
  (muro/patrulha lenta), 6+ (tudo). Testes `MapGen_Curve*`.
- Ponte-vão (prof 4+): disco proibido Ø 0,45-1,0 no meio da rota; a queda
  atravessa com Grande (≤0,6) / Torre (≤1,0). Preview azul + hints.
  Testes `MapGen_GapRules`, `ConvertPreservesGaps`, `Gap_BlocksPlacementAndWarns`.
- Buraco (prof 6+, dono: "a linha morre ali"): ret 1-2 m SEM chão (lajes 1 m em
  `RebuildGround`/`SpawnGroundTiled`; `KillY` já remove); construir em cima é
  inválido (`Buraco: contorne!`). Física emergente, sem regra de morte nova.
  Testes `MapGen_VoidRules`, `ConvertPreservesVoids`, `Void_PieceFallsThroughHole`,
  `Void_BlocksPlacement`. Verde 48+37.

## 29. Loja-ocasião a cada 3 fases (13/out/2026, pedido do dono)
- Antes: banner → draft → loja → próxima TODA fase (loja diluía o draft).
  Agora: draft sempre (grátis, 1-de-3); loja só quando
  `ToppleRules.IsShopPhase(PhaseIndex)` — `(idx+1)%3==0` (fases 3, 6, 9…).
  Pick sem loja avança direto (`AdvancePhase`); com loja abre `OpenShop`.
- Sinalização sem tela nova: fase de loja mostra `· Próxima: ★ LOJA ★` no
  `SetPhase`; draft vira `Recompensa (grátis) — escolha 1 de 3:` (+
  `Próxima parada: ★ LOJA ★` quando há loja a seguir); loja vira
  `★ LOJA ★ — ◉X ouro`. Draft+loja convivem, loja nunca toda fase.
- Testes: `ShopEvery3_OccasionalNeverEveryPhase` (EditMode, idx 0–29);
  `Human_ClearsAllPhasesViaUI` vira draft-direto nas fases 1–2 e
  draft→loja→sair na fase 3 (com asserts de título/sinal);
  `Shop_BuyRerollHealLeaveViaUI` joga a fase 3 (idx 2, `LoadPhase(2)` +
  rota 3,7/0,9) e mantém compra/reroll/cura/tentativa/sair (sai p/ idx 3).

## 12. Peça sólida exata na hitbox (10/out/2026, pedido do dono)
- Abordagem nova: fora a caixa chanfrada (`BeveledBox`, legado). `BoxSolid`
  constrói o paralelepípedo vértice por vértice com a MEDIDA EXATA do
  `BoxCollider` (0,40×0,80×0,12) — preenche a hitbox borda a borda, sem inseto
  de chanfro. 6 faces explícitas [BL,BR,TR,TL] vistas de fora + trava de prova
  no gerador (exceção se alguma face sair espelhada).
- Tampas ±Z com textura 1:1; laterais com tiling 2×2 (wrap Repeat).
- Exige `Tools/Topple/Generate All` com a Unity fora de Play (compila antes).

## 35. Economia-maior (13/out/2026, pedido do dono)
- Direção do dono: economia maior (gerador e par apertado intactos). Pacote:
  deck base 10→14 comuns (P1 par 12 com folga de 3); pack escalado 4+fase →
  5+fase (f0: 5, f9: 14); packs novos mistos (nunca puro-comum: sem par
  dominado) "3 Comuns + 2 Pesadas" f2, "3 Pesadas"/"2 Torres" f6,
  "2 Grandes + 2 Comuns" f8; ouro 10+5★→12+6★ (+bônus 1ª tentativa 5→6);
  loja ×5→×4, reroll 10+5→8+4, cura 15→12, tentativa 12→10 (teto +2 e loja a
  cada 3 intactos).
- Projeção (commons-picker): 15 + Σ(5+i, i=0..9) ≈ 110 cartas na prof. 10
  (era ~96) + loja ~50% mais forte — gigantes (par 45–81) bancáveis com folga
  p/ desperdício humano. Qualidade acompanha: pesadas f0/f1 + "3 Pesadas" f6
  (2–3 pesadões), torres f3 + "2 Torres" f6 (atravessa 2 vãos).
- Testes: `NewRun_DeckBase14ComunsVida10`, `ShopPrice` (×4), `Gold_StarsFormula`
  (12+6★), `Reward_AppliesBundle` (relativo à base), `Draft3_DeepPacksUnlock`
  (fundo desbloqueia, f0 não); espelhos `Content/` atualizados (JSON+Base).
  Calibragem final no playtest/T5.

## 30. Solver-harness das geradas (13/out/2026, pedido do dono)
- O MapGen garante estrutura mas NÃO vencibilidade: harness em
  `GeneratedSolvabilityTests` (prova amostrada, física headless de verdade):
  24 candidatas fixas (prof. 10–11, todos os mecanismos: vão 4+,
  buraco/pesadão/patrulha 6+) × filtro determinístico de escala humana
  (≤16 corpos, ≤3 pesadões — deck de prof. 10 banca ~70 cartas) → 6 amostras
  (inclui patrulhas) × 3 estratégias (outward, cobra, patrulhas-primeiro;
  pesada no pesadão com overshoot, torre p/ vãos) + minas anti-patrulha
  (explosiva parada no loop: ele passa e detona — bulldoze não salva).
- Barra: 3 de cada 4 corpos (≥75%) em toda amostra (stillborn reprova na
  hora); vitórias integrais no log. Achados documentados no código: perna
  nova no cone de queda QUEBRA a onda que vencia (só mina/ponta sem perna);
  explosiva só arma com contato de INIMIGO (ponta parada perto não detona);
  pesadão mirado (pesada com facing + energia entregue) é tática além do
  guloso — P4/P8/P10 artesanais provam com 3/3, solver T5. Física tem
  variância de thread nos casos de borda (mesmo binário, runs distintos).
- Medição da curva (tabela `[TOPPLE][GEN-SIZE]` no teste
  `MapGen_FairShareForHarness`): 10/24 justas, 14/24 gigantes (até 23 corpos,
  par 45–81). Gigantes são injustos na ECONOMIA (deck ~70 não banca 100
  peças com folga) — decisão pendente do dono; harness não os promete.
- Verde: 41/41 PlayMode (37 + harness 1 + fluxos Content 3), golden intacto.

## 31. Content/ de verdade (13/out/2026, pedido do dono)
- `Assets/Topple/Content/reward-weights.json` (pesos do draft, fonte de
  verdade) + `shop.json` (espelho da economia). `ContentPack` puro (Core) +
  `RewardPool.UsePack/ResetPack` (override em runtime, Base embutido como
  fallback) + `ContentLoader` (Game: JsonUtility → pack, `Resources/Content`,
  valida shop com warning). `TutorialSetup.InitScenario` aplica.
- `GenerateAll` sincroniza Content/ → `Resources/Content` (builds).
- Testes: `ContentTests` (espelho exato JSON↔Base incl. ordem, override dirige
  drafts idênticos, JSON ruim explica o motivo), `Content_JsonDrivesDraftInGame`.
  Trocar peso = editar JSON + manter espelho (o teste quebra se derivar).

## 32. Volume/Bloom (13/out/2026, pedido do dono)
- `Topple.Game.asmdef` + `Topple.Tests.PlayMode.asmdef` referenciam
  `Unity.RenderPipelines.Core.Runtime` + `Universal.Runtime` (era o follow-up
  "exigia ref de assembly"). `ToppleJuice.EnsureVolume`: Volume global com
  Bloom (threshold 1,0/intensidade 0,45) + vinheta, criado em código (1 por
  cena, vale Editor + builds sem editar .unity). Sonda `HasPostFX` p/ testes
  (sem ref URP no teste). Nota: renderer URP precisa de post-processing ativo
  p/ o Bloom aparecer — ver playtest humano.

## 33. Tema em builds (13/out/2026, pedido do dono)
- `LoadUxml/LoadUss` com fallback `Resources/Content/PlanningHUD`
  (GenerateAll sincroniza uxml+uss de `Topple/UI`). Sem eles, fallback sem
  tema (como antes). `BuildWindows` inclui Tutorial + Procedural (README já
  prometia "ambas no build"; código só levava a Tutorial).

## 34. Stingers T4 (13/out/2026, pedido do dono)
- `AudioSynth.Win` (arpejo maior C5–E5–G5, 0,7 s) + `Lose` (G4–Eb4 + sopro,
  0,9 s): determinísticos, −3 dBFS, sem clip (prova
  `Audio_StingersDeterministicAndNormalized`). `GenerateAll` grava
  `win.wav`/`lose.wav`; `AudioManager.Win/Lose` null-safe; vitória toca Win,
   fim de run (derrota) toca Lose. Teste `Audio_StingersPlayWithoutError`.

## 36. Câmera livre na sim + HUD enxuta (14/out/2026, pedido do dono)
- Zoom 2,5x mais rápido (`CameraController.ZoomStep` 0,02→0,05, 1 constante
  ajustável; clamps intactos; prova pura `Zoom_ClampZoomFasterAndBounded`).
- DISPARAR = câmera 100% manual: `ToppleCamBasic.AutoFollow` default off
  (sem auto-perseguição; T7 religa), `C` morto na sim (`FollowToggleEnabled`,
  opção B do dono), `StopFollow()` no `StartSim`.
- HUD enxuta total na sim (`SetSimMode`): somem bandeja + DISPARAR/desfazer/
  recarregar/última/pular + coach; ficam objetivo + "Simulando…" + banner.
  `Press*` funcionam escondidos (Humble Object). Volta no retry (`BackToPlanning`).
  Prova `Sim_HidesPlanningUIAndFreesCamera`.

## 37. Patrulha vitrine no planejamento (14/out/2026, pedido do dono)
- Patrulheiro anda no loop durante o planejamento, SEM interagir (sem
  bulldoze/kill/física — peças são fantasmas). `Core/PatrolPath.PosAt` puro
  (mesma matemática do `SimEnemy.PatrolAdvance`) + `Game/PlanningPatrol`
  (move só transforms dos previews; `SoldierSpots`/mão intactos; t=0 no
  waypoint 0, onde já está o disco maior). Provas `PatrolPathTests` (fecha o
  loop, velocidade constante, determinismo) + `Patrol_VitrineWalksWithoutTouching`.

## 38. Main menu + auto-save + settings (14/out/2026, pedido do dono)
- Menu na cena (overlay em código, sem editar .unity): Novo run / Continuar /
  Carregar (auto-save) / ≡ + settings essencial (volume→`AudioListener.volume`,
  pós on/off→`Volume`, zoom→`ZoomStep`). Cena salva abre com menu sobre a
  fase 0 (testes de cena salva intactos); `Build`/testes entram direto.
  Menu bloqueia input (`Planning.InputBlocked`, `Cam.enabled`, `PollShortcuts`;
  mouse já era filtrado pelo `OverUI`).
- Auto-save 1 slot (`autosave.json`, checkpoint em todo `LoadPhase`, nunca
  mid-sim): DTO puro `Core/RunSave` (deck/vida/ouro/fase/seed/**estado do RNG** —
  sem ele drafts/mapas pós-load divergiam) + `Game/RunStore` (IO com try/catch;
  `FileOverride` p/ testes; sem save em batch sem override). `ToppleRng`
  expõe `State/SetState`. Provas `RunSaveTests` (round-trip + draws iguais) +
  `Menu_PlaySettingsSaveLoad`.

## 39. Times narrativos bem x mal (14/out/2026, pedido do dono)
- Mal vermelho x bem ciano, por pelotão, todos os tipos (soldado/pesadão/
  patrulheiro), SÓ visual (massa/limiar/knock idênticos, trava de prova).
  Bem = ciano (não colide com o azul translúcido do vão). P1–P3 100% Evil;
  P4+ metade Good; geradas: hash(seed,depth,pelotão) sem consumir o rng
  (layout intacto) + prof 0–2 Evil. `Team` único no Core (`EnemySpot`/
  `SimEnemy`/`EnemyView`/`MapSoldier`); prefabs `enemy_*_good` no `GenerateAll`
  (fallback p/ Evil se faltar); `SimBuilder` com cor por time. Builds levam os
  2 prefabs do bem via `Resources/Generated` (resto da publicação segue T7).
  Provas `Teams_*` ( abertura Evil, determinismo, convert) +
  `Teams_SamePhysicsOnlyNarrative` (mesma física, caem igual).

## 40. Terreno fake sem telhado (14/out/2026, pedido do dono)
- Gameplay > visual: física plana inviolável, zero collider novo.
- Buraco com fundo fake: 4 saias internas (y 0→−1,5, sem fundo — peça some
  no `KillY=-5`) + filete de alerta no topo (`BuildVoidDressing`, 8 peças/buraco).
- Muros em 3 pinturas, mesmo BoxCollider e validade (P1 pedra; P2 casa+pedra+
  cerca; geradas por hash de posição): pedra cinza atual, casa tijolo SEM
  TELHADO (visibilidade), cerca madeira baixa (bloqueia igual). `BlockVariant`
  no Core (`MapBlock`/`BlockDef`/`ObstacleDef`); `ObstacleMat(variante)`.
- Vales fake = sujidade determinística do feltro (8 quads 4 mm, longe de
  trigger/soldados/blocos, semente própria — nunca o `Run.Rng`); colinas =
  anel fixo de 10 esferas fora do campo. Provas `Walls_*` + `Terrain_*`.
- Bug latente achado no caminho: `TryVoid` podia gerar vão de 3 m
  (Floor/Ceiling em fração; spec é 1–2 m) — corta o lado longe, grade intacta.

## 41. Procedural-legal: teto duro + fork-útil (14/out/2026, pedido do dono)
- Teto DURO de corpos (`MaxBodiesForDepth` = min(3+depth,16); `DeckForDepth`
  = 15+Σ(5+i)): remove pelotões inteiros do fim (mín. 1 pelotão/3 corpos, par
  −2/corpo). 24/24 candidatas justas (antes 10/24 + 14 gigantes).
- Gradiente p/ ramos longos (0–3 intactos, provas preservadas): prof 4–5 com
  3 pelotões + pernas 3–4 + len 60+; 6+ idem com cap 5; lados alternados
  (pelotões opostos forçam o split); 2º pelotão nasce perto do 1º (tronco
  compartilhável); vetos 0,7→0,8 na prof 6+. `ClusterCenters` exposto.
- Fork-split no harness (4ª estratégia): 1 fork no trigger (2 cabeças
  provadas) + metade angular p/ cada ramo. Seed=4/prof=10: greedy 4/11 →
  **fork-split VENCEU 11/11** — o mapa estava certo, o solver estava atrás.
- Cobertura de grupos pura (`SolverLegsTests`, sem física/variância): perna a
  ≤1,5 m de cada centro (≥85%; minas cobrem patrulhas). Barra do harness
  intacta (≥75%/amostra).
- Provas `DeckCap_*`, `ForkPair_*` (par p/ fork em 4–11), harness 47/47.

## 42. Beleza Inscryption+Balatro (14/out/2026, pedido do dono)
- `tokens.uss` na prática: menu (véu 0,72 + carta 480 px borda âmbar, título,
  botões, sliders/toggles legíveis) com os mesmos tokens; loja vira carta
  dourada (classe `shop` no banner; resultado volta ao âmbar); transições de
  120 ms nos botões. Nomes/APIs intactos (bots). Prova `Beauty_MenuAndShopStyling`.
  Hit-test/som real/feel/FPS seguem no playtest humano.

## 43. Patrulha continua da vitrine p/ sim (14/out/2026, pedido do dono)
- Antes a sim renascia o patrulheiro no waypoint 0 (planejou contra a fase X,
  jogou contra a fase 0 — enganoso). Agora nasce onde ESTAVA: `PlanningPatrol`
  expõe `Elapsed` (relógio de parede) → `StartSim` passa como `patrolOffset` →
  `SimEnemy.PatrolAdvance` soma ao relógio (mesma fórmula; headless usa 0:
  determinístico, golden intacto, paridade de mecânica preservada).
  Provas `Patrol_OffsetContinuesVitrine` (EditMode, mesma matemática) +
  `Patrol_ContinuesFromVitrineIntoSim` (ao vivo, <0,35 m).

## 44. Muros do sketch: porteira + divergência + escudo (14/out/2026, pedido do dono)
- Desenho do dono (3 exemplos): bifurcação + muro atravessando o caminho,
  forçando curva. O `TryWall` antigo era proibido de nascer perto da rota
  (decorava, não ditava curva).
- Muro-porteira (prof 3+, 1–2/mapa): nasce EM CIMA da rota (±0,15 m),
  compondo L em 60% (Ex.1/Ex.2); campo aberto sem encostar na borda =
  contorno sempre possível (nunca sela); +2 de par por bloco; `MapBlock.Gate`
  marca p/ prova; rota exposta em `MapSpec.RefRoute`. Vêm por último na
  geração: soldados/vãos/buracos intactos.
- Grupos divergentes (prof 4+, Ex.3): centroide DIRETO no rumo 70–160° do 1º
  (a 2,5–5 m), fileira de frente p/ o trigger; filtros clássicos valem
  (nunca trava). Rota reta demais → cai no tronco compartilhado (F6).
- Muro-escudo (prof 4+, 50%, detalhe Ex.2): colado atrás do pelotão
  (0,7–1,0 m, fora do corredor); sem sobrepor spawn (vale o loop da patrulha).
- Harness em 2 níveis (porteira fura arco guloso — humano com fork/retry
  curva; T5 planeja desvio): piso ≥50%/amostra (anti-stillborn) + barra ≥75%
  no agregado. Fecha atual: 2/6 integrais, 57/73 corpos (78%).
  Provas `GateWalls_*`, `DivergentGroups_*`, `ForkPair_*` (dois sabores:
  tronco 1–8 m OU split ≥60°).

## 45. Muros corridos: paralelepípedos em L/Z (15/out/2026, pedido do dono)
- Dono: cubos soltos não leem como muro; sketch tem barras em L/T. Vetos
  viraram corridas de 2–3 trechos finos (0,3–0,45 × 0,8–1,6 m) conectados em
  90°; porteira virou barra fina atravessada (1,5–2,2 m, eixo perpendicular à
  rota) + parceiro L fino; escudo segue pilar. Eixo-alinhado: sem rotação,
  collider exato, validade idêntica (raio pela maior dimensão).
  Provas `Walls_RunsAreThinAndConnected` (finos + juntas) + porteira fina;
  harness re-verde (2/6 integrais, 55/67 = 82%).

## 46. Corredor guardado + validade justa (15/out/2026, pedido do dono)
- Dono: linha reta spawn→inimigo quase nunca cruzava muro. Veto agora nasce
  atravessado no eixo trigger→centroide (40–65%) + telas de corredor por
  pelotão (prof 3+): teste `Walls_GuardTriggerCorridors` (qualquer muro a
  ≤0,8 m do segmento).
- Lançamento respira: 2 m no cone ±30° da facing (gramática do P2), 1 m fora.
- Anel de engajamento: aresta do muro a ≥0,5 m do soldado além do raio
  proibido (`WallBanRadius`, mesma fórmula da validade) — sem isso nem humano
  mataria (bolha empurrava a perna p/ além do alcance).
- Validade justa p/ barra longa: colar de círculos rente (`ForbiddenCircles`,
  fonte única jogo+harness+LEGS); cubo segue círculo único (provas intactas).
- Piso anti-stillborn mede LANÇAMENTO (<15 caídas sem vitória), não kills.

## 47. Buraco removido do jogo (15/out/2026, pedido do dono)
- Sem buraco em nenhum mapa: fora geração (`TryVoid` + `MapVoid` + bloco
  prof 6+), validade (`VoidRects`/`NearVoid`/hint), render (`RebuildGround`
  virou laje única + `BuildVoidDressing`/saias/filete fora) e simulação
  (`SpawnGroundTiled` fora — só `SpawnGround`). Chão sempre inteiro 24×16.
  Provas removidas (`MapGen_VoidRules`, `ConvertPreservesVoids`,
  `Void_PieceFallsThroughHole`, `Void_BlocksPlacement`); `Terrain_*` agora
  trava laje+grama e ausência de `VoidDressing`. `KillY=-5` segue (segurança
  p/ peça lançada p/ fora da mesa).

## 48. Multiplayer cortado do escopo (15/out/2026, pedido do dono)
- Jogo 100% solo: fora multiplayer/co-op (T6), duelo/assíncrono (P2, §9.3/§9.4
  inexistentes no docx) e os 10 arquétipos co-op. `.docx` segue congelado.
- Código de rede (`MirrorSession`, esqueletos T6) segue intocado por ora —
  solo roda em `LocalSession`, sem efeito no jogo; remoção física fica p/
  decisão futura (deleta `Assets/Mirror` + `Net/` + transports).

## 49. Papéis de peça no caminho + mapa que exige especiais (16/out/2026, pedido do dono)
Problema: andar dependia só da Comum (deck = Comuns + 1 peça de dano no fim). `step` quase
igual entre peças (Comum 0,38 / Torre 0,55) e gerador calibrado em 0,38 por peça.
Decisões (roadmap, em ordem):
1. **Grande removida**; a **Torre** vira a peça de alcance: `step` acompanha a queda real
   (ponta alcança longe). Saves antigos: Grande → Torre.
2. **Deck inicial** com especiais (ex.: 9 Comuns, 2 Torres, 1 Bifurcação, 1 Foguete) e
   **par por distância** (alcance), não por contagem de Comuns.
3. **Foguete = linha no chão**: atropela tudo no trajeto (1 de dano cada), para em muro de
   pedra, **ricocheteia** nos muros, imune à flecha do Arqueiro; a corrente continua onde ele para.
   Torre = ponto (pula o que está no meio, golpe forte onde cai).
4. **Saltadora**: no planejamento mostra arco pontilhado + ponto de pouso além do muro; a próxima
   peça nasce no pouso (filha normal). Na sim, salto roteirizado (determinístico) que cai em cima
   da peça de pouso e a empurra para a frente.
5. **Selo Mola** (prensa): a peça vira saltadora uma vez.
6. **Muros protegendo pelotões**: U com abertura (contorna com Comuns), cerca de caixotes
   (Torre por cima / Saltadora / Explosiva), fortaleza de pedra (Saltadora). Só gera se o deck resolve.
7. **Patrulhas maiores e variadas**: linha (vai e volta), círculo/ronda em volta do pelotão, oito,
   contorno de muro. Ronda em volta do pelotão inverte o `clash` atual.
8. **Ogro patrulheiro**: lento, vida 3; **pisoteia** (some) peça em pé na rota; derrubado, **tomba
   como dominó gigante** na direção do golpe e esmaga onde cai (~1,5 m).
9. **Arqueiro**: círculo de alcance visível; a 1ª peça da corrente que entra leva flecha de fogo (queima, igual
   à tocha) — **uma vez só**. O planejamento a marca com uma mira vermelha e **dela não se continua** (aviso). Solução:
   Bifurcação (um ramo é isca) ou Foguete (imune em movimento).
10. **Porteira com alavanca**: alavanca derrubada abre a porta por N s e fecha; ramo da Bifurcação
    tem de chegar com ela aberta — o timing se ajusta pelo comprimento dos ramos (Comum "atrasa").
Fora: evento de remover Comuns (dono vetou).
Feito (item 1, 16/out/2026):
- `PieceDef.step` virou **alcance da peça que cai**: `Layout.extend` usa o `step` da PONTA (antes era
  o da peça nova). Torre: 0,55 → **1,15**. Medido na física: Pesada depois da Torre falha a partir
  de 1,30 m; 1,15 passa para todos os tipos.
- Curva depois da Torre: no máximo **8°** (`LONG_TURN`) — a 26° a peça seguinte ficava ~0,5 m fora
  da faixa de queda. Torre depois de Torre vai **reta** (golpe de lado desvia a queda).
- Muro no meio da queda da Torre bloqueia a próxima peça (`fallBlocked`): a Torre bate no muro e para.
- Grande removida (catálogo, recompensas, bot, UI); saves v1/v2 convertem Grande → Torre.
- Testes: `tests/tower.test.ts`. Bot da bateria segue 17/48 (igual a antes).
Feito (itens 2–10, 17/out/2026):
- **Torre: queda guiada** — tombo travado no eixo planejado (um golpe torto a girava e a ponta errava a peça a 1,15 m).
- **Deck inicial**: 9 Comuns, 2 Torres, 1 Bifurcação, 1 Foguete (`RULES.starting*`). **Par por distância**:
  `routeLength / PAR_REACH (0,52)`; o "cabe no baralho" do gerador agora mede METROS (`deckReach`, Torre = 3 Comuns).
- **`core/motion.ts`** (planejamento e física usam as mesmas contas): `launchOf(ponta)` diz de onde sai a próxima peça.
  - **Foguete**: corre 3,2 m no chão (cinemático, 6,5 m/s), quica em muros/porteiras/borda (até 4x), trava antes de
    Brutamontes/General parados; a próxima peça nasce 0,3 m depois do fim e é acionada quando ele chega.
    Linha tracejada amarela no planejamento.
  - **Saltadora** (nova peça, verde com molas, custo 3): salta 2,2 m em arco (ápice 1,5 m) com cambalhota que fecha aos
    75% do salto (antes, a base varria a peça do pouso para trás); pousa 0,4 m antes da próxima. Arco tracejado verde.
  - **Selo Mola** (prensa, 30 de ouro): a peça salta igual à Saltadora. Não vai em Foguete, Saltadora nem Bifurcação.
- **Patrulhas**: retângulo maior e LINHA (vai e volta) desde a fase 4; CÍRCULO e RONDA em volta do pelotão da 6; OITO da 8.
- **Ogro** (fase 7+, 40% das patrulhas): lento (0,3), vida 3, ESMAGA peça em pé na rota (some); derrubado, tomba na
  direção do golpe e derruba quem estiver numa faixa de 1,9 m à frente (e acorda peças da corrente ali).
- **Arqueiro** (fase 6+, ~40%): círculo de 1,9 m; o alvo é FIXO e visível: a 1ª peça da corrente (menor profundidade a partir
  do gatilho; empate = menor id) cuja posição colocada cai no círculo. Mira vermelha no planejamento; não dá para continuar
  a corrente dessa peça (aviso "O arqueiro vai destruir essa peça"). A flecha queima ela e a SEGUINTE (se existir; só uma
  queimada a corrente pulava o buraco: a Comum alcança 0,8 m). Uma flecha só. Foguete é imune. Isca com Bifurcação provada em teste.
- **Fortificações** (fase 5+): anel de muro em volta do pelotão — ABERTO (vão de ~1,2 m de lado), FECHADO de caixotes
  (só se o baralho tem Saltadora) ou com **PORTEIRA** (fase 7+): grade cinemática que afunda por 3 s quando uma peça
  cai na ALAVANCA (fora do anel, 1,8–2,6 m, ligada à grade por pontilhado). Peça que cairia em cima da grade é
  empurrada para depois dela (até 0,26 m) — sem isso a corrente quase nunca acertava o vão.
- Testes novos: `tests/motion.test.ts` (Foguete atropela/quica, Saltadora e Mola pulam muro), `tests/enemies.test.ts`
  (flecha, isca, Foguete imune, Ogro esmaga/tomba, porteira fechada × aberta). Bot da bateria: 21/48 (antes 17).
  O bot NÃO resolve porteira, isca de Arqueiro nem fortificação fechada (usa Torre como atalho; o solver tenta com e sem).
- Vitrine: `GPU=1 node web/e2e/novidades.mjs` fotografa as novidades em `web/e2e/shots/nov-*.png`.
