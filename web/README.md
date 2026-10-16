# TOPPLE — versão web

Remake do TOPPLE (ideia e GDD originais do Gamonga) rodando direto no navegador:
**Three.js** (gráficos) + **Rapier** (física) + **TypeScript** + **Vite**.
Todo o visual e todo o som são gerados por código — nenhum arquivo de arte ou áudio.

## Rodar

Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd web
npm install
npm run dev        # abre em http://localhost:5173
```

No Windows dá pra dar dois cliques em `Jogar.bat` (instala na primeira vez e abre o jogo).

Outros comandos:

| comando | o que faz |
| --- | --- |
| `npm run build` | build de produção em `dist/` (dá pra hospedar em qualquer site estático, ex. GitHub Pages) |
| `npm run preview` | serve o build em http://localhost:4173 |
| `npm test` | testes de física + bot (o bot resolve os tutoriais e uma bateria de fases geradas) |
| `npm run e2e` | teste de fumaça no Chrome com screenshots em `e2e/shots/` |
| `node e2e/human.mjs` | simula um jogador de verdade com o mouse (arrastar, desfazer, vencer, draft) |

## Como jogar

1. **Clique** na bandeira verde e mova o mouse: uma trilha fantasma mostra onde as peças vão.
   **Clique no chão** para colocar a trilha de uma vez. Para continuar, clique numa ponta (anel brilhante) e repita. Curvas fechadas demais não valem.
2. **Sua mão:** a cada fase as suas peças são misturadas numa **caixa** e você pega **7** por vez, sem olhar
   (elas ficam vivas no leque embaixo). Só dá para colocar o que está na mão. Usou tudo? Você pega mais
   sozinho. **Nova mão** (`D`) joga o resto no pote de descarte e pega mais. Ao pegar, as peças já
   colocadas ficam fixas na mesa.
3. **DISPARAR!** (ou `Enter`) — o primeiro dominó cai e a onda corre pela corrente.
4. Derrube todos os soldadinhos. Cada sobrevivente tira 1 de vida. Você tem 3 tentativas por fase:
   errou, a fase recomeça do zero com todas as peças misturadas de novo na caixa.
5. Ganhe ouro (estrelas = usar até o "par" de peças + acertar de primeira) e escolha 1 de 3 peças novas
   depois de cada fase. A cada 5 fases tem um **General** (chefe).
6. **Eventos entre as fases** (montados em 3D na mesa vazia; você compra ou vai embora): 40% de chance
   depois de cada fase, subindo +20% a cada fase sem evento; nunca dois seguidos nem o mesmo tipo em sequência.
   - **Loja** — peças, remédio (+3 vida), vela (+1 tentativa na próxima fase), **quebrar peça** na bigorna
     (caixa mais enxuta) e o sininho que troca a mercadoria.
   - **Prensa de Selos** — escolha um carimbo e a peça que vai recebê-lo (até 2 selos por peça):
     **Guardada** (não vai para o descarte), **Dupla** (vale por 2 na trilha), **Sortuda** (traz mais uma
     peça ao sair da caixa), **Primeira** (sempre na primeira mão), **Dourada** (+3 de ouro por fase vencida).
   - **Altar Místico** — bênçãos para a run inteira: **Mão Grande** (+1 peça por mão), **Fôlego**
     (+1 tentativa), **Vigor** (+3 vida máx.), **Avareza** (+30% de ouro), **Vidente** (mostra a próxima
     peça da caixa) e **Reciclagem** (a primeira Nova mão devolve as sobras para a caixa).

Peças: **Comum**, **Pesada** (derruba brutamontes), **Grande** (pula lava e vãos), **Torre**,
**Explosiva** (TNT, explode em área), **Corredora** (é lançada para frente) e **Bifurcação**
(divide a corrente em duas).

Controles: `1–7` troca a peça · `D` nova mão · botão direito remove a ponta · `Ctrl+Z` desfaz o traço · `R` limpa a mão atual ·
câmera: botão direito/meio arrasta, roda = zoom, `WASD` move · `Esc` pausa.

## Por que web?

O projeto Unity original (que continua intacto na raiz do repositório) precisa do Unity 6 instalado
e logado para abrir. A versão web roda em qualquer computador com um navegador, carrega em segundos,
pode ser publicada como site e é fácil de mexer: é só editar um `.ts` e o jogo recarrega na hora.

## Arquitetura

```
src/
  core/      regras puras, sem gráficos (testáveis)
    rules.ts     constantes do jogo (vida, deck inicial, preços, loja, chefe…)
    pieces.ts    os 7 tipos de peça e o baralho
    mapgen.ts    gerador procedural de fases (mesma seed = mesmo mapa)
    layout.ts    desenho da corrente (curvas, bifurcação, lava)
    bot.ts       planejador automático (A*) usado pelos testes e pela demo do menu
    run.ts       estado da run + auto-save (localStorage)
    rewards.ts   draft 1-de-3
    cards.ts     peças únicas da caixa e os selos (kind = tipo + selos)
    buffs.ts     bênçãos do altar místico
    events.ts    sorteio dos eventos entre as fases e ofertas (selos, bênçãos)
    draw.ts      a caixa de peças da fase (misturar, pegar, descartar)
  game/      tudo que aparece na tela
    sim.ts       simulação física (Rapier)
    solver.ts    roda simulações sem tela para achar um plano que vence
    world.ts     renderer, lâmpada pendurada (feixe volumétrico + poeira), velas com brasas, mesa,
                 pós-processamento (MSAA, oclusão de contato GTAO, bloom, onda de choque, CRT)
    backdrop.ts  redemoinho de tinta no fundo + o "dono da mesa" (olhos brilhando no escuro)
    models.ts    dominós, soldadinhos assombrados, muros, lava (tudo procedural)
    faces.ts     rostos 2D dos dominós e suas reações (medo, grito, tontura…)
    hand.ts      a mão que varre o tabuleiro entre as fases
    handrender.ts  a mão de peças em 3D: os mesmos dominós e rostos do tabuleiro e a caixa
    events.ts    os eventos 3D (loja, prensa de selos, altar místico): cena, clique, etiquetas, animações
    props.ts     objetos 3D procedurais dos eventos (prensa, carimbos, bigorna, frasco, altar, emblemas…)
    sigils.ts    desenhos dos selos (carimbo de tinta) e ícones das bênçãos
    fx.ts        partículas, textos "POW!", brasas, explosões
    decals.ts    marcas na mesa da fase: respingo de tinta onde o inimigo tomba, queimado de explosão
    audio.ts     efeitos e música sintetizados (WebAudio): reverb de sala gerada por código,
                 posição estéreo pela coluna do tabuleiro, ambiente de sala, coração antes do disparo
    camera.ts    câmera orbital + tremida
    game.ts      controlador: planejamento, disparo, resultado, draft, loja
  ui/ui.ts   HUD e menus (HTML/CSS)
  ui/handview.ts  a mão: caixa de peças, suporte, pote de descarte e as animações entre eles
tests/     testes (vitest)
e2e/       testes no navegador (Chrome via Playwright)
```
