// GDD §12 + §15.4 T1: SimWorld — cena Unity com física própria (LocalPhysicsMode.Physics3D),
// avançada manualmente em passos de 1/60s, mais rápido que o tempo real (headless).
// Determinismo local: passo fixo, seed, ordem estável de spawn, sem Time.deltaTime.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using Topple.Core;

namespace Topple.Sim
{
    public sealed class SimWorld
    {
        public const float StepDt = 1f / 60f;
        public const int MaxSteps = 45 * 60; // 45 s de simulação, GDD §4.2
        public const float StillSeconds = 2f; // fim quando nada relevante se move por 2 s
        public const float StillSpeed = 0.08f; // limiar de repouso (m/s) — vira dado na T5
        public const float KillY = -5f; // plano de queda, GDD §13.4
        public const int RecordEverySteps = 2; // ~30 Hz, dentro da faixa 20–30 Hz (§12)

        readonly Scene _scene;
        readonly PhysicsScene _physics;
        readonly ToppleRng _rng;
        readonly List<SimBody> _bodies = new();
        readonly List<SimEvent> _events = new();
        readonly List<SimFrame> _frames = new();
        int _nextId = 1;
        int _steps;
        float _stillTime;
        bool _ended;

        public uint Seed { get; }
        public int StepCount => _steps;
        public float Time => _steps * StepDt;
        public bool Ended => _ended;
        public bool AllowEarlyOut { get; set; } = true;
        // T-fases: peças que rastejam devagar (< sleepThreshold) adormecem no meio
        // da queda e congelam a onda. Com a flag, inclinadas >12° não dormem.
        // Default ON desde 11/out (escada adormecida matava a onda no ao vivo).
        public bool KeepLeanersAwake { get; set; } = true;
        public IReadOnlyList<SimEvent> Events => _events;

        SimWorld(Scene scene, PhysicsScene physics, uint seed)
        {
            _scene = scene; _physics = physics; Seed = seed;
            _rng = new ToppleRng(seed);
        }

        public static SimWorld Create(uint seed, string name = null)
        {
            SimBuilder.EnsurePhysicsDefaults();
            var p = new CreateSceneParameters(LocalPhysicsMode.Physics3D);
            var scene = SceneManager.CreateScene(name ?? $"SimWorld_{seed}", p);
            return new SimWorld(scene, scene.GetPhysicsScene(), seed);
        }

        // GDD §4.2: a seed controla pequenas imperfeições nas peças.
        float Jitter(float range) => (_rng.NextFloat() * 2f - 1f) * range;

