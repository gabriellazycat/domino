# Cabeças do dono da mesa: teste IA → 3D (iniciado em 12/nov/2026, à noite)

Pedido: gerar variações de cabeça do vilão da mesa (o boneco de ventríloquo de `web/src/game/backdrop.ts`),
tendo como referência a foto de um boneco de ventríloquo e uma marionete de madeira entalhada. Vários estilos e
modelos de IA, tudo local, para o designer escolher depois. **Nada no código do jogo foi alterado.**

## Como ver
```
python -m http.server 8792 --bind 127.0.0.1 -d "C:/Users/gabri/Desktop/domino/arte_ia/cabecas_dono"
```
Depois abra http://127.0.0.1:8792/galeria/. Use a ★ para marcar favoritas e "Listar favoritas" para copiar.

## Como continuar / refazer
`bash arte_ia/cabecas_dono/fila.sh`: roda a fila inteira e pula o que já existe. Precisa do ComfyUI no ar
(`C:\AI\ComfyUI\venv\Scripts\python main.py --listen 127.0.0.1 --port 8188 --lowvram`).

## Pipeline
1. **Concept 2D** (`_tools/conceitos.py`): Qwen-Image 2.1 Turbo ou Krea 2 Anime, já instalados para o LastBoss.
   Cabeça de frente, centrada e em fundo cinza liso, que é o que a conversão para 3D quer.
   6 personagens originais: entalhado, rachado, marionete, cavalheiro, palhaço, apostador.
   3 estilos: `foto` (realista), `jogo` (render estilizado), `pintado` (pintura).
2. **Imagem → 3D** (`_tools/img3d.py`, só com nós nativos do ComfyUI, sem plugin):
   - **TRELLIS.2** (MIT): forma + textura PBR em UV, malha reduzida para cerca de 40k triângulos, textura de 2048 px.
     Grafo = template oficial `3d_pixal3d_trellis2_image_to_model` com o switch em Trellis2.
   - **Hunyuan3D-2mini** (licença Tencent Hunyuan Community): só forma. A cor vem de `_tools/colorir.py`,
     que projeta o concept pela frente e pinta a nuca com a cor da borda.
3. **Galeria** (`_tools/galeria.py` → `galeria/dados.json` + `galeria/index.html`, com model-viewer).

## Decisões que tomei sem perguntar (você disse que estaria fora e autorizou tudo)
- Pulei a rodada de perguntas da grilling (você ficou AFK). As escolhas abaixo são minhas.
- **Não copiei o Benson (Toy Story 4).** A foto serviu só como referência do gênero "boneco de ventríloquo";
  os 6 personagens são originais.
- Modelos baixados (repositórios oficiais Comfy-Org e tencent, só arquivos `.safetensors`):
  birefnet (0,42 GB), trellis_2 shape/texture VAE (1,1 + 0,95 GB), dino_v3_L (1,2 GB),
  trellis_2_int8_convrot (5,25 GB), hunyuan3d-dit-v2-mini fp16 (3,82 GB). Total ≈ 13 GB.
- **Não baixei** o Hunyuan3D 2.1 (7,4 GB), o Pixal3D (5,6 GB + MoGe) nem o TripoSplat (3,3 GB): o disco C: tinha só
  19 GB livres (98% cheio). Dá para testar depois, se você liberar espaço.
- Não usei geradores pagos/na nuvem (Rodin, Meshy, Tripo) para não gastar seus créditos.
- Instalei `trimesh` (PyPI) no Python 3.9 do sistema, só para ler e pintar as malhas.
- O ComfyUI é compartilhado com a geração de cartas do LastBoss, que estava rodando ao mesmo tempo. Meus pedidos
  entram na mesma fila, então as cartas atrasaram um pouco.
- Concepts em 768×768 (mais rápido; o recorte para 3D usa 1024 px de qualquer forma).

## Riscos / o que ainda não foi feito
- As cabeças **não estão ligadas ao jogo**. A atual tem olhos que seguem o cursor e o queixo articulado; uma malha de IA
  vem em uma peça só. Para usar no jogo seria preciso separar o queixo e trocar os olhos por esferas animadas
  (Blender), ou usar a IA só como base de forma e textura.
