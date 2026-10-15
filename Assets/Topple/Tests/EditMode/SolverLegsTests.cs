// Cobertura das pernas do solver (puro, sem física): complementa o harness.
// A perna não precisa alcançar cada soldado (splash 0,8 m encadeia o
// pelotão) — precisa passar a ≤1,5 m do CENTRO de cada grupo. Se cobre e o
// harness perde, a morte foi física (variância, reversão, drape); se não
// cobre, o gerador selou o grupo (mapa injusto). Mesmas candidatas + filtro
// do harness (espelho). Sem falha-rápida: loga tudo, cobra no fim.
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using Topple.Core;
using Topple.Game;
using Topple.Sim;

namespace Topple.Tests
{
    public class SolverLegsTests
    {
        static readonly (uint seed, int depth)[] Candidates = new[]
        {
            (1u, 10), (2u, 10), (3u, 10), (4u, 10), (5u, 10), (6u, 10),
            (7u, 10), (8u, 10), (9u, 10), (10u, 10), (11u, 10), (12u, 10),
            (1u, 11), (2u, 11), (3u, 11), (4u, 11), (5u, 11), (6u, 11),
            (7u, 11), (8u, 11), (9u, 11), (10u, 11), (11u, 11), (12u, 11),
        };

        static bool InVoid(float wx, float wz, TutorialSetup.VoidDef v)
            => wx > v.Center.x - v.Size.x * 0.5f - 0.1f && wx < v.Center.x + v.Size.x * 0.5f + 0.1f
            && wz > v.Center.z - v.Size.z * 0.5f - 0.1f && wz < v.Center.z + v.Size.z * 0.5f + 0.1f;

        static bool Blocked(TutorialSetup.PhaseDef ph, float wx, float wz, PieceId piece, float deg)
        {
            foreach (var s in ph.Soldiers)
                if (PlanningController.OverlapsSoldier(wx, wz, piece, deg, s)) return true;
            if (ph.Gaps != null)
                foreach (var g in ph.Gaps)
                {
                    float dx = wx - g.Center.x, dz = wz - g.Center.z;
                    if (dx * dx + dz * dz < g.R * g.R) return true;
                }
            if (ph.Voids != null)
                foreach (var v in ph.Voids)
                    if (InVoid(wx, wz, v)) return true;
            // Validade idêntica ao jogo (colar de círculos — fonte única).
            foreach (var b in ph.Blocks)
                foreach (var (c, r) in PlanningController.ForbiddenCircles(b.Center, b.Size))
                {
                    float dx = wx - c.x, dz = wz - c.z;
                    if (dx * dx + dz * dz < r * r) return true;
                }
            return false;
        }

        static List<(int gx, int gz, float deg)> BestFor(PlanningData data,
            TutorialSetup.PhaseDef ph, int sx, int sz, float sdeg, int tgx, int tgz, PieceId p)
        {
            var pts = PlanningData.ArcPath(sx, sz, sdeg, tgx, tgz,
                PlanningController.PathSpacing, true);
            var ok = new List<(int gx, int gz, float deg)>();
            foreach (var q in pts)
            {
                if (data.HandCount(p) - ok.Count <= 0) break;
                if (data.FindAt(q.gx, q.gz) >= 0) continue;
                float wx = PlanningData.ToWorld(q.gx), wz = PlanningData.ToWorld(q.gz);
                if (Blocked(ph, wx, wz, p, q.deg)) continue;
                ok.Add(q);
            }
            PlanningData.DropCrowded(ok, p);
            return ok;
        }

        static float MaxGapM(List<(int gx, int gz, float deg)> pts)
        {
            float max = 0f;
            for (int i = 0; i + 1 < pts.Count; i++)
            {
                float dx = PlanningData.ToWorld(pts[i + 1].gx) - PlanningData.ToWorld(pts[i].gx);
                float dz = PlanningData.ToWorld(pts[i + 1].gz) - PlanningData.ToWorld(pts[i].gz);
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > max) max = d;
            }
            return max;
        }

