// Deckbuilder: pacote de conteúdo do draft (pesos) — puro, sem UnityEngine.
// Fonte de verdade: Assets/Topple/Content/reward-weights.json (editável sem
// recompilar; aplicado em runtime via RewardPool.UsePack). O Base() embutido
// é o fallback (sem JSON) e o espelho que os testes comparam com o JSON:
// se o JSON derivar, o teste quebra — editar os dois juntos.
using System.Collections.Generic;

namespace Topple.Core
{
    public struct ContentItem
    {
        public PieceId Piece;
        public int Count;
    }

    public struct ContentEntry
    {
        public int MinPhase;
        public int Weight;
        public string Label;
        public ContentItem[] Items;
        // Pack puro-comum escalável (1 por draft, sem par dominado): qtd e
        // rótulo derivam da fase (5+fase).
        public bool ScaledCommons;
    }

    public sealed class ContentPack
    {
        public readonly List<ContentEntry> Entries = new();

        public static ContentPack Base()
        {
            var p = new ContentPack();
            p.Entries.Add(new ContentEntry { MinPhase = 0, Weight = 35, Label = "Comuns", ScaledCommons = true,
                Items = new[] { new ContentItem { Piece = PieceId.Common, Count = 5 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 0, Weight = 30, Label = "2 Comuns + 1 Pesada",
                Items = new[] { new ContentItem { Piece = PieceId.Common, Count = 2 }, new ContentItem { Piece = PieceId.Heavy, Count = 1 } } });
            // 3º eixo do 1º draft é a Grande (alcance 0,60): combustível
            // (comuns) × qualidade (pesada) × alcance (grande). Rampa FORA do
            // draft (pedido do dono); com 3 entradas em f0 o fallback nunca dispara.
            p.Entries.Add(new ContentEntry { MinPhase = 0, Weight = 20, Label = "1 Grande",
                Items = new[] { new ContentItem { Piece = PieceId.Big, Count = 1 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 1, Weight = 20, Label = "1 Pesada",
                Items = new[] { new ContentItem { Piece = PieceId.Heavy, Count = 1 } } });
            // Combustível de meio de jogo (mistos, nunca puro-comum: sem par dominado).
            p.Entries.Add(new ContentEntry { MinPhase = 2, Weight = 16, Label = "3 Comuns + 2 Pesadas",
                Items = new[] { new ContentItem { Piece = PieceId.Common, Count = 3 }, new ContentItem { Piece = PieceId.Heavy, Count = 2 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 2, Weight = 12, Label = "2 Explosivas",
                Items = new[] { new ContentItem { Piece = PieceId.Blast, Count = 2 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 3, Weight = 12, Label = "1 Torre",
                Items = new[] { new ContentItem { Piece = PieceId.Tower, Count = 1 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 3, Weight = 12, Label = "1 Corrida",
                Items = new[] { new ContentItem { Piece = PieceId.Runner, Count = 1 } } });
            // Bifurcação desde f2 (era f4) e com mais peso (pedido do dono):
            // aparece mais e chega antes da fase do Garfo.
            p.Entries.Add(new ContentEntry { MinPhase = 2, Weight = 18, Label = "1 Bifurcação + 2 Comuns",
                Items = new[] { new ContentItem { Piece = PieceId.Fork, Count = 1 }, new ContentItem { Piece = PieceId.Common, Count = 2 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 2, Weight = 14, Label = "2 Bifurcações",
                Items = new[] { new ContentItem { Piece = PieceId.Fork, Count = 2 } } });
            // Volume de fim de jogo (economia-maior 13/out/2026: gigantes de
            // 20+ corpos pedem baralho à altura; par segue apertado).
            p.Entries.Add(new ContentEntry { MinPhase = 6, Weight = 12, Label = "3 Pesadas",
                Items = new[] { new ContentItem { Piece = PieceId.Heavy, Count = 3 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 6, Weight = 10, Label = "2 Torres",
                Items = new[] { new ContentItem { Piece = PieceId.Tower, Count = 2 } } });
            p.Entries.Add(new ContentEntry { MinPhase = 8, Weight = 10, Label = "2 Grandes + 2 Comuns",
                Items = new[] { new ContentItem { Piece = PieceId.Big, Count = 2 }, new ContentItem { Piece = PieceId.Common, Count = 2 } } });
            return p;
        }
    }
}
