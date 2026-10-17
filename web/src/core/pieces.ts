// Catálogo de peças jogáveis. Medidas em metros (L × A × E): largura no eixo X local,
// altura em Y, espessura em Z. A peça tomba para +Z local (a "frente", para onde aponta).
export type PieceId = 'common' | 'heavy' | 'tower' | 'blast' | 'runner' | 'jumper' | 'fork' | 'trifork'
  // malditas (evento "Presente do Dono"): entram à força no deck e travam a Nova mão
  | 'metal' | 'crooked' | 'minion' | 'wander' | 'jealous';

export interface PieceDef {
  id: PieceId;
  name: string;
  plural: string;
  short: string;
  desc: string;
  w: number; h: number; t: number;
  /** alcance da queda: distância até a próxima peça colocada depois desta */
  step: number;
  color: string;
  pip: string;
  cost: number; // custo-base (loja = cost × qtd × 4)
  /** peça maldita: enquanto estiver na mão, a Nova mão fica travada */
  cursed?: true;
}

const CURSE_BODY = '#3b2340';
const CURSE_PIP = '#9dff5a';

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
  tower: {
    id: 'tower', name: 'Torre', plural: 'Torres', short: 'TOR',
    desc: 'Gigante fina: cai longe (a próxima peça vai bem adiante) e esmaga Brutamontes.',
    w: 0.42, h: 1.80, t: 0.16, step: 1.15,
    color: '#7d5bd6', pip: '#f7f1e3', cost: 2,
  },
  blast: {
    id: 'blast', name: 'Explosiva', plural: 'Explosivas', short: 'BUM',
    desc: 'Explode ao tocar um inimigo. Derruba tudo em volta!',
    w: 0.40, h: 0.80, t: 0.14, step: 0.38,
    color: '#e5493a', pip: '#ffe9b0', cost: 3,
  },
  runner: {
    id: 'runner', name: 'Foguete', plural: 'Foguetes', short: 'FOG',
    desc: 'Corre 3 m pelo chão atropelando quem estiver na linha e quicando nos muros. A corrente continua onde ele para.',
    w: 0.36, h: 0.70, t: 0.12, step: 0.38,
    color: '#f2c14e', pip: '#3a2a12', cost: 2,
  },
  jumper: {
    id: 'jumper', name: 'Saltadora', plural: 'Saltadoras', short: 'SAL',
    desc: 'Ao ser derrubada, SALTA por cima de muros e rondas. A próxima peça nasce do outro lado.',
    w: 0.40, h: 0.80, t: 0.14, step: 0.38,
    color: '#4fae5c', pip: '#0f2412', cost: 3,
  },
  fork: {
    id: 'fork', name: 'Bifurcação', plural: 'Bifurcações', short: 'BIF',
    desc: '1 carta = 2 meias-peças lado a lado. A corrente se divide em duas!',
    w: 0.18, h: 0.80, t: 0.12, step: 0.38,
    color: '#f08a3c', pip: '#2a160a', cost: 3,
  },
  trifork: {
    id: 'trifork', name: 'Trifurcação', plural: 'Trifurcações', short: 'TRI',
    desc: '1 carta = 3 meias-peças lado a lado. A corrente se divide em três!',
    w: 0.15, h: 0.80, t: 0.12, step: 0.38,
    color: '#d6457a', pip: '#2a0a16', cost: 4,
  },
  metal: {
    id: 'metal', name: 'Teimosa', plural: 'Teimosas', short: 'TEI', cursed: true,
    desc: 'Maldita. Lata rebitada que não se mexe: só cai com uma Pesada, uma explosão ou um Ogro.',
    w: 0.40, h: 0.80, t: 0.14, step: 0.38,
    color: '#4a4f5a', pip: CURSE_PIP, cost: 0,
  },
  crooked: {
    id: 'crooked', name: 'Torta', plural: 'Tortas', short: 'TOR', cursed: true,
    desc: 'Maldita. Ao ser colocada dá um pulinho e vira 90° para o lado: a trilha segue torta.',
    w: 0.40, h: 0.80, t: 0.12, step: 0.38,
    color: CURSE_BODY, pip: CURSE_PIP, cost: 0,
  },
  minion: {
    id: 'minion', name: 'Capanga', plural: 'Capangas', short: 'CAP', cursed: true,
    desc: 'Maldita. Na mesa vira um soldadinho inimigo que bloqueia a trilha até ser derrubado.',
    w: 0.40, h: 0.80, t: 0.12, step: 0.38,
    color: CURSE_BODY, pip: '#ff5a5a', cost: 0,
  },
  wander: {
    id: 'wander', name: 'Andarilha', plural: 'Andarilhas', short: 'AND', cursed: true,
    desc: 'Maldita. Fica passeando um pouco para fora da linha e volta. Se a corrente chegar na hora errada, erra.',
    w: 0.40, h: 0.80, t: 0.12, step: 0.38,
    color: CURSE_BODY, pip: CURSE_PIP, cost: 0,
  },
  jealous: {
    id: 'jealous', name: 'Ciumenta', plural: 'Ciumentas', short: 'CIU', cursed: true,
    desc: 'Maldita. As peças especiais logo antes e logo depois dela perdem o poder e caem como Comuns.',
    w: 0.40, h: 0.80, t: 0.12, step: 0.38,
    color: CURSE_BODY, pip: '#7fb8ff', cost: 0,
  },
};

export const PIECE_ORDER: PieceId[] = ['common', 'heavy', 'tower', 'blast', 'runner', 'jumper', 'fork', 'trifork', 'metal', 'crooked', 'minion', 'wander', 'jealous'];
export const CURSED: PieceId[] = PIECE_ORDER.filter((k) => PIECES[k].cursed);
export function isCursed(t: PieceId): boolean { return !!PIECES[t].cursed; }

/** Distância lateral de cada meia-peça da bifurcação em relação ao eixo. */
export const FORK_OFFSET = 0.17;
/** Distância lateral entre as 3 meias-peças da trifurcação (a do meio fica no eixo). */
export const TRIFORK_OFFSET = 0.2;
/** Bifurcação e Trifurcação: uma carta vira várias meias-peças lado a lado e a corrente se divide. */
export function splits(t: PieceId): boolean { return t === 'fork' || t === 'trifork'; }
/** Posições laterais (em relação ao eixo) das meias-peças de uma peça que se divide. */
export function splitOffsets(t: PieceId): number[] {
  return t === 'trifork' ? [-TRIFORK_OFFSET, 0, TRIFORK_OFFSET] : t === 'fork' ? [-FORK_OFFSET, FORK_OFFSET] : [0];
}

export type Deck = Record<PieceId, number>;

export function emptyDeck(): Deck {
  return { common: 0, heavy: 0, tower: 0, blast: 0, runner: 0, jumper: 0, fork: 0, trifork: 0, metal: 0, crooked: 0, minion: 0, wander: 0, jealous: 0 };
}

export function deckTotal(d: Deck): number {
  let n = 0;
  for (const k of PIECE_ORDER) n += d[k];
  return n;
}