        [Test] public void SolverLegs_CoverHarnessGroups()
        {
            var samples = new List<(uint seed, int depth, TutorialSetup.PhaseDef ph)>();
            foreach (var (seed, depth) in Candidates)
            {
                var ph = TutorialSetup.ConvertMap(MapGen.Generate(seed, depth));
                int brutes = 0;
                foreach (var s in ph.Soldiers)
                    if (s.Kind == EnemyKind.Brute) brutes++;
                if (ph.Soldiers.Count <= 16 && brutes <= 3 && samples.Count < 6)
                    samples.Add((seed, depth, ph));
            }
            Assert.GreaterOrEqual(samples.Count, 4, "harness sem amostras justas (gerador derivou?)");
            var failures = new List<string>();
            int centers = 0;
            foreach (var (seed, depth, ph) in samples)
            {
                // Ordem canônica: do trigger p/ fora (a que o humano tenta 1º).
                var order = new List<EnemySpot>(ph.Soldiers);
                float tx = PlanningData.ToWorld(ph.TriggerGx), tz = PlanningData.ToWorld(ph.TriggerGz);
                order.Sort((a, b)
                    => ((a.Pos.x - tx) * (a.Pos.x - tx) + (a.Pos.z - tz) * (a.Pos.z - tz))
                        .CompareTo((b.Pos.x - tx) * (b.Pos.x - tx) + (b.Pos.z - tz) * (b.Pos.z - tz)));
                var data = new PlanningData();
                data.SetHand(PieceId.Common, 300);
                data.SetHand(PieceId.Heavy, 40);
                data.SetHand(PieceId.Tower, 60);
                var pts = new List<(float x, float z)>();
                int sx = ph.TriggerGx, sz = ph.TriggerGz;
                float sdeg = ph.TriggerDeg;
                foreach (var s in order)
                {
                    int tgx = PlanningData.Snap(PlanningData.ToGrid(s.Pos.x), true);
                    int tgz = PlanningData.Snap(PlanningData.ToGrid(s.Pos.z), true);
                    if (s.Kind == EnemyKind.Brute)
                    {
                        float hx = PlanningData.ToWorld(sx), hz = PlanningData.ToWorld(sz);
                        float dx = s.Pos.x - hx, dz = s.Pos.z - hz;
                        float len = Mathf.Sqrt(dx * dx + dz * dz);
                        if (len > 1e-4f)
                        {
                            float ox = s.Pos.x + dx / len * 1.0f, oz = s.Pos.z + dz / len * 1.0f;
                            if (Mathf.Abs(ox) < 9.5f && Mathf.Abs(oz) < 6.5f)
                            {
                                tgx = PlanningData.Snap(PlanningData.ToGrid(ox), true);
                                tgz = PlanningData.Snap(PlanningData.ToGrid(oz), true);
                            }
                        }
                    }
                    var piece = s.Kind == EnemyKind.Brute ? PieceId.Heavy : PieceId.Common;
                    var leg = BestFor(data, ph, sx, sz, sdeg, tgx, tgz, piece);
                    if (MaxGapM(leg) > PlanningController.WaveReach(piece))
                    {
                        var tower = BestFor(data, ph, sx, sz, sdeg, tgx, tgz, PieceId.Tower);
                        if (MaxGapM(tower) <= PlanningController.WaveReach(PieceId.Tower)) leg = tower;
                    }
                    foreach (var q in leg)
                        pts.Add((PlanningData.ToWorld(q.gx), PlanningData.ToWorld(q.gz)));
                    if (leg.Count > 0)
                    {
                        var last = leg[leg.Count - 1];
                        sx = last.gx; sz = last.gz; sdeg = last.deg;
                    }
                }
                // Cobertura: cada centro de pelotão a ≤1,5 m de algum ponto de perna.
                // (Minas cobrem grupos de patrulha sem perna — ver harness.)
                var spec = MapGen.Generate(seed, depth);
                centers += spec.ClusterCenters.Count;
                foreach (var c in spec.ClusterCenters)
                {
                    float best = float.MaxValue;
                    foreach (var p in pts)
                    {
                        float dx = p.x - c.X, dz = p.z - c.Z;
                        float d = Mathf.Sqrt(dx * dx + dz * dz);
                        if (d < best) best = d;
                    }
                    UnityEngine.Debug.Log($"[TOPPLE][LEGS] seed={seed} prof={depth} centro@({c.X:F1},{c.Z:F1}): perto={best:F2}m");
                    if (best > 1.5f)
                        failures.Add($"seed {seed} prof {depth}: grupo em ({c.X:F1},{c.Z:F1}) a {best:F2}m da perna — selado?");
                }
            }
            float cov = centers == 0 ? 1f : 1f - failures.Count / (float)centers;
            UnityEngine.Debug.Log($"[TOPPLE][LEGS] cobertura: {centers - failures.Count}/{centers}");
            Assert.GreaterOrEqual(cov, 0.85f, "grupos fora de alcance:\n" + string.Join("\n", failures));
        }
    }
}
