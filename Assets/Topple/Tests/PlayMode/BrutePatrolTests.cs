// Pesadão (estrito) + patrulheiro (loop cinemático): regras provadas headless
// (determinístico). Mesmo componente do ao vivo.
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Game;
using Topple.Sim;

namespace Topple.Tests
{
    public class BrutePatrolTests
    {
        SimWorld _world;

        [UnityTearDown] public IEnumerator Teardown()
        {
            if (_world != null) { _world.Unload(); _world = null; }
            yield return null;
            yield return null;
        }

        static void ToppleOnto(SimPiece p)
        {
            var facing = p.transform.rotation * Vector3.forward;
            facing.y = 0; facing.Normalize();
            p.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
        }

        [UnityTest] public IEnumerator Brute_SurvivesCommonWave()
        {
            _world = SimWorld.Create(41001);
            _world.SpawnGround(new Vector2(24, 16));
            var brute = _world.SpawnEnemy(new EnemySpot(EnemyKind.Brute, new Vector3(2f, 0f, 0f)));
            // 1,1 m: sem overlap de spawn (comum 1,30–1,70 vs base 1,65+);
            // a comum tomba e encosta, mas toque/impulso dela não derrubam.
            var c = _world.SpawnPiece(PieceId.Common, new Vector3(1.1f, 0f, 0f), 90f);
            ToppleOnto(c);
            _world.Finish();
            Assert.IsFalse(brute.Knocked, "comum não derruba pesadão (toque/tilt ignorados)");
            yield break;
        }

        [UnityTest] public IEnumerator Brute_DiesToHeavy()
        {
            _world = SimWorld.Create(41002);
            _world.SpawnGround(new Vector2(24, 16));
            var brute = _world.SpawnEnemy(new EnemySpot(EnemyKind.Brute, new Vector3(2f, 0f, 0f)));
            // Queda a 0,9 m da base: a pesada (2 kg) chega no meio da queda
            // (~43°, ~2,5 m/s) e ENCOSTA de verdade — toque de pesada derruba.
            // (A 1,5 m ela nascia interpenetrando a base: contato no ArmAt era
            // apagado e o teste mentia.)
            var h = _world.SpawnPiece(PieceId.Heavy, new Vector3(1.1f, 0f, 0f), 90f);
            ToppleOnto(h);
            _world.Finish();
            Assert.IsTrue(brute.Knocked, "pesada derruba pesadão");
            yield break;
        }

        [UnityTest] public IEnumerator Brute_DiesToBlast()
        {
            _world = SimWorld.Create(41003);
            _world.SpawnGround(new Vector2(24, 16));
            var brute = _world.SpawnEnemy(new EnemySpot(EnemyKind.Brute, new Vector3(2f, 0f, 0f)));
            var b = _world.SpawnPiece(PieceId.Blast, new Vector3(1.2f, 0f, 0f), 90f);
            ToppleOnto(b);
            _world.Finish();
            Assert.IsTrue(brute.Knocked, "explosiva derruba pesadão (blast 1,5 m)");
            yield break;
        }

        [UnityTest] public IEnumerator Blast_SpawnContactDoesNotDetonateBeforeArmed()
        {
            _world = SimWorld.Create(41006);
            _world.SpawnGround(new Vector2(24, 16));
            var soldier = _world.SpawnEnemy(new EnemySpot(EnemyKind.Soldier, new Vector3(2f, 0f, 0f)));
            // Sobreposta no spawn (pós-Depenetrate vira contato no assentamento).
            _world.SpawnPiece(PieceId.Blast, new Vector3(1.85f, 0f, 0f), 90f);
            _world.Depenetrate();
            for (int i = 0; i < 3; i++) _world.Step(); // 0,05 s < ArmAt 0,25
            Assert.IsFalse(soldier.Knocked, "contato no assentamento não detona");
            yield break;
        }

        [UnityTest] public IEnumerator Patroller_BulldozesStandingPiece()
        {
            var loop = new System.Collections.Generic.List<Vector3>
            {
                new Vector3(4f, 0f, 0f), new Vector3(6f, 0f, 0f),
            };
            _world = SimWorld.Create(41007);
            _world.AllowEarlyOut = false;
            _world.SpawnGround(new Vector2(24, 16));
            var en = _world.SpawnEnemy(new EnemySpot(EnemyKind.Patroller, loop[0]) { Waypoints = loop, Speed = 0.6f });
            // Peça em pé NO caminho (construção válida desde o bulldoze).
            var p = _world.SpawnPiece(PieceId.Common, new Vector3(5f, 0f, 0f), 0f);
            _world.Depenetrate();
            for (int i = 0; i < 300; i++) _world.Step(); // 5 s: patrulha chega a ~1,7 s
            Assert.Greater(Vector3.Angle(p.transform.up, Vector3.up), 25f, "patrulha deveria tombar a peça parada");
            Assert.IsFalse(en.Knocked, "encosto manso não mata patrulheiro");
            yield break;
        }

