# DOMINOTION — como o jogo funciona hoje

Este é o design atual, conferido no código. **Os números não ficam aqui:** cada seção aponta o arquivo que guarda os valores (caminhos relativos a `web/src/`). Se este texto e o código discordarem, vale o código, e este doc deve ser corrigido.

## A run
- A run é infinita, de fase em fase, e termina quando a vida chega a 0. O progresso é salvo sozinho no navegador (`core/run.ts`).
- A primeira fase é um tutorial fixo. As outras são geradas por seed (`core/mapgen.ts`).
- A cada N fases vem um chefe, o **General** (`RULES.bossEvery` em `core/rules.ts`).

## Uma fase
1. **Montar.** Clique na bandeira de gatilho, ou numa ponta brilhante de uma trilha já posta. Uma trilha fantasma segue o mouse, e um clique no chão coloca a trilha inteira. Curvas fechadas demais são recusadas. O botão direito tira a última peça de uma ponta, e `Ctrl+Z` desfaz o traço inteiro (`game/game.ts`, `core/layout.ts`).
2. **A mão.** As peças da run vão para uma **caixa** embaralhada, e você pega uma mão de tamanho fixo (`RULES.handSize`). Só dá para colocar o que está na mão.
   - Quando a mão acaba, você pega mais sozinho.
   - **Nova mão** (`N`) joga as sobras no descarte e pega outra mão.
   - O que já está na mesa fica fixo (`core/draw.ts`, `ui/handview.ts`).
3. **Disparar.** O botão DISPARAR, `Enter` ou `Espaço` derrubam a primeira peça e a onda corre pela corrente.
4. **Resultado.**
   - **Venceu** (todos os inimigos caíram): ganha estrelas, ouro e o draft.
   - **Sobrou inimigo, com tentativas restantes:** escolha entre **Recomeçar** (a fase volta do zero e a caixa é embaralhada de novo) ou **Desistir**, que custa vida por sobrevivente.
   - **Sem tentativas:** o dano é aplicado direto.
   - **Fase perdida:** ainda dá um pouco de ouro e um draft de consolo.
   - Valores: `RULES` e `goldFor` em `core/rules.ts`. Fluxo: `game/game.ts`.

**Estrelas:** 1 por vencer, +1 por usar até o **par** de peças, +1 por vencer na primeira tentativa. O par é calculado pelo tamanho da rota (`core/mapgen.ts`).

**Ouro:** base mais um tanto por estrela, um bônus no chefe e um bônus de combo (`goldFor`). Também entram a bênção Avareza e o selo Dourada.

**Draft:** escolha 1 entre 3 pacotes de peças, todos da mesma raridade (comum, rara ou épica). Dá para trocar as opções pagando ouro (`core/rewards.ts`, `RULES.draftRerollCost`).

## Peças (`core/pieces.ts`; movimento em `core/motion.ts`)
| Peça | O que faz |
|---|---|
| Comum | O dominó básico. |
| Pesada | Derruba Brutamontes e General de uma vez. |
| Torre | Alta: cai longe e esmaga Brutamontes. |
| Explosiva | Explode ao tocar um inimigo e derruba tudo em volta. |
| Foguete | Corre pelo chão atropelando, quica nos muros, e a corrente continua de onde ele parou. |
| Saltadora | Ao cair, salta por cima de muros e rondas; a próxima peça nasce do outro lado. |
| Bifurcação / Trifurcação | Uma carta vira 2 ou 3 meias-peças, e a corrente se divide. |

**Peças malditas** (vêm só do Presente do Dono): Teimosa, Torta, Capanga, Andarilha e Ciumenta. Enquanto uma maldita estiver na mão, a **Nova mão fica travada** até ela ir para a mesa.

O deck inicial está em `RULES.starting*`.

