// T3: Input System com ações definidas em código (sem asset .inputactions).
// Mouse+teclado primeiro (GDD §14.6); gamepad no posicionamento é P2.
using UnityEngine;
using UnityEngine.InputSystem;

namespace Topple.Game
{
    public sealed class PlanningInput : MonoBehaviour
    {
        public InputAction PlaceAction { get; private set; } // botão esquerdo
        public InputAction RemoveAction { get; private set; } // botão direito
        public InputAction RotLeft { get; private set; } // Q
        public InputAction RotRight { get; private set; } // E
        public InputAction FreeSnap { get; private set; } // Alt (sem grade)
        public InputAction UndoAction { get; private set; } // Ctrl+Z
        public InputAction ReloadAction { get; private set; } // Ctrl+Y (recarrega a fase)
        public InputAction FireAction { get; private set; } // Enter
        public InputAction RemoveLastAction { get; private set; } // X (remove a última)
        public InputAction OrbitAction { get; private set; } // botão do meio

        public Vector2 MousePos => Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
        public float Wheel => Mouse.current != null ? Mouse.current.scroll.ReadValue().y : 0f;
        public bool AltDown => Keyboard.current != null && (Keyboard.current.leftAltKey.isPressed || Keyboard.current.rightAltKey.isPressed);

        void Awake()
        {
            PlaceAction = Act("<Mouse>/leftButton");
            RemoveAction = Act("<Mouse>/rightButton");
            RotLeft = Act("<Keyboard>/q");
            RotRight = Act("<Keyboard>/e");
            FreeSnap = Act("<Keyboard>/leftAlt", "<Keyboard>/rightAlt");
            UndoAction = ModifierCombo("<Keyboard>/ctrl", "<Keyboard>/z");
            ReloadAction = ModifierCombo("<Keyboard>/ctrl", "<Keyboard>/y");
            FireAction = Act("<Keyboard>/enter", "<Keyboard>/numpadEnter");
            RemoveLastAction = Act("<Keyboard>/x");
            OrbitAction = Act("<Mouse>/middleButton");
        }

        static InputAction Act(string binding, string binding2 = null)
        {
            var a = new InputAction(type: InputActionType.Button);
            a.AddBinding(binding);
            if (binding2 != null) a.AddBinding(binding2);
            a.Enable();
            return a;
        }

        // Atalho com modificador (ex. Ctrl+Z): composite oficial, sem gate manual
        // (gate manual disparava no Ctrl sozinho e era sensível a fase do frame).
        static InputAction ModifierCombo(string modifier, string button)
        {
            var a = new InputAction(type: InputActionType.Button);
            a.AddCompositeBinding("ButtonWithOneModifier")
                .With("Modifier", modifier)
                .With("Button", button);
            a.Enable();
            return a;
        }

        public bool UndoPressed() => UndoAction.WasPressedThisFrame();

        public bool ReloadPressed() => ReloadAction.WasPressedThisFrame();

        public bool RemoveLastPressed() => RemoveLastAction != null && RemoveLastAction.WasPressedThisFrame();

        void OnDestroy()
        {
            foreach (var a in new[] { PlaceAction, RemoveAction, RotLeft, RotRight, FreeSnap, UndoAction, ReloadAction, FireAction, RemoveLastAction, OrbitAction })
                if (a != null) a.Dispose();
        }
    }
}
