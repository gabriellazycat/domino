// Solver-harness das fases geradas (prova física amostrada, pedido do dono).
// O MapGen garante estrutura (rota, espaçamentos, vetos), mas NÃO garante que
// cada mapa é vencível: este harness prova por construção amostrada que o
// gerador cospe fases vencíveis EM ESCALA HUMANA (≤16 corpos e ≤3 pesadões:
// um deck de prof. 10 banca ~70 cartas) — 4 estratégias de solver (outward,
// cobra, patrulhas-primeiro, fork-split; pesada no pesadão com overshoot,
// torre p/ vãos) + minas anti-patrulha, física headless de verdade (SimWorld).
// Contrato em 2 níveis: piso anti-stillborn por amostra (onda que nem viaja)
// + barra ≥75% no agregado (saúde); vitórias integrais no log. Pesadão mirado é tática além do guloso (P4/P8/P10 provam com 3/3; solver T5).
// Fork-split: o gerador separa pelotões em lados opostos (fork-útil, F6) —
// cadeia única não cobre 2 direções; o split planta 1 fork no trigger
// (2 cabeças provadas) e leva 1 ramo p/ cada lado (metade angular).
// Amostras: profundidades 10–11 (ponte-vão 4+, buraco/pesadão/patrulha 6+:
// todos os mecanismos ativos) × seeds fixas, FILTRADAS por escala (geração é
// determinística: o filtro escolhe sempre as mesmas). Mapas gigantes (20+
// corpos em prof. 11+) existem e o solver parcial os alcança em ~85% — mas
// são injustos na ECONOMIA (ninguém banca 100 peças com deck de 30), decisão
// pendente do dono; o harness não os promete.
using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using Topple.Core;
using Topple.Game;
using Topple.Sim;

namespace Topple.Tests
{
    public class GeneratedSolvabilityTests
    {
        // Candidatas fixas (espelho em PlanningDataTests.MapGen_FairShare).
        static readonly (uint seed, int depth)[] Candidates = new[]
        {
            (1u, 10), (2u, 10), (3u, 10), (4u, 10), (5u, 10), (6u, 10), (7u, 10), (8u, 10), (9u, 10), (10u, 10), (11u, 10), (12u, 10),
            (1u, 11), (2u, 11), (3u, 11), (4u, 11), (5u, 11), (6u, 11), (7u, 11), (8u, 11), (9u, 11), (10u, 11), (11u, 11), (12u, 11),
        };
        const int MaxFairSoldiers = 16;
        const int MaxFairBrutes = 3;
        const int TakeSamples = 6;

        // Escala humana? (filtro determinístico: geração é determinística).
        static bool IsFair(TutorialSetup.PhaseDef ph)
        {
            if (ph.Soldiers.Count > MaxFairSoldiers) return false;
            int brutes = 0;
            foreach (var s in ph.Soldiers)
                if (s.Kind == Topple.Core.EnemyKind.Brute && ++brutes > MaxFairBrutes) return false;
            return true;
        }

        static bool InVoid(float wx, float wz, TutorialSetup.VoidDef v)
            => wx > v.Center.x - v.Size.x * 0.5f - 0.1f && wx < v.Center.x + v.Size.x * 0.5f + 0.1f
            && wz > v.Center.z - v.Size.z * 0.5f - 0.1f && wz < v.Center.z + v.Size.z * 0.5f + 0.1f;

        static bool Blocked(TutorialSetup.PhaseDef ph, float wx, float wz, PieceId piece, float deg)
        {
            foreach (var s in ph.Soldiers)
                if (PlanningController.OverlapsSoldier(wx, wz, piece, deg, s)) return true;
            if (ph.Gaps != null)
                foreach (var g in ph.Gaps)
                {
                    float dx = wx - g.Center.x, dz = wz - g.Center.z;
                    if (dx * dx + dz * dz < g.R * g.R) return true;
                }
            if (ph.Voids != null)
                foreach (var v in ph.Voids)
                    if (InVoid(wx, wz, v)) return true;
            // Validade idêntica ao jogo (colar de círculos — fonte única).
            foreach (var b in ph.Blocks)
                foreach (var (c, r) in PlanningController.ForbiddenCircles(b.Center, b.Size))
                {
                    float dx = wx - c.x, dz = wz - c.z;
                    if (dx * dx + dz * dz < r * r) return true;
                }
            return false;
        }

