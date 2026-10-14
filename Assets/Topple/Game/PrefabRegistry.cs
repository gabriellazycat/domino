// T3: acesso aos prefabs gerados. No Editor carrega de Assets/Generated;
// no player usa Resources (cópias publicadas na T7 — gameplay final).
// NUNCA UnityEditor fora de #if (quebra o build).
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;

namespace Topple.Game
{
    public static class PrefabRegistry
    {
        static readonly Dictionary<string, GameObject> Cache = new();

        public static GameObject Piece(PieceId piece) => Load("piece_" + piece.ToString().ToLowerInvariant());

        public static GameObject Soldier(Team team = Team.Evil)
            => Load(team == Team.Good ? "enemy_soldier_good" : "enemy_soldier");

        public static GameObject Brute(Team team = Team.Evil)
            => Load(team == Team.Good ? "enemy_brute_good" : "enemy_brute");

        public static GameObject Table()
            => Load("field_table");

        static GameObject Load(string name)
        {
            if (Cache.TryGetValue(name, out var go) && go != null) return go;
#if UNITY_EDITOR
            go = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>($"Assets/Generated/Prefabs/{name}.prefab");
#endif
            if (go == null) go = Resources.Load<GameObject>("Generated/" + name);
            if (go == null) Debug.LogError($"[TOPPLE][GAME] prefab ausente: {name}");
            else Cache[name] = go;
            return go;
        }
    }
}
