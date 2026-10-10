// GDD §12: Player toca a gravação (réplicas cinemáticas + interpolação).
// Todos — inclusive o host — tocam a mesma gravação. Interpola keyframes ~25-30 Hz.
using System.Collections.Generic;
using UnityEngine;
using Topple.Core;

namespace Topple.Sim
{
    public sealed class SimPlayer : MonoBehaviour
    {
        SimRecording _rec;
        readonly Dictionary<int, Transform> _replicas = new();
        float _time;
        bool _playing;

        public float Time => _time;
        public bool Playing => _playing;
        public float Duration => _rec == null || _rec.Frames.Length == 0
            ? 0f : _rec.Frames[^1].Step / _rec.Header.StepHz;

        public void Load(SimRecording rec)
        {
            _rec = rec; _time = 0f; _playing = false;
            foreach (var kv in _replicas) if (kv.Value != null) Destroy(kv.Value.gameObject);
            _replicas.Clear();
        }

        public void Play() => _playing = true;
        public void Pause() => _playing = false;

        public void Sample(float time)
        {
            if (_rec == null || _rec.Frames.Length == 0) return;
            _time = Mathf.Clamp(time, 0f, Duration);
            int i = 0;
            while (i + 1 < _rec.Frames.Length && _rec.Frames[i + 1].Step / _rec.Header.StepHz <= _time) i++;
            var a = _rec.Frames[i];
            var b = _rec.Frames[Mathf.Min(i + 1, _rec.Frames.Length - 1)];
            float ta = a.Step / _rec.Header.StepHz, tb = b.Step / _rec.Header.StepHz;
            float t = tb > ta ? (_time - ta) / (tb - ta) : 0f;
            var bm = new Dictionary<int, SimSample>();
            foreach (var s in b.Samples) bm[s.Id] = s;
            foreach (var s in a.Samples)
            {
                var tr = Replica(s.Id);
                if (bm.TryGetValue(s.Id, out var s2))
                {
                    tr.SetPositionAndRotation(
                        Vector3.Lerp(s.Pos, s2.Pos, t),
                        Quaternion.Slerp(s.Rot, s2.Rot, t));
                }
                else tr.SetPositionAndRotation(s.Pos, s.Rot);
            }
        }

        void Update()
        {
            if (!_playing) return;
            Sample(_time + UnityEngine.Time.deltaTime);
            if (_time >= Duration) _playing = false;
        }

        Transform Replica(int id)
        {
            if (!_replicas.TryGetValue(id, out var tr) || tr == null)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.name = $"Replay_{id}";
                Object.Destroy(go.GetComponent<Collider>());
                var rend = go.GetComponent<Renderer>();
                if (rend != null) rend.material.color = new Color(0.95f, 0.55f, 0.16f);
                // Peça fantasma: sem física.
                tr = go.transform;
                _replicas[id] = tr;
            }
            return tr;
        }
    }
}
