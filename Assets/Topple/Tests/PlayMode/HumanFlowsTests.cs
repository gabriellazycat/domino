// Cobertura humano-sim: ferramentas pelo mouse, botoes por clique real,
// HUD estrutural e zeramento das 3 fases so pela UI (nada de API de jogo
// para jogar — so para montar e verificar).
using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.TestTools;
using UnityEngine.UIElements;
using Topple.Core;
using Topple.Game;

namespace Topple.Tests
{
    public class HumanFlowsTests : InputTestFixture
    {
        Mouse _mouse;
        Keyboard _keyboard;

        public override void Setup()
        {
            base.Setup();
            _mouse = InputSystem.AddDevice<Mouse>();
            _keyboard = InputSystem.AddDevice<Keyboard>();
        }

        IEnumerator Click(Vector2 screen)
        {
            Set(_mouse.position, screen);
            yield return null;
            Press(_mouse.leftButton);
            yield return null;
            Release(_mouse.leftButton);
            yield return null;
        }

        IEnumerator RightClick(Vector2 screen)
        {
            Set(_mouse.position, screen);
            yield return null;
            Press(_mouse.rightButton);
            yield return null;
            Release(_mouse.rightButton);
            yield return null;
        }

        IEnumerator Drag(Vector2 a, Vector2 b)
        {
            Set(_mouse.position, a);
            yield return null;
            Press(_mouse.leftButton);
            yield return null;
            Set(_mouse.position, (a + b) / 2f);
            yield return null;
            Set(_mouse.position, b);
            yield return null;
            Release(_mouse.leftButton);
            yield return null;
        }

        IEnumerator Key(KeyControl key)
        {
            Press(key);
            yield return null;
            Release(key);
            yield return null;
        }

        IEnumerator CtrlKey(KeyControl key)
        {
            Press(_keyboard.leftCtrlKey); // físico: o ctrlKey sintético não é dirigível
            yield return null;
            Press(key);
            yield return null;
            Release(key);
            yield return null;
            Release(_keyboard.leftCtrlKey);
            yield return null;
        }

        Vector2 GroundScreen(Camera cam, float x, float z)
            => cam.WorldToScreenPoint(new Vector3(x, 0f, z));

        UIDocument HudDoc(TutorialSetup setup)
            => setup.GetComponentInChildren<UIDocument>();

        [UnityTest] public IEnumerator Tools_PathUndoRemoveRotateFollow()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanTools");
                yield return null;
                yield return null;
                Debug.Log("[TOPPLE][HUMAN] checkpoint A: setup ok");
                var cam = setup.Cam.GetComponent<Camera>();
                var doc = HudDoc(setup);
                // HUD estrutural: botoes existem (bandeja é dinâmica: só comuns no deck base).
                foreach (var n in new[] { "btn-piece-common", "btn-fire", "btn-undo", "btn-redo", "btn-last", "btn-skip", "btn-again", "btn-next" })
                    Assert.IsNotNull(doc.rootVisualElement.Q<Button>(n), "botao ausente: " + n);
                var banner = doc.rootVisualElement.Q<VisualElement>("banner-result");
                Assert.IsTrue(banner.ClassListContains("hidden"));
                Debug.Log("[TOPPLE][HUMAN] checkpoint B: hud ok");