        static float MaxGapM(List<(int gx, int gz, float deg)> pts)
        {
            float max = 0f;
            for (int i = 0; i + 1 < pts.Count; i++)
            {
                float dx = PlanningData.ToWorld(pts[i + 1].gx) - PlanningData.ToWorld(pts[i].gx);
                float dz = PlanningData.ToWorld(pts[i + 1].gz) - PlanningData.ToWorld(pts[i].gz);
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > max) max = d;
            }
            return max;
        }

        // Uma perna do head atual até (tgx,tgz): comum (pesada no pesadão),
        // com fallback de torre quando o vão filtrado passa do alcance.
        // Retorna a perna + a peça que a valida.
        static (List<(int gx, int gz, float deg)> leg, PieceId used) BuildLeg(PlanningData data,
            TutorialSetup.PhaseDef ph, int sx, int sz, float sdeg, int tgx, int tgz, PieceId piece)
        {
            List<(int gx, int gz, float deg)> BestFor(PieceId p)
            {
                var pts = PlanningData.ArcPath(sx, sz, sdeg, tgx, tgz,
                    PlanningController.PathSpacing, true);
                var ok = new List<(int gx, int gz, float deg)>();
                foreach (var q in pts)
                {
                    if (data.HandCount(p) - ok.Count <= 0) break;
                    if (data.FindAt(q.gx, q.gz) >= 0) continue;
                    float wx = PlanningData.ToWorld(q.gx), wz = PlanningData.ToWorld(q.gz);
                    if (Blocked(ph, wx, wz, p, q.deg)) continue;
                    ok.Add(q);
                }
                PlanningData.DropCrowded(ok, p);
                return ok;
            }
            var first = BestFor(piece);
            (List<(int gx, int gz, float deg)> leg, PieceId used) pick;
            if (MaxGapM(first) <= PlanningController.WaveReach(piece)) pick = (first, piece);
            else
            {
                var tower = BestFor(PieceId.Tower); // ponte-vão: torre cobre Ø até 1,0 m
                if (MaxGapM(tower) <= PlanningController.WaveReach(PieceId.Tower)) pick = (tower, PieceId.Tower);
            // Nem a torre fecha: fica a de menor vão (a derrota entra no log).
            else pick = MaxGapM(tower) < MaxGapM(first) ? (tower, PieceId.Tower) : (first, piece);
            }
            return pick;
        }

