// Juice visual (mood Inscryption + cartas estilo Balatro): mesa escura, vela,
// poeira no knock, pulso do trigger. 100% visual: sem colisor, sem física,
// sem efeito em lógica ou teste (só embeleza o que já existe).
using UnityEngine;

namespace Topple.Game
{
    public sealed class ToppleJuice : MonoBehaviour
    {
        ParticleSystem _dust;
        Light _candle;
        float _candleBase = 14f;
        float _flickSeed;
        float _flash;
        Transform _markDisc, _markArrow;
        Vector3 _discBase = Vector3.one, _arrowBase = Vector3.one;
        Material _markMat;

        void Awake()
        {
            _flickSeed = (float)(GetInstanceID() % 100) * 0.37f;
        }

        // Mesa escura: fundo quase-preto quente, luz ambiente baixa, sol mais
        // quente, grama escurecida (instância — nunca o asset gerado).
        public void EnsureMood(Camera cam)
        {
            if (cam != null)
            {
                cam.backgroundColor = new Color(0.045f, 0.032f, 0.028f);
                cam.clearFlags = CameraClearFlags.SolidColor;
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.32f, 0.26f, 0.22f);
            foreach (var l in GetComponentsInChildren<Light>(true))
            {
                if (l != null && l.type == LightType.Directional)
                {
                    l.color = new Color(1f, 0.82f, 0.62f);
                    l.intensity = 1.05f;
                }
            }
            var grass = transform.Find("GrassVisual");
            if (grass == null) grass = transform.Find("ToppleT3/GrassVisual");
            if (grass != null)
            {
                var r = grass.GetComponent<Renderer>();
                if (r != null)
                {
                    var m = new Material(r.sharedMaterial);
                    m.color = new Color(0.16f, 0.30f, 0.16f, 1f); // feltro escuro
                    r.material = m;
                }
            }
            if (_candle == null)
            {
                var go = new GameObject("CandleLight");
                go.transform.SetParent(transform, false);
                go.transform.position = new Vector3(-2.5f, 2.2f, -2.5f);
                _candle = go.AddComponent<Light>();
                _candle.type = LightType.Point;
                _candle.color = new Color(1f, 0.55f, 0.26f);
                _candle.intensity = _candleBase;
                _candle.range = 20f;
                _candle.shadows = LightShadows.None;
            }
            if (_dust == null)
            {
                var go = new GameObject("KnockDust");
                go.transform.SetParent(transform, false);
                _dust = go.AddComponent<ParticleSystem>();
                var main = _dust.main;
                main.maxParticles = 160;
                main.startLifetime = 0.7f;
                main.startSpeed = 1.4f;
                main.startSize = 0.13f;
                main.gravityModifier = 0.35f;
                main.startColor = new Color(0.85f, 0.74f, 0.60f, 0.6f);
                main.simulationSpace = ParticleSystemSimulationSpace.World;
                var emission = _dust.emission;
                emission.enabled = false;
                var shape = _dust.shape;
                shape.shapeType = ParticleSystemShapeType.Sphere;
                shape.radius = 0.25f;
            }
        }

        // Material do marcador: shader próprio com fallback p/ Lit.
        public Material TriggerMaterial()
        {
            if (_markMat != null) return _markMat;
            var sh = Shader.Find("Topple/PulseUnlit");
            if (sh != null) _markMat = new Material(sh);
            else
            {
                _markMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                _markMat.color = new Color(0.15f, 0.85f, 0.45f);
            }
            _markMat.color = new Color(0.15f, 0.85f, 0.45f, 0.9f);
            return _markMat;
        }

        public void SetTriggerMark(Transform disc, Transform arrow)
        {
            _markDisc = disc;
            _markArrow = arrow;
            if (disc != null) _discBase = disc.localScale;
            if (arrow != null) _arrowBase = arrow.localScale;
        }

        public void ClearTriggerMark()
        {
            _markDisc = null;
            _markArrow = null;
        }

        // Puff de poeira onde o corpo caiu (knock). Big = blast/vitória.
        public void Puff(Vector3 pos, bool big = false)
        {
            if (_dust == null) return;
            var p = new ParticleSystem.EmitParams { position = pos + Vector3.up * 0.3f };
            _dust.Emit(p, big ? 26 : 10);
        }

        // Flash da vela na vitória.
        public void Flash() => _flash = 1f;

        void Update()
        {
            float t = Time.time + _flickSeed;
            if (_candle != null)
            {
                float flick = 1f + 0.10f * Mathf.Sin(t * 13f) + 0.06f * Mathf.Sin(t * 29f + 1.7f);
                _flash = Mathf.Max(0f, _flash - Time.deltaTime * 1.5f);
                _candle.intensity = _candleBase * flick * (1f + 0.8f * _flash);
            }
            if (_markDisc != null)
            {
                float s = 1f + 0.07f * Mathf.Sin(t * 4f);
                _markDisc.localScale = new Vector3(_discBase.x * s, _discBase.y, _discBase.z * s);
            }
            if (_markArrow != null)
            {
                float s = 1f + 0.10f * Mathf.Sin(t * 4f + 0.6f);
                _markArrow.localScale = new Vector3(_arrowBase.x, _arrowBase.y, _arrowBase.z * s);
            }
        }
    }
}
