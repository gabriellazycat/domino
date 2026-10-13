// Content/ (pesos fora do código): o JSON fonte é o espelho exato do Base
// embutido — este teste quebra se derivarem (editar os dois juntos).
// Também prova que o override via JSON dirige drafts idênticos (caminho T5).
using System.IO;
using NUnit.Framework;
using UnityEngine;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class ContentTests
    {
        static string ContentPath(string file) => Application.dataPath + "/Topple/Content/" + file;

        [Test] public void Content_RewardJsonMirrorsBasePack()
        {
            var pack = ContentLoader.LoadRewards(File.ReadAllText(ContentPath("reward-weights.json")));
            var basePack = RewardPool.BasePackForTest();
            Assert.AreEqual(basePack.Entries.Count, pack.Entries.Count, "nº de entradas");
            for (int i = 0; i < basePack.Entries.Count; i++)
            {
                var b = basePack.Entries[i];
                var j = pack.Entries[i];
                Assert.AreEqual(b.MinPhase, j.MinPhase, $"entry {i} minPhase");
                Assert.AreEqual(b.Weight, j.Weight, $"entry {i} weight");
                Assert.AreEqual(b.Label, j.Label, $"entry {i} label");
                Assert.AreEqual(b.ScaledCommons, j.ScaledCommons, $"entry {i} scaledCommons");
                Assert.AreEqual(b.Items.Length, j.Items.Length, $"entry {i} items");
                for (int k = 0; k < b.Items.Length; k++)
                {
                    Assert.AreEqual(b.Items[k].Piece, j.Items[k].Piece, $"entry {i} item {k} piece");
                    Assert.AreEqual(b.Items[k].Count, j.Items[k].Count, $"entry {i} item {k} count");
                }
            }
        }

        [Test] public void Content_ShopJsonMirrorsRules()
        {
            Assert.IsTrue(ContentLoader.ValidateShop(File.ReadAllText(ContentPath("shop.json")), out var problem),
                "shop.json derivou: " + problem);
        }

        [Test] public void Content_JsonPackDrivesIdenticalDrafts()
        {
            var pack = ContentLoader.LoadRewards(File.ReadAllText(ContentPath("reward-weights.json")));
            try
            {
                RewardPool.UsePack(pack);
                var rngJ = new ToppleRng(4242);
                var fromJson = RewardPool.Draft3(ref rngJ, 5);
                RewardPool.ResetPack();
                var rngB = new ToppleRng(4242);
                var fromBase = RewardPool.Draft3(ref rngB, 5);
                Assert.AreEqual(fromBase.Count, fromJson.Count);
                for (int i = 0; i < fromBase.Count; i++)
                    Assert.AreEqual(fromBase[i].Label, fromJson[i].Label, $"draft {i}");
            }
            finally { RewardPool.ResetPack(); }
        }

        [Test] public void Content_BadJsonThrowsWithReason()
        {
            Assert.Throws<System.ArgumentException>(() => ContentLoader.LoadRewards(""));
            Assert.Throws<System.ArgumentException>(
                () => ContentLoader.LoadRewards(@"{""entries"":[{""minPhase"":0,""weight"":1,""label"":""X"",""scaledCommons"":false,""items"":[{""piece"":""Inexistente"",""count"":1}]}]}"));
            Assert.IsFalse(ContentLoader.ValidateShop("{}", out _));
        }
    }
}
