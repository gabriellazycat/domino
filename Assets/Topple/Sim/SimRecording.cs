// GDD §12: SimRecording alimenta co-op, replay e Topple Cam.
// Cabeçalho + keyframes dos corpos acordados + eventos. Serialização binária em SimSerializer.
using System;
using UnityEngine;

namespace Topple.Sim
{
    [Serializable]
    public struct SimHeader
    {
        public int Version;
        public uint Seed;
        public float StepHz;
        public int FrameCount;
        public string Hash;
    }

    [Serializable]
    public struct SimEvent
    {
        public float Time;
        public string Kind; // "knock", "combo", "break"
        public int BodyId;
        public int ZoneBlame;

        public SimEvent(float time, string kind, int bodyId, int blame)
        { Time = time; Kind = kind; BodyId = bodyId; ZoneBlame = blame; }
    }

    [Serializable]
    public struct SimSample
    {
        public int Id;
        public Vector3 Pos;
        public Quaternion Rot;

        public SimSample(int id, Vector3 pos, Quaternion rot)
        { Id = id; Pos = pos; Rot = rot; }
    }

    [Serializable]
    public sealed class SimFrame
    {
        public int Step;
        public System.Collections.Generic.List<SimSample> Samples = new();
    }

    [Serializable]
    public sealed class SimRecording
    {
        public SimHeader Header;
        public SimEvent[] Events = Array.Empty<SimEvent>();
        public SimFrame[] Frames = Array.Empty<SimFrame>();
    }
}
