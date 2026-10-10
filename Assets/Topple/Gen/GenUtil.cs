// Utilidades determinísticas dos geradores: mesma seed, mesmo resultado (§13).
// Escrita idempotente: só grava o arquivo se os bytes mudarem (preserva .meta/GUIDs).
using System;
using System.IO;
using System.Security.Cryptography;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Topple.Gen
{
    public static class GenUtil
    {
        public static Color Hex(string hex, Color fallback)
        {
            if (ColorUtility.TryParseHtmlString(hex, out var c)) return c;
            return fallback;
        }

        // RNG determinístico simples (xorshift32).
        public struct Rng
        {
            uint _s;
            public Rng(uint seed) { _s = seed == 0 ? 0x9E3779B9u : seed; }
            public uint Next() { _s ^= _s << 13; _s ^= _s >> 17; _s ^= _s << 5; return _s; }
            public float Value() => (Next() >> 8) / 16777216f;
        }

        // Hash de gradiente com wrap (tileável): h(ix mod p, iy mod p).
        static float Hash2(int x, int y, int period, uint seed)
        {
            x = ((x % period) + period) % period;
            y = ((y % period) + period) % period;
            uint h = (uint)(x * 374761393 + y * 668265263 + seed * 1442695041u);
            h = (h ^ (h >> 13)) * 1274126177u;
            return ((h ^ (h >> 16)) >> 8) / 16777216f;
        }

        static float Smooth(float t) => t * t * (3f - 2f * t);

        // Máscara 0-1 com bordas suaves (o SmoothStep do Unity interpola ENTRE
        // from e to — NÃO serve como máscara; isto equivale ao smoothstep HLSL).
        public static float SMask(float from, float to, float x)
        {
            float t = (x - from) / (to - from);
            t = t < 0f ? 0f : (t > 1f ? 1f : t);
            return t * t * (3f - 2f * t);
        }

        // fBm periódico (tileável) em [0,1]. Determinístico.
        public static float TileableFbm(float u, float v, int period, int octaves, uint seed)
        {
            float sum = 0f, amp = 0.5f, freq = period, norm = 0f;
            for (int o = 0; o < octaves; o++)
            {
                int p = Math.Max(1, (int)freq);
                float x = u * freq, y = v * freq;
                int x0 = (int)Math.Floor(x), y0 = (int)Math.Floor(y);
                float fx = x - x0, fy = y - y0;
                float a = Hash2(x0, y0, p, seed + (uint)o * 101u);
                float b = Hash2(x0 + 1, y0, p, seed + (uint)o * 101u);
                float c = Hash2(x0, y0 + 1, p, seed + (uint)o * 101u);
                float d = Hash2(x0 + 1, y0 + 1, p, seed + (uint)o * 101u);
                float sx = Smooth(fx), sy = Smooth(fy);
                sum += ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy) * amp;
                norm += amp; amp *= 0.5f; freq *= 2f;
            }
            return sum / norm;
        }

        // Grava bytes só se mudaram; retorna true se escreveu. Garante idempotência.
        public static bool WriteIfChanged(string path, byte[] bytes)
        {
            if (File.Exists(path))
            {
                var old = File.ReadAllBytes(path);
                if (old.Length == bytes.Length)
                {
                    bool same = true;
                    for (int i = 0; i < old.Length; i++)
                        if (old[i] != bytes[i]) { same = false; break; }
                    if (same) return false;
                }
            }
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, bytes);
            return true;
        }

        public static string ShaOf(byte[] bytes)
        {
            using var sha = SHA256.Create();
            var h = sha.ComputeHash(bytes);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (var b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        public static string ProjectRoot()
        {
            var dir = new DirectoryInfo(Application.dataPath);
            return dir.Parent.FullName;
        }
    }
}
