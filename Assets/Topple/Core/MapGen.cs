// Geração procedural de fases (pura, sem UnityEngine — testável em EditMode).
// Prova por construção: gera a ROTA de referência primeiro (juntas ≤90°,
// passo 0,40 m) e posiciona tudo em relação a ela, então as invariantes valem
// por construção e os testes só verificam (rápido, N seeds).
// Unidades: células de grade (0,05 m, como PlanningData).
using System.Collections.Generic;

namespace Topple.Core
{
    public enum MapEnemyKind { Soldier, Brute, Patroller }

    public struct MapPt
    {
        public float X, Z;
        public MapPt(float x, float z) { X = x; Z = z; }
    }

    public struct MapSoldier
    {
        public MapEnemyKind Kind;
        public float X, Z;
        public float Speed; // patrulheiro
        public List<MapPt> Loop; // patrulheiro (fechado, ≥2)
        public Team Team; // time narrativo (só visual)
    }

    public struct MapBlock
    {
        public float CX, CZ, SX, SZ;
        public BlockVariant Variant; // só pintura (validade idêntica)
    }

    // Ponte-vão: disco onde NÃO se constrói (chão intacto); a onda atravessa
    // se o diâmetro couber no alcance da peça (≤0,6 Grande, ≤1,0 Torre).
    public struct MapGap
    {
        public float X, Z, RadiusCells, NeedReach;
    }

    // Buraco: retângulo SEM chão (a linha morre ali — contorne). Metros, grade 1 m.
    public struct MapVoid
    {
        public float X0, Z0, X1, Z1;
    }

    public sealed class MapSpec
    {
        public string Name = "";
        public int TriggerGx, TriggerGz;
        public float TriggerDeg;
        public int ParPieces;
        public readonly List<MapSoldier> Soldiers = new();
        public readonly List<MapBlock> Blocks = new();
        public readonly List<MapGap> Gaps = new();
        public readonly List<MapVoid> Voids = new();
        public readonly List<MapPt> ClusterCenters = new(); // 1 por pelotão (fork-útil)
    }

    public static class MapGen
    {
        const float Cell = 0.05f;
        const int FieldHx = 200; // |x| ≤ 10 m (laje 24×16 com margem)
        const int FieldHz = 140; // |z| ≤ 7 m

        static float ToWorld(int g) => g * Cell;

        static float RngRange(ref ToppleRng rng, float a, float b) =>
            a + rng.NextFloat() * (b - a);

        static int RngInt(ref ToppleRng rng, int lo, int hi) => // [lo, hi)
            lo + (int)(rng.NextFloat() * (hi - lo));

        // Rota de referência: random-walk com juntas ≤90°, passo 8 células.
        static List<(int gx, int gz, float deg)> ReferenceRoute(ref ToppleRng rng, int tgx, int tgz, float tdeg,
            int legsMin, int legsMax, int lenMinCells, int lenMaxCells)
        {
            float x = ToWorld(tgx), z = ToWorld(tgz), deg = tdeg;
            var pts = new List<(int, int, float)>();
            pts.Add((tgx, tgz, deg));
            int legs = legsMin + RngInt(ref rng, 0, legsMax - legsMin + 1); // juntas ≤90° sempre
            for (int l = 0; l < legs; l++)
            {
                float r = deg * (float)System.Math.PI / 180f;
                float fx = (float)System.Math.Sin(r), fz = (float)System.Math.Cos(r);
                int len = RngInt(ref rng, lenMinCells, lenMaxCells + 1);
                int steps = len / 8;
                for (int s = 0; s < steps; s++)
                {
                    x += fx * 0.4f; z += fz * 0.4f;
                    int gx = (int)System.Math.Round(x / Cell), gz = (int)System.Math.Round(z / Cell);
                    if (System.Math.Abs(gx) > FieldHx || System.Math.Abs(gz) > FieldHz) break;
                    pts.Add((gx, gz, deg));
                }
                float turn = RngRange(ref rng, -90f, 90f);
                deg = (deg + turn) % 360f;
                if (deg < 0) deg += 360f;
            }
            return pts;
        }

        static float DistCells(float x0, float z0, float x1, float z1)
        {
            float dx = (x1 - x0) / Cell, dz = (z1 - z0) / Cell;
            return (float)System.Math.Sqrt(dx * dx + dz * dz);
        }

        // Projeção conservadora de deck (commons-picker, economia-maior):
        // base 15 + Σ packs (5+i). Prof 10 ≈ 110 cartas.
        public static int DeckForDepth(int depth)
        {
            int d = System.Math.Max(0, depth);
            return 15 + 5 * d + d * (d - 1) / 2;
        }

