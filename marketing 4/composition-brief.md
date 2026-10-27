# Hyperframes Composition Brief: DOMINOTION — trailer YouTube v4

## Objective
Create a ~61 s cinematic YouTube/Steam trailer for DOMINOTION from real gameplay captures, with the
table's Owner (his real in-game lines) as the narrator.

## Output
- Composition directory: `marketing 4/composition/`
- Rendered video: `marketing 4/dominotion-trailer-youtube-v4.mp4` (poster `…-v4.jpg`)
- Format: landscape — 1920×1080, 60 fps
- Duration: ~61 s (trailer; justified in `brag-plan.md`)

## Source Material
- Project root: `C:\Users\gabri\Desktop\domino`
- Files read: `README.md`, `web/README.md`, `web/src/style.css`, `web/src/i18n.en.ts`,
  `web/src/core/pieces.ts`, `web/src/ui/ui.ts` (speech balloon), `web/e2e/trailer/*` (capture pipeline)
- Footage: `web/e2e/trailer/raw3/*.mp4|wav` (1080p, 60/120 fps, game audio in the WAV), new takes in
  `web/e2e/trailer/raw4/` (`ev-press`, `ev-curse`, `music-yt4`)
- Product name: DOMINOTION — "A DOMINO ROGUELIKE"
- Strongest claim: one push topples an army — *topple them before they topple you*
- Copy that must appear verbatim (game strings, English build):
  - KABOOM!
  - "You made it this far. Too bad."
  - "Come to shop? Everything here has a price."
  - "The press marks forever. Choose well."
  - "The altar listens. Pay, and it answers."
  - "Brought you a little gift. You can't refuse."
  - Piece/enemy names: TRI-FORK, HOPPER, ROCKET, BLAST, OGRE, THE GENERAL; events SHOP, SEAL PRESS,
    MYSTIC ALTAR, OWNER'S GIFT (the old trailer's "TRIFORK"/"JUMPER" are outdated names)

## Creative Direction
- Tone preset: cinematic — dark toy-box fairy tale with a wink
- Angle: "The table has an owner." Gameplay sells the mechanic; the Owner's typed lines glue the acts.
- Hook: slow-mo scared domino faces → KABOOM! at 2.4 s → giant hand sweeps the table → "Too bad."
- Outro: TOPPLE THEM BEFORE THEY TOPPLE YOU. → domino-tile logo topple → WISHLIST NOW ON STEAM
- Avoid: generic SaaS language, abstract filler, invented UI or numbers, effects on readable text.

## Visual Identity
- Background `#070508`; panel `#1a1310`; rule `#4a3626`; balloon border `#6a5030`
- Text cream `#e8dcc0` / balloon `#f0e4c8`; muted `#9a8a70`
- Accent gold `#d6b25a` / `#f0d48a`; red `#a3201c` / `#d6402e`
- Display: IM Fell English SC; labels: Silkscreen; body: Nunito (woff2 from `web/node_modules/@fontsource`)
- Piece colours: tri-fork `#d6457a`, hopper `#4fae5c`, rocket `#f2c14e`, blast `#e5493a`, tower `#7d5bd6`
- Text style from the game logo: cream with a dark-red 0.04em drop + soft black glow.

## Storyboard
Contract: `brag-plan.md` (scenes 1–24). Scene summary:
1. Faces (hook) — 2.0 s · 2. KABOOM — 1.3 s · 3. Owner's hand + line — 2.7 s · 4. Title ident — 2.0 s
5. 01 PLAN THE CHAIN — 3.0 s · 6. Build montage — 1.5 s · 7. 02 PUSH ONE PIECE — 1.5 s
8. 03 TOPPLE EVERYTHING — 4.5 s · 9. EVERY PIECE HAS A TRICK — 1.6 s
10–13. Roster freezes TRI-FORK / HOPPER / ROCKET / BLAST — ~10 s · 14. OGRE — 3 s · 15. THE GENERAL — 3 s
16–19. SHOP / SEAL PRESS / MYSTIC ALTAR / OWNER'S GIFT — 4 × 3 s · 20–23. Climax — ~6.3 s
24. End card — 7 s

## Audio
- Audio role: cinematic support
- Music: `raw4/music-yt4.wav` — the game's own generative music, recorded with an intensity arc for this
  cut (hook full → quiet Owner → build → full wave/enemies → eerie events → full climax → out)
- Music treatment: align the beat grid to the edit (0.5 s grid, 120 BPM); fade to near-silence for the
  Owner's first line; fade out under the end card so tile clacks + bell carry the logo
- Music cue guidance: detect with `analyze_music_cues.py` (custom track). Beat-locks: KABOOM 2.4 s, title
  6.0 s, TOPPLE EVERYTHING 14.0 s, climax start.
- Audio-reactive: subtle — music RMS/bass drives the warm vignette glow and caption gold rules
- Footage audio: baked per shot from the take WAVs (slow-mo shots pitched down like the old pipeline)
- SFX (from `~/.claude/skills/brag/assets/sfx`, CC0): wood knocks for the end-card topple, tile place on
  roster cards, soft key ticks on typed Owner lines, heavy bell on title + logo, soft impacts on caption
  slams; choose exact files after the animation exists (see `sfx-analysis.md`)
- Audio files: copy everything used into `composition/assets/`

## Hyperframes Instructions
Use hyperframes-core / -animation / -creative / -keyframes / -cli; /brag is its own workflow (no intent
interview). Footage shots are pre-cut with ffmpeg (speed, reverse, slow-mo pitch) into
`composition/assets/shots/` and placed as `<video data-has-audio="true">` clips; freezes are PNG stills.
Run `npx hyperframes check` before render.

## Attention boosts
| Window | Technique | Target | Intent |
|---|---|---|---|
| 0–2.0 s | slow push-in + letterbox | hero-front faces | frame 1 moves, cinematic scale |
| 2.4 s | crash flash + 3-frame shake | KABOOM! word + footage | payoff of the hook |
| 3.3–6.0 s | slow push-in toward the mask | sweep footage + balloon | keep the read alive (weak window 2) |
| 12.5–14.0 s | punch-in on the FIRE! button, release on the click | draw footage | real UI interaction |
| 16.5 s | beat punch-in on the wave split | hero-game | weak window 1 |
| 20–30 s | freeze + spotlight + push-in | roster subjects | name each trick on the real frame |
| 48–52 s | hard cuts on the beat, one speed ramp | climax angles | escalation |
| 59–61.5 s | candle glow breathing with music, button sheen | end card | weak window 3 |

YouTube constraints (in place of Reels): readable text inside 90 % title-safe (x 96–1824, y 54–1026), none
in the bottom 110 px (player bar); end card keeps the lower third clear for end-screen elements; no
watermark. Hook variant B (result first: overhead all-fallen table + ONE PUSH DID THIS.) is a swappable
first scene.
