// T3: simulacao visivel na cena principal (fisica padrao do Unity) com as MESMAS
// regras do nucleo T1 (SimPiece/SimEnemy, knock S6, fim por repouso/45 s).
// O gatilho (1a peca) recebe o impulso inicial fixo (GDD 4.1).
using System;
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;
using Topple.Sim;

namespace Topple.Game
{
    public struct SimResult
    {
        public bool Win;
        public int Knocked;
        public int Total;
        public float Elapsed;
    }

        public struct ObstacleDef
        {
            public Vector3 Center;
            public Vector3 Size;
            public Topple.Core.BlockVariant Variant; // só pintura (Stone default)
        }

    public sealed class SimulationController : MonoBehaviour
    {
        public bool Running { get; private set; }
        public float SimTime { get; private set; }
        public Vector3 LastKnockPoint { get; private set; }
        public event Action<SimResult> OnDone;

        public int KnockedSoFar
        {
            get
            {
                int k = 0;
                foreach (var en in _enemies) if (en != null && en.Knocked) k++;
                return k;
            }
        }

        public int EnemyCount => _enemies.Count;

        // P/ testes (vitrine→sim): inimigos vivos da sim atual.
        public System.Collections.Generic.IReadOnlyList<SimEnemy> Enemies => _enemies;

        readonly List<GameObject> _spawned = new();
        readonly List<SimEnemy> _enemies = new();
        readonly List<Rigidbody> _bodies = new();
        readonly List<(float t, Vector3 p)> _knocks = new();
        GameObject _container;
        float _stillTime;
        bool _finished;

        static Material _obsStone, _obsHouse, _obsFence;

        public static Material ObstacleMat() => ObstacleMat(Topple.Core.BlockVariant.Stone);

        // Muros por variante (dono): só pintura, mesmo collider e validade.
        // Pedra cinza atual; casa tijolo (sem telhado: visibilidade);
        // cerca madeira baixa (bloqueia igual muro).
        public static Material ObstacleMat(Topple.Core.BlockVariant v)
        {
            switch (v)
            {
                case Topple.Core.BlockVariant.House:
                    if (_obsHouse == null) _obsHouse = MakeObstacle(new Color(0.58f, 0.36f, 0.26f));
                    return _obsHouse;
                case Topple.Core.BlockVariant.Fence:
                    if (_obsFence == null) _obsFence = MakeObstacle(new Color(0.45f, 0.31f, 0.18f));
                    return _obsFence;
                default:
                    if (_obsStone == null) _obsStone = MakeObstacle(new Color(0.55f, 0.55f, 0.60f));
                    return _obsStone;
            }
        }

        static Material MakeObstacle(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.color = c; // pedra/tijolo/madeira (ArtBible na T5)
            return m;
        }

