// Deckbuilder: Content/ em runtime (T5 começa aqui). Lê os JSONs fonte
// (Assets/Topple/Content, sincronizados em Resources/Content pelo GenerateAll)
// e injeta no RewardPool sem recompilar: pesos viram dados de verdade.
// Sem JSON (ou JSON inválido) = Base embutido, com warning no log — nunca erro.
using System;
using UnityEngine;
using Topple.Core;

namespace Topple.Game
{
    public static class ContentLoader
    {
        [Serializable] public struct JsonItem { public string piece; public int count; }
        [Serializable] public struct JsonEntry
        {
            public int minPhase; public int weight; public string label;
            public JsonItem[] items; public bool scaledCommons;
        }
        [Serializable] class RewardJson { public JsonEntry[] entries; }
        [Serializable] class ShopJson
        {
            public int shopEvery; public int priceMult;
            public int rerollBase; public int rerollStep;
            public int healLife; public int healCost;
            public int attemptCost; public int maxExtraAttempts;
        }

        public const string RewardsPath = "Content/reward-weights";
        public const string ShopPath = "Content/shop";

        // JSON → pack (puro o suficiente p/ testes; exceção com motivo em JSON ruim).
        public static ContentPack LoadRewards(string json)
        {
            if (string.IsNullOrEmpty(json)) throw new ArgumentException("reward-weights vazio");
            var dto = JsonUtility.FromJson<RewardJson>(json);
            if (dto == null || dto.entries == null || dto.entries.Length == 0)
                throw new ArgumentException("reward-weights sem entries");
            var pack = new ContentPack();
            foreach (var e in dto.entries)
            {
                if (e.items == null || e.items.Length == 0)
                    throw new ArgumentException($"entry '{e.label}' sem items");
                if (e.weight <= 0) throw new ArgumentException($"entry '{e.label}' com peso <= 0");
                var items = new ContentItem[e.items.Length];
                for (int i = 0; i < items.Length; i++)
                {
                    if (!Enum.TryParse(e.items[i].piece, true, out PieceId piece))
                        throw new ArgumentException($"peça desconhecida: '{e.items[i].piece}'");
                    if (e.items[i].count <= 0) throw new ArgumentException($"count <= 0 em '{e.label}'");
                    items[i] = new ContentItem { Piece = piece, Count = e.items[i].count };
                }
                pack.Entries.Add(new ContentEntry
                {
                    MinPhase = e.minPhase, Weight = e.weight, Label = e.label,
                    Items = items, ScaledCommons = e.scaledCommons,
                });
            }
            return pack;
        }

        // Compara o shop.json com as constantes vivas (espelho até a T5).
        public static bool ValidateShop(string json, out string problem)
        {
            problem = null;
            try
            {
                var dto = JsonUtility.FromJson<ShopJson>(json);
                if (dto == null) { problem = "shop.json vazio"; return false; }
                if (dto.shopEvery != ToppleRules.ShopEvery) problem = $"shopEvery {dto.shopEvery} != {ToppleRules.ShopEvery}";
                else if (dto.priceMult != ToppleRules.ShopPriceMult) problem = $"priceMult {dto.priceMult} != {ToppleRules.ShopPriceMult}";
                else if (dto.rerollBase != ToppleRules.ShopRerollBase) problem = $"rerollBase {dto.rerollBase} != {ToppleRules.ShopRerollBase}";
                else if (dto.rerollStep != ToppleRules.ShopRerollStep) problem = $"rerollStep {dto.rerollStep} != {ToppleRules.ShopRerollStep}";
                else if (dto.healLife != ToppleRules.ShopHealLife) problem = $"healLife {dto.healLife} != {ToppleRules.ShopHealLife}";
                else if (dto.healCost != ToppleRules.ShopHealCost) problem = $"healCost {dto.healCost} != {ToppleRules.ShopHealCost}";
                else if (dto.attemptCost != ToppleRules.ShopAttemptCost) problem = $"attemptCost {dto.attemptCost} != {ToppleRules.ShopAttemptCost}";
                else if (dto.maxExtraAttempts != ToppleRules.ShopMaxExtraAttempts) problem = $"maxExtraAttempts {dto.maxExtraAttempts} != {ToppleRules.ShopMaxExtraAttempts}";
                return problem == null;
            }
            catch (Exception ex) { problem = "parse: " + ex.Message; return false; }
        }

        // Aplica o JSON empacotado (Resources). false = mantém o Base (log avisa).
        public static bool ApplyFromResources()
        {
            var ta = Resources.Load<TextAsset>(RewardsPath);
            if (ta == null)
            {
                Debug.Log("[TOPPLE][CONTENT] sem Resources/Content/reward-weights — Base embutido");
                return false;
            }
            try
            {
                RewardPool.UsePack(LoadRewards(ta.text));
                Debug.Log("[TOPPLE][CONTENT] pesos aplicados do JSON");
            }
            catch (Exception ex)
            {
                RewardPool.ResetPack();
                Debug.LogWarning($"[TOPPLE][CONTENT] JSON inválido ({ex.Message}) — Base embutido");
                return false;
            }
            var shopTa = Resources.Load<TextAsset>(ShopPath);
            if (shopTa != null && !ValidateShop(shopTa.text, out var problem))
                Debug.LogWarning("[TOPPLE][CONTENT] shop.json derivou: " + problem);
            return true;
        }
    }
}
