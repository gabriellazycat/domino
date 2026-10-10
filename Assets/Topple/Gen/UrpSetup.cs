// GDD §13.4 + §15.2: projeto roda em URP. Cria o Pipeline Asset + Renderer Data
// (via SerializedObject, sem acoplamento com campos internos em compilação) e
// atribui como pipeline ativo. Idempotente: reutiliza se já existir.
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Topple.Gen
{
#if UNITY_EDITOR
    public static class UrpSetup
    {
        const string Dir = "Assets/Generated/URP";
        const string RendererPath = Dir + "/ToppleRenderer.asset";
        const string PipelinePath = Dir + "/ToppleURP.asset";

        public static void Ensure()
        {
            if (!AssetDatabase.IsValidFolder(Dir))
            {
                System.IO.Directory.CreateDirectory(Dir);
                AssetDatabase.Refresh();
            }
            var data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (data == null)
            {
                data = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(data, RendererPath);
                data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            }
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                pipeline = ScriptableObject.CreateInstance<UniversalRenderPipelineAsset>();
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
                pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            }
            var so = new SerializedObject(pipeline);
            var list = so.FindProperty("m_RendererDataList");
            var defIdx = so.FindProperty("m_DefaultRendererIndex");
            if (list == null || defIdx == null)
                throw new System.Exception("UrpSetup: campos internos do URP mudaram (m_RendererDataList).");
            list.arraySize = 1;
            list.GetArrayElementAtIndex(0).objectReferenceValue = data;
            defIdx.intValue = 0;
            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(pipeline);

            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            AssetDatabase.SaveAssets();
            Debug.Log("[TOPPLE][GEN] URP ativo: " + PipelinePath);
        }
    }
#else
    public static class UrpSetup { }
#endif
}
