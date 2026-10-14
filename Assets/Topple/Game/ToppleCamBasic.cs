// T3: Topple Cam básica (GDD §10) — segue o knock mais recente; sem knock novo,
// enquadra o corpo mais rápido. Slow-motion e planos de corte entram na T7.
using UnityEngine;

namespace Topple.Game
{
    public sealed class ToppleCamBasic : MonoBehaviour
    {
        public SimulationController Sim;
        public CameraController Cam;
        // Dono (opção B): câmera 100% manual na sim — auto-follow desligado.
        // T7 (slow-motion/cortes) religa pontualmente.
        public bool AutoFollow = false;
        Vector3 _fallback;
        bool _hasFallback;

        void LateUpdate()
        {
            if (Sim == null || Cam == null || !Sim.Running) return;
            if (!AutoFollow) return;
            if (Sim.LastKnockPoint != Vector3.zero)
            {
                _fallback = Sim.LastKnockPoint;
                _hasFallback = true;
                Cam.Follow(Sim.LastKnockPoint, 14f);
                return;
            }
            if (_hasFallback) { Cam.Follow(_fallback, 16f); return; }
            // Antes do primeiro knock: enquadra o gatilho (origem) de cima.
            Cam.Follow(new Vector3(2f, 0f, 0f), 20f);
        }
    }
}
