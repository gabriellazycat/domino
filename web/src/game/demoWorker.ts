import RAPIER from '@dimforge/rapier3d-compat';
import { generatePhase } from '../core/mapgen';
import { Deck } from '../core/pieces';
import { Placed } from '../core/layout';
import { solve } from './solver';

// Demo do menu, fora da thread do jogo: gerar a fase e achar um plano que o bot vence custa de 0,3 a
// vários segundos (planejar + física headless, até 16 combinações). Feito no quadro, o menu travava a
// cada troca de mesa. Aqui o cálculo roda em paralelo e só o resultado (semente + peças) volta.

export interface DemoRequest { ticket: number; seed: number; deck: Deck }
export interface DemoResult { ticket: number; seed: number; depth: number; pieces: Placed[] }

/** Profundidade da fase da demo para uma semente (a mesma conta nos dois lados). */
export const demoDepth = (seed: number) => 4 + (seed % 5);

/** Procura (headless) uma fase que o bot vence, a partir de `seed`: a demo sempre termina em festa. */
export function findDemo(seed: number, deck: Deck): { seed: number; depth: number; pieces: Placed[] } {
  let pieces: Placed[] = [];
  for (let tries = 0; tries < 4; tries++) {
    const r = solve(generatePhase(seed, demoDepth(seed), deck), deck);
    pieces = r.layout.pieces;
    if (r.win || tries === 3) break;
    seed += 31;
  }
  return { seed, depth: demoDepth(seed), pieces };
}

// só dentro de um worker (este arquivo também é importado pelo jogo, por causa dos tipos e do plano B)
if (typeof document === 'undefined' && typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  const ready = RAPIER.init();
  self.onmessage = async (e: MessageEvent<DemoRequest>) => {
    await ready;
    const { ticket, seed, deck } = e.data;
    const out: DemoResult = { ticket, ...findDemo(seed, deck) };
    (self as any).postMessage(out);
  };
}
