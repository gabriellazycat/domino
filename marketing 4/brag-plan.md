# Brag Plan: DOMINOTION — trailer YouTube v4

## What is this app?
DOMINOTION is a domino roguelike: you draw a chain of dominoes with the mouse, push one piece, and the wave
has to topple a toy-soldier army — between stages, the sinister **owner of the table** sells, stamps and
curses your box of pieces.

## The angle
**"The table has an owner."** Every earlier cut sold the mechanic (plan / push / topple). This one sells the
*world*: the dominoes have faces and know what's coming, the enemies are toy soldiers, and someone — a mask
above the table, with a giant hand — owns the game and talks to you. The Owner's real lines from the game
(`web/src/i18n.en.ts`) are the trailer's narrator, typed in the game's own ink speech balloon. The mechanic
is still shown clearly in the middle, but the hook and the glue are the Owner.

## Hook (first 2-3 seconds)
Frame 1 is already moving: extreme close-up, slow motion, of domino faces going from calm to terrified as the
wave rushes them into the General's guard. Line on screen: **THEY KNOW WHAT'S COMING.** At 2.4 s the red
Blast hits → white flash, the game's own **KABOOM!** slams in, camera shake. Then a giant hand sweeps the
whole table clean and the Owner speaks: *"You made it this far. Too bad."*

## Key moments (the middle)
- The real player flow: the cursor traces a ghost trail and pieces drop from the hand → **PLAN THE CHAIN.**
  → the cursor hits the red FIRE! button → **PUSH ONE PIECE.** → the game camera chases the wave across the
  whole table → **TOPPLE EVERYTHING.**
- "Every piece has a trick": freeze-frame roster cards shaped like domino tiles in each piece's real colour —
  **TRI-FORK** (pink, the chain splits in three), **HOPPER** (green, leaps over the wall), **ROCKET**
  (yellow, runs over the line), **BLAST** (red, unfreezes into the explosion on the General).
- "They fight back": **OGRE** (3 hits, topples like a giant domino) and a boss card for **THE GENERAL**
  (a boss every 5 stages, 4 hits).
- The Owner's events, each with its real line: **SHOP** "Come to shop? Everything here has a price." —
  **SEAL PRESS** "The press marks forever. Choose well." — **MYSTIC ALTAR** "The altar listens. Pay, and it
  answers." — **OWNER'S GIFT** "Brought you a little gift. You can't refuse."

## Outro / punchline
A fast climax of explosions, then the wide shot of the whole table on the floor:
**TOPPLE THEM BEFORE THEY TOPPLE YOU.** (the README's own pitch: *derrube a patrulha antes que ela derrube
você*). End card: a row of ten ivory domino tiles topples in a wave, and each fallen tile shows one letter —
**D O M I N O T I O N** — then *A DOMINO ROGUELIKE* and the button **WISHLIST NOW ON STEAM**.

## User flow worth showing
1. Draw: click the green marker, drag the ghost trail, pieces leave the hand fan (`raw3/draw`).
2. Fire: the cursor clicks the red FIRE! button (`raw3/draw`).
3. Result: the wave runs the full hero chain and the camera opens on a table where everything fell
   (`raw3/hero-game`, `hero-wide`).

## Tone
- Preset: cinematic
- Creative direction: dark toy-box fairy tale — a carnival barker who owns the table; dramatic trailer
  energy with a wink (scared domino faces, "Too bad.")
- Interpretation: big serif type and hard cuts on the beat, slow-motion on the two big impacts, letterbox
  only in the cold open and the end card; the Owner's lines are quiet, typed, menacing — the contrast with
  the explosions is the humour.

## Format: landscape — 1920x1080, 60 fps
## Duration: 62 s
YouTube/Steam game trailer, so longer than /brag's 15–25 s default (Steam recommends 30–90 s; the previous
cut was 46 s). The extra length buys the Owner layer and the piece roster; every scene still changes
something within 2–3 s.

## Visual identity (from the project — `web/src/style.css`)
- Background: `#070508` (`--bg`), panels `#1a1310`, rule/border `#4a3626` / balloon border `#6a5030`
- Accent: gold `#d6b25a` / `#f0d48a`; danger red `#a3201c` / `#d6402e`
- Text: cream `#e8dcc0`, balloon text `#f0e4c8`, muted `#9a8a70`
- Display font: IM Fell English SC (logo, captions, balloons)
- Body / label fonts: Silkscreen (small pixel labels, numbers), Nunito (descriptions)
- Strongest visual elements: the domino faces; the Owner's ink speech balloon; piece colours from
  `web/src/core/pieces.ts` (tri-fork `#d6457a`, hopper `#4fae5c`, rocket `#f2c14e`, blast `#e5493a`,
  tower `#7d5bd6`, heavy `#2b2d35`)

## Share copy (draft)
Someone owns this table. Draw the chain, push one piece, topple the army — DOMINOTION, a domino roguelike.

## Audio direction
- Role: cinematic support — the game's own generative music, recorded for this cut with an intensity arc
  (`raw4/music-yt4`, 120 BPM marimba + kick + tension drone), plus the real game SFX baked into every shot.
- Music: game music, not the bundled corporate "Happy Beats" tracks (wrong mood for this game).
- Music treatment: kick + full drone in the hook, drops to near-silence under the Owner's first line, builds
  through the tutorial, full on the wave and the enemies, quiet and eerie under the Owner's events, full on
  the climax, falls away for the end card where the domino clacks and one bell carry the logo.
