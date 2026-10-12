// T3: matemática do planejamento (grade, linha, desfazer, mão). Pura, rápida.
using NUnit.Framework;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class PlanningDataTests
    {
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
