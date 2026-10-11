// GDD §9: solo e co-op com o mesmo código. A lógica fala com ISession.
// LocalSession (solo, sem rede) funciona no MVP. MirrorSession ganha rede na T6.
namespace Topple.Core
{
    public enum GamePhase { Planning, Simulation, Result }

    public interface ISession
    {
        bool IsHost { get; }
        GamePhase Phase { get; }
        void PlacePiece(PieceId piece, int gx, int gz, int rotStep);
        void RemovePiece(int instanceId);
        void SetReady(bool ready);
        void Fire();
    }
}