                int base0 = setup.Planning.Data.Count; // 0 (tabuleiro vazio)
                Assert.AreEqual(0, base0);
                Assert.IsTrue(setup.Planning.PathArmed, "trilha deveria nascer ligada");
                // Raiz obrigatória no trigger (corrente obrigatória): começar fora
                // do trigger com tabuleiro vazio é recusado.
                Assert.IsFalse(setup.Planning.BeginPathAt(-40, 20, -2f, 1f), "fora do trigger deveria recusar");
                Assert.AreEqual("Comece no trigger!", setup.Planning.Hint);
                Debug.Log("[TOPPLE][HUMAN] checkpoint C: hud asserts ok");
                // Trilha via mouse: inicio + destino (2 cliques). Fica ligada depois.
                float rot0 = setup.Planning.RotDeg;
                yield return Key(_keyboard.qKey);
                Assert.AreNotEqual(rot0, setup.Planning.RotDeg);
                yield return Click(GroundScreen(cam, 0f, 0f));
                yield return Click(GroundScreen(cam, 2f, 0f));
                Assert.IsTrue(setup.Planning.PathArmed, "trilha continua ligada após commit");
                int afterPath = setup.Planning.Data.Count;
                Debug.Log($"[TOPPLE][HUMAN] checkpoint D: trilha count={afterPath}");
                Assert.Greater(afterPath, base0 + 1, "trilha nao colocou peças");
                // Desfazer volta ao vazio; Recarregar (Ctrl+Y) zera a fase.
                yield return CtrlKey(_keyboard.zKey);
                Assert.AreEqual(base0, setup.Planning.Data.Count);
                yield return CtrlKey(_keyboard.yKey);
                Assert.AreEqual(base0, setup.Planning.Data.Count, "recarregar zera a fase");
                Assert.IsTrue(setup.Planning.PathArmed, "trilha ligada após recarregar");
                Assert.AreEqual("Trilha: clique o início ou uma peça p/ continuar", setup.Planning.Hint);
                Debug.Log("[TOPPLE][HUMAN] checkpoint E: undo/reload ok");
                // P virou no-op (trilha sempre ligada).
                yield return Key(_keyboard.pKey);
                Assert.IsTrue(setup.Planning.PathArmed);
                // Esc desfaz a seleção atual (volta a pedir o início), sem desligar.
                yield return Click(GroundScreen(cam, 0f, 0f));
                Assert.IsTrue(setup.Planning.PathSelecting, "deveria estar selecionando");
                int countSel = setup.Planning.Data.Count;
                yield return Key(_keyboard.escapeKey);
                Assert.IsTrue(setup.Planning.PathArmed);
                Assert.AreEqual("Trilha: clique o início ou uma peça p/ continuar", setup.Planning.Hint);
                Assert.AreEqual(countSel, setup.Planning.Data.Count, "Esc não remove peça, só a seleção");
                Debug.Log("[TOPPLE][HUMAN] checkpoint F: P no-op / Esc cancela seleção ok");
                // Uma trilha p/ os testes de âncora/remover (reload deixou vazio).
                yield return Click(GroundScreen(cam, 0f, 0f));
                yield return Click(GroundScreen(cam, 2f, 0f));
                int pathA = setup.Planning.Data.Count;
                Assert.Greater(pathA, base0);
                // ÂNCORA: clicar na última peça continua dela (posição+ângulo,
                // sem custo), não coloca peça nova no clique.
                var last = setup.Planning.Data.Items[setup.Planning.Data.Count - 1];
                var lastWorld = new Vector3(Topple.Game.PlanningData.ToWorld(last.Gx), 0f, Topple.Game.PlanningData.ToWorld(last.Gz));
                yield return Click(cam.WorldToScreenPoint(lastWorld));
                Assert.AreEqual(pathA, setup.Planning.Data.Count, "âncora não coloca peça");
                Assert.IsTrue(setup.Planning.PathSelecting, "âncora deveria selecionar");
                // 2º trecho CURTO (deck base 14+1: pathA=6, mão folgada — anexa fácil).
                yield return Click(GroundScreen(cam, 3f, 0f));
                int pathAB = setup.Planning.Data.Count;
                Assert.Greater(pathAB, pathA, "2º trecho deveria anexar");
                Assert.IsTrue(setup.Planning.PathArmed);
                // Desfazer remove SÓ o último trecho (por trecho, não tudo).
                yield return CtrlKey(_keyboard.zKey);
                Assert.AreEqual(pathA, setup.Planning.Data.Count);
                Debug.Log("[TOPPLE][HUMAN] checkpoint F2: âncora + undo por trecho ok");
                // Remover com botao direito (numa peca que existe de verdade).
                int beforeRm = setup.Planning.Data.Count;
                var any = setup.Planning.Data.Items[setup.Planning.Data.Count - 1];
                var rmWorld = new Vector3(Topple.Game.PlanningData.ToWorld(any.Gx), 0f, Topple.Game.PlanningData.ToWorld(any.Gz));
                yield return RightClick(cam.WorldToScreenPoint(rmWorld));
                Assert.AreEqual(beforeRm - 1, setup.Planning.Data.Count);
                // X remove a última criada, onde quer que esteja.
                int beforeX = setup.Planning.Data.Count;
                yield return Key(_keyboard.xKey);
                Assert.AreEqual(beforeX - 1, setup.Planning.Data.Count);
                Debug.Log("[TOPPLE][HUMAN] checkpoint G: remove/X ok");
                // Desenhar arrastando A PARTIR da cabeça (regra da cabeça: chão
                // longe de cabeça é recusado): pressão na última peça + soltura
                // a 0,5 m confirma 1 peça (cabe na mão restante).
                int beforeDrag = setup.Planning.Data.Count;
                var tail = setup.Planning.Data.Items[setup.Planning.Data.Count - 1];
                var tailWorld = new Vector3(Topple.Game.PlanningData.ToWorld(tail.Gx), 0f, Topple.Game.PlanningData.ToWorld(tail.Gz));
                yield return Drag(cam.WorldToScreenPoint(tailWorld),
                    GroundScreen(cam, Topple.Game.PlanningData.ToWorld(tail.Gx) + 0.5f, Topple.Game.PlanningData.ToWorld(tail.Gz)));
                Assert.Greater(setup.Planning.Data.Count, beforeDrag, "arrasto deveria commitar");
                Assert.IsTrue(setup.Planning.PathArmed);
                Debug.Log("[TOPPLE][HUMAN] checkpoint H: arrasto ok");
                // Follow C liga/desliga.
                yield return Key(_keyboard.cKey);
                Assert.IsTrue(setup.Cam.FollowBehind);
                yield return Key(_keyboard.cKey);
                Assert.IsFalse(setup.Cam.FollowBehind);
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        [UnityTest] public IEnumerator Buttons_FireAgainNext()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanButtons");
                yield return null;
                yield return null;
                var cam = setup.Cam.GetComponent<Camera>();
                var doc = HudDoc(setup);
                // Uma trilha curta (2 cliques) + DISPARAR pelo clique (sem Enter).
                yield return Click(GroundScreen(cam, 0f, 0f));
                yield return Click(GroundScreen(cam, 1f, 0f));
                Assert.Greater(setup.Planning.Data.Count, 1, "trilha curta deveria colocar peças");
                Time.timeScale = 6f;
                setup.Hud.PressFire(); yield return null;
                Assert.IsFalse(setup.Planning.Active);
                float t = 0f;
                while (setup.LastResult == null && t < 30f)
                {
                    yield return new WaitForSecondsRealtime(0.25f);
                    t += 0.25f;
                }
                Assert.IsNotNull(setup.LastResult);
                var banner = doc.rootVisualElement.Q<VisualElement>("banner-result");
                Assert.IsFalse(banner.ClassListContains("hidden"), "banner deveria aparecer");
                // De novo pelo clique.
                setup.Hud.PressAgain(); yield return null;
                Assert.IsTrue(setup.Planning.Active);
                Assert.IsTrue(banner.ClassListContains("hidden"));
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        // Como um humano: perde? volta ao planejamento (layout mantido) e ANEXA
        // um trecho ancorado até o centróide dos soldados, em vez de repetir igual.
        IEnumerator PlayPhaseViaUI(TutorialSetup setup, float endX, float endZ)
        {
            Debug.Log($"[TOPPLE][HUMAN] jogando {setup.PhaseName} ate ({endX},{endZ})");
            var cam = setup.Cam.GetComponent<Camera>();
            Assert.IsTrue(setup.Planning.PathArmed, "trilha sempre ligada");
            yield return Click(GroundScreen(cam, 0f, 0f));
            yield return Click(GroundScreen(cam, endX, endZ));
            Assert.IsTrue(setup.Planning.PathArmed, "trilha continua ligada após commit");
            {
                var cells = "";
                foreach (var p in setup.Planning.Data.Items) cells += $"({p.Gx},{p.Gz},r{p.Deg:F0})";
                var f0 = setup.Planning.Data.Items[0];
                Debug.Log($"[TOPPLE][HUMAN] layout {setup.PhaseName}: n={setup.Planning.Data.Count} cells={cells}");
                Debug.Log($"[TOPPLE][HUMAN] order0 gx={f0.Gx} gz={f0.Gz} deg={f0.Deg:F1} id={f0.InstanceId}");
            }
            Time.timeScale = 6f;
            int attempt = 0;
            while (setup.LastResult?.Win != true && attempt < 3)
            {
                attempt++;
                if (attempt > 1)
                {
                    // De novo pelo Enter (banner) e anexa até o centróide.
                    yield return Key(_keyboard.enterKey);
                    yield return null;
                    Assert.IsTrue(setup.Planning.Active, "deveria voltar ao planejamento");
                    var mid = Vector3.zero;
                    foreach (var s in setup.SoldierSpots) mid += s.Pos;
                    mid /= Mathf.Max(1, setup.SoldierSpots.Count);
                    var tail = setup.Planning.Data.Items[setup.Planning.Data.Count - 1];
                    var tailWorld = new Vector3(Topple.Game.PlanningData.ToWorld(tail.Gx), 0f, Topple.Game.PlanningData.ToWorld(tail.Gz));
                    yield return Click(cam.WorldToScreenPoint(tailWorld));
                    yield return Click(cam.WorldToScreenPoint(new Vector3(mid.x, 0f, mid.z)));
                    Debug.Log($"[TOPPLE][HUMAN] tentativa {attempt}: anexo ate ({mid.x:F2},{mid.z:F2}), n={setup.Planning.Data.Count}");
                }
                Debug.Log($"[TOPPLE][HUMAN] pre-fire {setup.PhaseName}: active={setup.Planning.Active} " +
                    $"n={setup.Planning.Data.Count} armed={setup.Planning.PathArmed} hint={setup.Planning.Hint}");
                yield return Key(_keyboard.enterKey);
                Assert.IsFalse(setup.Planning.Active);
                float waited = 0f;
                while (setup.LastResult == null && waited < 40f)
                {
                    yield return new WaitForSecondsRealtime(0.25f);
                    waited += 0.25f;
                }
                Time.timeScale = 1f;
                Assert.IsNotNull(setup.LastResult, "sim não terminou a tempo");
                Debug.Log($"[TOPPLE][HUMAN] tentativa {attempt}: win={setup.LastResult.Value.Win} " +
                    $"{setup.LastResult.Value.Knocked}/{setup.LastResult.Value.Total}");
            }
            Time.timeScale = 1f;
            Assert.IsNotNull(setup.LastResult, "sim nao terminou");
            Assert.IsTrue(setup.LastResult.Value.Win,
                $"fase '{setup.PhaseName}' perdida: {setup.LastResult.Value.Knocked}/{setup.LastResult.Value.Total}");
        }

