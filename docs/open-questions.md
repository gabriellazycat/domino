# DOMINOTION — open questions (GDD §15.7: em dúvida, registrar aqui e seguir o padrão do GDD)

## Decisões tomadas no T0 (com o dono do projeto)
- Escopo: MVP T0-T3 primeiro (1 ato, Comum/Pesada/Rampa, Soldado), v1.0 depois.
- Pasta: `GitHub/Topple` sobrescrita — era Unity 2018.3.7f1 vazia, agora Unity 6000.3.25f1 URP.
- Rede desde T0: Mirror v96.9.22 via `Tools/Packages/Mirror-96.9.22.unitypackage` (14.247.299 bytes).
  Motivo: Mirror não publica `package.json` na raiz do Git — UPM via Git falha. `.unitypackage` é o caminho oficial.
- Transporte: KCP (embutido no Mirror) para CI/local; FizzySteamworks 6.0.1 + Steamworks.NET via Git/UPM
  (`com.mirror.steamworks.net`, `com.rlabrecque.steamworks.net`), AppID 480 em dev. Ordem de importação:
  Mirror primeiro, Fizzy depois (Fizzy sem Mirror não compila).
- Assets: base gerada por código (§13); dono autorizou packs/ferramentas externas discretas (sem cara de IA).
  Regra: free/CC0, vendored com hash, mesma `visualId`, sem ilustração de personagem/capa com cara de IA.
  Declarar uso na Steam (§11).
- URP 17.3.0 + Input System + Localization + Test Framework fixados em `Packages/manifest.json` + `packages-lock.json`.

## Lacunas do GDD (valores iniciais = texto do GDD; viram dados em Content/ na T5)
- Loja: preços de peças/modificadores/relíquias e custo de Remover — não especificados. Usar placeholders.
- Relíquias: 8 exemplos dados; faltam 8 novas "no mesmo padrão" (v1.0). Não inventar na T0-T3.
- Arquétipos: ~20 não desenhados (10 co-op CORTADOS com o multiplayer, 15/out/2026). MVP usa 1 fase tutorial + 1 fase de teste.
- Par/combo-meta/energia de porta: sem números — solver define na T5; MVP usa constantes de `ToppleRules`.
- GDD pula §9.3/§9.4 (só 9.1/9.2 e 9.5/9.6 existem no docx). Duelo/assíncrono (P2) CORTADOS com o multiplayer (15/out/2026) — jogo é solo.
- Imagem do fluxo de telas (§14.2) veio só como alt-text; seguir a tabela §14.3.

## Calibragem T1 (GDD §13.2 autoriza calibrar; números finais vão para Content/ na T5)
- Atrito madeira 0,75 (não 0,5): com 0,5 as bases patinam e a onda decai.
- `sleepThreshold` 0,01 (não 0,05): 0,05 foi pensado para peças pequenas; peças de
  0,8 m tombam a ~0,03 m/s e congelavam no meio da queda. 500 corpos continuam
  dormindo rápido em repouso (prova de carga passou).
- Knock por impacto (§6, "energia acima do limiar"): Soldado = 0,25 N·s (repouso ≈0,08;
  queda de dominó ≈1,0). Limiares dos demais inimigos na T5.
- Resposta de morte: corpo impactado é arremessado para longe do golpe com força
  proporcional ao impulso (janela 0,35 s reafirmada, determinística) — encadeia
  soldado→soldado e entrega o "esmagar o exército" do pitch. Animação final na T3/T7.
- Gatilho de teste: giro no lugar (−4,5 rad/s em Z), sem empurrar a base. O gatilho
  real do jogo (posição/força) entra na T3 com o planejamento.
- Rampa T1 = obstáculo cinemático aproximado por caixa; cunha física real na T2.
- Limiar de repouso (fim da sim): 0,08 m/s por 2 s (vira dado na T5).

## Lições T2 (regras do pipeline)
- `Mathf.SmoothStep` do Unity interpola ENTRE from e to — não é máscara 0-1
  (diferente do HLSL). Máscaras SDF usam `GenUtil.SMask` (travado por teste).
- Um MonoBehaviour por arquivo .cs: o segundo da fila salva `m_Script` nulo no
  prefab (refs quebradas). `SimPiece`/`SimEnemy`/`PieceView`/`EnemyView` separados.
- Nunca `??` com `UnityEngine.Object` (fake-null). Padrão `if (x == null)`.
- Projeto sem URP ativo renderiza materiais URP magenta: `UrpSetup.Ensure()` cria
  o Pipeline Asset + Renderer via SerializedObject e atribui (persiste no projeto).
- Winding: face frontal tem cross(right,up) == normal (ordem anti-horária vista
  de fora). As tampas ±Z já estavam certas; as 4 laterais da caixa e a cunha
  inteira estavam espelhadas e o Unity as descartava (laterais invisíveis,
  rampa vista por dentro) — corrigido no gerador em 10/out/2026.
