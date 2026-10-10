// GDD §13.2: texturas das peças (atlas 28 faces por skin, pips por SDF com AA,
// ícones por glifos SDF) e §13.4: texturas tileáveis do campo por fBm periódico.
// Tudo determinístico (sem RNG de cena; offsets fixos).
using UnityEngine;

namespace Topple.Gen
{
    public static class TextureSynth
    {
        // Layouts de pips (coordenadas normalizadas da metade, origem centro).
        static Vector2[] Pips(int v)
        {
            float o = 0.26f; // deslocamento padrão
            return v switch
            {
                1 => new[] { new Vector2(0, 0) },
                2 => new[] { new Vector2(-o, o), new Vector2(o, -o) },
                3 => new[] { new Vector2(-o, o), new Vector2(0, 0), new Vector2(o, -o) },
                4 => new[] { new Vector2(-o, o), new Vector2(o, o), new Vector2(-o, -o), new Vector2(o, -o) },
                5 => new[] { new Vector2(-o, o), new Vector2(o, o), new Vector2(0, 0), new Vector2(-o, -o), new Vector2(o, -o) },
                6 => new[] { new Vector2(-o, o), new Vector2(o, o), new Vector2(-o, 0), new Vector2(o, 0), new Vector2(-o, -o), new Vector2(o, -o) },
                _ => System.Array.Empty<Vector2>(),
            };
        }

        static float SdfCircle(Vector2 p, Vector2 c, float r)
            => (p - c).magnitude - r;

        static float Aa(float d, float w) => 1f - GenUtil.SMask(-w, w, d);

