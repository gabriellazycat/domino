// Main menu na cena Procedural (dono): play (novo/continuar), load
// (auto-save por fase) e settings essencial (volume + pós + zoom). Overlay
// montado em código (sem editar .unity); testes usam Press* (Humble Object).
// NOTA: um MonoBehaviour por arquivo (regra do repo).
using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace Topple.Game
{
    public sealed class MainMenu : MonoBehaviour
    {
        public event Action OnPlay;     // novo run
        public event Action OnContinue; // voltar ao jogo (mid-run)
        public event Action OnLoad;     // carregar auto-save
        public event Action OnOpen;     // botão ≡ (TutorialSetup reabre com contexto)
        public event Action<SettingsData> OnSettingsChanged; // aplicado ao vivo

        public bool IsVisible { get; private set; }

        VisualElement _root;
        Button _btnPlay, _btnContinue, _btnLoad;
        Label _lblSave;
        Slider _volSlider, _zoomSlider;
        Toggle _postToggle;
        readonly SettingsData _edit = new();

        (bool canContinue, string saveInfo) _cached;

        public void Setup(UIDocument doc)
        {
            var r = doc.rootVisualElement;
            // Botão flutuante ≡ (sempre visível; SetSimMode não toca nele).
            var open = new Button { name = "btn-menu-open", text = "≡" };
            open.AddToClassList("menu-open-btn");
            open.clicked += () => OnOpen?.Invoke();
            r.Add(open);

            _root = new VisualElement { name = "menu-root" };
            _root.AddToClassList("menu-root");
            var panel = new VisualElement { name = "menu-panel" };
            panel.AddToClassList("menu-panel");
            var title = new Label { name = "lbl-menu-title", text = "TOPPLE" };
            title.AddToClassList("menu-title");
            panel.Add(title);
            _btnPlay = MkBtn("btn-menu-play", "Novo run", () => OnPlay?.Invoke());
            _btnContinue = MkBtn("btn-menu-continue", "Continuar", () => OnContinue?.Invoke());
            _btnLoad = MkBtn("btn-menu-load", "Carregar", () => OnLoad?.Invoke());
            _lblSave = new Label { name = "lbl-menu-save", text = "" };
            _lblSave.AddToClassList("menu-save");
            panel.Add(_btnPlay); panel.Add(_btnContinue); panel.Add(_btnLoad); panel.Add(_lblSave);
            var st = new Label { name = "lbl-menu-settings", text = "— Opções —" };
            st.AddToClassList("menu-section");
            panel.Add(st);
            // Zoom 1–10 → 0,01–0,10 (default 5 → 0,05, igual ao ZoomStep).
            _volSlider = new Slider("Volume", 0f, 100f) { name = "slider-menu-volume", value = 100f };
            _volSlider.RegisterValueChangedCallback(e => { _edit.volume = e.newValue / 100f; Emit(); });
            panel.Add(_volSlider);
            _postToggle = new Toggle("Brilho/vinheta") { name = "toggle-menu-postfx", value = true };
            _postToggle.RegisterValueChangedCallback(e => { _edit.postFX = e.newValue; Emit(); });
            panel.Add(_postToggle);
            _zoomSlider = new Slider("Zoom", 1f, 10f) { name = "slider-menu-zoom", value = 5f };
            _zoomSlider.RegisterValueChangedCallback(e => { _edit.zoomSpeed = e.newValue / 100f; Emit(); });
            panel.Add(_zoomSlider);
            _root.Add(panel);
            r.Add(_root);
            Hide();
        }

        Button MkBtn(string name, string text, Action onClick)
        {
            var b = new Button { name = name, text = text };
            b.AddToClassList("menu-btn");
            b.clicked += () => onClick?.Invoke();
            return b;
        }

        void Emit() => OnSettingsChanged?.Invoke(_edit);

        public void Show(bool canContinue, string saveInfo, SettingsData s)
        {
            _cached = (canContinue, saveInfo);
            if (s != null)
            {
                _edit.volume = s.volume; _edit.postFX = s.postFX; _edit.zoomSpeed = s.zoomSpeed;
                if (_volSlider != null) _volSlider.SetValueWithoutNotify(s.volume * 100f);
                if (_postToggle != null) _postToggle.SetValueWithoutNotify(s.postFX);
                if (_zoomSlider != null) _zoomSlider.SetValueWithoutNotify(s.zoomSpeed * 100f);
            }
            Refresh();
            IsVisible = true;
            if (_root != null) _root.style.display = DisplayStyle.Flex;
        }

        public void Refresh()
        {
            if (_btnContinue != null) _btnContinue.SetEnabled(_cached.canContinue);
            if (_btnLoad != null) _btnLoad.SetEnabled(!string.IsNullOrEmpty(_cached.saveInfo));
            if (_lblSave != null) _lblSave.text = _cached.saveInfo ?? "";
        }

        public void Hide()
        {
            IsVisible = false;
            if (_root != null) _root.style.display = DisplayStyle.None;
        }

        // Humble Object p/ testes.
        public void PressPlay() => OnPlay?.Invoke();
        public void PressContinue() => OnContinue?.Invoke();
        public void PressLoad() => OnLoad?.Invoke();
        public void PressOpen() => OnOpen?.Invoke();
        public void SetVolumeUI(float v01)
        {
            if (_volSlider != null) _volSlider.value = Mathf.Clamp01(v01) * 100f;
        }
    }
}
