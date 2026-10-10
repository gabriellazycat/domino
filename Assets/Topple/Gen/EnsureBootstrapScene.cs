// T0: garante cena mínima para o build (Main Camera + Directional Light).
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Topple.Gen
{
    public static class EnsureBootstrapScene
    {
        const string Path = "Assets/Topple/Game/Bootstrap.unity";

        public static void Ensure()
        {
            var existing = SceneManager.GetSceneByPath(Path);
            if (existing.IsValid()) { Debug.Log("[TOPPLE][GEN] cena já existe: " + Path); return; }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cam = new GameObject("Main Camera", typeof(Camera));
            cam.tag = "MainCamera";
            cam.transform.SetPositionAndRotation(new Vector3(0, 12, -14), Quaternion.Euler(40, 0, 0));
            var camera = cam.GetComponent<Camera>();
            camera.fieldOfView = 30f;

            var light = new GameObject("Directional Light", typeof(Light));
            light.transform.SetPositionAndRotation(new Vector3(0, 10, 0), Quaternion.Euler(50, -30, 0));
            var l = light.GetComponent<Light>();
            l.type = LightType.Directional;
            l.intensity = 1.1f;
            l.color = new Color(1f, 0.914f, 0.769f); // #FFE9C4 GDD §13.4

            EditorSceneManager.SaveScene(scene, Path);
            Debug.Log("[TOPPLE][GEN] cena criada: " + Path);
        }
    }
}
