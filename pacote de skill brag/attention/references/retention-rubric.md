# Retention rubric

Score each criterion 0 (fails), 1 (weak), 2 (strong). Max 22.
Gate: ≥ 18, no zeros, **Hook = 2**.

| # | Criterion | 2 = strong | 0 = fails |
|---|---|---|---|
| 1 | **Hook** (0–3 s) | Frame 1 already moving; a concrete claim, tension or visual surprise readable by ~1.5 s; uses a hook mechanism below | Logo/fade/intro, context before payoff, generic line |
| 2 | **Open loop** | A question/promise set in the hook that is paid off late (≥ 60 % in) | Everything revealed up front, nothing to wait for |
| 3 | **Pattern interrupts** | Visual change every 2–4 s (cut, camera move, new element, scale shift) | Any span > 2.5 s with nothing changing |
| 4 | **Escalation** | Each beat is bigger/more surprising than the last; best moment saved for 60–80 % | Strongest moment first, then flat |
| 5 | **Sound-off clarity** | Story fully understood muted via on-screen text/captions | Meaning depends on audio/voice |
| 6 | **Readability** | Every line meets brag's reading floor (~0.8 s label, ~0.3 s/word sentence); ≤ ~7 words per card | Text exits before it can be read; walls of text |
| 7 | **Safe zones** | All readable text inside the safe box (reels-spec.md) | Text under caption area or behind buttons |
| 8 | **Show the thing** | Real UI/flow on screen by ≤ 5 s; product doing its thing | Abstract filler; product appears late |
| 9 | **Loop ending** | Last frame/line flows back into the first (visual match, sentence that completes on the hook) | Hard stop on a static logo card |
| 10 | **Send CTA** | Last ~2 s give a specific reason to send ("manda pra quem ainda faz X na mão"), inside safe box, ≤ 2 s | No CTA, "link na bio" only, or engagement bait |
| 11 | **Length/density** | 15–25 s, no beat that could be cut without loss | Padding, repeated points, long outro |

## Retention map format

```markdown
| s | On screen | Change type | Viewer waiting for | Risk |
|---|---|---|---|---|
| 0 | Hook line slams in over upload screen | new element + punch-in | "does it really do that?" | — |
| 1 | ... | ... | ... | ... |
```

Change types: `cut`, `camera` (push/pan/zoom/tilt), `element` (new thing
appears), `text`, `payoff`, `none`. Two consecutive `none` seconds mark a
weak window.

## Hook mechanisms

Each variant must use a **different** mechanism. Pick the ones the project
can support with real material.

| Mechanism | Pattern | Example |
|---|---|---|
| **Result first** | Show the end state before the process | Finished dashboard full of data, then "isso levou 4 segundos" |
| **Bold claim** | Specific, checkable, slightly provocative | "Apaguei 3 planilhas com 1 botão" |
| **Pain call-out** | Name the viewer's exact frustration | "Se você ainda copia isso na mão…" |
| **Visual surprise** | An impossible-looking motion or scale on real UI | Crash-zoom from full screen into one tiny button that does everything |
| **Before/after split** | Messy vs clean on screen at once | Split frame, old flow left, product right |
| **Question/curiosity gap** | Ask what the video answers at the end | "Quanto tempo leva pra…? Até o fim você vai ver." (must be paid off) |
| **Pattern break** | Mid-action start, as if the video already began | Cursor already dragging the file at frame 1 |

Hook copy rules: ≤ 7 words on screen, concrete nouns/numbers from the
project, Portuguese if the project/audience is Brazilian, no "Você sabia
que…", no "Neste vídeo…".

## Rewriting guidance

- Hook < 2 → move the strongest visual or result into second 0; delete
  setup.
- Open loop < 2 → add a promise in the hook and pay it off in the 60–80 %
  beat.
- Interrupts < 2 → split the long scene or mark the window for a `boost`.
- Escalation < 2 → reorder highlights, best last before the outro.
- Loop < 2 → end on a frame that matches the hook's composition or a line
  that completes into the hook line.
- CTA < 2 → write a send CTA naming who should receive it.
- Length < 2 → cut the weakest highlight before shortening holds.