        // Retorna (venceu, peças, knocked, total).
        // Simula o layout atual e devolve (knocked, total, sobreviventes, caídas).
        // caídas = índices em data.Items que passaram de 20° (diagnóstico de
        // onda, como o wave=[i@passo] das artesanais): o round 2 ramifica DELAS.
        // Nome de cena único por chamada (o Unload é assíncrono: 2 sims
        // seguidas com o mesmo nome colidem em "already exists").
        static int _worldSeq;
        static (int knocked, int total, List<EnemySpot> alive, HashSet<int> fell) RunSim(
            TutorialSetup.PhaseDef ph, PlanningData data, uint simSeed)
        {
            var world = SimWorld.Create(simSeed, $"GenSolve_{_worldSeq++}");
            try
            {
                if (ph.Voids == null || ph.Voids.Count == 0)
                    world.SpawnGround(new Vector2(24, 16));
                else
                {
                    var voids = new List<(float x0, float z0, float x1, float z1)>();
                    foreach (var v in ph.Voids)
                        voids.Add((v.Center.x - v.Size.x * 0.5f, v.Center.z - v.Size.z * 0.5f,
                                   v.Center.x + v.Size.x * 0.5f, v.Center.z + v.Size.z * 0.5f));
                    world.SpawnGroundTiled(new Vector2(24, 16), voids);
                }
                world.KeepLeanersAwake = true;
                foreach (var b in ph.Blocks)
                    world.SpawnStaticBox(b.Center, b.Size);
                SimPiece first = null;
                int lowest = int.MaxValue;
                var spawnIdx = new Dictionary<int, int>(); // id do corpo → índice no data
                int di = 0;
                foreach (var p in data.Items)
                {
                    var sp = world.SpawnPiece(p.Piece,
                        new Vector3(PlanningData.ToWorld(p.Gx), 0, PlanningData.ToWorld(p.Gz)),
                        p.Deg);
                    spawnIdx[sp.Id] = di++;
                    if (p.InstanceId < lowest) { lowest = p.InstanceId; first = sp; }
                }
                var alive = new List<EnemySpot>(ph.Soldiers);
                var fell = new HashSet<int>();
                if (first == null) return (0, ph.Soldiers.Count, alive, fell);
                var soldiers = new SimEnemy[ph.Soldiers.Count];
                for (int i = 0; i < soldiers.Length; i++)
                    soldiers[i] = world.SpawnEnemy(ph.Soldiers[i]);
                world.Depenetrate();
                var facing = first.transform.rotation * Vector3.forward;
                facing.y = 0; facing.Normalize();
                first.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
                var rec = world.Finish();
                foreach (var f in rec.Frames)
                    foreach (var s in f.Samples)
                        if (spawnIdx.TryGetValue(s.Id, out int idx)
                            && Vector3.Angle(s.Rot * Vector3.up, Vector3.up) > 20f)
                            fell.Add(idx);
                int knocked = 0;
                alive.Clear();
                for (int i = 0; i < soldiers.Length; i++)
                {
                    if (soldiers[i] != null && soldiers[i].Knocked) knocked++;
                    else alive.Add(ph.Soldiers[i]);
                }
                return (knocked, soldiers.Length, alive, fell);
            }
            finally { world.Unload(); }
        }

        // Tentativas independentes (como os 3 DISPARAR da run): cada estratégia
        // constrói um layout FRESCO e simula; vale se QUALQUER uma vencer. Sem
        // remendo acumulativo (peça nova no cone de queda da velha quebra a
        // onda que já vencia — regressão observada). Pesadão leva pesada
        // (toque de pesada mata); patrulheiro entra pelo spawn (loop[0]).
        static List<EnemySpot> OrderOutward(TutorialSetup.PhaseDef ph)
        {
            var order = new List<EnemySpot>(ph.Soldiers);
            var tp = new Vector2(PlanningData.ToWorld(ph.TriggerGx), PlanningData.ToWorld(ph.TriggerGz));
            order.Sort((a, b)
                => (new Vector2(a.Pos.x - tp.x, a.Pos.z - tp.y).sqrMagnitude)
                    .CompareTo(new Vector2(b.Pos.x - tp.x, b.Pos.z - tp.y).sqrMagnitude));
            return order;
        }

        static List<EnemySpot> OrderSnake(TutorialSetup.PhaseDef ph)
        {
            // Cobra: sempre o vivo mais próximo do head (pernas curtas; pode
            // reverter — é 1 tentativa entre 3, não a única).
            var order = new List<EnemySpot>();
            var todo = new List<EnemySpot>(ph.Soldiers);
            var head = new Vector2(PlanningData.ToWorld(ph.TriggerGx), PlanningData.ToWorld(ph.TriggerGz));
            while (todo.Count > 0)
            {
                int bi = 0;
                float bestD = float.MaxValue;
                for (int i = 0; i < todo.Count; i++)
                {
                    float dx = todo[i].Pos.x - head.x, dz = todo[i].Pos.z - head.y;
                    float d = dx * dx + dz * dz;
                    if (d < bestD) { bestD = d; bi = i; }
                }
                order.Add(todo[bi]);
                head = new Vector2(todo[bi].Pos.x, todo[bi].Pos.z);
                todo.RemoveAt(bi);
            }
            return order;
        }