        [UnityTest] public IEnumerator Patroller_LoopsClosedDeterministic()
        {
            var loop = new System.Collections.Generic.List<Vector3>
            {
                new Vector3(4f, 0f, -1f), new Vector3(6f, 0f, -1f),
                new Vector3(6f, 0f, 1f), new Vector3(4f, 0f, 1f),
            };
            _world = SimWorld.Create(41004);
            // Sem early-out: sem peças em cena o repouso congelaria a patrulha
            // (~2 s → 0,6 m) e o loop nunca fecharia. Aqui o alvo é a patrulha.
            _world.AllowEarlyOut = false;
            _world.SpawnGround(new Vector2(24, 16));
            var en = _world.SpawnEnemy(new EnemySpot(EnemyKind.Patroller, loop[0]) { Waypoints = loop, Speed = 0.3f });
            // Perímetro 8 m a 0,3 m/s = 26,67 s = 1600 passos: fecha o ciclo.
            for (int i = 0; i < 1600; i++) _world.Step();
            float d = Vector3.Distance(new Vector3(en.transform.position.x, 0f, en.transform.position.z), loop[0]);
            Assert.Less(d, 0.05f, "loop deveria fechar");
            Assert.IsFalse(en.Knocked);
            var pos1 = en.transform.position;
            _world.Unload(); _world = null;
            yield return null;
            // Segunda run idêntica: mesma posição (determinismo).
            var w2 = SimWorld.Create(41004);
            w2.AllowEarlyOut = false;
            w2.SpawnGround(new Vector2(24, 16));
            var en2 = w2.SpawnEnemy(new EnemySpot(EnemyKind.Patroller, loop[0]) { Waypoints = loop, Speed = 0.3f });
            for (int i = 0; i < 1600; i++) w2.Step();
            float d2 = Vector3.Distance(pos1, en2.transform.position);
            w2.Unload();
            Assert.Less(d2, 1e-4f, "patrulha determinística");
            yield break;
        }

        [UnityTest] public IEnumerator Patroller_StopsWhenKnocked()
        {
            var loop = new System.Collections.Generic.List<Vector3>
            {
                new Vector3(4f, 0f, 0f), new Vector3(6f, 0f, 0f),
            };
            _world = SimWorld.Create(41005);
            _world.SpawnGround(new Vector2(24, 16));
            var en = _world.SpawnEnemy(new EnemySpot(EnemyKind.Patroller, loop[0]) { Waypoints = loop, Speed = 0.3f });
            var h = _world.SpawnPiece(PieceId.Heavy, new Vector3(3.2f, 0f, 0f), 90f);
            ToppleOnto(h);
            _world.Finish();
            Assert.IsTrue(en.Knocked, "pesada derruba patrulheiro");
            Assert.IsFalse(en.Rb.isKinematic, "derrubado vira corpo dinâmico");
            yield break;
        }

        [UnityTest] public IEnumerator Teams_SamePhysicsOnlyNarrative()
        {
            // Times (dono): bem ciano x mal vermelho, SÓ visual — mesma física.
            _world = SimWorld.Create(41007);
            _world.SpawnGround(new Vector2(24, 16));
            var evil = _world.SpawnEnemy(new EnemySpot(EnemyKind.Soldier, new Vector3(2f, 0f, 0f)) { Team = Team.Evil });
            var good = _world.SpawnEnemy(new EnemySpot(EnemyKind.Soldier, new Vector3(4f, 0f, 0f)) { Team = Team.Good });
            Assert.AreEqual(Team.Evil, evil.Team, "time preservado no spawn");
            Assert.AreEqual(Team.Good, good.Team, "time preservado no spawn");
            Assert.AreEqual(evil.Rb.mass, good.Rb.mass, "mesma massa");
            Assert.AreEqual(evil.KnockImpulse, good.KnockImpulse, "mesmo limiar");
            var c1 = _world.SpawnPiece(PieceId.Common, new Vector3(1.1f, 0f, 0f), 90f);
            var c2 = _world.SpawnPiece(PieceId.Common, new Vector3(3.1f, 0f, 0f), 90f);
            ToppleOnto(c1); ToppleOnto(c2);
            _world.Finish();
            Assert.IsTrue(evil.Knocked && good.Knocked, "os dois times caem igual (só narrativa)");
            // Prefab do bem existe (GenerateAll) com o time assado.
            var prefab = PrefabRegistry.Soldier(Team.Good);
            Assert.IsNotNull(prefab, "prefab do bem deveria existir (GenerateAll)");
            Assert.AreEqual(Team.Good, prefab.GetComponent<EnemyView>().Team);
            yield break;
        }
    }
}
