// GDD §13.2: paralelepípedo exato das peças + cunha da Rampa. Pivô no centro
// da face inferior, escala 1. A malha tem EXATAMENTE a medida do BoxCollider
// (preenche a hitbox borda a borda, sem chanfro).
// Orçamento T2 (§13.6): ≤2000 tris (12 tris aqui).
using UnityEngine;

namespace Topple.Gen
{
    public static class MeshGen
    {
        // Caixa sólida: 6 faces explícitas (24 vértices, 12 triângulos).
        // Cada face é listada como [BL,BR,TR,TL] vista DE FORA (ordem anti-horária
        // = frente na Unity), com normal explícita para fora. Verificado por
        // produto vetorial: cross(BR-BL, TR-BL) == normal em todas as 6.
        // DOIS submeshes: 0 = tampas ±Z (textura 1:1), 1 = laterais ±X/±Y
        // (textura com tiling 2×2 — exige wrap Repeat; ver GenerateAll).
        public static Mesh BoxSolid(Vector3 size)
        {
            float hx = size.x / 2f, hz = size.z / 2f, y1 = size.y;
            var corners = new[]
            {
                // +Z (frente)
                new { n = new Vector3(0, 0, 1), v = new[] {
                    new Vector3(-hx, 0, hz), new Vector3(hx, 0, hz),
                    new Vector3(hx, y1, hz), new Vector3(-hx, y1, hz) } },
                // -Z (trás)
                new { n = new Vector3(0, 0, -1), v = new[] {
                    new Vector3(hx, 0, -hz), new Vector3(-hx, 0, -hz),
                    new Vector3(-hx, y1, -hz), new Vector3(hx, y1, -hz) } },
                // +X (lado direito)
                new { n = new Vector3(1, 0, 0), v = new[] {
                    new Vector3(hx, 0, hz), new Vector3(hx, 0, -hz),
                    new Vector3(hx, y1, -hz), new Vector3(hx, y1, hz) } },
                // -X (lado esquerdo)
                new { n = new Vector3(-1, 0, 0), v = new[] {
                    new Vector3(-hx, 0, -hz), new Vector3(-hx, 0, hz),
                    new Vector3(-hx, y1, hz), new Vector3(-hx, y1, -hz) } },
                // +Y (topo)
                new { n = new Vector3(0, 1, 0), v = new[] {
                    new Vector3(-hx, y1, hz), new Vector3(hx, y1, hz),
                    new Vector3(hx, y1, -hz), new Vector3(-hx, y1, -hz) } },
                // -Y (base)
                new { n = new Vector3(0, -1, 0), v = new[] {
                    new Vector3(-hx, 0, -hz), new Vector3(hx, 0, -hz),
                    new Vector3(hx, 0, hz), new Vector3(-hx, 0, hz) } },
            };
            var uvsCap = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            var uvsSide = new[] { new Vector2(0, 0), new Vector2(2, 0), new Vector2(2, 2), new Vector2(0, 2) };
            var verts = new System.Collections.Generic.List<Vector3>(24);
            var norms = new System.Collections.Generic.List<Vector3>(24);
            var uvs = new System.Collections.Generic.List<Vector2>(24);
            var trisCaps = new System.Collections.Generic.List<int>(12);
            var trisSides = new System.Collections.Generic.List<int>(24);
            for (int f = 0; f < 6; f++)
            {
                int b = verts.Count;
                var u = f < 2 ? uvsCap : uvsSide;
                for (int k = 0; k < 4; k++) { verts.Add(corners[f].v[k]); norms.Add(corners[f].n); uvs.Add(u[k]); }
                var tris = f < 2 ? trisCaps : trisSides;
                tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
                tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
            }
            var mesh = new Mesh { name = $"Box_{size.x}x{size.y}x{size.z}" };
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(trisCaps, 0);
            mesh.SetTriangles(trisSides, 1);
            mesh.RecalculateBounds();
#if UNITY_EDITOR
            // Trava de prova em tempo de geração: nenhuma face espelhada.
            for (int f = 0; f < 6; f++)
            {
                var a = corners[f].v[0]; var bb = corners[f].v[1]; var c = corners[f].v[2];
                var cross = Vector3.Cross(bb - a, c - a).normalized;
                if (Vector3.Dot(cross, corners[f].n) < 0.99f)
                    throw new System.Exception($"[TOPPLE][GEN] BoxSolid: face {f} com winding invertido.");
            }
#endif
            return mesh;
        }