        public void StartSim(List<Placement> layout, List<EnemySpot> spots, List<ObstacleDef> statics = null, float patrolOffset = 0f)
        {
            SimBuilder.EnsurePhysicsDefaults();
            StopSim();
            _container = new GameObject("SimLive");
            _stillTime = 0f; SimTime = 0f; _finished = false;
            _knocks.Clear(); LastKnockPoint = Vector3.zero;

            if (statics != null)
            {
                foreach (var o in statics)
                {
                    var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    box.name = "Obstacle";
                    box.transform.SetParent(_container.transform, false);
                    box.transform.SetPositionAndRotation(o.Center, Quaternion.identity);
                    box.transform.localScale = o.Size;
                    box.GetComponent<Renderer>().sharedMaterial = ObstacleMat(o.Variant);
                    var orb = box.GetComponent<Rigidbody>();
                    if (orb == null) orb = box.AddComponent<Rigidbody>();
                    orb.isKinematic = true;
                }
            }

            var ordered = new List<Placement>(layout);
            ordered.Sort((a, b) => a.InstanceId.CompareTo(b.InstanceId));
            Rigidbody firstRb = null;
            Vector3 firstFacing = Vector3.right;
            foreach (var p in ordered)
            {
                var prefab = PrefabRegistry.Piece(p.Piece);
                if (prefab == null) continue;
                var go = Instantiate(prefab, _container.transform);
                go.transform.SetPositionAndRotation(
                    new Vector3(PlanningData.ToWorld(p.Gx), PlanningController.GroundY, PlanningData.ToWorld(p.Gz)),
                    Quaternion.Euler(0, p.Deg, 0));
                var rb = go.GetComponent<Rigidbody>();
                if (rb != null) { rb.isKinematic = false; rb.sleepThreshold = 0.005f; _bodies.Add(rb); }
                EnsureWood(go);
                var sp = go.GetComponent<SimPiece>();
                if (sp == null) sp = go.AddComponent<SimPiece>();
                sp.Id = p.InstanceId; sp.Piece = p.Piece;
                sp.ArmAt = 0.25f; // ignora o impacto de assentamento no spawn
                _spawned.Add(go);
                if (firstRb == null && rb != null) // 1a peca (menor id)
                {
                    firstRb = rb;
                    firstFacing = go.transform.rotation * Vector3.forward;
                    firstFacing.y = 0; firstFacing.Normalize();
                }
            }
            var soldierPrefab = PrefabRegistry.Soldier();
            var brutePrefab = PrefabRegistry.Brute();
            var soldierGoodPrefab = PrefabRegistry.Soldier(Team.Good);
            var bruteGoodPrefab = PrefabRegistry.Brute(Team.Good);
            foreach (var s in spots)
            {
                bool brute = s.Kind == Topple.Core.EnemyKind.Brute;
                bool patrol = s.Kind == Topple.Core.EnemyKind.Patroller && s.Waypoints.Count >= 2;
                // Time só troca o prefab (fallback p/ Evil se o Good faltar).
                var prefab = brute
                    ? (s.Team == Team.Good && bruteGoodPrefab != null ? bruteGoodPrefab : brutePrefab)
                    : (s.Team == Team.Good && soldierGoodPrefab != null ? soldierGoodPrefab : soldierPrefab);
                if (prefab == null) continue;
                var go = Instantiate(prefab, _container.transform);
                go.transform.SetPositionAndRotation(s.Pos, Quaternion.identity);
                var rb = go.GetComponent<Rigidbody>();
                // Patrulheiro nasce kinematic (anda no loop); vira corpo ao cair.
                if (rb != null) { rb.isKinematic = patrol; rb.sleepThreshold = 0.005f; _bodies.Add(rb); }
                EnsureWood(go);
                var en = go.GetComponent<SimEnemy>();
                if (en == null) en = go.AddComponent<SimEnemy>();
                en.Kind = s.Kind;
                en.Team = s.Team;
                // Continuidade com a vitrine: nasce onde ESTAVA (offset 0 = waypoint 0).
                if (patrol) en.PatrolOffset = patrolOffset;
                if (patrol)
                {
                    en.Patrol = new System.Collections.Generic.List<Vector3>(s.Waypoints);
                    en.PatrolSpeed = s.Speed;
                }
                en.ArmAt = 0.25f;
                _enemies.Add(en);
                _spawned.Add(go);
            }
            DepenetrateSpawned();
            if (firstRb != null) // impulso inicial sempre o mesmo (GDD 4.1)
                firstRb.angularVelocity = Vector3.Cross(Vector3.up, firstFacing) * 4.5f;
            Running = true;
            Debug.Log($"[TOPPLE][SIM] start corpos={_bodies.Count} inimigos={_enemies.Count} " +
                $"impulso={firstRb != null} auto={Physics.simulationMode} grav={Physics.gravity}");
        }

        // Rede de seguranca p/ prefabs antigos (gerados antes do fix de atrito):
        // garante madeira 0,75 em runtime, igual ao headless. Humano e bot iguais.
        static void EnsureWood(GameObject go)
        {
            var wood = SimBuilder.Wood;
            if (wood == null) return;
            foreach (var c in go.GetComponentsInChildren<Collider>(true))
            {
                if (c is BoxCollider box) box.material = wood;
                else if (c is CapsuleCollider cap) cap.material = wood;
                else if (c is SphereCollider sph) sph.material = wood;
                else if (c is MeshCollider mesh) mesh.material = wood;
            }
        }

        // Zera micro-penetracoes de spawn (ordem de spawn = deterministico).
        void DepenetrateSpawned()
        {
            var dyn = new List<Rigidbody>();
            foreach (var b in _bodies)
                if (b != null && !b.isKinematic) dyn.Add(b);
            var cols = new List<Collider>();
            for (int p = 0; p < 3; p++)
            {
                for (int i = 0; i < dyn.Count; i++)
                {
                    var a = dyn[i];
                    if (a == null) continue;
                    a.gameObject.GetComponentsInChildren(cols);
                    for (int j = i + 1; j < dyn.Count; j++)
                    {
                        var b = dyn[j];
                        if (b == null) continue;
                        var others = new List<Collider>();
                        b.gameObject.GetComponentsInChildren(others);
                        foreach (var c in cols)
                        {
                            if (c == null || !c.enabled) continue;
                            foreach (var o in others)
                            {
                                if (o == null || !o.enabled) continue;
                                if (Physics.ComputePenetration(c, c.transform.position, c.transform.rotation,
                                        o, o.transform.position, o.transform.rotation,
                                        out Vector3 dir, out float dist) && dist > 1e-5f)
                                {
                                    a.transform.position += dir * (dist * 0.5f + 0.0005f);
                                    b.transform.position -= dir * (dist * 0.5f + 0.0005f);
                                }
                            }
                        }
                    }
                    cols.Clear();
                }
            }
            foreach (var b in dyn)
            {
                if (b == null) continue;
                b.position = b.transform.position;
                b.rotation = b.transform.rotation;
                b.linearVelocity = Vector3.zero;
                b.angularVelocity = Vector3.zero;
            }
            Physics.SyncTransforms();
        }