        // Teto DURO de corpos (dono): deck banca com folga p/ desperdício
        // humano. Gigantes acima disso não nascem (sem loteria).
        public static int MaxBodiesForDepth(int depth) =>
            System.Math.Min(3 + System.Math.Max(0, depth), 16);

        // Time por pelotão SEM consumir o rng (não desloca o layout existente):
        // hash(seed, depth, cluster). Prof 0-2 sempre Evil (abertura lê 1 cor).
        static Team ClusterTeam(uint seed, int depth, int cluster)
        {
            if (depth <= 2) return Team.Evil;
            uint h = seed + (uint)depth * 2654435761u + (uint)cluster * 40503u + 1u;
            h ^= h >> 13; h *= 1274126177u; h ^= h >> 16;
            return (h & 1u) == 0u ? Team.Good : Team.Evil;
        }

        public static MapSpec Generate(uint seed, int depth)
        {
            var rng = new ToppleRng(seed ^ (uint)(depth * 7919 + 1));
            var spec = new MapSpec();
            // Trigger alterna quadrante a cada fase (anti-mesmo-jogo).
            int q = depth % 4;
            int tgx = 0, tgz = 0; float tdeg = 90f;
            if (q == 1) { tdeg = 0f; }
            else if (q == 2) { tgx = -40; tdeg = 90f; }
            else if (q == 3) { tgz = -40; tdeg = 0f; }
            spec.TriggerGx = tgx; spec.TriggerGz = tgz; spec.TriggerDeg = tdeg;
            spec.Name = $"Gerada {depth + 1}";

            // Curva de dificuldade (tabela explícita): porta de entrada mansa,
            // vetos e mistura entram por profundidade. Prof 0-1 ≈ P1 do tutorial.
            int clusterBase, clusterCap, sizeLo, sizeHi, legsMin, legsMax, lenMin, lenMax;
            bool allowWall, allowPatrol;
            if (depth <= 1)
            { clusterBase = 1; clusterCap = 1; sizeLo = 2; sizeHi = 4; legsMin = 2; legsMax = 2; lenMin = 40; lenMax = 60; allowWall = false; allowPatrol = false; }
            else if (depth <= 3)
            { clusterBase = 2; clusterCap = 2; sizeLo = 2; sizeHi = 5; legsMin = 2; legsMax = 3; lenMin = 40; lenMax = 80; allowWall = true; allowPatrol = false; }
            else if (depth <= 5)
            { clusterBase = 3; clusterCap = 3; sizeLo = 2; sizeHi = 5; legsMin = 3; legsMax = 4; lenMin = 60; lenMax = 99; allowWall = true; allowPatrol = true; }
            else
            { clusterBase = 3 + depth / 4; clusterCap = 5; sizeLo = 2; sizeHi = System.Math.Min(5 + depth / 10, 8); legsMin = 3; legsMax = 4; lenMin = 60; lenMax = 99; allowWall = true; allowPatrol = true; }
            if (clusterBase > clusterCap) clusterBase = clusterCap;

            var route = ReferenceRoute(ref rng, tgx, tgz, tdeg, legsMin, legsMax, lenMin, lenMax);
            float tx = ToWorld(tgx), tz = ToWorld(tgz);

            int clusters = clusterBase + RngInt(ref rng, 0, clusterCap - clusterBase + 1);
            int brutesLeft = depth >= 6 ? System.Math.Min(1 + depth / 8, 3) : 0;
            var centroids = new List<(float x, float z)>();
            var clusterSizes = new List<int>();
            int anchor0 = -1;

            for (int c = 0; c < clusters; c++)
            {
                int before = spec.Soldiers.Count;
                bool placed = false;
                for (int attempt = 0; attempt < 8 && !placed; attempt++)
                {
                    // Fork-útil (prof 4+): 2º pelotão nasce perto do 1º ao longo
                    // da rota (só na 1ª tentativa; resto espalha normal).
                    int anchorIdx = RngInt(ref rng, 0, route.Count);
                    if (c == 1 && depth >= 4 && anchor0 >= 0 && attempt == 0)
                        anchorIdx = (anchor0 + RngInt(ref rng, -4, 5) + route.Count) % route.Count;
                    else if (c == 0 && attempt == 0) anchor0 = anchorIdx;
                    var anchor = route[anchorIdx];
                    float ar = anchor.deg * (float)System.Math.PI / 180f;
                    float anx = anchor.gx * Cell, anz = anchor.gz * Cell;
                    // Lados alternados (pelotões opostos forçam o split).
                    float side = (c % 2 == 0) ? 1f : -1f;
                    float off = RngRange(ref rng, 10f, 14f);
                    float cx = anx + (float)System.Math.Cos(ar) * side * off * Cell;
                    float cz = anz - (float)System.Math.Sin(ar) * side * off * Cell;
                    // Separação entre grupos ≥ 1,0 m (sem splash grátis entre grupos).
                    bool ok = true;
                    foreach (var o in centroids)
                        if (DistCells(cx, cz, o.x, o.z) < 20f) { ok = false; break; }
                    if (!ok) continue;
                    // Fileira ao longo da tangente, espaçamento 0,6 m (encadeia no splash).
                    int size = RngInt(ref rng, sizeLo, sizeHi); // [sizeLo, sizeHi)
                    float r2 = ar;
                    float dirx = (float)System.Math.Sin(r2), dirz = (float)System.Math.Cos(r2);
                    var members = new List<(float x, float z)>();
                    for (int k = 0; k < size; k++)
                    {
                        float px = cx + dirx * (k - (size - 1) * 0.5f) * 12f * Cell;
                        float pz = cz + dirz * (k - (size - 1) * 0.5f) * 12f * Cell;
                        // Fora da rota (não nasce em cima do caminho) e dentro do campo.
                        bool onRoute = false;
                        foreach (var rp in route)
                            if (DistCells(px, pz, rp.gx * Cell, rp.gz * Cell) < 6f) { onRoute = true; break; }
                        if (onRoute) { ok = false; break; }
                        if (System.Math.Abs(px / Cell) > FieldHx || System.Math.Abs(pz / Cell) > FieldHz) { ok = false; break; }
                        // Corrente obrigatória: longe do trigger (peça única nunca alcança).
                        if (DistCells(px, pz, tx, tz) < 26f) { ok = false; break; }
                        foreach (var s in spec.Soldiers)
                            if (DistCells(px, pz, s.X, s.Z) < 10f) { ok = false; break; }
                        if (!ok) break;
                        // Fora de muros já colocados.
                        foreach (var b in spec.Blocks)
                            if (DistCells(px, pz, b.CX, b.CZ) < b.SX / (2f * Cell) + 7f) { ok = false; break; }
                        if (!ok) break;
                        members.Add((px, pz));
                    }
                    if (!ok || members.Count < 2) continue;
                    var team = ClusterTeam(seed, depth, c);
                    foreach (var m in members)
                    {
                        var kind = MapEnemyKind.Soldier;
                        if (brutesLeft > 0 && rng.NextFloat() < 0.3f) { kind = MapEnemyKind.Brute; brutesLeft--; }
                        spec.Soldiers.Add(new MapSoldier { Kind = kind, X = m.x, Z = m.z, Team = team });
                    }
                    centroids.Add((cx, cz));
                    spec.ClusterCenters.Add(new MapPt(cx, cz));
                    placed = true;

                    // Veto do cluster: muro OU patrulha (nunca os dois, nunca no 1º grupo;
                    // prof 0-1 sem veto, 2-3 só muro; prof 6+ veta mais (ramo alternativo)).
                    if (c > 0 && (allowWall || allowPatrol) && rng.NextFloat() < (depth >= 6 ? 0.8f : 0.7f))
                    {
                        if (!allowPatrol || (allowWall && rng.NextFloat() < 0.5f)) TryWall(ref rng, spec, route, cx, cz, tx, tz);
                        else TryPatrol(ref rng, spec, cx, cz, tx, tz, depth, team);
                    }
                }
                if (placed) clusterSizes.Add(spec.Soldiers.Count - before);
            }

            int routeLen = route.Count * 8; // células
            spec.ParPieces = System.Math.Max(8, routeLen / 8 + spec.Soldiers.Count * 2);
            // Ponte-vão (prof 4+): disco no meio da rota onde não se constrói;
            // a queda atravessa se Ø ≤ alcance (Grande 0,6 / Torre 1,0).
            if (depth >= 4)
            {
                int gaps = depth >= 8 && rng.NextFloat() < 0.4f ? 2 : 1;
                for (int g = 0; g < gaps; g++)
                    if (rng.NextFloat() < 0.55f) TryGap(ref rng, spec, route, tx, tz);
            }
            // Buraco (prof 6+): retângulo sem chão no corredor da rota (contorne).
            if (depth >= 6)
            {
                int voids = depth >= 12 && rng.NextFloat() < 0.35f ? 2 : 1;
                for (int v = 0; v < voids; v++)
                    if (rng.NextFloat() < 0.6f) TryVoid(ref rng, spec, route, tx, tz);
            }
            // Antidegeneração: sempre ≥1 pelotão (fim da rota, fora do caminho).
            if (spec.Soldiers.Count == 0 && route.Count > 0)
            {
                var end = route[route.Count - 1];
                float er = end.deg * (float)System.Math.PI / 180f;
                var fallbackTeam = ClusterTeam(seed, depth, 999);
                for (int k = -1; k <= 1; k++)
                {
                    float px = end.gx * Cell + (float)System.Math.Cos(er) * 12f * Cell + (float)System.Math.Sin(er) * k * 12f * Cell;
                    float pz = end.gz * Cell - (float)System.Math.Sin(er) * 12f * Cell + (float)System.Math.Cos(er) * k * 12f * Cell;
                    spec.Soldiers.Add(new MapSoldier { Kind = MapEnemyKind.Soldier, X = px, Z = pz, Team = fallbackTeam });
                }
                float fcx = end.gx * Cell, fcz = end.gz * Cell;
                spec.ClusterCenters.Add(new MapPt(fcx, fcz));
                clusterSizes.Add(3);
            }
            // Teto DURO de corpos: remove pelotões inteiros do fim até caber
            // (mín. 1 pelotão e 3 corpos); par acompanha (−2/corpo).
            int maxBodies = MaxBodiesForDepth(depth);
            while (spec.Soldiers.Count > maxBodies && spec.Soldiers.Count > 3 && clusterSizes.Count > 1)
            {
                int n = clusterSizes[clusterSizes.Count - 1];
                n = System.Math.Min(n, spec.Soldiers.Count - 3);
                if (n <= 0) break;
                spec.Soldiers.RemoveRange(spec.Soldiers.Count - n, n);
                if (spec.ClusterCenters.Count > 1) spec.ClusterCenters.RemoveAt(spec.ClusterCenters.Count - 1);
                clusterSizes.RemoveAt(clusterSizes.Count - 1);
                spec.ParPieces = System.Math.Max(8, spec.ParPieces - 2 * n);
            }
            return spec;
        }

