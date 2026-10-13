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
        public ToppleJuice Juice;
        public List<EnemySpot> SoldierSpots = new();
        public SimResult? LastResult { get; private set; }
        // Run deckbuilder (não serializa: reconstrói no InitScenario).
        [System.NonSerialized] public RunState Run;
        // Cena Procedural liga: fases geradas desde a 1 (Tutorial = 10 fixas + 10+ geradas).
        public bool ProceduralFromStart;
        bool _runOver;

        GameObject _previews;
        bool _inited;
        int _knocksHeard, _puffsHeard;

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
            setup.Juice = root.AddComponent<ToppleJuice>();
            setup.Juice.EnsureMood(camComp);
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
            if (Juice == null) Juice = GetComponent<ToppleJuice>();
            if (Juice == null) Juice = gameObject.AddComponent<ToppleJuice>();
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
            if (Juice != null) Juice.EnsureMood(Cam != null ? Cam.GetComponent<Camera>() : null);
            var oldViews = Planning.transform.Find("Views");
            if (oldViews != null) Destroy(oldViews.gameObject);
            var oldPrev = transform.Find("SoldierPreviews");
            if (oldPrev != null) Destroy(oldPrev.gameObject);
            var oldBlocks = transform.Find("BlockPreviews");
            if (oldBlocks != null) Destroy(oldBlocks.gameObject);
            var oldGround = transform.Find("GroundTiles");
            if (oldGround != null) Destroy(oldGround.gameObject);
            var oldGrassT = transform.Find("GrassTiles");
            if (oldGrassT != null) Destroy(oldGrassT.gameObject);
            _previews = null;
            _blockPreviews = null;

            // HUD (re-assina: delegates não serializam).
            var doc = GetComponentInChildren<UIDocument>();
            Hud.Setup(doc);
            Run ??= RunState.NewRun((uint)System.Environment.TickCount);
            ContentLoader.ApplyFromResources(); // Content/ (pesos) sem recompilar; sem JSON = Base
            Planning.Hud = Hud; // p/ OverUI ignorar cliques nos botões
            Planning.Audio = Audio; // cliques de interface (colocar/remover)
            Hud.OnSelect += Planning.Select;
            Hud.OnFire += Planning.Fire;
            Hud.OnUndo += () => Planning.Undo();
            Hud.OnReload += ReloadPhase;
            Hud.OnLastRemove += () => Planning.RemoveLast();
            Hud.OnNext += OpenDraft; // próxima = draft antes (vitória ou derrota-avançada)
            Hud.OnSkip += SkipPhase; // cheat de teste (dono): pula sem dano/draft
            Hud.OnAgain += () => { if (_runOver) RestartRun(); else BackToPlanning(); };

            LoadPhase(0);
        }

        // Fases artesanais (solver e ~20 arquétipos entram na T5).
        [System.Serializable]
        public struct BlockDef { public Vector3 Center; public Vector3 Size; }

        // Ponte-vão: disco sem construção (a queda atravessa com peça longa).
        [System.Serializable]
        public struct GapDef { public Vector3 Center; public float R; public float NeedReach; }

        // Buraco: retângulo sem chão (a linha morre ali — contorne).
        [System.Serializable]
        public struct VoidDef { public Vector3 Center; public Vector3 Size; }

        public struct PhaseDef
        {
            public string Name;
            public int TriggerGx, TriggerGz; public float TriggerDeg;
            // Par (nº de peças): soft, p/ estrelas (Fase B) — vencer acima do par
            // vale 1★, dentro do par +1★. Não bloqueia (calibra com dados depois).
            public int ParPieces;
            public List<EnemySpot> Soldiers;
            public List<BlockDef> Blocks;
            public List<GapDef> Gaps; // null nas 10 artesanais (sem ponte-vão)
            public List<VoidDef> Voids; // null nas 10 artesanais (sem buraco)
        }

        public static readonly List<PhaseDef> Phases = new()
        {
            new PhaseDef { // 1. Primeira Queda (3; deck base fecha)
                Name = "Primeira Queda",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 12,
                Soldiers = new() { EnemySpot.Soldier(3.55f, 0f), EnemySpot.Soldier(4.10f, 0f), EnemySpot.Soldier(4.65f, 0f) },
                // Bloco-aula ao norte (fora da linha do bot z=0): ensina contorno
                // sem quebrar o tutorial — rota do bot passa a 1,2 m (fora do raio 0,6).
                Blocks = new() { new BlockDef { Center = new(1.5f, 0.5f, 1.2f), Size = new(0.8f, 1.0f, 0.8f) } },
            },
            new PhaseDef { // 2. Curva do Muro (4; muro em L veta o norte, curva sul forçada)
                Name = "Curva do Muro",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 12,
                Soldiers = new() { EnemySpot.Soldier(3.7f, -0.7f), EnemySpot.Soldier(4.25f, -0.65f), EnemySpot.Soldier(3.95f, -0.15f), EnemySpot.Soldier(4.6f, -0.1f) },
                Blocks = new() {
                    new BlockDef { Center = new(2.2f, 0.5f, 0.9f), Size = new(1.2f, 1.0f, 1.2f) },
                    new BlockDef { Center = new(3.3f, 0.5f, 1.1f), Size = new(1.0f, 1.0f, 1.0f) },
                    new BlockDef { Center = new(2.2f, 0.5f, 2.0f), Size = new(1.0f, 1.0f, 1.0f) },
                },
            },
            new PhaseDef { // 3. Peso Pesado (5; fileira longa)
                Name = "Peso Pesado",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 12,
                Soldiers = new() { EnemySpot.Soldier(3.6f, 0.9f), EnemySpot.Soldier(4.15f, 0.9f), EnemySpot.Soldier(4.7f, 0.9f), EnemySpot.Soldier(5.25f, 0.9f), EnemySpot.Soldier(5.8f, 0.9f) },
                Blocks = new(),
            },
            new PhaseDef { // 4. Muralha Viva (7: 1 pesadão + 6; pesada já draftada)
                Name = "Muralha Viva",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 16,
                Soldiers = new() { EnemySpot.Brute(5.2f, 0.3f),
                    EnemySpot.Soldier(3.8f, -0.8f), EnemySpot.Soldier(4.35f, -0.8f), EnemySpot.Soldier(4.9f, -0.7f),
                    EnemySpot.Soldier(3.8f, 0.8f), EnemySpot.Soldier(4.35f, 0.9f), EnemySpot.Soldier(4.9f, 0.8f) },
                Blocks = new(),
            },
            new PhaseDef { // 5. Ronda (9: 1 patrulheiro rápido + 8; interceptação com timing)
                Name = "Ronda",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 64,
                Soldiers = new() {
                    EnemySpot.Patroller(0.5f, new Vector3(4.5f, 0f, -1.5f), new Vector3(6.0f, 0f, -1.5f), new Vector3(6.0f, 0f, 1.5f), new Vector3(4.5f, 0f, 1.5f)),
                    EnemySpot.Soldier(3.6f, -1.2f), EnemySpot.Soldier(3.6f, -0.4f), EnemySpot.Soldier(3.6f, 0.4f), EnemySpot.Soldier(3.6f, 1.2f),
                    EnemySpot.Soldier(6.7f, -1.2f), EnemySpot.Soldier(6.7f, -0.4f), EnemySpot.Soldier(6.7f, 0.4f), EnemySpot.Soldier(6.7f, 1.2f) },
                Blocks = new(),
            },
            new PhaseDef { // 6. Garfo (12: trigger oeste, tronco longo; dois pelotões pedem bifurcação)
                Name = "Garfo",
                TriggerGx = -20, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 88,
                Soldiers = new() {
                    EnemySpot.Soldier(3.8f, -1.6f), EnemySpot.Soldier(4.35f, -1.7f), EnemySpot.Soldier(4.9f, -1.6f),
                    EnemySpot.Soldier(3.8f, -0.9f), EnemySpot.Soldier(4.35f, -0.9f), EnemySpot.Soldier(4.9f, -0.9f),
                    EnemySpot.Soldier(3.8f, 1.6f), EnemySpot.Soldier(4.35f, 1.7f), EnemySpot.Soldier(4.9f, 1.6f),
                    EnemySpot.Soldier(3.8f, 0.9f), EnemySpot.Soldier(4.35f, 0.9f), EnemySpot.Soldier(4.9f, 0.9f) },
                Blocks = new() { new BlockDef { Center = new(2.5f, 0.5f, 0f), Size = new(1.0f, 1.0f, 1.0f) } },
            },
            new PhaseDef { // 7. Avenida (15: fileira longa, corrida brilha)
                Name = "Avenida",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 12,
                Soldiers = new() {
                    EnemySpot.Soldier(3.6f, 0f), EnemySpot.Soldier(4.15f, 0f), EnemySpot.Soldier(4.7f, 0f), EnemySpot.Soldier(5.25f, 0f), EnemySpot.Soldier(5.8f, 0f), EnemySpot.Soldier(6.35f, 0f), EnemySpot.Soldier(6.9f, 0f),
                    EnemySpot.Soldier(3.85f, 0.85f), EnemySpot.Soldier(4.4f, 0.85f), EnemySpot.Soldier(4.95f, 0.85f), EnemySpot.Soldier(5.5f, 0.85f), EnemySpot.Soldier(6.05f, 0.85f), EnemySpot.Soldier(6.6f, 0.85f), EnemySpot.Soldier(7.15f, 0.85f), EnemySpot.Soldier(7.7f, 0.85f) },
                Blocks = new(),
            },
            new PhaseDef { // 8. Cerco (18: 2 pesadões + 16; densidade veta o meio, box por fora)
                Name = "Cerco",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 48,
                Soldiers = new() { EnemySpot.Brute(5.5f, -1.2f), EnemySpot.Brute(5.5f, 1.2f),
                    EnemySpot.Soldier(4.3f, -1.8f), EnemySpot.Soldier(4.85f, -1.9f), EnemySpot.Soldier(5.4f, -1.9f), EnemySpot.Soldier(5.95f, -1.8f),
                    EnemySpot.Soldier(4.3f, -0.6f), EnemySpot.Soldier(4.85f, -0.5f), EnemySpot.Soldier(5.4f, -0.5f), EnemySpot.Soldier(5.95f, -0.6f),
                    EnemySpot.Soldier(4.3f, 1.8f), EnemySpot.Soldier(4.85f, 1.9f), EnemySpot.Soldier(5.4f, 1.9f), EnemySpot.Soldier(5.95f, 1.8f),
                    EnemySpot.Soldier(4.3f, 0.6f), EnemySpot.Soldier(4.85f, 0.5f), EnemySpot.Soldier(5.4f, 0.5f), EnemySpot.Soldier(5.95f, 0.6f) },
                // Sem bloco central: o teste mostrou que ele sobrepõe as fileiras
                // internas (pop no spawn, 9/18) — a densidade já veta o meio.
                Blocks = new(),
            },
            new PhaseDef { // 9. Tempestade (24: 2 patrulheiros rápidos + 20 em grade)
                Name = "Tempestade",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 20,
                Soldiers = new() {
                    EnemySpot.Patroller(0.45f, new Vector3(4.35f, 0f, -1.8f), new Vector3(4.35f, 0f, 1.8f), new Vector3(5.45f, 0f, 1.8f), new Vector3(5.45f, 0f, -1.8f)),
                    EnemySpot.Patroller(0.45f, new Vector3(6.55f, 0f, -1.8f), new Vector3(6.55f, 0f, 1.8f), new Vector3(7.65f, 0f, 1.8f), new Vector3(7.65f, 0f, -1.8f)),
                    EnemySpot.Soldier(3.8f, -1.1f), EnemySpot.Soldier(3.8f, -0.55f), EnemySpot.Soldier(3.8f, 0f), EnemySpot.Soldier(3.8f, 0.55f), EnemySpot.Soldier(3.8f, 1.1f),
                    EnemySpot.Soldier(4.9f, -1.1f), EnemySpot.Soldier(4.9f, -0.55f), EnemySpot.Soldier(4.9f, 0f), EnemySpot.Soldier(4.9f, 0.55f), EnemySpot.Soldier(4.9f, 1.1f),
                    EnemySpot.Soldier(6.0f, -1.1f), EnemySpot.Soldier(6.0f, -0.55f), EnemySpot.Soldier(6.0f, 0f), EnemySpot.Soldier(6.0f, 0.55f), EnemySpot.Soldier(6.0f, 1.1f),
                    EnemySpot.Soldier(7.1f, -1.1f), EnemySpot.Soldier(7.1f, -0.55f), EnemySpot.Soldier(7.1f, 0f), EnemySpot.Soldier(7.1f, 0.55f), EnemySpot.Soldier(7.1f, 1.1f),
                    EnemySpot.Soldier(8.2f, -0.55f), EnemySpot.Soldier(8.2f, 0.55f) },
                Blocks = new(),
            },
            new PhaseDef { // 10. Chefão (30: 2 pesadões + 28 em arcos)
                Name = "Chefão",
                TriggerGx = 0, TriggerGz = 0, TriggerDeg = 90f,
                ParPieces = 96,
                Soldiers = new() { EnemySpot.Brute(6.5f, -1.5f), EnemySpot.Brute(6.5f, 1.5f),
                    EnemySpot.Soldier(3.06f, -2.57f), EnemySpot.Soldier(3.46f, -2.0f), EnemySpot.Soldier(3.77f, -1.37f), EnemySpot.Soldier(3.94f, -0.69f), EnemySpot.Soldier(4f, 0f), EnemySpot.Soldier(3.94f, 0.69f), EnemySpot.Soldier(3.77f, 1.37f), EnemySpot.Soldier(3.46f, 2.0f), EnemySpot.Soldier(3.06f, 2.57f),
                    EnemySpot.Soldier(3.83f, -3.21f), EnemySpot.Soldier(4.33f, -2.5f), EnemySpot.Soldier(4.70f, -1.71f), EnemySpot.Soldier(4.92f, -0.87f), EnemySpot.Soldier(5f, 0f), EnemySpot.Soldier(4.92f, 0.87f), EnemySpot.Soldier(4.70f, 1.71f), EnemySpot.Soldier(4.33f, 2.5f), EnemySpot.Soldier(3.83f, 3.21f),
                    EnemySpot.Soldier(4.6f, -3.86f), EnemySpot.Soldier(5.2f, -3.0f), EnemySpot.Soldier(5.64f, -2.05f), EnemySpot.Soldier(5.91f, -1.04f), EnemySpot.Soldier(5.91f, 1.04f), EnemySpot.Soldier(5.64f, 2.05f), EnemySpot.Soldier(5.2f, 3.0f), EnemySpot.Soldier(4.6f, 3.86f), EnemySpot.Soldier(4.24f, -4.24f), EnemySpot.Soldier(4.24f, 4.24f) },
                Blocks = new(),
            },
        };

        public int PhaseIndex { get; private set; }
        PhaseDef _current; // fase resolvida (base ou escalada) — vale p/ profundidade infinita
        int _lastLayoutCount; // peças no último DISPARAR (eficiência do par)
        int _rerollCost = ToppleRules.ShopRerollBase; // zera a cada draft/loja
        public string PhaseName => _current.Name;
        public IReadOnlyList<BlockDef> PhaseBlocks => _current.Blocks;

        // Run infinita: 0-9 artesanais (provas físicas); 10+ procedurais via
        // MapGen com a semente da run (determinístico: mesma run, mesmos mapas).
        // Cena Procedural: tudo gerado desde a fase 1.
        public static PhaseDef PhaseForDepth(int depth, uint seed = 0, bool proceduralFromStart = false)
        {
            int t = depth % Phases.Count;
            if (depth < Phases.Count && !proceduralFromStart) return Phases[t];
            return ConvertMap(Topple.Core.MapGen.Generate(seed, depth));
        }

        public static PhaseDef ConvertMap(Topple.Core.MapSpec m)
        {
            var soldiers = new List<EnemySpot>();
            foreach (var s in m.Soldiers)
            {
                if (s.Kind == Topple.Core.MapEnemyKind.Brute)
                    soldiers.Add(EnemySpot.Brute(s.X, s.Z));
                else if (s.Kind == Topple.Core.MapEnemyKind.Patroller && s.Loop != null && s.Loop.Count >= 2)
                {
                    var loop = new Vector3[s.Loop.Count];
                    for (int i = 0; i < loop.Length; i++) loop[i] = new Vector3(s.Loop[i].X, 0f, s.Loop[i].Z);
                    soldiers.Add(EnemySpot.Patroller(s.Speed, loop));
                }
                else soldiers.Add(EnemySpot.Soldier(s.X, s.Z));
            }
            var blocks = new List<BlockDef>();
            foreach (var b in m.Blocks)
                blocks.Add(new BlockDef { Center = new Vector3(b.CX, 0.5f, b.CZ), Size = new Vector3(b.SX, 1.0f, b.SZ) });
            var gaps = new List<GapDef>();
            foreach (var g in m.Gaps)
                gaps.Add(new GapDef { Center = new Vector3(g.X, 0f, g.Z), R = g.RadiusCells * 0.05f, NeedReach = g.NeedReach });
            var voids = new List<VoidDef>();
            foreach (var v in m.Voids)
                voids.Add(new VoidDef
                {
                    Center = new Vector3((v.X0 + v.X1) * 0.5f, 0f, (v.Z0 + v.Z1) * 0.5f),
                    Size = new Vector3(v.X1 - v.X0, 0.5f, v.Z1 - v.Z0),
                });
            return new PhaseDef
            {
                Name = m.Name, TriggerGx = m.TriggerGx, TriggerGz = m.TriggerGz, TriggerDeg = m.TriggerDeg,
                ParPieces = m.ParPieces, Soldiers = soldiers, Blocks = blocks, Gaps = gaps, Voids = voids,
            };
        }

        public void LoadPhase(int i)
        {
            PhaseIndex = Mathf.Max(0, i);
            var ph = PhaseForDepth(PhaseIndex, Run != null ? Run.Seed : 0, ProceduralFromStart);
            _current = ph;
            Sim.StopSim();
            Planning.Data.Clear();
            Planning.Active = true;
            LastResult = null;

            // Mão = cópia do deck da run (deckbuilder). Tabuleiro vazio: nada
            // pré-colocado, nada travado. A 1ª peça colocada (menor InstanceId)
            // recebe o impulso e cai primeiro.
            foreach (PieceId p in System.Enum.GetValues(typeof(PieceId)))
                Planning.Data.SetHand(p, Run.DeckCount(p));
            Run.PhaseIndex = PhaseIndex;
            Run.RefillAttempts();
            if (Run.ExtraAttempts > 0) { Run.AttemptsLeft += Run.ExtraAttempts; Run.ExtraAttempts = 0; }
            _runOver = false;
            Planning.Select(FirstAvailable());
            Planning.SetRotDeg(ph.TriggerDeg);
            Planning.ArmPathDefault(); // trilha sempre ligada
            // Raiz obrigatória: 1ª trilha nasce no trigger (corrente obrigatória).
            Planning.TriggerPos = new Vector2(PlanningData.ToWorld(ph.TriggerGx), PlanningData.ToWorld(ph.TriggerGz));
            Planning.HasTrigger = true;
            SoldierSpots = new List<EnemySpot>(ph.Soldiers);
            Planning.Soldiers = new List<EnemySpot>(ph.Soldiers);
            Planning.Forbidden = new List<PlanningController.ForbiddenZone>();
            Planning.PatrolSegs.Clear();
            Planning.GapDiscs.Clear();
            Planning.VoidRects.Clear();
            foreach (var b in ph.Blocks)
            {
                float r = Mathf.Max(b.Size.x, b.Size.z) * 0.5f + 0.2f;
                Planning.Forbidden.Add(new PlanningController.ForbiddenZone { C = new Vector3(b.Center.x, 0f, b.Center.z), R = r });
            }
            // Ponte-vão: disco sem construção (a queda atravessa com peça longa).
            if (ph.Gaps != null)
                foreach (var g in ph.Gaps)
                {
                    Planning.Forbidden.Add(new PlanningController.ForbiddenZone { C = new Vector3(g.Center.x, 0f, g.Center.z), R = g.R });
                    Planning.GapDiscs.Add((new Vector3(g.Center.x, 0f, g.Center.z), g.R, g.NeedReach));
                }
            // Buraco: sem chão (a linha morre ali) — lajes + validade.
            RebuildGround(ph.Voids);
            if (ph.Voids != null)
                foreach (var v in ph.Voids)
                    Planning.VoidRects.Add((new Vector3(v.Center.x - v.Size.x * 0.5f, 0f, v.Center.z - v.Size.z * 0.5f),
                        new Vector3(v.Center.x + v.Size.x * 0.5f, 0f, v.Center.z + v.Size.z * 0.5f)));
            foreach (var s in ph.Soldiers)
            {
                if (s.Kind != EnemyKind.Patroller || s.Waypoints.Count < 2) continue;
                for (int w = 0; w < s.Waypoints.Count; w++)
                    Planning.PatrolSegs.Add((s.Waypoints[w], s.Waypoints[(w + 1) % s.Waypoints.Count]));
            }
            SpawnSoldierPreviews();
            SpawnBlockPreviews();
            EnsureZone();
            _zone.SetActive(true);
            // Câmera enquadra soldados + trigger (o marcador verde precisa nascer visível).
            var trigPos = new Vector3(Planning.TriggerPos.x, 0f, Planning.TriggerPos.y);
            var mid = trigPos;
            foreach (var s in SoldierSpots) mid += s.Pos;
            mid /= (SoldierSpots.Count + 1);
            float spread = 0f;
            foreach (var s in SoldierSpots) spread = Mathf.Max(spread, Vector3.Distance(s.Pos, mid));
            spread = Mathf.Max(spread, Vector3.Distance(trigPos, mid));
            Cam.Target = mid;
            Cam.Distance = Mathf.Clamp(spread * 3.2f, 8f, 22f);
            Planning.Rebuild();
            Planning.OnFire -= StartSim; Planning.OnFire += StartSim; // sem duplicar
            Planning.OnConfirm -= ConfirmBanner; Planning.OnConfirm += ConfirmBanner;
            Planning.OnReload -= ReloadPhase; Planning.OnReload += ReloadPhase;
            Sim.OnDone -= OnSimDone; Sim.OnDone += OnSimDone;
            Hud.HideResult();
            bool shopNext = ToppleRules.IsShopPhase(PhaseIndex);
            Hud.SetPhase("Fase " + (PhaseIndex + 1) + ": " + ph.Name
                + (shopNext ? " · Próxima: ★ LOJA ★" : ""));
            Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
            Hud.RefreshTray(Planning.Selected, Planning.Data.HandCount);
            Hud.SetStatus(0, SoldierSpots.Count);
            Debug.Log($"[TOPPLE][GAME] fase {PhaseIndex + 1}: {ph.Name}");
        }

        public void NextPhase()
        {
            if (LastResult == null || !LastResult.Value.Win) return; // só com vitória
            if (PhaseIndex + 1 < Phases.Count) LoadPhase(PhaseIndex + 1);
        }

        // Run infinita: avança sempre (sem "última fase").
        public void AdvancePhase()
        {
            LoadPhase(PhaseIndex + 1);
        }

        // Pular fase (cheat de teste, pedido do dono): abandona sem dano, sem
        // draft e sem gastar tentativa — carrega a próxima (LoadPhase para a
        // sim e limpa tudo). Na run infinita sempre há próxima.
        public void SkipPhase()
        {
            if (Hud != null && (Hud.IsDraftOpen || Hud.IsShopOpen)) return; // telas se resolvem nos botões
            if (Audio != null) Audio.UiClick();
            Debug.Log($"[TOPPLE][GAME] pular fase {PhaseIndex + 1} (cheat de teste)");
            LoadPhase(PhaseIndex + 1);
        }

        // Novo run: deck base igual, vida cheia, fase 0.
        public void RestartRun()
        {
            Run = RunState.NewRun((uint)System.Environment.TickCount);
            LoadPhase(0);
        }

        // Primeira carta com saldo no deck (padrão: comum).
        PieceId FirstAvailable()
        {
            foreach (PieceId p in System.Enum.GetValues(typeof(PieceId)))
                if (Run.DeckCount(p) > 0) return p;
            return PieceId.Common;
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
            var soldierPrefab = PrefabRegistry.Soldier();
            var brutePrefab = PrefabRegistry.Brute();
            if (soldierPrefab == null) return;
            foreach (var s in SoldierSpots)
            {
                var prefab = s.Kind == EnemyKind.Brute && brutePrefab != null ? brutePrefab : soldierPrefab;
                var go = Instantiate(prefab, _previews.transform);
                go.transform.SetPositionAndRotation(s.Pos, Quaternion.identity);
                var rb = go.GetComponent<Rigidbody>();
                if (rb != null) rb.isKinematic = true;
            }
            SpawnPatrolMarkers();
            SpawnTriggerMarker();
        }

        // Marcador do trigger (corrente obrigatória): disco verde + seta na
        // direção inicial — sem ele o jogador não sabe onde a 1ª trilha nasce.
        // Só visual (sem colisor, sem física); some na sim com os previews.
        void SpawnTriggerMarker()
        {
            if (_previews == null || Planning == null) return;
            var markMat = Juice != null ? Juice.TriggerMaterial() : null;
            if (markMat == null)
            {
                markMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                markMat.color = new Color(0.15f, 0.85f, 0.45f);
            }
            var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            disc.name = "TriggerMark";
            disc.transform.SetParent(_previews.transform, false);
            disc.transform.position = new Vector3(Planning.TriggerPos.x, 0.04f, Planning.TriggerPos.y);
            disc.transform.localScale = new Vector3(0.7f, 0.04f, 0.7f);
            disc.GetComponent<Renderer>().sharedMaterial = markMat;
            Object.Destroy(disc.GetComponent<Collider>());
            // Seta na direção inicial (TriggerDeg): para onde a 1ª peça aponta.
            float r = _current.TriggerDeg * Mathf.Deg2Rad;
            var dir = new Vector3(Mathf.Sin(r), 0f, Mathf.Cos(r));
            var arrow = GameObject.CreatePrimitive(PrimitiveType.Cube);
            arrow.name = "TriggerArrow";
            arrow.transform.SetParent(_previews.transform, false);
            arrow.transform.position = new Vector3(Planning.TriggerPos.x, 0.04f, Planning.TriggerPos.y) + dir * 0.8f;
            arrow.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
            arrow.transform.localScale = new Vector3(0.18f, 0.04f, 0.9f);
            arrow.GetComponent<Renderer>().sharedMaterial = markMat;
            Object.Destroy(arrow.GetComponent<Collider>());
            if (Juice != null) Juice.SetTriggerMark(disc.transform, arrow.transform);
        }

        // Rota do patrulheiro em loop (discos nos waypoints + linhas entre eles):
        // planejar sabendo por onde ele passa + onde está em t=0 (primeiro
        // waypoint, maior disco). Linhas finas, sem colisor, só leitura de timing.
        void SpawnPatrolMarkers()
        {
            if (_previews == null) return;
            // Âmbar (não o cinza dos blocos): rota do patrulheiro lê diferente de muro.
            var markMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            markMat.color = new Color(1f, 0.62f, 0.15f);
            foreach (var s in SoldierSpots)
            {
                if (s.Kind != EnemyKind.Patroller || s.Waypoints.Count < 2) continue;
                for (int i = 0; i < s.Waypoints.Count; i++)
                {
                    var m = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    m.name = "PatrolMark";
                    m.transform.SetParent(_previews.transform, false);
                    m.transform.position = s.Waypoints[i] + new Vector3(0f, 0.03f, 0f);
                    float d = i == 0 ? 0.30f : 0.18f;
                    m.transform.localScale = new Vector3(d, 0.06f, d);
                    m.GetComponent<Renderer>().sharedMaterial = markMat;
                    Object.Destroy(m.GetComponent<Collider>());
                    // Linha até o próximo waypoint (loop fechado): leitura do
                    // caminho que o patrulheiro vai percorrer (timing).
                    var a = s.Waypoints[i];
                    var b = s.Waypoints[(i + 1) % s.Waypoints.Count];
                    var delta = b - a; delta.y = 0f;
                    float len = delta.magnitude;
                    if (len < 1e-4f) continue;
                    var seg = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    seg.name = "PatrolSeg";
                    seg.transform.SetParent(_previews.transform, false);
                    seg.transform.position = (a + b) * 0.5f + new Vector3(0f, 0.02f, 0f);
                    seg.transform.rotation = Quaternion.LookRotation(delta.normalized, Vector3.up);
                    seg.transform.localScale = new Vector3(0.06f, 0.02f, len);
                    seg.GetComponent<Renderer>().sharedMaterial = markMat;
                    Object.Destroy(seg.GetComponent<Collider>());
                }
            }
        }

        GameObject _blockPreviews;
        bool _hadVoids;

        // Chão por fase: laje única sem buraco; lajes 1 m pulando buracos.
        // (Laje estática = só colisor; visual da grama em tiles separados.)
        void RebuildGround(List<VoidDef> voids)
        {
            bool want = voids != null && voids.Count > 0;
            if (want == _hadVoids)
            {
                var keep = transform.Find(want ? "GroundTiles" : "GroundPhysics");
                if (keep != null) return; // já está certo (cena salva tem laje assada)
            }
            foreach (var n in new[] { "GroundPhysics", "GrassVisual", "GroundTiles", "GrassTiles" })
            {
                var o = transform.Find(n);
                if (o != null) Destroy(o.gameObject);
            }
            _hadVoids = want;
            if (!want)
            {
                var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
                ground.name = "GroundPhysics";
                ground.transform.SetParent(transform, false);
                ground.transform.localScale = new Vector3(24f, 0.5f, 16f);
                ground.transform.position = new Vector3(0f, -0.25f, 0f);
                var grb = ground.GetComponent<Rigidbody>();
                if (grb == null) grb = ground.AddComponent<Rigidbody>();
                grb.isKinematic = true;
                var gcol = ground.GetComponent<Collider>();
                if (gcol != null)
                {
                    var box = gcol as BoxCollider;
                    if (box != null) box.material = SimBuilder.Wood;
                }
                Object.Destroy(ground.GetComponent<Renderer>());
                var grass = GameObject.CreatePrimitive(PrimitiveType.Cube);
                grass.name = "GrassVisual";
                grass.transform.SetParent(transform, false);
                grass.transform.localScale = new Vector3(24f, 0.1f, 16f);
                grass.transform.position = new Vector3(0f, -0.05f, 0f);
                grass.GetComponent<Renderer>().sharedMaterial = GrassMat();
                Object.Destroy(grass.GetComponent<Collider>());
                return;
            }
            var gtiles = new GameObject("GroundTiles");
            gtiles.transform.SetParent(transform, false);
            var grtiles = new GameObject("GrassTiles");
            grtiles.transform.SetParent(transform, false);
            for (int ix = -12; ix < 12; ix++)
                for (int iz = -8; iz < 8; iz++)
                {
                    float cx = ix + 0.5f, cz = iz + 0.5f;
                    bool hole = false;
                    foreach (var v in voids)
                    {
                        float x0 = v.Center.x - v.Size.x * 0.5f, x1 = v.Center.x + v.Size.x * 0.5f;
                        float z0 = v.Center.z - v.Size.z * 0.5f, z1 = v.Center.z + v.Size.z * 0.5f;
                        if (cx > x0 && cx < x1 && cz > z0 && cz < z1) { hole = true; break; }
                    }
                    if (hole) continue;
                    var tile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    tile.transform.SetParent(gtiles.transform, false);
                    tile.transform.localScale = new Vector3(1f, 0.5f, 1f);
                    tile.transform.position = new Vector3(cx, -0.25f, cz);
                    var tcol = tile.GetComponent<Collider>() as BoxCollider;
                    if (tcol != null) tcol.material = SimBuilder.Wood;
                    Object.Destroy(tile.GetComponent<Renderer>());
                    var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    g.transform.SetParent(grtiles.transform, false);
                    g.transform.localScale = new Vector3(1f, 0.1f, 1f);
                    g.transform.position = new Vector3(cx, -0.05f, cz);
                    var gm = new Material(GrassMat());
                    gm.color = new Color(0.16f, 0.30f, 0.16f, 1f); // feltro escuro (instância)
                    g.GetComponent<Renderer>().material = gm;
                    Object.Destroy(g.GetComponent<Collider>());
                }
        }

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
            foreach (var b in _current.Blocks)
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
            // Ponte-vão: disco azul translúcido (chão intacto — a queda atravessa).
            if (_current.Gaps != null)
            {
                var gapMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                gapMat.color = new Color(0.25f, 0.45f, 0.9f, 0.45f);
                gapMat.SetFloat("_Surface", 1f);
                gapMat.SetFloat("_Blend", 0f);
                gapMat.SetFloat("_SrcBlend", 5f);
                gapMat.SetFloat("_DstBlend", 10f);
                gapMat.SetFloat("_ZWrite", 0f);
                gapMat.renderQueue = 3000;
                foreach (var g in _current.Gaps)
                {
                    var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    go.name = "GapPreview";
                    go.transform.SetParent(_blockPreviews.transform, false);
                    go.transform.position = new Vector3(g.Center.x, 0.03f, g.Center.z);
                    go.transform.localScale = new Vector3(g.R * 2f, 0.02f, g.R * 2f);
                    go.GetComponent<Renderer>().sharedMaterial = gapMat;
                    Object.Destroy(go.GetComponent<Collider>());
                }
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
            // Deckbuilder: cada DISPARAR consome 1 de 3 tentativas (planejar livre).
            if (!Run.SpendAttempt())
            {
                Debug.Log("[TOPPLE][GAME] sem tentativas!");
                Planning.Active = true;
                return;
            }
            _knocksHeard = 0;
            _puffsHeard = 0;
            _lastLayoutCount = layout.Count;
            if (_previews != null) _previews.SetActive(false);
            if (_blockPreviews != null) _blockPreviews.SetActive(false);
            if (_zone != null) _zone.SetActive(false);
            Planning.SetVisualsActive(false); // as peças da sim nascem separadas
            var blocks = new List<ObstacleDef>();
            foreach (var b in _current.Blocks)
                blocks.Add(new ObstacleDef { Center = b.Center, Size = b.Size });
            Sim.StartSim(layout, SoldierSpots, blocks);
            Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
            Hud.SetStatus(0, SoldierSpots.Count, "Simulando…");
        }

        void OnSimDone(SimResult r)
        {
            LastResult = r;
            if (r.Win) _coachSeen = true; // aprendeu: some o mini-tutorial
            Hud.SetStatus(r.Knocked, r.Total);
            Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
            if (r.Win)
            {
                if (Juice != null) { Juice.Flash(); Juice.Puff(Sim.LastKnockPoint, true); }
                if (Audio != null) Audio.Win(); // stinger T4
                // Pagamento: estrelas por eficiência (par) + 1ª tentativa; ouro pela tabela.
                bool efficient = _lastLayoutCount <= _current.ParPieces;
                bool firstTry = Run.AttemptsLeft == ToppleRules.AttemptsPerPhase - 1;
                int stars = ToppleRules.StarsForWin(efficient, firstTry);
                int gold = ToppleRules.GoldForPhase(stars, firstTry);
                Run.Gold += gold;
                Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                Hud.ShowResult(true, r.Knocked, r.Total, true, gold);
            }
            else if (Run.AttemptsLeft > 0)
            {
                Hud.ShowResult(false, r.Knocked, r.Total, false);
            }
            else
            {
                // 3 tentativas esgotadas: brutal puro, 1 de dano por sobrevivente.
                int life = Run.Damage(r.Total - r.Knocked);
                Hud.SetRun(life, 0, ToppleRules.AttemptsPerPhase, Run.Gold);
                Debug.Log($"[TOPPLE][GAME] fase '{PhaseName}': dano, vida={life}");
                if (Run.IsDead) { ShowRunEnd(false); return; }
                int gold = ToppleRules.GoldForPhase(1, false) / 2; // consolação, sem estrela
                Run.Gold += gold;
                Hud.SetRun(life, 0, ToppleRules.AttemptsPerPhase, Run.Gold);
                Hud.ShowResult(false, r.Knocked, r.Total, true, gold); // avança p/ draft
            }
            Debug.Log($"[TOPPLE][GAME] fase '{PhaseName}': win={r.Win} {r.Knocked}/{r.Total} em {r.Elapsed:F1}s");
        }

        // Draft sempre: vitória e derrota-avançada pagam 1 de 3 pacotes.
        // Loja ocasião (nunca toda fase): só quando IsShopPhase (a cada 3) —
        // depois da escolha abre a loja e sair da loja avança; senão avança direto.
        void OpenDraft()
        {
            if (Hud != null && (Hud.IsDraftOpen || Hud.IsShopOpen)) return; // Enter duplo / Next duplo: não reabre
            _rerollCost = ToppleRules.ShopRerollBase;
            var options = RewardPool.Draft3(ref Run.Rng, PhaseIndex);
            bool shopNext = ToppleRules.IsShopPhase(PhaseIndex);
            Hud.ShowDraft(options, pick =>
            {
                if (pick < 0 || pick >= options.Count) return; // Pick inválido: ignora
                Run.ApplyReward(options[pick].Items);
                Debug.Log($"[TOPPLE][DRAFT] +{options[pick].Label} (deck {Run.DeckTotal()})");
                if (ToppleRules.IsShopPhase(PhaseIndex)) OpenShop();
                else AdvancePhase();
            },
            // Reroll do draft (ouro): nova roleta, custo sobe na mesma visita.
            () =>
            {
                if (Run.Gold < _rerollCost) return;
                Run.Gold -= _rerollCost;
                _rerollCost += ToppleRules.ShopRerollStep;
                Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                OpenDraftRefresh();
            }, _rerollCost, Run.Gold >= _rerollCost, shopNext);
        }

        // Reabre o draft com nova roleta (pós-reroll), sem zerar o custo.
        void OpenDraftRefresh()
        {
            var options = RewardPool.Draft3(ref Run.Rng, PhaseIndex);
            bool shopNext = ToppleRules.IsShopPhase(PhaseIndex);
            Hud.ShowDraft(options, pick =>
            {
                if (pick < 0 || pick >= options.Count) return;
                Run.ApplyReward(options[pick].Items);
                Debug.Log($"[TOPPLE][DRAFT] +{options[pick].Label} (deck {Run.DeckTotal()})");
                if (ToppleRules.IsShopPhase(PhaseIndex)) OpenShop();
                else AdvancePhase();
            },
            () =>
            {
                if (Run.Gold < _rerollCost) return;
                Run.Gold -= _rerollCost;
                _rerollCost += ToppleRules.ShopRerollStep;
                Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                OpenDraftRefresh();
            }, _rerollCost, Run.Gold >= _rerollCost, shopNext);
        }

        // Loja (ouro): 3 ofertas + reroll + cura/tentativa. Sair avança.
        void OpenShop()
        {
            if (Hud != null && Hud.IsShopOpen) return;
            _rerollCost = ToppleRules.ShopRerollBase;
            RefreshShop(RewardPool.Draft3(ref Run.Rng, PhaseIndex));
        }

        void RefreshShop(System.Collections.Generic.List<Topple.Core.RewardOption> offers)
        {
            Hud.ShowShop(Run.Gold, offers,
                buy: i =>
                {
                    if (i < 0 || i >= offers.Count) return;
                    int price = 0;
                    foreach (var it in offers[i].Items) price += ToppleRules.ShopPrice(it.piece, it.count);
                    if (Run.Gold < price) return;
                    Run.Gold -= price;
                    Run.ApplyReward(offers[i].Items);
                    Debug.Log($"[TOPPLE][LOJA] +{offers[i].Label} (-{price} ouro, deck {Run.DeckTotal()})");
                    offers.RemoveAt(i);
                    Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                    RefreshShop(offers);
                },
                onReroll: () =>
                {
                    if (Run.Gold < _rerollCost) return;
                    Run.Gold -= _rerollCost;
                    _rerollCost += ToppleRules.ShopRerollStep;
                    Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                    RefreshShop(RewardPool.Draft3(ref Run.Rng, PhaseIndex));
                }, rerollCost: _rerollCost,
                onHeal: () =>
                {
                    if (Run.Gold < ToppleRules.ShopHealCost || Run.Life >= ToppleRules.StartingLife) return;
                    Run.Gold -= ToppleRules.ShopHealCost;
                    Run.Life = System.Math.Min(Run.Life + ToppleRules.ShopHealLife, ToppleRules.StartingLife);
                    Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                    RefreshShop(offers);
                },
                onAttempt: () =>
                {
                    if (Run.Gold < ToppleRules.ShopAttemptCost || Run.ExtraAttempts >= ToppleRules.ShopMaxExtraAttempts) return;
                    Run.Gold -= ToppleRules.ShopAttemptCost;
                    Run.ExtraAttempts++;
                    Hud.SetRun(Run.Life, Run.AttemptsLeft, ToppleRules.AttemptsPerPhase, Run.Gold);
                    RefreshShop(offers);
                },
                onLeave: () => AdvancePhase());
        }

        void ShowRunEnd(bool victory)
        {
            _runOver = true;
            if (!victory && Audio != null) Audio.Lose(); // stinger T4
            Hud.ShowRunEnd(victory, Run.Life);
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
            if (Hud != null && Planning != null && Planning.Active) Hud.PollShortcuts();
            if (Hud != null && Planning != null && Sim != null)
            {
                if (Sim.Running)
                {
                    Cam.FollowAllowed = false;
                    int k = Sim.KnockedSoFar;
                    if (Audio != null)
                        while (_knocksHeard < k) { Audio.Knock(); _knocksHeard++; }
                    if (Juice != null)
                        while (_puffsHeard < k) { Juice.Puff(Sim.LastKnockPoint); _puffsHeard++; }
                    Hud.SetSimDim(true);
                    Hud.SetStatus(k, SoldierSpots.Count, "Simulando… (Espaço: pular na T4)");
                }
                else if (Planning.Active)
                {
                    Cam.FollowAllowed = true;
                    Cam.FollowPoint = Planning.GhostWorldPos;
                    var (fx, fz) = PlanningData.FacingOf(Planning.RotDeg);
                    Cam.FollowDir = new Vector3(fx, 0f, fz);
                    Hud.SetSimDim(false);
                    Hud.RefreshTray(Planning.Selected, Planning.Data.HandCount);
                    Hud.SyncModes();
                    Hud.SetActions(Planning.Data.Count > 0, Planning.Data.CanUndo);
                    Hud.SetStatus(0, SoldierSpots.Count, Planning.Hint ?? UnreachedWarning(),
                        Planning.Data.Count, _current.ParPieces);
                    DriveCoach();
                }
                else Hud.SetCoach(null);
            }
        }

        void ConfirmBanner()
        {
            // Via OnConfirm do Planning (FireAction provado); sem Keyboard direto.
            // Draft/loja abertos: Enter ignora (escolha é pelos botões/Pick).
            if (Hud != null && (Hud.IsDraftOpen || Hud.IsShopOpen)) return;
            if (LastResult == null) return;
            if (LastResult.Value.Win) OpenDraft(); // vitória paga draft antes de avançar
            else if (Run.AttemptsLeft > 0) BackToPlanning(); // retry (tentativa sobrando)
            else OpenDraft(); // derrota-avançada: draft de consolação
        }

        // Mini-tutorial de gestos: 3 passos até a 1ª vitória DA SESSÃO (sem
        // PlayerPrefs — teste e sessão nova sempre ensinam; some e não volta).
        bool _coachSeen;

        void DriveCoach()
        {
            if (Hud == null) return;
            if (!_coachSeen)
            {
            if (Planning.Data.Count == 0 && !Planning.PathSelecting)
                Hud.SetCoach("1/3 Clique no marcador VERDE — ou arraste desenhando");
                else if (Planning.PathSelecting)
                    Hud.SetCoach("2/3 Clique o destino (Esc cancela a seleção)");
                else
                    Hud.SetCoach("3/3 DISPARE (Enter) — testar é grátis, nada se apaga", "btn-fire");
                return;
            }
            // Pós-tutorial: 1 dica contextual por fase (some ao usar, sem contar passos).
            // P6 Garfo: fork abre 2 frentes; P5 Ronda: ramo curto chega antes do longo.
            if (PhaseIndex == 5 && Planning.Data.HandCount(PieceId.Fork) > 0)
            {
                bool hasFork = false;
                foreach (var p in Planning.Data.Items)
                    if (p.Piece == PieceId.Fork) { hasFork = true; break; }
                if (!hasFork)
                    Hud.SetCoach("Bifurcação: 1 carta abre 2 frentes — continue de cada ponta laranja");
                else Hud.SetCoach(null);
                return;
            }
            if (PhaseIndex == 4 && Planning.Data.Count > 0)
            {
                Hud.SetCoach("Ramo curto chega antes — segure o patrulheiro (discos)");
                return;
            }
            Hud.SetCoach(null);
        }

        // GDD §14.4: aviso amarelo p/ inimigos a >2 m de qualquer peça (não bloqueia).
        // Sem peças ainda: dica do objetivo.
        string UnreachedWarning()
        {
            if (Planning.Data.Count == 0)
                return "Comece no marcador verde e leve a trilha até os soldados, depois DISPARE (Enter)";
            int n = 0;
            foreach (var s in SoldierSpots)
            {
                float best = float.MaxValue;
                foreach (var p in Planning.Data.Items)
                {
                    float dx = PlanningData.ToWorld(p.Gx) - s.Pos.x;
                    float dz = PlanningData.ToWorld(p.Gz) - s.Pos.z;
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
            var vta = UnityEditor.AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/Topple/UI/PlanningHUD.uxml");
            if (vta != null) return vta;
#endif
            // Builds: cópia sincronizada pelo GenerateAll (Resources/Content).
            return Resources.Load<VisualTreeAsset>("Content/PlanningHUD");
        }

        static StyleSheet LoadUss()
        {
#if UNITY_EDITOR
            var uss = UnityEditor.AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/Topple/UI/PlanningHUD.uss");
            if (uss != null) return uss;
#endif
            return Resources.Load<StyleSheet>("Content/PlanningHUD");
        }

        // Fallback p/ player builds (UXML completo só no Editor até a T4).
        static void BuildFallbackUI(UIDocument doc)
        {
            var root = doc.rootVisualElement;
            var bottom = new VisualElement { name = "bottom-bar" };
            var tray = new ScrollView { name = "tray" };
            tray.mode = ScrollViewMode.Horizontal;
            bottom.Add(tray);
            var actions = new VisualElement { name = "actions" };
            foreach (var (name, text) in new[] { ("btn-undo", "Desfazer [Ctrl+Z]"), ("btn-redo", "Recarregar [Ctrl+Y]"), ("btn-last", "Última [X]"), ("btn-fire", "DISPARAR (Enter)"), ("btn-skip", "Pular fase") })
            {
                var b = new Button { name = name, text = text };
                actions.Add(b);
            }
            bottom.Add(actions);
            root.Add(bottom);
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
