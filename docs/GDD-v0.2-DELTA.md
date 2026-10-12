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

## 12. Peça sólida exata na hitbox (10/out/2026, pedido do dono)
- Abordagem nova: fora a caixa chanfrada (`BeveledBox`, legado). `BoxSolid`
  constrói o paralelepípedo vértice por vértice com a MEDIDA EXATA do
  `BoxCollider` (0,40×0,80×0,12) — preenche a hitbox borda a borda, sem inseto
  de chanfro. 6 faces explícitas [BL,BR,TR,TL] vistas de fora + trava de prova
  no gerador (exceção se alguma face sair espelhada).
- Tampas ±Z com textura 1:1; laterais com tiling 2×2 (wrap Repeat).
- Exige `Tools/Topple/Generate All` com a Unity fora de Play (compila antes).