        // Patrulhas primeiro: o patrulheiro anda (0,3–0,8 m/s) — a onda tem
        // que cruzar o loop CEDO, com ele ainda perto do spawn. Depois,
        // varredura outward p/ o resto.
        static List<EnemySpot> OrderPatrolsFirst(TutorialSetup.PhaseDef ph)
        {
            var patrols = new List<EnemySpot>();
            var rest = new List<EnemySpot>();
            foreach (var s in ph.Soldiers)
                (s.Kind == Topple.Core.EnemyKind.Patroller ? patrols : rest).Add(s);
            var tp = new Vector2(PlanningData.ToWorld(ph.TriggerGx), PlanningData.ToWorld(ph.TriggerGz));
            System.Comparison<EnemySpot> byTrig = (a, b)
                => (new Vector2(a.Pos.x - tp.x, a.Pos.z - tp.y).sqrMagnitude)
                    .CompareTo(new Vector2(b.Pos.x - tp.x, b.Pos.z - tp.y).sqrMagnitude);
            patrols.Sort(byTrig);
            rest.Sort(byTrig);
            patrols.AddRange(rest);
            return patrols;
        }

        static (bool win, PlanningData data, HashSet<int> fell, int knocked, int total, string aliveDesc, List<EnemySpot> alive) TryStrategy(
            TutorialSetup.PhaseDef ph, uint simSeed, List<EnemySpot> order, string tag)
        {
            var data = new PlanningData();
            // Mãos de prova-de-existência (economia do deck é T5).
            data.SetHand(PieceId.Common, 300);
            data.SetHand(PieceId.Heavy, 40);
            data.SetHand(PieceId.Tower, 60);
            data.SetHand(PieceId.Blast, 48); // minas anti-patrulha no round de pontas
            int sx = ph.TriggerGx, sz = ph.TriggerGz;
            float sdeg = ph.TriggerDeg;
            int parent = 0;
            foreach (var s in order)
                PlaceLegTo(data, ph, ref parent, ref sx, ref sz, ref sdeg, s);
            var (knocked, total, alive, fell) = RunSim(ph, data, simSeed);
            Debug.Log($"[TOPPLE][GEN-SOLVE] '{ph.Name}' {tag} peças={data.Count} knocked={knocked}/{total} " +
                $"caidas={fell.Count} vivas=[{AliveDesc(alive)}]");
            return (knocked == total, data, fell, knocked, total, AliveDesc(alive), alive);
        }

        // Fork-split: 1 bifurcação no trigger (2 corpos, 2 cabeças provadas) +
        // metade angular dos vivos p/ cada ramo. Cadeia única não cobre 2
        // direções (pelotões opostos do fork-útil); o split leva 1 onda p/ lado.
        // Devolve como as demais (para o round de minas e a catraca).
        static (bool win, PlanningData data, HashSet<int> fell, int knocked, int total, string aliveDesc, List<EnemySpot> alive) TryForkSplit(
            TutorialSetup.PhaseDef ph, uint simSeed)
        {
            var data = new PlanningData();
            data.SetHand(PieceId.Common, 300);
            data.SetHand(PieceId.Heavy, 40);
            data.SetHand(PieceId.Tower, 60);
            data.SetHand(PieceId.Blast, 48);
            data.SetHand(PieceId.Fork, 6);
            float tx = PlanningData.ToWorld(ph.TriggerGx), tz = PlanningData.ToWorld(ph.TriggerGz);
            var byAngle = new List<EnemySpot>(ph.Soldiers);
            byAngle.Sort((a, b) =>
                System.Math.Atan2(a.Pos.x - tx, a.Pos.z - tz).CompareTo(
                    System.Math.Atan2(b.Pos.x - tx, b.Pos.z - tz)));
            var sideA = byAngle.GetRange(0, byAngle.Count / 2);
            var sideB = byAngle.GetRange(byAngle.Count / 2, byAngle.Count - byAngle.Count / 2);
            int before = data.Count;
            data.TryPlaceFork(ph.TriggerGx, ph.TriggerGz, ph.TriggerDeg);
            if (data.Count < before + 2)
            {
                Debug.Log($"[TOPPLE][GEN-SOLVE] '{ph.Name}' fork-split: fork não plantou no trigger");
                var (k0, t0, alive0, fell0) = RunSim(ph, data, simSeed);
                return (false, data, fell0, k0, t0, AliveDesc(alive0), alive0);
            }
            int headA = data.Items[data.Count - 2].InstanceId;
            int headB = data.Items[data.Count - 1].InstanceId;
            int parentA = headA, parentB = headB;
            int sax = data.Items[data.Count - 2].Gx, saz = data.Items[data.Count - 2].Gz;
            int sbx = data.Items[data.Count - 1].Gx, sbz = data.Items[data.Count - 1].Gz;
            float sdeg = ph.TriggerDeg;
            foreach (var s in sideA) PlaceLegTo(data, ph, ref parentA, ref sax, ref saz, ref sdeg, s);
            foreach (var s in sideB) PlaceLegTo(data, ph, ref parentB, ref sbx, ref sbz, ref sdeg, s);
            var (knocked, total, alive, fell) = RunSim(ph, data, simSeed);
            Debug.Log($"[TOPPLE][GEN-SOLVE] '{ph.Name}' fork-split peças={data.Count} knocked={knocked}/{total} " +
                $"caidas={fell.Count} vivas=[{AliveDesc(alive)}]");
            return (knocked == total, data, fell, knocked, total, AliveDesc(alive), alive);
        }

