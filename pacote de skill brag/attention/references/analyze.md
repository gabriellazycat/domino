# Analyze a published Reel

The second-by-second retention curve exists only in the app (Insights →
Reel → retention graph). The user provides it as a screenshot. Read images
with the Read tool.

## Inputs

Ask only for what is missing:

1. Screenshot of the **retention graph** (required).
2. Numbers from Insights: views, reach, **skip rate**, **average watch
   time**, video length, likes, comments, saves, **shares/sends**,
   follows. Accept partial.
3. The storyboard (`brag-plan.md` / `attention-report.md`) or the video
   file. If neither exists, extract frames every second with ffmpeg and
   describe them.
4. Which variant it was (hook A/B) and whether it was a Trial Reel.

## Read the curve

Estimate the curve at each second from the screenshot (x = time, y = % of
viewers still watching). Record readings in a table and say they are
estimates read from an image.

Classify each drop:

| Shape | Where | Likely cause | Fix |
|---|---|---|---|
| Steep cliff | 0–3 s | Hook doesn't stop the scroll; slow start; unclear first frame | New hook mechanism; motion at frame 1; result-first |
| Slope continues | 3–6 s | Hook promise not credible or not relevant; product appears too late | Show the thing by 3 s; tighten the promise |
| Step drop | Mid-video | Dead window, repeated point, text wall, confusing transition | Boost or cut that beat |
| Drop before end | Last 20 % | Outro/logo too long; viewers sense it's over | Shorter outro; CTA inside the action; loop ending |
| Bump up | Anywhere | Rewatching a moment | That moment works: move it earlier or echo it in the hook |
| Avg watch ≥ length | — | Loops/replays | Loop works; keep the ending |

Map each drop to the storyboard second and name the scene.

## Read the numbers

Instagram publishes no benchmarks; compare against the user's own previous
Reels when they give them. Ratios worth computing: sends/reach, likes/reach,
saves/reach, avg watch time ÷ length. A high skip rate with good later
retention means fix only the hook. Good retention with low sends means fix
the CTA and the "who do I send this to" angle.

## Output

Write `retention-analysis.md` next to the storyboard (or in cwd):

```markdown
# Retention analysis: [video]
## Readings (estimated from screenshot)
## Drop points → scenes → cause
## What worked (keep)
## v2 plan
- Hook: [new mechanism + copy]
- Cuts/boosts: [scene → change]
- Ending/CTA: [change]
## Next test
[Which two variants to post as Trial Reels and what to compare]
```

Then offer to apply the v2 plan: edit the storyboard and run
`/attention score` → brag Step 3–4 (or edit the existing composition and
re-render).
