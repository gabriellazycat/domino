# Audit and Reels deliverables

Run from the output directory (brag: `<output-dir>`). Composition lives in
`composition/`.

## 1. Technical check

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate:format=duration,size -of compact brag.mp4
```

Expect (vertical): h264, 1080x1920, 30/1, yuv420p, aac 48000, 15–25 s,
< 300 MB. Re-encode if needed:

```bash
ffmpeg -y -i brag.mp4 -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 128k -ar 48000 -movflags +faststart brag.reels.mp4 && mv brag.reels.mp4 brag.mp4
```

## 2. Visual check

`npx hyperframes snapshot` inside `composition/`, plus frames at 0.0 s,
0.5 s, 1.5 s, 3.0 s and the last second:

```bash
for t in 0.03 0.5 1.5 3.0; do ffmpeg -y -v error -ss $t -i brag.mp4 -frames:v 1 audit-$t.png; done
```

Look at each image and check:

- [ ] Frame at 0.5 s is already moving/showing the hook (not black, not a logo).
- [ ] Hook text fully readable by 1.5 s.
- [ ] All readable text inside the safe box x 65–1015, y 270–1250.
- [ ] Nothing important behind the right rail (x > 960, y > 960).
- [ ] Captions/on-screen text tell the story muted.
- [ ] Last frame leads back into the first (loop).
- [ ] CTA asks for a send, inside the safe box.
- [ ] No watermark, no third-party logo.
- [ ] Every weak window from the retention map has visible motion in the render.

Fix failures in the composition, re-run `npx hyperframes check`, re-render.
Delete the `audit-*.png` files when done.

## 3. Hook variants

The hook must be a swappable unit (its own sub-composition or a composition
variable — see `hyperframes-core`). For each variant beyond A, swap the hook
and render:

```
brag.mp4            — hook A (the poster/frame-0 bake from brag Step 4 applies)
brag-hook-b.mp4     — hook B
brag-hook-c.mp4     — ...
```

Each variant gets its own poster-frame bake if its hook frame differs.

## 4. No-music versions

Unless `--no-music`, render each variant again with the music track removed
(SFX and voice kept), for adding trending audio in-app:

```
brag-nomusic.mp4, brag-hook-b-nomusic.mp4, ...
```

Use a composition variable or toggle the music element's volume to 0 for
the render; do not strip audio with ffmpeg (that would drop SFX too).

## 5. Reels caption

Write `reels-caption.txt`:

```
[First line: plain-language keywords + the hook idea, ≤ 125 chars]
[1–2 lines: what it does, specific, the project's real terms]
[Send CTA: "Manda pra quem …"]

#tag1 #tag2 #tag3   (3–5 specific hashtags, never more than 5)
```

Write in the audience's language (Portuguese for Brazilian projects).

## 6. Cover

`brag.jpg` from brag Step 4 is the cover. Check that its title sits centred
(y ≈ 560–1360) so the 3:4 / 1:1 grid crop keeps it. If not, pick another
settled frame.

## 7. Posting guide (tell the user)

- Post hook A and hook B as **Trial Reels**; after 24–72 h share the one
  with lower skip rate / higher average watch time to followers.
- Use the `-nomusic` file if adding trending audio in-app.
- Paste `reels-caption.txt`; upload `brag.jpg` as cover.
- After a few days, run `/attention analyze` with a screenshot of the
  retention graph.

Add the files above to `attention-report.md` under `## Deliverables`.
