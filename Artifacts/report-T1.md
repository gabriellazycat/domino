# TOPPLE — report-T1 (Núcleo e simulação)

## Entrega (GDD §15.4 T1)
- `SimWorld` (`Assets/Topple/Sim/SimWorld.cs`): cena com física própria
  (`LocalPhysicsMode.Physics3D`), `Simulate` manual a 1/60 s, seed, ordem estável de
  spawn, sem `Time.deltaTime`. Fim por repouso (<0,08 m/s por 2 s) ou 45 s (2700 passos).
- Peças MVP runtime (`SimBuilder.cs`): Comum 0,40×0,80×0,12/0,5 kg, Pesada
  0,45×0,80×0,20/2 kg, Rampa cinemática provisória; Soldado (base+corpo+cabeça,
  1 kg, COM 0,25 m). Primitivas + visuais built-in provisórios (geradores fiéis na T2).
- Knock (§6): tilt >50° por >0,5 s, queda do plano (KillY −5) e impulso ≥0,25 N·s.
  Morte por impacto arremessa o corpo (janela 0,35 s, força ∝ impulso) — encadeia
  soldado→soldado.
- `SimRecording` + `SimSerializer` (binário quantizado 1 mm/quat-16 bit, ordem por id,
  GZip) + hash SHA256; `SimPlayer` (réplicas cinemáticas + interpolação).
- Golden: `Assets/Topple/Tests/PlayMode/Golden/cascade-v1.bin` (16.494 bytes).

## Critério de aceite (verificado por execução)
- [x] 500 peças + 20 inimigos, 45 s de jogo (2700 passos) em **1,19 s** de relógio
      headless (limite: 10 s). Gravação: **8.638 bytes** (estimativa §9/§17: ~1–2 MB).
- [x] Mesma seed/build repete byte a byte (`determinism bytesA=16494 bytesB=16494`,
      golden `61a6e5d76f18` estável entre runs).
- [x] Cascata simples (12 comuns, onda a 19 passos/peça constantes) derruba os
      3 soldados esperados (`events=3 knocked=3`).
- [x] EditMode 8/8 (regras, RNG, layout JSON, roundtrip binário).

## Calibragem (detalhes em `docs/open-questions.md`)
Atrito 0,75; `sleepThreshold` 0,01; limiar de impacto 0,25 N·s; repouso 0,08 m/s.
Achados: gatilho deve girar no lugar (empurrar a base desliza); peças de 0,8 m
caem a ~0,03 m/s (0,05 as congelava); contato persistente come velocidade única
(janela reafirmada); soldados colados se escoram (espaçar ≥0,6 m).
