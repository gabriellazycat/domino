// 10 fases: soluções roteirizadas (mesma matemática da trilha + mesma física)
 // provam que cada fase tem solução. pernas encadeadas (multi-trilha, como
 // humano com âncora); pesadões levam perna de pesada. Sementes do solver T5.
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
    public class PhaseSolvabilityTests
    {
        // Roteiro: pernas (fim + tipo) encadeadas do trigger, como a ferramenta.
        // Vitória = tudo derrubado (pesadão conta: precisa da perna pesada).
        static int SolvePhase(SimWorld world, TutorialSetup.PhaseDef ph, (int gx, int gz, PieceId piece)[] legs)
        {
            world.SpawnGround(new Vector2(24, 16));
            world.KeepLeanersAwake = true;
            foreach (var b in ph.Blocks)
                world.SpawnStaticBox(b.Center, b.Size);
            var data = new PlanningData();
            // Mãos folgadas de prova-de-existência (economia do deck é T5; aqui
            // importa provar que cada fase TEM solução física).
            data.SetHand(PieceId.Common, 128);
            data.SetHand(PieceId.Heavy, 8);
            data.SetHand(PieceId.Blast, 24);
            int sx = ph.TriggerGx, sz = ph.TriggerGz;
            float sdeg = ph.TriggerDeg;
            int parent = 0;
            var cells = "";
            foreach (var leg in legs)
            {
                var pts = PlanningData.ArcPath(sx, sz, sdeg, leg.gx, leg.gz,
                    PlanningController.PathSpacing, true); // igual à ferramenta
                var ok = new List<(int gx, int gz, float deg)>();
                foreach (var q in pts)
                {
                    if (data.HandCount(leg.piece) - ok.Count <= 0) break;
                    if (data.FindAt(q.gx, q.gz) >= 0) continue;
                    float wx = PlanningData.ToWorld(q.gx), wz = PlanningData.ToWorld(q.gz);
                    // Validade de sobreposição usa o spot (raio por tipo).
                    bool bad = false;
                    foreach (var s in ph.Soldiers)
                        if (PlanningController.OverlapsSoldier(wx, wz, leg.piece, q.deg, s)) { bad = true; break; }
                    if (!bad) ok.Add(q);
                }
                PlanningData.DropCrowded(ok, leg.piece);
                foreach (var q in ok) cells += $"({q.gx},{q.gz},r{q.deg:F0})";
                int before = data.Count;
                data.TryPlacePath(leg.piece, ok, parent);
                if (data.Count > before)
                {
                    parent = data.Items[data.Count - 1].InstanceId;
                    var last = ok[ok.Count - 1];
                    sx = last.gx; sz = last.gz; sdeg = last.deg;
                }
            }
            Debug.Log($"[TOPPLE][PHASE] '{ph.Name}' path={cells}");
            SimPiece first = null;
            int lowest = int.MaxValue;
            var pieces = new System.Collections.Generic.List<SimPiece>();
            foreach (var p in data.Items)
            {
                var sp = world.SpawnPiece(p.Piece,
                    new Vector3(PlanningData.ToWorld(p.Gx), 0, PlanningData.ToWorld(p.Gz)),
                    p.Deg);
                pieces.Add(sp);
                if (p.InstanceId < lowest) { lowest = p.InstanceId; first = sp; }
            }
            var facing = first.transform.rotation * Vector3.forward;
            facing.y = 0; facing.Normalize();
            var soldiers = new SimEnemy[ph.Soldiers.Count];
            for (int i = 0; i < soldiers.Length; i++)
                soldiers[i] = world.SpawnEnemy(ph.Soldiers[i]);
            world.Depenetrate(); // zera micro-penetrações do jitter (pop fantasma)
            first.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
            var rec = world.Finish();
            // Onda: passo em que cada peça passou de 20° (diagnóstico de propagação;
            // imprime TODAS: o ponto exato da morte da onda é o 1º @-1 após caídos).
            var wave = "";
            for (int i = 0; i < pieces.Count; i++)
            {
                int at = -1;
                foreach (var f in rec.Frames)
                {
                    foreach (var s in f.Samples)
                    {
                        if (s.Id != pieces[i].Id) continue;
                        if (Vector3.Angle(s.Rot * Vector3.up, Vector3.up) > 20f) { at = f.Step; break; }
                    }
                    if (at >= 0) break;
                }
                wave += $"[{i}@{at}]";
            }
            int knocked = 0;
            var tilts = "";
            foreach (var s in soldiers)
            {
                if (s.Knocked) knocked++;
                tilts += $"{Vector3.Angle(s.transform.up, Vector3.up):F1}°@{s.transform.position.x:F2},{s.transform.position.z:F2} ";
            }
            Debug.Log($"[TOPPLE][PHASE] '{ph.Name}' peças={data.Count} knocked={knocked}/{soldiers.Length} soldiers=[{tilts}] wave={wave}");
            return knocked == soldiers.Length ? data.Count : -1000 - knocked;
        }

        static IEnumerator RunPhase(int index, (int gx, int gz, PieceId piece)[] legs, uint seed)
        {
            var ph = TutorialSetup.Phases[index];
            var world = SimWorld.Create(seed);
            try
            {
                int placed = SolvePhase(world, ph, legs);
                Assert.Greater(placed, 0, $"fase {index + 1} sem solução com o roteiro");
            }
            finally { world.Unload(); }
            yield return null;
        }

        [UnityTest] public IEnumerator Phase2_CurvaDoMuro_Solvable()
            => RunPhase(1, new[] { (74, -14, PieceId.Common) }, 20001);

        [UnityTest] public IEnumerator Phase3_PesoPesado_Solvable()
            => RunPhase(2, new[] { (100, 18, PieceId.Common) }, 30001);

        [UnityTest] public IEnumerator Phase4_MuralhaViva_Solvable()
            // Perna única até o sul-leste (mata o pelotão sul de passagem, sem
            // junta perto de soldado — junta filtra e abre vão), volta pelo
            // leste por fora, pesada a leste do pesadão (cai p/ oeste).
            => RunPhase(3, new[] { (64, -14, PieceId.Common), (66, -22, PieceId.Common), (80, -34, PieceId.Common), (110, -38, PieceId.Common), (120, -20, PieceId.Common), (120, 20, PieceId.Common), (108, 40, PieceId.Common), (108, 16, PieceId.Heavy) }, 40001);

        [UnityTest] public IEnumerator Phase5_Ronda_Solvable()
            // Coluna esquerda por dentro (cai p/ leste, splash encadeia), leste
            // em box (joints ≤90°, sem reversão), desce a leste, stub oeste.
            => RunPhase(4, new[] { (66, -14, PieceId.Common), (110, -8, PieceId.Common), (150, -8, PieceId.Common), (150, 40, PieceId.Common), (150, -24, PieceId.Common), (144, -24, PieceId.Common), (108, -30, PieceId.Blast) }, 50001);

        [UnityTest] public IEnumerator Phase6_Garfo_Solvable()
            // Sul pela curta DESVIANDO do bloco (a reta (0,0)→(64,-14) raspava a
            // quina do bloco e empilhava: onda nascia morta), leste por fora,
            // gancho norte p/ dentro (cai no pelotão sul, splash encadeia),
            // leste e norte por fora em box. Joints ≤90°.
            => RunPhase(5, new[] { (36, -30, PieceId.Common), (64, -30, PieceId.Common), (64, -50, PieceId.Common), (88, -50, PieceId.Common), (88, -46, PieceId.Common), (120, -46, PieceId.Common), (120, 40, PieceId.Common), (108, 28, PieceId.Common) }, 60002);

        [UnityTest] public IEnumerator Phase7_Avenida_Solvable()
            => RunPhase(6, new[] { (140, 0, PieceId.Common), (154, 17, PieceId.Common) }, 70001);

        [UnityTest] public IEnumerator Phase8_Cerco_Solvable()
            // Sul por fora (standoff), gancho oeste na explosiva-1 (cai p/ leste
            // no pesadão-1, cadáver-ponte leva a onda adiante), volta pelo leste,
            // explosiva-2 vinda do leste (cai p/ oeste no pesadão-2).
            => RunPhase(7, new[] { (60, -50, PieceId.Common), (84, -50, PieceId.Common), (84, -24, PieceId.Common), (98, -24, PieceId.Blast), (120, -24, PieceId.Common), (140, -20, PieceId.Common), (140, 20, PieceId.Common), (140, 50, PieceId.Common), (120, 50, PieceId.Common), (120, 24, PieceId.Common), (100, 24, PieceId.Blast) }, 80001);

        [UnityTest] public IEnumerator Phase9_Tempestade_Solvable()
            => RunPhase(8, new[] { (76, 0, PieceId.Common), (142, 0, PieceId.Common), (142, 22, PieceId.Common) }, 90001);

        [UnityTest] public IEnumerator Phase10_Chefao_Solvable()
            // Serpentina de bissetores (sempre ENTRE soldados, nunca através):
            // arco interno S→N, ponte leste, arco médio N→S, ponte sul, arco
            // externo S→N, pesadas a leste dos pesadões (standoff 0,5-0,7,
            // toque de pesada mata). Pernas curtas, juntas suaves.
            // Baseline 28/30; norte em box (joints ≤90°): leste, sul, oeste com
            // perna de blast no triângulo (detona e splash encadeia), desce a
            // leste, pesada vinda do leste no pesadão-N.
            => RunPhase(9, new[] {
                (78, -45, PieceId.Common),
                (82, -38, PieceId.Common), (87, -19, PieceId.Common),
                (90, -4, PieceId.Common), (90, 4, PieceId.Common),
                (87, 19, PieceId.Common), (82, 38, PieceId.Common),
                (74, 52, PieceId.Common),
                (90, 63, PieceId.Common),
                (100, 46, PieceId.Common), (106, 28, PieceId.Common),
                (110, 10, PieceId.Common), (110, -10, PieceId.Common),
                (106, -28, PieceId.Common), (100, -46, PieceId.Common),
                (90, -63, PieceId.Common),
                (92, -92, PieceId.Common),
                (107, -75, PieceId.Common), (118, -55, PieceId.Common),
                (126, -34, PieceId.Common), (140, -24, PieceId.Common),
                (140, 24, PieceId.Common), (140, 40, PieceId.Common),
                (126, 40, PieceId.Common), (126, 34, PieceId.Common),
                (118, 55, PieceId.Common), (107, 75, PieceId.Common),
                (92, 92, PieceId.Common),
                (86, 96, PieceId.Common), (86, 102, PieceId.Common),
                (92, 102, PieceId.Common), (102, 102, PieceId.Common),
                (112, 102, PieceId.Common), (122, 102, PieceId.Common),
                (132, 102, PieceId.Common), (142, 102, PieceId.Common),
                (150, 98, PieceId.Common), (150, 60, PieceId.Common),
                (118, 60, PieceId.Blast), (118, 40, PieceId.Common),
                (150, 40, PieceId.Common), (150, 30, PieceId.Common),
                (146, 30, PieceId.Heavy),
                (150, -30, PieceId.Common), (146, -30, PieceId.Heavy),
            }, 100001);
    }
}
