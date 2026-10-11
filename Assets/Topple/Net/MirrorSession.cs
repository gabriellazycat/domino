// GDD §9: MirrorSession (host + até 4 conexões). Esqueleto T0 — transporte KCP local,
// FizzySteamworks (relay Steam, AppID 480 em dev) e autoridade do servidor entram na T6.
using Topple.Core;

namespace Topple.Net
{
    public sealed class MirrorSession : ISession
    {
        public bool IsHost => true;
        public GamePhase Phase { get; private set; } = GamePhase.Planning;

        public void PlacePiece(PieceId piece, int gx, int gz, int rotStep) { }
        public void RemovePiece(int instanceId) { }
        public void SetReady(bool ready) { }
        public void Fire() { Phase = GamePhase.Simulation; }
    }
}
