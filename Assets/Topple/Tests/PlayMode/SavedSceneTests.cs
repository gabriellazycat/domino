// Regressão do bug "bandeja zerada": mão/trigger vivem em C# não serializado —
// abrir Tutorial.unity precisa reconstruir tudo no Start. Testa o caminho real
// do jogador (LoadScene, sem Build programático).
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Game;
using Topple.Sim;

namespace Topple.Tests
{
    public class SavedSceneTests
    {
        // Restaura cena vazia: sem isto, os testes seguintes herdariam o setup
        // vivo da Tutorial (duplo placement/sim). NOTA 11/out/2026: descarregar
        // cenas via UnloadSceneAsync travava o runner (main parado, física a
        // 3 núcleos, sem completar) — destrói as raízes, que é o que contamina.
        // O teste de LoadScene usa Single (troca tudo de todo jeito).
        [UnityTearDown] public IEnumerator RestoreEmptyScene()
        {
            foreach (var setup in Object.FindObjectsByType<TutorialSetup>(FindObjectsSortMode.None))
                Object.Destroy(setup.gameObject);
            yield return null;
            yield return null;
        }

        [UnityTest] public IEnumerator SavedScene_LoadsPlayableAndBotWins()
        {
            var op = SceneManager.LoadSceneAsync("Tutorial", LoadSceneMode.Single);
            int loadGuard = 0;
            while (!op.isDone && loadGuard++ < 900) yield return null;
            Assert.IsTrue(op.isDone, "LoadScene Tutorial não completou em ~15 s");
            yield return null; // Start() reconstrói o cenário
            yield return null;

            var setup = Object.FindFirstObjectByType<TutorialSetup>();
            Assert.IsNotNull(setup, "TutorialSetup ausente na cena salva");
            Assert.AreEqual(ToppleRules.StartingCommons, setup.Planning.Data.HandCount(PieceId.Common), "mão zerada no load");
            Assert.AreEqual(0, setup.Planning.Data.Count, "tabuleiro deveria começar vazio");
            Assert.AreEqual(3, setup.SoldierSpots.Count);
            Assert.IsTrue(setup.Planning.Active);
            Assert.IsTrue(setup.Planning.PathArmed, "trilha deveria nascer ligada");

            // Bot completa pela API de jogador e a fase é vencida (headless).
            PlanningBot.SolveTutorial(setup.Planning);
            Assert.AreEqual(9, setup.Planning.Data.Count);
            var world = SimWorld.Create(20261009);
            try
            {
                world.SpawnGround(new Vector2(24, 16));
                SimPiece first = null;
                int lowest = int.MaxValue;
                foreach (var p in setup.Planning.Data.Items)
                {
                    var sp = world.SpawnPiece(p.Piece,
                        new Vector3(PlanningData.ToWorld(p.Gx), 0, PlanningData.ToWorld(p.Gz)),
                        p.Deg);
                    if (p.InstanceId < lowest) { lowest = p.InstanceId; first = sp; }
                }
                var facing = first.transform.rotation * Vector3.forward;
                facing.y = 0; facing.Normalize();
                first.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
                var soldiers = new SimEnemy[setup.SoldierSpots.Count];
                for (int i = 0; i < soldiers.Length; i++)
                    soldiers[i] = world.SpawnSoldier(setup.SoldierSpots[i].Pos);
                world.Finish();
                int knocked = 0;
                foreach (var s in soldiers) if (s.Knocked) knocked++;
                Debug.Log($"[TOPPLE][SCENE] knocked={knocked}/{soldiers.Length}");
                Assert.AreEqual(soldiers.Length, knocked);
            }
            finally { world.Unload(); }
            Object.Destroy(setup.gameObject);
            yield return null;
        }

        [UnityTest] public IEnumerator ProceduralScene_StartsGeneratedFromPhase1()
        {
            var op = SceneManager.LoadSceneAsync("Procedural", LoadSceneMode.Single);
            int loadGuard = 0;
            while (!op.isDone && loadGuard++ < 900) yield return null;
            Assert.IsTrue(op.isDone, "LoadScene Procedural não completou em ~15 s");
            yield return null; // Start() reconstrói o cenário
            yield return null;

            var setup = Object.FindFirstObjectByType<TutorialSetup>();
            Assert.IsNotNull(setup, "TutorialSetup ausente na cena Procedural");
            Assert.IsTrue(setup.ProceduralFromStart, "cena Procedural deveria ligar a flag");
            Assert.AreEqual(0, setup.PhaseIndex);
            Assert.IsTrue(setup.PhaseName.StartsWith("Gerada"), "fase 1 procedural: " + setup.PhaseName);
            Assert.Greater(setup.SoldierSpots.Count, 0, "fase gerada tem inimigos");
            Assert.AreEqual(ToppleRules.StartingCommons, setup.Planning.Data.HandCount(PieceId.Common), "deck base intacto");
            Assert.IsTrue(setup.Planning.Active);
            Assert.IsTrue(setup.Planning.PathArmed, "trilha deveria nascer ligada");
            // Avança: fase 2 também gerada (determinística na run).
            setup.LoadPhase(1);
            yield return null;
            Assert.AreEqual(1, setup.PhaseIndex);
            Assert.IsTrue(setup.PhaseName.StartsWith("Gerada"), "fase 2 procedural: " + setup.PhaseName);
            Object.Destroy(setup.gameObject);
            yield return null;
        }

        [UnityTest] public IEnumerator Progression_LoadPhaseResets()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("PhaseTest");
                yield return null;
                Assert.AreEqual(0, setup.PhaseIndex);
                Assert.AreEqual(ToppleRules.StartingCommons, setup.Planning.Data.HandCount(PieceId.Common));
                setup.LoadPhase(1);
                yield return null;
                Assert.AreEqual(1, setup.PhaseIndex);
                var ph = TutorialSetup.Phases[1];
                Assert.AreEqual(ToppleRules.StartingCommons, setup.Planning.Data.HandCount(PieceId.Common));
            Assert.AreEqual(0, setup.Planning.Data.Count); // tabuleiro vazio
            Assert.AreEqual(4, setup.SoldierSpots.Count); // fase 2 tem 4
            Assert.IsTrue(setup.Planning.Active);
            // Zona de construção destacada (GDD §4.1) existe, ativa e translúcida.
            var zone = setup.transform.Find("BuildZone");
            Assert.IsNotNull(zone, "BuildZone ausente");
            Assert.IsTrue(zone.gameObject.activeSelf);
            var zr = zone.GetComponent<Renderer>();
            Assert.IsNotNull(zr);
            Assert.Less(((Material)zr.sharedMaterial).color.a, 0.5f);
                Debug.Log($"[TOPPLE][SCENE] fase 2 ok: {ph.Name}");
            }
            finally { if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
    }
}
