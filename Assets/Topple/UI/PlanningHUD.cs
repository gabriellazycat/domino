// T3: HUD mínimo do planejamento (GDD §14.1/§14.4): bandeja, DISPARAR, desfazer,
// recarregar, objetivo e banner de resultado. Nomes estáveis p/ bots (btn-fire, ...).
using System;
using UnityEngine;
using UnityEngine.UIElements;
using Topple.Core;

namespace Topple.UI
{
    public sealed class PlanningHUD : MonoBehaviour
    {
        public event Action<PieceId> OnSelect;
        public event Action OnFire;
        public event Action OnUndo;
        public event Action OnReload; // botão Recarregar: fase toda do zero
        public event Action OnAgain;
        public event Action OnNext;
        public event Action OnSkip; // Pular fase (cheat de teste): avança sem dano/draft

        public event Action OnLastRemove; // botão Última [X]

        UIDocument _doc;
        Button _btnFire, _btnUndo, _btnRedo, _btnLast, _btnAgain, _btnNext, _btnSkip;
        ScrollView _tray;
        VisualElement _bottomBar;
        readonly System.Collections.Generic.Dictionary<PieceId, Button> _trayBtns = new();
        Label _lblObjective, _lblMsg, _lblResult, _lblCoach;
        VisualElement _banner;

        // Bandeja: cor, tecla e ordem por tipo (bandeja dinâmica mostra os
        // possuídos; zerado fica apagado/disabled, não some. 8 tipos jogáveis).
        static readonly (PieceId piece, string key, string name, Color color)[] TrayOrder = new[]
        {
            (PieceId.Common, "1", "Comum", new Color(0.66f, 0.47f, 0.30f)),
            (PieceId.Heavy, "2", "Pesada", new Color(0.54f, 0.56f, 0.59f)),
            (PieceId.Ramp, "3", "Rampa", new Color(0.66f, 0.35f, 0.07f)),
            (PieceId.Fork, "4", "Bifurcação", new Color(1.00f, 0.72f, 0.30f)),
            (PieceId.Big, "5", "Grande", new Color(0.85f, 0.92f, 1.00f)),
            (PieceId.Runner, "6", "Corrida", new Color(1.00f, 0.45f, 0.40f)),
            (PieceId.Blast, "7", "Explosiva", new Color(0.85f, 0.30f, 0.30f)),
            (PieceId.Tower, "8", "Torre", new Color(0.55f, 0.75f, 1.00f)),
        };

        public void Setup(UIDocument doc)
        {
            _doc = doc;
            var root = doc.rootVisualElement;
            _tray = root.Q<ScrollView>("tray");
            _bottomBar = root.Q<VisualElement>("bottom-bar");
            _btnFire = root.Q<Button>("btn-fire");
            _btnUndo = root.Q<Button>("btn-undo");
            _btnRedo = root.Q<Button>("btn-redo");
            _btnLast = root.Q<Button>("btn-last");
            _btnAgain = root.Q<Button>("btn-again");
            _btnNext = root.Q<Button>("btn-next");
            _btnSkip = root.Q<Button>("btn-skip");
            _lblObjective = root.Q<Label>("lbl-objective");
            _lblMsg = root.Q<Label>("lbl-msg");
            _lblCoach = root.Q<Label>("lbl-coach");
            _lblResult = root.Q<Label>("lbl-result");
            _banner = root.Q<VisualElement>("banner-result");
            if (_btnFire == null || _banner == null || _btnNext == null || _btnAgain == null || _tray == null)
                throw new Exception("[TOPPLE][UI] PlanningHUD.uxml incompleto.");
            _btnFire.clicked += () => OnFire?.Invoke();
            if (_btnUndo != null) _btnUndo.clicked += () => OnUndo?.Invoke();
            if (_btnRedo != null) _btnRedo.clicked += () => OnReload?.Invoke();
            if (_btnLast != null) _btnLast.clicked += () => OnLastRemove?.Invoke();
            if (_btnSkip != null) _btnSkip.clicked += () => { if (!_draftOpen) OnSkip?.Invoke(); };
            _btnAgain.clicked += () => { if (_draftOpen) _draftCb?.Invoke(0); else OnAgain?.Invoke(); };
            _btnNext.clicked += () => { if (_draftOpen) _draftCb?.Invoke(1); else OnNext?.Invoke(); };
            _againText = _btnAgain.text;
            _nextText = _btnNext.text;
            if (_btnRedo != null) _btnRedo.text = "Recarregar [Ctrl+Y]";
            if (_btnUndo != null) _btnUndo.text = "Desfazer [Ctrl+Z]";
            if (_btnLast != null) _btnLast.text = "Última [X]";
            HideResult();
        }