        // Ponte-vão: disco sobre a rota onde não se constrói (Ø 0,45-1,0 m).
        static void TryGap(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float tx, float tz)
        {
            if (route.Count < 6) return;
            var s = route[RngInt(ref rng, route.Count / 3, route.Count * 2 / 3)];
            float cx = s.gx * Cell, cz = s.gz * Cell;
            float radius = RngRange(ref rng, 4.5f, 10f); // Ø 0,45-1,0 m
            if (DistCells(cx, cz, tx, tz) < radius + 8f) return; // fora do trigger
            foreach (var sl in spec.Soldiers)
                if (DistCells(cx, cz, sl.X, sl.Z) < radius + 10f) return; // fora de pelotão
            foreach (var b in spec.Blocks)
                if (DistCells(cx, cz, b.CX, b.CZ) < radius + b.SX / (2f * Cell) + 4f) return;
            foreach (var gp in spec.Gaps)
                if (DistCells(cx, cz, gp.X, gp.Z) < radius + gp.RadiusCells + 6f) return;
            float need = radius * 2f <= 12f ? 0.6f : 1.0f;
            spec.Gaps.Add(new MapGap { X = cx, Z = cz, RadiusCells = radius, NeedReach = need });
            spec.ParPieces += 2; // peça longa custa atenção
        }

