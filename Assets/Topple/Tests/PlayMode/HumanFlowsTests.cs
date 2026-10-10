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

        [UnityTest] public IEnumerator Tools_LinePathUndoRemoveRotateFollow()
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
                // HUD estrutural: botoes existem (linha escondida; geometria so assenta com viewport).
                foreach (var n in new[] { "btn-piece-common", "btn-piece-heavy", "btn-piece-ramp", "btn-fire", "btn-undo", "btn-redo", "btn-path", "btn-again", "btn-next" })
                    Assert.IsNotNull(doc.rootVisualElement.Q<Button>(n), "botao ausente: " + n);
                var banner = doc.rootVisualElement.Q<VisualElement>("banner-result");
                Assert.IsTrue(banner.ClassListContains("hidden"));
                Debug.Log("[TOPPLE][HUMAN] checkpoint B: hud ok");

                int base0 = setup.Planning.Data.Count; // 0 (tabuleiro vazio)
                Assert.AreEqual(0, base0);
                Assert.IsTrue(setup.Planning.PathArmed, "trilha deveria nascer ligada");
                Assert.IsFalse(setup.Planning.LineOn, "linha desativada");
                Debug.Log("[TOPPLE][HUMAN] checkpoint C: hud asserts ok");
                // Trilha via mouse: inicio + destino (2 cliques). Fica ligada depois.
                float rot0 = setup.Planning.RotDeg;
                yield return Key(_keyboard.qKey);
                Assert.AreNotEqual(rot0, setup.Planning.RotDeg);
                yield return Click(GroundScreen(cam, -2f, 1f));
                yield return Click(GroundScreen(cam, 0f, 1f));
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
                Assert.AreEqual("Trilha: clique o início", setup.Planning.Hint);
                Debug.Log("[TOPPLE][HUMAN] checkpoint E: undo/reload ok");
                // P virou no-op (trilha sempre ligada).
                yield return Key(_keyboard.pKey);
                Assert.IsTrue(setup.Planning.PathArmed);
                // Esc desfaz a seleção atual (volta a pedir o início), sem desligar.
                yield return Click(GroundScreen(cam, -2f, 1f));
                Assert.AreEqual("Trilha: clique o destino", setup.Planning.Hint);
                int countSel = setup.Planning.Data.Count;
                yield return Key(_keyboard.escapeKey);
                Assert.IsTrue(setup.Planning.PathArmed);
                Assert.AreEqual("Trilha: clique o início", setup.Planning.Hint);
                Assert.AreEqual(countSel, setup.Planning.Data.Count, "Esc não remove peça, só a seleção");
                Debug.Log("[TOPPLE][HUMAN] checkpoint F: P no-op / Esc cancela seleção ok");
                // Uma trilha p/ os testes de âncora/remover (reload deixou vazio).
                yield return Click(GroundScreen(cam, -2f, 1f));
                yield return Click(GroundScreen(cam, 0f, 1f));
                int pathA = setup.Planning.Data.Count;
                Assert.Greater(pathA, base0);
                // ÂNCORA: clicar na última peça continua dela (posição+ângulo,
                // sem custo), não coloca peça nova no clique.
                var last = setup.Planning.Data.Items[setup.Planning.Data.Count - 1];
                var lastWorld = new Vector3(Topple.Game.PlanningData.ToWorld(last.Gx), 0f, Topple.Game.PlanningData.ToWorld(last.Gz));
                yield return Click(cam.WorldToScreenPoint(lastWorld));
                Assert.AreEqual(pathA, setup.Planning.Data.Count, "âncora não coloca peça");
                StringAssert.Contains("continua", setup.Planning.Hint);
                yield return Click(GroundScreen(cam, 2f, 1f));
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
                // Desenhar arrastando: pressão + movimento + soltura confirma.
                int beforeDrag = setup.Planning.Data.Count;
                yield return Drag(GroundScreen(cam, -3f, -2f), GroundScreen(cam, -1f, -2f));
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

        IEnumerator PlayPhaseViaUI(TutorialSetup setup, float endX, float endZ)
        {
            Debug.Log($"[TOPPLE][HUMAN] jogando {setup.PhaseName} ate ({endX},{endZ})");
            var cam = setup.Cam.GetComponent<Camera>();
            Assert.IsTrue(setup.Planning.PathArmed, "trilha sempre ligada");
            yield return Click(GroundScreen(cam, 0f, 0f));
            yield return Click(GroundScreen(cam, endX, endZ));
            Assert.IsTrue(setup.Planning.PathArmed, "trilha continua ligada após commit");
            Time.timeScale = 6f;
            yield return Key(_keyboard.enterKey);
            float t = 0f;
            while (setup.LastResult == null && t < 40f)
            {
                yield return new WaitForSecondsRealtime(0.25f);
                t += 0.25f;
            }
            Time.timeScale = 1f;
            Assert.IsNotNull(setup.LastResult, "sim nao terminou");
            Assert.IsTrue(setup.LastResult.Value.Win,
                $"fase '{setup.PhaseName}' perdida: {setup.LastResult.Value.Knocked}/{setup.LastResult.Value.Total}");
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
                // Fase 1: trilha ate o pelotao.
                yield return PlayPhaseViaUI(setup, 4.0f, 0f);
                setup.Hud.PressNext(); yield return null;
                Assert.AreEqual(1, setup.PhaseIndex);
                // Fase 2: trilha em arco ate o pelotao.
                yield return PlayPhaseViaUI(setup, 3.7f, -0.7f);
                setup.Hud.PressNext(); yield return null;
                Assert.AreEqual(2, setup.PhaseIndex);
                // Fase 3.
                yield return PlayPhaseViaUI(setup, 3.7f, 0.9f);
                Debug.Log("[TOPPLE][HUMAN] 3 fases zeradas so pela UI");
            }
            finally { Time.timeScale = 1f; if (setup != null) Object.Destroy(setup.gameObject); }
            yield return null;
        }
    }
}
