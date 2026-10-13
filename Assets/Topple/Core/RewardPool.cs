// Deckbuilder: recompensas de draft (puro, sem UnityEngine).
// Opção = pacote {rótulo, [(tipo, qtd)]} — ex. "2 Bifurcações", "5 Comuns".
// Smart pools: entradas desbloqueiam por fase (pesada antes dos pesadões,
// fork antes das fases split); pesos, nunca certeza. Determinístico por seed.
// Tabela efetiva: ContentPack.Base() salvo override via UsePack (JSON em
// Assets/Topple/Content, aplicado pelo ContentLoader no jogo; testes usam o Base).
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
        static readonly ContentPack BasePack = ContentPack.Base();
        static ContentPack _override;

        // Troca a tabela em runtime (JSON). null/Reset volta ao Base.
        public static void UsePack(ContentPack pack) => _override = pack;
        public static void ResetPack() => _override = null;

        // Espelho p/ testes compararem o JSON com o Base (ordem importa: a
        // roleta itera na ordem da tabela — JSON fora de ordem muda os drafts).
        public static ContentPack BasePackForTest() => BasePack;

        static int ScaledCommonsCount(int phaseIndex) => 4 + phaseIndex;

        // 3 opções distintas por peso (roleta, sem reposição). Sempre devolve 3:
        // se a tabela não der, completa com pacotes de comuns.
        public static List<RewardOption> Draft3(ref ToppleRng rng, int phaseIndex)
        {
            var table = _override ?? BasePack;
            var pool = new List<ContentEntry>();
            foreach (var e in table.Entries)
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
                else
                {
                    var items = new (PieceId, int)[chosen.Items.Length];
                    for (int i = 0; i < items.Length; i++)
                        items[i] = (chosen.Items[i].Piece, chosen.Items[i].Count);
                    out3.Add(new RewardOption { Label = chosen.Label, Items = items });
                }
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
