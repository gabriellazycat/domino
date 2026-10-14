// Patrulha vitrine no planejamento (dono): o patrulheiro anda no loop
// enquanto se planeja, SEM interagir (sem bulldoze, sem kill, sem física).
// Move só os transforms dos previews; SoldierSpots, mão e sim intactos.
// NOTA: um MonoBehaviour por arquivo (regra do repo).
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;

namespace Topple.Game
{
    public sealed class PlanningPatrol : MonoBehaviour
    {
        readonly List<Transform> _gos = new();
        readonly List<List<(float x, float z)>> _loops = new();
        readonly List<float> _speeds = new();
        float _t0;
        bool _running;

        public int Count => _gos.Count;

        // P/ testes: posição atual do preview i (sem expor a lista viva).
        public Vector3 PreviewPos(int i) =>
            (i >= 0 && i < _gos.Count && _gos[i] != null) ? _gos[i].position : Vector3.zero;

        public void Rebuild(List<(Transform go, List<Vector3> loop, float speed)> items)
        {
            _gos.Clear(); _loops.Clear(); _speeds.Clear();
            _running = false;
            if (items == null) return;
            foreach (var it in items)
            {
                if (it.go == null || it.loop == null || it.loop.Count < 2) continue;
                var l = new List<(float x, float z)>(it.loop.Count);
                foreach (var w in it.loop) l.Add((w.x, w.z));
                _gos.Add(it.go); _loops.Add(l); _speeds.Add(it.speed);
            }
            _t0 = Time.time;
            _running = _gos.Count > 0;
        }

        public void Clear()
        {
            _gos.Clear(); _loops.Clear(); _speeds.Clear();
            _running = false;
        }

        void Update()
        {
            if (!_running) return;
            float t = Time.time - _t0;
            for (int i = 0; i < _gos.Count; i++)
            {
                var g = _gos[i];
                if (g == null) continue;
                var (x, z) = PatrolPath.PosAt(_loops[i], _speeds[i], t);
                var p = g.position;
                p.x = x; p.z = z;
                g.position = p;
            }
        }
    }
}
