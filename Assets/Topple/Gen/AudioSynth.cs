// GDD §13.5: tudo sintetizado por AudioSynth em C# (Editor), WAV 44,1 kHz,
// 16 bits, mono. T2: SFX básicos. Normalizados em −3 dBFS, sem clip (§13.6).
using System;
using UnityEngine;

namespace Topple.Gen
{
    public static class AudioSynth
    {
        public const int Rate = 44100;
        const float PeakMinus3dBFS = 0.70794578f; // 10^(-3/20)

        static float Sine(float phase) => Mathf.Sin(phase * Mathf.PI * 2f);

        static float Tri(float phase)
        {
            float p = phase - Mathf.Floor(phase);
            return 2f * Mathf.Abs(2f * p - 1f) - 1f;
        }

        // Ruído branco determinístico por seed.
        static float Noise(ref uint s)
        {
            s ^= s << 13; s ^= s >> 17; s ^= s << 5;
            return ((s >> 8) / 16777216f) * 2f - 1f;
        }

        // Passa-baixa de um polo. Passa-alta = x − passa-baixa(x).
        struct Lowpass { public float Y; public float A; public float Tick(float x) { Y += A * (x - Y); return Y; } }

        static Lowpass Lp(float cutoffHz) => new() { A = 1f - Mathf.Exp(-2f * Mathf.PI * cutoffHz / Rate) };

        static float[] Normalize(float[] s)
        {
            float peak = 1e-6f;
            foreach (var v in s) peak = Mathf.Max(peak, Mathf.Abs(v));
            float g = PeakMinus3dBFS / peak;
            for (int i = 0; i < s.Length; i++) s[i] = Mathf.Clamp(s[i] * g, -1f, 1f);
            return s;
        }

        // Clique de dominó: ruído passa-banda 2–5 kHz / 40 ms + seno 220–320 Hz / 30 ms.
        public static float[] Click(int variant)
        {
            uint seed = 1234u + (uint)variant * 777u;
            float toneF = 220f + variant * 14f;
            int n = (int)(Rate * 0.09f);
            var s = new float[n];
            var lpHi = Lp(5000f); var lpLo = Lp(2000f);
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float nz = Noise(ref seed);
                float band = lpHi.Tick(nz) - lpLo.Tick(nz);
                float env = Mathf.Exp(-t / 0.012f);
                float tone = Sine(toneF * t) * Mathf.Exp(-t / 0.010f);
                s[i] = band * env * 0.8f + tone * 0.5f;
            }
            return Normalize(s);
        }

        // Impacto pesado: ruído passa-baixa + seno 60–90 Hz, 300 ms.
        public static float[] Heavy()
        {
            uint seed = 4242u;
            int n = (int)(Rate * 0.35f);
            var s = new float[n];
            var lp = Lp(900f);
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float nz = lp.Tick(Noise(ref seed));
                float tone = Sine(75f * t) * Mathf.Exp(-t / 0.12f);
                s[i] = nz * Mathf.Exp(-t / 0.09f) * 0.9f + tone * 0.8f;
            }
            return Normalize(s);
        }

        // Inimigo cai: seno 150 Hz + ruído 20 ms (batida de madeira).
        public static float[] Fall()
        {
            uint seed = 9001u;
            int n = (int)(Rate * 0.15f);
            var s = new float[n];
            var lp = Lp(3000f);
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                float knock = Sine(150f * t) * Mathf.Exp(-t / 0.05f);
                float nz = lp.Tick(Noise(ref seed)) * Mathf.Exp(-t / 0.008f);
                s[i] = knock * 0.9f + nz * 0.5f;
            }
            return Normalize(s);
        }

        // UI: clique triângulo 660 Hz / 60 ms.
        public static float[] UiClick()
        {
            int n = (int)(Rate * 0.08f);
            var s = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                s[i] = Tri(660f * t) * Mathf.Exp(-t / 0.02f) * 0.7f;
            }
            return Normalize(s);
        }

        public static byte[] ToWav(float[] samples)
        {
            int data = samples.Length * 2;
            var wav = new byte[44 + data];
            void Str(int o, string v) { foreach (var c in v) wav[o++] = (byte)c; }
            void I32(int o, int v) { wav[o] = (byte)v; wav[o + 1] = (byte)(v >> 8); wav[o + 2] = (byte)(v >> 16); wav[o + 3] = (byte)(v >> 24); }
            void I16(int o, int v) { wav[o] = (byte)v; wav[o + 1] = (byte)(v >> 8); }
            Str(0, "RIFF"); I32(4, 36 + data); Str(8, "WAVE"); Str(12, "fmt ");
            I32(16, 16); I16(20, 1); I16(22, 1); I32(24, Rate);
            I32(28, Rate * 2); I16(32, 2); I16(34, 16); Str(36, "data"); I32(40, data);
            for (int i = 0; i < samples.Length; i++)
                I16(44 + i * 2, (int)Mathf.Clamp(samples[i] * 32767f, -32768f, 32767f));
            return wav;
        }
    }
}