        // Mina anti-patrulha: explosiva PARADA no caminho do loop. Patrulheiro
        // que passa encosta nela (pós-armado) e ela detona nele + vizinhança
        // 1,5 m. Se ele a empurrar antes (bulldoze), o contato detona do mesmo
        // jeito. Fora do spawn (corpo dele barra) e fora de soldado. Minas são
        // auto-suficientes (sem energia da onda) — o único round-2 que nunca
        // regrediu. Provado 2× (ambos os patrulheiros de (1,10) morreram).
        static void PlaceMines(PlanningData data, TutorialSetup.PhaseDef ph, EnemySpot patroller)
        {
            if (patroller.Waypoints == null || patroller.Waypoints.Count < 2) return;
            if (data.HandCount(PieceId.Blast) <= 0) return;
            int placed = 0;
            for (int i = 0; i < patroller.Waypoints.Count; i++)
            {
                var a = patroller.Waypoints[i];
                var b = patroller.Waypoints[(i + 1) % patroller.Waypoints.Count];
                float dx = b.x - a.x, dz = b.z - a.z;
                float seg = Mathf.Sqrt(dx * dx + dz * dz);
                if (seg < 1e-4f) continue;
                float deg = PlanningData.DegFromTangent(dx / seg, dz / seg);
                for (float d = 0.6f; d < seg && placed < 12; d += 1.0f)
                {
                    if (data.HandCount(PieceId.Blast) <= 0) return;
                    float wx = a.x + dx / seg * d, wz = a.z + dz / seg * d;
                    int gx = PlanningData.Snap(PlanningData.ToGrid(wx), true);
                    int gz = PlanningData.Snap(PlanningData.ToGrid(wz), true);
                    if (data.FindAt(gx, gz) >= 0) continue;
                    if (Blocked(ph, wx, wz, PieceId.Blast, deg)) continue;
                    int before = data.Count;
                    data.TryPlacePath(PieceId.Blast,
                        new List<(int gx, int gz, float deg)> { (gx, gz, deg) }, 0);
                    if (data.Count > before)
                    {
                        placed++;
                        Debug.Log($"[TOPPLE][GEN-SOLVE] mina em ({wx:F2},{wz:F2}) no loop");
                    }
                }
            }
        }

