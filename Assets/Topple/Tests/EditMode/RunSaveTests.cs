// Auto-save: round-trip preserva run inteira (deck/vida/ouro/seed/RNG/fase).
using NUnit.Framework;
using UnityEngine;
using Topple.Core;

namespace Topple.Tests
{
    public class RunSaveTests
    {
        [Test] public void Save_RoundTripPreservesRun()
        {
            var r = RunState.NewRun(777);
            r.ApplyReward(new[] { (PieceId.Heavy, 2), (PieceId.Fork, 1) });
            r.Gold = 25;
            r.PhaseIndex = 4;
            r.ExtraAttempts = 1;
            r.AttemptsLeft = 2;
            r.Damage(3); // vida 10 → 7
            uint state0 = r.Rng.State;
            var json = JsonUtility.ToJson(RunSave.FromRun(r));
            var back = JsonUtility.FromJson<RunSave>(json);
            Assert.AreEqual(1, back.version);
            var r2 = RunState.NewRun(1);
            back.ApplyTo(r2);
            Assert.AreEqual(r.Seed, r2.Seed);
            Assert.AreEqual(7, r2.Life);
            Assert.AreEqual(4, r2.PhaseIndex);
            Assert.AreEqual(25, r2.Gold);
            Assert.AreEqual(1, r2.ExtraAttempts);
            Assert.AreEqual(2, r2.AttemptsLeft);
            Assert.AreEqual(r.DeckCount(PieceId.Common), r2.DeckCount(PieceId.Common));
            Assert.AreEqual(r.DeckCount(PieceId.Heavy), r2.DeckCount(PieceId.Heavy));
            Assert.AreEqual(r.DeckCount(PieceId.Fork), r2.DeckCount(PieceId.Fork));
            Assert.AreEqual(state0, r2.Rng.State, "RNG exato (drafts/mapas iguais pós-load)");
            // Determinismo futuro: mesmos draws dos dois lados.
            Assert.AreEqual(r.Rng.Next(), r2.Rng.Next());
        }

        [Test] public void Save_InfoIsReadable()
        {
            var r = RunState.NewRun(5);
            r.PhaseIndex = 2;
            var s = RunSave.FromRun(r);
            StringAssert.Contains("Fase 3", s.Info());
        }
    }
}
