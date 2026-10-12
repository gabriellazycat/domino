// Deckbuilder: ponto de inimigo na fase (Sim tem UnityEngine; Core não).
// Patrulheiro carrega waypoints (loop fechado); demais ignoram.
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    [System.Serializable]
    public struct EnemySpot
    {
        public EnemyKind Kind;
        public Vector3 Pos;
        public List<Vector3> Waypoints;
        public float Speed; // patrulheiro: m/s no loop (padrão 0,3)

        public EnemySpot(EnemyKind kind, Vector3 pos)
        {
            Kind = kind;
            Pos = pos;
            Waypoints = new List<Vector3>();
            Speed = 0.3f;
        }

        // Atalho p/ soldado parado (fase authoring enxuta).
        public static EnemySpot Soldier(float x, float z)
            => new EnemySpot(EnemyKind.Soldier, new Vector3(x, 0f, z));

        public static EnemySpot Brute(float x, float z)
            => new EnemySpot(EnemyKind.Brute, new Vector3(x, 0f, z));

        public static EnemySpot Patroller(float speed, params Vector3[] loop)
        {
            var s = new EnemySpot(EnemyKind.Patroller, loop.Length > 0 ? loop[0] : Vector3.zero)
            {
                Waypoints = new List<Vector3>(loop),
                Speed = speed,
            };
            return s;
        }
    }
}