- Music cue guidance: no bundled preset (custom track). Detect the beat grid at composition time with
  `analyze_music_cues.py`; align the track so beats land on the 0.5 s grid the edit is cut on. Strong-cue
  locks: KABOOM (2.4 s), title ident (6.0 s), TOPPLE EVERYTHING (14.0 s), climax (≈47 s).
- Audio-reactive treatment: subtle — music RMS/bass makes the warm vignette glow and the caption gold rule
  breathe. No visualizers.
- SFX posture: moderate, motion-matched. Footage keeps its own domino clacks and explosions (slow-motion
  pitched down). Added: wood knocks for the end-card topple, tile/card "place" on each roster card, a soft
  key tick on the Owner's typed lines, one heavy bell on the title ident and on the logo, soft impacts on
  caption slams.
- Restraint rule: no SFX on every word; nothing on top of the footage's own explosions except one low thud.

## Storyboard

### Scene 1 — Hook: the faces — 2.0 s (0.0–2.0)
hero-front 9.2→10.2 s at 0.5×. Letterbox 2.39:1. Caption (left, low): THEY KNOW WHAT'S COMING. (word cascade, hold ≥1.2 s)
Sequential: words arrive one by one. Audio: heartbeat-like kick + drone. Transition: hard cut on the hit.

### Scene 2 — KABOOM — 1.3 s (2.0–3.3)
hero-front 10.2→10.85 at 0.5×. White flash at 2.4 s, **KABOOM!** slams in, camera shake. Audio: footage
explosion (pitched down) + low thud. Transition: hard cut.

### Scene 3 — The Owner's hand — 2.7 s (3.3–6.0)
sweep 0→2.7: the giant hand sweeps the fallen chain. Owner balloon near the mask (top centre) types:
"You made it this far. Too bad." with a tiny label THE TABLE'S OWNER. Audio: music nearly gone, key ticks.

### Scene 4 — Title ident — 2.0 s (6.0–8.0)
Empty table, darkened and blurred. **DOMINOTION** drops in letter by letter (domino-like), *A DOMINO
ROGUELIKE* below. Bell. Letterbox bars open at the end → full frame.

### Scene 5 — 01 Plan the chain — 3.0 s (8.0–11.0)
draw 0.6→3.6: the cursor traces the trail; hand fan visible. Caption 01 · PLAN THE CHAIN.

### Scene 6 — Build montage — 1.5 s (11.0–12.5)
hero-wide build, sped up: the hero chain appears piece by piece. Caption stays/exits. Audio: place clacks.

### Scene 7 — 02 Push one piece — 1.5 s (12.5–14.0)
draw 3.9→5.4: cursor to the red FIRE! button, click (punch-in on the button), first domino falls.
Caption 02 · PUSH ONE PIECE.

### Scene 8 — 03 Topple everything — 4.5 s (14.0–18.5)
hero-game 4.0→8.5: game camera chases the wave. Caption 03 · TOPPLE EVERYTHING. (beat-locked 14.0)

### Scene 9 — Every piece has a trick — 1.6 s (18.5–20.1)
hero-cine: the purple Tower falls toward the junction. Kicker title EVERY PIECE HAS A TRICK.

### Scenes 10–13 — Roster freezes — ≈10.1 s (20.1–30.2)
Play → freeze 1.6 s (spotlight, slight push-in, desaturated surround) → domino-tile card slides in:
TRI-FORK "The chain splits in three!" · HOPPER "Leaps over walls." · ROCKET "Runs over anyone in line." ·
BLAST "Knocks down everything around!" → unfreeze into the explosion at 0.5×.
Sequential: 4 cards, one per freeze, alternating sides. Audio: tile place per card, freeze whoosh-thud.

### Scene 14 — Ogre — 3.0 s (29.7–32.7)
enemies 2.6→5.6. Red enemy card: OGRE "Takes 3 hits. Topples like a giant domino." Kicker THEY FIGHT BACK.

### Scene 15 — The General — 3.0 s (32.7–35.7)
hero-front 4.0→7.0: the crowned General and his brutes wait. Boss card: THE GENERAL "A boss every 5 stages."

### Scenes 16–19 — The Owner's events — 4 × 3.0 s (35.7–47.7)
ev-shop, ev-press (new take), ev-mystic, ev-curse (new take). Each: slow drift, event label bottom-left,
Owner balloon top with the real line. Audio: eerie quiet music, soft key ticks.

### Scenes 20–23 — Climax — ≈6.3 s (48.2–54.5)
Multi-angle replay of the whole chain, cut on the beat (attention rewrite: escalation): enemies chaos →
hero-wide overhead cascade of the full table → game-camera slow-mo on the last enemy → the wide all-fallen
table with TOPPLE THEM BEFORE THEY TOPPLE YOU.

### Scene 24 — End card — 7.0 s (54.5–61.5)
Ten standing ivory tiles wear the in-game domino faces (calm → scared as the wave reaches them, the rhyme
with the hook); they topple left→right and each fallen tile shows one letter of DOMINOTION. Then A DOMINO
ROGUELIKE and WISHLIST NOW ON STEAM; bell on the last tile; music out. Lower third kept clear for YouTube
end-screen elements.

**Music mood for this video:** cinematic, toy-box menace
**Audio summary:** game music swells and drops around two slow-motion impacts, goes eerie whenever the Owner speaks, and ends on a domino rattle and a bell.
