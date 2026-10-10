// GDD §13.2/§13.3 + §16 (física instável): primitivas, massas e solver de partida.
// Geradores fiéis com chanfro/skins entram na T2; aqui o foco é estabilidade do núcleo.
// Todas as medidas em metros (1 unidade = 1 m), pivô no centro da face inferior.
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    public static class SimBuilder
    {
        static PhysicsMaterial _wood;
        static bool _defaultsSet;

        public static PhysicsMaterial Wood
        {
            get { EnsurePhysicsDefaults(); return _wood; }
        }

        public static void EnsurePhysicsDefaults()
        {
            // GDD §13.2: madeira atrito 0,5/quique 0,05; solver 12/4; sleep 0,05.
            if (_wood == null)
            {
                // Calibragem T1: 0,75 em vez de 0,5 — com 0,5 as bases patinam e a
                // onda da cascata decai (tilt 71°→24° ao longo de 12 peças). GDD §13.2
                // autoriza calibrar; número final vai para Content/ na T5.
                _wood = new PhysicsMaterial("ToppleWood")
                {
                    staticFriction = 0.75f, dynamicFriction = 0.75f, bounciness = 0.05f,
                    frictionCombine = PhysicsMaterialCombine.Average,
                    bounceCombine = PhysicsMaterialCombine.Minimum,
                };
            }
            if (!_defaultsSet)
            {
                Physics.defaultSolverIterations = 12;
                Physics.defaultSolverVelocityIterations = 4;
                Physics.sleepThreshold = 0.01f; // T1: 0,05 congelava peças de 0,8 m no meio da queda (velocidades típicas ~0,03 m/s)
                _defaultsSet = true;
            }
        }

        static void AddBoxVisual(GameObject parent, Vector3 size, Vector3 center, Color color)
        {
            // Visual provisório T1 (malha built-in, sem colisor): geradores fiéis na T2.
            var v = new GameObject("Visual");
            v.transform.SetParent(parent.transform, false);
            v.transform.localPosition = center;
            v.transform.localScale = size;
            var mf = v.AddComponent<MeshFilter>();
            mf.sharedMesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            var mr = v.AddComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"))
            {
                color = color
            };
        }

        static GameObject Base(string name, Vector3 size, float mass, bool kinematic = false)
        {
            var go = new GameObject(name);
            // Pivô no centro da face inferior: collider centrado em +h/2.
            var col = go.AddComponent<BoxCollider>();
            col.size = size; col.center = new Vector3(0, size.y / 2f, 0);
            col.material = _wood;
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = mass;
            rb.sleepThreshold = 0.01f; // GDD §13.2
            rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            rb.isKinematic = kinematic;
            go.transform.position = Vector3.zero;
            AddBoxVisual(go, size, new Vector3(0, size.y / 2f, 0), new Color(0.55f, 0.36f, 0.22f));
            return go;
        }

        public static GameObject BuildPiece(PieceId piece)
        {
            EnsurePhysicsDefaults();
            return piece switch
            {
                // GDD §13.2: Comum 0,40×0,80×0,12 — 0,5 kg.
                PieceId.Common => Base("Common", new Vector3(0.40f, 0.80f, 0.12f), 0.5f),
                // GDD §13.2: Pesada 0,45×0,80×0,20 — 2,0 kg.
                PieceId.Heavy => Base("Heavy", new Vector3(0.45f, 0.80f, 0.20f), 2.0f),
                // GDD §13.2: Rampa cunha 0,60×altura×0,40 — 1,0 kg.
                // T1: corpo estático aproximado por caixa (cunha real na T2); não participa da cascata como corpo livre.
                PieceId.Ramp => BuildRamp(0.35f),
                PieceId.Giant => Base("Giant", new Vector3(2.00f, 4.00f, 0.60f), 40f),
                _ => Base(piece.ToString(), new Vector3(0.40f, 0.80f, 0.12f), 0.5f),
            };
        }

        static GameObject BuildRamp(float height)
        {
            var go = new GameObject("Ramp");
            var col = go.AddComponent<BoxCollider>();
            col.size = new Vector3(0.60f, height, 0.40f);
            col.center = new Vector3(0, height / 2f, 0);
            col.material = _wood;
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = 1.0f;
            rb.isKinematic = true; // rampa é obstáculo fixo no MVP
            rb.sleepThreshold = 0.01f;
            return go;
        }

        static void AddPrimitiveVisual(GameObject parent, string meshName, Vector3 scale, Vector3 localPos, Color color)
        {
            var v = new GameObject("Visual");
            v.transform.SetParent(parent.transform, false);
            v.transform.localPosition = localPos;
            v.transform.localScale = scale;
            var mf = v.AddComponent<MeshFilter>();
            var mesh = Resources.GetBuiltinResource<Mesh>(meshName);
            if (mesh != null) mf.sharedMesh = mesh;
            else v.transform.localScale = Vector3.one; // sem malha: esconde o visual
            if (mesh == null) { Object.Destroy(v); return; }
            var mr = v.AddComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"))
            {
                color = color
            };
        }

        public static GameObject BuildSoldier()
        {
            // GDD §13.3: base Ø0,50×0,06 + corpo cápsula Ø0,30×0,70 + cabeça esfera Ø0,22 — 1,0 kg, 1,10 m.
            EnsurePhysicsDefaults();
            var go = new GameObject("Soldier");
            var baseCol = go.AddComponent<BoxCollider>(); // base aproximada por caixa fina (cilindro real na T2)
            baseCol.size = new Vector3(0.50f, 0.06f, 0.50f); baseCol.center = new Vector3(0, 0.03f, 0);
            baseCol.material = _wood;
            var body = new GameObject("Body");
            body.transform.SetParent(go.transform, false);
            body.transform.localPosition = new Vector3(0, 0.41f, 0);
            var cap = body.AddComponent<CapsuleCollider>();
            cap.radius = 0.15f; cap.height = 0.70f; cap.material = _wood;
            AddPrimitiveVisual(body, "Capsule.fbx", new Vector3(0.30f, 0.70f, 0.30f), Vector3.zero, new Color(0.75f, 0.20f, 0.20f));
            var head = new GameObject("Head");
            head.transform.SetParent(go.transform, false);
            head.transform.localPosition = new Vector3(0, 0.99f, 0);
            var sph = head.AddComponent<SphereCollider>();
            sph.radius = 0.11f; sph.material = _wood;
            AddPrimitiveVisual(head, "Sphere.fbx", new Vector3(0.22f, 0.22f, 0.22f), Vector3.zero, new Color(0.92f, 0.80f, 0.62f));
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = 1.0f;
            rb.sleepThreshold = 0.01f;
            rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            rb.centerOfMass = new Vector3(0, 0.25f, 0); // GDD §13.3
            return go;
        }

        public static GameObject BuildGround(Vector2 size)
        {
            EnsurePhysicsDefaults();
            var go = new GameObject("Ground");
            var col = go.AddComponent<BoxCollider>();
            col.size = new Vector3(size.x, 0.5f, size.y);
            col.material = _wood;
            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.mass = 1000f;
            AddBoxVisual(go, new Vector3(size.x, 0.5f, size.y), Vector3.zero, new Color(0.35f, 0.52f, 0.30f));
            return go;
        }
    }
}
