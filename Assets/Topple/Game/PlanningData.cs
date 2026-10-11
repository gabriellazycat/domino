// T3: modelo do planejamento — layout, mão e desfazer. Puro (sem UnityEngine),
// testável em EditMode. Grade inteira; rotação em graus exatos (o fio §9
// continua em passos 0-23, quantizado só na transmissão T6).
using System.Collections.Generic;
using Topple.Core;

namespace Topple.Game
{
    public struct Placement
    {
        public int InstanceId;
        public PieceId Piece;
        public int Gx;
        public int Gz;
        public float Deg; // graus exatos (Q/E andam em passos de 15°)
        public bool Locked; // Peça Zero do cenário (não remove/move)
    }

    public sealed class PlanningData
    {
        public const float Grid = 0.05f; // unidade interna; snap normal = 5 células (0,25 m, GDD §4.1)
        public const int SnapNormal = 5;
        public const int RotSteps = 24;
        public const float StepDeg = 15f;

        readonly List<Placement> _items = new();
        readonly Stack<IUndoAction> _undo = new();
        int _nextId = 1;
        readonly Dictionary<PieceId, int> _hand = new();

        public IReadOnlyList<Placement> Items => _items;
        public int Count => _items.Count;
        public bool CanUndo => _undo.Count > 0;

        public void SetHand(PieceId piece, int count) => _hand[piece] = count;
        public int HandCount(PieceId piece) => _hand.TryGetValue(piece, out var c) ? c : 0;

        public static float ToWorld(int g) => g * Grid;
        public static int ToGrid(float w) => (int)System.Math.Round(w / Grid);
        public static int Snap(int g, bool fine) => fine ? g : (int)System.Math.Round(g / (float)SnapNormal) * SnapNormal;
        public static float WrapDeg(float d) => ((d % 360f) + 360f) % 360f;
        public static int DegToStep(float d) => (int)System.Math.Round(WrapDeg(d) / StepDeg) % RotSteps; // p/ o fio §9

        // Espaçamento tem PISO e TETO (revisão 10/out/2026, pedido do dono):
        // vizinhas grudadas (< espessura) nascem intersectando e TRAVAM uma na
        // outra em vez de tombar — na grade fina (0,05 m) o arco aproxima pontos
        // a 0,05-0,15 m e o filtro antigo (só barrava a mesma célula) deixava.
        // FallRoom = distância mínima entre vizinhas NOVAS (espaço p/ cair);
        // IntersectGap = mínima contra o tabuleiro (só anti-interseção, p/ não
        // quebrar a emenda com a cadeia existente).
        public static float Thickness(PieceId piece) => piece switch
        {
            PieceId.Heavy => 0.20f,
            PieceId.Ramp => 0.25f,
            _ => 0.12f,
        };
        public static float FallRoom(PieceId piece) => Thickness(piece) + 0.10f;
        public static float IntersectGap(PieceId piece) => Thickness(piece) + 0.02f;

        // Remove da lista os pontos grudados (mantém o 1º: intenção do jogador).
        // Piso = FallRoom; teto (WaveReach) é tratado pelo FillGaps da ferramenta.
        public static void DropCrowded(List<(int gx, int gz, float deg)> pts, PieceId piece)
        {
            float min = FallRoom(piece);
            int kept = -1;
            for (int i = 0; i < pts.Count; i++)
            {
                if (kept < 0) { kept = i; continue; }
                float dx = ToWorld(pts[i].gx) - ToWorld(pts[kept].gx);
                float dz = ToWorld(pts[i].gz) - ToWorld(pts[kept].gz);
                if (System.Math.Sqrt(dx * dx + dz * dz) < min) { pts.RemoveAt(i); i--; }
                else kept = i;
            }
        }

        // Trilha com rotação própria por ponto (curvas), como uma única ação.
        public int TryPlacePath(PieceId piece, List<(int gx, int gz, float deg)> pts)
        {
            int depth = _undo.Count, n = 0;
            foreach (var (gx, gz, deg) in pts)
                if (TryPlace(piece, gx, gz, deg, false, out _)) n++;
            if (n > 1)
            {
                var acts = new List<IUndoAction>();
                while (_undo.Count > depth) acts.Add(_undo.Pop());
                acts.Reverse();
                _undo.Push(new BatchAct(acts));
            }
            return n;
        }

