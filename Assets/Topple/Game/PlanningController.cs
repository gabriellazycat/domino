// T3: planejamento — colocação em grade, fantasma verde/vermelho, traçar linha,
// desfazer/refazer, bandeja e disparo (GDD §4.1/§14.4/§14.6). API pública de
// comandos de jogador (Select/Place/Fire) usada pelo PlanningBot e pelos testes.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using Topple.Core;
using Topple.Sim;

namespace Topple.Game
{
    public sealed class PlanningController : MonoBehaviour
    {
        public const float GroundY = 0f;

        public readonly PlanningData Data = new();
        public PieceId Selected = PieceId.Common;
        public float RotDeg = 90f; // fileira ao longo de +X
        public bool Active = true;

        // Pontos proibidos (mundo): sobre inimigos/obstáculos (GDD §4.1).
        // Soldados: proibição rot-aware (só sobreposição real de repouso); o
        // alcance de queda (~0,40) continua maior → kill frontal possível.
        // Blocos: círculos conservadores. Raios viram dados na T5.
        public struct ForbiddenZone { public Vector3 C; public float R; }
        public List<ForbiddenZone> Forbidden = new();
        // Corredores de patrulha proibidos (segmentos + margem): construir na rota
        // faz o patrulheiro passar por cima das peças.
        public List<(Vector3 a, Vector3 b)> PatrolSegs = new();
        const float PatrolMargin = 0.45f;
        public List<EnemySpot> Soldiers = new();
        // Raio de exclusão por tipo (base Ø0,50 soldado; Ø0,70 pesadão).
        public static float EnemyRadius(Topple.Core.EnemyKind kind)
            => kind == Topple.Core.EnemyKind.Brute ? 0.35f : 0.25f;
        public const float PathSpacing = 0.38f; // passo da cascata golden (T1):
        // 0,35 grudava em escada (lean-lock), 0,40 caía em cima prendendo
        // (drape-pin). 0,38 propaga com cadência ~19 passos/peça (prova).
        // Alcance da queda por peça (topo que alcança + margem): vãos maiores
        // quebram a onda. Torre cobre ~1,0 m; demais, ~0,45 m.
        public static float WaveReach(PieceId piece) => piece switch
        {
            PieceId.Big => 0.60f,
            PieceId.Tower => 1.00f,
            _ => 0.45f,
        };

        // Meia-extensão da peça na direção dir (mundo), conforme a rotação.
        public static float PieceExtent(PieceId piece, float deg, Vector2 dir)
        {
            float hx = 0.20f, hz = 0.06f; // comum/padrão: meio de 0,40/0,12 (metade da bifurcação é comum)
            if (piece == PieceId.Heavy) { hx = 0.225f; hz = 0.10f; }
            else if (piece == PieceId.Ramp) { hx = 0.30f; hz = 0.20f; }
            else if (piece == PieceId.Big) { hx = 0.30f; hz = 0.08f; }
            else if (piece == PieceId.Tower) { hx = 0.15f; hz = 0.05f; }
            float r = deg * Mathf.Deg2Rad;
            var lx = new Vector2(Mathf.Cos(r), -Mathf.Sin(r));
            var lz = new Vector2(Mathf.Sin(r), Mathf.Cos(r));
            return hx * Mathf.Abs(lx.x * dir.x + lx.y * dir.y)
                 + hz * Mathf.Abs(lz.x * dir.x + lz.y * dir.y);
        }

        public static bool OverlapsSoldier(float wx, float wz, PieceId piece, float deg, EnemySpot spot)
        {
            var d = new Vector2(spot.Pos.x - wx, spot.Pos.z - wz);
            float dist = d.magnitude;
            if (dist < 1e-5f) return true;
            d /= dist;
            return dist < PieceExtent(piece, deg, d) + EnemyRadius(spot.Kind) + 0.02f;
        }

