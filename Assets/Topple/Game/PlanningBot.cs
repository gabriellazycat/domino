// T3: PlanningBot — completa o tutorial usando SÓ comandos de jogador
// (Select/SetRot/BeginPathAt/CommitPath/Fire), como um jogador faria.
// Estratégia: 1 trecho de trilha do trigger até perto do 1º soldado.
// Passo ~0,36 pela ferramenta (nunca 0,40 uniforme: drape-pin mata a onda, §14).
using Topple.Core;

namespace Topple.Game
{
    public static class PlanningBot
    {
        // Tabuleiro vazio: a 1ª peça do trecho (0,0) é a que recebe o impulso.
        // Para a 0,65 m do soldado mais próximo (fora da zona proibida,
        // ao alcance da queda de 0,80 m). 9 peças no deck base de 10.
        public static void SolveTutorial(PlanningController c)
        {
            c.Select(PieceId.Common);
            c.SetRot(6); // 90°: fileira ao longo de +X
            float endX = 3.2f;
            if (c.Soldiers.Count > 0)
            {
                float sx = float.MaxValue;
                foreach (var s in c.Soldiers)
                    if (s.Pos.x < sx) sx = s.Pos.x;
                endX = sx - 0.65f;
            }
            int endGx = PlanningData.ToGrid(endX);
            if (!c.BeginPathAt(0, 0, 0f, 0f))
                throw new System.Exception("[TOPPLE][BOT] trilha recusada no tabuleiro vazio.");
            c.CommitPath(endGx, 0);
            if (c.Data.Count == 0)
                throw new System.Exception("[TOPPLE][BOT] trilha vazia (sem peças).");
            c.Fire();
        }
    }
}