        // Direção (facing): R_y(graus)·(0,0,1).
        public static (float x, float z) FacingOf(float deg)
        {
            float r = WrapDeg(deg) * (float)System.Math.PI / 180f;
            return ((float)System.Math.Sin(r), (float)System.Math.Cos(r));
        }

        // Tangente → graus EXATOS (sem quantizar: curvas suaves; o fio §9 quantiza).
        public static float DegFromTangent(float tx, float tz)
            => WrapDeg((float)System.Math.Atan2(tx, tz) * 180f / (float)System.Math.PI);

        // Trilha inteligente: arco de curvatura constante tangente à direção inicial
        // (como dominó de verdade) ou reta se o destino está alinhado/perto demais.
        // forceStraight (trilha fresca no chão vazio): sempre reta na tangente do
        // segmento, ignorando o facing — previsível ("o que traça é o que sai").
        // Retorna células com rotação exata pela tangente. Determinístico.
        public static List<(int gx, int gz, float deg)> ArcPath(
            int gx0, int gz0, float deg0, int gx1, int gz1, float spacing, bool fine, bool forceStraight = false, int maxPoints = 60)
        {
            float x0 = ToWorld(gx0), z0 = ToWorld(gz0), x1 = ToWorld(gx1), z1 = ToWorld(gz1);
            var (fx, fz) = FacingOf(deg0);
            float vx = x1 - x0, vz = z1 - z0;
            float dist = (float)System.Math.Sqrt(vx * vx + vz * vz);
            var pts = new List<(int gx, int gz, float deg)>();
            if (dist < 1e-4f) { pts.Add((gx0, gz0, WrapDeg(deg0))); return pts; }

            float px = -fz, pz = fx; // perpendicular (esquerda da direção)
            float denom = px * vx + pz * vz;
            bool straight = forceStraight || System.Math.Abs(denom) < 1e-4f * dist;
            float r = straight ? 0f : (dist * dist) / (2f * denom);
            if (!straight && System.Math.Abs(r) < 0.5f) straight = true; // raio mínimo

            if (straight)
            {
                float il = 1f / dist;
                float deg = DegFromTangent(vx * il, vz * il);
                int n = System.Math.Max(1, (int)System.Math.Round(dist / spacing));
                for (int i = 0; i <= n && pts.Count < maxPoints; i++)
                {
                    float t = i / (float)n;
                    pts.Add((Snap(ToGrid(x0 + vx * t), fine), Snap(ToGrid(z0 + vz * t), fine), deg));
                }
                return Dedup(pts);
            }

            float cx = x0 + px * r, cz = z0 + pz * r;
            float a0 = (float)System.Math.Atan2(z0 - cz, x0 - cx);
            float a1 = (float)System.Math.Atan2(z1 - cz, x1 - cx);
            // Tangente do ângulo crescente em P0; escolhe o ramo que sai por +facing.
            float tx = -(float)System.Math.Sin(a0), tz = (float)System.Math.Cos(a0);
            float dA = a1 - a0;
            while (dA > System.Math.PI) dA -= 2f * (float)System.Math.PI;
            while (dA <= -System.Math.PI) dA += 2f * (float)System.Math.PI;
            float sweep;
            if (tx * fx + tz * fz > 0) sweep = dA <= 0 ? dA + 2f * (float)System.Math.PI : dA;
            else sweep = dA > 0 ? dA - 2f * (float)System.Math.PI : dA;
            float len = System.Math.Abs(r * sweep);
            // Curva fechada adensa: giro forte com passo largo faz cada peça cair
            // fora do cone da próxima e a onda morre. Raio < 1,2 m comprime o passo
            // (mín. 60%, acima do piso 0,22): giro curto gasta poucas peças extras;
            // reta não muda.
            float density = (float)System.Math.Max(0.60, System.Math.Min(1.0, System.Math.Abs(r) / 1.2));
            int n2 = System.Math.Max(1, (int)System.Math.Round(len / (spacing * density)));
            float dir = sweep >= 0 ? 1f : -1f;
            float rabs = System.Math.Abs(r); // ângulos já codificam a geometria
            for (int i = 0; i <= n2 && pts.Count < maxPoints; i++)
            {
                float a = a0 + sweep * (i / (float)n2);
                float wx = cx + rabs * (float)System.Math.Cos(a);
                float wz = cz + rabs * (float)System.Math.Sin(a);
                float gx = -(float)System.Math.Sin(a) * dir, gz = (float)System.Math.Cos(a) * dir;
                pts.Add((Snap(ToGrid(wx), fine), Snap(ToGrid(wz), fine), DegFromTangent(gx, gz)));
            }
            var outPts = Dedup(pts);
            // Garante o início exato com a rotação do jogador.
            if (outPts.Count > 0) outPts[0] = (gx0, gz0, WrapDeg(deg0));
            return outPts;
        }

