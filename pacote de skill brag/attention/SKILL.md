---
name: attention
description: Retention and attention engine for short vertical video (Instagram Reels first). Scores a storyboard for hook strength, pacing and dead zones, rewrites weak beats, adds cinematic "AI-video-style" camera energy with local HyperFrames techniques (no external generators), audits the render against Reels specs and safe zones, produces hook variants for Trial Reels, and diagnoses a published Reel's retention graph to plan a v2. Called by /brag automatically; also use directly when the user says "/attention", "melhorar retenção", "analisar retenção", "gancho", "hook", "reels", "prender atenção", "por que as pessoas pulam meu vídeo", or shares a Reels Insights screenshot.
---

# /attention

Make people stop scrolling, keep watching, and send it to a friend.

Everything runs locally inside Claude + HyperFrames. **Never call external
generative services** (no Higgsfield, no MCP video/image generators, no
cloud TTS/music/image models via `media-use`). Cinematic energy comes from
HyperFrames camera work on the project's own real material. Kokoro TTS via
`npx hyperframes tts` (brag `--voice`) is local and allowed.

## Modes

| Mode | When | Input | Output |
|---|---|---|---|
| `score` | After a storyboard exists (brag Step 2) | `brag-plan.md` or any storyboard | Rewritten storyboard + retention map in `attention-report.md` |
| `boost` | While composing (brag Step 3) | Retention map weak windows | Attention section appended to the composition brief |
| `audit` | After render (brag Step 4) | Rendered MP4 + composition | Pass/fail checklist, fixes applied, deliverables |
| `analyze` | After publishing | Insights screenshot(s) + numbers | Drop-point diagnosis + v2 plan |

Invocation:

```
/attention                         # standalone: score + boost + audit on the HyperFrames project in cwd
/attention score <storyboard.md>
/attention audit <video.mp4>
/attention analyze [screenshot paths] [--plan brag-plan.md]
```

When /brag calls this skill it states the mode; run only that mode and
return to brag. Options brag forwards: `--hooks N` (default 2),
`--format` (default `vertical`), `--no-music`.

`<skill-dir>` is the directory containing this file.

## Platform truth

**Read:** [references/reels-spec.md](references/reels-spec.md) before any mode.
It holds the confirmed ranking signals, export spec, safe zones and caption
rules. Do not invent benchmarks it marks as unverified.

The three signals that matter (Mosseri, 2025): **watch time**, **likes per
reach**, **sends per reach**. Every decision in this skill serves one of them:
the hook and pacing serve watch time; the loop serves watch time; the CTA
asks for a send.

---

## Mode: score

**Read:** [references/retention-rubric.md](references/retention-rubric.md)

1. Build a **retention map**: a second-by-second table of the storyboard
   listing what changes on screen in each second (cut, camera move, new
   element, text arrival, payoff) and what the viewer is waiting for (the
   open loop).
2. Score the storyboard against the rubric (11 criteria, 0–2 each).
3. Rewrite every criterion scoring below 2 directly in the storyboard file
   (keep brag's structure; edit scenes, hook, timings, CTA). Re-score.
4. Mark **weak windows**: any span > 2.5 s with no visual change, or any
   span the rubric flags. These are the targets for `boost`.
5. Write `N` hook variants (default 2) — different *mechanisms*, not
   reworded copies (see rubric → Hook mechanisms). Only the first ~3 s
   differ; everything after the hook is shared.
6. Write `attention-report.md` next to the storyboard: score before/after,
   retention map, weak windows, hook variants.

**Gate:** score ≥ 18/22 and no criterion at 0. Hook criterion must be 2.

## Mode: boost

**Read:** [references/visual-boost.md](references/visual-boost.md)

For each weak window, pick one technique from the boost catalog, applied to
**real product material** (recreated UI, real copy, captured frames). Append
a `## Attention boosts` section to the composition brief listing window,
technique, target element, and intent. Also append the Reels constraints
(safe zone box, burned-in captions, loop ending, CTA placement, hook
variants as swappable hook scene). Leave implementation details to
HyperFrames, as brag does.

**Gate:** every weak window has a boost, and no boost invents UI, data,
features or metrics the product does not have.

## Mode: audit

**Read:** [references/audit.md](references/audit.md)

Check the render (snapshots + ffprobe) against the spec and safe zones, fix
failures in the composition, re-render, then produce the deliverables:
hook-variant renders, no-music renders, Reels caption, cover.

**Gate:** all audit checks pass or each failure is documented to the user.

## Mode: analyze

**Read:** [references/analyze.md](references/analyze.md)

Read the Insights retention graph screenshot, map each drop to the
storyboard second, diagnose, and write `retention-analysis.md` with a v2
plan. Offer to run /brag (or the composition edit) with the v2 plan.

---

## Laws

- **Real over generated.** Every frame is the product's real UI, copy, or a
  graphic of its real concept. Camera energy is allowed; fabricated screens,
  numbers, users or testimonials are not.
- **Frame 1 moves.** No fade from black, no logo sting, no empty
  background in the first second.
- **Sound-off first.** The video must fully make sense muted: burned-in
  captions or on-screen text carry the story.
- **Something changes every 2–4 s.** Never a dead window > 2.5 s.
- **Text lives in the safe box.** Nothing readable outside it.
- **End into the start.** The last frame should visually or verbally lead
  back into the first so the loop feels continuous.
- **Ask for a send, not a like.** "Manda pra quem…" beats "curte e segue".
  No engagement bait ("comenta SIM").
- **No watermarks**, no reused third-party clips.
- **Readability still wins.** brag's reading-time floor is not negotiable;
  pace comes from motion and cuts, not from flashing text.
