// T3: monta a fase tutorial (GDD §15.4 T3) — mesa, 3 soldados,
// mão de 16 comuns (folga p/ adensar curva fechada), câmera, HUD e fiação.
// Usado pela cena Tutorial.unity e pelos testes (construção programática).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using Topple.Core;
using Topple.Sim;
using Topple.UI;

namespace Topple.Game
{
    public sealed class TutorialSetup : MonoBehaviour
    {
        public PlanningController Planning;
        public SimulationController Sim;
        public PlanningHUD Hud;
        public CameraController Cam;
        public AudioManager Audio;
        public List<Vector3> SoldierSpots = new();
        public SimResult? LastResult { get; private set; }

        GameObject _previews;
        bool _inited;
        int _knocksHeard;

        public static TutorialSetup Build(string rootName = "ToppleT3")
        {
            SimBuilder.EnsurePhysicsDefaults();
            foreach (var c in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None))
                c.enabled = false; // uma câmera por vez (a nossa vira MainCamera)
            // Ouvintes antigos continuariam ativos mesmo com a câmera desligada
            // (2 AudioListeners = som dobrado + spam nos testes). Desliga todos;
            // o nosso é criado abaixo.
            foreach (var l in Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None))
                l.enabled = false;

            var root = new GameObject(rootName);
            var setup = root.AddComponent<TutorialSetup>();

            // Chão físico 24×16 (topo y=0) + grama visual + mesa de madeira.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "GroundPhysics";
            ground.transform.SetParent(root.transform, false);
            ground.transform.localScale = new Vector3(24f, 0.5f, 16f);
            ground.transform.position = new Vector3(0f, -0.25f, 0f);
            var grb = ground.GetComponent<Rigidbody>();
            if (grb == null) grb = ground.AddComponent<Rigidbody>();
            grb.isKinematic = true;
            // Mesmo atrito do headless: sem isto o chão ao vivo patina e o humano perde.
            var gcol = ground.GetComponent<Collider>();
            if (gcol != null)
            {
                var box = gcol as BoxCollider;
                if (box != null) box.material = SimBuilder.Wood;
            }
            Object.Destroy(ground.GetComponent<Renderer>());

            var grass = GameObject.CreatePrimitive(PrimitiveType.Cube);
            grass.name = "GrassVisual";
            grass.transform.SetParent(root.transform, false);
            grass.transform.localScale = new Vector3(24f, 0.1f, 16f);
            grass.transform.position = new Vector3(0f, -0.05f, 0f);
            grass.GetComponent<Renderer>().sharedMaterial = GrassMat();
            Object.Destroy(grass.GetComponent<Collider>());

            var tablePrefab = PrefabRegistry.Table();
            if (tablePrefab != null)
            {
                var table = Instantiate(tablePrefab, root.transform);
                table.transform.position = new Vector3(0f, -1.01f, 0f);
                var trb = table.GetComponent<Rigidbody>();
                if (trb != null) trb.isKinematic = true;
            }

            // Sol da cena (GDD §13.4): direcional quente com sombras suaves.
            var sun = new GameObject("Sun");
            sun.transform.SetParent(root.transform, false);
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
            var sunLight = sun.AddComponent<Light>();
            sunLight.type = LightType.Directional;
            sunLight.color = new Color(1f, 0.914f, 0.769f);
            sunLight.intensity = 1.1f;
            sunLight.shadows = LightShadows.Soft;

            // Câmera + input + planejamento + simulação + ToppleCam.
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(root.transform, false);
            var camComp = camGo.GetComponent<Camera>();
            if (camComp == null) camComp = camGo.AddComponent<Camera>();
            camComp.fieldOfView = 30f;
            camComp.enabled = true;
            var listener = camGo.GetComponent<AudioListener>();
            if (listener == null) listener = camGo.AddComponent<AudioListener>();
            listener.enabled = true; // sem isto o jogo sai mudo
            camGo.AddComponent<PlanningInput>();
            setup.Cam = camGo.AddComponent<CameraController>();
            setup.Planning = root.AddComponent<PlanningController>();
            setup.Sim = root.AddComponent<SimulationController>();
            setup.Audio = root.AddComponent<AudioManager>();
            var toppleCam = root.AddComponent<ToppleCamBasic>();
            toppleCam.Sim = setup.Sim;
            toppleCam.Cam = setup.Cam;

