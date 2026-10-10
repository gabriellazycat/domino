// GDD §13.1/§13.2/§13.3: um prefab por entidade, com Rigidbody, colliders
// primitivos, PieceView/EnemyView e o mesmo id do dado em Content/.
// Idempotência: SaveAsPrefabAsset sobrescreve no lugar (GUID preservado);
// bytes idênticos entre runs (verificado no teste de idempotência T2).
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Topple.Gen
{
#if UNITY_EDITOR
    public static class MatLib
    {
        public static Material GetOrCreate(string path, Shader shader)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
                m = AssetDatabase.LoadAssetAtPath<Material>(path);
            }
            return m;
        }

        public static void SetLit(Material m, Color color, float smoothness, float metallic, Texture tex)
        {
            m.shader = Shader.Find("Universal Render Pipeline/Lit");
            m.color = color;
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", metallic);
            if (tex != null) m.mainTexture = tex;
            EditorUtility.SetDirty(m);
        }
    }

    public static class PrefabGen
    {
        const string GenRoot = "Assets/Generated";

        static void BaseRb(GameObject go, float mass, bool kinematic)
        {
            // NOTA: nunca usar `??` com UnityEngine.Object (fake-null). Padrão defensivo.
            var rb = go.GetComponent<Rigidbody>();
            if (rb == null) rb = go.AddComponent<Rigidbody>();
            rb.mass = mass;
            rb.sleepThreshold = 0.01f; // calibrado T1
            rb.collisionDetectionMode = CollisionDetectionMode.Discrete;
            rb.isKinematic = kinematic;
        }

        // Atrito da cena ao vivo = atrito do headless (0,75). Sem isto os prefabs
        // usam o default (0,4), patinam e a onda decai — o bot passa e o humano perde.
        static void ApplyWood(GameObject go)
        {
            Topple.Sim.SimBuilder.EnsurePhysicsDefaults();
            var wood = Topple.Sim.SimBuilder.Wood;
            foreach (var c in go.GetComponentsInChildren<Collider>(true))
            {
                var box = c as BoxCollider;
                if (box != null) box.material = wood;
                var cap = c as CapsuleCollider;
                if (cap != null) cap.material = wood;
                var sph = c as SphereCollider;
                if (sph != null) sph.material = wood;
                var mesh = c as MeshCollider;
                if (mesh != null) mesh.material = wood;
            }
        }

        static GameObject BuildPiecePrefab(string id, string visualId, Mesh mesh, Material faceMat, Material edgeMat,
            Vector3 colSize, Vector3 colCenter, float mass, bool kinematic)
        {
            var go = new GameObject(id);
            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            // Todas as faces com a textura (pedido do dono): tampas e laterais
            // usam o material da face. O material da borda continua gerado
            // (mesmo visualId), mas sem slot no prefab.
            mr.sharedMaterials = new[] { faceMat, faceMat }; // submesh 0 = face, 1 = borda
            var col = go.AddComponent<BoxCollider>();
            col.size = colSize; col.center = colCenter;
            BaseRb(go, mass, kinematic);
            ApplyWood(go);
            var view = go.AddComponent<Topple.Sim.PieceView>();
            view.VisualId = visualId; view.PieceId = id;
            return go;
        }

        public static void Pieces(ArtBible bible)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            // Materiais (load-or-create no lugar).
            var commonMat = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_common.mat", shader);
            MatLib.SetLit(commonMat, Color.white, bible.WoodSmoothness, 0f,
                AssetDatabase.LoadAssetAtPath<Texture2D>($"{GenRoot}/Textures/face_common66.png"));
            var heavyMat = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_heavy.mat", shader);
            MatLib.SetLit(heavyMat, Color.white, bible.MetalSmoothness, bible.MetalMetallic,
                AssetDatabase.LoadAssetAtPath<Texture2D>($"{GenRoot}/Textures/face_heavy.png"));
            var rampMat = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_ramp.mat", shader);
            MatLib.SetLit(rampMat, Color.white, bible.MatteSmoothness, 0f,
                AssetDatabase.LoadAssetAtPath<Texture2D>($"{GenRoot}/Textures/face_ramp.png"));
            // Bordas sólidas (submesh 1): cor da borda por tipo (ArtBible, sem cor fixa).
            var commonEdge = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_common_edge.mat", shader);
            MatLib.SetLit(commonEdge, bible.Get("piece.common.edge", new Color(0.48f, 0.32f, 0.19f)), bible.WoodSmoothness, 0f, null);
            var heavyEdge = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_heavy_edge.mat", shader);
            MatLib.SetLit(heavyEdge, bible.Get("piece.heavy.edge", new Color(0.12f, 0.13f, 0.14f)), bible.MetalSmoothness, bible.MetalMetallic, null);
            var rampEdge = MatLib.GetOrCreate($"{GenRoot}/Materials/piece_ramp_edge.mat", shader);
            MatLib.SetLit(rampEdge, bible.Get("piece.ramp.edge", new Color(0.66f, 0.35f, 0.07f)), bible.MatteSmoothness, 0f, null);

            // Malhas exatas da hitbox (BoxSolid): preenchem o collider borda a borda.
            SaveMesh(MeshGen.BoxSolid(new Vector3(0.40f, 0.80f, 0.12f)), $"{GenRoot}/Meshes/common.asset");
            SaveMesh(MeshGen.BoxSolid(new Vector3(0.45f, 0.80f, 0.20f)), $"{GenRoot}/Meshes/heavy.asset");
            SaveMesh(MeshGen.Wedge(0.60f, 0.35f, 0.40f), $"{GenRoot}/Meshes/ramp.asset");

            var commonMesh = AssetDatabase.LoadAssetAtPath<Mesh>($"{GenRoot}/Meshes/common.asset");
            var heavyMesh = AssetDatabase.LoadAssetAtPath<Mesh>($"{GenRoot}/Meshes/heavy.asset");
            var rampMesh = AssetDatabase.LoadAssetAtPath<Mesh>($"{GenRoot}/Meshes/ramp.asset");

            SavePrefab(BuildPiecePrefab("common", "piece.common", commonMesh, commonMat, commonEdge,
                new Vector3(0.40f, 0.80f, 0.12f), new Vector3(0, 0.40f, 0), 0.5f, false), $"{GenRoot}/Prefabs/piece_common.prefab");
            SavePrefab(BuildPiecePrefab("heavy", "piece.heavy", heavyMesh, heavyMat, heavyEdge,
                new Vector3(0.45f, 0.80f, 0.20f), new Vector3(0, 0.40f, 0), 2.0f, false), $"{GenRoot}/Prefabs/piece_heavy.prefab");
            SavePrefab(BuildPiecePrefab("ramp", "piece.ramp", rampMesh, rampMat, rampEdge,
                new Vector3(0.60f, 0.35f, 0.40f), new Vector3(0, 0.175f, 0), 1.0f, true), $"{GenRoot}/Prefabs/piece_ramp.prefab");
        }

        public static void Soldier(ArtBible bible)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            var bodyMat = MatLib.GetOrCreate($"{GenRoot}/Materials/enemy_soldier_body.mat", shader);
            MatLib.SetLit(bodyMat, bible.Get("enemy.soldier.body", new Color(0.69f, 0.19f, 0.19f)), bible.MatteSmoothness, 0f, null);
            var skinMat = MatLib.GetOrCreate($"{GenRoot}/Materials/enemy_soldier_skin.mat", shader);
            MatLib.SetLit(skinMat, bible.Get("enemy.soldier.skin", new Color(0.91f, 0.76f, 0.60f)), bible.MatteSmoothness, 0f, null);

            // GDD §13.3: base Ø0,50×0,06 + corpo cápsula Ø0,30×0,70 + cabeça Ø0,22 + capacete.
            var go = new GameObject("soldier");
            Part(go, "Base", PrimMesh(PrimitiveType.Cylinder), bodyMat, new Vector3(0.50f, 0.06f, 0.50f), new Vector3(0, 0.03f, 0));
            var bcol = go.AddComponent<BoxCollider>();
            bcol.size = new Vector3(0.50f, 0.06f, 0.50f); bcol.center = new Vector3(0, 0.03f, 0);
            var body = Part(go, "Body", PrimMesh(PrimitiveType.Capsule), bodyMat, new Vector3(0.30f, 0.70f, 0.30f), new Vector3(0, 0.41f, 0));
            var bcap = body.AddComponent<CapsuleCollider>();
            bcap.radius = 0.15f; bcap.height = 0.70f;
            var head = Part(go, "Head", PrimMesh(PrimitiveType.Sphere), skinMat, new Vector3(0.22f, 0.22f, 0.22f), new Vector3(0, 0.99f, 0));
            var hsph = head.AddComponent<SphereCollider>();
            hsph.radius = 0.11f;
            Part(go, "Helmet", PrimMesh(PrimitiveType.Sphere), bodyMat, new Vector3(0.26f, 0.12f, 0.26f), new Vector3(0, 1.08f, 0));
            BaseRb(go, 1.0f, false);
            go.GetComponent<Rigidbody>().centerOfMass = new Vector3(0, 0.25f, 0);
            ApplyWood(go);
            var view = go.AddComponent<Topple.Sim.EnemyView>();
            view.VisualId = "enemy.soldier"; view.EnemyId = "soldier";
            SavePrefab(go, $"{GenRoot}/Prefabs/enemy_soldier.prefab");
        }

        // Malha built-in garantida via CreatePrimitive (nomes de GetBuiltinResource
        // variam entre versões; isto sempre funciona no Editor).
        static Mesh PrimMesh(PrimitiveType type)
        {
            var tmp = GameObject.CreatePrimitive(type);
            var m = tmp.GetComponent<MeshFilter>().sharedMesh;
            Object.DestroyImmediate(tmp);
            return m;
        }

        static GameObject Part(GameObject parent, string name, Mesh mesh, Material mat, Vector3 scale, Vector3 pos)
        {
            var p = new GameObject(name);
            p.transform.SetParent(parent.transform, false);
            p.transform.localPosition = pos;
            p.transform.localScale = scale;
            var mf = p.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;
            var mr = p.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            return p;
        }

        public static void Field(ArtBible bible)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            string[] kinds = { "grass", "dirt", "stone", "wood" };
            string[] files = { "field_grass", "field_dirt", "field_stone", "field_wood" };
            for (int i = 0; i < 4; i++)
            {
                var m = MatLib.GetOrCreate($"{GenRoot}/Materials/{files[i]}.mat", shader);
                MatLib.SetLit(m, Color.white, i == 3 ? bible.WoodSmoothness : bible.MatteSmoothness, 0f,
                    AssetDatabase.LoadAssetAtPath<Texture2D>($"{GenRoot}/Textures/{files[i]}.png"));
            }
            // Mesa do diorama (tampo 26×1×18, textura de madeira).
            var table = new GameObject("table");
            var mf = table.AddComponent<MeshFilter>();
            mf.sharedMesh = PrimMesh(PrimitiveType.Cube);
            table.transform.localScale = new Vector3(26f, 1f, 18f);
            var mr = table.AddComponent<MeshRenderer>();
            mr.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>($"{GenRoot}/Materials/field_wood.mat");
            var col = table.AddComponent<BoxCollider>();
            col.size = new Vector3(26f, 1f, 18f);
            var rb = table.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            ApplyWood(table);
            SavePrefab(table, $"{GenRoot}/Prefabs/field_table.prefab");
        }

        static void SaveMesh(Mesh mesh, string path)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing == null) AssetDatabase.CreateAsset(mesh, path);
            else { EditorUtility.CopySerialized(mesh, existing); EditorUtility.SetDirty(existing); }
        }

        public static void SavePrefab(GameObject root, string path)
        {
            PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
        }
    }
#else
    public static class PrefabGen { }
#endif
}
