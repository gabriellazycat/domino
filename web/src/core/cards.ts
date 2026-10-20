import { PieceId, PIECE_ORDER, PIECES, Deck, emptyDeck, isCursed } from './pieces';

// Cada peça da caixa é única (tem uid) e pode carregar até 2 SELOS carimbados pela prensa.
// "Kind" = tipo + selos: é o que se escolhe na mão (duas Comuns sem selo são a mesma escolha;
// uma Comum com Dupla é outra).

export type SealId = 'guard' | 'double' | 'lucky' | 'first' | 'gold' | 'spring';

export interface SealDef {
  id: SealId;
  name: string;
  desc: string;
  /** cor da tinta do carimbo */
  ink: string;
  /** preço na prensa */
  price: number;
}

import { localize } from '../i18n';

export const SEALS: Record<SealId, SealDef> = {
  guard: { id: 'guard', name: 'Guardada', desc: 'Não vai para o descarte na Nova mão: fica na mão até você usar.', ink: '#2f6fa8', price: 20 },
  double: { id: 'double', name: 'Dupla', desc: 'Vale por 2: ao colocar, saem duas peças na trilha.', ink: '#b8322a', price: 28 },
  lucky: { id: 'lucky', name: 'Sortuda', desc: 'Quando sai da caixa, traz mais uma peça junto.', ink: '#3a8a46', price: 22 },
  first: { id: 'first', name: 'Primeira', desc: 'Sempre vem na primeira mão da fase.', ink: '#6d42b0', price: 18 },
  gold: { id: 'gold', name: 'Dourada', desc: '+3 de ouro em cada fase vencida em que ela foi colocada.', ink: '#b0861e', price: 16 },
  spring: { id: 'spring', name: 'Mola', desc: 'Ao ser derrubada, a peça SALTA por cima de muros antes de cair. A próxima nasce do outro lado.', ink: '#1f8a7a', price: 30 },
};
for (const s of Object.values(SEALS)) localize(s, ['name', 'desc']);
export const SEAL_ORDER: SealId[] = ['guard', 'double', 'lucky', 'first', 'gold', 'spring'];
export const MAX_SEALS = 2;

export interface Card { uid: number; type: PieceId; seals: SealId[] }
export type Kind = string;

const sealRank = (s: SealId) => SEAL_ORDER.indexOf(s);

export function kindOf(c: { type: PieceId; seals: SealId[] }): Kind {
  if (!c.seals.length) return c.type;
  return `${c.type}+${[...c.seals].sort((a, b) => sealRank(a) - sealRank(b)).join('+')}`;
}
export function kindType(k: Kind): PieceId { return k.split('+')[0] as PieceId; }
export function kindSeals(k: Kind): SealId[] { return k.split('+').slice(1) as SealId[]; }
/** Ordem na mão: por tipo (mesma ordem das teclas) e, dentro do tipo, sem selo primeiro. */
export function kindRank(k: Kind): number {
  const s = kindSeals(k);
  return PIECE_ORDER.indexOf(kindType(k)) * 100 + (s.length ? 10 + s.reduce((a, x) => a + sealRank(x) * 3 + 1, 0) : 0);
}
export function kindName(k: Kind): string {
  const s = kindSeals(k);
  return PIECES[kindType(k)].name + (s.length ? ` (${s.map((x) => SEALS[x].name).join(' + ')})` : '');
}

/** Quantas peças uma carta põe na mesa (Dupla = 2). */
export function usesOf(c: Card): number { return c.seals.includes('double') ? 2 : 1; }
export function canSeal(c: Card, s: SealId): boolean {
  if (isCursed(c.type)) return false; // maldita não aceita carimbo
  // Mola não combina com quem já se move sozinho (Foguete, Saltadora) nem com as meias-peças da Bifurcação
  if (s === 'spring' && (c.type === 'runner' || c.type === 'jumper' || c.type === 'fork' || c.type === 'trifork')) return false;
  return c.seals.length < MAX_SEALS && !c.seals.includes(s);
}

export function deckOf(cards: readonly Card[]): Deck {
  const d = emptyDeck();
  for (const c of cards) d[c.type]++;
  return d;
}

export function cardsFromDeck(deck: Deck, firstUid = 1): Card[] {
  const out: Card[] = [];
  let uid = firstUid;
  for (const t of PIECE_ORDER) for (let i = 0; i < deck[t]; i++) out.push({ uid: uid++, type: t, seals: [] });
  return out;
}

/** Uma carta de cada "kind" (para escolher em eventos), com quantas existem de cada. */
export function kindsOf(cards: readonly Card[], filter: (c: Card) => boolean = () => true): { card: Card; count: number }[] {
  const map = new Map<Kind, { card: Card; count: number }>();
  for (const c of cards) {
    if (!filter(c)) continue;
    const k = kindOf(c);
    const hit = map.get(k);
    if (hit) hit.count++; else map.set(k, { card: c, count: 1 });
  }
  return [...map.values()].sort((a, b) => kindRank(kindOf(a.card)) - kindRank(kindOf(b.card)));
}
