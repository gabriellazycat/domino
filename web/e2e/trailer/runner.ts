// Mini fase do Foguete com ricochete (para o trailer).
import type { PhaseSpec } from '../../src/core/mapgen';
import { runnerPath, alongPath } from '../../src/core/motion';
import { direct, Cmd } from './director';
export const RUNNER_CMDS: Cmd[] = [
  { name: 'a', from: 'trigger', kind: 'common', to: [[-2.6, 0.6], [-1.9, 0.3]] },
  { name: 'rk', from: 'a', kind: 'runner', to: [[-1.0, -0.6]] },
];
export function runnerSpec(): PhaseSpec {
  const spec: PhaseSpec = { depth: 5, seed: 1, title: '', subtitle: '', trigger: { x: -4.4, z: 1.0, yaw: Math.PI / 2 },
    enemies: [], walls: [{ x: -0.2, z: -1.15, w: 3.6, d: 0.4, h: 0.6, style: 'stone' }], gates: [], par: 20, boss: false };
  const { layout } = direct(spec, RUNNER_CMDS);
  const r = layout.pieces.find((p) => p.type === 'runner')!;
  const path = runnerPath(spec, r.x, r.z, r.yaw);
  // soldados no trecho depois do quique
  const L = path.len;
  for (const s of [L * 0.7, L * 0.83, L * 0.96]) {
    const q = alongPath(path.pts, s);
    spec.enemies.push({ kind: 'soldier', x: q.x, z: q.z, yaw: q.yaw + Math.PI, squad: 0 });
  }
  return spec;
}
