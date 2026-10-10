// GDD §13.1: prefabs têm PieceView + mesmo id do dado em Content/.
// Contrato de visuais: o jogo referencia só por visualId (ex. "piece.common").
// NOTA Unity: um MonoBehaviour por arquivo (o segundo da fila salva m_Script nulo).
using UnityEngine;

namespace Topple.Sim
{
    public sealed class PieceView : MonoBehaviour
    {
        public string VisualId = "piece.common";
        public string PieceId = "common";
    }
}