        // Ações públicas (Humble Object): botoes chamam estas; testes também.
        // Hit-test de mouse fica p/ playtest humano (sem viewport headless).
        public void PressSelect(PieceId p) => OnSelect?.Invoke(p);
        public void PressFire() => OnFire?.Invoke();
        public void PressUndo() => OnUndo?.Invoke();
        public void PressReload() => OnReload?.Invoke();
        public void PressLast() => OnLastRemove?.Invoke();
        public void PressAgain() { if (_draftOpen) _draftCb?.Invoke(0); else OnAgain?.Invoke(); }
        public void PressNext() { if (_draftOpen) _draftCb?.Invoke(1); else OnNext?.Invoke(); }
        public void PressSkip() { if (!_draftOpen) OnSkip?.Invoke(); } // draft se resolve nos picks
        public void PressDraft(int i) => _draftCb?.Invoke(i);

        public bool IsDraftOpen => _draftOpen;

        public void RefreshTray(PieceId selected, Func<PieceId, int> counts)
        {
            if (_tray == null) return;
            foreach (var (piece, key, name, color) in TrayOrder)
            {
                int n = counts(piece);
                bool show = n > 0 || piece == selected;
                if (!_trayBtns.TryGetValue(piece, out var b) || b == null)
                {
                    if (!show) continue;
                    b = new Button { name = $"btn-piece-{piece.ToString().ToLowerInvariant()}" };
                    b.AddToClassList("tray-btn");
                    b.style.borderLeftWidth = 4;
                    b.style.borderLeftColor = color;
                    var pp = piece;
                    b.clicked += () => OnSelect?.Invoke(pp);
                    _tray.Add(b);
                    _trayBtns[piece] = b;
                }
                // Criado fica: zerado = apagado (disabled), não some.
                b.style.display = DisplayStyle.Flex;
                b.SetEnabled(n > 0);
                b.text = $"{key} {name} ({n})";
                SetSel(b, selected == piece);
            }
        }

        static void SetSel(Button b, bool on)
        {
            if (b == null) return;
            if (on) b.AddToClassList("selected");
            else b.RemoveFromClassList("selected");
        }

        public void SyncModes()
        {
            if (_btnRedo != null) _btnRedo.text = "Recarregar [Ctrl+Y]";
        }

        // Estados: DISPARAR apagado sem peças; Desfazer sem histórico.
        public void SetActions(bool canFire, bool canUndo)
        {
            if (_btnFire != null) _btnFire.SetEnabled(canFire);
            if (_btnUndo != null) _btnUndo.SetEnabled(canUndo);
        }

        // Esmaece a barra inferior na sim (banner continua clicável).
        public void SetSimDim(bool dim)
        {
            if (_bottomBar == null) return;
            _bottomBar.style.opacity = dim ? 0.4f : 1f;
        }

        public void SetStatus(int knocked, int total, string msg = "")
        {
            if (_lblObjective != null) _lblObjective.text = $"{_phase}{_run}Inimigos {knocked}/{total}";
            if (_lblMsg != null) _lblMsg.text = msg ?? "";
        }

        string _phase = "";
        public void SetPhase(string name) => _phase = string.IsNullOrEmpty(name) ? "" : name + " — ";

        string _run = "";
        // Linha da run (vida + tentativas). Chamar ao mudar de estado; o
        // SetStatus de todo frame carrega junto. Vida ≤ 3 acende .danger.
        public void SetRun(int life, int attemptsLeft, int attemptsTotal)
        {
            _run = $"❤{life} · ▶{attemptsLeft}/{attemptsTotal} — ";
            if (_lblObjective == null) return;
            if (life <= 3) _lblObjective.AddToClassList("danger");
            else _lblObjective.RemoveFromClassList("danger");
        }

        // Mini-tutorial de gestos (null/"" esconde). Canal próprio, sem brigar
        // com a msg de status. pulseBtn destaca o botão-alvo (ex. "btn-fire").
        public void SetCoach(string text, string pulseBtn = null)
        {
            if (_lblCoach == null) return;
            _lblCoach.text = text ?? "";
            _lblCoach.style.display = string.IsNullOrEmpty(text) ? DisplayStyle.None : DisplayStyle.Flex;
            if (_doc?.rootVisualElement == null) return;
            foreach (var b in _doc.rootVisualElement.Query<Button>().ToList())
                b.RemoveFromClassList("pulse");
            if (!string.IsNullOrEmpty(pulseBtn))
            {
                var t = _doc.rootVisualElement.Q<Button>(pulseBtn);
                if (t != null) t.AddToClassList("pulse");
            }
        }

