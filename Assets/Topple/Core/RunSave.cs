// DTO serializável do auto-save (puro, sem UnityEngine — JsonUtility é
// aplicado na camada Game). Dicionário vira 2 listas (JsonUtility não faz
// Dictionary). Versionado p/ invalidar saves antigos.
using System.Collections.Generic;

namespace Topple.Core
{
    [System.Serializable]
    public class RunSave
    {
        public int version = 1;
        public uint seed;
        public uint rngState;
        public int life;
        public int phaseIndex;
        public int gold;
        public int extraAttempts;
        public int attemptsLeft;
        public List<int> deckPieces = new();
        public List<int> deckCounts = new();
        public string savedAt = "";

        public static RunSave FromRun(RunState r)
        {
            var s = new RunSave
            {
                seed = r.Seed,
                rngState = r.Rng.State,
                life = r.Life,
                phaseIndex = r.PhaseIndex,
                gold = r.Gold,
                extraAttempts = r.ExtraAttempts,
                attemptsLeft = r.AttemptsLeft,
                savedAt = System.DateTime.Now.ToString("yyyy-MM-dd HH:mm"),
            };
            foreach (var kv in r.Deck)
            {
                s.deckPieces.Add((int)kv.Key);
                s.deckCounts.Add(kv.Value);
            }
            return s;
        }

        public void ApplyTo(RunState r)
        {
            r.Seed = seed;
            r.Rng = new ToppleRng(1);
            r.Rng.SetState(rngState);
            r.Life = life;
            r.PhaseIndex = phaseIndex;
            r.Gold = gold;
            r.ExtraAttempts = extraAttempts;
            r.AttemptsLeft = attemptsLeft;
            r.Deck.Clear();
            for (int i = 0; i < deckPieces.Count && i < deckCounts.Count; i++)
                r.Deck[(PieceId)deckPieces[i]] = deckCounts[i];
        }

        public string Info() => $"Fase {phaseIndex + 1} · ❤{life} · ◉{gold} · {savedAt}";
    }
}
