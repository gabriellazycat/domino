// Procura (headless) a "corrente herói" do trailer: fase grande, muitos inimigos e bifurcações, que o bot vence.
// npx vite-node e2e/trailer/find-hero.ts -- [n]
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import { generatePhase } from '../../src/core/mapgen';
import { solve } from '../../src/game/solver';
import { emptyDeck } from '../../src/core/pieces';

await RAPIER.init();
const deck = emptyDeck();
deck.common = 140; deck.fork = 5; deck.heavy = 6; deck.blast = 4; deck.tower = 4;
const n = Number(process.argv[2] ?? 40), d0 = Number(process.argv[3] ?? 12), dn = Number(process.argv[4] ?? 6), strip = process.argv[5] === "strip";
const out: any[] = [];
for (let i = 0; i < n; i++) {
  const seed = Number(process.env.SEED0 ?? 1000) + i * 37, depth = d0 + (i % dn);
  const spec = generatePhase(seed, depth, deck);
  if (strip) spec.enemies = spec.enemies.filter((e) => !e.patrol && e.kind !== "archer");
  const r = solve(spec, deck);
  const forks = r.layout.pieces.filter((p) => p.type === 'fork' || p.type === 'trifork').length;
  const kinds = [...new Set(spec.enemies.map((e) => e.kind))];
  const score = (r.win ? 1000 : 0) + r.layout.pieces.length + 25 * forks + 10 * spec.enemies.length + 15 * kinds.length;
  const row = { seed, depth, strip, win: r.win, alive: r.alive, pieces: r.layout.pieces.length, forks, enemies: spec.enemies.length, kinds: kinds.join(','), walls: spec.walls.length, gates: spec.gates?.length ?? 0, boss: spec.boss, score };
  console.log(JSON.stringify(row));
  out.push(row);
}
out.sort((a, b) => b.score - a.score);
writeFileSync(new URL(`./hero-${process.env.TAG ?? "c"}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log('TOP', out.slice(0, 8));
