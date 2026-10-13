// T3: matemática do planejamento (grade, linha, desfazer, mão). Pura, rápida.
using NUnit.Framework;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class PlanningDataTests
    {
        [Test] public void Infinite_ProviderKeepsInvariant()
        {
            // Corrente obrigatória + par: valem em qualquer profundidade.
            for (int d = 0; d < 30; d++)
            {
                var ph = TutorialSetup.PhaseForDepth(d);
                Assert.Greater(ph.ParPieces, 0, $"profundidade {d} sem par");
                float tx = PlanningData.ToWorld(ph.TriggerGx), tz = PlanningData.ToWorld(ph.TriggerGz);
                foreach (var s in ph.Soldiers)
                {
                    float dx = s.Pos.x - tx, dz = s.Pos.z - tz;
                    Assert.Greater(System.Math.Sqrt(dx * dx + dz * dz), 1.2, $"prof {d}: trigger perto de {s.Pos}");
                    foreach (var w in s.Waypoints)
                    {
                        float wx = w.x - tx, wz = w.z - tz;
                        Assert.Greater(System.Math.Sqrt(wx * wx + wz * wz), 1.2, $"prof {d}: trigger perto da patrulha");
                    }
                }
            }
        }

        [Test] public void Infinite_ScalesWithCycle()
        {
            // Determinismo: mesma seed + profundidade = mesmo mapa.
            var a = Topple.Core.MapGen.Generate(777, 15);
            var b = Topple.Core.MapGen.Generate(777, 15);
            Assert.AreEqual(a.Soldiers.Count, b.Soldiers.Count);
            Assert.AreEqual(a.ParPieces, b.ParPieces);
            Assert.AreEqual(a.TriggerGx, b.TriggerGx);
            // Profundidade cresce o mapa (mais grupos).
            int early = 0, late = 0;
            for (uint s = 0; s < 10; s++)
            {
                early += Topple.Core.MapGen.Generate(100 + s, 10).Soldiers.Count;
                late += Topple.Core.MapGen.Generate(100 + s, 25).Soldiers.Count;
            }
            Assert.Greater(late, early, "profundidade deveria somar inimigos");
            // Ciclo 0 intacto: mesma referência das provas físicas.
            var base0 = TutorialSetup.Phases[0];
            Assert.AreEqual(base0.Soldiers.Count, TutorialSetup.PhaseForDepth(0).Soldiers.Count);
        }

        [Test] public void MapGen_CurveGentleStart()
        {
            // Prof 0-1: 1 grupo de 2-3, sem muro/patrulha/brute (≈ P1).
            for (uint s = 0; s < 10; s++)
                for (int d = 0; d <= 1; d++)
                {
                    var m = Topple.Core.MapGen.Generate(s, d);
                    Assert.LessOrEqual(m.Soldiers.Count, 3, $"seed {s} prof {d}: porta de entrada mansa");
                    Assert.GreaterOrEqual(m.Soldiers.Count, 2, $"seed {s} prof {d}: sempre pelotão");
                    Assert.AreEqual(0, m.Blocks.Count, $"seed {s} prof {d}: sem muro");
                    foreach (var sl in m.Soldiers)
                    {
                        Assert.AreEqual(Topple.Core.MapEnemyKind.Soldier, sl.Kind, "sem patrulha/brute no início");
                        Assert.IsNull(sl.Loop);
                    }
                }
        }

        [Test] public void MapGen_CurveWallsBeforePatrols()
        {
            // Prof 2-3: sem patrulha nem brute (muro liberado).
            for (uint s = 0; s < 10; s++)
                for (int d = 2; d <= 3; d++)
                {
                    var m = Topple.Core.MapGen.Generate(s, d);
                    foreach (var sl in m.Soldiers)
                        Assert.AreEqual(Topple.Core.MapEnemyKind.Soldier, sl.Kind, $"seed {s} prof {d}");
                }
        }

        [Test] public void MapGen_GapRules()
        {
            // Prof 0-3: sem ponte-vão.
            for (uint s = 0; s < 10; s++)
                for (int d = 0; d <= 3; d++)
                    Assert.AreEqual(0, Topple.Core.MapGen.Generate(s, d).Gaps.Count, $"seed {s} prof {d}");
            // Prof 4+: Ø 0,45-1,0 m, longe de trigger/pelotão, alcance honesto.
            for (uint s = 0; s < 20; s++)
                for (int d = 4; d < 14; d++)
                {
                    var m = Topple.Core.MapGen.Generate(s, d);
                    float tx = m.TriggerGx * 0.05f, tz = m.TriggerGz * 0.05f;
                    foreach (var g in m.Gaps)
                    {
                        Assert.GreaterOrEqual(g.RadiusCells, 4.5f, "vão mínimo");
                        Assert.LessOrEqual(g.RadiusCells, 10f, "vão máximo (Torre cobre 1,0)");
                        float need = g.RadiusCells * 2f <= 12f ? 0.6f : 1.0f;
                        Assert.AreEqual(need, g.NeedReach, "alcance da ponte");
                        float dx = (g.X - tx) / 0.05f, dz = (g.Z - tz) / 0.05f;
                        Assert.Greater(System.Math.Sqrt(dx * dx + dz * dz), g.RadiusCells + 8.0, "vão fora do trigger");
                        foreach (var sl in m.Soldiers)
                        {
                            float sx = (g.X - sl.X) / 0.05f, sz = (g.Z - sl.Z) / 0.05f;
                            Assert.Greater(System.Math.Sqrt(sx * sx + sz * sz), g.RadiusCells + 10.0, "vão fora de pelotão");
                        }
                    }
                }
        }

        [Test] public void MapGen_VoidRules()
        {
            // Prof 0-5: sem buraco.
            for (uint s = 0; s < 10; s++)
                for (int d = 0; d <= 5; d++)
                    Assert.AreEqual(0, Topple.Core.MapGen.Generate(s, d).Voids.Count, $"seed {s} prof {d}");
            // Prof 6+: 1-2 m, dentro do campo, longe de trigger/pelotão.
            for (uint s = 0; s < 20; s++)
                for (int d = 6; d < 16; d++)
                {
                    var m = Topple.Core.MapGen.Generate(s, d);
                    float tx = m.TriggerGx * 0.05f, tz = m.TriggerGz * 0.05f;
                    foreach (var v in m.Voids)
                    {
                        Assert.GreaterOrEqual(v.X0, -11f); Assert.LessOrEqual(v.X1, 11f);
                        Assert.GreaterOrEqual(v.Z0, -7f); Assert.LessOrEqual(v.Z1, 7f);
                        Assert.LessOrEqual(v.X1 - v.X0, 2.01f); Assert.LessOrEqual(v.Z1 - v.Z0, 2.01f);
                        float mx = (v.X0 + v.X1) * 0.5f, mz = (v.Z0 + v.Z1) * 0.5f;
                        float mh = System.Math.Max(v.X1 - v.X0, v.Z1 - v.Z0) * 0.5f;
                        float dx = (mx - tx) / 0.05f, dz = (mz - tz) / 0.05f;
                        Assert.Greater(System.Math.Sqrt(dx * dx + dz * dz), mh / 0.05f + 8.0, "buraco fora do trigger");
                        foreach (var sl in m.Soldiers)
                        {
                            float sx = (mx - sl.X) / 0.05f, sz = (mz - sl.Z) / 0.05f;
                            Assert.Greater(System.Math.Sqrt(sx * sx + sz * sz), mh / 0.05f + 10.0, "buraco fora de pelotão");
                        }
                    }
                }
        }

        [Test] public void MapGen_ConvertPreservesGaps()
        {
            var m = new Topple.Core.MapSpec { Name = "t", TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f, ParPieces = 8 };
            m.Soldiers.Add(new Topple.Core.MapSoldier { Kind = Topple.Core.MapEnemyKind.Soldier, X = 5f, Z = 0f });
            m.Gaps.Add(new Topple.Core.MapGap { X = 2f, Z = 0f, RadiusCells = 8f, NeedReach = 1.0f });
            var ph = TutorialSetup.ConvertMap(m);
            Assert.AreEqual(1, ph.Gaps.Count);
            Assert.AreEqual(8f * 0.05f, ph.Gaps[0].R, 1e-6f);
            Assert.AreEqual(1.0f, ph.Gaps[0].NeedReach);
        }

        [Test] public void MapGen_ConvertPreservesVoids()
        {
            var m = new Topple.Core.MapSpec { Name = "t", TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f, ParPieces = 8 };
            m.Soldiers.Add(new Topple.Core.MapSoldier { Kind = Topple.Core.MapEnemyKind.Soldier, X = 5f, Z = 0f });
            m.Voids.Add(new Topple.Core.MapVoid { X0 = 1f, Z0 = -1f, X1 = 3f, Z1 = 1f });
            var ph = TutorialSetup.ConvertMap(m);
            Assert.AreEqual(1, ph.Voids.Count);
            Assert.AreEqual(2f, ph.Voids[0].Center.x, 1e-6f);
            Assert.AreEqual(0f, ph.Voids[0].Center.z, 1e-6f);
            Assert.AreEqual(2f, ph.Voids[0].Size.x, 1e-6f);
            Assert.AreEqual(2f, ph.Voids[0].Size.z, 1e-6f);
        }

        [Test] public void MapGen_StructuralInvariants()
        {
            // 20 seeds × 10 profundidades: campo, separações, patrulha, par.
            for (uint s = 0; s < 20; s++)
                for (int d = 10; d < 20; d++)
                {
                    var m = Topple.Core.MapGen.Generate(s, d);
                    Assert.Greater(m.Soldiers.Count, 0, $"seed {s} prof {d}: sem inimigos");
                    Assert.Greater(m.ParPieces, 0, $"seed {s} prof {d}: sem par");
                    float tx = m.TriggerGx * 0.05f, tz = m.TriggerGz * 0.05f;
                    foreach (var sl in m.Soldiers)
                    {
                        Assert.Less(System.Math.Abs(sl.X), 10.01, "fora do campo");
                        Assert.Less(System.Math.Abs(sl.Z), 7.01, "fora do campo");
                        float dx = (sl.X - tx) / 0.05f, dz = (sl.Z - tz) / 0.05f;
                        Assert.Greater(System.Math.Sqrt(dx * dx + dz * dz), 24.0, $"seed {s} prof {d}: corrente quebrada");
                        if (sl.Kind == Topple.Core.MapEnemyKind.Patroller)
                        {
                            Assert.IsNotNull(sl.Loop);
                            Assert.GreaterOrEqual(sl.Loop.Count, 2, "loop fechado");
                            Assert.GreaterOrEqual(sl.Speed, 0.3f);
                            Assert.LessOrEqual(sl.Speed, 0.8f);
                        }
                    }
                    for (int i = 0; i < m.Soldiers.Count; i++)
                        for (int j = i + 1; j < m.Soldiers.Count; j++)
                        {
                            float dx = (m.Soldiers[i].X - m.Soldiers[j].X) / 0.05f;
                            float dz = (m.Soldiers[i].Z - m.Soldiers[j].Z) / 0.05f;
                            Assert.GreaterOrEqual(System.Math.Sqrt(dx * dx + dz * dz), 10.0, $"seed {s} prof {d}: soldados grudados");
                        }
                }
        }

        [Test] public void Grid_SnapNormalIs025()
        {
            Assert.AreEqual(0.05f, PlanningData.Grid);
            Assert.AreEqual(5, PlanningData.Snap(7, false)); // 7 → 5
            Assert.AreEqual(10, PlanningData.Snap(8, false)); // 8 → 10
            Assert.AreEqual(8, PlanningData.Snap(8, true)); // Alt: exato
            Assert.AreEqual(0.40f, PlanningData.ToWorld(8), 1e-6f);
        }

        [Test] public void Hand_Undo()
        {
            var d = new PlanningData();
            d.SetHand(PieceId.Common, 2);
            Assert.IsTrue(d.TryPlace(PieceId.Common, 0, 0, 6, false, out int id));
            Assert.AreEqual(1, d.HandCount(PieceId.Common));
            Assert.IsFalse(d.TryPlace(PieceId.Common, 0, 0, 6, false, out _)); // ocupada
            Assert.IsTrue(d.Undo());
            Assert.AreEqual(2, d.HandCount(PieceId.Common));
            Assert.AreEqual(0, d.Count);
            Assert.IsTrue(d.TryPlace(PieceId.Common, 0, 0, 6, false, out id));
            Assert.IsTrue(d.TryRemove(id));
            Assert.AreEqual(2, d.HandCount(PieceId.Common));
        }

        [Test] public void Locked_CannotRemove()
        {
            var d = new PlanningData();
            d.SetHand(PieceId.Common, 1);
            int id = d.PlaceLocked(PieceId.Common, 0, 0, 6);
            Assert.IsFalse(d.TryRemove(id));
            Assert.AreEqual(1, d.Count);
        }

        [Test] public void Arc_StraightAheadIsLine()
        {
            var pts = PlanningData.ArcPath(0, 0, 90f, 80, 0, 0.40f, true);
            Assert.AreEqual(11, pts.Count);
            Assert.AreEqual((0, 0, 90f), pts[0]);
            foreach (var p in pts) Assert.AreEqual(90f, p.deg);
            Assert.AreEqual((80, 0, 90f), pts[^1]);
        }

        [Test] public void Arc_ForceStraightIgnoresFacing()
        {
            // Trilha fresca no chão vazio: reta na tangente, mesmo de frente p/ o lado.
            var pts = PlanningData.ArcPath(0, 0, 0f, 40, 0, 0.40f, true, true);
            Assert.Greater(pts.Count, 1);
            foreach (var p in pts) Assert.AreEqual(90f, p.deg);
            Assert.AreEqual((40, 0, 90f), pts[^1]);
        }

        [Test] public void Arc_SideTargetCurves()
        {
            var pts = PlanningData.ArcPath(0, 0, 90f, 40, 40, 0.40f, true);
            Assert.Greater(pts.Count, 3);
            Assert.AreEqual((0, 0, 90f), pts[0]);
            bool varies = false;
            foreach (var p in pts)
            {
                if (System.Math.Abs(p.deg - 90f) > 1f) varies = true;
                // Tudo dentro do campo 24×16 (raio negativo não espelha).
                Assert.Less(System.Math.Abs(PlanningData.ToWorld(p.gx)), 12.01f);
                Assert.Less(System.Math.Abs(PlanningData.ToWorld(p.gz)), 8.01f);
            }
            Assert.IsTrue(varies, "curva deveria variar a rotação");
            var last = pts[^1];
            Assert.Less(System.Math.Abs(last.gx - 40), 3);
            Assert.Less(System.Math.Abs(last.gz - 40), 3);
        }

        [Test] public void Arc_RightSideCurvesToo()
        {
            // Raio negativo (destino à direita): endpoint não pode espelhar.
            var pts = PlanningData.ArcPath(0, 0, 90f, 40, -40, 0.40f, true);
            Assert.Greater(pts.Count, 3);
            Assert.AreEqual((0, 0, 90f), pts[0]);
            foreach (var p in pts)
            {
                Assert.Less(System.Math.Abs(PlanningData.ToWorld(p.gx)), 12.01f);
                Assert.Less(System.Math.Abs(PlanningData.ToWorld(p.gz)), 8.01f);
            }
            var last = pts[^1];
            Assert.Less(System.Math.Abs(last.gx - 40), 3);
            Assert.Less(System.Math.Abs(last.gz + 40), 3);
        }

        [Test] public void Arc_SameCellSinglePoint()
        {
            var pts = PlanningData.ArcPath(8, 8, 90f, 8, 8, 0.40f, true);
            Assert.AreEqual(1, pts.Count);
            Assert.AreEqual((8, 8, 90f), pts[0]);
        }

        [Test] public void Arc_TightTargetFallsBackToStraight()
        {
            var pts = PlanningData.ArcPath(0, 0, 90f, 2, 10, 0.40f, true);
            Assert.Greater(pts.Count, 1);
            foreach (var p in pts) Assert.AreEqual(pts[0].deg, p.deg);
        }

        [Test] public void Path_BatchUndo()
        {
            var d = new PlanningData();
            d.SetHand(PieceId.Common, 5);
            var pts = PlanningData.ArcPath(0, 0, 90f, 40, 0, 0.40f, true);
            int n = d.TryPlacePath(PieceId.Common, pts);
            Assert.Greater(n, 1);
            Assert.AreEqual(5 - n, d.HandCount(PieceId.Common));
            Assert.IsTrue(d.Undo());
            Assert.AreEqual(0, d.Count);
            Assert.AreEqual(5, d.HandCount(PieceId.Common));
        }

        [Test] public void PhaseTrigger_SinglePieceCanNeverKill()
        {
            // Corrente obrigatória: trigger a >1,2 m de todo soldado E waypoint
            // (torre, a mais longa, cobre 1,0 m) + par positivo p/ estrelas (Fase B).
            foreach (var ph in TutorialSetup.Phases)
            {
                Assert.Greater(ph.ParPieces, 0, $"fase '{ph.Name}' sem par");
                float tx = PlanningData.ToWorld(ph.TriggerGx), tz = PlanningData.ToWorld(ph.TriggerGz);
                foreach (var s in ph.Soldiers)
                {
                    float dx = s.Pos.x - tx, dz = s.Pos.z - tz;
                    Assert.Greater(System.Math.Sqrt(dx * dx + dz * dz), 1.2,
                        $"fase '{ph.Name}': trigger a {System.Math.Sqrt(dx * dx + dz * dz):F2} m de {s.Pos}");
                    foreach (var w in s.Waypoints)
                    {
                        float wx = w.x - tx, wz = w.z - tz;
                        Assert.Greater(System.Math.Sqrt(wx * wx + wz * wz), 1.2,
                            $"fase '{ph.Name}': trigger a {System.Math.Sqrt(wx * wx + wz * wz):F2} m da patrulha");
                    }
                }
            }
        }

        [Test] public void Chain_MinSpacingDropsCrowdedKeepsFirst()
        {
            // Piso: comum precisa de 0,22 m entre vizinhas (0,12 + 0,10).
            Assert.AreEqual(0.22f, PlanningData.FallRoom(PieceId.Common), 1e-6f);
            Assert.AreEqual(0.30f, PlanningData.FallRoom(PieceId.Heavy), 1e-6f);
            var pts = new System.Collections.Generic.List<(int gx, int gz, float deg)>
            {
                (0, 0, 90f), (1, 0, 90f), // 0,05 m: grudadas, a 2ª cai
                (8, 0, 90f), // 0,40 m: fica
            };
            PlanningData.DropCrowded(pts, PieceId.Common);
            Assert.AreEqual(2, pts.Count);
            Assert.AreEqual((0, 0, 90f), pts[0]);
            Assert.AreEqual((8, 0, 90f), pts[1]);
        }

        [Test] public void Fork_PlacesPairWithTwoHeads_NormalOne()
        {
            // Bifurcação de verdade: 1 carta = 2 corpos lado a lado (cada metade
            // comum 0,40, a ±0,25 m da perpendicular); cada metade é cabeça
            // própria (2 pontos p/ continuar, 1 em cada peça). Comum tem 1 filho.
            Assert.AreEqual(1, new PlanningData().MaxChildren(PieceId.Fork));
            Assert.AreEqual(1, new PlanningData().MaxChildren(PieceId.Common));
            // deg 90 (leste): metades em (0,±5).
            var (ax, az, bx, bz) = PlanningData.ForkHalves(0, 0, 90f);
            Assert.AreEqual((0, 5, 0, -5), (ax, az, bx, bz));
            var d = new PlanningData();
            d.SetHand(PieceId.Fork, 1);
            d.SetHand(PieceId.Common, 4);
            Assert.AreEqual(2, d.TryPlaceFork(0, 0, 90f));
            Assert.AreEqual(2, d.Count);
            Assert.AreEqual(0, d.HandCount(PieceId.Fork), "1 carta = 2 corpos");
            int a = d.Items[0].InstanceId, b = d.Items[1].InstanceId;
            Assert.AreNotEqual(a, b);
            Assert.AreEqual(b, d.TwinOf(a));
            Assert.AreEqual(a, d.TwinOf(b));
            Assert.IsTrue(d.IsHead(a), "metade A é cabeça");
            Assert.IsTrue(d.IsHead(b), "metade B é cabeça");
            // Continua de cada metade (1 filho cada, como dominó de verdade).
            Assert.AreEqual(1, d.TryPlacePath(PieceId.Common, new System.Collections.Generic.List<(int gx, int gz, float deg)> { (8, 5, 90f) }, a));
            int a2 = d.Items[d.Count - 1].InstanceId;
            Assert.IsFalse(d.IsHead(a), "metade com 1 filho não é cabeça");
            Assert.IsTrue(d.IsHead(b), "outra metade segue cabeça");
            Assert.AreEqual(1, d.TryPlacePath(PieceId.Common, new System.Collections.Generic.List<(int gx, int gz, float deg)> { (8, -5, 90f) }, b));
            int b2 = d.Items[d.Count - 1].InstanceId;
            Assert.IsFalse(d.IsHead(b));
            Assert.IsFalse(d.TryRemove(a), "tem continuação: remove da ponta");
            Assert.IsTrue(d.TryRemove(a2));
            Assert.IsTrue(d.TryRemove(a));
            Assert.IsTrue(d.TryRemove(b2));
            Assert.IsTrue(d.TryRemove(b));
            Assert.AreEqual(0, d.Count);
        }

        [Test] public void Fork_TwinRefundAndUndo()
        {
            // Reembolso gêmeo: tirar 1 metade devolve 0 (a outra segue no
            // tabuleiro); tirar a última devolve 1. Desfazer o par devolve 1.
            var d = new PlanningData();
            d.SetHand(PieceId.Fork, 1);
            Assert.AreEqual(2, d.TryPlaceFork(0, 0, 90f));
            int a = d.Items[0].InstanceId, b = d.Items[1].InstanceId;
            Assert.IsTrue(d.TryRemove(a), "metade sem filho remove");
            Assert.AreEqual(0, d.HandCount(PieceId.Fork), "1ª metade não devolve carta");
            Assert.AreEqual(0, d.TwinOf(b), "vínculo gêmeo cai com a 1ª remoção");
            Assert.IsTrue(d.TryRemove(b), "última metade remove");
            Assert.AreEqual(1, d.HandCount(PieceId.Fork), "última metade devolve 1");
            // Desfazer o par inteiro (1 carta) devolve exatamente 1.
            var e = new PlanningData();
            e.SetHand(PieceId.Fork, 1);
            Assert.AreEqual(2, e.TryPlaceFork(0, 0, 90f));
            Assert.IsTrue(e.Undo());
            Assert.AreEqual(0, e.Count);
            Assert.AreEqual(1, e.HandCount(PieceId.Fork), "undo do par devolve 1 carta");
            // Sem carta: não coloca (board fresco, mão zerada).
            var f = new PlanningData();
            Assert.AreEqual(0, f.TryPlaceFork(0, 0, 90f));
            Assert.AreEqual(0, f.Count);
            e.SetHand(PieceId.Fork, 1);
            // Cela ocupada por uma das metades: não coloca (nem meia carta).
            e.SetHand(PieceId.Common, 1);
            Assert.AreEqual(1, e.TryPlacePath(PieceId.Common, new System.Collections.Generic.List<(int gx, int gz, float deg)> { (0, 5, 90f) }));
            Assert.AreEqual(0, e.TryPlaceFork(0, 0, 90f));
            Assert.AreEqual(1, e.HandCount(PieceId.Fork), "falha não consome carta");
        }
    }
}
