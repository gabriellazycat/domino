# TOPPLE — como testar no Editor (solo)

Projeto: Unity `6000.3.25f1` + URP 17.3.0. Abra a pasta `Topple/` pelo Unity Hub.

## Entrada certa
- Cena jogável: `Assets/Topple/Game/Tutorial.unity` (única no build).
- `Bootstrap.unity` é vazia (só câmera+luz T0). Não dê Play nela.

## Jogar (humano)
1. Abra `Tutorial.unity` > aperte Play. O tabuleiro começa VAZIO.
2. **Trilha** (sempre ligada): **chão vazio = reta, clique numa peça = continua**
   dela (posição + ângulo, sem custo). 2 cliques = 1 trecho — ou aperte,
   arraste desenhando e solte. 2 cliques no mesmo lugar = 1 peça avulsa.
   `Q/E` gira (só avulsa) | `1/2/3` peça (vale pro trecho atual)
   botão direito remove | `X` remove a última | `Ctrl+Z` desfaz por trecho
   `Ctrl+Y` ou botão Recarregar = fase toda do zero | `C` follow
   `Enter` ou botão DISPARAR | banner: `Enter` = De novo/Próxima.
   `Esc` desfaz a seleção atual. Linha desativada.
   Câmera: arrastar com botão direito OU do meio = orbitar; roda = zoom;
   `WASD`/setas = mover. Clique em botão da HUD não coloca peça no chão.
3. A 1ª peça que VOCÊ colocar recebe o impulso e cai primeiro (dominó = peça).
   Objetivo fase 1 (`Primeira Queda`): trilha até os 3 soldados e derrube 3/3.
   Fases 2-3: `Curva do Muro`, `Peso Pesado` (botão Próxima após vitória).
   Encostou, derrubou. Testar é grátis: DISPARAR não apaga nada.

## Regenerar / testar (com a Unity FECHADA)
- `Tools/GenerateAll.ps1` — regenera `Assets/Generated/` (42 arquivos, idempotente).
- `Tools/TestEditMode.ps1` — esperado tudo verde.
- `Tools/TestPlayMode.ps1` — esperado 13/13.
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
- `Content/` vazia (dados T5). Fases hoje inline em `TutorialSetup.Phases`.
  Constantes em `ToppleRules.cs`. Rede solo usa `LocalSession` (`MirrorSession`
  é esqueleto T6, Steam AppID 480 só dev).

## Se algo quebrar
- Magenta = URP inativo (`UrpSetup.Ensure()` roda no GenerateAll).
- Mudo = sem AudioListener (ver Main Camera).
- Mão zerada ao abrir cena salva = `InitScenario()` no `Start()` reconstrói.
- Trilha não commita = faltam peças na mão (custa 0,35 m/peça).