        // Buraco: quadrado 1-2 m sem chão perto da rota (a linha morre ali).
        static void TryVoid(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float tx, float tz)
        {
            if (route.Count < 6) return;
            var s = route[RngInt(ref rng, route.Count / 3, route.Count * 2 / 3)];
            float r = s.deg * (float)System.Math.PI / 180f;
            float side = rng.NextFloat() < 0.5f ? 1f : -1f;
            float off = RngRange(ref rng, 10f, 30f); // 0,5-1,5 m da rota
            float cx = s.gx * Cell + (float)System.Math.Cos(r) * side * off * Cell;
            float cz = s.gz * Cell - (float)System.Math.Sin(r) * side * off * Cell;
            float half = RngRange(ref rng, 0.5f, 1.0f);
            // Grade 1 m: retângulo alinhado, 1–2 m (Floor/Ceiling em fração
            // estourava p/ 3 m em alguns alinhamentos — corta o lado longe).
            float x0 = (float)System.Math.Floor(cx - half), x1 = (float)System.Math.Ceiling(cx + half);
            float z0 = (float)System.Math.Floor(cz - half), z1 = (float)System.Math.Ceiling(cz + half);
            float sx = s.gx * Cell, sz = s.gz * Cell;
            while (x1 - x0 > 2f) { if (x1 - sx > sx - x0) x1 -= 1f; else x0 += 1f; }
            while (z1 - z0 > 2f) { if (z1 - sz > sz - z0) z1 -= 1f; else z0 += 1f; }
            if (x0 < -11f || x1 > 11f || z0 < -7f || z1 > 7f) return;
            float mx = (x0 + x1) * 0.5f, mz = (z0 + z1) * 0.5f;
            float mhalf = System.Math.Max(x1 - x0, z1 - z0) * 0.5f + 0.3f;
            if (DistCells(mx, mz, tx, tz) < mhalf / Cell + 8f) return; // fora do trigger
            foreach (var sl in spec.Soldiers)
                if (DistCells(mx, mz, sl.X, sl.Z) < mhalf / Cell + 10f) return; // fora de pelotão
            foreach (var b in spec.Blocks)
                if (DistCells(mx, mz, b.CX, b.CZ) < mhalf / Cell + b.SX / (2f * Cell) + 2f) return;
            foreach (var gp in spec.Gaps)
                if (DistCells(mx, mz, gp.X, gp.Z) < mhalf / Cell + gp.RadiusCells + 2f) return;
            foreach (var vd in spec.Voids)
            {
                float ox = (vd.X0 + vd.X1) * 0.5f, oz = (vd.Z0 + vd.Z1) * 0.5f;
                float oh = System.Math.Max(vd.X1 - vd.X0, vd.Z1 - vd.Z0) * 0.5f;
                if (DistCells(mx, mz, ox, oz) < (mhalf + oh) / Cell + 4f) return;
            }
            spec.Voids.Add(new MapVoid { X0 = x0, Z0 = z0, X1 = x1, Z1 = z1 });
            spec.ParPieces += 2; // contorno custa peças
        }
        static void TryWall(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float cx, float cz, float tx, float tz)
        {
            for (int i = 0; i < 6; i++)
            {                float a = RngRange(ref rng, 0f, (float)System.Math.PI * 2f);
                float d = RngRange(ref rng, 22f, 30f); // 1,1-1,5 m do centro
                float bx = cx + (float)System.Math.Cos(a) * d * Cell;
                float bz = cz + (float)System.Math.Sin(a) * d * Cell;
                float half = RngRange(ref rng, 8f, 12f); // 0,8-1,2 m
                bool ok = System.Math.Abs(bx / Cell) + half < FieldHx && System.Math.Abs(bz / Cell) + half < FieldHz;
                if (ok && DistCells(bx, bz, tx, tz) < half + 8f) ok = false; // fora do trigger
                if (ok)
                    foreach (var rp in route)
                        if (DistCells(bx, bz, rp.gx * Cell, rp.gz * Cell) < half + 6f) { ok = false; break; }
                if (ok)
                    foreach (var s in spec.Soldiers)
                        if (DistCells(bx, bz, s.X, s.Z) < half + 7f) { ok = false; break; }
                if (!ok) continue;
                spec.Blocks.Add(new MapBlock { CX = bx, CZ = bz, SX = half * 2f * Cell, SZ = half * 2f * Cell, Variant = VariantFor(bx, bz) });
                return;
            }
        }

