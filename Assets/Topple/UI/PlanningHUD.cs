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
        VisualElement _bottomBar, _topLeft;
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
            _topLeft = root.Q<VisualElement>("top-left"); // null no fallback (só bottom-bar)
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
            if (_btnSkip != null) _btnSkip.clicked += () => { if (!_draftOpen && !_shopOpen) OnSkip?.Invoke(); };
            _btnAgain.clicked += () => { if (_draftOpen) _draftCb?.Invoke(0); else if (!_shopOpen) OnAgain?.Invoke(); };
            _btnNext.clicked += () => { if (_draftOpen) _draftCb?.Invoke(1); else if (!_shopOpen) OnNext?.Invoke(); };
            _againText = _btnAgain.text;
            _nextText = _btnNext.text;
            if (_btnRedo != null) _btnRedo.text = "Recarregar [Ctrl+Y]";
            if (_btnUndo != null) _btnUndo.text = "Desfazer [Ctrl+Z]";
            if (_btnLast != null) _btnLast.text = "Última [X]";
            // Pular fase é cheat de teste: visível só em debug/Editor (release esconde,
            // mas o botão continua existindo p/ testes via Q()).
            if (_btnSkip != null && !Debug.isDebugBuild) _btnSkip.style.display = DisplayStyle.None;
            HideResult();
        }

        // Ações públicas (Humble Object): botoes chamam estas; testes também.
        // Hit-test de mouse fica p/ playtest humano (sem viewport headless).
        public void PressSelect(PieceId p) => OnSelect?.Invoke(p);
        public void PressFire() => OnFire?.Invoke();
        public void PressUndo() => OnUndo?.Invoke();
        public void PressReload() => OnReload?.Invoke();
        public void PressLast() => OnLastRemove?.Invoke();
        public void PressAgain() { if (_draftOpen) _draftCb?.Invoke(0); else if (!_shopOpen) OnAgain?.Invoke(); }
        public void PressNext() { if (_draftOpen) _draftCb?.Invoke(1); else if (!_shopOpen) OnNext?.Invoke(); }
        public void PressSkip() { if (!_draftOpen && !_shopOpen) OnSkip?.Invoke(); } // telas se resolvem nos botões
        public void PressDraft(int i) => _draftCb?.Invoke(i);
        public void PressReroll() { if (_draftOpen) _draftReroll?.Invoke(); }
        public void PressShop(int i) { if (_shopOpen) _shopBuy?.Invoke(i); }
        public void PressShopReroll() { if (_shopOpen) _shopReroll?.Invoke(); }
        public void PressShopHeal() { if (_shopOpen) _shopHeal?.Invoke(); }
        public void PressShopAttempt() { if (_shopOpen) _shopAttempt?.Invoke(); }
        public void PressShopLeave() { if (_shopOpen) _shopLeave?.Invoke(); }

        public bool IsDraftOpen => _draftOpen;
        public bool IsShopOpen => _shopOpen;

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
        // Dono (HUD enxuta total): além de esmaecer, ESCONDE bandeja e botões
        // de planejamento até acabar a simulação (objetivo + banner ficam).
        public void SetSimDim(bool dim)
        {
            if (_bottomBar == null) return;
            _bottomBar.style.opacity = dim ? 0.4f : 1f;
            SetSimMode(dim);
        }

        // HUD enxuta total na sim: some o que não é útil (tray + ações +
        // coach); ficam objetivo, msg e banner. Press* seguem funcionando
        // escondidos (Humble Object: testes não quebram).
        public void SetSimMode(bool sim)        {
            var show = sim ? DisplayStyle.None : DisplayStyle.Flex;
            if (_tray != null) _tray.style.display = show;
            if (_btnFire != null) _btnFire.style.display = show;
            if (_btnUndo != null) _btnUndo.style.display = show;
            if (_btnRedo != null) _btnRedo.style.display = show;
            if (_btnLast != null) _btnLast.style.display = show;
            // Pular fase é cheat debug: some na sim; volta só em build debug.
            if (_btnSkip != null) _btnSkip.style.display = sim ? DisplayStyle.None
                : (Debug.isDebugBuild ? DisplayStyle.Flex : DisplayStyle.None);
            if (_lblCoach != null && sim) _lblCoach.style.display = DisplayStyle.None;
        }

        // Menu aberto: esconde a HUD de jogo inteira (menu tem a sua).
        // Fallback só tem bottom-bar (top-left null — sem problema).
        public void SetMenuMode(bool menu)
        {
            var show = menu ? DisplayStyle.None : DisplayStyle.Flex;
            if (_bottomBar != null) _bottomBar.style.display = show;
            if (_topLeft != null) _topLeft.style.display = show;
        }

        public void SetStatus(int knocked, int total, string msg = "", int pieces = -1, int par = 0)
        {
            string pp = (pieces >= 0 && par > 0) ? $" · Peças {pieces}/{par}" : "";
            if (_lblObjective != null) _lblObjective.text = $"{_phase}{_run}Inimigos {knocked}/{total}{pp}";
            if (_lblMsg != null) _lblMsg.text = msg ?? "";
        }

        string _phase = "";
        public void SetPhase(string name) => _phase = string.IsNullOrEmpty(name) ? "" : name + " — ";

        string _run = "";
        // Linha da run (vida + tentativas + ouro). Chamar ao mudar de estado; o
        // SetStatus de todo frame carrega junto. Vida ≤ 3 acende .danger.
        public void SetRun(int life, int attemptsLeft, int attemptsTotal, int gold = 0)
        {
            _run = $"❤{life} · ▶{attemptsLeft}/{attemptsTotal} · ◉{gold} — ";
            if (_lblObjective == null) return;
            if (gold > 0) _lblObjective.AddToClassList("gold");
            else _lblObjective.RemoveFromClassList("gold");
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

        public void ShowResult(bool win, int knocked, int total, bool hasNext = false, int goldEarned = 0)
        {
            if (_banner == null) return;
            _draftOpen = false;
            HideShopButtons();
            RestoreBannerButtons();
            _banner.RemoveFromClassList("hidden");
            string gold = goldEarned > 0 ? $" +{goldEarned} ouro" : "";
            if (_lblResult != null)
                _lblResult.text = win ? $"Vitória! {knocked}/{total} derrubados.{gold}" : $"Cadeia Quebrada — {knocked}/{total}.{gold}";
            if (_btnNext != null) _btnNext.style.display = (win && hasNext) ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void HideResult()
        {
            if (_banner == null) return;
            if (!_banner.ClassListContains("hidden")) _banner.AddToClassList("hidden");
            if (_btnPick2 != null) _btnPick2.style.display = DisplayStyle.None;
            if (_btnReroll != null) _btnReroll.style.display = DisplayStyle.None;
            _draftOpen = false;
            _draftCb = null;
            _draftReroll = null;
            HideShopButtons();
            RestoreBannerButtons();
        }

        Button _btnPick2, _btnReroll;
        System.Action<int> _draftCb;
        System.Action _draftReroll;
        bool _draftOpen;
        string _againText = "", _nextText = "";

        // Último draft oferecido (p/ testes escolherem com critério).
        public System.Collections.Generic.List<Topple.Core.RewardOption> LastDraft { get; private set; }

        void RestoreBannerButtons()
        {
            if (_banner != null) _banner.RemoveFromClassList("shop");
            if (_btnAgain != null && !string.IsNullOrEmpty(_againText)) _btnAgain.text = _againText;
            if (_btnNext != null && !string.IsNullOrEmpty(_nextText)) _btnNext.text = _nextText;
            // Volta ao default visível; cada Show* decide se esconde (evita
            // vazar display:none do ShowRunEnd/ShowResult/ShowShop para o próximo banner).
            if (_btnAgain != null) _btnAgain.style.display = DisplayStyle.Flex;
            if (_btnNext != null) _btnNext.style.display = DisplayStyle.Flex;
        }

        // Draft deckbuilder: 3 opções no banner (again/next + 3º botão criado
        // aqui). Escolha 1, aplica e avança. Reroll opcional (ouro). Testes usam PressDraft(i).
        // shopNext=true = draft leva à loja (sinaliza "Próxima parada: ★ LOJA ★").
        public void ShowDraft(System.Collections.Generic.List<Topple.Core.RewardOption> options, System.Action<int> onPick,
            System.Action onReroll = null, int rerollCost = 0, bool rerollEnabled = true, bool shopNext = false)
        {
            if (_banner == null || options == null || options.Count == 0 || onPick == null) return;
            if (_btnPick2 == null)
            {
                _btnPick2 = new Button { name = "btn-pick2", text = "" };
                _btnPick2.AddToClassList("fire-btn");
                _btnPick2.clicked += () => { if (_draftOpen) _draftCb?.Invoke(2); };
                _banner.Add(_btnPick2);
            }
            if (_btnReroll == null)
            {
                _btnReroll = new Button { name = "btn-reroll", text = "" };
                _btnReroll.AddToClassList("tool-btn");
                _btnReroll.clicked += () => { if (_draftOpen) _draftReroll?.Invoke(); };
                _banner.Add(_btnReroll);
            }
            _draftCb = onPick;
            _draftReroll = onReroll;
            _draftOpen = true;
            _shopOpen = false;
            HideShopButtons();
            RestoreBannerButtons();
            LastDraft = options;
            _btnPick2.style.display = DisplayStyle.Flex;
            if (onReroll != null)
            {
                _btnReroll.style.display = DisplayStyle.Flex;
                _btnReroll.text = $"Reroll ({rerollCost})";
                _btnReroll.SetEnabled(rerollEnabled);
            }
            else _btnReroll.style.display = DisplayStyle.None;
            if (_lblResult != null) _lblResult.text = "Recompensa (grátis) — escolha 1 de 3:"
                + (shopNext ? "\nPróxima parada: ★ LOJA ★" : "");
            _btnAgain.text = options.Count > 0 ? options[0].Label : "—";
            _btnNext.text = options.Count > 1 ? options[1].Label : "—";
            _btnNext.style.display = DisplayStyle.Flex;
            _btnPick2.text = options.Count > 2 ? options[2].Label : "—";
            _banner.RemoveFromClassList("hidden");
        }

        // Loja (ouro, tela única): 3 ofertas + reroll + cura + tentativa + sair.
        // Botões criados em código (mesmo padrão do draft); sem ouro = apagado.
        // Testes usam PressShop(i)/PressShopReroll/PressShopHeal/PressShopAttempt/PressShopLeave.
        public System.Collections.Generic.List<Topple.Core.RewardOption> LastShop { get; private set; }
        System.Action<int> _shopBuy;
        System.Action _shopReroll, _shopHeal, _shopAttempt, _shopLeave;
        bool _shopOpen;
        readonly System.Collections.Generic.List<Button> _shopBtns = new();

        public static int ShopOfferPrice(Topple.Core.RewardOption o)
        {
            int price = 0;
            foreach (var it in o.Items) price += Topple.Core.ToppleRules.ShopPrice(it.piece, it.count);
            return price;
        }

        void HideShopButtons()
        {
            _shopOpen = false;
            _shopBuy = null; _shopReroll = null; _shopHeal = null; _shopAttempt = null; _shopLeave = null;
            for (int i = 0; i < _shopBtns.Count; i++) SetShopHandler(i, null);
            foreach (var b in _shopBtns)
                if (b != null) b.style.display = DisplayStyle.None;
        }

        Button AddShopButton(string name, string cls)
        {
            var b = new Button { name = name, text = "" };
            b.AddToClassList(cls);
            b.AddToClassList("shop-card");
            _banner.Add(b);
            _shopBtns.Add(b);
            _shopBtnHandlers.Add(null);
            return b;
        }

        // Troca limpa de handler por botão (ShowShop reconstrói a cada compra).
        readonly System.Collections.Generic.List<System.Action> _shopBtnHandlers = new();

        void SetShopHandler(int bi, System.Action handler)
        {
            if (bi < 0 || bi >= _shopBtns.Count) return;
            var old = bi < _shopBtnHandlers.Count ? _shopBtnHandlers[bi] : null;
            if (old != null) _shopBtns[bi].clickable.clicked -= old;
            if (bi >= _shopBtnHandlers.Count)
                while (_shopBtnHandlers.Count <= bi) _shopBtnHandlers.Add(null);
            _shopBtnHandlers[bi] = handler;
            if (handler != null) _shopBtns[bi].clickable.clicked += handler;
        }

        public void ShowShop(int gold, System.Collections.Generic.List<Topple.Core.RewardOption> offers,
            System.Action<int> buy, System.Action onReroll, int rerollCost,
            System.Action onHeal, System.Action onAttempt, System.Action onLeave)
        {
            if (_banner == null || offers == null || buy == null || onLeave == null) return;
            _draftOpen = false;
            _draftCb = null;
            _draftReroll = null;
            if (_btnPick2 != null) _btnPick2.style.display = DisplayStyle.None;
            if (_btnReroll != null) _btnReroll.style.display = DisplayStyle.None;
            HideShopButtons();
            _shopBuy = buy; _shopReroll = onReroll; _shopHeal = onHeal; _shopAttempt = onAttempt; _shopLeave = onLeave;
            _shopOpen = true;
            LastShop = offers;
            while (_shopBtns.Count < 7) AddShopButton("btn-shop" + _shopBtns.Count, "fire-btn");
            int bi = 0;
            for (int i = 0; i < 3; i++)
            {
                var b = _shopBtns[bi];
                if (i < offers.Count)
                {
                    int price = ShopOfferPrice(offers[i]);
                    int idx = i;
                    b.style.display = DisplayStyle.Flex;
                    b.text = $"{offers[i].Label} ({price})";
                    b.SetEnabled(gold >= price);
                    SetShopHandler(bi, () => { if (_shopOpen) _shopBuy?.Invoke(idx); });
                }
                else { b.style.display = DisplayStyle.None; SetShopHandler(bi, null); }
                bi++;
            }
            SetShopRow(bi++, $"Reroll ({rerollCost})", gold >= rerollCost && onReroll != null,
                () => { if (_shopOpen) _shopReroll?.Invoke(); });
            SetShopRow(bi++, $"+{Topple.Core.ToppleRules.ShopHealLife}❤ ({Topple.Core.ToppleRules.ShopHealCost})",
                gold >= Topple.Core.ToppleRules.ShopHealCost && onHeal != null,
                () => { if (_shopOpen) _shopHeal?.Invoke(); });
            SetShopRow(bi++, $"+1▶ próx ({Topple.Core.ToppleRules.ShopAttemptCost})",
                gold >= Topple.Core.ToppleRules.ShopAttemptCost && onAttempt != null,
                () => { if (_shopOpen) _shopAttempt?.Invoke(); });
            var leave = _shopBtns[bi++];
            leave.style.display = DisplayStyle.Flex;
            leave.text = "Sair → próxima fase";
            leave.SetEnabled(true);
            SetShopHandler(bi - 1, () => { if (_shopOpen) _shopLeave?.Invoke(); });
            if (_lblResult != null) _lblResult.text = $"★ LOJA ★ — ◉{gold} ouro";
            _btnAgain.style.display = DisplayStyle.None;
            _btnNext.style.display = DisplayStyle.None;
            _banner.AddToClassList("shop"); // borda dourada (F7)
            _banner.RemoveFromClassList("hidden");
        }

        void SetShopRow(int bi, string text, bool enabled, System.Action handler)
        {
            var b = _shopBtns[bi];
            b.style.display = DisplayStyle.Flex;
            b.text = text;
            b.SetEnabled(enabled);
            SetShopHandler(bi, handler);
        }

        // Fim de run: banner com Novo run (só derrota; a run é infinita).
        public void ShowRunEnd(bool victory, int life)
        {
            if (_banner == null) return;
            _draftOpen = false;
            _draftCb = null;
            _draftReroll = null;
            if (_btnPick2 != null) _btnPick2.style.display = DisplayStyle.None;
            if (_btnReroll != null) _btnReroll.style.display = DisplayStyle.None;
            HideShopButtons();
            RestoreBannerButtons();
            if (_lblResult != null)
                _lblResult.text = victory ? "VITÓRIA! Run completa!" : $"Derrota… vida {life}. Tentar de novo?";
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
