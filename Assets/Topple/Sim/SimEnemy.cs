// Inimigo do SimWorld com detecção de knock do GDD §6.
// NOTA Unity: um MonoBehaviour por arquivo.
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    public sealed class SimEnemy : MonoBehaviour
    {
        public int Id;
        public Topple.Core.EnemyKind Kind;
        public Topple.Core.Team Team; // time narrativo (só visual; lógica ignora)
        public Rigidbody Rb { get; private set; }

        // GDD §6: tombado (>50°) por mais de 0,5 s, ou caído da plataforma, ou energia acima do limiar.
        // T1: inclinação + queda + impulso de impacto. Limiares por inimigo viram dado na T5.
        public const float KnockAngleDeg = 50f;
        public const float KnockHoldSeconds = 0.5f;
        public bool Knocked { get; private set; }

        // Soldado "cai com qualquer impacto" (GDD §6): limiar baixo de impulso (N·s).
        // Contato de repouso (peso×dt ≈ 0,08) fica abaixo; uma queda de dominó (≈1,0) passa folgado.
        public float KnockImpulse = 0.25f;
        // Pesadão (estrito, decisão do dono): SÓ peça pesada (impulso alto) e
        // explosão derrubam. Toque/tilt/splash de pelotão ele ignora (RESISTE).
        // Refinamento 11/out/2026 (dono): TOQUE DE PESADA também derruba —
        // o limiar 2.0 N·s por passo nunca dispara no encosto (a pesada deita
        // em cima sem um passo ≥ 2.0). Toque de comum/runner continua ignorado.
        // Queda pra fora da plataforma mata qualquer um (chamadores, não aqui).
        public float HeavyKnockImpulse = 2.0f;
        // Patrulheiro: loop fechado em função do tempo (cinemático, determinístico
        // headless e ao vivo). Ao cair, vira corpo dinâmico (isKinematic=false).
        public List<Vector3> Patrol = new List<Vector3>();
        public float PatrolSpeed = 0.3f;
        float _patrolDist;
        // Encostou, derrubou (pedido do dono): qualquer toque de corpo DINÂMICO
        // (peça ou soldado arremessado) derruba, mesmo sem impulso. Chão/mesa/
        // obstáculo são kinematic e nunca contam — repousar no chão não derruba.
        public const float TouchEpsilon = 0.0001f;
        bool _touched;
        bool _touchedHeavy; // toque de peça pesada (único toque que derruba pesadão)
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
            float need = Kind == Topple.Core.EnemyKind.Brute ? HeavyKnockImpulse : KnockImpulse;
            // Pesadão ignora toque comum e tilt: só impulso de pesada, TOQUE DE
            // PESADA (ou blast, via MarkKnocked).
            if (now >= ArmAt && ((Kind != Topple.Core.EnemyKind.Brute && _touched) || (Kind == Topple.Core.EnemyKind.Brute && _touchedHeavy) || _pendingImpulse >= need))
            {
                _knockImpulse = _pendingImpulse;
                bool touch = (Kind != Topple.Core.EnemyKind.Brute && _touched && _pendingImpulse < KnockImpulse) || (Kind == Topple.Core.EnemyKind.Brute && _touchedHeavy && _pendingImpulse < need);
                _pendingImpulse = 0f;
                _touched = false;
                _touchedHeavy = false;
                MarkKnocked(now, touch ? "touch" : "impact");
                return true;
            }
            _pendingImpulse = 0f;
            _touched = false;
            _touchedHeavy = false;
            if (Kind == Topple.Core.EnemyKind.Brute) return false; // sem tilt p/ pesadão
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
        // Pesadão: só o toque de PESADA conta (comum/runner ele ignora).
        // Patrulheiro em ronda: encosto manso (ele andando na peça parada) NÃO
        // conta — ele EMPURRA a peça (TryBulldoze, no passo). Só peça CAINDO
        // (impulso ≥ limiar) mata patrulheiro.
        void NoteTouch(Collision collision)
        {
            if (Knocked || (_touched && _touchedHeavy)) return;
            var rb = collision.rigidbody;
            if (rb == null || rb.isKinematic) return;
            if (rb.gameObject == gameObject) return;
            if (collision.impulse.magnitude < TouchEpsilon) return;
            if (Kind == Topple.Core.EnemyKind.Patroller && Patrol.Count >= 2
                && collision.impulse.magnitude < KnockImpulse) return;
            _touched = true;
            var sp = rb.gameObject.GetComponent<SimPiece>();
            if (sp != null && sp.Piece == Topple.Core.PieceId.Heavy) _touchedHeavy = true;
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

        public void MarkKnocked(float now, string why, Vector3 blastDir = default, float blastForce = 0f)
        {
            Knocked = true;
            // Patrulheiro derrubado vira corpo dinâmico (para de patrulhar).
            if (Patrol.Count > 0 && Rb != null) Rb.isKinematic = false;
            // Explosiva: direção e força vêm da detonação (espalha de verdade).
            if (blastForce > 0f && blastDir.sqrMagnitude > 1e-6f)
            {
                _shoveDir = blastDir.normalized;
                _knockImpulse = blastForce;
                why = "impact";
            }
            if ((why == "impact" || why == "touch" || why == "splash") && _shoveDir.sqrMagnitude > 1e-6f && Rb != null && !Rb.isKinematic)
            {
                // Resposta de morte T1 (apresentação final na T3/T7): o corpo é
                // arremessado para longe do golpe e pode atingir o próximo inimigo.
                // A força escala com o impulso recebido: toques derrubam no lugar,
                // golpes lançam — encadeando soldado→soldado. A janela de 0,35 s com
                // velocidade reafirmada atravessa o contato persistente da peça que
                // deu o golpe (determinístico: tudo em tempo de simulação).
                float speed, up, ang;
                if (why == "touch" || why == "splash")
                {
                    // Encostou: tomba e espirra p/ limpar o pelotão (2,2 m/s alcança
                    // o vizinho a ~0,6 m). Sem voadora exagerada.
                    speed = 2.2f; up = 1.2f; ang = 3.0f;
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

        // Patrulha cinemática: posição em função do tempo de sim (loop fechado,
        // velocidade constante). Determinístico headless e ao vivo (golden intacto).
        // Retorna false se não há loop (parado).
        public bool PatrolAdvance(float now)
        {
            if (Knocked || Patrol.Count < 2) return false;
            float total = 0f;
            for (int i = 0; i < Patrol.Count; i++)
            {
                var a = Patrol[i];
                var b = Patrol[(i + 1) % Patrol.Count];
                var d = b - a; d.y = 0f;
                total += d.magnitude;
            }
            if (total < 1e-4f) return false;
            float target = (now * PatrolSpeed) % total;
            for (int i = 0; i < Patrol.Count; i++)
            {
                var a = Patrol[i];
                var b = Patrol[(i + 1) % Patrol.Count];
                var d = b - a; d.y = 0f;
                float seg = d.magnitude;
                if (target <= seg)
                {
                    float t = seg < 1e-6f ? 0f : target / seg;
                    var p = a + (b - a) * t;
                    p.y = transform.position.y;
                    transform.position = p;
                    if (Rb != null)
                    {
                        Rb.position = p;
                        Rb.linearVelocity = Vector3.zero;
                        Rb.angularVelocity = Vector3.zero;
                    }
                    return true;
                }
                target -= seg;
            }
            return false;
        }

        // Pelotão morre junto (pedido do dono): derrubado espirra o vizinho até
        // 0,8 m — sem isso a limpeza do último virava loteria de tumulto (a direção
        // do arremesso foge do triângulo). Em saltos (A→B→C), determinístico.
        // Só dispara DE derrubados: no spawn ninguém está derrubado (sem friendly-fire).
        // Pesadão resiste ao splash (só pesada/explosão/queda).
        public const float SplashRadius = 0.8f;

        // Bulldoze da patrulha: andando na peça EM PÉ, empurra ela (estraga o
        // caminho do jogador). Peça já caindo não sofre — ela que mata o
        // patrulheiro, pelo impulso (NoteTouch). Chamado 1x por passo, com o
        // relógio da sim (vale headless e ao vivo, determinístico).
        public const float PushRadius = 0.55f;
        public const float PushSpeed = 2.4f;
        public const float PushCooldown = 0.35f;
        float _lastPush = -10f;

        public bool TryBulldoze(SimPiece piece, float now)
        {
            if (Knocked || Patrol.Count < 2) return false;
            if (piece == null) return false;
            var prb = piece.Rb;
            if (prb == null || prb.isKinematic) return false;
            if (now - _lastPush < PushCooldown) return false;
            float tilt = Vector3.Angle(piece.transform.up, Vector3.up);
            if (tilt > SimPiece.StandingDeg) return false; // caindo: ela mata, não ele
            var d = piece.transform.position - transform.position;
            d.y = 0f;
            if (d.sqrMagnitude > PushRadius * PushRadius) return false;
            if (d.sqrMagnitude < 1e-6f) d = transform.forward;
            d.y = 0f;
            if (d.sqrMagnitude < 1e-6f) d = Vector3.right;
            d.Normalize();
            prb.linearVelocity = d * PushSpeed + Vector3.up * 0.6f;
            prb.angularVelocity = Vector3.Cross(Vector3.up, d) * 3.5f;
            prb.WakeUp();
            _lastPush = now;
            return true;
        }

        public static void Splash(SimEnemy from, System.Collections.Generic.IList<SimEnemy> all, float now)
        {
            for (int pass = 0; pass < 3; pass++)
            {
                bool fresh = false;
                foreach (var o in all)
                {
                    if (o == null || o == from || o.Knocked) continue;
                    if (o.Kind == Topple.Core.EnemyKind.Brute) continue; // resiste ao splash
                    bool near = false;
                    foreach (var k in all)
                    {
                        if (k == null || k == o || !k.Knocked) continue;
                        var d = o.transform.position - k.transform.position;
                        d.y = 0f;
                        // Epsilon 1e-6: 0,8 exato + jitter ±0,002 virava roleta
                        // (coluna da fase 5). Design continua 0,8 m.
                        if (d.sqrMagnitude <= SplashRadius * SplashRadius + 1e-6f) { near = true; break; }
                    }
                    if (!near) continue;
                    var away = o.transform.position - from.transform.position;
                    away.y = 0f;
                    o._shoveDir = away.sqrMagnitude > 1e-6f ? away.normalized : Vector3.right;
                    o.MarkKnocked(now, "splash");
                    fresh = true;
                }
                if (!fresh) break;
            }
        }
    }
}
