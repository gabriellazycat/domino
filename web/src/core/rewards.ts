import { Rng } from './rng';
import { PieceId, PIECES } from './pieces';

// Draft 1-de-3 (pesos do Topple Unity, Content/reward-weights.json, adaptados).
// As três opções sempre têm a MESMA raridade: primeiro sorteia a raridade, depois 3 entradas dela.
// "Comuns" escalonado: 5 + profundidade.
export type Rarity = 'comum' | 'rara' | 'épica';
export interface RewardItem { piece: PieceId; count: number }
export interface RewardOption { label: string; items: RewardItem[]; rarity: Rarity }

interface Entry { minDepth: number; weight: number; items: RewardItem[]; rarity: Rarity }

// Opções "comuns" não estão nesta tabela: são geradas por `commonPacks` com um orçamento de valor (ver abaixo).
const TABLE: Entry[] = [
  { minDepth: 1, weight: 14, items: [{ piece: 'runner', count: 2 }], rarity: 'rara' },
  { minDepth: 2, weight: 14, items: [{ piece: 'blast', count: 2 }], rarity: 'rara' },
  { minDepth: 2, weight: 12, items: [{ piece: 'fork', count: 2 }], rarity: 'rara' },
  { minDepth: 3, weight: 12, items: [{ piece: 'tower', count: 1 }, { piece: 'common', count: 2 }], rarity: 'rara' },
  { minDepth: 6, weight: 12, items: [{ piece: 'heavy', count: 3 }, { piece: 'common', count: 3 }], rarity: 'rara' },
  { minDepth: 5, weight: 10, items: [{ piece: 'blast', count: 3 }, { piece: 'common', count: 2 }], rarity: 'épica' },
  { minDepth: 5, weight: 10, items: [{ piece: 'fork', count: 2 }, { piece: 'blast', count: 1 }], rarity: 'épica' },
  { minDepth: 5, weight: 10, items: [{ piece: 'runner', count: 3 }, { piece: 'heavy', count: 1 }], rarity: 'épica' },
  { minDepth: 6, weight: 10, items: [{ piece: 'tower', count: 2 }], rarity: 'épica' },
  { minDepth: 7, weight: 8, items: [{ piece: 'tower', count: 1 }, { piece: 'blast', count: 2 }], rarity: 'épica' },
];

export function labelFor(items: RewardItem[]): string {
  return items.map((it) => `${it.count} ${it.count === 1 ? PIECES[it.piece].name : PIECES[it.piece].plural}`).join(' + ');
}

/** Chance de cada raridade nesta profundidade (rara e épica crescem devagar com a run). */
function rarityWeights(depth: number): Record<Rarity, number> {
  return { comum: Math.max(40, 70 - depth * 2), rara: 26 + depth, épica: 4 + depth * 0.8 };
}

/**
 * Orçamento de valor das opções comuns (valor = custo-base × quantidade; comum = 1, pesada/torre = 2, bifurcação = 3).
 * Começa em 2 (2 comuns ou 1 especial) e sobe 1 a cada 3 fases, até 4: nunca 5 comuns nem 3 especiais.
 */
export function commonBudget(depth: number): number {
  return Math.min(4, 2 + Math.floor(depth / 3));
}

/** Todos os pacotes comuns com exatamente o orçamento da profundidade (cada um vale o mesmo). */
export function commonPacks(depth: number): RewardItem[][] {
  const budget = commonBudget(depth);
  const specials: PieceId[] = ['heavy', 'tower'];
  if (depth >= 2) specials.push('fork');
  const packs: RewardItem[][] = [[{ piece: 'common', count: budget }]];
  for (const piece of specials) {
    const cost = PIECES[piece].cost;
    for (let k = 1; k * cost <= budget; k++) {
      const rest = budget - k * cost;
      packs.push(rest > 0 ? [{ piece, count: k }, { piece: 'common', count: rest }] : [{ piece, count: k }]);
    }
  }
  return packs;
}

/** 3 opções distintas da mesma raridade, por peso (roleta sem reposição). */
export function draft3(rng: Rng, depth: number): RewardOption[] {
  const open = TABLE.filter((e) => e.minDepth <= depth);
  // comuns estão sempre disponíveis (vêm dos pacotes); rara e épica precisam de pelo menos 3 opções liberadas
  const tiers = (['comum', 'rara', 'épica'] as Rarity[]).filter((r) => r === 'comum' || open.filter((e) => e.rarity === r).length >= 3);
  const w = rarityWeights(depth);
  let roll = rng.float() * tiers.reduce((s, r) => s + w[r], 0);
  let tier = tiers[0];
  for (const r of tiers) { roll -= w[r]; if (roll < 0) { tier = r; break; } }

  if (tier === 'comum') {
    const packs = commonPacks(depth);
    const out: RewardOption[] = [];
    while (out.length < 3 && packs.length > 0) {
      const items = packs.splice(Math.floor(rng.float() * packs.length), 1)[0].map((it) => ({ ...it }));
      out.push({ label: labelFor(items), items, rarity: 'comum' });
    }
    return out;
  }

  const pool = open.filter((e) => e.rarity === tier);
  const out: RewardOption[] = [];
  while (out.length < 3 && pool.length > 0) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = rng.float() * total;
    let at = 0;
    for (; at < pool.length - 1; at++) {
      r -= pool[at].weight;
      if (r < 0) break;
    }
    const e = pool.splice(at, 1)[0];
    const items = e.items.map((it) => ({ ...it }));
    out.push({ label: labelFor(items), items, rarity: e.rarity });
  }
  return out;
}