        public bool IsValidCell(int gx, int gz, PieceId piece, float deg)
        {
            if (Data.HandCount(piece) <= 0 || Data.FindAt(gx, gz) >= 0) return false;
            // Bifurcação valida as 2 metades (recursão em comum, termina).
            if (piece == PieceId.Fork)
            {
                var (ax, az, bx, bz) = PlanningData.ForkHalves(gx, gz, deg);
                if (Data.FindAt(ax, az) >= 0 || Data.FindAt(bx, bz) >= 0) return false;
                return IsValidCell(ax, az, PieceId.Common, deg) && IsValidCell(bx, bz, PieceId.Common, deg);
            }
            float wx = PlanningData.ToWorld(gx), wz = PlanningData.ToWorld(gz);
            foreach (var f in Forbidden)
            {
                float dx = wx - f.C.x, dz = wz - f.C.z;
                if (dx * dx + dz * dz < f.R * f.R) return false;
            }
            foreach (var sg in PatrolSegs)
            {
                float dx = sg.b.x - sg.a.x, dz = sg.b.z - sg.a.z;
                float len2 = dx * dx + dz * dz;
                float t = len2 < 1e-6f ? 0f : Mathf.Clamp(((wx - sg.a.x) * dx + (wz - sg.a.z) * dz) / len2, 0f, 1f);
                float px = sg.a.x + dx * t - wx, pz = sg.a.z + dz * t - wz;
                if (px * px + pz * pz < PatrolMargin * PatrolMargin) return false;
            }
            foreach (var s in Soldiers)
                if (OverlapsSoldier(wx, wz, piece, deg, s)) return false;
            return true;
        }

        // ---- Trilha inteligente (arco com preview fantasma) ----
        public bool PathArmed { get; private set; }
        public bool PathSelecting => PathArmed && _pathStarted;
        public string Hint { get; private set; }
        public Vector3 GhostWorldPos { get; private set; }
        bool _pathStarted;
        bool _anchored; // início é peça existente (posição+rotação dela, sem custo)
        int _anchorId; // InstanceId da âncora (0 = raiz fresca)
        int _pathSx, _pathSz;
        float _pathRot;
        readonly List<GameObject> _pathGhosts = new();
        int _pathHoverKey = int.MinValue;
        // Desenho com arrasto: pressão+movimento estica, soltura confirma.
        bool _lmbDown, _lmbStartedAtPress, _pressOnUI;
        const float DrawDragPx = 8f;

        public event Action OnChanged;
        public event Action<List<Placement>> OnFire;
        public event Action OnConfirm; // Enter fora do planejamento (banner)
        public event Action OnReload; // Ctrl+Y ou botão Recarregar: fase toda do zero

        // HUD (irmã, no filho "HUD"): usada p/ ignorar cliques na UI.
        // Resolvida pelo TutorialSetup; fallback p/ cena salva.
        public Topple.UI.PlanningHUD Hud;
        // Som de interface (colocar/remover/desfazer). Opcional (null-safe).
        public AudioManager Audio;

        // Raiz obrigatória no trigger (corrente obrigatória, pedido do dono):
        // com tabuleiro vazio a 1ª trilha SÓ nasce no trigger fixo da fase.
        // Sem isso bastava começar do lado do inimigo e 1 peça vencia a fase.
        // Distância trigger→inimigos > 1,2 m (trava de prova) = peça única
        // nunca alcança (torre, a mais longa, cobre 1,0 m).
        public Vector2 TriggerPos;
        public bool HasTrigger;

        // Mira assistida: clique inicial até 0,25 m de uma peça ancora nela.
        // Raiz no trigger usa a mesma tolerância (clicar PERTO do trigger vale).
        public const float AnchorSnapM = 0.25f;

        PlanningInput _in;
        Camera _cam;
        readonly Dictionary<int, GameObject> _views = new();
        GameObject _ghost;
        Material _ghostOk, _ghostBad;
        // Botão direito: clique remove, arrasto orbita a câmera (limiar em px).
        bool _rmbDown;
        Vector2 _rmbDownScreen;
        const float RmbDragPx = 8f;

        void Awake()
        {
            _in = GetComponent<PlanningInput>();
            if (_in == null) _in = gameObject.AddComponent<PlanningInput>();
            _cam = Camera.main;
            var ok = new Material(Shader.Find("Sprites/Default")) { color = new Color(0.3f, 1f, 0.4f, 0.5f) };
            var bad = new Material(Shader.Find("Sprites/Default")) { color = new Color(1f, 0.3f, 0.3f, 0.5f) };
            _ghostOk = ok; _ghostBad = bad;
        }

