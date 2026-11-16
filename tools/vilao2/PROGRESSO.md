# Vilão da mesa v2: 6 variações para comparar (iniciado em 16/nov/2026)

Pedido: o vilão atual (backdrop.ts) é feio, sem textura e feito de formas simples empilhadas. Fazer variações
bem feitas que combinem com o jogo. Decidido na conversa (grilling):
- mesmo conceito (boneco de ventríloquo pendurado por cordas), **6 variações só para comparar**, o jogo não muda;
- 2 por técnica: **Blender** (A, B), **código** (C1, C2), **IA + Blender** (IA-A, IA-B, só malhas TRELLIS já existentes, sem GPU);
- direções: A = entalhado-cavalheiro, B = rachado-sinistro (monóculo, dente de ouro, bigodinho).

## Como ver
- Servidor de dev (`npm --prefix web run dev`) e abrir `http://localhost:5173/?vilao=A` (ou B, C1, C2, IA-A, IA-B).
  Sem `?vilao=` o jogo fica igual. Os GLB ficam em `web/e2e/vilao-lab/` (só o dev server serve; não entra no build).
- Prints: `node web/e2e/lab.mjs vilao atual A B C1 C2 IA-A IA-B` → `web/e2e/shots/lab-vilao-*.png`.

## Blender (A, B)
`"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/vilao2/vilao2.py -- A` (≈2,5 min; `draft` = 512 px, `geo` = só forma)
- Forma: SDF em numpy (união suave de elipsoides/cápsulas, órbitas subtraídas) → raios a partir do centro → remesh voxel
  → suavização → projeção de volta na superfície exata. Cabelo é outro SDF (casca + linha do cabelo + sulcos).
- Pintura (`paint.py`): assa posição/normal/curvatura/AO num atlas 2K e pinta em numpy; relevo vira normal map assado.
- Peças animadas no GLB: Jaw (pivô na dobradiça), Eye_L/R (pupila em +Z), Lid_L/R (pivô no centro do olho).

## Integração de laboratório (não muda o padrão)
- `web/src/game/backdrop.ts`: método novo `adoptModel()` (troca a cabeça e liga olhos/pálpebras/queixo).
- `web/src/game/vilaoLab.ts` (lê `?vilao=`), `web/src/game/vilaoCodigo.ts` (C1/C2), 1 linha em `world.ts`.
- Rachaduras por fase (`setCrack`) não alcançam os modelos novos: custo de integração a resolver depois da escolha.

## IA + Blender (IA-A, IA-B)
`blender -b --python tools/vilao2/ia.py -- IA-A` (e IA-B). Base: `cavalheiro__qwen21t__jogo` e `rachado` (TRELLIS.2 já gerados,
nada rodou na GPU). Limpeza: escala/centro, metal zerado, órbitas abertas com olhos de vidro + pálpebras, queixo cortado.
Medidas de boca/olhos em `ia.py` (HEADS), tiradas de `out/ia-preview/medir.png`.

## Código (C1, C2)
`web/src/game/vilaoCodigo.ts`: o mesmo SDF calculado no navegador + pintura 100% em shader (sem arquivo de textura).

## Estado (16/nov/2026)
- [x] As 6 prontas e funcionando no jogo (olhos seguem, pálpebra pisca, queixo fala).
- Folhas: `web/e2e/shots/vilao-comparacao.png` (no jogo, com a atual) e `web/e2e/shots/vilao-renders-blender.png`.
- Pendências conhecidas (custo de integração da escolhida):
  - nas 6, a sobrancelha que se mexe na raiva e a inclinação da pálpebra se perdem (estão pintadas), e as rachaduras
    por fase (`setCrack`) não alcançam o modelo novo;
  - IA-B: a pálpebra não aparece ao piscar (fica dentro da órbita) e o queixo corta abaixo do lábio de baixo;
  - IA-A/IA-B ficam mais escuras no jogo que no render do Blender (a textura da IA é escura sob a luz de vela);
  - C1/C2 levam ~1-2 s montando a malha no navegador; não há vista de perfil delas (só de frente, no jogo);
  - GLBs de 8 a 18 MB (PNG 2K; dá para virar JPG/KTX2 na escolhida).
