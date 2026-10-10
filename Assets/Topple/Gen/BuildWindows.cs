// GDD §15.2: build Windows 64 bits via CLI: -executeMethod Topple.Gen.BuildWindows.Build
using UnityEditor;
using UnityEngine;

namespace Topple.Gen
{
    public static class BuildWindows
    {
        public static void Build()
        {
            var scenes = new[] { "Assets/Topple/Game/Tutorial.unity" };
            var opts = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = "Builds/Windows/Topple.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            Debug.Log($"[TOPPLE][BUILD] result={report.summary.result} exe={opts.locationPathName}");
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows falhou: " + report.summary.result);
        }
    }
}