        // Variante do muro por posição (determinística, sem consumir o rng).
        public static BlockVariant VariantFor(float x, float z)
        {
            long h = (long)(System.Math.Abs(x * 12.915 + z * 78.233) * 100.0);
            return (BlockVariant)(h % 3);
        }

        // Patrulha em retângulo ao redor do cluster (timing, não bloqueio).
        static void TryPatrol(ref ToppleRng rng, MapSpec spec, float cx, float cz, float tx, float tz, int depth, Team team)
        {
            float half = RngRange(ref rng, 18f, 26f) * Cell; // 0,9-1,3 m
            var loop = new List<MapPt>
            {
                new MapPt(cx - half, cz - half), new MapPt(cx + half, cz - half),
                new MapPt(cx + half, cz + half), new MapPt(cx - half, cz + half),
            };
            foreach (var w in loop)
            {
                if (System.Math.Abs(w.X / Cell) > FieldHx || System.Math.Abs(w.Z / Cell) > FieldHz) return;
                if (DistCells(w.X, w.Z, tx, tz) < 24f) return; // trigger longe (corrente)
                foreach (var s in spec.Soldiers)
                    if (DistCells(w.X, w.Z, s.X, s.Z) < 10f) return; // sem grudar em soldado
            }
            float speed = System.Math.Min(0.3f + depth * 0.02f, 0.8f);
            spec.Soldiers.Add(new MapSoldier { Kind = MapEnemyKind.Patroller, X = loop[0].X, Z = loop[0].Z, Speed = speed, Loop = loop, Team = team });
        }
    }
}