            // HUD (UI Toolkit).
            var uiGo = new GameObject("HUD");
            uiGo.transform.SetParent(root.transform, false);
            var doc = uiGo.AddComponent<UIDocument>();
            doc.panelSettings = MakePanelSettings();
            var vta = LoadUxml();
            if (vta != null)
            {
                doc.visualTreeAsset = vta;
                var uss = LoadUss();
                if (uss != null) doc.rootVisualElement.styleSheets.Add(uss);
            }
            else BuildFallbackUI(doc);
            setup.Hud = uiGo.AddComponent<PlanningHUD>();

            setup.InitScenario();
            return setup;
        }

        void Start()
        {
            // Estado de MonoBehaviour (mão, trigger, assinaturas) NÃO é serializado:
            // ao abrir a cena salva, reconstrói tudo aqui. No Build, InitScenario
            // já rodou e a guarda impede duplicar.
            if (!_inited) InitScenario();
        }

        void InitScenario()
        {
            if (_inited) return;
            _inited = true;

            // Re-resolve componentes (por segurança) e limpa restos salvos.
            if (Planning == null) Planning = GetComponent<PlanningController>();
            if (Sim == null) Sim = GetComponent<SimulationController>();
            if (Audio == null) Audio = GetComponent<AudioManager>();
            if (Cam == null) Cam = GetComponentInChildren<CameraController>();
            if (Hud == null) Hud = GetComponentInChildren<PlanningHUD>();
            // Ouvinte de áudio (cenas salvas antes do fix não têm; cenas poluídas têm 2).
            // Humano real: exatamente 1 ativo, no nossa câmera.
            foreach (var l in GetComponentsInChildren<AudioListener>(true))
                l.enabled = false;
            foreach (var l in Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None))
            {
                if (l != null && (Cam == null || l.gameObject != Cam.gameObject))
                    l.enabled = false;
            }
            var ours = Cam != null ? Cam.GetComponent<AudioListener>() : null;
            if (ours == null && Cam != null) ours = Cam.gameObject.AddComponent<AudioListener>();
            if (ours != null) ours.enabled = true;
            var oldViews = Planning.transform.Find("Views");
            if (oldViews != null) Destroy(oldViews.gameObject);
            var oldPrev = transform.Find("SoldierPreviews");
            if (oldPrev != null) Destroy(oldPrev.gameObject);
            var oldBlocks = transform.Find("BlockPreviews");
            if (oldBlocks != null) Destroy(oldBlocks.gameObject);
            _previews = null;
            _blockPreviews = null;

            // HUD (re-assina: delegates não serializam).
            var doc = GetComponentInChildren<UIDocument>();
            Hud.Setup(doc);
            Planning.Hud = Hud; // p/ OverUI ignorar cliques nos botões
            Planning.Audio = Audio; // cliques de interface (colocar/remover)
            Hud.OnSelect += Planning.Select;
            Hud.OnFire += Planning.Fire;
            Hud.OnUndo += () => Planning.Undo();
            Hud.OnReload += ReloadPhase;
            Hud.OnAgain += BackToPlanning;
            Hud.OnNext += NextPhase;

            LoadPhase(0);
        }

        // Fases artesanais (solver e ~20 arquétipos entram na T5).
        [System.Serializable]
        public struct BlockDef { public Vector3 Center; public Vector3 Size; }

        public struct PhaseDef
        {
            public string Name;
            public int Commons, Heavies, Ramps;
            public int TriggerGx, TriggerGz; public float TriggerDeg;
            public List<Vector3> Soldiers;
            public List<BlockDef> Blocks;
        }

        public static readonly List<PhaseDef> Phases = new()
        {
            new PhaseDef { // 1. Primeira Queda (geometria validada T1/T3)
                Name = "Primeira Queda", Commons = 16, Heavies = 0, Ramps = 0,
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                Soldiers = new() { new(4.55f, 0f, 0f), new(5.15f, 0f, 0f), new(5.75f, 0f, 0f) },
                Blocks = new(),
            },
            new PhaseDef { // 2. Curva do Muro: contorna o bloco e cai no pelotão
                Name = "Curva do Muro", Commons = 16, Heavies = 0, Ramps = 0,
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                Soldiers = new() { new(3.7f, 0f, -0.7f), new(4.25f, 0f, -0.65f), new(3.95f, 0f, -0.15f) },
                Blocks = new() { new BlockDef { Center = new(2.2f, 0.5f, 0.9f), Size = new(1.2f, 1.0f, 1.2f) } },
            },
            new PhaseDef { // 3. Peso Pesado: arco + pelotão de 4
                Name = "Peso Pesado", Commons = 16, Heavies = 1, Ramps = 0,
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                Soldiers = new() { new(3.7f, 0f, 0.9f), new(4.25f, 0f, 0.9f), new(3.975f, 0f, 0.42f), new(4.7f, 0f, 0.5f) },
                Blocks = new(),
            },
        };

        public int PhaseIndex { get; private set; }
        public string PhaseName => Phases[PhaseIndex].Name;
        public IReadOnlyList<BlockDef> PhaseBlocks => Phases[PhaseIndex].Blocks;

        public void LoadPhase(int i)
        {
            PhaseIndex = Mathf.Clamp(i, 0, Phases.Count - 1);
            var ph = Phases[PhaseIndex];
            Sim.StopSim();
            Planning.Data.Clear();
            Planning.Active = true;
            LastResult = null;

            Planning.Data.SetHand(PieceId.Common, ph.Commons);
            Planning.Data.SetHand(PieceId.Heavy, ph.Heavies);
            Planning.Data.SetHand(PieceId.Ramp, ph.Ramps);
            // Tabuleiro vazio: nada pré-colocado, nada travado. A 1ª peça que o
            // jogador colocar (menor InstanceId) recebe o impulso e cai primeiro.
            // TriggerGx/Gz/Deg viram só sugestão de direção inicial + mira.
            Planning.Select(PieceId.Common);
            Planning.SetRotDeg(ph.TriggerDeg);
            Planning.ArmPathDefault(); // trilha sempre ligada
            SoldierSpots = new List<Vector3>(ph.Soldiers);
            Planning.Soldiers = new List<Vector3>(ph.Soldiers);
            Planning.Forbidden = new List<PlanningController.ForbiddenZone>();
            foreach (var b in ph.Blocks)
            {
                float r = Mathf.Max(b.Size.x, b.Size.z) * 0.5f + 0.2f;
                Planning.Forbidden.Add(new PlanningController.ForbiddenZone { C = new Vector3(b.Center.x, 0f, b.Center.z), R = r });
            }
            SpawnSoldierPreviews();
            SpawnBlockPreviews();
            EnsureZone();
            _zone.SetActive(true);
            // Câmera enquadra os soldados (sem trigger: tabuleiro começa vazio).
            var mid = Vector3.zero;
            foreach (var s in SoldierSpots) mid += s;
            mid /= Mathf.Max(1, SoldierSpots.Count);
            float spread = 0f;
            foreach (var s in SoldierSpots) spread = Mathf.Max(spread, Vector3.Distance(s, mid));
            Cam.Target = mid;
            Cam.Distance = Mathf.Clamp(spread * 3.2f, 8f, 22f);
            Planning.Rebuild();
            Planning.OnFire -= StartSim; Planning.OnFire += StartSim; // sem duplicar
            Planning.OnConfirm -= ConfirmBanner; Planning.OnConfirm += ConfirmBanner;
            Planning.OnReload -= ReloadPhase; Planning.OnReload += ReloadPhase;
            Sim.OnDone -= OnSimDone; Sim.OnDone += OnSimDone;
            Hud.HideResult();
            Hud.SetPhase("Fase " + (PhaseIndex + 1) + ": " + ph.Name);
            Hud.RefreshTray(Planning.Selected, Planning.Data.HandCount);
            Hud.SetStatus(0, SoldierSpots.Count);
            Debug.Log($"[TOPPLE][GAME] fase {PhaseIndex + 1}/{Phases.Count}: {ph.Name}");
        }

        public void NextPhase()
        {
            if (LastResult == null || !LastResult.Value.Win) return; // só com vitória
            if (PhaseIndex + 1 < Phases.Count) LoadPhase(PhaseIndex + 1);
        }

        // Botão Recarregar / Ctrl+Y: fase atual toda do zero (mão cheia, vazio).
        // Vale no planejamento e na simulação (LoadPhase para a sim).
        public void ReloadPhase()
        {
            if (Audio != null) Audio.UiClick();
            LoadPhase(PhaseIndex);
        }

        void SpawnSoldierPreviews()
        {
            if (_previews == null)
            {
                var old = FindOrNull("SoldierPreviews");
                if (old != null) Destroy(old.gameObject);
            }
            if (_previews != null) Destroy(_previews);
            _previews = new GameObject("SoldierPreviews");
            _previews.transform.SetParent(transform, false);
            var prefab = PrefabRegistry.Soldier();
            if (prefab == null) return;
            foreach (var s in SoldierSpots)
            {
                var go = Instantiate(prefab, _previews.transform);
                go.transform.SetPositionAndRotation(s, Quaternion.identity);
                var rb = go.GetComponent<Rigidbody>();
                if (rb != null) rb.isKinematic = true;
            }
        }

        GameObject _blockPreviews;

        Transform FindOrNull(string name) => transform.Find(name);

        void SpawnBlockPreviews()
        {
            if (_blockPreviews == null)
            {
                var old = FindOrNull("BlockPreviews");
                if (old != null) Destroy(old.gameObject);
            }
            if (_blockPreviews != null) Destroy(_blockPreviews);
            _blockPreviews = new GameObject("BlockPreviews");
            _blockPreviews.transform.SetParent(transform, false);
            foreach (var b in Phases[PhaseIndex].Blocks)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                go.name = "BlockPreview";
                go.transform.SetParent(_blockPreviews.transform, false);
                go.transform.SetPositionAndRotation(b.Center, Quaternion.identity);
                go.transform.localScale = b.Size;
                go.GetComponent<Renderer>().sharedMaterial = SimulationController.ObstacleMat();
                var rb = go.GetComponent<Rigidbody>();
                if (rb == null) rb = go.AddComponent<Rigidbody>();
                rb.isKinematic = true;
            }
        }

        // Zona de construção destacada (GDD §4.1): 24×16 translúcido no planejamento.
        GameObject _zone;

        void EnsureZone()
        {
            if (_zone == null)
            {
                var old = FindOrNull("BuildZone");
                if (old != null) _zone = old.gameObject;
            }
            if (_zone != null) return;
            _zone = GameObject.CreatePrimitive(PrimitiveType.Plane);
            _zone.name = "BuildZone";
            _zone.transform.SetParent(transform, false);
            _zone.transform.position = new Vector3(0f, 0.02f, 0f);
            _zone.transform.localScale = new Vector3(2.4f, 1f, 1.6f); // plano 10×10 → 24×16
            Object.Destroy(_zone.GetComponent<Collider>());
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.color = new Color(0.95f, 0.55f, 0.16f, 0.16f);
            m.SetFloat("_Surface", 1f); // transparente
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_SrcBlend", 5f);
            m.SetFloat("_DstBlend", 10f);
            m.SetFloat("_ZWrite", 0f);
            m.renderQueue = 3000;
            _zone.GetComponent<Renderer>().sharedMaterial = m;
        }

        void StartSim(List<Placement> layout)
        {
            _knocksHeard = 0;
            if (_previews != null) _previews.SetActive(false);
            if (_blockPreviews != null) _blockPreviews.SetActive(false);
            if (_zone != null) _zone.SetActive(false);
            Planning.SetVisualsActive(false); // as peças da sim nascem separadas
            var blocks = new List<ObstacleDef>();
            foreach (var b in Phases[PhaseIndex].Blocks)
                blocks.Add(new ObstacleDef { Center = b.Center, Size = b.Size });
            Sim.StartSim(layout, SoldierSpots, blocks);
            Hud.SetStatus(0, SoldierSpots.Count, "Simulando…");
        }

        void OnSimDone(SimResult r)
        {
            LastResult = r;
            if (r.Win) _coachSeen = true; // aprendeu: some o mini-tutorial
            Hud.SetStatus(r.Knocked, r.Total);
            Hud.ShowResult(r.Win, r.Knocked, r.Total, PhaseIndex + 1 < Phases.Count);
            Debug.Log($"[TOPPLE][GAME] fase '{PhaseName}': win={r.Win} {r.Knocked}/{r.Total} em {r.Elapsed:F1}s");
        }

        void BackToPlanning()
        {
            if (LastResult == null) return; // guarda contra duplo clique/Enter
            LastResult = null;
            Sim.StopSim();
            if (_previews != null) _previews.SetActive(true);
            if (_blockPreviews != null) _blockPreviews.SetActive(true);
            if (_zone != null) _zone.SetActive(true);
            Planning.SetVisualsActive(true);
            Planning.Active = true;
            Planning.ArmPathDefault(); // trilha sempre ligada, inclusive no retry
            Hud.HideResult();
            Hud.SetStatus(0, SoldierSpots.Count);
        }

        void Update()
        {
            if (Hud != null) Hud.PollShortcuts();
            if (Hud != null && Planning != null && Sim != null)
            {
                if (Sim.Running)
                {
                    Cam.FollowAllowed = false;
                    int k = Sim.KnockedSoFar;
                    if (Audio != null)
                        while (_knocksHeard < k) { Audio.Knock(); _knocksHeard++; }
                    Hud.SetStatus(k, SoldierSpots.Count, "Simulando… (Espaço: pular na T4)");
                }
                else if (Planning.Active)
                {
                    Cam.FollowAllowed = true;
                    Cam.FollowPoint = Planning.GhostWorldPos;
                    var (fx, fz) = PlanningData.FacingOf(Planning.RotDeg);
                    Cam.FollowDir = new Vector3(fx, 0f, fz);
                    Hud.RefreshTray(Planning.Selected, Planning.Data.HandCount);
                    Hud.SyncModes();
                    Hud.SetStatus(0, SoldierSpots.Count, Planning.Hint ?? UnreachedWarning());
                    DriveCoach();
                }
                else Hud.SetCoach(null);
            }
        }

        void ConfirmBanner()
        {
            // Via OnConfirm do Planning (FireAction provado); sem Keyboard direto.
            if (LastResult == null) return;
            if (LastResult.Value.Win && PhaseIndex + 1 < Phases.Count) NextPhase();
            else BackToPlanning();
        }

        // Mini-tutorial de gestos: 3 passos até a 1ª vitória DA SESSÃO (sem
        // PlayerPrefs — teste e sessão nova sempre ensinam; some e não volta).
        bool _coachSeen;

        void DriveCoach()
        {
            if (Hud == null) return;
            if (_coachSeen) { Hud.SetCoach(null); return; }
            if (Planning.Data.Count == 0 && !Planning.PathSelecting)
                Hud.SetCoach("1/3 Clique o início da trilha — ou arraste desenhando");
            else if (Planning.PathSelecting)
                Hud.SetCoach("2/3 Clique o destino (Esc cancela a seleção)");
            else
                Hud.SetCoach("3/3 DISPARE (Enter) — testar é grátis, nada se apaga");
        }

        // GDD §14.4: aviso amarelo p/ inimigos a >2 m de qualquer peça (não bloqueia).
        // Sem peças ainda: dica do objetivo.
        string UnreachedWarning()
        {
            if (Planning.Data.Count == 0)
                return "Clique o início e o destino da trilha até os soldados, depois DISPARE (Enter)";
            int n = 0;
            foreach (var s in SoldierSpots)
            {
                float best = float.MaxValue;
                foreach (var p in Planning.Data.Items)
                {
                    float dx = PlanningData.ToWorld(p.Gx) - s.x;
                    float dz = PlanningData.ToWorld(p.Gz) - s.z;
                    float d = Mathf.Sqrt(dx * dx + dz * dz);
                    if (d < best) best = d;
                }
                if (best > 2f) n++;
            }
            return n > 0 ? $"Inimigos sem alcance: {n}" : "";
        }

        static Material GrassMat()
        {
#if UNITY_EDITOR
            var m = UnityEditor.AssetDatabase.LoadAssetAtPath<Material>("Assets/Generated/Materials/field_grass.mat");
            if (m != null) return m;
#endif
            var fallback = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            fallback.color = new Color(0.37f, 0.66f, 0.30f);
            return fallback;
        }

        static PanelSettings MakePanelSettings()
        {
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1920, 1080);
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.match = 0.5f;
            return ps;
        }

        static VisualTreeAsset LoadUxml()
        {
#if UNITY_EDITOR
            return UnityEditor.AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/Topple/UI/PlanningHUD.uxml");
#else
            return null;
#endif
        }

        static StyleSheet LoadUss()
        {
#if UNITY_EDITOR
            return UnityEditor.AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/Topple/UI/PlanningHUD.uss");
#else
            return null;
#endif
        }

        // Fallback p/ player builds (UXML completo só no Editor até a T4).
        static void BuildFallbackUI(UIDocument doc)
        {
            var root = doc.rootVisualElement;
            foreach (var (name, text) in new[] { ("btn-piece-common", "1 Comum"), ("btn-piece-heavy", "2 Pesada"), ("btn-piece-ramp", "3 Rampa"), ("btn-undo", "Desfazer"), ("btn-redo", "Recarregar"), ("btn-fire", "DISPARAR") })
            {
                var b = new Button { name = name, text = text };
                root.Add(b);
            }
            root.Add(new Label { name = "lbl-objective", text = "Inimigos 0/3" });
            root.Add(new Label { name = "lbl-msg", text = "" });
            root.Add(new Label { name = "lbl-coach", text = "" });
            var banner = new VisualElement { name = "banner-result" };
            banner.Add(new Label { name = "lbl-result", text = "" });
            var again = new Button { name = "btn-again", text = "De novo" };
            banner.Add(again);
            var next = new Button { name = "btn-next", text = "Próxima" };
            banner.Add(next);
            root.Add(banner);
        }

#if UNITY_EDITOR
        [UnityEditor.MenuItem("Tools/Topple/Build Tutorial Scene")]
        public static void EnsureTutorialScene()
        {
            var scene = UnityEditor.SceneManagement.EditorSceneManager.NewScene(
                UnityEditor.SceneManagement.NewSceneSetup.EmptyScene, UnityEditor.SceneManagement.NewSceneMode.Single);
            Build("ToppleT3");
            UnityEditor.SceneManagement.EditorSceneManager.SaveScene(scene, "Assets/Topple/Game/Tutorial.unity");
            var settings = new[] { new UnityEditor.EditorBuildSettingsScene("Assets/Topple/Game/Tutorial.unity", true) };
            UnityEditor.EditorBuildSettings.scenes = settings;
            Debug.Log("[TOPPLE][GAME] cena Tutorial.unity salva.");
        }
#endif
    }
}
