# TOPPLE — como testar no Editor (solo)

Projeto: Unity `6000.3.25f1` + URP 17.3.0. Abra a pasta `Topple/` pelo Unity Hub.
Cena salva abre no **menu** (Novo run / Continuar / Carregar auto-save /
Opções: volume, brilho/vinheta, zoom). Auto-save por fase (checkpoint no
`LoadPhase`, nunca mid-sim).

## Entrada certa
- Cena jogável: `Assets/Topple/Game/Tutorial.unity` (10 fixas) ou
  `Assets/Topple/Game/Procedural.unity` (tudo gerado desde a fase 1, mesma run
  = mesmos mapas). Ambas no build.
- `Bootstrap.unity` é vazia (só câmera+luz T0). Não dê Play nela.

## Jogar (humano)
1. Abra `Procedural.unity` (ou `Tutorial.unity`) > aperte Play > menu >
   Novo run. O tabuleiro começa VAZIO.
2. **Trilha** (sempre ligada): **comece no marcador VERDE, chão vazio = reta,
   clique numa peça = continua** dela (posição + ângulo, sem custo). 2 cliques =
   1 trecho — ou aperte, arraste desenhando e solte. 2 cliques no mesmo lugar =
   1 peça avulsa. `1-8` troca a peça (bandeja mostra o que você tem) |
    `Q/E` gira (só avulsa) | botão direito remove | `X` remove a última |
    `Ctrl+Z` desfaz por trecho | `Ctrl+Y` ou botão Recarregar = fase toda do zero |
    `C` follow (planejamento; na sim a câmera é 100% livre e o `C` não faz nada) |
    `Enter` ou botão DISPARAR | banner: `Enter` = De novo/Próxima.
    `Esc` desfaz a seleção atual. Linha desativada. `Pular fase` só aparece em
    build de debug (cheat de teste, fora da release).
    Câmera: arrastar com botão direito OU do meio = orbitar; roda = zoom (rápido);
    `WASD`/setas = mover. Na sim a HUD enxuta some (bandeja + ações somem;
    ficam objetivo + banner). Clique em botão da HUD não coloca peça no chão.
    Patrulha = discos+linhas **âmbar** (+ corpo andando no planejamento, vitrine,
    que continua de onde estava ao DISPARAR);
    muros = pedra/casa/cerca em trechos finos conectados (só pintura, bloqueiam
    igual); porteira = barra EM CIMA do caminho (força a curva, +2 de par); trigger = verde;
    ponte-vão = disco **azul** (só Grande/Torre atravessa); buraco = sem chão
    (com saia + borda de alerta). Times narrativos (só visual): mal **vermelho**,
    bem **ciano** (P1–P3 tudo mal).
    Pode construir NO caminho da patrulha (o hint avisa) — mas ela EMPURRA peça
   em pé e estraga o caminho; só peça CAINDO mata patrulheiro. No buraco não
   constrói (`Buraco: contorne!`).
3. A 1ª peça que VOCÊ colocar recebe o impulso e cai primeiro (dominó = peça).
    Run deckbuilder INFINITA: procedural (`MapGen`, mesma run = mesmos mapas;
    teto de corpos pelo deck, pelotões opostos pedindo bifurcação),
    deck base 14 comuns + 1 bifurcação,
   3 DISPARAR por fase (planejar/Recarregar livres), vida 10 (1 de dano por
   sobrevivente). Vitória paga ouro por estrelas (par + 1ª tentativa);
    derrota-avançada paga metade. Draft 1-de-3 (grátis, sempre) + ★ LOJA ★
    a cada 3 fases em tela única (peças, reroll, cura, +tentativa) e Sair
    avança (draft sozinho avança direto; fase de loja sinaliza
    Próxima: ★ LOJA ★). Sem relíquias.
   Encostou, derrubou. Testar é grátis dentro das tentativas: DISPARAR não apaga nada.

## Regenerar / testar (com a Unity FECHADA)
- `Tools/GenerateAll.ps1` — regenera `Assets/Generated/` (66 arquivos, idempotente).
- `Tools/TestEditMode.ps1` — esperado tudo verde (69).
- `Tools/TestPlayMode.ps1` — esperado 47/47.
- `Tools/BuildWindows.ps1` — build `Builds/Windows/Topple.exe`.
- Não rode `.ps1` com a Unity aberta (lockfile). Feche o Editor antes.

## Regras que valem para humano e bot
- Atrito madeira 0,75 (headless e ao vivo iguais), `sleepThreshold` 0,005,
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
