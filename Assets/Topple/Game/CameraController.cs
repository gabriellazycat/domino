// T3: câmera livre do planejamento (GDD §4.1/§14.6): orbitar (botão do meio),
// WASD/setas, zoom (roda). Alvo inicial: centro do campo 24×16.
using UnityEngine;

namespace Topple.Game
{
    public sealed class CameraController : MonoBehaviour
    {
        public Vector3 Target = new(2f, 0f, 0f);
        public float Distance = 22f;
        public float Yaw = -90f;
        public float Pitch = 55f;

        // Follow por trás (tecla C, só com FollowAllowed): câmera atrás do ponto,
        // olhando ao longo da direção — "visão por trás das peças".
        public bool FollowAllowed = true;
        // Dono (opção B): C morto na sim — câmera 100% manual. TutorialSetup
        // desliga este toggle no StartSim e religa no planejamento.
        public bool FollowToggleEnabled = true;
        public bool FollowBehind { get; private set; }
        public Vector3 FollowPoint;
        public Vector3 FollowDir = Vector3.right;
        float _yawOffset;

        // Velocidade do zoom (roda): 0,05 ≈ 2,5x o antigo 0,02. Settings ajusta.
        public static float ZoomStep = 0.05f;

        // Matemática pura do zoom (p/ teste EditMode, sem Input System).
        public static float ClampZoom(float dist, float wheel, float min, float max) =>
            Mathf.Clamp(dist - wheel * ZoomStep, min, max);

        public void StopFollow() { FollowBehind = false; _yawOffset = 0f; }

        PlanningInput _in;
        Camera _cam;
        // Arrasto com botão direito orbita (clique sem arrasto = remover peça,
        // tratado no PlanningController pelo limiar de 8 px).
        bool _rDown;
        Vector2 _rStart;
        const float RDragPx = 8f;

        void Awake()
        {
            _cam = GetComponent<Camera>();
            if (_cam == null) _cam = gameObject.AddComponent<Camera>();
            _cam.fieldOfView = 30f; // GDD §13.4
            _in = GetComponent<PlanningInput>();
            if (_in == null) _in = gameObject.AddComponent<PlanningInput>();
            Apply();
        }

        void Update()
        {
            var kb = UnityEngine.InputSystem.Keyboard.current;
            if (kb != null && kb.cKey.wasPressedThisFrame && FollowAllowed && FollowToggleEnabled)
            {
                FollowBehind = !FollowBehind;
                _yawOffset = 0f;
            }
            if (FollowBehind && FollowAllowed)
            {
                var fm = UnityEngine.InputSystem.Mouse.current;
                bool orbitHeld = _in.OrbitAction.IsPressed();
                if (fm != null)
                {
                    if (fm.rightButton.wasPressedThisFrame) { _rDown = true; _rStart = fm.position.ReadValue(); }
                    if (_rDown && fm.rightButton.isPressed
                        && (fm.position.ReadValue() - _rStart).magnitude >= RDragPx)
                        orbitHeld = true;
                    if (fm.rightButton.wasReleasedThisFrame) _rDown = false;
                }
                if (orbitHeld)
                {
                    var d = UnityEngine.InputSystem.Mouse.current.delta.ReadValue();
                    _yawOffset += d.x * 0.3f;
                    Pitch = Mathf.Clamp(Pitch - d.y * 0.3f, 10f, 70f);
                }
                float wz = _in.Wheel;
                if (Mathf.Abs(wz) > 0.01f) Distance = ClampZoom(Distance, wz, 3f, 40f);
                var dir = FollowDir;
                dir.y = 0;
                if (dir.sqrMagnitude < 1e-6f) dir = Vector3.right;
                dir.Normalize();
                float yawR = (Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg + 180f + _yawOffset) * Mathf.Deg2Rad;
                float pitchR = Pitch * Mathf.Deg2Rad;
                var back = new Vector3(Mathf.Sin(yawR) * Mathf.Cos(pitchR), Mathf.Sin(pitchR), Mathf.Cos(yawR) * Mathf.Cos(pitchR));
                var want = FollowPoint + back * Distance;
                transform.position = Vector3.Lerp(transform.position, want, 1f - Mathf.Exp(-6f * Time.deltaTime));
                transform.LookAt(FollowPoint + Vector3.up * 0.4f);
                return;
            }
            if (_in.OrbitAction.IsPressed())
            {
                var d = UnityEngine.InputSystem.Mouse.current.delta.ReadValue();
                Yaw += d.x * 0.3f;
                Pitch = Mathf.Clamp(Pitch - d.y * 0.3f, 15f, 80f);
            }
            // Botão direito arrastado também orbita (botão do meio continua valendo).
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (mouse != null)
            {
                if (mouse.rightButton.wasPressedThisFrame) { _rDown = true; _rStart = mouse.position.ReadValue(); }
                if (_rDown && mouse.rightButton.isPressed
                    && (mouse.position.ReadValue() - _rStart).magnitude >= RDragPx)
                {
                    var d = mouse.delta.ReadValue();
                    Yaw += d.x * 0.3f;
                    Pitch = Mathf.Clamp(Pitch - d.y * 0.3f, 15f, 80f);
                }
                if (mouse.rightButton.wasReleasedThisFrame) _rDown = false;
            }
            float w = _in.Wheel;
            if (Mathf.Abs(w) > 0.01f) Distance = ClampZoom(Distance, w, 8f, 40f);
            var move = Vector2.zero;
            if (kb != null)
            {
                if (kb.wKey.isPressed || kb.upArrowKey.isPressed) move.y += 1;
                if (kb.sKey.isPressed || kb.downArrowKey.isPressed) move.y -= 1;
                if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) move.x -= 1;
                if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) move.x += 1;
            }
            if (move != Vector2.zero)
            {
                float yawR = Yaw * Mathf.Deg2Rad;
                var fwd = new Vector3(Mathf.Cos(yawR), 0, Mathf.Sin(yawR));
                var right = new Vector3(-fwd.z, 0, fwd.x);
                Target += (right * move.x + fwd * move.y) * Distance * Time.deltaTime * 0.8f;
            }
            Apply();
        }

        void Apply()
        {
            float yawR = Yaw * Mathf.Deg2Rad, pitchR = Pitch * Mathf.Deg2Rad;
            var dir = new Vector3(Mathf.Cos(pitchR) * Mathf.Cos(yawR), Mathf.Sin(pitchR), Mathf.Cos(pitchR) * Mathf.Sin(yawR));
            transform.position = Target + dir * Distance;
            transform.LookAt(Target);
        }

        // Seguir um ponto (ToppleCam básica chama todo frame).
        public void Follow(Vector3 point, float dist)
        {
            Target = Vector3.Lerp(Target, point, 1f - Mathf.Exp(-3f * Time.deltaTime));
            Distance = Mathf.Lerp(Distance, dist, 1f - Mathf.Exp(-2f * Time.deltaTime));
            Apply();
        }
    }
}