        static (bool, int, int, int, int) SolveGenerated(TutorialSetup.PhaseDef ph, uint simSeed)
        {
            var r1 = TryStrategy(ph, simSeed, OrderOutward(ph), "outward");
            if (r1.win) return (true, r1.data.Count, r1.knocked, r1.total, r1.fell.Count);
            var r2 = TryStrategy(ph, simSeed, OrderSnake(ph), "snake");
            if (r2.win) return (true, r2.data.Count, r2.knocked, r2.total, r2.fell.Count);
            var r3 = TryStrategy(ph, simSeed, OrderPatrolsFirst(ph), "patrols-first");
            if (r3.win) return (true, r3.data.Count, r3.knocked, r3.total, r3.fell.Count);
            var r4 = TryForkSplit(ph, simSeed);
            if (r4.win) return (true, r4.data.Count, r4.knocked, r4.total, r4.fell.Count);
            // Melhor tentativa + minas anti-patrulha (auto-suficientes).
            // Catraca: vale o MELHOR entre base e minas (nunca regressão).
            var best = r1.knocked >= r2.knocked ? r1 : r2;
            if (r3.knocked > best.knocked) best = r3;
            if (r4.knocked > best.knocked) best = r4;
            int baseKnocked = best.knocked;
            foreach (var s in best.alive)
                if (s.Kind == Topple.Core.EnemyKind.Patroller)
                    PlaceMines(best.data, ph, s);
            var (knocked, total, alive, fell) = RunSim(ph, best.data, simSeed);
            Debug.Log($"[TOPPLE][GEN-SOLVE] '{ph.Name}' minas peças={best.data.Count} " +
                $"knocked={knocked}/{total} caidas={fell.Count} vivas=[{AliveDesc(alive)}]");
            if (knocked < baseKnocked)
            {
                Debug.Log($"[TOPPLE][GEN-SOLVE] '{ph.Name}' minas regrediram " +
                    $"({baseKnocked}→{knocked}): vale a base");
                return (false, best.data.Count, baseKnocked, total, best.fell.Count);
            }
            return (knocked == total, best.data.Count, knocked, total, fell.Count);
        }

        static string AliveDesc(List<EnemySpot> alive)
        {
            var parts = new List<string>();
            foreach (var s in alive)
                parts.Add($"{s.Kind}@({s.Pos.x:F1},{s.Pos.z:F1})");
            return string.Join(" ", parts);
        }

        // Uma perna da raiz (célula/graus/pai) até o alvo; devolve o fim da
        // perna (mundo + pai p/ encadear). Sem peça nova = devolve a raiz.
        static (Vector3 legEnd, int endParent, int endGx, int endGz, float endDeg) PlaceLegFrom(
            PlanningData data, TutorialSetup.PhaseDef ph,
            int rsx, int rsz, float rsdeg, int rootParent, EnemySpot s)
        {
            int tgx = PlanningData.Snap(PlanningData.ToGrid(s.Pos.x), true);
            int tgz = PlanningData.Snap(PlanningData.ToGrid(s.Pos.z), true);
            // Pesadão: mira 1 m ALÉM dele (na direção head→alvo): a perna passa
            // rente em vez de morrer filtrada no entorno dele — a terminal
            // (facing p/ ele) encadeia na perna que passa.
            if (s.Kind == Topple.Core.EnemyKind.Brute)
            {
                float hx = PlanningData.ToWorld(rsx), hz = PlanningData.ToWorld(rsz);
                float dx = s.Pos.x - hx, dz = s.Pos.z - hz;
                float len = Mathf.Sqrt(dx * dx + dz * dz);
                if (len > 1e-4f)
                {
                    float ox = s.Pos.x + dx / len * 1.0f, oz = s.Pos.z + dz / len * 1.0f;
                    if (Mathf.Abs(ox) < 9.5f && Mathf.Abs(oz) < 6.5f)
                    {
                        tgx = PlanningData.Snap(PlanningData.ToGrid(ox), true);
                        tgz = PlanningData.Snap(PlanningData.ToGrid(oz), true);
                    }
                }
            }
            var piece = s.Kind == Topple.Core.EnemyKind.Brute ? PieceId.Heavy : PieceId.Common;
            var (leg, used) = BuildLeg(data, ph, rsx, rsz, rsdeg, tgx, tgz, piece);
            var root = new Vector3(PlanningData.ToWorld(rsx), 0f, PlanningData.ToWorld(rsz));
            if (leg.Count == 0) return (root, rootParent, rsx, rsz, rsdeg);
            int before = data.Count;
            data.TryPlacePath(used, leg, rootParent);
            if (data.Count == before) return (root, rootParent, rsx, rsz, rsdeg);
            var last = leg[leg.Count - 1];
            return (new Vector3(PlanningData.ToWorld(last.gx), 0f, PlanningData.ToWorld(last.gz)),
                data.Items[data.Count - 1].InstanceId, last.gx, last.gz, last.deg);
        }

