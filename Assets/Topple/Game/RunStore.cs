// Auto-save (1 slot, checkpoint por fase) + settings em JSON (camada Game;
// DTO puro no Core). Falha de IO nunca quebra o jogo (try/catch em tudo).
using System.IO;
using UnityEngine;

namespace Topple.Game
{
    [System.Serializable]
    public class SettingsData
    {
        public float volume = 1f;      // 0–1 (AudioListener.volume)
        public bool postFX = true;     // Volume Bloom+vinheta ligado
        public float zoomSpeed = 0.05f; // CameraController.ZoomStep
    }

    public static class RunStore
    {
        // Gancho de teste: caminho alternativo (não suja o save real no Editor).
        public static string FileOverride;

        public static string AutoPath() =>
            FileOverride ?? Path.Combine(Application.persistentDataPath, "autosave.json");

        public static string SettingsPath() =>
            Path.Combine(Application.persistentDataPath, "settings.json");

        public static void SaveAuto(Topple.Core.RunState run)
        {
            if (run == null) return;
            var json = JsonUtility.ToJson(Topple.Core.RunSave.FromRun(run), true);
            File.WriteAllText(AutoPath(), json);
        }

        public static bool TryLoadAuto(out Topple.Core.RunSave save)
        {
            save = null;
            try
            {
                var p = AutoPath();
                if (!File.Exists(p)) return false;
                save = JsonUtility.FromJson<Topple.Core.RunSave>(File.ReadAllText(p));
                return save != null && save.version == 1;
            }
            catch { return false; }
        }

        public static SettingsData LoadSettings()
        {
            try
            {
                var p = SettingsPath();
                if (File.Exists(p))
                {
                    var s = JsonUtility.FromJson<SettingsData>(File.ReadAllText(p));
                    if (s != null) return s;
                }
            }
            catch { }
            return new SettingsData();
        }

        public static void SaveSettings(SettingsData s)
        {
            if (s == null) return;
            try { File.WriteAllText(SettingsPath(), JsonUtility.ToJson(s, true)); }
            catch { }
        }
    }
}
