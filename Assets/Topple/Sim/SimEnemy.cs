// Inimigo do SimWorld com detecção de knock do GDD §6.
// NOTA Unity: um MonoBehaviour por arquivo.
using UnityEngine;

namespace Topple.Sim
{
    public sealed class SimEnemy : MonoBehaviour
    {
        public int Id;
        public Rigidbody Rb { get; private set; }

        // GDD §6: tombado (>50°) por mais de 0,5 s, ou caído da plataforma, ou energia acima do limiar.
        // T1: inclinação + queda + impulso de impacto. Limiares por inimigo viram dado na T5.
        public const float KnockAngleDeg = 50f;
        public const float KnockHoldSeconds = 0.5f;
        public bool Knocked { get; private set; }

        // Soldado "cai com qualquer impacto" (GDD §6): limiar baixo de impulso (N·s).
        // Contato de repouso (peso×dt ≈ 0,08) fica abaixo; uma queda de dominó (≈1,0) passa folgado.
        public float KnockImpulse = 0.25f;
        // Encostou, derrubou (pedido do dono): qualquer toque de corpo DINÂMICO
        // (peça ou soldado arremessado) derruba, mesmo sem impulso. Chão/mesa/
        // obstáculo são kinematic e nunca contam — repousar no chão não derruba.
        public const float TouchEpsilon = 0.0001f;
        bool _touched;
        public float ArmAt;
        float _tiltedSince = -1f;
        float _pendingImpulse;
        float _knockImpulse;
        Vector3 _shoveDir = Vector3.zero;
        float _shoveUntil = -1f;
        Vector3 _shoveLin;
        Vector3 _shoveAng;

        public bool ShoveActive(float now) => Knocked && now <= _shoveUntil;

        void Awake()
        {
            Rb = GetComponent<Rigidbody>();
            if (Rb == null) Rb = gameObject.AddComponent<Rigidbody>();
        }

        public bool CheckKnocked(float now)
        {
            if (Knocked) return false;
            if (now >= ArmAt && (_touched || _pendingImpulse >= KnockImpulse))
            {
                _knockImpulse = _pendingImpulse;
                bool touch = _touched && _pendingImpulse < KnockImpulse;
                _pendingImpulse = 0f;
                _touched = false;
                MarkKnocked(now, touch ? "touch" : "impact");
                return true;
            }
            _pendingImpulse = 0f;
            _touched = false;
            var tilt = Vector3.Angle(transform.up, Vector3.up);
            if (tilt > KnockAngleDeg)
            {
                if (_tiltedSince < 0f) _tiltedSince = now;
                if (now - _tiltedSince >= KnockHoldSeconds) { MarkKnocked(now, "tilt"); return true; }
            }
            else _tiltedSince = -1f;
            return false;
        }

        void OnCollisionEnter(Collision collision)
        {
            if (Knocked) return;
            var imp = collision.impulse.magnitude;
            if (imp > _pendingImpulse) _pendingImpulse = imp;
            // Direção do arremesso: para longe do ponto de contato (o corpo cai
            // para o lado oposto ao golpe — base do encadeamento entre inimigos).
            if (imp >= KnockImpulse && collision.contactCount > 0)
            {
                var away = Rb.worldCenterOfMass - collision.contacts[0].point;
                away.y = 0f;
                _shoveDir = away.sqrMagnitude > 1e-6f ? away.normalized : transform.forward;
                _shoveDir.y = 0f;
                if (_shoveDir.sqrMagnitude < 1e-6f) _shoveDir = Vector3.right;
                _shoveDir.Normalize();
            }
            NoteTouch(collision);
        }

        // Toque de corpo dinâmico (peça ou soldado arremessado): encostou, derruba.
        // Estático/kinematic (chão, mesa, previews) nunca conta.
        void NoteTouch(Collision collision)
        {
            if (Knocked || _touched) return;
            var rb = collision.rigidbody;
            if (rb == null || rb.isKinematic) return;
            if (rb.gameObject == gameObject) return;
            if (collision.impulse.magnitude < TouchEpsilon) return;
            _touched = true;
            if (_shoveDir.sqrMagnitude < 1e-6f && collision.contactCount > 0)
            {
                var away = Rb.worldCenterOfMass - collision.contacts[0].point;
                away.y = 0f;
                if (away.sqrMagnitude > 1e-6f) _shoveDir = away.normalized;
            }
        }

        public void ApplyShove()
        {
            if (Rb == null || Rb.isKinematic) return;
            Rb.linearVelocity = _shoveLin;
            Rb.angularVelocity = _shoveAng;
            Rb.WakeUp();
        }

        public void MarkKnocked(float now, string why)
        {
            Knocked = true;
            if ((why == "impact" || why == "touch") && _shoveDir.sqrMagnitude > 1e-6f && Rb != null && !Rb.isKinematic)
            {
                // Resposta de morte T1 (apresentação final na T3/T7): o corpo é
                // arremessado para longe do golpe e pode atingir o próximo inimigo.
                // A força escala com o impulso recebido: toques derrubam no lugar,
                // golpes lançam — encadeando soldado→soldado. A janela de 0,35 s com
                // velocidade reafirmada atravessa o contato persistente da peça que
                // deu o golpe (determinístico: tudo em tempo de simulação).
                float speed, up, ang;
                if (why == "touch")
                {
                    // Encostou: tomba no lugar, sem voadora (1,6 m/s derruba 1,1 m).
                    speed = 1.6f; up = 1.0f; ang = 3.0f;
                }
                else
                {
                    speed = Mathf.Clamp(2.0f + _knockImpulse * 1.5f, 3.0f, 7.0f);
                    up = 1.5f; ang = 4.0f;
                }
                _shoveLin = _shoveDir * speed + Vector3.up * up;
                _shoveAng = Vector3.Cross(Vector3.up, _shoveDir) * ang;
                _shoveUntil = now + 0.35f;
                ApplyShove();
            }
            // Feedback mínimo T1 (flash/nuvem entram no polimento T7): dessatura o corpo.
            foreach (var r in GetComponentsInChildren<Renderer>())
                foreach (var m in r.materials) m.color = Color.Lerp(m.color, Color.gray, 0.6f);
        }
    }
}
