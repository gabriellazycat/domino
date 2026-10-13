// T0: teste EditMode de exemplo — precisa passar. GDD §15.4.
using NUnit.Framework;
using Topple.Core;

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
    }
}
