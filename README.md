# TOPPLE — como testar no Editor (solo)

Projeto: Unity `6000.3.25f1` + URP 17.3.0. Abra a pasta `Topple/` pelo Unity Hub.

## Entrada certa
- Cena jogável: `Assets/Topple/Game/Tutorial.unity` (10 fixas) ou
  `Assets/Topple/Game/Procedural.unity` (tudo gerado desde a fase 1, mesma run
  = mesmos mapas). Ambas no build.
- `Bootstrap.unity` é vazia (só câmera+luz T0). Não dê Play nela.

## Jogar (humano)
1. Abra `Tutorial.unity` > aperte Play. O tabuleiro começa VAZIO.
2. **Trilha** (sempre ligada): **comece no marcador VERDE, chão vazio = reta,
   clique numa peça = continua** dela (posição + ângulo, sem custo). 2 cliques =
   1 trecho — ou aperte, arraste desenhando e solte. 2 cliques no mesmo lugar =
   1 peça avulsa. `1-8` troca a peça (bandeja mostra o que você tem) |
   `Q/E` gira (só avulsa) | botão direito remove | `X` remove a última |
   `Ctrl+Z` desfaz por trecho | `Ctrl+Y` ou botão Recarregar = fase toda do zero |
   `C` follow | `Enter` ou botão DISPARAR | banner: `Enter` = De novo/Próxima.
   `Esc` desfaz a seleção atual. Linha desativada. `Pular fase` só aparece em
   build de debug (cheat de teste, fora da release).
   Câmera: arrastar com botão direito OU do meio = orbitar; roda = zoom;
   `WASD`/setas = mover. Clique em botão da HUD não coloca peça no chão.
   Patrulha = discos+linhas **âmbar**; muros = cinza; trigger = verde;
   ponte-vão = disco **azul** (só Grande/Torre atravessa); buraco = sem chão.
   Pode construir NO caminho da patrulha (o hint avisa) — mas ela EMPURRA peça
   em pé e estraga o caminho; só peça CAINDO mata patrulheiro. No buraco não
   constrói (`Buraco: contorne!`).
3. A 1ª peça que VOCÊ colocar recebe o impulso e cai primeiro (dominó = peça).
   Run deckbuilder INFINITA: templates reciclados com escala mista por ciclo,
   deck base 10 comuns + 1 bifurcação,
   3 DISPARAR por fase (planejar/Recarregar livres), vida 10 (1 de dano por
   sobrevivente). Vitória paga ouro por estrelas (par + 1ª tentativa);
    derrota-avançada paga metade. Draft 1-de-3 (grátis, sempre) + ★ LOJA ★
    a cada 3 fases em tela única (peças, reroll, cura, +tentativa) e Sair
    avança (draft sozinho avança direto; fase de loja sinaliza
    Próxima: ★ LOJA ★). Sem relíquias.
   Encostou, derrubou. Testar é grátis dentro das tentativas: DISPARAR não apaga nada.

## Regenerar / testar (com a Unity FECHADA)
- `Tools/GenerateAll.ps1` — regenera `Assets/Generated/` (42 arquivos, idempotente).
- `Tools/TestEditMode.ps1` — esperado tudo verde (56).
- `Tools/TestPlayMode.ps1` — esperado 41/41.
- `Tools/BuildWindows.ps1` — build `Builds/Windows/Topple.exe`.
- Não rode `.ps1` com a Unity aberta (lockfile). Feche o Editor antes.

## Regras que valem para humano e bot
- Atrito madeira 0,75 (headless e ao vivo iguais), `sleepThreshold` 0,01,
  knock Soldado 0,25 N·s **ou qualquer encosto** (tombo no lugar),
  fim de sim 0,08 m/s por 2 s.
- Exatamente 1 `AudioListener` ativo (na Main Camera). Sem ele o jogo sai mudo.
- Testes usam botão via `Press*` (Humble Object), nunca clique por coordenada —
  geometria da UI só assenta com viewport real. Hit-test, som real, feel e FPS
  só no playtest humano.
- `Content/` com pesos do draft (`reward-weights.json`, fonte de verdade e
  aplicados em runtime via `ContentLoader`) + espelho da loja (`shop.json`,
  validado por teste; viram dados vivos na T5). Fases base inline em `TutorialSetup.Phases`
  (10 artesanais, recicladas por `PhaseForDepth` na run infinita). Constantes em `ToppleRules.cs` (vida 10, 14 comuns base + 1 fork,
  3 tentativas/fase, 1 dano/sobrevivente, preços da loja). Rede solo usa `LocalSession` (`MirrorSession`
  é esqueleto T6, Steam AppID 480 só dev).
- Stingers de vitória/derrota (`win`/`lose` sintetizados, `GenerateAll` gera os WAVs).
  Volume global com Bloom + vinheta criado em código pelo `ToppleJuice`
  (vale no Editor e em builds; renderer URP precisa de post-processing ativo).
  Tema da HUD (uxml+uss) sincronizado em `Resources/Content` pelo `GenerateAll`
  (builds); build Windows inclui Tutorial + Procedural.

## Se algo quebrar
- Magenta = URP inativo (`UrpSetup.Ensure()` roda no GenerateAll).
- Mudo = sem AudioListener (ver Main Camera).
- Mão zerada ao abrir cena salva = `InitScenario()` no `Start()` reconstrói.
- Trilha não commita = faltam peças na mão (custa ~0,38 m/peça).
