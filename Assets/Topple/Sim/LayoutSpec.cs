// Layout serializável (grade inteira + passo de rotação 0-23) — GDD §9: posições são
// índices de grade e a rotação é um passo de 15°. Roundtrip testado em EditMode.
using System;
using UnityEngine;

namespace Topple.Sim
{
    [Serializable]
    public struct LayoutPlacement
    {
        public int InstanceId;
        public string Piece;
        public int Gx;
        public int Gz;
        public int Rot;
    }

    [Serializable]
    public sealed class LayoutSpec
    {
        public int Version = 1;
        public LayoutPlacement[] Placements = Array.Empty<LayoutPlacement>();

        public string ToJson() => JsonUtility.ToJson(this);
        public static LayoutSpec FromJson(string json) => JsonUtility.FromJson<LayoutSpec>(json);
    }
}