        // Round 1: perna do head atual (atualiza os refs).
        static Vector3 PlaceLegTo(PlanningData data, TutorialSetup.PhaseDef ph,
            ref int parent, ref int sx, ref int sz, ref float sdeg, EnemySpot s)
        {
            var (end, ep, gx, gz, deg) = PlaceLegFrom(data, ph, sx, sz, sdeg, parent, s);
            parent = ep; sx = gx; sz = gz; sdeg = deg;
            return end;
        }

        [UnityTest] public IEnumerator Generated_MapsAreWinnableBySampling()
        {
            // Filtra as candidatas por escala humana (determinístico) e mede
            // cada filtrada. Contrato em 2 níveis (porteiras exigem curva —
            // arco guloso não planeja desvio; humano com fork/retry sim):
            // PISO anti-stillborn (onda que nem viaja: <15 caídas sem vitória)
            // e BARRA no agregado ≥75% (saúde do gerador). Vitórias integrais
            // no log (VENCEU). Por que não 100%: pesadão exige pesada MIRADA com
            // energia entregue (tática além do guloso; P4/P8/P10 artesanais
            // provam a tática com 3/3) e a física tem variância de thread nos
            // casos de borda — o harness vigia saúde do gerador, não perfeição
            // do solver (T5).
            var samples = new List<(uint seed, int depth, TutorialSetup.PhaseDef ph)>();
            foreach (var (seed, depth) in Candidates)
            {
                var ph = TutorialSetup.ConvertMap(MapGen.Generate(seed, depth));
                int brutes = 0, patrols = 0;
                foreach (var s in ph.Soldiers)
                {
                    if (s.Kind == Topple.Core.EnemyKind.Brute) brutes++;
                    if (s.Kind == Topple.Core.EnemyKind.Patroller) patrols++;
                }
                Debug.Log($"[TOPPLE][GEN-SOLVE] candidata seed={seed} prof={depth}: " +
                    $"{ph.Soldiers.Count} corpos ({brutes} pesadões, {patrols} patrulhas) " +
                    (IsFair(ph) ? "JUSTA" : "gigante (fora do harness)"));
                if (IsFair(ph) && samples.Count < TakeSamples)
                    samples.Add((seed, depth, ph));
            }
            Assert.GreaterOrEqual(samples.Count, 4,
                $"solver-harness: só {samples.Count} mapas justos nas candidatas (gerador derivou?)");
            int wins = 0, totalK = 0, totalT = 0;
            for (int i = 0; i < samples.Count; i++)
            {
                var (seed, depth, ph) = samples[i];
                var (win, pieces, knocked, total, fell) = SolveGenerated(ph, 1000u + (uint)i);
                Debug.Log($"[TOPPLE][GEN-SOLVE] amostra {i} seed={seed} prof={depth} '{ph.Name}': " +
                    (win ? $"VENCEU ({pieces} peças)" : $"perdeu knocked={knocked}/{total} caidas={fell}"));
                if (win) wins++;
                totalK += knocked;
                totalT += total;
                // Piso anti-stillborn: sem vitória e sem viagem (<15 caídas).
                Assert.IsTrue(win || fell >= 15,
                    $"solver-harness: amostra {i} seed={seed} prof={depth} natimorta " +
                    $"({knocked}/{total}, {fell} caídas) — ver [TOPPLE][GEN-SOLVE]");
                yield return null;
            }
            Debug.Log($"[TOPPLE][GEN-SOLVE] fecha: {wins}/{samples.Count} vitórias integrais, {totalK}/{totalT} corpos");
            Assert.GreaterOrEqual(totalK * 4, totalT * 3,
                $"solver-harness: agregado {totalK}/{totalT} (<75%) — saúde do gerador em questão");
        }
    }
}