## Inimigos (`core/mapgen.ts`: tipos, vida `ENEMY_HP` e a partir de que fase aparecem; comportamento em `game/sim.ts` e `core/archer.ts`)
- **Soldado:** 1 golpe.
- **Brutamontes:** aguenta mais golpes; a Pesada e a Torre derrubam de uma vez.
- **Patrulha:** anda numa rota e derruba as peças em pé que estiverem no caminho.
- **Tocheiro:** uma patrulha que queima as peças em pé.
- **Ogro:** uma patrulha grande que esmaga peças e aguenta vários golpes. Quando cai, cai como um dominó gigante.
- **Arqueiro:** a primeira peça que entrar no raio dele leva uma flecha de fogo, e a seguinte queima junto. Não dá para continuar a corrente a partir dela.
- **General:** o chefe.

**Terreno:**
- muros retos, em L e curvos (pedra, cerca viva, caixotes);
- fortificações em anel em volta de um pelotão, que podem ser abertas, fechadas (só aparecem se o deck tem como saltar) ou com **porteira**: derrubar a alavanca abre a grade por alguns segundos.

## Eventos entre as fases (`core/events.ts` sorteia; `game/events.ts` monta a cena 3D)
- Não há evento depois do tutorial, e nunca há dois seguidos do mesmo tipo.
- Os **eventos bons** têm uma chance que cresce a cada fase sem evento.
- O **Presente do Dono** tem uma conta própria e só aparece a partir de certa fase.

| Evento | O que tem |
|---|---|
| **Loja** | Peças, remédio (vida), vela (+tentativa na próxima fase), **quebrar peça** na bigorna (tira uma peça da caixa) e o sininho que troca a mercadoria. Preços em `RULES.shop*`. |
| **Prensa de Selos** | Carimba um selo numa peça, com limite de selos por peça (`core/cards.ts`). |
| **Altar Místico** | Bênçãos que valem para a run inteira (`core/buffs.ts`). |
| **Presente do Dono** | O evento ruim: escolha 1 entre 2 peças malditas, que vai à força para a sua caixa. |

**Selos** (`SEALS` em `core/cards.ts`):
- Guardada: não vai para o descarte.
- Dupla: vale por 2.
- Sortuda: traz mais uma peça ao sair da caixa.
- Primeira: sempre vem na primeira mão.
- Dourada: dá ouro por fase vencida.
- Mola: salta muros. Não combina com Foguete, Saltadora ou peças que dividem.

As malditas não aceitam selo.

**Bênçãos** (`BUFFS` em `core/buffs.ts`):
- Mão Grande: +1 peça por mão.
- Fôlego: +1 tentativa.
- Vigor: aumenta a vida máxima.
- Avareza: mais ouro.
- Vidente: mostra a próxima peça da caixa.
- Reciclagem: a primeira Nova mão devolve as sobras para a caixa.

## O dono da mesa (vilão)
- É um boneco de ventríloquo pendurado por cordas do outro lado da mesa.
- Os olhos seguem o cursor, ele reage às jogadas e a laca racha a cada vitória.
- Em cada evento ele veste um traje: loja = banqueiro, altar = vidente, prensa = coveiro, presente = palhaço (`TRAJE_DO_EVENTO` em `game/game.ts`).
- Ele também comenta as peças malditas (`game/curseTalk.ts`).
- Arquivos:
  - modelo: `assets/vilao.glb`, gerado por `tools/vilao2/export_jogo.py`;
  - montagem: `game/vilaoOficial.ts`;
  - fundo de tinta: `game/backdrop.ts`.

## Controles
| Ação | Tecla |
|---|---|
| Escolher peça | `1`–`9` |
| Nova mão | `N` |
| Limpar o que foi posto com a mão atual | `R` |
| Desfazer traço | `Ctrl+Z` |
| Tirar a ponta / cancelar traço | clique direito (sem arrastar) |
| Disparar | `Enter` / `Espaço` |
| Acelerar a simulação | `Espaço` / `F` |
| Câmera | arrastar com o botão direito (girar), botão do meio (arrastar), roda (zoom), `WASD` / setas (mover), `Q` / `E` (girar) |
| Cancelar traço / pausar | `Esc` |

As opções (idioma PT/EN, efeitos de vídeo e volumes) ficam no menu de pausa.
