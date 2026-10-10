// GDD §13.1: estilo em um só lugar. Nenhum gerador tem cor fixa no código —
// tudo vem daqui (paletas hex por bioma/peça, smoothness/metallic, chanfro, tamanhos).
using System;
using UnityEngine;

namespace Topple.Gen
{
    [Serializable] public struct PaletteEntry { public string Key; public string Hex; }

    [CreateAssetMenu(menuName = "Topple/ArtBible", fileName = "ArtBible")]
    public sealed class ArtBible : ScriptableObject
    {
        [Header("Bioma Vila (§13.4)")]
        public PaletteEntry[] Vila = new[]
        {
            new PaletteEntry { Key = "grass", Hex = "#5FA84C" },
            new PaletteEntry { Key = "dirt", Hex = "#8A6238" },
            new PaletteEntry { Key = "stone", Hex = "#9A9AA0" },
            new PaletteEntry { Key = "wood", Hex = "#7A5230" },
            new PaletteEntry { Key = "woodDark", Hex = "#4A3220" },
            new PaletteEntry { Key = "tableEdge", Hex = "#2B1D14" },
        };

        [Header("Peças MVP (§13.2)")]
        public PaletteEntry[] Pieces = new[]
        {
            new PaletteEntry { Key = "piece.common.face", Hex = "#F2E8D5" },
            new PaletteEntry { Key = "piece.common.edge", Hex = "#7A5230" },
            new PaletteEntry { Key = "piece.common.pip", Hex = "#2B1D14" },
            new PaletteEntry { Key = "piece.heavy.face", Hex = "#3A3F44" },
            new PaletteEntry { Key = "piece.heavy.edge", Hex = "#1E2124" },
            new PaletteEntry { Key = "piece.heavy.pip", Hex = "#C8CCD0" },
            new PaletteEntry { Key = "piece.ramp.face", Hex = "#F28C28" },
            new PaletteEntry { Key = "piece.ramp.edge", Hex = "#A85A12" },
            new PaletteEntry { Key = "piece.ramp.arrow", Hex = "#FFFFFF" },
            new PaletteEntry { Key = "enemy.soldier.body", Hex = "#B03030" },
            new PaletteEntry { Key = "enemy.soldier.skin", Hex = "#E8C39A" },
        };

        [Header("Materiais URP/Lit")]
        [Range(0f, 1f)] public float WoodSmoothness = 0.45f;
        [Range(0f, 1f)] public float MetalSmoothness = 0.7f;
        [Range(0f, 1f)] public float MetalMetallic = 0.85f;
        [Range(0f, 1f)] public float MatteSmoothness = 0.2f;

        [Header("Geometria")]
        public float Chamfer = 0.01f; // raio do chanfro das peças (§13.2)
        public int FieldTextureSize = 512; // texturas do campo
        public int FaceTextureW = 256; // faces de dominó (256×512)
        public int FaceTextureH = 512;

        public Color Get(string key, Color fallback)
        {
            foreach (var p in Vila) if (p.Key == key) return GenUtil.Hex(p.Hex, fallback);
            foreach (var p in Pieces) if (p.Key == key) return GenUtil.Hex(p.Hex, fallback);
            return fallback;
        }
    }
}
