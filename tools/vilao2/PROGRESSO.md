# Vilão da mesa (tools/vilao2)

O vilão do jogo é a variante **T7B**: um boneco de ventríloquo em linguagem de brinquedo, com topete castanho. As outras variantes de comparação (A, B, C1, C2, IA-A, IA-B, T1–T7A/C) e o laboratório `?vilao=` foram removidos em 2026-11-24 e estão no histórico do git (commit 7972fe1).

## Como o modelo do jogo é gerado
1. Gerar o modelo em alta, que cria `out/T7B/vilao-T7B.blend`:
   `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/vilao2/vilao2.py -- T7B`
   - A forma é um SDF em numpy, convertido em remesh voxel (`head_sdf_toy`). A pintura é assada num atlas (`paint.py`).
2. Exportar a versão leve para o jogo, que cria `web/src/assets/vilao.glb` (malha simplificada, JPEG 1K/512):
   `blender -b tools/vilao2/out/T7B/vilao-T7B.blend --python tools/vilao2/export_jogo.py -- web/src/assets/vilao.glb`

Peças animadas no GLB: Jaw (pivô na dobradiça), Eye_L/R e Lid_L/R.

## No jogo
- `vilaoOficial.ts` carrega o GLB e monta o boneco com:
  - sobrancelhas 3D presas em fio e cordas até a cruzeta (`vilaoMarionete.ts`);
  - olho 2D de vórtice, que nunca fecha (`vilaoOlho2d.ts`);
  - tinta acetinada sobre madeira (`vilaoLaca.ts`);
  - rachaduras por fase feitas em shader.
- Os inimigos usam o mesmo olho de vórtice (`enemyFaces.ts`).
- Trajes por evento (`vilaoTrajes.ts`, mapa `TRAJE_DO_EVENTO` em `game.ts`): loja = banqueiro, altar = vidente, prensa = coveiro, presente = palhaço.
- A troca de traje: o boneco despenca e o outro desce do escuro. A mão que varre a mesa veste o traje (`Hand.dress`).
- Para conferir: `node web/e2e/lab.mjs giro|trajes|maos` com o dev server rodando.
- Limitações conhecidas:
  - a película do olho fica em cache por geometria de cabeça;
  - a troca de traje roda em requestAnimationFrame e pausa com a aba escondida.
