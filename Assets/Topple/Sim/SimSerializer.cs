// GDD §9/§12: gravação quantizada + GZip + hash. Ordem estável (por id) para
// determinismo byte-a-byte na mesma máquina/build. Estimativa validada na T1.
using System;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using UnityEngine;

namespace Topple.Sim
{
    public static class SimSerializer
    {
        public const int CurrentVersion = 1;
        const float PosScale = 1000f; // 1 mm
        const float QuatScale = 32767f;

        public static byte[] Save(SimRecording rec)
        {
            using var ms = new MemoryStream();
            using (var gz = new GZipStream(ms, System.IO.Compression.CompressionLevel.Optimal, true))
            using (var w = new BinaryWriter(gz))
            {
                w.Write(CurrentVersion);
                w.Write(rec.Header.Seed);
                w.Write(rec.Header.StepHz);
                w.Write(rec.Events.Length);
                foreach (var e in rec.Events)
                {
                    w.Write(e.Time); w.Write(e.Kind ?? ""); w.Write(e.BodyId); w.Write(e.ZoneBlame);
                }
                w.Write(rec.Frames.Length);
                foreach (var f in rec.Frames)
                {
                    w.Write(f.Step);
                    var s = new System.Collections.Generic.List<SimSample>(f.Samples);
                    s.Sort((a, b) => a.Id.CompareTo(b.Id)); // ordem estável
                    w.Write(s.Count);
                    foreach (var sm in s)
                    {
                        w.Write(sm.Id);
                        w.Write((int)Mathf.Round(sm.Pos.x * PosScale));
                        w.Write((int)Mathf.Round(sm.Pos.y * PosScale));
                        w.Write((int)Mathf.Round(sm.Pos.z * PosScale));
                        w.Write((short)Mathf.Clamp(Mathf.Round(sm.Rot.x * QuatScale), -32768, 32767));
                        w.Write((short)Mathf.Clamp(Mathf.Round(sm.Rot.y * QuatScale), -32768, 32767));
                        w.Write((short)Mathf.Clamp(Mathf.Round(sm.Rot.z * QuatScale), -32768, 32767));
                        w.Write((short)Mathf.Clamp(Mathf.Round(sm.Rot.w * QuatScale), -32768, 32767));
                    }
                }
            }
            return ms.ToArray();
        }

        public static SimRecording Load(byte[] bytes)
        {
            using var ms = new MemoryStream(bytes);
            using var gz = new GZipStream(ms, CompressionMode.Decompress);
            using var r = new BinaryReader(gz);
            var rec = new SimRecording();
            var ver = r.ReadInt32();
            var seed = r.ReadUInt32();
            var hz = r.ReadSingle();
            var ne = r.ReadInt32();
            var ev = new SimEvent[ne];
            for (int i = 0; i < ne; i++)
                ev[i] = new SimEvent(r.ReadSingle(), r.ReadString(), r.ReadInt32(), r.ReadInt32());
            var nf = r.ReadInt32();
            var fr = new SimFrame[nf];
            for (int i = 0; i < nf; i++)
            {
                var f = new SimFrame { Step = r.ReadInt32() };
                int ns = r.ReadInt32();
                for (int j = 0; j < ns; j++)
                {
                    var id = r.ReadInt32();
                    var p = new Vector3(r.ReadInt32() / PosScale, r.ReadInt32() / PosScale, r.ReadInt32() / PosScale);
                    var q = new Quaternion(r.ReadInt16() / QuatScale, r.ReadInt16() / QuatScale, r.ReadInt16() / QuatScale, r.ReadInt16() / QuatScale);
                    f.Samples.Add(new SimSample(id, p, q));
                }
                fr[i] = f;
            }
            rec.Header = new SimHeader { Version = ver, Seed = seed, StepHz = hz, FrameCount = nf };
            rec.Events = ev; rec.Frames = fr;
            return rec;
        }

        public static string HashOf(byte[] bytes)
        {
            using var sha = SHA256.Create();
            var h = sha.ComputeHash(bytes);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (var b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }
    }
}
