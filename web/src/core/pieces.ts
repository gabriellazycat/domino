// Catálogo de peças jogáveis. Medidas em metros (L × A × E): largura no eixo X local,
// altura em Y, espessura em Z. A peça tomba para +Z local (a "frente", para onde aponta).
export type PieceId = 'common' | 'heavy' | 'big' | 'tower' | 'blast' | 'runner' | 'fork';

export interface PieceDef {
  id: PieceId;
  name: string;
  plural: string;
  short: string;
  desc: string;
  w: number; h: number; t: number;
  /** distância até a próxima peça desenhada depois desta */
  step: number;
  color: string;
  pip: string;
  cost: number; // custo-base (loja = cost × qtd × 4)
}

export const PIECES: Record<PieceId, PieceDef> = {
  common: {
    id: 'common', name: 'Comum', plural: 'Comuns', short: 'COM',
    desc: 'O dominó clássico. Base de toda corrente.',
    w: 0.40, h: 0.80, t: 0.12, step: 0.38,
    color: '#ebdfc6', pip: '#1d1a17', cost: 1,
  },
  heavy: {
    id: 'heavy', name: 'Pesada', plural: 'Pesadas', short: 'PES',
    desc: 'Ferro maciço: derruba Brutamontes e o General com um golpe só.',
    w: 0.44, h: 0.80, t: 0.20, step: 0.42,
    color: '#2b2d35', pip: '#f2c14e', cost: 2,
  },
  big: {
    id: 'big', name: 'Grande', plural: 'Grandes', short: 'GRD',
    desc: 'Alta e larga: a queda alcança longe e derruba tudo que estiver no caminho.',
    w: 0.56, h: 1.20, t: 0.16, step: 0.5,
    color: '#3fb6a8', pip: '#f7f1e3', cost: 2,
  },
  tower: {
    id: 'tower', name: 'Torre', plural: 'Torres', short: 'TOR',
    desc: 'Gigante fina: alcança bem longe e esmaga Brutamontes.',
    w: 0.42, h: 1.80, t: 0.16, step: 0.55,
    color: '#7d5bd6', pip: '#f7f1e3', cost: 2,
  },
  blast: {
    id: 'blast', name: 'Explosiva', plural: 'Explosivas', short: 'BUM',
    desc: 'Explode ao cair ou ao tocar um inimigo. Derruba tudo em volta!',
    w: 0.40, h: 0.80, t: 0.14, step: 0.38,
    color: '#e5493a', pip: '#ffe9b0', cost: 3,
  },
  runner: {
    id: 'runner', name: 'Foguete', plural: 'Foguetes', short: 'FOG',
    desc: 'Ao ser tocado, dispara para a frente atropelando quem estiver no caminho.',
    w: 0.36, h: 0.70, t: 0.12, step: 0.38,
    color: '#f2c14e', pip: '#3a2a12', cost: 2,
  },
  fork: {
    id: 'fork', name: 'Bifurcação', plural: 'Bifurcações', short: 'BIF',
    desc: '1 carta = 2 meias-peças lado a lado. A corrente se divide em duas!',
    w: 0.18, h: 0.80, t: 0.12, step: 0.38,
    color: '#f08a3c', pip: '#2a160a', cost: 3,
  },
};

export const PIECE_ORDER: PieceId[] = ['common', 'heavy', 'big', 'tower', 'blast', 'runner', 'fork'];

/** Distância lateral de cada meia-peça da bifurcação em relação ao eixo. */
export const FORK_OFFSET = 0.17;

export type Deck = Record<PieceId, number>;

export function emptyDeck(): Deck {
  return { common: 0, heavy: 0, big: 0, tower: 0, blast: 0, runner: 0, fork: 0 };
}

export function deckTotal(d: Deck): number {
  let n = 0;
  for (const k of PIECE_ORDER) n += d[k];
  return n;
}
