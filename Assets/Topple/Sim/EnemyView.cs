// GDD §13.1: prefabs têm EnemyView + mesmo id do dado em Content/.
// NOTA Unity: um MonoBehaviour por arquivo (ver PieceView.cs).
using UnityEngine;

namespace Topple.Sim
{
    public sealed class EnemyView : MonoBehaviour
    {
        public string VisualId = "enemy.soldier";
        public string EnemyId = "soldier";
        public Topple.Core.Team Team; // time narrativo (só visual)
    }
}
