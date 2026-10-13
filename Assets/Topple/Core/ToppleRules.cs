// TOPPLE GDD §4.4, §8, §14.7, §17 — regras puras, sem UnityEngine, para testes EditMode rápidos.
namespace Topple.Core
{
    public static class ToppleRules
    {
        // Deckbuilder (run): valores iniciais.
        public const int StartingLife = 10; // vida Y da run
        public const int StartingCommons = 14; // deck base: 14 comuns (P1 par 12 com folga)
        public const int StartingForks = 1; // deck base: +1 bifurcação (split/timing desde o início)
        public const int AttemptsPerPhase = 3; // 3 DISPARAR por fase (planejar/Recarregar livres)
        public const int DamagePerSurvivor = 1; // brutal puro, sem teto (decisão do dono)
        // GDD §4.4: primeira tentativa de cada fase é gratuita (reconhecimento, sistema de Moral; run usa Attempts).
        public const int FreeAttemptsPerPhase = 1;

        // GDD §4.4/§17: valor inicial a testar — 6 de Moral por ato (parâmetro de dados no v1.0).
        public const int StartingMoralePerAct = 6;

        // GDD §4.1: Previsão tem 3 cargas por fase.
        public const int PreviewChargesPerPhase = 3;

        // GDD §4.1: Previsão mostra os primeiros 3 segundos.
        public const float PreviewSeconds = 3f;

        // GDD §4.3: combo expira após 1,5s sem derrubar.
        public const float ComboWindowSeconds = 1.5f;

        // GDD §14.7: estrelas e ouro.
        public static int StarsForWin(bool efficient, bool comboGoal) =>
            1 + (efficient ? 1 : 0) + (comboGoal ? 1 : 0);

        public static int GoldForPhase(int stars, bool noExtraAttempts) =>
            12 + 6 * stars + (noExtraAttempts ? 6 : 0);

        // Loja (economia-maior 13/out/2026; finais em Content/ na T5).
        public const int ShopPriceMult = 4; // preço da carta = SlotCost × 4
        public const int ShopEvery = 3; // loja ocasião, nunca toda fase: a cada 3 (fases 3, 6, 9…)
        public static bool IsShopPhase(int phaseIndex) => (phaseIndex + 1) % ShopEvery == 0;
        public const int ShopRerollBase = 8; // +4 por uso na mesma loja
        public const int ShopRerollStep = 4;
        public const int ShopHealLife = 2; // +2 vida...
        public const int ShopHealCost = 12; // ...por 12 ouro (teto = StartingLife)
        public const int ShopAttemptCost = 10; // +1 tentativa na próxima fase
        public const int ShopMaxExtraAttempts = 2;
        public static int ShopPrice(PieceId piece, int count) => SlotCost(piece) * count * ShopPriceMult;

        // GDD §8: orçamento de slots (valores conhecidos; demais peças em Content/ na T5).
        public static int SlotCost(PieceId piece) => piece switch
        {
            PieceId.Common => 1,
            PieceId.Heavy => 2,
            PieceId.Fork => 3,
            PieceId.Big => 2,
            PieceId.Runner => 2,
            PieceId.Blast => 3,
            PieceId.Tower => 2,
            PieceId.Giant => 6,
            _ => 1,
        };

        // GDD §4.4: custo de Moral de uma tentativa (0 = reconhecimento, 1 = demais).
        public static int MoraleCostForAttempt(int attemptIndexZeroBased) =>
            attemptIndexZeroBased < FreeAttemptsPerPhase ? 0 : 1;
    }

    // MVP T0-T3: só Common/Heavy/Ramp são usadas. Giant declarada para o SlotCost do GDD §8 (v1.0).
    // Deckbuilder: Fork (bifurcação), Big (grande), Runner (corrida), Blast (explosiva),
    // Tower (torre). Física própria de cada uma entra na F2 (até lá, tombam como comum).
    public enum PieceId { Common, Heavy, Ramp, Giant, Fork, Big, Runner, Blast, Tower }

    // Inimigos: soldado (base), pesadão (só pesada/explosão/queda) e
    // patrulheiro (loop cinemático lento). Puro (sem UnityEngine).
    public enum EnemyKind { Soldier, Brute, Patroller }

    // RNG com seed — GDD §4.2/§15.7: nenhuma aleatoriedade fora de RNG com seed.
    public struct ToppleRng
    {
        uint _state;
        public ToppleRng(uint seed) { _state = seed == 0 ? 0x9E3779B9u : seed; }
        public uint Next()
        {
            _state ^= _state << 13; _state ^= _state >> 17; _state ^= _state << 5;
            return _state;
        }
        public float NextFloat() => (Next() >> 8) / 16777216f;
    }
}
