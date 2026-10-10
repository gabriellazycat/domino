// GDD §13.1: revisão visual automática — cada prefab em fundo neutro (3 ângulos),
// PNGs + contact sheet em Artifacts/previews/. Roda sem -nographics (precisa de GPU).
// Previews são evidência (fora do manifesto de idempotência dos assets do jogo).
using System.Collections.Generic;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Topple.Gen
{
#if UNITY_EDITOR
    public static class AssetPreviewRenderer
    {
        static readonly Vector3[] Angles = new[]
        {
            new Vector3(24f, -32f, 0f), // 3/4 frontal
            new Vector3(12f, -90f, 0f), // lateral
            new Vector3(48f, -24f, 0f), // superior
        };

        public static void RenderAll(string[] prefabPaths, string outDir)
        {
            Directory.CreateDirectory(outDir);
#if UNITY_EDITOR
            // Cena hermética: a cena aberta (ex. Tutorial) contaminaria o fundo.
            var prevScene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
            var hermetic = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
                UnityEditor.SceneManagement.NewSceneSetup.EmptyScene, UnityEditor.SceneManagement.NewSceneMode.Single);
#endif
            try
            {
                RenderAllInner(prefabPaths, outDir);
            }
            finally
            {
#if UNITY_EDITOR
                if (prevScene.IsValid() && !string.IsNullOrEmpty(prevScene.path)
                    && System.IO.File.Exists(prevScene.path))
                    UnityEditor.SceneManagement.EditorSceneManager.OpenScene(prevScene.path);
#endif
            }
        }

        static void RenderAllInner(string[] prefabPaths, string outDir)
        {
            Directory.CreateDirectory(outDir);
            var thumbs = new List<(string id, Texture2D img)>();
            foreach (var path in prefabPaths)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (prefab == null) { Debug.LogWarning($"[TOPPLE][GEN] prefab ausente: {path}"); continue; }
                string id = Path.GetFileNameWithoutExtension(path);
                for (int a = 0; a < Angles.Length; a++)
                {
                    var png = RenderOne(prefab, Angles[a], 256);
                    string file = Path.Combine(outDir, $"{id}_{a}.png").Replace('\\', '/');
                    GenUtil.WriteIfChanged(file, png.EncodeToPNG());
                    if (a == 0) thumbs.Add((id, Downscale(png, 128)));
                    Object.DestroyImmediate(png);
                }
            }
            var sheet = ContactSheet(thumbs, 128);
            GenUtil.WriteIfChanged(Path.Combine(outDir, "contact-sheet.png").Replace('\\', '/'), sheet.EncodeToPNG());
            Object.DestroyImmediate(sheet);
            foreach (var t in thumbs) Object.DestroyImmediate(t.img);
            Debug.Log($"[TOPPLE][GEN] previews: {thumbs.Count} prefabs × 3 ângulos + contact sheet em {outDir}");
        }

        static Texture2D RenderOne(GameObject prefab, Vector3 euler, int size)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            var bounds = new Bounds(go.transform.position, Vector3.one * 0.5f);
            foreach (var r in go.GetComponentsInChildren<Renderer>()) bounds.Encapsulate(r.bounds);
            float dist = Mathf.Max(bounds.size.magnitude * 1.9f, 1.2f);

            var camGo = new GameObject("PreviewCam");
            var cam = camGo.AddComponent<Camera>();
            cam.backgroundColor = new Color(0.18f, 0.18f, 0.20f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.fieldOfView = 28f;
            var dir = Quaternion.Euler(euler) * Vector3.forward;
            camGo.transform.position = bounds.center - dir * dist;
            camGo.transform.LookAt(bounds.center);

            var lightGo = new GameObject("PreviewLight");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.color = new Color(1f, 0.914f, 0.769f);
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            var rt = new RenderTexture(size, size, 24);
            cam.targetTexture = rt;
            cam.Render();
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false);
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, size, size), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            cam.targetTexture = null;
            Object.DestroyImmediate(camGo);
            Object.DestroyImmediate(lightGo);
            Object.DestroyImmediate(go);
            Object.DestroyImmediate(rt);
            return tex;
        }

        static Texture2D Downscale(Texture2D src, int size)
        {
            var dst = new Texture2D(size, size, TextureFormat.RGB24, false);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                    dst.SetPixel(x, y, src.GetPixelBilinear((x + 0.5f) / size, (y + 0.5f) / size));
            dst.Apply();
            return dst;
        }

        static Texture2D ContactSheet(List<(string id, Texture2D img)> thumbs, int cell)
        {
            int cols = 3, rows = Mathf.Max(1, Mathf.CeilToInt(thumbs.Count / (float)cols));
            var sheet = new Texture2D(cols * cell, rows * cell, TextureFormat.RGB24, false);
            for (int y = 0; y < sheet.height; y++)
                for (int x = 0; x < sheet.width; x++)
                    sheet.SetPixel(x, y, new Color(0.18f, 0.18f, 0.20f));
            for (int i = 0; i < thumbs.Count; i++)
            {
                int ox = (i % cols) * cell, oy = (rows - 1 - i / cols) * cell;
                for (int y = 0; y < cell; y++)
                    for (int x = 0; x < cell; x++)
                        sheet.SetPixel(ox + x, oy + y, thumbs[i].img.GetPixel(x, y));
            }
            sheet.Apply();
            return sheet;
        }
    }
#else
    public static class AssetPreviewRenderer { }
#endif
}
