import { Rng } from './rng';
import { PieceId, PIECES } from './pieces';

// Draft 1-de-3 (pesos do Topple Unity, Content/reward-weights.json, adaptados).
// "Comuns" escalonado: 5 + profundidade.
export interface RewardItem { piece: PieceId; count: number }
export interface RewardOption { label: string; items: RewardItem[]; rarity: 'comum' | 'rara' | 'épica' }

interface Entry { minDepth: number; weight: number; items: RewardItem[]; scaled?: boolean; rarity: RewardOption['rarity'] }

const TABLE: Entry[] = [
  { minDepth: 0, weight: 35, items: [{ piece: 'common', count: 5 }], scaled: true, rarity: 'comum' },
  { minDepth: 0, weight: 30, items: [{ piece: 'common', count: 2 }, { piece: 'heavy', count: 1 }], rarity: 'comum' },
  { minDepth: 0, weight: 20, items: [{ piece: 'big', count: 1 }, { piece: 'common', count: 1 }], rarity: 'comum' },
  { minDepth: 1, weight: 20, items: [{ piece: 'heavy', count: 2 }], rarity: 'comum' },
  { minDepth: 1, weight: 14, items: [{ piece: 'runner', count: 2 }], rarity: 'rara' },
  { minDepth: 2, weight: 16, items: [{ piece: 'common', count: 3 }, { piece: 'heavy', count: 2 }], rarity: 'comum' },
  { minDepth: 2, weight: 14, items: [{ piece: 'blast', count: 2 }], rarity: 'rara' },
  { minDepth: 2, weight: 18, items: [{ piece: 'fork', count: 1 }, { piece: 'common', count: 3 }], rarity: 'comum' },
  { minDepth: 2, weight: 12, items: [{ piece: 'fork', count: 2 }], rarity: 'rara' },
  { minDepth: 3, weight: 12, items: [{ piece: 'tower', count: 1 }, { piece: 'common', count: 2 }], rarity: 'rara' },
  { minDepth: 5, weight: 10, items: [{ piece: 'blast', count: 3 }, { piece: 'common', count: 2 }], rarity: 'épica' },
  { minDepth: 6, weight: 12, items: [{ piece: 'heavy', count: 3 }, { piece: 'common', count: 3 }], rarity: 'rara' },
  { minDepth: 6, weight: 10, items: [{ piece: 'tower', count: 2 }], rarity: 'épica' },
  { minDepth: 8, weight: 10, items: [{ piece: 'big', count: 2 }, { piece: 'common', count: 4 }], rarity: 'rara' },
];

export function labelFor(items: RewardItem[]): string {
  return items.map((it) => `${it.count} ${it.count === 1 ? PIECES[it.piece].name : PIECES[it.piece].plural}`).join(' + ');
}

/** 3 opções distintas por peso (roleta sem reposição). */
export function draft3(rng: Rng, depth: number): RewardOption[] {
  const pool = TABLE.filter((e) => e.minDepth <= depth);
  const out: RewardOption[] = [];
  while (out.length < 3 && pool.length > 0) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let roll = rng.float() * total;
    let at = 0;
    for (; at < pool.length - 1; at++) {
      roll -= pool[at].weight;
      if (roll < 0) break;
    }
    const e = pool.splice(at, 1)[0];
    const items = e.items.map((it) => ({ ...it }));
    if (e.scaled) items[0].count = 5 + depth;
    out.push({ label: labelFor(items), items, rarity: e.rarity });
  }
  return out;
}