        // Caixa chanfrada (legado, fora de uso): grade (segs+1)^2 por face. Mantida
        // p/ referência; as peças usam BoxSolid (medida exata da hitbox).
        public static Mesh BeveledBox(Vector3 size, float c, int segs = 4)
        {
            var verts = new System.Collections.Generic.List<Vector3>();
            var norms = new System.Collections.Generic.List<Vector3>();
            var uvs = new System.Collections.Generic.List<Vector2>();
            var trisCaps = new System.Collections.Generic.List<int>();
            var trisSides = new System.Collections.Generic.List<int>();
            Vector3 h = size / 2f;
            c = Mathf.Min(c, Mathf.Min(h.x, Mathf.Min(h.y, h.z)) * 0.5f);

            void Quad(Vector3 origin, Vector3 right, Vector3 up, Vector3 n, float w, float hgt, bool cap, Vector2 uvScale = default)
            {
                var tris = cap ? trisCaps : trisSides;
                if (uvScale == default) uvScale = Vector2.one;
                int baseIdx = verts.Count;
                for (int j = 0; j <= segs; j++)
                    for (int i = 0; i <= segs; i++)
                    {
                        float fu = i / (float)segs, fv = j / (float)segs;
                        // Apara cantos: puxa para dentro proporcional ao chanfro.
                        float ex = Mathf.Min(Mathf.Min(fu, 1f - fu), Mathf.Min(fv, 1f - fv));
                        float inset = c * (1f - Mathf.Clamp01(ex * segs * 0.5f)) / Mathf.Max(w, hgt);
                        var p = origin + right * (fu * w) + up * (fv * hgt) - n * (c * (1f - Mathf.Clamp01(ex * segs)));
                        verts.Add(p + new Vector3(0, h.y, 0)); // pivô na face inferior
                        norms.Add(n);
                        // Laterais repetem a textura (tiling): com UV 0-1 a face
                        // inteira espremia numa faixa fina e os pips sumiam no
                        // filtro. Exige wrap Repeat nas texturas (ver GenerateAll).
                        uvs.Add(new Vector2(fu * uvScale.x, fv * uvScale.y));
                    }
                for (int j = 0; j < segs; j++)
                    for (int i = 0; i < segs; i++)
                    {
                        // Unity: face frontal tem winding anti-horário vista de fora
                        // (normal = cross(right, up)). As chamadas das tampas ±Z já
                        // passam (right, up) destros; as 4 laterais passam base
                        // canhota e precisam da ordem espelhada — sem isto o Unity
                        // descarta as laterais (vazamento invisível).
                        int a = baseIdx + j * (segs + 1) + i;
                        if (cap)
                        {
                            tris.Add(a); tris.Add(a + 1); tris.Add(a + segs + 1);
                            tris.Add(a + 1); tris.Add(a + segs + 2); tris.Add(a + segs + 1);
                        }
                        else
                        {
                            tris.Add(a); tris.Add(a + segs + 1); tris.Add(a + 1);
                            tris.Add(a + 1); tris.Add(a + segs + 1); tris.Add(a + segs + 2);
                        }
                    }
            }

            // +X -X +Y -Y +Z -Z (origem = canto mínimo da face, eixos da face).
            // Tampas ±Z levam a textura 1:1; laterais repetem 2×2 (tiling).
            var sideUv = new Vector2(2f, 2f);
            Quad(new Vector3(h.x, -h.y, -h.z), new Vector3(0, 0, size.z), new Vector3(0, size.y, 0), Vector3.right, size.z, size.y, false, sideUv);
            Quad(new Vector3(-h.x, -h.y, h.z), new Vector3(0, 0, -size.z), new Vector3(0, size.y, 0), Vector3.left, size.z, size.y, false, sideUv);
            Quad(new Vector3(-h.x, h.y, -h.z), new Vector3(size.x, 0, 0), new Vector3(0, 0, size.z), Vector3.up, size.x, size.z, false, sideUv);
            Quad(new Vector3(-h.x, -h.y, h.z), new Vector3(size.x, 0, 0), new Vector3(0, 0, -size.z), Vector3.down, size.x, size.z, false, sideUv);
            Quad(new Vector3(-h.x, -h.y, h.z), new Vector3(size.x, 0, 0), new Vector3(0, size.y, 0), Vector3.forward, size.x, size.y, true);
            Quad(new Vector3(h.x, -h.y, -h.z), new Vector3(-size.x, 0, 0), new Vector3(0, size.y, 0), Vector3.back, size.x, size.y, true);

            var mesh = new Mesh { name = $"Beveled_{size.x}x{size.y}x{size.z}" };
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(trisCaps, 0);
            mesh.SetTriangles(trisSides, 1);
            mesh.RecalculateBounds();
            return mesh;
        }

        // Cunha da Rampa: largura w (X), altura h, profundidade d (Z), face inclinada +X.
        public static Mesh Wedge(float w, float h, float d)
        {
            var mesh = new Mesh { name = $"Wedge_{w}x{h}x{d}" };
            float y0 = 0f;
            Vector3[] v =
            {
                new Vector3(0, y0, -d / 2), new Vector3(w, y0, -d / 2), new Vector3(w, h, -d / 2), // trás (-Z)
                new Vector3(0, y0, d / 2), new Vector3(w, y0, d / 2), new Vector3(w, h, d / 2),     // frente (+Z)
            };
            // 2 triângulos laterais + base + costas + rampa = 5 quads/tris.
            // Ordem espelhada (anti-horário visto de fora = frente, como no
            // BeveledBox): a cunha anterior tinha tudo invertido e era vista
            // por dentro (só nunca se notou: nenhuma fase MVP usa rampa).
            int[] t =
            {
                0, 2, 1, // lateral -Z
                3, 4, 5, // lateral +Z
                0, 4, 3, 0, 1, 4, // base
                1, 5, 4, 1, 2, 5, // costas (+X)
                0, 5, 2, 0, 3, 5, // rampa
            };
            Vector2[] uv = { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1) };
            mesh.vertices = v;
            mesh.triangles = t;
            mesh.uv = uv;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