        public void ShowResult(bool win, int knocked, int total, bool hasNext = false)
        {
            if (_banner == null) return;
            _draftOpen = false;
            RestoreBannerButtons();
            _banner.RemoveFromClassList("hidden");
            if (_lblResult != null)
                _lblResult.text = win ? $"Vitória! {knocked}/{total} derrubados." : $"Cadeia Quebrada — {knocked}/{total}.";
            if (_btnNext != null) _btnNext.style.display = (win && hasNext) ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void HideResult()
        {
            if (_banner == null) return;
            if (!_banner.ClassListContains("hidden")) _banner.AddToClassList("hidden");
            if (_btnPick2 != null) _btnPick2.style.display = DisplayStyle.None;
            _draftOpen = false;
            _draftCb = null;
            RestoreBannerButtons();
        }

        Button _btnPick2;
        System.Action<int> _draftCb;
        bool _draftOpen;
        string _againText = "", _nextText = "";

        // Último draft oferecido (p/ testes escolherem com critério).
        public System.Collections.Generic.List<Topple.Core.RewardOption> LastDraft { get; private set; }

        void RestoreBannerButtons()
        {
            if (_btnAgain != null && !string.IsNullOrEmpty(_againText)) _btnAgain.text = _againText;
            if (_btnNext != null && !string.IsNullOrEmpty(_nextText)) _btnNext.text = _nextText;
            // Volta ao default visível; cada Show* decide se esconde (evita
            // vazar display:none do ShowRunEnd/ShowResult para o próximo banner).
            if (_btnNext != null) _btnNext.style.display = DisplayStyle.Flex;
        }

        // Draft deckbuilder: 3 opções no banner (again/next + 3º botão criado
        // aqui). Escolha 1, aplica e avança. Testes usam PressDraft(i).
        public void ShowDraft(System.Collections.Generic.List<Topple.Core.RewardOption> options, System.Action<int> onPick)
        {
            if (_banner == null || options == null || options.Count == 0 || onPick == null) return;
            if (_btnPick2 == null)
            {
                _btnPick2 = new Button { name = "btn-pick2", text = "" };
                _btnPick2.AddToClassList("fire-btn");
                _btnPick2.clicked += () => { if (_draftOpen) _draftCb?.Invoke(2); };
                _banner.Add(_btnPick2);
            }
            _draftCb = onPick;
            _draftOpen = true;
            LastDraft = options;
            _btnPick2.style.display = DisplayStyle.Flex;
            if (_lblResult != null) _lblResult.text = "Escolha 1 de 3 para o deck:";
            _btnAgain.text = options.Count > 0 ? options[0].Label : "—";
            _btnNext.text = options.Count > 1 ? options[1].Label : "—";
            _btnNext.style.display = DisplayStyle.Flex;
            _btnPick2.text = options.Count > 2 ? options[2].Label : "—";
            _banner.RemoveFromClassList("hidden");
        }

        // Fim de run: banner com Novo run (cobre vitória e derrota).
        public void ShowRunEnd(bool victory, int life)
        {
            if (_banner == null) return;
            _draftOpen = false;
            _draftCb = null;
            if (_btnPick2 != null) _btnPick2.style.display = DisplayStyle.None;
            if (_lblResult != null)
                _lblResult.text = victory ? "VITÓRIA! Zerou as 10 fases!" : $"Derrota… vida {life}. Tentar de novo?";
            _btnAgain.text = "Novo run";
            _btnNext.style.display = DisplayStyle.None;
            _banner.RemoveFromClassList("hidden");
        }

        // Para o clique no mundo ignorar cliques na UI (fundo tem picking ignorado).
        public VisualElement Pick(Vector2 screenPos)
        {
            if (_doc == null || _doc.rootVisualElement == null || _doc.rootVisualElement.panel == null) return null;
            // UI Toolkit: origem embaixo; mouse do Input System: origem em cima.
            var p = new Vector2(screenPos.x, Screen.height - screenPos.y);
            var el = _doc.rootVisualElement.panel.Pick(p);
            while (el != null && !(el is Button))
                el = el.parent;
            return el;
        }

        // Atalhos da bandeja (chamado pelo TutorialSetup via Update).
        // 1-3 fixos + 4-8 p/ tipos de draft (bandeja dinâmica vem na F5).
        public void PollShortcuts()
        {
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Common);
            if (kb.digit2Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Heavy);
            if (kb.digit3Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Ramp);
            if (kb.digit4Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Fork);
            if (kb.digit5Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Big);
            if (kb.digit6Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Runner);
            if (kb.digit7Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Blast);
            if (kb.digit8Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Tower);
        }
    }
}
