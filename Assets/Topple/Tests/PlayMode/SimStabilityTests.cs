// GDD §15.4 T1: 500 peças + 20 inimigos simulam 45 s em até 10 s headless;
// mesma seed/build repete a gravação byte a byte; cascata simples derruba o esperado.
using System.Collections;
using System.Diagnostics;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Sim;

namespace Topple.Tests
{
    public class SimStabilityTests
    {
        const uint CascadeSeed = 20261009;
        const string GoldenName = "cascade-v1.bin";

        static string GoldenPath => Path.Combine(
            Application.dataPath, "Topple", "Tests", "PlayMode", "Golden", GoldenName);

        SimWorld _world;

        [UnityTearDown] public IEnumerator Teardown()
        {
            if (_world != null) { _world.Unload(); _world = null; }
            yield return null;
            yield return null;
        }

        // Fileira de 12 dominós + 3 soldados: o gatilho é um giro na primeira peça.
        static void BuildCascade(SimWorld w, out SimEnemy[] soldiers, out SimPiece[] pieces)
        {
            w.SpawnGround(new Vector2(24, 16));
            pieces = new SimPiece[12];
            for (int i = 0; i < 12; i++)
                pieces[i] = w.SpawnPiece(PieceId.Common, new Vector3(i * 0.38f, 0, 0), 90f);
            // Gatilho (Peça Zero): giro no lugar, sem empurrar a base (evita deslizar).
            // Impulso inicial sempre o mesmo, GDD §4.1.
            pieces[0].Rb.angularVelocity = new Vector3(0, 0, -4.5f);
            soldiers = new SimEnemy[3];
            float lastX = 11 * 0.38f; // último dominó; cai deitado até ~lastX+0,4
            for (int k = 0; k < 3; k++)
                soldiers[k] = w.SpawnSoldier(new Vector3(lastX + 0.55f + k * 0.6f, 0, 0));
        }

        static void BuildCascade(SimWorld w, out SimEnemy[] soldiers)
        {
            BuildCascade(w, out soldiers, out _);
        }

        static int KnockedCount(SimEnemy[] soldiers)
        {
            int n = 0;
            foreach (var s in soldiers) if (s.Knocked) n++;
            return n;
        }

        [UnityTest] public IEnumerator Cascade_KnocksExpectedEnemies()
        {
            _world = SimWorld.Create(CascadeSeed);
            BuildCascade(_world, out var soldiers, out var pieces);
            var rec = _world.Finish();
            // Perfil da onda direto da gravação: passo em que cada peça passou de 20°.
            // Onda saudável = intervalos constantes (~19 passos/peça em 0,38 m).
            var wave = "";
            for (int i = 0; i < pieces.Length; i++)
            {
                int at = -1;
                foreach (var f in rec.Frames)
                {
                    foreach (var s in f.Samples)
                    {
                        if (s.Id != pieces[i].Id) continue;
                        if (Vector3.Angle(s.Rot * Vector3.up, Vector3.up) > 20f) { at = f.Step; break; }
                    }
                    if (at >= 0) break;
                }
                wave += $"[{i}@{at}]";
            }
            UnityEngine.Debug.Log($"[TOPPLE][SIM] cascade steps={rec.Frames[^1].Step} events={rec.Events.Length} " +
                $"knocked={KnockedCount(soldiers)} tilted25={_world.CountTilted(25f)} wave={wave}");
            Assert.That(KnockedCount(soldiers), Is.GreaterThanOrEqualTo(1));
            yield break;
        }

        [UnityTest] public IEnumerator Recording_SameSeedSameBytes()
        {
            _world = SimWorld.Create(CascadeSeed);
            BuildCascade(_world, out _);
            var a = SimSerializer.Save(_world.Finish());
            _world.Unload(); _world = null;
            yield return null;

            _world = SimWorld.Create(CascadeSeed);
            BuildCascade(_world, out _);
            var b = SimSerializer.Save(_world.Finish());
            UnityEngine.Debug.Log($"[TOPPLE][SIM] determinism bytesA={a.Length} bytesB={b.Length}");
            Assert.AreEqual(a.Length, b.Length);
            Assert.AreEqual(SimSerializer.HashOf(a), SimSerializer.HashOf(b));
            CollectionAssert.AreEqual(a, b);
        }

