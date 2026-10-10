// Marcador do SimWorld: id estável (ordem de spawn) + Rigidbody.
// NOTA Unity: um MonoBehaviour por arquivo.
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    public sealed class SimPiece : MonoBehaviour
    {
        public int Id;
        public PieceId Piece;
        public Rigidbody Rb { get; private set; }
        void Awake()
        {
            Rb = GetComponent<Rigidbody>();
            if (Rb == null) Rb = gameObject.AddComponent<Rigidbody>();
        }
    }
}
