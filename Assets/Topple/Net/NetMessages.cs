// GDD §9.6: todas as mensagens são structs NetworkMessage do Mirror,
// registradas com RegisterHandler. Sem [Command]/[ClientRpc]. Esqueleto T0; autoridade na T6.
using Mirror;

namespace Topple.Net
{
    public struct PlacePieceMsg : NetworkMessage
    {
        public byte Zone;
        public byte Piece; // PieceId
        public short Gx;
        public short Gz;
        public byte Rot; // 0-23, passos de 15°
        public byte Modifier;
    }

    public struct MovePieceMsg : NetworkMessage
    {
        public int InstanceId;
        public short Gx;
        public short Gz;
        public byte Rot;
    }

    public struct RemovePieceMsg : NetworkMessage
    {
        public int InstanceId;
    }

    public struct SetReadyMsg : NetworkMessage
    {
        public bool Ready;
    }

    public struct FireMsg : NetworkMessage { }

    public struct UsePreviewMsg : NetworkMessage
    {
        public byte Zone;
    }

    public struct PingMsg : NetworkMessage
    {
        public byte Kind;
        public short Gx;
        public short Gz;
    }

    public struct LayoutDeltaMsg : NetworkMessage
    {
        public uint Version;
        public byte Op; // 0=add 1=move 2=remove
        public int InstanceId;
        public byte Piece;
        public short Gx;
        public short Gz;
        public byte Rot;
    }

    public struct PhaseChangedMsg : NetworkMessage
    {
        public byte Phase;
        public double DeadlineServerTime;
    }

    public struct SimBeginMsg : NetworkMessage
    {
        public uint Seed;
        public int ChunkCount;
        public int FrameCount;
        public string Hash;
    }

    public struct SimChunkMsg : NetworkMessage
    {
        public int Index;
        public byte[] Bytes; // até 32 KB
    }

    public struct SimResultMsg : NetworkMessage
    {
        public byte Result; // 0=win 1=break
        public byte Stars;
        public int Score;
        public int BlameZone;
    }
}
