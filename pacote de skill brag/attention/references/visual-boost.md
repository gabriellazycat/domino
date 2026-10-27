# Visual boost catalog

Cinematic "AI-video" energy built locally with HyperFrames, applied to real
product material. Implementation belongs to HyperFrames: name the technique
and intent in the brief, then let `hyperframes-keyframes`,
`hyperframes-animation` and `hyperframes-registry` decide the mechanics.
Search the registry before hand-building any named effect
(`hyperframes-registry`).

## Camera moves (hyperframes-keyframes)

| Technique | Use for | Note |
|---|---|---|
| **Crash zoom / punch-in** | Hook, payoff, emphasising one button/number | Fast in (0.2–0.35 s), then hold |
| **Slow push-in (dolly)** | Making a static UI screen feel alive during a read | Subtle (100→108 %), whole scene |
| **Whip pan** | Transition between two product screens | Motion blur on the move; match direction to flow |
| **3D tilt / parallax card** | Showing a recreated UI card with depth | Layers at different depths; keep text flat-on when it must be read |
| **Ken Burns on capture** | Real screenshots/frames of the product | Pan toward the element being talked about |
| **Rack focus** | Shifting attention between two UI regions | Blur the inactive region, never the text being read |
| **Reframe / follow** | Following the cursor through a flow | Camera tracks the action point |
| **Speed ramp** | Long process compressed (upload, processing) | Fast middle, slow at the result |
| **Match cut** | Loop ending; scene-to-scene with shared shape | Last frame's shape = first frame's shape |

## Graphic energy (registry / animation)

| Technique | Use for | Restraint |
|---|---|---|
| Kinetic type slam | Hook line, claims | One per scene max |
| Light sweep / shimmer | Revealing a hero element or CTA | Once |
| Glitch / chromatic aberration | Pattern break in chaotic/parody tones | Transitions only, never on readable text |
| Counter / number roll | Real metrics from the project | Only numbers the project actually has |
| Cursor + click ripple | Simulated interaction | Synchronise with SFX click |
| Split screen | Before/after hooks | Both halves real |
| Film grain / vignette | Cinematic tone | Subtle, never over text contrast |

## Choosing a boost for a weak window

1. What is on screen in that window? Prefer moving the **camera on it**
   over adding new graphics.
2. Is the viewer reading? Then use only slow push-in or rack focus; never
   shake or glitch readable text.
3. Is it a process/wait? Speed ramp or cut to the result.
4. Is it a transition? Whip pan or match cut.
5. Still flat? Split the scene with a new real element (next UI state).

## Forbidden

- Generated people, avatars, stock footage, or fake app screens.
- Metrics, testimonials or logos the project does not have.
- Camera moves on every scene: leave 1–2 calm beats so the strong moves
  read as strong.
- Effects that drop `hyperframes check` contrast on text.
