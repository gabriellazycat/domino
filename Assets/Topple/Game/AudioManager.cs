// T3: SFX da simulação — um clique por derrubada (8 variações em ciclo).
// T4: stingers de vitória/derrota (win/lose sintetizados). Clipes carregados
// do Generated no Editor; Resources em builds (sincronizados pelo GenerateAll).
using System.Collections.Generic;
using UnityEngine;

namespace Topple.Game
{
    public sealed class AudioManager : MonoBehaviour
    {
        AudioSource _src;
        readonly List<AudioClip> _clicks = new();
        AudioClip _ui, _win, _lose;
        int _next;

        void Awake()
        {
            _src = gameObject.AddComponent<AudioSource>();
            _src.playOnAwake = false;
            for (int i = 0; i < 8; i++)
            {
                var c = LoadClip($"click{i}");
                if (c != null) _clicks.Add(c);
            }
            _ui = LoadClip("ui_click");
            _win = LoadClip("win");
            _lose = LoadClip("lose");
        }

        static AudioClip LoadClip(string name)
        {
#if UNITY_EDITOR
            var c = UnityEditor.AssetDatabase.LoadAssetAtPath<AudioClip>($"Assets/Generated/Audio/{name}.wav");
            if (c != null) return c;
#endif
            return Resources.Load<AudioClip>("Generated/Audio/" + name);
        }

        public void Knock()
        {
            if (_clicks.Count == 0 || _src == null) return; // sem clipes = mudo, sem erro
            _src.PlayOneShot(_clicks[_next % _clicks.Count]);
            _next++;
        }

        // Feedback de interface (colocar/remover/desfazer/recarregar). Sem
        // AudioListener ou sem clipe = silencioso, nunca erro (headless ok).
        public void UiClick()
        {
            if (_ui == null || _src == null) return;
            _src.PlayOneShot(_ui);
        }

        // Stingers T4 (vitória/derrota da run). Null-safe como o resto.
        public void Win()
        {
            if (_win == null || _src == null) return;
            _src.PlayOneShot(_win);
        }

        public void Lose()
        {
            if (_lose == null || _src == null) return;
            _src.PlayOneShot(_lose);
        }
    }
}
