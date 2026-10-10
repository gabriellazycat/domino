// T2: determinismo dos sintetizadores (mesma seed, mesmo resultado) e WAV válido
// com pico em −3 dBFS e sem clip. Rápidos, sem GPU.
using NUnit.Framework;
using UnityEngine;
using Topple.Gen;

namespace Topple.Tests
{
    public class GenDeterminismTests
    {
        [Test] public void Noise_SameSeedSameValue()
        {
            float a = GenUtil.TileableFbm(0.31f, 0.77f, 8, 4, 501u);
            float b = GenUtil.TileableFbm(0.31f, 0.77f, 8, 4, 501u);
            Assert.AreEqual(a, b);
            Assert.That(a, Is.InRange(0f, 1f));
        }

        [Test] public void Noise_TileableEdgesMatch()
        {
            // fBm periódico: borda esquerda = direita (mesmo texel lógico).
            float l = GenUtil.TileableFbm(0f, 0.4f, 8, 4, 501u);
            float r = GenUtil.TileableFbm(1f, 0.4f, 8, 4, 501u);
            Assert.AreEqual(l, r, 1e-6f);
        }

        [Test] public void SMask_IsTrue01Mask()
        {
            // O SmoothStep do Unity interpola ENTRE from e to; SMask é máscara 0-1.
            Assert.AreEqual(0f, GenUtil.SMask(0.004f, 0.012f, 0f));
            Assert.AreEqual(1f, GenUtil.SMask(0.004f, 0.012f, 0.959f));
            Assert.AreEqual(1f, GenUtil.SMask(-0.006f, 0.006f, 0.875f)); // fora do pip
            Assert.AreEqual(0f, GenUtil.SMask(-0.006f, 0.006f, -0.875f)); // dentro do pip
        }

        [Test] public void Face_PipsDeterministic()
        {
            var bg = new Color(0.95f, 0.91f, 0.84f);
            var dark = new Color(0.17f, 0.11f, 0.08f);
            var a = TextureSynth.DominoFace(6, 6, bg, dark, dark, 4242u);
            var b = TextureSynth.DominoFace(6, 6, bg, dark, dark, 4242u);
            Assert.AreEqual(a.Length, b.Length);
            for (int i = 0; i < a.Length; i += 997)
                Assert.AreEqual(a[i], b[i]);
            Assert.AreEqual(256 * 512, a.Length);
            // Brilho: canto = fundo claro, miolo do pip = escuro, linha central = escura.
            Color corner = a[10 * 256 + 10];
            Debug.Log($"[TOPPLE][TEST] corner=({corner.r:F3},{corner.g:F3},{corner.b:F3},{corner.a:F3})");
            // Sonda: replica o cálculo do pixel (10,10) para achar o estágio escuro.
            float u = (10 + 0.5f) / 256 * 2f - 1f;
            float v = (10 + 0.5f) / 512 * 2f - 1f;
            float grain = GenUtil.TileableFbm(10 / 256f, 10 / 512f, 8, 4, 4242u);
            float factor = 0.92f + 0.10f * grain + 0.04f * v;
            float div = Mathf.Abs(v);
            float divMask = 1f - Mathf.SmoothStep(0.004f, 0.012f, div);
            var col0 = bg * factor;
            var col1 = Color.Lerp(col0, dark, divMask);
            Debug.Log($"[TOPPLE][TEST] probe u={u:F3} v={v:F3} grain={grain:F3} factor={factor:F3} div={div:F3} divMask={divMask:F3} col0=({col0.r:F3},{col0.g:F3},{col0.b:F3}) col1=({col1.r:F3},{col1.g:F3},{col1.b:F3})");
            Assert.Greater(corner.r, 0.5f, "canto deveria ser fundo claro");
            Assert.Greater(corner.a, 0.9f, "alpha deveria ser opaco");
        }

        [Test] public void Audio_ClickDeterministicAndNormalized()
        {
            var a = AudioSynth.Click(3);
            var b = AudioSynth.Click(3);
            Assert.AreEqual(a.Length, b.Length);
            float peak = 0f;
            for (int i = 0; i < a.Length; i++)
            {
                Assert.AreEqual(a[i], b[i]);
                peak = Mathf.Max(peak, Mathf.Abs(a[i]));
            }
            Assert.That(peak, Is.EqualTo(0.70794578f).Within(0.01f)); // −3 dBFS
            Assert.That(peak, Is.LessThanOrEqualTo(1f)); // sem clip
        }

        [Test] public void Audio_VariantsDiffer()
        {
            var a = AudioSynth.Click(0);
            var b = AudioSynth.Click(7);
            float diff = 0f;
            for (int i = 0; i < a.Length; i++) diff += Mathf.Abs(a[i] - b[i]);
            Assert.Greater(diff, 0.01f);
        }

        [Test] public void Wav_HeaderValid44kMono16()
        {
            var wav = AudioSynth.ToWav(AudioSynth.Fall());
            Assert.Greater(wav.Length, 44);
            Assert.AreEqual((byte)'R', wav[0]); // "RIFF"
            Assert.AreEqual((byte)'d', wav[36]); // "data" em 36
            Assert.AreEqual((byte)'a', wav[37]);
            int rate = wav[24] | (wav[25] << 8) | (wav[26] << 16) | (wav[27] << 24);
            Assert.AreEqual(44100, rate);
            Assert.AreEqual(1, wav[22]); // mono
            Assert.AreEqual(16, wav[34]); // 16 bits
        }
    }
}
