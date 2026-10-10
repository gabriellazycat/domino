// GDD §9: LocalSession (solo). Sem rede, layout local. Autoridade/validação do servidor na T6.
using Topple.Core;

namespace Topple.Net
{
    public sealed class LocalSession : ISession
    {
        public bool IsHost => true;
        public GamePhase Phase { get; private set; } = GamePhase.Planning;

        public void PlacePiece(PieceId piece, int gx, int gz, int rotStep) { }
        public void MovePiece(int instanceId, int gx, int gz, int rotStep) { }
        public void RemovePiece(int instanceId) { }
        public void SetReady(bool ready) { }
        public void Fire() { Phase = GamePhase.Simulation; }
    }
}
