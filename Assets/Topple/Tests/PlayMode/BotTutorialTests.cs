// GDD §15.4 T3: PlanningBot completa o tutorial usando SÓ comandos de jogador.
// Validação headless rápida (SimWorld) com a mesma geometria da fase.
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Game;
using Topple.Sim;

namespace Topple.Tests
{
    public class BotTutorialTests
    {
        TutorialSetup _setup;

        [UnityTearDown] public IEnumerator Teardown()
        {
            if (_setup != null) { Object.Destroy(_setup.gameObject); _setup = null; }
            Time.timeScale = 1f;
            yield return null;
            yield return null;
        }

        [UnityTest] public IEnumerator Bot_CompletesTutorial()
        {
            _setup = TutorialSetup.Build("BotTest");
            yield return null; // HUD/input assentam

            PlanningBot.SolveTutorial(_setup.Planning);
            Assert.AreEqual(9, _setup.Planning.Data.Count); // 1ª peça + 8 (deck base)

            // Mesma fase no SimWorld headless (rápido e determinístico).
            var world = SimWorld.Create(20261009);
            try
            {
                world.SpawnGround(new Vector2(24, 16));
                SimPiece first = null;
                int lowest = int.MaxValue;
                foreach (var p in _setup.Planning.Data.Items)
                {
                    var sp = world.SpawnPiece(p.Piece,
                        new Vector3(PlanningData.ToWorld(p.Gx), 0, PlanningData.ToWorld(p.Gz)),
                        p.Deg);
                    if (p.InstanceId < lowest) { lowest = p.InstanceId; first = sp; } // 1ª colocada cai 1º
                }
                // Gatilho igual ao da cena: giro no lugar, mesma direção da peça.
                var facing = first.transform.rotation * Vector3.forward;
                facing.y = 0; facing.Normalize();
                first.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
                SimEnemy[] soldiers = new SimEnemy[_setup.SoldierSpots.Count];
                for (int i = 0; i < soldiers.Length; i++)
                    soldiers[i] = world.SpawnSoldier(_setup.SoldierSpots[i].Pos);
                var rec = world.Finish();
                int knocked = 0;
                foreach (var s in soldiers) if (s.Knocked) knocked++;
                Debug.Log($"[TOPPLE][BOT] steps={rec.Frames[^1].Step} knocked={knocked}/{soldiers.Length}");
                Assert.AreEqual(soldiers.Length, knocked);
            }
            finally { world.Unload(); }
            yield break;
        }
    }
}