        // Uma face de dominó 256×512: fundo + divisória + pips com AA. Retorna Color[].
        public static Color[] DominoFace(int top, int bottom, Color bg, Color pip, Color line, uint seed)
        {
            const int W = 256, H = 512;
            var px = new Color[W * H];
            float pipR = 0.055f, aa = 0.006f;
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W * 2f - 1f; // -1..1
                    float v = (y + 0.5f) / H * 2f - 1f;
                    // Fundo madeira: gradiente vertical + veio fBm (GDD §13.2).
                    float grain = GenUtil.TileableFbm(x / (float)W, y / (float)H, 8, 4, seed);
                    var col = bg * (0.92f + 0.10f * grain + 0.04f * v);
                    // Divisória central (1 dentro da linha).
                    float div = Mathf.Abs(v);
                    float divMask = 1f - GenUtil.SMask(0.004f, 0.012f, div);
                    col = Color.Lerp(col, line, divMask);
                    // Metades: superior = top, inferior = bottom.
                    bool upper = v > 0;
                    int val = upper ? top : bottom;
                    Vector2 half = upper ? new Vector2(u, (v - 0.5f) * 2f) : new Vector2(u, (v + 0.5f) * 2f);
                    float m = 0f;
                    foreach (var p in Pips(val))
                        m = Mathf.Max(m, Aa(SdfCircle(half, p, pipR), aa));
                    col = Color.Lerp(col, pip, m);
                    px[y * W + x] = col;
                }
            }
            return px;
        }

        // Atlas 7×4 células de 256×512 (1792×2048) com as 28 faces 0-0..6-6.
        public static Texture2D FaceAtlas(Color bg, Color pip, Color line)
        {
            const int CW = 256, CH = 512, COLS = 7, ROWS = 4;
            var tex = new Texture2D(COLS * CW, ROWS * CH, TextureFormat.RGBA32, false);
            int k = 0;
            for (int a = 0; a <= 6; a++)
                for (int b = a; b <= 6; b++)
                {
                    var face = DominoFace(a, b, bg, pip, line, (uint)(1000 + k));
                    int ox = (k % COLS) * CW, oy = (k / COLS) * CH;
                    for (int y = 0; y < CH; y++)
                        for (int x = 0; x < CW; x++)
                            tex.SetPixel(ox + x, oy + y, face[y * CW + x]);
                    k++;
                }
            tex.Apply(false, false);
            return tex;
        }

        // Face 2 pips grandes (Pesada) + seta para cima (Rampa), 256×512.
        public static Texture2D HeavyFace(Color bg, Color pip)
        {
            const int W = 256, H = 512;
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W * 2f - 1f, v = (y + 0.5f) / H * 2f - 1f;
                    float grain = GenUtil.TileableFbm(x / (float)W, y / (float)H, 8, 3, 77u);
                    var col = bg * (0.9f + 0.15f * grain);
                    float m = Mathf.Max(Aa(SdfCircle(new Vector2(u, v), new Vector2(0, 0.5f), 0.16f), 0.008f),
                                        Aa(SdfCircle(new Vector2(u, v), new Vector2(0, -0.5f), 0.16f), 0.008f));
                    tex.SetPixel(x, y, Color.Lerp(col, pip, m));
                }
            tex.Apply(false, false);
            return tex;
        }

        public static Texture2D RampFace(Color bg, Color arrow)
        {
            const int W = 256, H = 512;
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W * 2f - 1f, v = (y + 0.5f) / H * 2f - 1f;
                    var col = bg;
                    // Seta: haste (caixa) + ponta (triângulo) por SDF.
                    float shaft = Mathf.Max(Mathf.Abs(u) - 0.10f, Mathf.Abs(v + 0.1f) - 0.45f);
                    float head = Mathf.Max((v - 0.55f) + Mathf.Abs(u) * 1.2f, -(v - 0.15f));
                    float m = Mathf.Max(Aa(shaft, 0.02f), Aa(head, 0.02f));
                    // Faixas diagonais sutis no fundo.
                    col *= 1f + 0.06f * GenUtil.TileableFbm(x / (float)W, y / (float)H, 6, 2, 9u);
                    tex.SetPixel(x, y, Color.Lerp(col, arrow, m));
                }
            tex.Apply(false, false);
            return tex;
        }

        // Campo 512×512 tileável por fBm (GDD §13.4). kind: 0 grama, 1 terra, 2 pedra, 3 madeira.
        public static Texture2D Field(int kind, ArtBible bible)
        {
            const int S = 512;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, true);
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float u = x / (float)S, v = y / (float)S;
                    float n1 = GenUtil.TileableFbm(u, v, 8, 4, (uint)(501 + kind * 17));
                    float n2 = GenUtil.TileableFbm(u, v, 32, 2, (uint)(977 + kind * 31));
                    Color col;
                    switch (kind)
                    {
                        case 1: // terra
                            col = bible.Get("dirt", new Color(0.54f, 0.38f, 0.22f)) * (0.85f + 0.3f * n1);
                            col = Color.Lerp(col, col * 0.8f, GenUtil.SMask(0.6f, 0.9f, n2) * 0.5f);
                            break;
                        case 2: // pedra: 3 tons + rejunte escuro
                            float cell = Mathf.Floor(n1 * 3f) / 2f;
                            col = bible.Get("stone", new Color(0.6f, 0.6f, 0.63f)) * (0.8f + 0.2f * cell);
                            col = Color.Lerp(col * 0.55f, col, GenUtil.SMask(0.03f, 0.12f, Mathf.Abs(n2 - 0.5f)));
                            break;
                        case 3: // madeira (mesa): tábuas horizontais + veio
                            float plank = Mathf.Floor(v * 6f);
                            float gap = GenUtil.SMask(0.0f, 0.03f, Mathf.Abs(v * 6f - plank - 0.5f) - 0.47f);
                            col = bible.Get("wood", new Color(0.48f, 0.32f, 0.19f)) * (0.85f + 0.25f * n1 + 0.08f * (plank % 2));
                            col *= 1f - 0.45f * (1f - gap);
                            break;
                        default: // grama Vila
                            col = bible.Get("grass", new Color(0.37f, 0.66f, 0.30f)) * (0.85f + 0.3f * n1);
                            col = Color.Lerp(col, col * 1.1f + new Color(0.05f, 0.08f, 0f), GenUtil.SMask(0.55f, 0.95f, n2) * 0.6f);
                            break;
                    }
                    tex.SetPixel(x, y, col);
                }
            tex.Apply(true, false);
            return tex;
        }
    }
}
