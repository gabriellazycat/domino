import { PhaseSpec, ARCHER_RANGE } from './mapgen';
import type { Placed } from './layout';

/**
 * Peça que cada Arqueiro vai queimar. A regra é estática (dá para mostrar no planejamento): é a PRIMEIRA peça da
 * corrente (menor distância de peças até o gatilho; empate = menor id) cuja posição colocada fica dentro do círculo
 * dele. O Foguete é imune. Só essa peça leva a flecha, e dela não dá para continuar a corrente.
 */
export function archerTargets(spec: PhaseSpec, pieces: readonly Placed[]): { archer: number; piece: Placed }[] {
  const out: { archer: number; piece: Placed }[] = [];
  if (!pieces.length) return out;
  let byId: Map<number, Placed> | null = null;
  const depth = (p: Placed) => {
    byId ??= new Map(pieces.map((q) => [q.id, q]));
    let d = 0, q: Placed | undefined = p;
    while (q && q.parent !== -1 && d < 1000) { q = byId.get(q.parent); d++; }
    return d;
  };
  spec.enemies.forEach((e, i) => {
    if (e.kind !== 'archer') return;
    let best: { p: Placed; d: number } | null = null;
    for (const p of pieces) {
      if (p.type === 'runner') continue; // o Foguete correndo passa imune
      if (Math.hypot(p.x - e.x, p.z - e.z) > ARCHER_RANGE) continue;
      const d = depth(p);
      if (!best || d < best.d || (d === best.d && p.id < best.p.id)) best = { p, d };
    }
    if (best) out.push({ archer: i, piece: best.p });
  });
  return out;
}