        void OnDestroy()
        {
            Destroy(_ghost);
            Destroy(_ghostOk);
            Destroy(_ghostBad);
        }

        // ---- Comandos de jogador (bot e testes usam SÓ estes + Fire) ----
        public void Select(PieceId piece) { Selected = piece; RefreshGhost(); OnChanged?.Invoke(); }
        public void SetRot(int step) { RotDeg = step * PlanningData.StepDeg; RefreshGhost(); OnChanged?.Invoke(); }
        public void SetRotDeg(float deg) { RotDeg = PlanningData.WrapDeg(deg); RefreshGhost(); OnChanged?.Invoke(); }

        public bool Place(int gx, int gz)
        {
            if (!Active || !IsValidCell(gx, gz, Selected, RotDeg)) return false;
            bool ok = Data.TryPlace(Selected, gx, gz, RotDeg, false, out _);
            if (ok) { Rebuild(); OnChanged?.Invoke(); }
            return ok;
        }

        public bool RemoveAt(int id)
        {
            if (!Active) return false;
            bool ok = Data.TryRemove(id);
            if (ok) { Rebuild(); OnChanged?.Invoke(); if (Audio != null) Audio.UiClick(); }
            return ok;
        }

        // X: remove a última peça criada (a mais nova), onde quer que esteja.
        public bool RemoveLast()
        {
            if (!Active || Data.Count == 0) return false;
            int id = 0, best = int.MinValue;
            foreach (var p in Data.Items)
                if (!p.Locked && p.InstanceId > best) { best = p.InstanceId; id = p.InstanceId; }
            if (id == 0) return false;
            return RemoveAt(id);
        }

        public bool Undo() { bool ok = Active && Data.Undo(); if (ok) { Rebuild(); OnChanged?.Invoke(); if (Audio != null) Audio.UiClick(); } return ok; }

        public void Fire()
        {
            if (!Active || Data.Count == 0) return;
            Active = false;
            CancelPathSilent();
            Hint = null;
            if (_ghost != null) _ghost.SetActive(false);
            OnFire?.Invoke(new List<Placement>(Data.Items));
        }

        // Trilha sempre ligada: chama no LoadPhase e no retry. Esc só cancela
        // a seleção atual (volta a pedir o início), nunca desliga.
        public void ArmPathDefault()
        {
            PathArmed = true;
            _pathStarted = false;
            _anchored = false;
            _anchorId = 0;
            ClearPathGhosts();
            _pathHoverKey = int.MinValue;
            Hint = "Trilha: clique o início ou uma peça p/ continuar";
            if (_ghost != null) _ghost.SetActive(false);
            OnChanged?.Invoke();
        }

        public void CancelPathSilent()
        {
            PathArmed = false;
            _pathStarted = false;
            _anchored = false;
            _anchorId = 0;
            ClearPathGhosts();
            if (_ghost != null && Active) _ghost.SetActive(true);
            Hint = null;
            OnChanged?.Invoke();
        }

        void ClearPathGhosts()
        {
            foreach (var g in _pathGhosts) if (g != null) Destroy(g);
            _pathGhosts.Clear();
            _pathHoverKey = int.MinValue;
        }

        // Mira assistida: peça existente mais próxima do ponto (mundo), até 0,25 m.
        // -1 = chão livre. Metades da bifurcação são cabeças próprias: a mira
        // pega a metade mais próxima (1 ponto p/ continuar em cada peça).
        public int AnchorIndexAt(float wx, float wz)
        {
            int best = -1;
            float bestD = AnchorSnapM;
            for (int i = 0; i < Data.Items.Count; i++)
            {
                float dx = PlanningData.ToWorld(Data.Items[i].Gx) - wx;
                float dz = PlanningData.ToWorld(Data.Items[i].Gz) - wz;
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d <= bestD) { bestD = d; best = i; }
            }
            return best;
        }

