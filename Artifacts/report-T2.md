# TOPPLE — report-T2 (Geradores de assets)

## Entrega (GDD §15.4 T2 + §13)
- `ArtBible` (`Assets/Generated/ArtBible.asset`): paletas Vila/peças, smoothness,
  chanfro 0,01 — nenhum gerador tem cor fixa.
- Texturas (`Assets/Generated/Textures/`, 3,38 MB « 64 MB): atlas 28 faces
  1792×2048 por skin, faces Comum 6|6 / Pesada 2 pips / Rampa seta (SDF com AA),
  grama/terra/pedra/madeira 512² tileáveis (fBm periódico).
- Malhas: caixa chanfrada (~192 tris) + cunha; pivô na face inferior, escala 1.
- Prefabs (`Assets/Generated/Prefabs/`): `piece_common/heavy/ramp`, `enemy_soldier`
  (base Ø0,50 + cápsula + esfera + capacete), `field_table` — Rigidbody, colliders
  primitivos, `PieceView`/`EnemyView` com `visualId`.
- URP ativo via `UrpSetup` (Pipeline Asset + Renderer gerados, atribuído).
- Áudio (`Assets/Generated/Audio/`, WAV 44,1 kHz/16-bit/mono): 8 cliques, pesado,
  queda, UI — pico −3 dBFS, sem clip.
- Previews: 5 prefabs × 3 ângulos + `contact-sheet.png` em `Artifacts/previews/`
  (silhuetas e cores distinguíveis em thumbnail).

## Critério de aceite (verificado por execução)
- [x] Idempotente: 2× `GenerateAll` → 39 arquivos, **zero diffs** de hash.
- [x] `contact-sheet.png` gerada e revisada (faces com pips legíveis).
- [x] Zero refs quebradas (`ScanBrokenRefs` = 0; falha o build se >0).
- [x] EditMode 15/15 (determinismo ruído/SDF/áudio/WAV). T1 sem regressão:
      PlayMode 4/4, golden `61a6e5d76f18` idêntico.
- [x] `GenerateAll` em ~9 s (limite: 10 min).

## Incidentes (detalhes em `docs/open-questions.md`)
Magenta = URP inativo; winding invertido na caixa; `m_Script` nulo por 2
MonoBehaviours/arquivo; `Mathf.SmoothStep` não é máscara 0-1 (bug das faces pretas).
