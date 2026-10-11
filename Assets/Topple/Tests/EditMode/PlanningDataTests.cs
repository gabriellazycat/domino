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
    }
}
