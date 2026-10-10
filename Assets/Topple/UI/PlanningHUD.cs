// T3: HUD mínimo do planejamento (GDD §14.1/§14.4): bandeja, DISPARAR, desfazer,
// linha, objetivo e banner de resultado. Nomes estáveis p/ bots (btn-fire, ...).
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
        public event Action OnReload; // botão Recarregar (era Refazer): fase toda do zero
        public event Action OnLineToggle;
        public event Action OnPathToggle;
        public event Action OnAgain;
        public event Action OnNext;

        UIDocument _doc;
        Button _btnCommon, _btnHeavy, _btnRamp, _btnFire, _btnUndo, _btnRedo, _btnLine, _btnPath, _btnAgain, _btnNext;
        Label _lblObjective, _lblMsg, _lblResult, _lblCoach;
        VisualElement _banner;
        bool _lineOn;

        public void Setup(UIDocument doc)
        {
            _doc = doc;
            var root = doc.rootVisualElement;
            _btnCommon = root.Q<Button>("btn-piece-common");
            _btnHeavy = root.Q<Button>("btn-piece-heavy");
            _btnRamp = root.Q<Button>("btn-piece-ramp");
            _btnFire = root.Q<Button>("btn-fire");
            _btnUndo = root.Q<Button>("btn-undo");
            _btnRedo = root.Q<Button>("btn-redo");
            _btnLine = root.Q<Button>("btn-line");
            _btnPath = root.Q<Button>("btn-path");
            _btnAgain = root.Q<Button>("btn-again");
            _btnNext = root.Q<Button>("btn-next");
            _lblObjective = root.Q<Label>("lbl-objective");
            _lblMsg = root.Q<Label>("lbl-msg");
            _lblCoach = root.Q<Label>("lbl-coach");
            _lblResult = root.Q<Label>("lbl-result");
            _banner = root.Q<VisualElement>("banner-result");
            if (_btnCommon == null || _btnFire == null || _banner == null || _btnPath == null || _btnNext == null)
                throw new Exception("[TOPPLE][UI] PlanningHUD.uxml incompleto.");
            _btnCommon.clicked += () => OnSelect?.Invoke(PieceId.Common);
            _btnHeavy.clicked += () => OnSelect?.Invoke(PieceId.Heavy);
            _btnRamp.clicked += () => OnSelect?.Invoke(PieceId.Ramp);
            _btnFire.clicked += () => OnFire?.Invoke();
            _btnUndo.clicked += () => OnUndo?.Invoke();
            _btnRedo.clicked += () => OnReload?.Invoke();
            _btnLine.clicked += () => PressLine();
            _btnPath.clicked += () => OnPathToggle?.Invoke();
            _btnAgain.clicked += () => OnAgain?.Invoke();
            _btnNext.clicked += () => OnNext?.Invoke();
            // Linha desativada e trilha sempre ligada (pedido do dono): esconde os
            // dois botões, mantém métodos/eventos. Refazer virou Recarregar fase.
            if (_btnLine != null) _btnLine.style.display = DisplayStyle.None;
            if (_btnPath != null) _btnPath.style.display = DisplayStyle.None;
            if (_btnRedo != null) _btnRedo.text = "Recarregar";
            HideResult();
        }

        // Ações públicas (Humble Object): botoes chamam estas; testes também.
        // Hit-test de mouse fica p/ playtest humano (sem viewport headless).
        public void PressSelect(PieceId p) => OnSelect?.Invoke(p);
        public void PressFire() => OnFire?.Invoke();
        public void PressUndo() => OnUndo?.Invoke();
        public void PressReload() => OnReload?.Invoke();
        public void PressLine() { _lineOn = !_lineOn; SyncLineText(); OnLineToggle?.Invoke(); }
        public void PressPath() => OnPathToggle?.Invoke();
        public void PressAgain() => OnAgain?.Invoke();
        public void PressNext() => OnNext?.Invoke();

        public bool LineOn => _lineOn;

        public void RefreshTray(PieceId selected, Func<PieceId, int> counts)
        {
            if (_btnCommon == null) return;
            _btnCommon.text = $"1 Comum ({counts(PieceId.Common)})";
            _btnHeavy.text = $"2 Pesada ({counts(PieceId.Heavy)})";
            _btnRamp.text = $"3 Rampa ({counts(PieceId.Ramp)})";
            SetSel(_btnCommon, selected == PieceId.Common);
            SetSel(_btnHeavy, selected == PieceId.Heavy);
            SetSel(_btnRamp, selected == PieceId.Ramp);
        }

        static void SetSel(Button b, bool on)
        {
            if (b == null) return;
            if (on) b.AddToClassList("selected");
            else b.RemoveFromClassList("selected");
        }

        void SyncLineText()
        {
            if (_btnLine != null) _btnLine.text = _lineOn ? "Linha: on" : "Linha: off";
        }

        public void SyncModes(bool lineOn, bool pathOn)
        {
            // Linha desativada e trilha sempre ligada: botões escondidos.
            if (_btnLine != null) _btnLine.style.display = DisplayStyle.None;
            if (_btnPath != null) _btnPath.style.display = DisplayStyle.None;
            _lineOn = false;
            if (_btnRedo != null) _btnRedo.text = "Recarregar";
        }

        public void SetStatus(int knocked, int total, string msg = "")
        {
            if (_lblObjective != null) _lblObjective.text = $"{_phase}Inimigos {knocked}/{total}";
            if (_lblMsg != null) _lblMsg.text = msg ?? "";
        }

        string _phase = "";
        public void SetPhase(string name) => _phase = string.IsNullOrEmpty(name) ? "" : name + " — ";

        // Mini-tutorial de gestos (null/"" esconde). Canal próprio, sem brigar
        // com a msg de status.
        public void SetCoach(string text)
        {
            if (_lblCoach == null) return;
            _lblCoach.text = text ?? "";
            _lblCoach.style.display = string.IsNullOrEmpty(text) ? DisplayStyle.None : DisplayStyle.Flex;
        }

        public void ShowResult(bool win, int knocked, int total, bool hasNext = false)
        {
            if (_banner == null) return;
            _banner.RemoveFromClassList("hidden");
            if (_lblResult != null)
                _lblResult.text = win ? $"Vitória! {knocked}/{total} derrubados." : $"Cadeia Quebrada — {knocked}/{total}.";
            if (_btnNext != null) _btnNext.style.display = (win && hasNext) ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void HideResult()
        {
            if (_banner == null) return;
            if (!_banner.ClassListContains("hidden")) _banner.AddToClassList("hidden");
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

        // Atalhos 1-9 da bandeja (chamado pelo TutorialSetup via Update).
        public void PollShortcuts()
        {
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb == null) return;
            if (kb.digit1Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Common);
            if (kb.digit2Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Heavy);
            if (kb.digit3Key.wasPressedThisFrame) OnSelect?.Invoke(PieceId.Ramp);
        }
    }
}
