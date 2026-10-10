// Fases 2-3: soluções roteirizadas (mesma matemática da trilha + mesma física)
// provam que cada fase tem solução. Sementes do solver da T5.
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
        // Roteiro: arco do trigger até perto do 1º soldado, como a ferramenta faz.
        static int SolvePhase(SimWorld world, TutorialSetup.PhaseDef ph, int endGx, int endGz)
        {
            world.SpawnGround(new Vector2(24, 16));
            world.KeepLeanersAwake = true;
            foreach (var b in ph.Blocks)
                world.SpawnStaticBox(b.Center, b.Size);
            var data = new PlanningData();
            data.SetHand(PieceId.Common, ph.Commons);
            // Tabuleiro vazio: 1º ponto do arco vira a 1ª peça (cai primeiro).
            var pts = PlanningData.ArcPath(ph.TriggerGx, ph.TriggerGz, ph.TriggerDeg,
                endGx, endGz, PlanningController.PathSpacing, true); // igual à ferramenta
            var cells = "";
            foreach (var q in pts) cells += $"({q.gx},{q.gz},r{q.deg:F0})";
            Debug.Log($"[TOPPLE][PHASE] '{ph.Name}' path={cells}");
            // Mesma validade do jogo (mão + ocupada + rot-aware): sem pop de spawn.
            var ok = new List<(int gx, int gz, float deg)>();
            foreach (var q in pts)
            {
                if (data.HandCount(PieceId.Common) - ok.Count <= 0) break;
                if (data.FindAt(q.gx, q.gz) >= 0) continue;
                float wx = PlanningData.ToWorld(q.gx), wz = PlanningData.ToWorld(q.gz);
                bool bad = false;
                foreach (var s in ph.Soldiers)
                    if (PlanningController.OverlapsSoldier(wx, wz, PieceId.Common, q.deg, s)) { bad = true; break; }
                if (!bad) ok.Add(q);
            }
            // Mesmo piso do jogo: vizinhas grudadas travariam em vez de tombar.
            PlanningData.DropCrowded(ok, PieceId.Common);
            int placed = data.TryPlacePath(PieceId.Common, ok);
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
                soldiers[i] = world.SpawnSoldier(ph.Soldiers[i]);
            world.Depenetrate(); // zera micro-penetrações do jitter (pop fantasma)
            first.Rb.angularVelocity = Vector3.Cross(Vector3.up, facing) * 4.5f;
            var rec = world.Finish();
            // Onda: passo em que cada peça passou de 20° (diagnóstico de propagação).
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
                if (i < 6 || i >= pieces.Count - 3) wave += $"[{i}@{at}]";
            }
            int knocked = 0;
            var tilts = "";
            foreach (var s in soldiers)
            {
                if (s.Knocked) knocked++;
                tilts += $"{Vector3.Angle(s.transform.up, Vector3.up):F1}°@{s.transform.position.x:F2},{s.transform.position.z:F2} ";
            }
            Debug.Log($"[TOPPLE][PHASE] '{ph.Name}' peças={placed}/{ph.Commons} knocked={knocked}/{soldiers.Length} soldiers=[{tilts}] wave={wave}");
            return knocked == soldiers.Length ? placed : -1000 - knocked;
        }

        [UnityTest] public IEnumerator Phase2_CurvaDoMuro_Solvable()
        {
            var ph = TutorialSetup.Phases[1];
            var world = SimWorld.Create(20001);
            try
            {
                int placed = SolvePhase(world, ph, 74, -14); // ATRAVÉS do soldado A
                Assert.Greater(placed, 0, "fase 2 sem solução com o roteiro em arco");
                Assert.LessOrEqual(placed, ph.Commons);
            }
            finally { world.Unload(); }
            yield return null;
        }

        [UnityTest] public IEnumerator Phase3_PesoPesado_Solvable()
        {
            var ph = TutorialSetup.Phases[2];
            var world = SimWorld.Create(30001);
            try
            {
                int placed = SolvePhase(world, ph, 74, 18); // ATRAVÉS do soldado A
                Assert.Greater(placed, 0, "fase 3 sem solução com o roteiro em arco");
                Assert.LessOrEqual(placed, ph.Commons);
            }
            finally { world.Unload(); }
            yield return null;
        }
    }
}