        // Início da trilha — regra da cabeça (deckbuilder): tabuleiro vazio = chão
        // livre; com peças, SÓ cabeça (cada metade da bifurcação é cabeça
        // própria: 2 pontos p/ continuar, 1 em cada peça). Chão
        // longe de cabeça = recusado ("continue da última peça!"). Em peça =
        // ancora (posição+rotação dela, sem custo); no chão = início fresco.
        // Retorna false se recusado (nada selecionado).
        public bool BeginPathAt(int gx, int gz, float wx, float wz)
        {
            int anchor = AnchorIndexAt(wx, wz);
            if (Data.Count == 0 && HasTrigger)
            {
                // Tabuleiro vazio: só o trigger (sem peça p/ ancorar, anchor<0).
                float tdx = PlanningData.ToWorld(gx) - TriggerPos.x;
                float tdz = PlanningData.ToWorld(gz) - TriggerPos.y;
                if (Mathf.Sqrt(tdx * tdx + tdz * tdz) > AnchorSnapM)
                {
                    Hint = "Comece no trigger!";
                    OnChanged?.Invoke();
                    return false;
                }
            }
            if (Data.Count > 0)
            {
                if (anchor < 0)
                {
                    Hint = "Continue da última peça!";
                    OnChanged?.Invoke();
                    return false;
                }
                var cand = Data.Items[anchor];
                if (!Data.IsHead(cand.InstanceId))
                {
                    Hint = "Só da última peça!";
                    OnChanged?.Invoke();
                    return false;
                }
            }
            _pathStarted = true;
            _pathHoverKey = int.MinValue;
            ClearPathGhosts();
            if (anchor >= 0)
            {
                var a = Data.Items[anchor];
                _anchored = true;
                _anchorId = a.InstanceId;
                _pathSx = a.Gx; _pathSz = a.Gz; _pathRot = a.Deg;
                Hint = "Trilha: clique o destino (continua da peça)";
            }
            else
            {
                _anchored = false;
                _anchorId = 0;
                _pathSx = gx; _pathSz = gz; _pathRot = RotDeg;
                Hint = "Trilha: clique o destino";
            }
            if (_ghost != null) _ghost.SetActive(false);
            OnChanged?.Invoke();
            return true;
        }

        // Desfaz só a seleção atual (Esc): volta a pedir o início, nada some.
        public void CancelSelection()
        {
            _pathStarted = false;
            _anchored = false;
            _anchorId = 0;
            ClearPathGhosts();
            _pathHoverKey = int.MinValue;
            Hint = "Trilha: clique o início ou uma peça p/ continuar";
            OnChanged?.Invoke();
        }

        // Caminho do início atual até (gx,gz): filtra bloqueadas, mantém rotação da curva.
        // Chão vazio = reta (forceStraight); âncora em peça = arco tangente.
        // Snap fino (0,05): curvas exigem suavidade; snap normal quebra o alinhamento.
        List<(int gx, int gz, float deg)> CurrentPath(int gx, int gz)
        {
            var raw = PlanningData.ArcPath(_pathSx, _pathSz, _pathRot, gx, gz, PathSpacing, true, !_anchored);
            var outPts = new List<(int gx, int gz, float deg)>(raw.Count);
            foreach (var p in raw)
            {
                if (!IsValidCell(p.gx, p.gz, Selected, p.deg)) continue;
                // Anti-interseção com o tabuleiro: ponto em cima de peça existente
                // nasce grudado e trava (nem o início escapa — colocar ali é
                // impossível de todo jeito, o TryPlace recusaria).
                if (CrowdsExisting(p.gx, p.gz, p.deg)) continue;
                outPts.Add(p);
            }
            FillGaps(outPts);
            PlanningData.DropCrowded(outPts, Selected);
            FillGaps(outPts); // de novo: o drop pode ter aberto vão (0,7 m mata a onda)
            return outPts;
        }

        // Intersecta peça existente? (só anti-interseção, p/ não quebrar a emenda)
        // Bifurcação testa as 2 metades (deg do ponto, não o RotDeg global).
        bool CrowdsExisting(int gx, int gz, float deg)
        {
            if (Selected == PieceId.Fork)
            {
                var (ax, az, bx, bz) = PlanningData.ForkHalves(gx, gz, deg);
                return CrowdsAt(ax, az) || CrowdsAt(bx, bz);
            }
            return CrowdsAt(gx, gz);
        }

