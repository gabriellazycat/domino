// Marcador do SimWorld: id estável (ordem de spawn) + Rigidbody.
// Comportamentos de peças do deck (determinísticos, valem headless e ao vivo):
// - Corrida: ao ser tocada por corpo dinâmico, ganha boost p/ frente (+3 m/s).
// - Explosiva: ao encostar em inimigo, detona (controller/mundo aplicam o blast).
// - Encostou, derruba (pedido do dono): corpo DINÂMICO que encosta em peça EM PÉ
//   (tilt < 25°) tomba ela p/ longe do contato (chute 4,5 rad/s, igual ao gatilho).
//   Roçar sem cair não existe mais: a onda vira cadeia garantida por contato
//   (a física ainda anima cada queda). Chão/mesa/rampa são kinematic e nunca
//   contam; peça já caindo não sofre novo chute.
// NOTA Unity: um MonoBehaviour por arquivo.
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    public sealed class SimPiece : MonoBehaviour
    {
        public int Id;
        public PieceId Piece;
        public Rigidbody Rb { get; private set; }

        // Corrida: impulso fixo p/ frente ao ser tocada (1x por sim).
        public const float RunnerBoost = 3.0f;
        // Explosiva: raio da detonação (fixo, determinístico).
        public const float BlastRadius = 1.5f;
        // Encostou, derruba: chute igual ao gatilho (giro no lugar, sem deslizar
        // a base) + limite de em-pé. Toque pré-armado (assentamento) não conta.
        // 6,5 (era 4,5): drape-pin — queda levemente desalinhada deitava SOBRE a
        // próxima e a prendia (<20° p/ sempre); com mais energia a queda
        // atravessa em vez de deitar (empurra a vizinha junto).
        public const float TouchKick = 6.5f;
        public const float StandingDeg = 25f;
        public const float TouchEpsilon = 0.0001f;
        public float ArmAt;
        bool _touched;
        // Contato persistido (Stay) + rescue: peça que levou o 1º chute e ficou
        // APOIADA (<20°) recebe UM 2º chute 0,5 s depois (cura drape-pin: queda
        // que deita sobre a próxima e prende as duas). Capado (máx. 2) p/ a sim
        // assentar; só encostadas que já chutaram uma vez (onda, não cenário).
        bool _stayTouch;
        float _lastKickAt = -10f;
        int _kicks;
        public const int MaxKicks = 2;
        bool _boosted;
        // Explosiva: pendente de detonação (controller/mundo consome).
        public bool BlastPending { get; private set; }

        void Awake()
        {
            Rb = GetComponent<Rigidbody>();
            if (Rb == null) Rb = gameObject.AddComponent<Rigidbody>();
        }

        void OnCollisionEnter(Collision collision)
        {
            if (Rb == null || Rb.isKinematic) return;
            var other = collision.rigidbody;
            if (other == null || other.isKinematic) return;
            if (other.gameObject == gameObject) return;
            if (Piece == PieceId.Runner && !_boosted)
            {
                _boosted = true;
                var fwd = transform.rotation * Vector3.forward;
                fwd.y = 0f;
                if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.right;
                fwd.Normalize();
                Rb.linearVelocity += fwd * RunnerBoost + Vector3.up * 0.5f;
                Rb.WakeUp();
            }
            if (Piece == PieceId.Blast && other.gameObject.GetComponent<SimEnemy>() != null)
                BlastPending = true;
            NoteTouch(collision);
        }

        void OnCollisionStay(Collision collision)
        {
            // Contato mantido com corpo dinâmico (vale p/ o rescue; kinematic
            // nunca conta, como no toque).
            var rb = collision.rigidbody;
            if (rb == null || rb.isKinematic) return;
            if (rb.gameObject == gameObject) return;
            _stayTouch = true;
        }

        // Encostou, derruba: registra que houve contato (o chute sai no passo,
        // com o relógio da sim — callback não tem tempo confiável no headless;
        // a direção sai do facing da peça, não do ponto). Estático/kinematic
        // (chão, mesa, rampa, patrulheiro em loop) nunca conta.
        void NoteTouch(Collision collision)
        {
            if (_touched) return;
            var rb = collision.rigidbody;
            if (rb == null || rb.isKinematic) return;
            if (rb.gameObject == gameObject) return;
            if (collision.impulse.magnitude < TouchEpsilon) return;
            _touched = true;
        }

        // Consome o toque (chamado 1x por passo, como SimEnemy.CheckKnocked):
        // peça em pé tocada por corpo dinâmico tomba p/ onde APONTA (facing).
        // Atingida de qualquer lado, continua a linha que o autor traçou:
        // curvas propagam pela tangente — a normal do contato re-apontava a
        // queda e matava curvas (regressão da fase 2). Retorna true se chutou.
        public bool CheckTouched(float now)
        {
            if (!_touched && !_stayTouch) return false;
            // Contato no assentamento ESPERA (não descarta): peças quase grudadas
            // que o giro inicial encosta antes de 0,25 s valem ao armar. Pops de
            // assentamento não geram Enter em layout válido (Depenetrate separa).
            if (now < ArmAt) return false;
            if (Rb == null || Rb.isKinematic) return false;
            float tilt = Vector3.Angle(transform.up, Vector3.up);
            if (tilt > StandingDeg) { _touched = false; _stayTouch = false; return false; } // já caindo
            bool fresh = _touched;
            _touched = false;
            _stayTouch = false;
            // Rescue: 1º chute não derrubou e segue encostada e apoiada (8-25°)
            // 0,5 s depois = drape-pin: um 2º chute (capado) p/ soltar. Limiar
            // em 8° (não 3°): abaixo disso o rescue interferia na serpentina
            // saudável (re-chutes redirecionavam quedas e quebravam a cadeia).
            // Em pé e quieta (sem chute anterior) nunca re-chuta (cenário intacto).
            if (!fresh)
            {
                if (_kicks < 1 || _kicks >= MaxKicks) return false;
                if (tilt < 8f || now - _lastKickAt < 0.5f) return false;
            }
            var fwd = transform.forward;
            fwd.y = 0f;
            if (fwd.sqrMagnitude < 1e-6f) fwd = Vector3.right;
            fwd.Normalize();
            Rb.angularVelocity = Vector3.Cross(Vector3.up, fwd) * TouchKick;
            Rb.WakeUp();
            _kicks++;
            _lastKickAt = now;
            return true;
        }

        public bool ConsumeBlast(float now)
        {
            if (!BlastPending) return false;
            // Contato no assentamento não detona: blast nascendo encostado no
            // inimigo explodia sozinho no t≈0 e os corpos atingiam as peças
            // vizinhas (parecia "só de existir já derruba"). Só vale armado.
            if (now < ArmAt) { BlastPending = false; return false; }
            BlastPending = false;
            return true;
        }
    }
}
