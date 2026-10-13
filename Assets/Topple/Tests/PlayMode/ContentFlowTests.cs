// Fluxos T5/Content: JSON fonte dirige o draft, stingers tocam sem erro e o
// Juice instala o Volume+Bloom. Rápidos (sem simulação), no Build programático.
using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class ContentFlowTests
    {
        [UnityTest] public IEnumerator Content_JsonDrivesDraftInGame()
        {
            // O mesmo JSON que o jogo aplica no InitScenario dirige drafts
            // válidos (3 distintos) em todas as fases — sem tocar no global.
            string json = File.ReadAllText(Application.dataPath + "/Topple/Content/reward-weights.json");
            var pack = ContentLoader.LoadRewards(json);
            var stash = RewardPool.BasePackForTest();
            try
            {
                RewardPool.UsePack(pack);
                for (int phase = 0; phase <= 9; phase++)
                {
                    var rng = new ToppleRng(100u + (uint)phase);
                    var draft = RewardPool.Draft3(ref rng, phase);
                    Assert.AreEqual(3, draft.Count, $"fase {phase}");
                    Assert.AreNotEqual(draft[0].Label, draft[1].Label);
                    Assert.AreNotEqual(draft[1].Label, draft[2].Label);
                    Assert.AreNotEqual(draft[0].Label, draft[2].Label);
                }
                Assert.AreSame(stash, RewardPool.BasePackForTest(), "Base intacto após override");
            }
            finally { RewardPool.ResetPack(); }
            yield return null;
        }

        [UnityTest] public IEnumerator Audio_StingersPlayWithoutError()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("ContentAudio");
                yield return null;
                Assert.IsNotNull(setup.Audio);
                setup.Audio.Knock(); // 8 cliques em ciclo (podem faltar em build sem wav: mudo, sem erro)
                setup.Audio.UiClick();
                setup.Audio.Win(); // stingers T4 (idem: sem clipe = silencioso)
                setup.Audio.Lose();
            }
            finally { if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        [UnityTest] public IEnumerator Juice_InstallsVolumeWithBloom()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("ContentJuice");
                yield return null;
                Assert.IsTrue(setup.Juice.HasPostFX(),
                    "Juice deveria instalar Volume global com Bloom + vinheta");
                setup.Juice.EnsureVolume(); // idempotente: 2ª chamada não duplica
                Assert.IsTrue(setup.Juice.HasPostFX());
                int vols = setup.GetComponentsInChildren<UnityEngine.Rendering.Volume>(true).Length;
                Assert.AreEqual(1, vols, "1 Volume por cena");
            }
            finally { if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
    }
}
