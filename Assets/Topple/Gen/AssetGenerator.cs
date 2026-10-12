// GDD §13.1: ponto de entrada único — menu Tools/Topple/Generate All e
// Topple.Gen.AssetGenerator.GenerateAll(), chamável por -executeMethod.
// Idempotente: rodar duas vezes produz os mesmos arquivos (hashes no manifesto).
using System.Collections.Generic;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Topple.Gen
{
#if UNITY_EDITOR
    public static class AssetGenerator
    {
        const string GenRoot = "Assets/Generated";
        const string ManifestPath = "Artifacts/gen-manifest.json";

        [MenuItem("Tools/Topple/Generate All")]
        static void MenuGenerate() => GenerateAll();

        public static void GenerateAll()
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            EnsureDirs();
            var bible = GetOrCreateBible();
            WriteTextures(bible);
            AssetDatabase.Refresh();
            EnsureFaceWrapRepeat(); // laterais usam tiling 2×2: precisa de Repeat
            PrefabGen.Pieces(bible);
            PrefabGen.Soldier(bible);
            PrefabGen.Field(bible);
            UrpSetup.Ensure();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh(); // reimporta prefabs/malhas antes de previews + scan
            WriteAudio();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            RenderPreviews();
            int broken = ScanBrokenRefs();
            WriteManifest();
            Debug.Log($"[TOPPLE][GEN] GenerateAll pronto em {sw.Elapsed.TotalSeconds:F1}s. refs quebradas: {broken}");
            if (broken > 0) throw new System.Exception($"GenerateAll: {broken} referências quebradas.");
        }

        static void EnsureDirs()
        {
            foreach (var d in new[] { "Textures", "Materials", "Meshes", "Prefabs", "Audio" })
                Directory.CreateDirectory($"{GenRoot}/{d}");
            Directory.CreateDirectory("Artifacts/previews");
        }

        static ArtBible GetOrCreateBible()
        {
            string path = $"{GenRoot}/ArtBible.asset";
            var bible = AssetDatabase.LoadAssetAtPath<ArtBible>(path);
            if (bible == null)
            {
                bible = ScriptableObject.CreateInstance<ArtBible>();
                AssetDatabase.CreateAsset(bible, path);
                bible = AssetDatabase.LoadAssetAtPath<ArtBible>(path);
            }
            // Reaplica os valores de especificação (determinístico).
            var fresh = ScriptableObject.CreateInstance<ArtBible>();
            EditorUtility.CopySerialized(fresh, bible);
            Object.DestroyImmediate(fresh);
            EditorUtility.SetDirty(bible);
            return bible;
        }

        static void WriteTextures(ArtBible bible)
        {
            void Png(string file, Texture2D tex)
            {
                GenUtil.WriteIfChanged($"{GenRoot}/Textures/{file}", tex.EncodeToPNG());
                Object.DestroyImmediate(tex);
            }
            var bg = bible.Get("piece.common.face", new Color(0.95f, 0.91f, 0.84f));
            var pip = bible.Get("piece.common.pip", new Color(0.17f, 0.11f, 0.08f));
            var line = pip;
            Png("atlas_wood.png", TextureSynth.FaceAtlas(bg, pip, line));
            var f66 = new Texture2D(256, 512, TextureFormat.RGBA32, false);
            f66.SetPixels(TextureSynth.DominoFace(6, 6, bg, pip, line, 4242u));
            f66.Apply(false, false);
            Png("face_common66.png", f66);
            Png("face_heavy.png", TextureSynth.HeavyFace(
                bible.Get("piece.heavy.face", new Color(0.23f, 0.25f, 0.27f)),
                bible.Get("piece.heavy.pip", new Color(0.78f, 0.80f, 0.82f))));
            Png("face_ramp.png", TextureSynth.RampFace(
                bible.Get("piece.ramp.face", new Color(0.95f, 0.55f, 0.16f)),
                bible.Get("piece.ramp.arrow", Color.white)));
            string[] files = { "field_grass", "field_dirt", "field_stone", "field_wood" };
            for (int i = 0; i < 4; i++) Png($"{files[i]}.png", TextureSynth.Field(i, bible));
        }

        // Faces de dominó com wrap Repeat (as laterais da malha repetem 2×2).
        // Default de import é Clamp: UV fora de 0-1 esticaria a borda.
        static void EnsureFaceWrapRepeat()
        {
            foreach (var f in new[] { "face_common66.png", "face_heavy.png", "face_ramp.png" })
            {
                string path = $"{GenRoot}/Textures/{f}";
                var imp = AssetImporter.GetAtPath(path) as TextureImporter;
                if (imp == null) continue;
                if (imp.wrapMode != TextureWrapMode.Repeat)
                {
                    imp.wrapMode = TextureWrapMode.Repeat;
                    imp.SaveAndReimport();
                }
            }
        }

        static void WriteAudio()
        {
            void Wav(string file, float[] s)
                => GenUtil.WriteIfChanged($"{GenRoot}/Audio/{file}", AudioSynth.ToWav(s));
            for (int i = 0; i < 8; i++) Wav($"click{i}.wav", AudioSynth.Click(i));
            Wav("heavy.wav", AudioSynth.Heavy());
            Wav("fall.wav", AudioSynth.Fall());
            Wav("ui_click.wav", AudioSynth.UiClick());
        }

        static void RenderPreviews()
        {
            AssetPreviewRenderer.RenderAll(new[]
            {
                $"{GenRoot}/Prefabs/piece_common.prefab",
                $"{GenRoot}/Prefabs/piece_heavy.prefab",
                $"{GenRoot}/Prefabs/piece_ramp.prefab",
                $"{GenRoot}/Prefabs/piece_fork.prefab",
                $"{GenRoot}/Prefabs/piece_big.prefab",
                $"{GenRoot}/Prefabs/piece_runner.prefab",
                $"{GenRoot}/Prefabs/piece_blast.prefab",
                $"{GenRoot}/Prefabs/piece_tower.prefab",
                $"{GenRoot}/Prefabs/enemy_soldier.prefab",
                $"{GenRoot}/Prefabs/enemy_brute.prefab",
                $"{GenRoot}/Prefabs/field_table.prefab",
            }, GenUtil.ProjectRoot().Replace('\\', '/') + "/Artifacts/previews");
        }

        // Varre prefabs/materiais gerados: malhas, materiais e scripts ausentes.
        public static int ScanBrokenRefs()
        {
            int broken = 0;
            void Bad(string what) { broken++; Debug.LogWarning($"[TOPPLE][GEN] ref quebrada: {what}"); }
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", new[] { GenRoot + "/Prefabs" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                foreach (var o in AssetDatabase.LoadAllAssetsAtPath(path))
                {
                    if (o == null) { Bad($"{path} (sub-asset nulo)"); continue; }
                    if (o is GameObject go)
                    {
                        foreach (var c in go.GetComponentsInChildren<Component>(true))
                            if (c == null) Bad($"{path} (component ausente)");
                        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
                        {
                            bool okMat = r.sharedMaterials.Length > 0;
                            foreach (var m in r.sharedMaterials) if (m == null) okMat = false;
                            if (!okMat) Bad($"{path} (material ausente em {r.name})");
                            var mf = r.GetComponent<MeshFilter>();
                            if (mf != null && mf.sharedMesh == null) Bad($"{path} (malha ausente em {r.name})");
                        }
                    }
                }
            }
            foreach (var guid in AssetDatabase.FindAssets("t:Material", new[] { GenRoot + "/Materials" }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var m = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (m == null || m.shader == null) broken++;
            }
            return broken;
        }

        static void WriteManifest()
        {
            var files = Directory.GetFiles(GenRoot, "*", SearchOption.AllDirectories);
            System.Array.Sort(files);
            var lines = new List<string> { "{" };
            foreach (var f in files)
            {
                if (f.EndsWith(".meta")) continue;
                var rel = f.Replace('\\', '/');
                lines.Add($"  \"{rel}\": \"{GenUtil.ShaOf(File.ReadAllBytes(f))}\",");
            }
            lines.Add("  \"_tool\": \"GenerateAll\"");
            lines.Add("}");
            string root = GenUtil.ProjectRoot().Replace('\\', '/');
            GenUtil.WriteIfChanged($"{root}/{ManifestPath}", System.Text.Encoding.UTF8.GetBytes(string.Join("\n", lines)));
        }
    }
#else
    public static class AssetGenerator
    {
        public static void GenerateAll() { }
    }
#endif
}
