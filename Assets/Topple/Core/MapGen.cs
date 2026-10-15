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
        public bool Gate; // muro-porteira: nasceu EM CIMA da rota (força curva)
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
        public readonly List<MapPt> RefRoute = new(); // rota de referência (provas/solver)
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
            foreach (var rp in route) spec.RefRoute.Add(new MapPt(rp.gx * Cell, rp.gz * Cell));

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
                    if (c == 0 && attempt == 0) anchor0 = anchorIdx;
                    else if (c >= 1 && depth >= 4 && attempt == 0 && centroids.Count > 0)
                    {
                        // Ex.3 do sketch: rumo divergente (70–160°) a 2,5–5 m
                        // do trigger; ancora no ponto da rota mais próximo
                        // (≤1,5 m). Sem rota por perto, vale o sorteio acima
                        // (ou o tronco compartilhado p/ c==1).
                        float b0 = (float)System.Math.Atan2(centroids[0].x - tx, centroids[0].z - tz);
                        float tb = b0 + (rng.NextFloat() < 0.5f ? -1f : 1f) * RngRange(ref rng, 1.2217f, 2.7925f);
                        float td = RngRange(ref rng, 50f, 100f);
                        float qx = tx + (float)System.Math.Sin(tb) * td * Cell;
                        float qz = tz + (float)System.Math.Cos(tb) * td * Cell;
                        int bestI = -1;
                        float bestD = 30f;
                        for (int ri = 0; ri < route.Count; ri++)
                        {
                            float rd = DistCells(qx, qz, route[ri].gx * Cell, route[ri].gz * Cell);
                            if (rd < bestD) { bestD = rd; bestI = ri; }
                        }
                        if (bestI >= 0) anchorIdx = bestI;
                        else if (c == 1 && anchor0 >= 0)
                            anchorIdx = (anchor0 + RngInt(ref rng, -4, 5) + route.Count) % route.Count;
                    }
                    var anchor = route[anchorIdx];
                    float ar = anchor.deg * (float)System.Math.PI / 180f;
                    float anx = anchor.gx * Cell, anz = anchor.gz * Cell;
                    // Lados alternados (pelotões opostos forçam o split).
                    float side = (c % 2 == 0) ? 1f : -1f;
                    float off = RngRange(ref rng, 10f, 14f);
                    float cx = anx + (float)System.Math.Cos(ar) * side * off * Cell;
                    float cz = anz - (float)System.Math.Sin(ar) * side * off * Cell;
                    if (c >= 1 && depth >= 4 && attempt == 0 && centroids.Count > 0)
                    {
                        // Ex.3 do sketch: centroide DIRETO no rumo divergente
                        // (70–160° do 1º, a 2,5–5 m), fileira de frente p/ o
                        // trigger. Filtros abaixo valem igual (nunca trava).
                        float b0 = (float)System.Math.Atan2(centroids[0].x - tx, centroids[0].z - tz);
                        float tb = b0 + (rng.NextFloat() < 0.5f ? -1f : 1f) * RngRange(ref rng, 1.2217f, 2.7925f);
                        float td = RngRange(ref rng, 50f, 100f);
                        cx = tx + (float)System.Math.Sin(tb) * td * Cell;
                        cz = tz + (float)System.Math.Cos(tb) * td * Cell;
                        ar = tb + 1.5708f;
                    }
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

                    // Veto do cluster: muro OU patrulha (nunca os dois; patrulha
                    // nunca no 1º grupo; muro vale em todos — quase toda linha
                    // trigger→pelotão cruza um muro, pedido do dono).
                    // prof 0-1 sem veto, 2-3 só muro; prof 6+ veta mais.
                    if (c > 0 && (allowWall || allowPatrol) && rng.NextFloat() < (depth >= 6 ? 0.85f : 0.8f))
                    {
                        if (!allowPatrol || (allowWall && rng.NextFloat() < 0.5f)) TryWall(ref rng, spec, route, cx, cz, tx, tz, tdeg);
                        else TryPatrol(ref rng, spec, cx, cz, tx, tz, depth, team);
                    }
                    else if (c == 0 && allowWall && rng.NextFloat() < 0.8f)
                    {
                        TryWall(ref rng, spec, route, cx, cz, tx, tz, tdeg);
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
            // Muros do sketch (dono): porteira EM CIMA da rota + escudo atrás
            // do pelotão. Vêm por último: não deslocam soldados/vãos/buracos.
            // Telas de corredor primeiro (eixo de cada pelotão final).
            if (depth >= 3)
            {
                foreach (var cc in spec.ClusterCenters)
                    if (rng.NextFloat() < 0.9f) TryCorridorScreen(ref rng, spec, tx, tz, tdeg, cc.X, cc.Z);
            }
            if (depth >= 3)
            {
                int gates = depth >= 8 && rng.NextFloat() < 0.5f ? 2 : 1;
                for (int g = 0; g < gates; g++)
                    if (rng.NextFloat() < 0.9f) TryGateWall(ref rng, spec, route, tx, tz);
            }
            if (depth >= 4 && spec.ClusterCenters.Count > 0 && rng.NextFloat() < 0.5f)
                TryShieldWall(ref rng, spec, route, tx, tz);
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
        static void TryWall(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float cx, float cz, float tx, float tz, float tdeg)
        {
            // Muro corrido NO EIXO (dono): nasce atravessado no segmento reto
            // trigger→centroide (40–65% do caminho) — quase toda linha de ataque
            // cruza um muro. 2–3 trechos finos em L/Z a partir da travessa.
            // Eixo-alinhado: sem rotação, collider exato. 1 veto = 1 corrida (+2).
            for (int i = 0; i < 6; i++)
            {
                float ax = cx - tx, az = cz - tz;
                float alen = (float)System.Math.Sqrt(ax * ax + az * az);
                if (alen < 1e-4f) return;
                float frac = RngRange(ref rng, 0.40f, 0.65f);
                // Perpendicular ao eixo (a barra atravessa o caminho).
                int dx, dz;
                if (System.Math.Abs(ax) > System.Math.Abs(az)) { dx = 0; dz = rng.NextFloat() < 0.5f ? 1 : -1; }
                else { dx = rng.NextFloat() < 0.5f ? 1 : -1; dz = 0; }
                float jx = -az / alen, jz = ax / alen;
                float jit = RngRange(ref rng, -4f, 4f); // ±0,2 m fora do eixo
                float len0 = RngRange(ref rng, 16f, 32f) * Cell;
                float thick0 = RngRange(ref rng, 6f, 9f) * Cell;
                float qx = tx + ax * frac + jx * jit * Cell;
                float qz = tz + az * frac + jz * jit * Cell;
                float px = qx - dx * len0 * 0.5f, pz = qz - dz * len0 * 0.5f;
                int segs = 2 + (rng.NextFloat() < 0.5f ? 1 : 0);
                var run = new List<(float cx, float cz, float sx, float sz)>();
                bool ok = true;
                for (int k = 0; k < segs && ok; k++)
                {
                    float len, thick;
                    if (k == 0) { len = len0; thick = thick0; }
                    else { len = RngRange(ref rng, 16f, 32f) * Cell; thick = RngRange(ref rng, 6f, 9f) * Cell; }
                    float wx = dx != 0 ? len : thick;
                    float wz = dz != 0 ? len : thick;
                    float ccx = px + dx * len * 0.5f;
                    float ccz = pz + dz * len * 0.5f;
                    float halfLen = len / (2f * Cell);
                    ok = WallSegOk(spec, ccx, ccz, halfLen, wx, wz, tx, tz, tdeg);
                    if (!ok) break;
                    run.Add((ccx, ccz, wx, wz));
                    px = ccx + dx * len * 0.5f;
                    pz = ccz + dz * len * 0.5f;
                    int s = rng.NextFloat() < 0.5f ? 1 : -1;
                    int ndx = -dz * s, ndz = dx * s; // gira 90°
                    dx = ndx; dz = ndz;
                }
                if (!ok || run.Count < 2) continue;
                foreach (var r in run)
                    spec.Blocks.Add(new MapBlock { CX = r.cx, CZ = r.cz, SX = r.sx, SZ = r.sz, Variant = VariantFor(r.cx, r.cz) });
                spec.ParPieces += 2;
                return;
            }
        }

        // Validade de 1 segmento: campo, fora dos pelotões, sem grudar noutro
        // muro. Trigger em 2 faixas: colado (1 m) nunca; no CONE de lançamento
        // (±30° da facing) 2 m (muro no cone sufoca a saída — gramática do P2).
        // Fora do cone, 1 m basta e o corredor curto continua guardado.
        static bool WallSegOk(MapSpec spec,
            float bx, float bz, float halfLen, float wx, float wz, float tx, float tz, float tdeg)
        {
            if (!(System.Math.Abs(bx / Cell) + wx / (2f * Cell) < FieldHx
                && System.Math.Abs(bz / Cell) + wz / (2f * Cell) < FieldHz)) return false;
            float tdist = DistCells(bx, bz, tx, tz);
            if (tdist < halfLen + 20f) return false; // colado no trigger: 1 m
            if (tdist < halfLen + 40f)
            {
                float ang = (float)System.Math.Atan2(bx - tx, bz - tz);
                float dd = (float)System.Math.Abs(ang - tdeg * (float)System.Math.PI / 180f) % ((float)System.Math.PI * 2f);
                if (dd > System.Math.PI) dd = (float)System.Math.PI * 2f - dd;
                if (dd < 0.52f) return false; // no cone: 2 m (lançamento respira)
            }
            foreach (var s in spec.Soldiers)
            {
                // Anel de engajamento: a onda precisa chegar a 0,5 m do soldado
                // fora de qualquer bolha (vale jogo, harness e humano).
                float ban = WallBanRadius(wx, wz);
                if (RectDistCells(s.X, s.Z, bx, bz, wx, wz) < ban) return false;
                if (s.Loop != null)
                    foreach (var w in s.Loop)
                        if (RectDistCells(w.X, w.Z, bx, bz, wx, wz) < ban) return false;
            }
            foreach (var b in spec.Blocks)
            {
                float bh = (b.SX > b.SZ ? b.SX : b.SZ) / (2f * Cell);
                if (DistCells(bx, bz, b.CX, b.CZ) < halfLen + bh + 4f) return false;
            }
            return true;
        }

        // Distância ponto–retângulo em células (muros eixo-alinhados).
        static float RectDistCells(float px, float pz, float cx, float cz, float sx, float sz)
        {
            float dx = System.Math.Max(0f, System.Math.Abs(px - cx) - sx * 0.5f) / Cell;
            float dz = System.Math.Max(0f, System.Math.Abs(pz - cz) - sz * 0.5f) / Cell;
            return (float)System.Math.Sqrt(dx * dx + dz * dz);
        }

        // Folga soldado–muro (dono): aresta do muro a ≥0,5 m do soldado (10
        // células) ALÉM do raio proibido do próprio muro — assim sempre existe
        // anel de engajamento (a onda chega a 0,5 m e mata; nem humano mataria
        // sem isso). r = mesma fórmula da validade do jogo (segmentado fino).
        // Pública p/ as provas conferirem a mesma régua da construção.
        public static float WallBanRadius(float wx, float wz)
        {
            float thin = (wx < wz ? wx : wz) / Cell;
            float len = (wx > wz ? wx : wz) / Cell;
            return (len <= 28f ? len * 0.5f + 4f : thin * 0.5f + 5f) + 10f;
        }
        public static BlockVariant VariantFor(float x, float z)
        {
            long h = (long)(System.Math.Abs(x * 12.915 + z * 78.233) * 100.0);
            return (BlockVariant)(h % 3);
        }

        // Tela de corredor (dono): 1 barra atravessada no eixo trigger→centro.
        // As corridas do veto dobram (L/Z); a tela é reta. 4 tentativas
        // variando a fração (cone e folgas rejeitam — tenta outro ponto).
        // Vale WallSegOk com cone (lançamento respira). +2 de par.
        static void TryCorridorScreen(ref ToppleRng rng, MapSpec spec, float tx, float tz, float tdeg, float cx, float cz)
        {
            float ax = cx - tx, az = cz - tz;
            float alen = (float)System.Math.Sqrt(ax * ax + az * az);
            if (alen < 1e-4f) return;
            for (int i = 0; i < 4; i++)
            {
                float frac = RngRange(ref rng, 0.40f, 0.65f);
                float jx = -az / alen, jz = ax / alen;
                float jit = RngRange(ref rng, -4f, 4f);
                // Barra perpendicular ao eixo (eixo-alinhada: maior projeção manda).
                bool alongX = System.Math.Abs(az) > System.Math.Abs(ax);
                float len = RngRange(ref rng, 24f, 40f) * Cell; // 1,2-2,0 m
                float thick = RngRange(ref rng, 6f, 8f) * Cell;
                float swx = alongX ? len : thick, swz = alongX ? thick : len;
                float bx = tx + ax * frac + jx * jit * Cell;
                float bz = tz + az * frac + jz * jit * Cell;
                float halfLen = len / (2f * Cell);
                if (!WallSegOk(spec, bx, bz, halfLen, swx, swz, tx, tz, tdeg)) continue;
                spec.Blocks.Add(new MapBlock { CX = bx, CZ = bz, SX = swx, SZ = swz, Variant = VariantFor(bx, bz), Gate = false });
                spec.ParPieces += 2;
                return;
            }
        }

        // Validade da porteira/escudo: campo, trigger longe (início respira),
        // sem cobrir soldado (anel de engajamento, como no veto), sem
        // sobrepor vão/buraco/muro.
        static bool GateSpotOk(MapSpec spec, float bx, float bz, float wx, float wz, float tx, float tz, int checkBlocks, bool strict = true)
        {
            float halfLen = (wx > wz ? wx : wz) / (2f * Cell);
            float ban = WallBanRadius(wx, wz);
            if (!(System.Math.Abs(bx / Cell) + wx / (2f * Cell) < FieldHx && System.Math.Abs(bz / Cell) + wz / (2f * Cell) < FieldHz)) return false;
            if (DistCells(bx, bz, tx, tz) < halfLen + 30f) return false; // 1,5 m+ do trigger
            foreach (var sl in spec.Soldiers)
            {
                // Estrito (corredor/porteira): anel de engajamento. Escudo usa
                // a folga legada (fica atrás do pelotão, fora do engajamento).
                if (strict)
                {
                    if (RectDistCells(sl.X, sl.Z, bx, bz, wx, wz) < ban) return false;
                    if (sl.Loop != null)
                        foreach (var w in sl.Loop)
                            if (RectDistCells(w.X, w.Z, bx, bz, wx, wz) < ban) return false;
                }
                else
                {
                    if (DistCells(bx, bz, sl.X, sl.Z) < halfLen + 6f) return false;
                    if (sl.Loop != null)
                        foreach (var w in sl.Loop)
                            if (DistCells(bx, bz, w.X, w.Z) < halfLen + 6f) return false;
                }
            }
            foreach (var gp in spec.Gaps)
                if (DistCells(bx, bz, gp.X, gp.Z) < halfLen + gp.RadiusCells + 4f) return false;
            foreach (var vd in spec.Voids)
            {
                float ox = (vd.X0 + vd.X1) * 0.5f, oz = (vd.Z0 + vd.Z1) * 0.5f;
                float oh = System.Math.Max(vd.X1 - vd.X0, vd.Z1 - vd.Z0) * 0.5f;
                if (DistCells(bx, bz, ox, oz) < halfLen + oh / Cell + 4f) return false;
            }
            for (int i = 0; i < checkBlocks && i < spec.Blocks.Count; i++)
            {
                var b = spec.Blocks[i];
                float bh = (b.SX > b.SZ ? b.SX : b.SZ) / (2f * Cell);
                if (DistCells(bx, bz, b.CX, b.CZ) < halfLen + bh + 4f) return false;
            }
            return true;
        }

        // Muro-porteira (dono, Ex.1/Ex.2 do sketch): barra fina EM CIMA da rota
        // (±0,15 m do ponto), atravessada ao corredor, forçando curva. Campo
        // aberto + barra sem encostar na borda = contorno sempre possível
        // (nunca sela o mapa). Prof 3+, +2 de par por bloco (desvio custa peças).
        static void TryGateWall(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float tx, float tz)
        {
            if (route.Count < 8) return;
            for (int i = 0; i < 10; i++)
            {
                var s = route[RngInt(ref rng, route.Count / 4, route.Count * 3 / 4)];
                float bx = s.gx * Cell + RngRange(ref rng, -3f, 3f) * Cell;
                float bz = s.gz * Cell + RngRange(ref rng, -3f, 3f) * Cell;
                // Barra atravessada: eixo perpendicular à direção da rota aqui.
                float rr = s.deg * (float)System.Math.PI / 180f;
                bool alongX = System.Math.Abs((float)System.Math.Cos(rr)) > System.Math.Abs((float)System.Math.Sin(rr));
                float len = RngRange(ref rng, 30f, 44f) * Cell; // 1,5-2,2 m
                float thick = RngRange(ref rng, 6f, 8f) * Cell; // 0,3-0,4 m
                float swx = alongX ? len : thick, swz = alongX ? thick : len;
                float halfLen = len / (2f * Cell);
                if (!GateSpotOk(spec, bx, bz, swx, swz, tx, tz, spec.Blocks.Count)) continue;
                spec.Blocks.Add(new MapBlock { CX = bx, CZ = bz, SX = swx, SZ = swz, Variant = VariantFor(bx, bz), Gate = true });
                spec.ParPieces += 2;
                // Composição em L (60%, Ex.1): 2º trecho fino da ponta, virando 90°.
                if (rng.NextFloat() < 0.6f) TryGatePartner(ref rng, spec, route, bx, bz, swx, swz, alongX, tx, tz);
                return;
            }
        }

        static void TryGatePartner(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route,
            float bx, float bz, float swx, float swz, bool alongX, float tx, float tz)
        {
            float plen = RngRange(ref rng, 16f, 24f) * Cell; // 0,8-1,2 m
            float thick = (alongX ? swz : swx); // mesma espessura da barra
            int end = rng.NextFloat() < 0.5f ? 1 : -1;
            int side = rng.NextFloat() < 0.5f ? 1 : -1;
            // Vira 90° a partir da ponta: trecho perpendicular encostando nela.
            float pwx = alongX ? thick : plen, pwz = alongX ? plen : thick;
            float px, pz;
            if (alongX) { px = bx + end * (swx * 0.5f - thick * 0.5f); pz = bz + side * (plen * 0.5f); }
            else { px = bx + side * (plen * 0.5f); pz = bz + end * (swz * 0.5f - thick * 0.5f); }
            float halfLen = plen / (2f * Cell);
            if (!GateSpotOk(spec, px, pz, pwx, pwz, tx, tz, spec.Blocks.Count - 1)) return;
            bool crosses = false;
            foreach (var rp in route)
                if (DistCells(px, pz, rp.gx * Cell, rp.gz * Cell) < halfLen + 10f) { crosses = true; break; }
            if (!crosses) return; // parceiro fora da rota não é porteira
            spec.Blocks.Add(new MapBlock { CX = px, CZ = pz, SX = pwx, SZ = pwz, Variant = VariantFor(px, pz), Gate = true });
            spec.ParPieces += 2;
        }

        // Muro-escudo (dono, detalhe Ex.2): colado ATRÁS do pelotão (lado oposto
        // à rota, 0,7–1,0 m do centro) — a onda faz a curva por fora. Fora do
        // corredor (é escudo, não porteira). +2 de par.
        static void TryShieldWall(ref ToppleRng rng, MapSpec spec, List<(int gx, int gz, float deg)> route, float tx, float tz)
        {
            var c = spec.ClusterCenters[RngInt(ref rng, 0, spec.ClusterCenters.Count)];
            float best = float.MaxValue;
            float nx = c.X, nz = c.Z;
            foreach (var rp in route)
            {
                float d = DistCells(c.X, c.Z, rp.gx * Cell, rp.gz * Cell);
                if (d < best) { best = d; nx = rp.gx * Cell; nz = rp.gz * Cell; }
            }
            float dx = c.X - nx, dz = c.Z - nz;
            float len = (float)System.Math.Sqrt(dx * dx + dz * dz);
            if (len < 1e-4f) return;
            float dist = RngRange(ref rng, 14f, 20f); // 0,7–1,0 m do centro
            float bx = c.X + dx / len * dist * Cell;
            float bz = c.Z + dz / len * dist * Cell;
            float half = RngRange(ref rng, 8f, 12f);
            float sw = half * 2f * Cell;
            if (!GateSpotOk(spec, bx, bz, sw, sw, tx, tz, spec.Blocks.Count, false)) return;
            foreach (var rp in route)
                if (DistCells(bx, bz, rp.gx * Cell, rp.gz * Cell) < half + 6f) return;
            spec.Blocks.Add(new MapBlock { CX = bx, CZ = bz, SX = sw, SZ = sw, Variant = VariantFor(bx, bz), Gate = false });
            spec.ParPieces += 2;
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