        static List<(int gx, int gz, float deg)> Dedup(List<(int gx, int gz, float deg)> pts)
        {
            var outPts = new List<(int gx, int gz, float deg)>(pts.Count);
            foreach (var p in pts)
                if (outPts.Count == 0 || outPts[^1].gx != p.gx || outPts[^1].gz != p.gz)
                    outPts.Add(p);
            return outPts;
        }

        public bool TryPlace(PieceId piece, int gx, int gz, float deg, bool locked, out int id)
        {
            id = 0;
            if (HandCount(piece) <= 0) return false;
            if (FindAt(gx, gz) >= 0) return false;
            id = _nextId++;
            var p = new Placement { InstanceId = id, Piece = piece, Gx = gx, Gz = gz, Deg = WrapDeg(deg), Locked = locked };
            _items.Add(p);
            _hand[piece]--;
            _undo.Push(new PlaceAct(p));
            return true;
        }

        public bool TryRemove(int id)
        {
            int i = _items.FindIndex(p => p.InstanceId == id);
            if (i < 0 || _items[i].Locked) return false;
            var p = _items[i];
            _items.RemoveAt(i);
            _hand[p.Piece] = HandCount(p.Piece) + 1;
            _undo.Push(new RemoveAct(p));
            return true;
        }

        public int FindAt(int gx, int gz) => _items.FindIndex(p => p.Gx == gx && p.Gz == gz);

        // Troca de fase: limpa layout e desfazer (ids seguem únicos).
        public void Clear()
        {
            _items.Clear();
            _undo.Clear();
        }

        // Peça do cenário (Peça Zero): entra no layout sem gastar a mão e sem desfazer.
        public int PlaceLocked(PieceId piece, int gx, int gz, float deg)
        {
            int id = _nextId++;
            _items.Add(new Placement { InstanceId = id, Piece = piece, Gx = gx, Gz = gz, Deg = WrapDeg(deg), Locked = true });
            return id;
        }

        public bool Undo()
        {
            if (_undo.Count == 0) return false;
            var a = _undo.Pop();
            a.Undo(this);
            return true;
        }

        interface IUndoAction { void Undo(PlanningData d); }

        sealed class PlaceAct : IUndoAction
        {
            readonly Placement _p;
            public PlaceAct(Placement p) => _p = p;
            public void Undo(PlanningData d)
            {
                d._items.RemoveAll(x => x.InstanceId == _p.InstanceId);
                d._hand[_p.Piece] = d.HandCount(_p.Piece) + 1;
            }
        }

        sealed class RemoveAct : IUndoAction
        {
            readonly Placement _p;
            public RemoveAct(Placement p) => _p = p;
            public void Undo(PlanningData d)
            {
                d._items.Add(_p);
                d._hand[_p.Piece] = d.HandCount(_p.Piece) - 1;
            }
        }

        sealed class BatchAct : IUndoAction
        {
            readonly List<IUndoAction> _acts;
            public BatchAct(List<IUndoAction> acts) => _acts = acts;
            public void Undo(PlanningData d)
            {
                for (int i = _acts.Count - 1; i >= 0; i--) _acts[i].Undo(d);
            }
        }
    }
}
