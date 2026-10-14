// T0: teste EditMode de exemplo — precisa passar. GDD §15.4.
using NUnit.Framework;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class BootstrapTests
    {
        [Test] public void Morale_FirstAttemptIsFree()
        {
            Assert.AreEqual(0, ToppleRules.MoraleCostForAttempt(0));
            Assert.AreEqual(1, ToppleRules.MoraleCostForAttempt(1));
        }

        [Test] public void Slots_KnownCosts()
        {
            Assert.AreEqual(1, ToppleRules.SlotCost(PieceId.Common));
            Assert.AreEqual(2, ToppleRules.SlotCost(PieceId.Heavy));
            Assert.AreEqual(6, ToppleRules.SlotCost(PieceId.Giant));
        }

        [Test] public void Gold_StarsFormula()
        {
            Assert.AreEqual(12 + 6 * 3 + 6, ToppleRules.GoldForPhase(3, true));
            Assert.AreEqual(3, ToppleRules.StarsForWin(true, true));
        }

        [Test] public void Rng_SameSeedSameSequence()
        {
            var a = new ToppleRng(12345); var b = new ToppleRng(12345);
            Assert.AreEqual(a.Next(), b.Next());
            Assert.AreEqual(a.NextFloat(), b.NextFloat());
        }

        [Test] public void Zoom_ClampZoomFasterAndBounded()
        {
            float keep = CameraController.ZoomStep;
            try
            {
                CameraController.ZoomStep = 0.05f;
                // Roda +100 aproxima 5 m (era 2 m no 0,02: zoom mais rápido).
                Assert.AreEqual(17f, CameraController.ClampZoom(22f, 100f, 8f, 40f), 1e-6f);
                // Trava nos limites (livre 8–40, follow 3–40).
                Assert.AreEqual(8f, CameraController.ClampZoom(8f, 100f, 8f, 40f), 1e-6f);
                Assert.AreEqual(40f, CameraController.ClampZoom(40f, -100f, 8f, 40f), 1e-6f);
                Assert.AreEqual(3f, CameraController.ClampZoom(3f, 100f, 3f, 40f), 1e-6f);
            }
            finally { CameraController.ZoomStep = keep; }
        }
    }
}