- Nada commitado.

## Rodada 2: A em linguagem "brinquedo" (16/nov/2026)
Dono escolheu o A, mas ele destoava dos dominós e soldadinhos (realismo, sardas, íris, goiva fina). Decidido:
vilão vira brinquedo (mexe só nele), forma simplificada + contorno de luz dos inimigos; mostrar as 2 opções de
olho e de pintura. Variantes `T1` (bola + laca), `T2` (traço dos dominós + laca), `T3` (bola + madeira suave):
`blender -b --python tools/vilao2/vilao2.py -- T1` → `out/T1/`, copiar `vilao-T1.glb` para `web/e2e/vilao-lab/T1.glb`.
Forma: `head_sdf_toy` (cabeçudo, nariz de bolinha, cabelo em 4 gomos); pintura: `paint_face_toy`/`paint_body_toy`;
contorno: `addRim` em `vilaoLab.ts` (só para T*). Folha de renders: `out/T-renders.png`.
- `T4` (pedido 16/nov): corpo do T1 + olho 2D de vórtice preto (shader em `vilaoLab.ts`, `vortexEyes`). O olho não gira;
  o desenho reage: centro segue o olhar, deboche = giro lento + ponto aceso, raiva = giro rápido em brasa, susto = pupila branca.
- `T5A/T5B/T5C` (pedido 16/nov): base `T5` (Blender, T1 sem sobrancelha pintada) + `web/src/game/vilaoMarionete.ts`:
  sobrancelhas 3D que mexem (raiva franze, susto sobe, deboche ergue uma) presas em fio; cordas de barbante com ilhós
  saindo de pontos achados por raio na superfície e subindo inclinadas para uma cruzeta fora do quadro
  (`stringsCrossing(root)` = 0 cruzamentos); vórtice de partículas desenhadas saindo do olho: A tinta, B faíscas, C rabiscos.
- `T6A/T6B` (pedido 16/nov): olho 2D sem bola e sem pálpebra (nunca fecha), vórtice de partículas ENTRANDO que vira o
  próprio olho (`web/src/game/vilaoOlho2d.ts`). Expressão pela forma do desenho. A = decal na superfície (órbita), vazio
  preto com brilho; B = folha 2D por cima do rosto, traço de nanquim (aro, miolo creme, pupila-vórtice). Base T5 + marionete.
- T6A ajustado (16/nov, pedidos do dono): miolo só preto e fosco (sem brilho/cor), sem cerrar no deboche, olho do
  tamanho de um olho normal; a película (`skinPatch` + `litPaint`, com luz) tampa a órbita com cor de pele e o olho é
  pintado por cima, rente ao rosto. Na raiva o olho ainda ganha o corte inclinado.
- `T7A/T7B/T7C` (pedido 16/nov): opções de cabelo sobre o T6A (Blender, `hair_col`/`hair_lines` em vilao2.py/paint.py):
  A preto lambido, B topete castanho, C pintado rente. Com `?vilao=T6A` ou `T7*` os inimigos também ganham o olho de
  vórtice (`VORTEX_ENEMY_EYES` em `web/src/game/enemyFaces.ts`: atlas sem olhos + calota de shader). Print novo no lab:
  `lab-vilao-<id>-inimigos.png` (soldadinhos virados para a câmera só no print).

## Rodada 3 (16/nov/2026): T7B no jogo + 10 trajes — feito com o dono fora (sem perguntas)
Decisões que tomei no lugar do dono (revisar):
- **T7B é o vilão padrão** (sem parâmetro). GLB leve em `web/src/assets/vilao.glb` (2,6 MB: malha simplificada e
  texturas JPEG 1K/512 por `tools/vilao2/export_jogo.py`). Carrega em segundo plano; a cabeça antiga segura o lugar.
  `?vilao=<id>` continua sendo o laboratório; `?vilao=atual` mostra a cabeça antiga.
