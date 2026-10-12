// Deckbuilder: estado da run (puro, sem UnityEngine — testável em EditMode).
// Deck = cartas possuídas por tipo; mão da fase = cópia do deck (LoadPhase).
// Tentativas: cada DISPARAR consome 1 (planejar/Recarregar livres).
// Dano brutal puro, sem teto: 1 por sobrevivente (decisão do dono).
using System.Collections.Generic;

namespace Topple.Core
{
    public sealed class RunState
    {
        public readonly Dictionary<PieceId, int> Deck = new();
        public int Life;
        public int PhaseIndex;
        public int AttemptsLeft;
        public ToppleRng Rng;

        public static RunState NewRun(uint seed)
        {
            var r = new RunState
            {
                Life = ToppleRules.StartingLife,
                PhaseIndex = 0,
                AttemptsLeft = ToppleRules.AttemptsPerPhase,
                Rng = new ToppleRng(seed),
            };
            r.Deck[PieceId.Common] = ToppleRules.StartingCommons;
            return r;
        }

        public int DeckCount(PieceId p) => Deck.TryGetValue(p, out var c) ? c : 0;

        public int DeckTotal()
        {
            int n = 0;
            foreach (var kv in Deck) n += kv.Value;
            return n;
        }

        public void ApplyReward(IEnumerable<(PieceId piece, int count)> items)
        {
            foreach (var (piece, count) in items)
                Deck[piece] = DeckCount(piece) + count;
        }

        public bool SpendAttempt()
        {
            if (AttemptsLeft <= 0) return false;
            AttemptsLeft--;
            return true;
        }

        public void RefillAttempts() => AttemptsLeft = ToppleRules.AttemptsPerPhase;

        public int Damage(int survivors)
        {
            Life -= survivors * ToppleRules.DamagePerSurvivor;
            return Life;
        }

        public bool IsDead => Life <= 0;
    }
}
