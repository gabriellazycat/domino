#!/usr/bin/env bash
# Fila completa do teste "cabeças do dono da mesa". Idempotente: pula o que já existe.
# Uso: bash fila.sh   (roda tudo e reconstrói a galeria; log em fila.log)
set -u
cd "$(dirname "$0")/_tools" || exit 1
C=../conceitos
log(){ echo "[$(date '+%F %T')] $*"; }
# Só os concepts "foto" (nome__s2026.png). O glob antigo *__s2026.png também pegava os estilizados
# (nome__modelo__estilo__s2026.png) e mandava todos para TRELLIS.2/Hunyuan nos passos 2 e 3.
FOTO=""; for n in entalhado rachado marionete cavalheiro palhaco apostador; do FOTO="$FOTO $C/${n}__s2026.png"; done
# O ComfyUI é compartilhado com o LastBoss e às vezes é reiniciado no meio: espera até 30 min ele voltar.
comfy(){ for i in $(seq 1 180); do curl -s -m 5 -o /dev/null http://127.0.0.1:8188/queue && return 0; sleep 10; done
         log "ComfyUI fora do ar há 30 min"; return 1; }

log "1) concepts Qwen foto"
comfy && python conceitos.py --model qwen21t --style foto
log "2) TRELLIS.2 nos concepts foto"
comfy && python img3d.py $FOTO --model trellis2
python ajustar.py
log "3) Hunyuan3D-2mini nos concepts foto"
comfy && python img3d.py $FOTO --model hunyuan
log "4) concepts estilizados (Qwen jogo, Krea pintado)"
comfy && python conceitos.py --model qwen21t --style jogo
comfy && python conceitos.py --model krea2anime --style pintado
log "5) TRELLIS.2 nos estilizados"
comfy && python img3d.py $C/*__qwen21t__jogo__*.png $C/*__krea2anime__pintado__*.png --model trellis2
python ajustar.py
log "6) galeria"
python galeria.py
log "fim"