- **Inimigos com olho de vórtice por padrão** (`VORTEX_ENEMY_EYES`); no laboratório só com T6A/T7*.
- **Rachaduras por fase** levadas ao modelo novo em shader (voronoi no rosto, clarão laranja ao rachar).
- **10 trajes** em peças de laca no código (`web/src/game/vilaoTrajes.ts`): banqueiro, vidente, mágico, palhaço, juiz,
  coveiro, capitão, chef, inventor, rei. Paletó e gravata recoloridos por shader no material do corpo.
- **Troca nos eventos** (como a troca de máscara): as cordas puxam o boneco para fora do quadro e ele desce trocado.
  Mapa PROVISÓRIO em `game.ts` (`TRAJE_DO_EVENTO`): loja = banqueiro, místico = vidente, prensa = inventor,
  presente do dono = mágico. Nas fases volta ao T7B. `?traje=<id>` trava um traje (prints/escolha).
- Chapéus escondem o cabelo (o topete furaria a copa). As cordas da coroa saem do topo do chapéu; as das sobrancelhas
  inclinam até passar livres da aba (`segmentClear`); `stringsCrossing` = 0 nos 10.
Riscos: a troca roda em requestAnimationFrame (pausa com a aba escondida, termina quando volta); trajes não testados
num evento real de ponta a ponta (testado: setCostume no meio da fase com Playwright). Nada commitado.

## Rodada 4 — trajes escolhidos, polimento, troca que cai e mãos por traje (2026-11-16)

Escolha do dono da ideia (página `web/e2e/vilao-trajes/`): loja = banqueiro, místico = vidente, prensa = coveiro,
presente do dono = palhaço (`TRAJE_DO_EVENTO` em `web/src/game/game.ts`). Decidido no grilling:

- **Material**: o boneco inteiro (cabeça, corpo, trajes) passou de laca brilhante ("bola de bilhar") para tinta
  acetinada sobre madeira: `addWood`/`madeira` em `vilaoLaca.ts` (aspereza mínima 0,62, veio de anéis + fibras no
  espaço do objeto escurecendo até 24 %; metal só perde brilho). A película do olho 2D acompanha (aspereza 0,62).
- **Encaixe** (medido no modelo por raios: crânio 1,2; raio na altura 0,74 ≈ 0,72–0,8; lóbulo em x ±0,88, y -0,12,
  z -0,1): chapéu do palhaço afundado no crânio com babado na base; argolas da vidente atravessando o lóbulo;
  cartola do coveiro mais larga (o crânio furava a copa) e fita de crepe por fora da nuca; cartola do banqueiro
  assentada. Os outros 6 trajes ficaram como rascunho no laboratório.
- **Troca**: as cordas do boneco que sai afrouxam (o alto de cada fio desce para perto do ponto de amarração),
  ele dá um tranco e despenca girando para trás da mesa; o outro desce do escuro e quica. Vale também na volta ao
  dono normal. Tempo contado quadro a quadro com teto (um quadro travado não engole a queda).
- **Mãos**: a mão que varre a mesa veste o traje de quem está na mesa (`Hand.dress`, chamado em `startTransition`):
  banqueiro (manga verde, punho branco, sinete e abotoadura de ouro), vidente (manga vinho, quatro anéis com pedras,
  três pulseiras), coveiro (luva preta, manga preta com faixa de luto), palhaço (luva branca de desenho com punho
  bufante e pespontos, manga amarela com punho azul). Ao entrar no evento varre a mão normal; ao sair, a do traje.
- **Desempenho**: cada montagem gastava ~9 s recalculando a película do olho por raios (a troca antiga escondia o
  travamento fora do quadro). Agora a película é calculada uma vez por geometria de cabeça e reaproveitada.

Ferramentas novas: `node e2e/lab.mjs giro <ids>` (boneco girando, para conferir encaixe), `trajes` (fluxo real dos
4 eventos, com checagem de traje/mão/volta) e `maos` (a mão de cada traje pousando).

Riscos: a película em cache assume que a geometria da cabeça não muda entre montagens (verdade com o GLB atual);
a animação continua pausando com a aba escondida.