        [UnityTest] public IEnumerator Load_45sSim_In10sWallClock()
        {
            _world = SimWorld.Create(777);
            _world.AllowEarlyOut = false; // mede o pior caso: os 45 s cheios de física
            _world.SpawnGround(new Vector2(24, 16));
            SimPiece corner = null;
            for (int r = 0; r < 20; r++)
                for (int c = 0; c < 25; c++)
                {
                    var p = _world.SpawnPiece(PieceId.Common, new Vector3(-8.4f + c * 0.7f, 0, -5.7f + r * 0.6f), (c * 7) % 24 * 15 % 360);
                    if (r == 0 && c == 0) corner = p;
                }
            for (int k = 0; k < 20; k++)
                _world.SpawnSoldier(new Vector3(-8f + k * 0.85f, 0, 6.5f));
            // Agita o campo: empurra o canto para abrir uma onda de quedas.
            corner.Rb.linearVelocity = new Vector3(3.0f, 0.5f, 2.0f);
            corner.Rb.angularVelocity = new Vector3(2.0f, 0, -4.0f);
            var sw = Stopwatch.StartNew();
            var rec = _world.Finish();
            sw.Stop();
            var bytes = SimSerializer.Save(rec);
            UnityEngine.Debug.Log($"[TOPPLE][SIM] load steps={rec.Frames[^1].Step} frames={rec.Frames.Length} " +
                $"wall={sw.Elapsed.TotalSeconds:F2}s bytes={bytes.Length} hash={SimSerializer.HashOf(bytes)[..12]}");
            Assert.LessOrEqual(sw.Elapsed.TotalSeconds, 10.0);
            Assert.LessOrEqual(bytes.Length, 6 * 1024 * 1024); // folga sobre a estimativa §9/§17 (~1-2 MB)
            yield break;
        }

        [UnityTest] public IEnumerator Chain_GrazeStillKnocks()
        {
            // Roçar tomba (pedido do dono): 2ª peça a 0,38 m com desvio lateral
            // 0,35 (só 0,05 de sobreposição de face) — física pura desliza no
            // canto, encostou-derruba tomba de verdade.
            _world = SimWorld.Create(61001);
            _world.SpawnGround(new Vector2(24, 16));
            var p1 = _world.SpawnPiece(PieceId.Common, new Vector3(0f, 0f, 0f), 90f);
            var p2 = _world.SpawnPiece(PieceId.Common, new Vector3(0.38f, 0f, 0.35f), 90f);
            _world.Depenetrate();
            p1.Rb.angularVelocity = new Vector3(0, 0, -4.5f);
            _world.Finish();
            float tilt = Vector3.Angle(p2.transform.up, Vector3.up);
            UnityEngine.Debug.Log($"[TOPPLE][SIM] graze tilt={tilt:F1}");
            Assert.Greater(tilt, 20f, "rocar deveria tombar a peca");
            yield break;
        }

        [UnityTest] public IEnumerator Golden_CascadeMatchesReference()
        {
            _world = SimWorld.Create(CascadeSeed);
            BuildCascade(_world, out var soldiers);
            var rec = _world.Finish();
            var bytes = SimSerializer.Save(rec);
            var dir = Path.GetDirectoryName(GoldenPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            if (!File.Exists(GoldenPath))
            {
                File.WriteAllBytes(GoldenPath, bytes);
                UnityEngine.Debug.Log($"[TOPPLE][SIM] golden criado: {GoldenPath} ({bytes.Length} bytes)");
                Assert.Pass("Golden criado nesta primeira execução; próximas validam contra ele.");
            }
            var golden = File.ReadAllBytes(GoldenPath);
            UnityEngine.Debug.Log($"[TOPPLE][SIM] golden hash={SimSerializer.HashOf(golden)[..12]} run hash={SimSerializer.HashOf(bytes)[..12]}");
            Assert.AreEqual(SimSerializer.HashOf(golden), SimSerializer.HashOf(bytes));
            Assert.That(KnockedCount(soldiers), Is.GreaterThanOrEqualTo(1));
            yield break;
        }
    }
}