        bool CrowdsAt(int gx, int gz)
        {
            float wx = PlanningData.ToWorld(gx), wz = PlanningData.ToWorld(gz);
            float min = PlanningData.IntersectGap(Selected);
            foreach (var p in Data.Items)
            {
                float dx = PlanningData.ToWorld(p.Gx) - wx;
                float dz = PlanningData.ToWorld(p.Gz) - wz;
                if (System.Math.Sqrt(dx * dx + dz * dz) < min) return true;
            }
            return false;
        }

        // Pontos filtrados (cela ocupada/proibida) abrem vãos onde a onda morre.
        // Costura o maior vão com o ponto médio válido (até 3 passadas): a trilha
        // entrega a cadeia mais densa possível com a mão atual — nunca um buraco
        // evitável. O ponto médio também respeita o piso (FallRoom) e a
        // anti-interseção — remendo grudado travaria igual. Vão sem ponto médio
        // válido vira aviso no commit, não silêncio.
        void FillGaps(List<(int gx, int gz, float deg)> pts)
        {
            float room = PlanningData.FallRoom(Selected);
            float reach = WaveReach(Selected);
            for (int pass = 0; pass < 3; pass++)
            {
                bool added = false;
                for (int i = 0; i + 1 < pts.Count; i++)
                {
                    float ax = PlanningData.ToWorld(pts[i].gx), az = PlanningData.ToWorld(pts[i].gz);
                    float bx = PlanningData.ToWorld(pts[i + 1].gx), bz = PlanningData.ToWorld(pts[i + 1].gz);
                    float dx = bx - ax, dz = bz - az;
                    if (Mathf.Sqrt(dx * dx + dz * dz) <= reach) continue;
                    int mx = PlanningData.Snap(PlanningData.ToGrid((ax + bx) * 0.5f), true);
                    int mz = PlanningData.Snap(PlanningData.ToGrid((az + bz) * 0.5f), true);
                    if ((mx == pts[i].gx && mz == pts[i].gz) || (mx == pts[i + 1].gx && mz == pts[i + 1].gz)) continue;
                    float mdeg = PlanningData.DegFromTangent(dx, dz);
                    if (!IsValidCell(mx, mz, Selected, mdeg)) continue;
                    if (CrowdsExisting(mx, mz, mdeg)) continue;
                    float d1 = Mathf.Sqrt((PlanningData.ToWorld(mx) - ax) * (PlanningData.ToWorld(mx) - ax) + (PlanningData.ToWorld(mz) - az) * (PlanningData.ToWorld(mz) - az));
                    float d2 = Mathf.Sqrt((bx - PlanningData.ToWorld(mx)) * (bx - PlanningData.ToWorld(mx)) + (bz - PlanningData.ToWorld(mz)) * (bz - PlanningData.ToWorld(mz)));
                    if (d1 < room || d2 < room) continue; // não cabe sem grudar
                    pts.Insert(i + 1, (mx, mz, mdeg));
                    added = true;
                    i++;
                }
                if (!added) break;
            }
        }

