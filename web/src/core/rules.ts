import { PIECES, PieceId } from './pieces';

// Constantes da run (herdadas do Topple Unity, ToppleRules.cs, com calibragem do remake web).
export const RULES = {
  startingLife: 10,
  startingCommons: 10,
  startingTowers: 1,
  startingForks: 1,
  startingRunners: 0,
  attemptsPerPhase: 3,
  handSize: 7,
  damagePerSurvivor: 1,
  shopPriceMult: 4,
  shopRerollBase: 8,
  shopRerollStep: 4,
  shopHealLife: 3,
  shopHealCost: 12,
  shopAttemptCost: 10,
  shopMaxExtraAttempts: 2,
  draftRerollCost: 6,
  bossEvery: 5,
} as const;

export function isBossPhase(depth: number): boolean {
  return (depth + 1) % RULES.bossEvery === 0;
}

export function starsFor(win: boolean, efficient: boolean, firstTry: boolean): number {
  if (!win) return 0;
  return 1 + (efficient ? 1 : 0) + (firstTry ? 1 : 0);
}

export function goldFor(stars: number, boss: boolean, bestCombo: number): number {
  if (stars === 0) return 6;
  return 10 + 5 * stars + (boss ? 15 : 0) + Math.min(10, Math.floor(bestCombo / 3) * 2);
}

export function shopPrice(piece: PieceId, count: number): number {
  return PIECES[piece].cost * count * RULES.shopPriceMult;
}
