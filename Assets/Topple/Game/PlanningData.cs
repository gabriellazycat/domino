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
            PieceId.Big => 0.30f,
            PieceId.Tower => 0.10f,
            _ => 0.12f, // Common, Fork (metade é comum), Runner, Blast, Giant
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
        // anchorParentId = âncora existente (0 = raiz fresca): a 1ª peça que
        // entrar registra esse pai; as seguintes encadeiam na anterior.
        public int TryPlacePath(PieceId piece, List<(int gx, int gz, float deg)> pts, int anchorParentId = 0)
        {
            int depth = _undo.Count, n = 0;
            int parent = anchorParentId;
            foreach (var (gx, gz, deg) in pts)
            {
                if (!TryPlace(piece, gx, gz, deg, false, out int id)) continue;
                n++;
                _parent[id] = parent;
                parent = id;
            }
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

        // Bifurcação de verdade (pedido do dono): 1 carta = 2 corpos comuns lado
        // a lado (cada metade tomba e continua a sua linha, como dominó real).
        // Metades a ±0,25 m da perpendicular (vão interno 0,10: a peça que chega
        // encosta nas duas de uma vez). Puro (sem UnityEngine).
        public static (int ax, int az, int bx, int bz) ForkHalves(int gx, int gz, float deg)
        {
            var (fx, fz) = FacingOf(deg);
            int ox = (int)System.Math.Round(-fz * 5f);
            int oz = (int)System.Math.Round(fx * 5f);
            if (ox == 0 && oz == 0) { ox = 0; oz = 5; } // nunca degenera
            return (gx + ox, gz + oz, gx - ox, gz - oz);
        }

        // Coloca o par da bifurcação (1 carta, 2 corpos irmãos com o mesmo pai).
        // Cada metade é cabeça própria (MaxChildren 1 p/ todos) = 2 pontos para
        // continuar, 1 em cada peça. Retorna 2 ou 0 (sem carta / cela ocupada).
        public int TryPlaceFork(int gx, int gz, float deg, int anchorParentId = 0)
        {
            if (HandCount(PieceId.Fork) <= 0) return 0;
            var (ax, az, bx, bz) = ForkHalves(gx, gz, deg);
            if (FindAt(ax, az) >= 0 || FindAt(bx, bz) >= 0) return 0;
            if ((ax == bx && az == bz)) return 0;
            int depth = _undo.Count;
            _hand[PieceId.Fork]--;
            int ida = _nextId++;
            var pa = new Placement { InstanceId = ida, Piece = PieceId.Fork, Gx = ax, Gz = az, Deg = WrapDeg(deg), Locked = false };
            _items.Add(pa);
            _undo.Push(new PlaceAct(pa));
            _parent[ida] = anchorParentId;
            int idb = _nextId++;
            var pb = new Placement { InstanceId = idb, Piece = PieceId.Fork, Gx = bx, Gz = bz, Deg = WrapDeg(deg), Locked = false };
            _items.Add(pb);
            _undo.Push(new PlaceAct(pb));
            _parent[idb] = anchorParentId;
            _twin[ida] = idb;
            _twin[idb] = ida;
            var acts = new List<IUndoAction>();
            while (_undo.Count > depth) acts.Add(_undo.Pop());
            acts.Reverse();
            _undo.Push(new BatchAct(acts));
            return 2;
        }

        public bool TryRemove(int id)
        {
            int i = _items.FindIndex(p => p.InstanceId == id);
            if (i < 0 || _items[i].Locked) return false;
            if (ChildrenCount(id) > 0) return false; // tem continuação: remova da ponta
            var p = _items[i];
            _items.RemoveAt(i);
            // Reembolso gêmeo: tirar 1 metade não devolve carta (a outra segue no
            // tabuleiro); tirar a última devolve 1. Sem isso 1 carta virava 2.
            int refunded = RefundFor(id, p.Piece);
            int twin = TwinOf(id);
            _hand[p.Piece] = HandCount(p.Piece) + refunded;
            _undo.Push(new RemoveAct(p, refunded, twin));
            ForgetTwin(id);
            PruneParents();
            return true;
        }

        public int FindAt(int gx, int gz) => _items.FindIndex(p => p.Gx == gx && p.Gz == gz);

        // Regra da cabeça (deckbuilder): continuação só a partir de cabeça
        // (peça sem filhos; cada metade da bifurcação é cabeça própria).
        // Filho registra o pai; undo por lote (LIFO) nunca deixa órfão.
        readonly Dictionary<int, int> _parent = new(); // filhoId -> paiId (0 = raiz)
        // Gêmeo do par da bifurcação (metadeId -> metadeId). Sem gêmeo = corpo único.
        readonly Dictionary<int, int> _twin = new();

        public int ParentOf(int id) => _parent.TryGetValue(id, out var p) ? p : 0;

        public int TwinOf(int id) => _twin.TryGetValue(id, out var t) ? t : 0;

        bool TwinOnBoard(int id)
        {
            int t = TwinOf(id);
            return t != 0 && FindId(t) >= 0;
        }

        int RefundFor(int id, PieceId piece)
        {
            if (piece == PieceId.Fork && TwinOnBoard(id)) return 0;
            return 1;
        }

        void ForgetTwin(int id)
        {
            int t = TwinOf(id);
            _twin.Remove(id);
            if (t != 0) _twin.Remove(t);
        }

        public int ChildrenCount(int id)
        {
            int n = 0;
            foreach (var kv in _parent) if (kv.Value == id) n++;
            return n;
        }

        public int MaxChildren(PieceId piece) => 1; // par da bifurcação: cada metade é cabeça própria (2 pontos p/ continuar)

        public bool IsHead(int id)
        {
            int i = _items.FindIndex(p => p.InstanceId == id);
            if (i < 0) return false;
            return ChildrenCount(id) < MaxChildren(_items[i].Piece);
        }

        void PruneParents()
        {
            List<int> dead = null;
            foreach (var id in _parent.Keys)
                if (FindId(id) < 0) (dead ??= new List<int>()).Add(id);
            if (dead != null) foreach (var id in dead) _parent.Remove(id);
            List<int> deadTwin = null;
            foreach (var id in _twin.Keys)
                if (FindId(id) < 0) (deadTwin ??= new List<int>()).Add(id);
            if (deadTwin != null) foreach (var id in deadTwin) _twin.Remove(id);
        }

        int FindId(int id) => _items.FindIndex(p => p.InstanceId == id);

        // Troca de fase: limpa layout, desfazer e parentesco (ids seguem únicos).
        public void Clear()
        {
            _items.Clear();
            _undo.Clear();
            _parent.Clear();
            _twin.Clear();
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
            PruneParents();
            return true;
        }

        interface IUndoAction { void Undo(PlanningData d); }

        sealed class PlaceAct : IUndoAction
        {
            readonly Placement _p;
            public PlaceAct(Placement p) => _p = p;
            public void Undo(PlanningData d)
            {
                // Desfazer em ordem reversa (BatchAct): a 2ª metade sai com
                // reembolso 0 (gêmea a bordo) e a 1ª com 1 — 1 carta no total.
                d._items.RemoveAll(x => x.InstanceId == _p.InstanceId);
                d._hand[_p.Piece] = d.HandCount(_p.Piece) + d.RefundFor(_p.InstanceId, _p.Piece);
                d.ForgetTwin(_p.InstanceId);
                d.PruneParents();
            }
        }

        sealed class RemoveAct : IUndoAction
        {
            readonly Placement _p;
            readonly int _refunded;
            readonly int _twin;
            public RemoveAct(Placement p, int refunded = 1, int twin = 0) { _p = p; _refunded = refunded; _twin = twin; }
            public void Undo(PlanningData d)
            {
                d._items.Add(_p);
                d._hand[_p.Piece] = d.HandCount(_p.Piece) - _refunded;
                if (_twin != 0 && d.FindId(_twin) >= 0)
                {
                    d._twin[_p.InstanceId] = _twin;
                    d._twin[_twin] = _p.InstanceId;
                }
                d.PruneParents();
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