- Previews são evidência (fora do manifesto de idempotência); `Generated/` é o jogo.

## Deferidos T3 → T4/T5 (HUD mínima não cobre)
- Cargas de Previsão (F), telas de resultado completas, Descanso/Evento,
  pausa, Moral — T4 (fluxo) / T5 (roguelite). Draft 1-de-3 pós-fase JÁ pronto
  (deckbuilder 11/out/2026); loja-ocasião a cada 3 fases JÁ pronta
  (13/out/2026, `IsShopPhase`, títulos Recompensa/★ LOJA ★ + Próxima parada);
  pesos do draft em `Content/` JÁ prontos (13/out/2026, JSON + override);
  stingers vitória/derrota JÁ prontos (13/out/2026); Volume/Bloom JÁ pronto
  (13/out/2026, ver playtest p/ confirmar post-processing no renderer);
  tema em builds JÁ pronto (13/out/2026, Resources via GenerateAll).
  Calibragem final de preços/pesos em Content/ na T5.
- ToppleCam: slow-motion, cortes e zoom no chefe — T7 (polimento).
- PanelSettings criado em código avisa "No Theme" (só chrome base; USS próprio
  cobre). Tema final + `tokens.uss` na T4.
- Prefabs carregados por `AssetDatabase` no Editor; cópias em `Resources/` p/ builds
  finais na T7 (`PrefabRegistry` já tem o fallback).
- Células proibidas num raio de 0,45 m dos inimigos (fantasma vermelho + bloqueio).
- `AudioManager`: 1 clique por knock (ciclo de 8); stingers de vitória/derrota na T4.

## Licoes human-sim (cobertura p/ gente de verdade)
- Sem AudioListener na cena = jogo mudo (so warning, bots passam). Garantido no
  Build e no Start (cenas salvas antes do fix).
- Enter no banner re-disparava o Fire no mesmo frame (Update antes do LateUpdate
  nao resolve; foi para evento OnConfirm do Planning, com guarda LastResult).
- Ctrl+Z por gate manual disparava no Ctrl sozinho; composite ButtonWithOneModifier.
- Layout UI nao assenta headless (botoes em y negativo): nada de clique por
  coordenada nem assert geometrico em teste; botoes via metodos Press* (Humble
  Object); hit-test de mouse fica p/ playtest humano.
- Testes que trocam de cena (LoadScene) DEVEM restaurar cena vazia no teardown:
  senao os seguintes herdam setup vivo (duplo placement/sim).
- Sim ao vivo varia (framerate); headless e deterministico (prova), visivel tem
  retry de 3 (comportamento humano).

## Licoes do batch de melhorias (trilha/fases/camera)
- Rotação interna em graus exatos (fio §9 continua em passos 0-23, quantizado na
  transmissão). Passos de 15° matavam curvas (degraus laterais acumulam).
- Guia p/ solver T5: curvas saudáveis têm ≤11 peças e raio amplo; cauda longa
  sempre decai (física, não bug). Pontos de 0,35 com snap fino 0,05.
- Kill frontal: validade rot-aware (so sobreposicao real) + alcance de queda 0,40.
  Pelotoes densos funcionam por contato; cadeias balisticas, nao.
- Spawn: despenetração determinística antes do gatilho (jitter criava pop).
- KeepLeanersAwake (opt-in, default off p/ preservar o golden T1).
- Previews herméticos (cena vazia): a cena aberta contaminava o render.
- Peças: 2 submeshes (tampas com textura / laterais cor sólida).

## Lições do pacote 14/out (menu/camera/terreno/procedural)
- Struct lang 9: todo campo novo precisa entrar no construtor (`EnemySpot.Team`)
  ou só existir via inicializador (`MapSoldier/MapBlock/BlockDef`, sem ctor).
  `Team Team;` (campo homônimo do tipo) compila, mas prefira nome distinto.
- Local com nome de parâmetro não recompila (`body` no `SoldierVariant`).
- Em batch os frames voam: `Time.time` quase não anda em 30 frames — testes de
  movimento usam `WaitForSecondsRealtime`, não contagem de frames.
- `Object.Destroy` de collider só vale no fim do frame: assert de "sem física"
  exige `yield return null` antes.
- Cena salva abre com overlay (menu): `Build()` entra direto, `Start()` mostra
  o menu — testes de cena salva não quebram e o jogo ganha menu sem editar .unity.
- Teste PlayMode que escreve save usa `FileOverride` + apaga no finally; o
  auto-save pula batch sem override (não suja o save real no CI).
- `Floor`/`Ceiling` em fração estouram medida (vão 3 m numa spec 1–2 m):
  cortar o lado longe preserva a grade.
- Harness mede solver, não gerador: mapa bom em forma de fork (cobertura total,
  tamanho justo) reprova no greedy sem-fork (4/11) e VENCE no fork-split
  (11/11). Cobertura de grupos pura (`SolverLegsTests`, sem física) distingue
  "mapa selado" de "morte física" sem variância de thread.