        // Draft como humano: pega a opção com mais comuns (cadeia precisa).
        int DraftMostCommons(TutorialSetup setup)
        {
            var draft = setup.Hud.LastDraft;
            Assert.IsNotNull(draft, "draft deveria estar aberto");
            Assert.AreEqual(3, draft.Count);
            int best = 0, bestN = -1;
            for (int i = 0; i < draft.Count; i++)
            {
                int n = 0;
                foreach (var it in draft[i].Items)
                    if (it.piece == Topple.Core.PieceId.Common) n += it.count;
                if (n > bestN) { bestN = n; best = i; }
            }
            int before = setup.Run.DeckTotal();
            setup.Hud.PressDraft(best);
            Assert.Greater(setup.Run.DeckTotal(), before, "draft deveria engordar o deck");
            return best;
        }

        [UnityTest] public IEnumerator Human_ClearsAllPhasesViaUI()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanAll");
                yield return null;
                yield return null;
                var doc = HudDoc(setup);
                // Fase 1 (idx 0, sem loja): draft avança direto, sem loja.
                yield return PlayPhaseViaUI(setup, 3.2f, 0f);
                int gold0 = setup.Run.Gold;
                Assert.Greater(gold0, 0, "vitória deveria pagar ouro");
                Assert.IsFalse(Topple.Core.ToppleRules.IsShopPhase(0), "fase 1 não é fase de loja");
                setup.Hud.PressNext(); yield return null; // abre o draft
                Assert.IsNotNull(setup.Hud.LastDraft);
                Assert.IsFalse(doc.rootVisualElement.Q<Label>("lbl-result").text.Contains("LOJA"),
                    "draft sem loja não sinaliza LOJA");
                DraftMostCommons(setup); yield return null; // pick → avança direto
                Assert.IsFalse(setup.Hud.IsShopOpen, "fase sem loja não abre loja");
                Assert.IsFalse(setup.Hud.IsDraftOpen, "draft deveria ter fechado");
                Assert.AreEqual(1, setup.PhaseIndex);
                // Fase 2 (idx 1, sem loja): mesmo fluxo direto.
                yield return PlayPhaseViaUI(setup, 3.7f, -0.7f);
                Assert.IsFalse(Topple.Core.ToppleRules.IsShopPhase(1));
                setup.Hud.PressNext(); yield return null;
                DraftMostCommons(setup); yield return null;
                Assert.IsFalse(setup.Hud.IsShopOpen);
                Assert.AreEqual(2, setup.PhaseIndex);
                // Fase 3 (idx 2, FASE DE LOJA): draft → loja → sair avança.
                Assert.IsTrue(Topple.Core.ToppleRules.IsShopPhase(2), "fase 3 é fase de loja (a cada 3)");
                yield return PlayPhaseViaUI(setup, 3.7f, 0.9f);
                setup.Hud.PressNext(); yield return null;
                Assert.IsNotNull(setup.Hud.LastDraft);
                Assert.IsTrue(doc.rootVisualElement.Q<Label>("lbl-result").text.Contains("LOJA"),
                    "draft da fase de loja sinaliza Próxima parada: LOJA");
                DraftMostCommons(setup); yield return null;
                Assert.IsTrue(setup.Hud.IsShopOpen, "fase de loja abre loja após o draft");
                Assert.IsTrue(doc.rootVisualElement.Q<Label>("lbl-result").text.Contains("★ LOJA ★"),
                    "título da loja deveria ser ★ LOJA ★");
                setup.Hud.PressShopLeave(); yield return null; // sair avança
                Assert.AreEqual(3, setup.PhaseIndex);
                Debug.Log("[TOPPLE][HUMAN] 3 fases zeradas so pela UI (draft sempre, loja só na 3ª)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        [UnityTest] public IEnumerator Skip_AdvancesPhaseViaUI()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanSkip");
                yield return null;
                yield return null;
                var doc = HudDoc(setup);
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-skip"), "botao pular ausente");
                Assert.AreEqual(0, setup.PhaseIndex);
                int life = setup.Run.Life;
                setup.Hud.PressSkip(); yield return null;
                Assert.AreEqual(1, setup.PhaseIndex, "pular deveria avancar 1 fase");
                Assert.IsTrue(setup.Planning.Active, "pular devolve ao planejamento");
                Assert.AreEqual(life, setup.Run.Life, "pular nao da dano");
                // Run infinita: pular sempre avança, sem dano e sem fim.
                for (int i = 0; i < 8; i++) { setup.Hud.PressSkip(); yield return null; }
                Assert.AreEqual(9, setup.PhaseIndex);
                setup.Hud.PressSkip(); yield return null;
                Assert.AreEqual(10, setup.PhaseIndex, "run infinita: fase 10 existe (ciclo 2)");
                Assert.AreEqual(life, setup.Run.Life);
                Assert.IsTrue(setup.Planning.Active);
                var banner = doc.rootVisualElement.Q<VisualElement>("banner-result");
                Assert.IsTrue(banner.ClassListContains("hidden"), "pular nao abre banner");
                Debug.Log("[TOPPLE][HUMAN] pular fase ok (0→10, infinito, sem dano)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        [UnityTest] public IEnumerator Draft_DynamicTrayAndStates()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanDraft");
                yield return null;
                yield return null;
                var doc = HudDoc(setup);
                // Deck base: comuns + 1 bifurcação na bandeja.
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-piece-common"));
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-piece-fork"), "fork do deck base deveria estar na bandeja");
                // Draft engorda: fork soma na bandeja dinâmica.
                int fork0 = setup.Run.DeckCount(PieceId.Fork);
                setup.Run.ApplyReward(new[] { (PieceId.Fork, 2) });
                setup.LoadPhase(0);
                yield return null;
                yield return null;
                Assert.AreEqual(fork0 + 2, setup.Run.DeckCount(PieceId.Fork));
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-piece-fork"), "fork deveria seguir na bandeja");
                // Estados: sem peças, DISPARAR apagado; com peças, aceso.
                setup.Hud.SetActions(false, false);
                Assert.IsFalse(doc.rootVisualElement.Q<Button>("btn-fire").enabledSelf);
                setup.Hud.SetActions(true, true);
                Assert.IsTrue(doc.rootVisualElement.Q<Button>("btn-fire").enabledSelf);
                // Draft abre 3 opções clicáveis via PressDraft.
                setup.Hud.PressFire(); yield return null;
                setup.Hud.PressNext(); yield return null;
                Assert.IsNotNull(setup.Hud.LastDraft, "draft deveria abrir");
                Assert.AreEqual(3, setup.Hud.LastDraft.Count);
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        [UnityTest] public IEnumerator Shop_BuyRerollHealLeaveViaUI()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanShop");
                yield return null;
                yield return null;
                // Loja ocasião (a cada 3): fase 3 (idx 2) é fase de loja.
                setup.LoadPhase(2); yield return null;
                Assert.AreEqual(2, setup.PhaseIndex);
                Assert.IsTrue(Topple.Core.ToppleRules.IsShopPhase(2));
                yield return PlayPhaseViaUI(setup, 3.7f, 0.9f); // vence e paga ouro
                Assert.Greater(setup.Run.Gold, 0, "vitória deveria pagar ouro");
                setup.Hud.PressNext(); yield return null; // abre o draft
                Assert.IsNotNull(setup.Hud.LastDraft);
                setup.Run.Gold += 100; // caixa de teste: tudo acessível
                DraftMostCommons(setup); yield return null; // pick → loja
                Assert.IsTrue(setup.Hud.IsShopOpen, "fase de loja abre loja após o draft");
                Assert.IsNotNull(setup.Hud.LastShop);
                Assert.AreEqual(3, setup.Hud.LastShop.Count);
                // Compra: deck cresce, ouro cai.
                int deck0 = setup.Run.DeckTotal(), gold0 = setup.Run.Gold;
                setup.Hud.PressShop(0); yield return null;
                Assert.Greater(setup.Run.DeckTotal(), deck0, "compra deveria engordar o deck");
                Assert.Less(setup.Run.Gold, gold0, "compra deveria gastar ouro");
                // Reroll: novas ofertas, ouro cai.
                int gold1 = setup.Run.Gold;
                setup.Hud.PressShopReroll(); yield return null;
                Assert.AreEqual(3, setup.Hud.LastShop.Count, "reroll deveria repor 3 ofertas");
                Assert.Less(setup.Run.Gold, gold1, "reroll deveria gastar ouro");
                // Cura: machuca, cura, vida sobe com teto.
                setup.Run.Damage(3);
                int life0 = setup.Run.Life, gold2 = setup.Run.Gold;
                setup.Hud.PressShopHeal(); yield return null;
                Assert.Greater(setup.Run.Life, life0, "cura deveria recuperar vida");
                Assert.LessOrEqual(setup.Run.Life, Topple.Core.ToppleRules.StartingLife);
                Assert.Less(setup.Run.Gold, gold2);
                // Tentativa extra: próxima fase com 4.
                setup.Hud.PressShopAttempt(); yield return null;
                Assert.AreEqual(1, setup.Run.ExtraAttempts);
                // Sair avança.
                setup.Hud.PressShopLeave(); yield return null;
                Assert.AreEqual(3, setup.PhaseIndex);
                Assert.IsFalse(setup.Hud.IsShopOpen);
                Assert.AreEqual(4, setup.Run.AttemptsLeft, "tentativa extra deveria entrar na fase");
                Debug.Log("[TOPPLE][HUMAN] loja ok (compra/reroll/cura/tentativa/sair)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }

        [UnityTest] public IEnumerator Infinite_LoadsBeyondPhase10()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanInfinite");
                yield return null;
                yield return null;
                setup.LoadPhase(10); yield return null;
                Assert.AreEqual(10, setup.PhaseIndex);
                Assert.GreaterOrEqual(setup.SoldierSpots.Count, 4, "fase gerada tem pelotões");
                Assert.IsTrue(setup.PhaseName.StartsWith("Gerada"), "prof. 10+ é procedural: " + setup.PhaseName);
                Assert.IsTrue(setup.Planning.Active);
                setup.LoadPhase(25); yield return null;
                Assert.AreEqual(25, setup.PhaseIndex);
                Assert.Greater(setup.SoldierSpots.Count, 0);
                setup.LoadPhase(0); yield return null;
                Assert.AreEqual(0, setup.PhaseIndex);
                Debug.Log("[TOPPLE][HUMAN] infinito ok (10/25/0)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        [UnityTest] public IEnumerator Patrol_PathIsBuildable()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanPatrolBuild");
                yield return null;
                yield return null;
                setup.LoadPhase(4); // Ronda: loop 4.5-6.0 x ±1.5
                yield return null;
                // Meio do segmento sul do loop: construível (por sua conta e risco).
                Assert.IsTrue(setup.Planning.IsValidCell(105, -30, Topple.Core.PieceId.Common, 90f),
                    "caminho da patrulha deveria aceitar peça");
                // Corpo do soldado continua proibido (só o caminho liberou).
                Assert.IsFalse(setup.Planning.IsValidCell(72, -24, Topple.Core.PieceId.Common, 90f),
                    "em cima do soldado continua bloqueado");
                Debug.Log("[TOPPLE][HUMAN] caminho da patrulha construível ok");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        [UnityTest] public IEnumerator Gap_BlocksPlacementAndWarns()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanGap");
                yield return null;
                yield return null;
                // Disco injetado (mesma forma do conversor): barra dentro, libera fora.
                setup.Planning.Forbidden.Add(new Topple.Game.PlanningController.ForbiddenZone
                    { C = new Vector3(6f, 0f, 0f), R = 0.4f });
                setup.Planning.GapDiscs.Add((new Vector3(6f, 0f, 0f), 0.4f, 0.6f));
                Assert.IsFalse(setup.Planning.IsValidCell(120, 0, Topple.Core.PieceId.Common, 90f),
                    "dentro da ponte não constrói");
                Assert.IsTrue(setup.Planning.IsValidCell(140, 0, Topple.Core.PieceId.Common, 90f),
                    "fora da ponte constrói");
                Assert.IsTrue(setup.Planning.NearGap(6f, 0f));
                Assert.IsFalse(setup.Planning.NearGap(7f, 0f));
                Debug.Log("[TOPPLE][HUMAN] ponte-vao ok (barra + avisa)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        [UnityTest] public IEnumerator Void_BlocksPlacement()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanVoid");
                yield return null;
                yield return null;
                // Retângulo injetado (mesma forma do conversor): barra dentro, libera fora.
                setup.Planning.VoidRects.Add((new Vector3(6f, 0f, -1f), new Vector3(7f, 0f, 1f)));
                Assert.IsFalse(setup.Planning.IsValidCell(130, -10, Topple.Core.PieceId.Common, 90f),
                    "no buraco não constrói");
                Assert.IsTrue(setup.Planning.IsValidCell(150, -10, Topple.Core.PieceId.Common, 90f),
                    "fora do buraco constrói");
                Assert.IsTrue(setup.Planning.NearVoid(6.5f, 0f));
                Assert.IsFalse(setup.Planning.NearVoid(7.5f, 0f));
                Debug.Log("[TOPPLE][HUMAN] buraco ok (barra + avisa)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        // Câmera/HUD da sim (dono, opção B + enxuta total): na sim some bandeja
        // e ações (ficam objetivo + banner), câmera 100% manual (ToppleCam não
        // sobrescreve o Target, C morto); no retry a HUD cheia volta.
        [UnityTest] public IEnumerator Sim_HidesPlanningUIAndFreesCamera()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanSimCam");
                yield return null;
                yield return null;
                var doc = HudDoc(setup);
                var cam = setup.Cam.GetComponent<Camera>();
                yield return Click(GroundScreen(cam, 0f, 0f));
                yield return Click(GroundScreen(cam, 1f, 0f));
                Assert.Greater(setup.Planning.Data.Count, 1, "trilha curta deveria colocar peças");
                Time.timeScale = 6f;
                setup.Hud.PressFire(); yield return null; yield return null;
                Assert.IsTrue(setup.Sim.Running, "sim deveria estar rodando");
                var root = doc.rootVisualElement;
                Assert.AreEqual(DisplayStyle.None, root.Q<ScrollView>("tray").style.display.value,
                    "bandeja some na sim");
                foreach (var n in new[] { "btn-fire", "btn-undo", "btn-redo", "btn-last" })
                    Assert.AreEqual(DisplayStyle.None, root.Q<Button>(n).style.display.value,
                        "botao some na sim: " + n);
                Assert.IsNotNull(root.Q<Label>("lbl-objective"), "objetivo fica na sim");
                // Câmera livre: ToppleCam não toca o Target; C morto na sim.
                setup.Cam.Target = new Vector3(-4f, 0f, 3f);
                yield return null; yield return null;
                Assert.AreEqual(new Vector3(-4f, 0f, 3f), setup.Cam.Target,
                    "ToppleCam não deveria sobrescrever o Target na sim");
                Assert.IsFalse(setup.Cam.FollowToggleEnabled, "C morto na sim");
                Assert.IsFalse(setup.Cam.FollowBehind);
                // Espera o fim; retry devolve a HUD cheia.
                float t = 0f;
                while (setup.LastResult == null && t < 40f)
                {
                    yield return new WaitForSecondsRealtime(0.25f);
                    t += 0.25f;
                }
                Assert.IsNotNull(setup.LastResult, "sim deveria terminar");
                setup.Hud.PressAgain(); yield return null; yield return null;
                Assert.IsTrue(setup.Planning.Active, "retry volta ao planejamento");
                Assert.AreEqual(DisplayStyle.Flex, root.Q<ScrollView>("tray").style.display.value,
                    "bandeja volta no retry");
                Assert.AreEqual(DisplayStyle.Flex, root.Q<Button>("btn-fire").style.display.value,
                    "DISPARAR volta no retry");
                Assert.IsTrue(setup.Cam.FollowToggleEnabled, "C volta no planejamento");
                Debug.Log("[TOPPLE][HUMAN] sim enxuta + câmera livre ok");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        // Vitrine da patrulha (dono): anda no planejamento, sem interagir —
        // spots, mão e sim intactos.
        [UnityTest] public IEnumerator Patrol_VitrineWalksWithoutTouching()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanVitrine");
                yield return null;
                yield return null;
                setup.LoadPhase(4); // Ronda: tem patrulheiro
                yield return null; yield return null;
                Assert.IsNotNull(setup.PatrolVitrine, "vitrine deveria existir");
                Assert.Greater(setup.PatrolVitrine.Count, 0, "Ronda deveria ter patrulha na vitrine");
                Assert.IsFalse(setup.Sim.Running);
                int n0 = setup.Planning.Data.Count;
                var spots = new List<Vector3>();
                foreach (var s in setup.SoldierSpots) spots.Add(s.Pos);
                var p0 = setup.PatrolVitrine.PreviewPos(0);
                // Relógio de parede (em batch os frames voam: 30 frames ≈ 30 ms).
                yield return new WaitForSecondsRealtime(0.6f);
                var p1 = setup.PatrolVitrine.PreviewPos(0);
                Assert.Greater(Vector3.Distance(p0, p1), 0.03f, "vitrine deveria andar no loop");
                Assert.AreEqual(spots.Count, setup.SoldierSpots.Count);
                for (int i = 0; i < spots.Count; i++)
                    Assert.AreEqual(spots[i], setup.SoldierSpots[i].Pos, "spots intactos (sem interação)");
                Assert.AreEqual(n0, setup.Planning.Data.Count, "mão intacta (sem interação)");
                Debug.Log("[TOPPLE][HUMAN] vitrine da patrulha ok (anda, sem tocar)");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        // Continuidade vitrine→sim (dono): o patrulheiro nasce onde ESTAVA
        // (não volta ao waypoint 0). Espera a vitrine andar (~1 m) e dispara.
        [UnityTest] public IEnumerator Patrol_ContinuesFromVitrineIntoSim()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanPatrolKeep");
                yield return null;
                yield return null;
                setup.LoadPhase(4); // Ronda: 1 patrulheiro (0,5 m/s)
                yield return null; yield return null;
                Assert.Greater(setup.PatrolVitrine.Count, 0);
                var cam = setup.Cam.GetComponent<Camera>();
                yield return Click(GroundScreen(cam, 0f, 0f));
                yield return Click(GroundScreen(cam, 1f, 0f));
                Assert.Greater(setup.Planning.Data.Count, 1);
                yield return new WaitForSecondsRealtime(2.0f); // vitrine anda ~1 m
                var p0 = setup.PatrolVitrine.PreviewPos(0);
                setup.Hud.PressFire(); yield return null; yield return null;
                Assert.IsTrue(setup.Sim.Running, "sim deveria estar rodando");
                // FixedUpdate precisa rodar (em batch 2 frames não bastam).
                yield return new WaitForSecondsRealtime(0.3f);
                Vector3 live = Vector3.zero;
                bool found = false;
                foreach (var en in setup.Sim.Enemies)
                    if (en != null && en.Kind == Topple.Core.EnemyKind.Patroller)
                    {
                        live = en.transform.position;
                        found = true;
                        break;
                    }
                Assert.IsTrue(found, "patrulheiro da sim ausente");
                float d = Vector3.Distance(new Vector3(p0.x, 0f, p0.z), new Vector3(live.x, 0f, live.z));
                Assert.Less(d, 0.35f, $"nasceu longe de onde estava ({d:F2} m) — voltou ao waypoint 0?");
                Debug.Log("[TOPPLE][HUMAN] patrulha continua da vitrine p/ sim ok");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
        // Main menu: abre, settings aplicam volume, Play entra, auto-save por
        // fase grava e Load restaura (deck/ouro/fase). Save de teste isolado.
        [UnityTest] public IEnumerator Menu_PlaySettingsSaveLoad()
        {
            TutorialSetup setup = null;
            string testFile = System.IO.Path.Combine(Application.persistentDataPath, "test_menu_autosave.json");
            float vol0 = AudioListener.volume;
            try
            {
                Topple.Game.RunStore.FileOverride = testFile;
                if (System.IO.File.Exists(testFile)) System.IO.File.Delete(testFile);
                setup = TutorialSetup.Build("HumanMenu");
                yield return null;
                yield return null;
                Assert.IsNotNull(setup.Menu, "menu deveria existir");
                setup.ShowMenu(); yield return null;
                Assert.IsTrue(setup.Menu.IsVisible, "menu deveria abrir");
                Assert.IsTrue(setup.Planning.InputBlocked, "menu bloqueia o input");
                // Settings aplicam ao vivo.
                setup.Menu.SetVolumeUI(0.5f); yield return null;
                Assert.AreEqual(0.5f, AudioListener.volume, 1e-3f, "volume deveria aplicar");
                // Play entra na fase 0 e salva o checkpoint.
                setup.Menu.PressPlay(); yield return null; yield return null;
                Assert.IsFalse(setup.Menu.IsVisible, "Play fecha o menu");
                Assert.IsTrue(setup.Planning.Active, "Play entra no planejamento");
                Assert.AreEqual(0, setup.PhaseIndex);
                Assert.IsTrue(System.IO.File.Exists(testFile), "LoadPhase deveria auto-salvar");
                // Avança p/ fase 3 com ouro, depois p/ 5 (saves 3 e 5).
                setup.Run.Gold = 42;
                setup.LoadPhase(3); yield return null;
                int deck3 = setup.Run.DeckTotal();
                setup.LoadPhase(5); yield return null;
                Assert.AreEqual(5, setup.PhaseIndex);
                // Load restaura o checkpoint da fase 5 (último save).
                setup.ShowMenu(); yield return null;
                setup.Menu.PressLoad(); yield return null; yield return null;
                Assert.IsFalse(setup.Menu.IsVisible, "Load fecha o menu");
                Assert.AreEqual(5, setup.PhaseIndex, "load restaura a fase salva");
                Assert.AreEqual(42, setup.Run.Gold, "load restaura o ouro");
                Assert.AreEqual(deck3, setup.Run.DeckTotal(), "load restaura o deck");
                Assert.IsTrue(setup.Planning.Active);
                Debug.Log("[TOPPLE][HUMAN] menu play/settings/save/load ok");
            }
            finally
            {
                Time.timeScale = 1f;
                AudioListener.volume = vol0;
                Topple.Game.RunStore.FileOverride = null;
                try { if (System.IO.File.Exists(testFile)) System.IO.File.Delete(testFile); } catch { }
                if (setup != null) Object.Destroy(setup.gameObject);
            }
            yield return null;
        }
        // Terreno fake (dono, gameplay > visual): P2 com 3 pinturas de muro,
        // saias do buraco sem collider, sujidade e colinas presentes.
        [UnityTest] public IEnumerator Terrain_WallVariantsVoidDressingHills()
        {
            TutorialSetup setup = null;
            GameObject holder = null;
            try
            {
                setup = TutorialSetup.Build("HumanTerrain");
                yield return null;
                yield return null;
                setup.LoadPhase(1); // Curva do Muro: House + Stone + Fence
                yield return null;
                var previews = setup.transform.Find("BlockPreviews");
                Assert.IsNotNull(previews, "previews de muro ausentes");
                var colors = new System.Collections.Generic.HashSet<Color>();
                foreach (Transform c in previews)
                {
                    var r = c.GetComponent<Renderer>();
                    if (r != null && r.sharedMaterial != null) colors.Add(r.sharedMaterial.color);
                }
                Assert.AreEqual(3, colors.Count, "1 pintura por variante (sem telhado)");
                // Saias do buraco: 1 buraco 2×2 → 4 saias + 4 filetes, sem colliders.
                holder = new GameObject("VoidTestHolder");
                var voids = new System.Collections.Generic.List<TutorialSetup.VoidDef>
                {
                    new TutorialSetup.VoidDef { Center = new Vector3(0f, 0f, 0f), Size = new Vector3(2f, 0.5f, 2f) },
                };
                int n = TutorialSetup.BuildVoidDressing(holder.transform, voids);
                Assert.AreEqual(8, n, "4 saias + 4 filetes por buraco");
                Assert.AreEqual(8, holder.transform.childCount);
                yield return null; // Destroy de collider é fim-de-frame
                Assert.AreEqual(0, holder.GetComponentsInChildren<Collider>().Length, "vitrine sem física");
                // Fase com sujidade + fundo: grupos presentes e feltro manchado.
                Assert.IsNotNull(setup.transform.Find("GroundDressing"), "sujidade ausente");
                Assert.IsNotNull(setup.transform.Find("VoidDressing"), "grupo do buraco ausente");
                Assert.IsNotNull(setup.transform.Find("BackdropHills"), "colinas ausentes");
                Assert.AreEqual(10, setup.transform.Find("BackdropHills").childCount, "anel de 10 colinas");
                Assert.Greater(setup.transform.Find("GroundDressing").childCount, 0, "feltro com sujidade");
                Debug.Log("[TOPPLE][HUMAN] terreno fake ok (muros/buraco/colinas)");
            }
            finally
            {
                Time.timeScale = 1f;
                if (holder != null) Object.Destroy(holder);
                if (setup != null) Object.Destroy(setup.gameObject);
            }
            yield return null;
        }
        // Beleza F7: menu montado com as classes do tema; loja vira carta
        // dourada e o resultado volta ao âmbar.
        [UnityTest] public IEnumerator Beauty_MenuAndShopStyling()
        {
            TutorialSetup setup = null;
            try
            {
                setup = TutorialSetup.Build("HumanBeauty");
                yield return null;
                yield return null;
                var root = HudDoc(setup).rootVisualElement;
                Assert.IsNotNull(root.Q<VisualElement>("menu-root"), "menu-root ausente");
                Assert.IsNotNull(root.Q<VisualElement>("menu-panel"), "menu-panel ausente");
                Assert.IsNotNull(root.Q<Button>("btn-menu-play"), "play ausente");
                Assert.IsNotNull(root.Q<Button>("btn-menu-open"), "botao ≡ ausente");
                Assert.IsNotNull(root.Q<Slider>("slider-menu-volume"), "volume ausente");
                Assert.IsNotNull(root.Q<Toggle>("toggle-menu-postfx"), "pos ausente");
                var offers = new System.Collections.Generic.List<Topple.Core.RewardOption>
                {
                    new Topple.Core.RewardOption { Label = "5 Comuns", Items = new[] { (PieceId.Common, 5) } },
                };
                setup.Hud.ShowShop(20, offers, i => { }, null, 8, null, null, () => { });
                Assert.IsTrue(root.Q<VisualElement>("banner-result").ClassListContains("shop"), "loja dourada");
                setup.Hud.HideResult();
                Assert.IsFalse(root.Q<VisualElement>("banner-result").ClassListContains("shop"), "resultado sem dourado");
                Debug.Log("[TOPPLE][HUMAN] beleza menu/loja ok");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
    }
}