        static float MaxGapM(List<(int gx, int gz, float deg)> pts)
        {
            float max = 0f;
            for (int i = 0; i + 1 < pts.Count; i++)
            {
                float dx = PlanningData.ToWorld(pts[i + 1].gx) - PlanningData.ToWorld(pts[i].gx);
                float dz = PlanningData.ToWorld(pts[i + 1].gz) - PlanningData.ToWorld(pts[i].gz);
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > max) max = d;
            }
            return max;
        }

        void ShowPathPreview(List<(int gx, int gz, float deg)> pts)
        {
            ClearPathGhosts();
            bool affordable = pts.Count <= Data.HandCount(Selected);
            var mat = affordable ? _ghostOk : _ghostBad;
            // Bifurcação prevê o PAR (2 fantasmas por ponto).
            var bodies = new List<(int gx, int gz, float deg)>();
            if (Selected == PieceId.Fork)
                foreach (var p in pts)
                {
                    var (ax, az, bx, bz) = PlanningData.ForkHalves(p.gx, p.gz, p.deg);
                    bodies.Add((ax, az, p.deg));
                    bodies.Add((bx, bz, p.deg));
                }
            else bodies.AddRange(pts);
            int cap = Math.Min(bodies.Count, 40);
            for (int i = 0; i < cap; i++)
            {
                var go = SpawnView(new Placement { Piece = Selected, Gx = bodies[i].gx, Gz = bodies[i].gz, Deg = bodies[i].deg }, true);
                if (go == null) continue;
                foreach (var r in go.GetComponentsInChildren<Renderer>())
                {
                    var mats = new Material[r.materials.Length];
                    Array.Fill(mats, mat);
                    r.materials = mats;
                }
                _pathGhosts.Add(go);
            }
            Hint = affordable ? $"Trilha: {bodies.Count} peças — clique o destino"
                              : $"Trilha: {bodies.Count} peças, tem {Data.HandCount(Selected)}";
            OnChanged?.Invoke();
        }

        // Fantasma sempre visível antes do início (verde/vermelho): o jogador vê
        // onde nasce e se a célula vale — entende o snap sem explicação.
        void UpdateHoverGhost(int gx, int gz, Vector3 world)
        {
            if (_ghost == null) return;
            int key = (gx << 16) ^ (gz & 0xFFFF);
            if (key == _pathHoverKey) return;
            _pathHoverKey = key;
            _ghost.SetActive(true);
            int anchor = AnchorIndexAt(world.x, world.z);
            if (anchor >= 0)
            {
                var a = Data.Items[anchor];
                _ghost.transform.position = new Vector3(PlanningData.ToWorld(a.Gx), GroundY, PlanningData.ToWorld(a.Gz));
                _ghost.transform.rotation = Quaternion.Euler(0, a.Deg, 0);
                SetGhostValid(true);
                Hint = "Trilha: clique p/ continuar daqui";
            }
            else
            {
                _ghost.transform.position = new Vector3(PlanningData.ToWorld(gx), GroundY, PlanningData.ToWorld(gz));
                _ghost.transform.rotation = Quaternion.Euler(0, RotDeg, 0);
                bool ok = Data.HandCount(Selected) > 0 && IsValidCell(gx, gz, Selected, RotDeg) && !CrowdsExisting(gx, gz, RotDeg);
                SetGhostValid(ok);
                if (Data.HandCount(Selected) <= 0) Hint = "Sem peças — Recarregar (Ctrl+Y)";
                else if (!ok) Hint = "Célula bloqueada";
                else Hint = "Trilha: clique o início ou uma peça p/ continuar";
            }
            OnChanged?.Invoke();
        }

        // 2º clique da trilha (ou soltura do arrasto): commita o caminho atual.
        // Comando de jogador como Select/Place/Fire (bots e testes usam).
        // Bifurcação: 1 carta por ponto, par de metades por ponto, encadeando
        // pela linha B — cada metade A fica cabeça (ramo a continuar).
        public void CommitPath(int gx, int gz)
        {
            var pts = CurrentPath(gx, gz);
            if (pts.Count > Data.HandCount(Selected))
            {
                Hint = $"Faltam {pts.Count - Data.HandCount(Selected)} peças (tem {Data.HandCount(Selected)})";
                OnChanged?.Invoke();
                return;
            }
            int n;
            if (Selected == PieceId.Fork)
            {
                n = 0;
                int parent = _anchored ? _anchorId : 0;
                foreach (var pt in pts)
                {
                    if (Data.HandCount(PieceId.Fork) <= 0) break;
                    if (Data.TryPlaceFork(pt.gx, pt.gz, pt.deg, parent) != 2) break;
                    n += 2;
                    parent = Data.Items[Data.Count - 1].InstanceId; // metade B
                }
            }
            else n = Data.TryPlacePath(Selected, pts, _anchored ? _anchorId : 0);
            Hint = null;
            // Trilha sempre ligada: limpa o traço mas rearma p/ próxima trilha.
            PathArmed = true;
            _pathStarted = false;
            _anchored = false;
            _anchorId = 0;
            ClearPathGhosts();
            _pathHoverKey = int.MinValue;
            if (_ghost != null && Active) _ghost.SetActive(false);
            float gap = MaxGapM(pts);
            float reach = WaveReach(Selected);
            Hint = gap > reach
                ? $"Trilha: clique o início ou uma peça (vão de {gap:F2} m — a onda pode parar aí)"
                : "Trilha: clique o início ou uma peça p/ continuar";
            if (n > 0) { Rebuild(); OnChanged?.Invoke(); if (Audio != null) Audio.UiClick(); }
        }

        public void SetVisualsActive(bool on)
        {
            foreach (var kv in _views) if (kv.Value != null) kv.Value.SetActive(on);
            if (_ghost != null) _ghost.SetActive(on && Active);
        }

        // ---- Cena ----
        public void Rebuild()
        {
            foreach (var kv in _views) if (kv.Value != null) Destroy(kv.Value);
            _views.Clear();
            foreach (var p in Data.Items) _views[p.InstanceId] = SpawnView(p, false);
            RefreshGhost();
        }

        // Peças de planejamento sob um container (limpeza no load da cena).
        public Transform GetViewRoot()
        {
            var t = transform.Find("Views");
            if (t != null) return t;
            var go = new GameObject("Views");
            go.transform.SetParent(transform, false);
            return go.transform;
        }

        GameObject SpawnView(Placement p, bool ghost)
        {
            var prefab = PrefabRegistry.Piece(p.Piece);
            if (prefab == null) return null;
            var go = Instantiate(prefab, GetViewRoot());
            go.transform.SetPositionAndRotation(
                new Vector3(PlanningData.ToWorld(p.Gx), GroundY, PlanningData.ToWorld(p.Gz)),
                Quaternion.Euler(0, p.Deg, 0));
            var rb = go.GetComponent<Rigidbody>();
            if (rb != null) rb.isKinematic = true; // planejamento: sem física
            if (ghost)
                foreach (var r in go.GetComponentsInChildren<Renderer>())
                {
                    var mats = new Material[r.materials.Length];
                    Array.Fill(mats, _ghostOk);
                    r.materials = mats;
                }
            return go;
        }

        void RefreshGhost()
        {
            if (_ghost != null) Destroy(_ghost);
            if (!Active) return;
            var prefab = PrefabRegistry.Piece(Selected);
            if (prefab == null) return;
            _ghost = SpawnView(new Placement { Piece = Selected, Deg = RotDeg }, true);
        }

        void SetGhostValid(bool valid)
        {
            if (_ghost == null) return;
            var m = valid ? _ghostOk : _ghostBad;
            foreach (var r in _ghost.GetComponentsInChildren<Renderer>())
            {
                var mats = new Material[r.materials.Length];
                Array.Fill(mats, m);
                r.materials = mats;
            }
        }

        bool MouseCell(out int gx, out int gz, out Vector3 world)
        {
            gx = gz = 0; world = Vector3.zero;
            if (_cam == null) return false;
            var ray = _cam.ScreenPointToRay(_in.MousePos);
            if (Mathf.Abs(ray.direction.y) < 1e-5f) return false;
            float t = (GroundY - ray.origin.y) / ray.direction.y;
            if (t < 0) return false;
            world = ray.origin + ray.direction * t;
            bool fine = _in.AltDown;
            gx = PlanningData.Snap(PlanningData.ToGrid(world.x), fine);
            gz = PlanningData.Snap(PlanningData.ToGrid(world.z), fine);
            return true;
        }

        bool OverUI()
        {
            // Controles da HUD capturam o clique (fundo tem pickingMode ignorado).
            // A HUD mora no filho "HUD", não neste objeto: GetComponent nunca acha.
            var hud = Hud;
            if (hud == null) hud = GetComponentInChildren<Topple.UI.PlanningHUD>();
            if (hud != null)
            {
                var el = hud.Pick(_in.MousePos);
                if (el != null) return true;
            }
            return false;
        }

        // Botão direito: true se o gesto atual é arrasto (orbita câmera, não remove).
        bool RmbDragging()
        {
            if (!_rmbDown) return false;
            return (_in.MousePos - _rmbDownScreen).magnitude >= RmbDragPx;
        }

        void Update()
        {
            if (!Active)
            {
                // Fora do planejamento o Enter confirma o banner (via evento;
                // sem Keyboard.current direto, que falha em alguns contextos).
                if (_in != null && _in.FireAction.WasPressedThisFrame()) OnConfirm?.Invoke();
                if (_in != null && _in.ReloadPressed()) OnReload?.Invoke();
                return;
            }
            if (_cam == null) _cam = Camera.main;

            var kb = Keyboard.current;
            // Esc desfaz a seleção atual da trilha (volta a pedir o início);
            // a trilha continua ligada (pedido do dono).
            // Linha removida (P1): L/Shift sem chamada.
            // Trilha sempre ligada (P removido: sem toggle).
            if (kb != null && kb.escapeKey.wasPressedThisFrame && _pathStarted) { CancelSelection(); return; }
            if (_in.RotLeft.WasPressedThisFrame()) SetRotDeg(RotDeg - PlanningData.StepDeg);
            if (_in.RotRight.WasPressedThisFrame()) SetRotDeg(RotDeg + PlanningData.StepDeg);
            if (_in.UndoPressed()) Undo();
            if (_in.ReloadPressed()) { OnReload?.Invoke(); return; }
            if (_in.RemoveLastPressed()) { RemoveLast(); return; }
            if (_in.FireAction.WasPressedThisFrame()) { Fire(); return; }

            if (!MouseCell(out int gx, out int gz, out Vector3 world))
            {
                if (_ghost != null) _ghost.SetActive(false);
                return;
            }
            GhostWorldPos = new Vector3(PlanningData.ToWorld(gx), GroundY, PlanningData.ToWorld(gz));

            // ---- Modo trilha: clique-clique ou apertar-arrastar-soltar.
            // Clique seco = waypoint (início, depois destino); arrasto desenha o
            // caminho com preview ao vivo e a soltura confirma. Press na UI anula.
            if (PathArmed)
            {
                if (_pathStarted)
                {
                    if (_ghost != null) _ghost.SetActive(false);
                    int key = (gx << 16) ^ (gz & 0xFFFF);
                    if (key != _pathHoverKey)
                    {
                        _pathHoverKey = key;
                        ShowPathPreview(CurrentPath(gx, gz));
                    }
                }
                else UpdateHoverGhost(gx, gz, world);
                if (_in.PlaceAction.WasPressedThisFrame())
                {
                    if (OverUI()) { _lmbDown = false; _pressOnUI = true; }
                    else
                    {
                        _lmbDown = true; _pressOnUI = false;
                        _lmbStartedAtPress = _pathStarted;
                        if (!_pathStarted) BeginPathAt(gx, gz, world.x, world.z);
                    }
                }
                if (_in.PlaceAction.WasReleasedThisFrame() && _lmbDown)
                {
                    _lmbDown = false;
                    // 2º clique confirma; no 1º, só confirma se arrastou p/ outra célula.
                    bool moved = (gx != _pathSx || gz != _pathSz);
                    if (!_pressOnUI && !OverUI() && _pathStarted && (_lmbStartedAtPress || moved))
                        CommitPath(gx, gz);
                }
                // Botão direito: clique remove a peça; arrasto orbita a câmera
                // (CameraController) e não remove. Press sobre UI é ignorado.
                if (_in.RemoveAction.WasPressedThisFrame())
                {
                    if (OverUI()) { _rmbDown = false; }
                    else { _rmbDown = true; _rmbDownScreen = _in.MousePos; }
                }
                if (_in.RemoveAction.WasReleasedThisFrame() && _rmbDown)
                {
                    bool drag = RmbDragging();
                    _rmbDown = false;
                    if (!drag && !OverUI())
                    {
                        int idx = Data.FindAt(gx, gz);
                        if (idx >= 0 && !RemoveAt(Data.Items[idx].InstanceId))
                            Hint = "Tem continuação — remova da ponta!";
                    }
                }
                return;
            }
        }
    }
}
