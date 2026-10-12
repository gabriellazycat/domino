// Deckbuilder: recompensas de draft (puro, sem UnityEngine).
// Opção = pacote {rótulo, [(tipo, qtd)]} — ex. "2 Bifurcações", "5 Comuns".
// Smart pools: entradas desbloqueiam por fase (pesada antes dos pesadões,
// fork antes das fases split); pesos, nunca certeza. Determinístico por seed.
using System.Collections.Generic;

namespace Topple.Core
{
    public struct RewardOption
    {
        public string Label;
        public (PieceId piece, int count)[] Items;
    }

    public static class RewardPool
    {
        struct Entry
        {
            public int MinPhase;
            public int Weight;
            public string Label;
            public (PieceId, int)[] Items;
            // Pack puro-comum escalável (1 por draft, sem par dominado): qtd e
            // rótulo derivam da fase (4+fase). Sem isso "3 vs 4 Comuns"
            // apareciam juntos — 4 domina 3 e não há escolha de verdade.
            public bool ScaledCommons;
        }

        static int ScaledCommonsCount(int phaseIndex) => 4 + phaseIndex;

        static readonly Entry[] Table = new Entry[]
        {
            new Entry { MinPhase = 0, Weight = 35, Label = "Comuns", ScaledCommons = true,
                Items = new[] { (PieceId.Common, 4) } },
            new Entry { MinPhase = 0, Weight = 30, Label = "2 Comuns + 1 Pesada",
                Items = new[] { (PieceId.Common, 2), (PieceId.Heavy, 1) } },
            // 3º eixo do 1º draft é a Grande (alcance 0,60): combustível (comuns)
            // × qualidade (pesada) × alcance (grande). Rampa FORA do draft
            // (pedido do dono); com 3 entradas em f0 o fallback nunca dispara.
            new Entry { MinPhase = 0, Weight = 20, Label = "1 Grande",
                Items = new[] { (PieceId.Big, 1) } },
            new Entry { MinPhase = 1, Weight = 20, Label = "1 Pesada",
                Items = new[] { (PieceId.Heavy, 1) } },
            new Entry { MinPhase = 2, Weight = 12, Label = "2 Explosivas",
                Items = new[] { (PieceId.Blast, 2) } },
            new Entry { MinPhase = 3, Weight = 12, Label = "1 Torre",
                Items = new[] { (PieceId.Tower, 1) } },
            new Entry { MinPhase = 3, Weight = 12, Label = "1 Corrida",
                Items = new[] { (PieceId.Runner, 1) } },
            // Bifurcação desde f2 (era f4) e com mais peso (pedido do dono):
            // aparece mais e chega antes da fase do Garfo.
            new Entry { MinPhase = 2, Weight = 18, Label = "1 Bifurcação + 2 Comuns",
                Items = new[] { (PieceId.Fork, 1), (PieceId.Common, 2) } },
            new Entry { MinPhase = 2, Weight = 14, Label = "2 Bifurcações",
                Items = new[] { (PieceId.Fork, 2) } },
        };

        // 3 opções distintas por peso (roleta, sem reposição). Sempre devolve 3:
        // se a tabela não der, completa com pacotes de comuns.
        public static List<RewardOption> Draft3(ref ToppleRng rng, int phaseIndex)
        {
            var pool = new List<Entry>();
            foreach (var e in Table)
                if (e.MinPhase <= phaseIndex) pool.Add(e);
            var out3 = new List<RewardOption>(3);
            for (int pick = 0; pick < 3 && pool.Count > 0; pick++)
            {
                int total = 0;
                foreach (var e in pool) total += e.Weight;
                int roll = (int)(rng.NextFloat() * total);
                int acc = 0, at = 0;
                for (; at < pool.Count; at++)
                {
                    acc += pool[at].Weight;
                    if (roll < acc) break;
                }
                if (at >= pool.Count) at = pool.Count - 1;
                var chosen = pool[at];
                pool.RemoveAt(at);
                if (chosen.ScaledCommons)
                {
                    int n = ScaledCommonsCount(phaseIndex);
                    out3.Add(new RewardOption
                    {
                        Label = n + " Comuns",
                        Items = new[] { (PieceId.Common, n) },
                    });
                }
                else out3.Add(new RewardOption { Label = chosen.Label, Items = chosen.Items });
            }
            // Segurança (inalcançável: f0 já tem 3 entradas): completa com pacotes
            // de comuns de rótulo inédito, acima do pack escalado (sem colidir).
            while (out3.Count < 3)
            {
                var used = new System.Collections.Generic.HashSet<string>();
                foreach (var o in out3) used.Add(o.Label);
                int n = ScaledCommonsCount(phaseIndex) + 1;
                while (used.Contains(n + " Comuns")) n++;
                out3.Add(new RewardOption
                {
                    Label = n + " Comuns",
                    Items = new[] { (PieceId.Common, n) },
                });
            }
            return out3;
        }
    }
}