        public SimPiece SpawnPiece(PieceId piece, Vector3 pos, float rotYDeg)
        {
            pos.x += Jitter(0.002f); pos.z += Jitter(0.002f);
            var go = SimBuilder.BuildPiece(piece);
            go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0, rotYDeg + Jitter(0.5f), 0));
            SceneManager.MoveGameObjectToScene(go, _scene);
            var id = _nextId++;
            var sp = go.AddComponent<SimPiece>();
            sp.Id = id; sp.Piece = piece;
            sp.ArmAt = Time + 0.25f; // ignora o impacto de assentamento no spawn
            _bodies.Add(new SimBody(id, go, sp.Rb, BodyKind.Piece));
            return sp;
        }

        public SimEnemy SpawnSoldier(Vector3 pos) => SpawnEnemy(pos);

        // Deckbuilder: spawna por tipo (pesadão + patrulheiro com loop).
        public SimEnemy SpawnEnemy(EnemySpot spot)
        {
            var pos = spot.Pos;
            pos.x += Jitter(0.002f); pos.z += Jitter(0.002f);
            var go = spot.Kind == Topple.Core.EnemyKind.Brute
                ? SimBuilder.BuildBrute() : SimBuilder.BuildSoldier();
            go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0, Jitter(180f), 0));
            SceneManager.MoveGameObjectToScene(go, _scene);
            var id = _nextId++;
            var en = go.AddComponent<SimEnemy>();
            en.Id = id;
            en.Kind = spot.Kind;
            if (spot.Kind == Topple.Core.EnemyKind.Patroller && spot.Waypoints.Count >= 2)
            {
                en.Patrol = new System.Collections.Generic.List<Vector3>(spot.Waypoints);
                en.PatrolSpeed = spot.Speed;
            }
            en.ArmAt = Time + 0.25f; // ignora o impacto de assentamento no spawn
            _bodies.Add(new SimBody(id, go, en.Rb, BodyKind.Enemy));
            return en;
        }

        SimEnemy SpawnEnemy(Vector3 pos)
        {
            pos.x += Jitter(0.002f); pos.z += Jitter(0.002f);
            var go = SimBuilder.BuildSoldier();
            go.transform.SetPositionAndRotation(pos, Quaternion.Euler(0, Jitter(180f), 0));
            SceneManager.MoveGameObjectToScene(go, _scene);
            var id = _nextId++;
            var en = go.AddComponent<SimEnemy>();
            en.Id = id;
            en.ArmAt = Time + 0.25f; // ignora o impacto de assentamento no spawn
            _bodies.Add(new SimBody(id, go, en.Rb, BodyKind.Enemy));
            return en;
        }

        public void SpawnGround(Vector2 size)
        {
            var go = SimBuilder.BuildGround(size);
            go.transform.position = new Vector3(0, -0.25f, 0);
            SceneManager.MoveGameObjectToScene(go, _scene);
        }

        // Obstáculo estático do cenário (muros, plataformas). Só colisor, sem corpo.
        public void SpawnStaticBox(Vector3 center, Vector3 size)
        {
            var go = new GameObject("Static");
            var col = go.AddComponent<BoxCollider>();
            col.size = size;
            go.transform.position = center;
            SceneManager.MoveGameObjectToScene(go, _scene);
        }

        public void Step()
        {
            if (_ended) return;
            float now = Time;
            if (KeepLeanersAwake)
            {
                foreach (var b in _bodies)
                {
                    if (!b.Go.activeSelf || b.Rb == null || b.Rb.isKinematic) continue;
                    if (Vector3.Angle(b.Go.transform.up, Vector3.up) > 12f) b.Rb.WakeUp();
                }
            }
            foreach (var b in _bodies)
            {
                if (b.Kind != BodyKind.Enemy || !b.Go.activeSelf) continue;
                var en = b.Go.GetComponent<SimEnemy>();
                if (en == null) continue;
                if (!en.Knocked && en.Patrol.Count >= 2) en.PatrolAdvance(Time);
                if (en.ShoveActive(now)) en.ApplyShove();
            }
            _physics.Simulate(StepDt);
            _steps++;

            float maxSpeed = 0f;
            foreach (var b in _bodies)
            {
                if (!b.Go.activeSelf) continue;
                if (b.Rb != null && !b.Rb.isKinematic)
                {
                    var v = b.Rb.linearVelocity.magnitude;
                    if (v > maxSpeed) maxSpeed = v;
                }
                if (b.Go.transform.position.y < KillY)
                {
                    if (b.Kind == BodyKind.Enemy)
                    {
                        var en = b.Go.GetComponent<SimEnemy>();
                        if (en != null && !en.Knocked)
                        {
                            en.MarkKnocked(Time, "fell");
                            SimEnemy.Splash(en, Enemies(), Time);
                            _events.Add(new SimEvent(Time, "knock", b.Id, 0));
                        }
                    }
                    b.Go.SetActive(false); // plano de queda remove o corpo
                    continue;
                }
                if (b.Kind == BodyKind.Enemy)
                {
                    var en = b.Go.GetComponent<SimEnemy>();
                    if (en != null && !en.Knocked && en.CheckKnocked(Time))
                    {
                        SimEnemy.Splash(en, Enemies(), Time);
                        _events.Add(new SimEvent(Time, "knock", b.Id, 0));
                    }
                }
                if (b.Kind == BodyKind.Piece)
                {
                    // Encostou, derruba: toque em peça em pé continua a onda
                    // (consome no passo, com o relógio da sim, como os inimigos).
                    var sp = b.Go.GetComponent<SimPiece>();
                    if (sp != null) sp.CheckTouched(Time);
                    if (sp != null && sp.ConsumeBlast()) Detonate(sp);
                }
            }

            if (_steps % RecordEverySteps == 0) RecordFrame();

            if (maxSpeed < StillSpeed) _stillTime += StepDt; else _stillTime = 0f;
            if (_steps >= MaxSteps || (AllowEarlyOut && _stillTime >= StillSeconds)) { _ended = true; RecordFrame(); }
        }

        void RecordFrame()
        {
            var f = new SimFrame { Step = _steps };
            foreach (var b in _bodies)
            {
                if (!b.Go.activeSelf) continue;
                if (b.Rb != null && b.Rb.IsSleeping()) continue; // só corpos acordados, GDD §9
                var t = b.Go.transform;
                f.Samples.Add(new SimSample(b.Id, t.position, t.rotation));
            }
            _frames.Add(f);
        }

        public SimRecording Finish(string hash = null)
        {
            while (!_ended) Step();
            var rec = new SimRecording
            {
                Header = new SimHeader { Version = 1, Seed = Seed, StepHz = 1f / StepDt, FrameCount = _frames.Count, Hash = hash ?? string.Empty },
                Events = _events.ToArray(),
                Frames = _frames.ToArray(),
            };
            return rec;
        }

        // Explosiva: detonação em área (raio fixo, determinístico). Mata por
        // proximidade mesmo sem toque — diferencia do splash de pelotão.
        void Detonate(SimPiece sp)
        {
            foreach (var b in _bodies)
            {
                if (b.Kind != BodyKind.Enemy || !b.Go.activeSelf) continue;
                var en = b.Go.GetComponent<SimEnemy>();
                if (en == null || en.Knocked) continue;
                var d = b.Go.transform.position - sp.transform.position;
                d.y = 0f;
                if (d.sqrMagnitude <= SimPiece.BlastRadius * SimPiece.BlastRadius)
                {
                    if (d.sqrMagnitude < 1e-6f) d = Vector3.right;
                    en.MarkKnocked(Time, "blast", d, 3.0f);
                    SimEnemy.Splash(en, Enemies(), Time);
                    _events.Add(new SimEvent(Time, "knock", b.Id, 0));
                }
            }
        }

        // Lista p/ splash de pelotão (só em knock, raro; sem custo no passo).
        List<SimEnemy> Enemies()
        {
            var l = new List<SimEnemy>();
            foreach (var b in _bodies)
            {
                if (b.Kind != BodyKind.Enemy) continue;
                var en = b.Go.GetComponent<SimEnemy>();
                if (en != null) l.Add(en);
            }
            return l;
        }

        // Diagnóstico: quantos corpos tombaram além de minDeg (inclui adormecidos).
        public int CountTilted(float minDeg)
        {
            int n = 0;
            foreach (var b in _bodies)
            {
                if (!b.Go.activeSelf) continue;
                if (Vector3.Angle(b.Go.transform.up, Vector3.up) > minDeg) n++;
            }
            return n;
        }

        // Robustez de spawn: o jitter (±2 mm) pode criar micro-penetrações em
        // contatos exatos, e o solver ejeta (pop) na primeira etapa. Resolve todas
        // antes de soltar (ordem por id → determinístico). Chamar após spawnar tudo.
        public void Depenetrate(int passes = 3)
        {
            var dyn = new List<SimBody>();
            foreach (var b in _bodies)
            {
                if (!b.Go.activeSelf) continue;
                if (b.Rb == null || b.Rb.isKinematic) continue;
                dyn.Add(b);
            }
            dyn.Sort((a, b) => a.Id.CompareTo(b.Id));
            var cols = new List<Collider>();
            for (int p = 0; p < passes; p++)
            {
                foreach (var b in dyn)
                {
                    b.Go.GetComponentsInChildren(cols);
                    foreach (var other in dyn)
                    {
                        if (other.Id <= b.Id) continue;
                        var others = new List<Collider>();
                        other.Go.GetComponentsInChildren(others);
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
                                    b.Go.transform.position += dir * (dist * 0.5f + 0.0005f);
                                    other.Go.transform.position -= dir * (dist * 0.5f + 0.0005f);
                                }
                            }
                        }
                    }
                    cols.Clear();
                }
            }
            foreach (var b in dyn)
            {
                b.Rb.position = b.Go.transform.position;
                b.Rb.rotation = b.Go.transform.rotation;
                b.Rb.linearVelocity = Vector3.zero;
                b.Rb.angularVelocity = Vector3.zero;
            }
            Physics.SyncTransforms();
        }

        public void Unload()
        {
            foreach (var b in _bodies)
                if (b.Go != null) Object.Destroy(b.Go);
            _bodies.Clear();
            if (_scene.IsValid()) SceneManager.UnloadSceneAsync(_scene);
        }

        enum BodyKind { Piece, Enemy }

        sealed class SimBody
        {
            public readonly int Id; public readonly GameObject Go;
            public readonly Rigidbody Rb; public readonly BodyKind Kind;
            public SimBody(int id, GameObject go, Rigidbody rb, BodyKind kind)
            { Id = id; Go = go; Rb = rb; Kind = kind; }
        }
    }
}
