// Deckbuilder: RunState (deck/vida/tentativas/dano) + RewardPool determinístico.
// Puros, rápidos, sem UnityEngine.
using NUnit.Framework;
using Topple.Core;

namespace Topple.Tests
{
    public class RunStateTests
    {
        [Test] public void NewRun_GoldZeroExtraAttemptsZero()
        {
            var run = RunState.NewRun(5);
            Assert.AreEqual(0, run.Gold);
            Assert.AreEqual(0, run.ExtraAttempts);
        }

        [Test] public void ShopPrice_ScalesWithSlots()
        {
            Assert.AreEqual(5, ToppleRules.ShopPrice(PieceId.Common, 1));
            Assert.AreEqual(20, ToppleRules.ShopPrice(PieceId.Common, 4));
            Assert.AreEqual(30, ToppleRules.ShopPrice(PieceId.Fork, 2));
            Assert.AreEqual(15, ToppleRules.ShopPrice(PieceId.Heavy, 1) + ToppleRules.ShopPrice(PieceId.Common, 1));
        }

        [Test] public void ShopEvery3_OccasionalNeverEveryPhase()
        {
            // Loja ocasião, nunca toda fase: a cada 3 (fases 3, 6, 9… = idx 2, 5, 8…).
            Assert.AreEqual(3, ToppleRules.ShopEvery);
            Assert.IsFalse(ToppleRules.IsShopPhase(0));
            Assert.IsFalse(ToppleRules.IsShopPhase(1));
            Assert.IsTrue(ToppleRules.IsShopPhase(2));
            Assert.IsFalse(ToppleRules.IsShopPhase(3));
            Assert.IsFalse(ToppleRules.IsShopPhase(4));
            Assert.IsTrue(ToppleRules.IsShopPhase(5));
            Assert.IsTrue(ToppleRules.IsShopPhase(8));
            for (int i = 0; i < 30; i++)
                Assert.AreEqual((i + 1) % 3 == 0, ToppleRules.IsShopPhase(i), "fase " + i);
        }
        [Test] public void NewRun_DeckBase10ComunsVida10()
        {
            var run = RunState.NewRun(1234);
            Assert.AreEqual(10, run.DeckCount(PieceId.Common));
            Assert.AreEqual(ToppleRules.StartingForks, run.DeckCount(PieceId.Fork));
            Assert.AreEqual(10 + ToppleRules.StartingForks, run.DeckTotal());
            Assert.AreEqual(10, run.Life);
            Assert.AreEqual(0, run.PhaseIndex);
            Assert.AreEqual(3, run.AttemptsLeft);
            Assert.IsFalse(run.IsDead);
        }

        [Test] public void Attempts_Spend3ThenBlocked()
        {
            var run = RunState.NewRun(1);
            Assert.IsTrue(run.SpendAttempt());
            Assert.IsTrue(run.SpendAttempt());
            Assert.IsTrue(run.SpendAttempt());
            Assert.AreEqual(0, run.AttemptsLeft);
            Assert.IsFalse(run.SpendAttempt());
            run.RefillAttempts();
            Assert.AreEqual(3, run.AttemptsLeft);
        }

        [Test] public void Damage_BrutalSemTeto()
        {
            var run = RunState.NewRun(1);
            Assert.AreEqual(7, run.Damage(3));
            Assert.IsFalse(run.IsDead);
            Assert.AreEqual(-3, run.Damage(10));
            Assert.IsTrue(run.IsDead);
        }

        [Test] public void Reward_AppliesBundle()
        {
            var run = RunState.NewRun(1);
            run.ApplyReward(new[] { (PieceId.Fork, 2), (PieceId.Common, 5) });
            Assert.AreEqual(2 + ToppleRules.StartingForks, run.DeckCount(PieceId.Fork));
            Assert.AreEqual(15, run.DeckCount(PieceId.Common));
            Assert.AreEqual(15 + 2 + ToppleRules.StartingForks, run.DeckTotal());
        }

        [Test] public void Draft3_Sempre3DistintasDeterministico()
        {
            var rngA = new ToppleRng(777);
            var rngB = new ToppleRng(777);
            var a = RewardPool.Draft3(ref rngA, 0);
            var b = RewardPool.Draft3(ref rngB, 0);
            Assert.AreEqual(3, a.Count);
            for (int i = 0; i < 3; i++)
            {
                Assert.AreEqual(a[i].Label, b[i].Label);
                Assert.AreEqual(a[i].Items.Length, b[i].Items.Length);
            }
            Assert.AreNotEqual(a[0].Label, a[1].Label);
            Assert.AreNotEqual(a[1].Label, a[2].Label);
            Assert.AreNotEqual(a[0].Label, a[2].Label);
        }

        [Test] public void Draft3_DesbloqueiaPorFase()
        {
            var rng = new ToppleRng(42);
            var early = RewardPool.Draft3(ref rng, 0);
            foreach (var o in early)
                foreach (var it in o.Items)
                    Assert.IsTrue(it.piece == PieceId.Common || it.piece == PieceId.Heavy || it.piece == PieceId.Big,
                        "fase 0 só comuns/pesada/grande, sem exóticas");
            // Fork desbloqueia na fase 2+: em 50 seeds aparece com certeza prática.
            bool hasFork = false;
            for (uint s = 0; s < 50 && !hasFork; s++)
            {
                var r = new ToppleRng(1000 + s);
                foreach (var o in RewardPool.Draft3(ref r, 9))
                    foreach (var it in o.Items)
                        if (it.piece == PieceId.Fork) hasFork = true;
            }
            Assert.IsTrue(hasFork, "fork deveria ser oferecido até a fase 9");
        }

        [Test] public void Draft3_SemParDominado()
        {
            // Regressão do relato "3 vs 4 Comuns": dois packs puro-comum no mesmo
            // draft = um domina o outro e não há escolha. Varre fases 0-9 × seeds.
            for (int phase = 0; phase <= 9; phase++)
                for (uint s = 0; s < 30; s++)
                {
                    var r = new ToppleRng(5000 + s * 131u + (uint)phase);
                    int pureCommons = 0;
                    foreach (var o in RewardPool.Draft3(ref r, phase))
                    {
                        bool pure = o.Items.Length > 0;
                        foreach (var it in o.Items)
                            if (it.piece != PieceId.Common) pure = false;
                        if (pure) pureCommons++;
                    }
                    Assert.LessOrEqual(pureCommons, 1,
                        $"fase {phase} seed {s}: {pureCommons} packs puro-comum no mesmo draft");
                }
        }

        [Test] public void Draft3_SemRampa()
        {
            // Pedido do dono: rampa fora do draft. Varre fases 0–9 × seeds.
            for (int phase = 0; phase <= 9; phase++)
                for (uint s = 0; s < 30; s++)
                {
                    var r = new ToppleRng(9000 + s * 131u + (uint)phase);
                    foreach (var o in RewardPool.Draft3(ref r, phase))
                        foreach (var it in o.Items)
                            Assert.AreNotEqual(PieceId.Ramp, it.piece,
                                $"fase {phase} seed {s}: rampa oferecida no draft");
                }
        }
    }
}
