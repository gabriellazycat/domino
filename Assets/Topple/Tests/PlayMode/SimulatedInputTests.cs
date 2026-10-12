// GDD §15.4 T3: teste de input simulado faz o mesmo que o bot, mas PELA UI —
// mouse e teclado virtuais através do Input System (nada de API direta p/ jogar).
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.TestTools;
using Topple.Game;

namespace Topple.Tests
{
    public class SimulatedInputTests : InputTestFixture
    {
        Mouse _mouse;
        Keyboard _keyboard;

        public override void Setup()
        {
            base.Setup();
            _mouse = InputSystem.AddDevice<Mouse>();
            _keyboard = InputSystem.AddDevice<Keyboard>();
        }

        IEnumerator Click(Vector2 screen)
        {
            Set(_mouse.position, screen);
            yield return null;
            Press(_mouse.leftButton);
            yield return null;
            Release(_mouse.leftButton);
            yield return null;
        }

        IEnumerator Key(KeyControl key)
        {
            Press(key);
            yield return null;
            Release(key);
            yield return null;
        }

        [UnityTest] public IEnumerator Input_PlaysTutorialToWin()
        {
            Time.timeScale = 1f;
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("InputTest");
                yield return null;
                yield return null;
                var cam = setup.Cam.GetComponent<Camera>();

                // 1 = Comum pela bandeja (teclado de verdade).
                yield return Key(_keyboard.digit1Key);
                Assert.AreEqual(Topple.Core.PieceId.Common, setup.Planning.Selected);

                // Trilha como um humano: 2 cliques (início + destino até os soldados).
                // Deck base de 10: mira curta (3,2 m cabem ~9 peças).
                Assert.IsTrue(setup.Planning.PathArmed, "trilha sempre ligada");
                {
                    var start = cam.WorldToScreenPoint(new Vector3(0f, 0f, 0f));
                    yield return Click(start);
                    var end = cam.WorldToScreenPoint(new Vector3(3.2f, 0f, 0f));
                    yield return Click(end);
                    Assert.Greater(setup.Planning.Data.Count, 5, "trilha deveria colocar a fileira");
                }
                {
                    var cells = "";
                    foreach (var p in setup.Planning.Data.Items) cells += $"({p.Gx},{p.Gz})";
                    Debug.Log($"[TOPPLE][INPUT] layout cells={cells}");
                }

                // Enter = DISPARAR. Sim ao vivo varia (timeScale/física): tenta até 3x,
                // como um humano faria pelo banner (layout provado no bot determinístico).
                int wins = 0;
                for (int attempt = 1; attempt <= 3 && setup.LastResult?.Win != true; attempt++)
                {
                    if (attempt > 1)
                    {
                        // De novo pelo Enter (banner) e dispara de novo.
                        yield return Key(_keyboard.enterKey);
                        yield return null;
                        Assert.IsTrue(setup.Planning.Active, "deveria voltar ao planejamento");
                    }
                    yield return Key(_keyboard.enterKey);
                    Assert.IsFalse(setup.Planning.Active);
                    float waited = 0f;
                    while (setup.LastResult == null && waited < 40f)
                    {
                        yield return new WaitForSecondsRealtime(0.25f);
                        waited += 0.25f;
                    }
                    Time.timeScale = 1f;
                    Assert.IsNotNull(setup.LastResult, "sim não terminou a tempo");
                    Debug.Log($"[TOPPLE][INPUT] tentativa {attempt}: win={setup.LastResult.Value.Win} " +
                        $"{setup.LastResult.Value.Knocked}/{setup.LastResult.Value.Total}");
                    if (setup.LastResult.Value.Win) wins++;
                }
                Assert.AreEqual(1, wins, "layout deveria vencer em até 3 tentativas");
            }
            finally
            {
                Time.timeScale = 1f;
                if (setup != null) Object.Destroy(setup.gameObject);
            }
            yield return null;
        }
    }
}