        public void StopSim()
        {
            Running = false;
            if (_container != null) Destroy(_container);
            _container = null;
            _spawned.Clear(); _enemies.Clear(); _bodies.Clear();
        }

        void FixedUpdate()
        {
            if (!Running || _finished) return;
            SimTime += Time.fixedDeltaTime;

            foreach (var en in _enemies)
            {
                if (en == null) continue;
                if (!en.Knocked && en.Patrol.Count >= 2) en.PatrolAdvance(SimTime);
                if (en.ShoveActive(SimTime)) en.ApplyShove();
                // Paridade headless: patrulha empurra peça em pé no caminho.
                if (!en.Knocked && en.Patrol.Count >= 2)
                    foreach (var go in _spawned)
                    {
                        if (go == null) continue;
                        var sp = go.GetComponent<SimPiece>();
                        if (sp != null) en.TryBulldoze(sp, SimTime);
                    }
            }
            // Paridade com SimWorld.KeepLeanersAwake (caminho visivel nao tem golden).
            foreach (var b in _bodies)
            {
                if (b == null || b.isKinematic) continue;
                if (Vector3.Angle(b.transform.up, Vector3.up) > 12f) b.WakeUp();
            }
            foreach (var b in _bodies.ToArray())
            {
                if (b == null) continue;
                if (b.transform.position.y < SimWorld.KillY)
                {
                    var en = b.GetComponent<SimEnemy>();
                    if (en != null && !en.Knocked)
                    {
                        en.MarkKnocked(SimTime, "fell");
                        SimEnemy.Splash(en, _enemies, SimTime);
                        RegisterKnock(en.transform.position);
                    }
                    b.gameObject.SetActive(false);
                }
            }
            int before = _knocks.Count;
            foreach (var en in _enemies)
            {
                if (en == null || en.Knocked) continue;
                if (en.CheckKnocked(SimTime))
                {
                    SimEnemy.Splash(en, _enemies, SimTime);
                    RegisterKnock(en.transform.position);
                }
            }
            // Encostou, derruba (paridade headless): toque em peça em pé
            // continua a onda — consome no passo, como os inimigos.
            foreach (var go in _spawned)
            {
                if (go == null) continue;
                var sp = go.GetComponent<SimPiece>();
                if (sp != null) sp.CheckTouched(SimTime);
            }
            // Explosiva: detonacao em area (raio fixo, deterministico).
            foreach (var go in _spawned)
            {
                if (go == null) continue;
                var sp = go.GetComponent<SimPiece>();
                if (sp == null || !sp.ConsumeBlast(SimTime)) continue;
                foreach (var en in _enemies)
                {
                    if (en == null || en.Knocked) continue;
                    var d = en.transform.position - sp.transform.position;
                    d.y = 0f;
                    if (d.sqrMagnitude <= SimPiece.BlastRadius * SimPiece.BlastRadius)
                    {
                        if (d.sqrMagnitude < 1e-6f) d = Vector3.right;
                        en.MarkKnocked(SimTime, "blast", d, 3.0f);
                        SimEnemy.Splash(en, _enemies, SimTime);
                        RegisterKnock(en.transform.position);
                    }
                }
            }
            // Vitoria imediata: zerou os inimigos, acabou (nao espera aquietar
            // nem os 45 s - peca rolando pra sempre prendia a sim).
            if (_enemies.Count > 0 && KnockedSoFar >= _enemies.Count) { Finish(); return; }

            float maxSpeed = 0f;
            foreach (var b in _bodies)
            {
                if (b == null || !b.gameObject.activeSelf || b.isKinematic) continue;
                float v = b.linearVelocity.magnitude;
                if (v > maxSpeed) maxSpeed = v;
            }
            if (maxSpeed < SimWorld.StillSpeed) _stillTime += Time.fixedDeltaTime;
            else _stillTime = 0f;

            if (_stillTime >= SimWorld.StillSeconds || SimTime >= 45f) Finish();
        }

        void RegisterKnock(Vector3 p)
        {
            LastKnockPoint = p;
            _knocks.Add((SimTime, p));
        }

        void Finish()
        {
            _finished = true;
            Running = false;
            int knocked = 0;
            foreach (var en in _enemies) if (en != null && en.Knocked) knocked++;
            OnDone?.Invoke(new SimResult
            {
                Win = knocked >= _enemies.Count && _enemies.Count > 0,
                Knocked = knocked,
                Total = _enemies.Count,
                Elapsed = SimTime,
            });
        }
    }
}
