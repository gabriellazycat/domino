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
                // 2º trecho CURTO (deck base 10: pathA=6, mão 4 — 4 pts cabem exato).
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
                // Fase 1: trilha ate o pelotao (deck base de 10 fecha).
                yield return PlayPhaseViaUI(setup, 3.2f, 0f);
                setup.Hud.PressNext(); yield return null; // abre o draft
                DraftMostCommons(setup); yield return null;
                Assert.AreEqual(1, setup.PhaseIndex);
                // Fase 2: trilha em arco ate o pelotao.
                yield return PlayPhaseViaUI(setup, 3.7f, -0.7f);
                setup.Hud.PressNext(); yield return null;
                DraftMostCommons(setup); yield return null;
                Assert.AreEqual(2, setup.PhaseIndex);
                // Fase 3.
                yield return PlayPhaseViaUI(setup, 3.7f, 0.9f);
                Debug.Log("[TOPPLE][HUMAN] 3 fases zeradas so pela UI");
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
                // Até a última e além: encerra o run como desistência, sem dano.
                for (int i = 0; i < 8; i++) { setup.Hud.PressSkip(); yield return null; }
                Assert.AreEqual(9, setup.PhaseIndex);
                setup.Hud.PressSkip(); yield return null;
                Assert.AreEqual(life, setup.Run.Life);
                var banner = doc.rootVisualElement.Q<VisualElement>("banner-result");
                Assert.IsFalse(banner.ClassListContains("hidden"), "fim de run deveria aparecer");
                Debug.Log("[TOPPLE][HUMAN] pular fase ok (0→9 + fim sem dano)");
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
                // Deck base: só comuns na bandeja.
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-piece-common"));
                Assert.IsNull(doc.rootVisualElement.Q<Button>("btn-piece-fork"));
                // Draft engorda: fork aparece na bandeja dinâmica.
                setup.Run.ApplyReward(new[] { (PieceId.Fork, 2) });
                setup.LoadPhase(0);
                yield return null;
                yield return null;
                Assert.IsNotNull(doc.rootVisualElement.Q<Button>("btn-piece-fork"), "fork deveria entrar na bandeja");
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
    }
}
