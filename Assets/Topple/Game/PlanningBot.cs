// T3: PlanningBot — completa o tutorial usando SÓ comandos de jogador
// (Select/SetRot/Place/Fire), como um jogador faria. Estratégia: fileira de
// comuns a 0,40 m do trigger em direção aos soldados (geometria validada na T1).
using Topple.Core;

namespace Topple.Game
{
    public static class PlanningBot
    {
        // gx em células finas de 0,05 m: 8 células = 0,40 m.
        // Tabuleiro vazio: a 1ª peça do bot (0,0) é a que recebe o impulso.
        public static void SolveTutorial(PlanningController c)
        {
            c.Select(PieceId.Common);
            c.SetRot(6); // 90°: fileira ao longo de +X
            if (!c.Place(0, 0))
                throw new System.Exception("[TOPPLE][BOT] falha ao colocar a 1ª peça.");
            for (int i = 1; i <= 10; i++)
            {
                if (!c.Place(i * 8, 0))
                    throw new System.Exception($"[TOPPLE][BOT] falha ao colocar peça {i} (mão esgotada ou cela ocupada).");
            }
            c.Fire();
        }
    }
}