- O Hunyuan3D-2mini ficou **só com a forma** (cinza). A malha sai girada cerca de 45° e com a base do pescoço rasgada,
  então a cor projetada do concept caía na bochecha. Por isso parei de colorir (o `_tools/colorir.py` ficou fora da fila).
  O TRELLIS.2 é a opção principal: já sai com textura.
- O TRELLIS.2 previu metal na pele pintada, e a cabeça renderizava quase preta. O `_tools/ajustar.py` zera a
  metalicidade e guarda o GLB original em `modelos/trellis2/bruto/`.
- O concept "palhaço" (cabelo verde, rosto branco, boca vermelha) lembra um pouco o Coringa. Se for usar,
  troque a cor do cabelo.
- Pastas novas sem commit: `arte_ia/cabecas_dono/` (nenhum arquivo do jogo foi mexido).

## Estado
(atualizado ao fim de cada etapa: veja o fim do arquivo)

### Estado em 13/nov/2026, 10h45: PARADO a pedido
Fila interrompida pelo usuário. Feito: 18 concepts 2D (6 personagens × foto/jogo/pintado), 8 cabeças TRELLIS.2
(6 foto + apostador e cavalheiro no estilo jogo) e 6 Hunyuan3D-2mini (só forma). Ficaram sem 3D: 4 concepts "jogo"
e os 6 "pintado". Para completar depois: `bash fila.sh` (pula o que já existe; ~1 h por cabeça TRELLIS.2).
A tarefa agendada `domino-cabecas-retomar` já rodou e está desativada.

### 13/nov/2026: execução agendada `domino-cabecas-retomar` (PAUSADO, não concluído)
**Parado a pedido do Gabriel** (repassado pela sessão das cartas do Last Boss às ~11:06): "cancelei o entalhado,
foque só em terminar as cartas" e "não é para rodar mais nada do entalhado". A GPU fica só para as cartas.
**Não reinicie `fila.sh` nem mande jobs ao ComfyUI até ele liberar.** Não há processo do dominó rodando nem job na fila.

Gerado até agora (galeria reconstruída: 18 concepts, 14 modelos 3D; `galeria/dados.json` ok):
- Concepts: 18/18 (6 Qwen foto, 6 Qwen jogo de 204 a 282 s cada, 6 Krea pintado de 79 a 123 s cada).
- TRELLIS.2: 8 de 18 previstos. Foto: 6/6 (39 a 69 min cada no ComfyUI). Jogo: apostador (71 min) e cavalheiro (59 min).
  Faltam entalhado/marionete/palhaço/rachado (jogo) e os 6 pintados.
- Hunyuan3D-2mini (foto): 6/6 (3,2 a 4 min cada), só forma.

Falhas e correções (só em `arte_ia/cabecas_dono`):
- 3 TRELLIS.2 (apostador, cavalheiro, palhaço) deram TimeoutError no script, que tinha limite de 1 h, mas terminaram no
  ComfyUI (65 a 70 min, por causa da fila dividida com as cartas). Recuperei os GLBs do histórico. `img3d.py` agora espera
  até 4 h e ganhou `--recuperar PROMPT_ID`, que baixa o GLB de um job já terminado. Os tempos no index.json vêm do ComfyUI.
- Bug no `fila.sh`: o glob `*__s2026.png` dos passos 2 e 3 também pegava os concepts estilizados. Agora usa a lista
  explícita dos 6 concepts foto. Também espera o ComfyUI voltar (até 30 min) antes de cada etapa.
- O ComfyUI foi reiniciado pela sessão das cartas às 10:43 e às 11:02. O job do entalhado (jogo) se perdeu, e as
  rodadas da fila ligadas ao harness morreram sem escrever erro.

Qualidade (olhei a galeria): os concepts são cabeças inteiras, de frente, em fundo liso. O TRELLIS.2 sai com textura e
cores coerentes (tapa-olho, monóculo e bigode, nariz vermelho, cabelo verde do palhaço). O Hunyuan fica fiel na forma.
**Problema:** cada malha tem a frente num ângulo diferente (o TRELLIS.2 costuma ficar a 90° ou 270°, o Hunyuan a ~45°).
Na galeria isso passa por causa da rotação automática, mas no jogo cada malha precisaria ser girada.

Para retomar (só quando o Gabriel liberar): `bash arte_ia/cabecas_dono/fila.sh`, que é idempotente. Se for pular o
entalhado, mova `conceitos/entalhado__*` dos estilos jogo e pintado para fora antes de rodar.
