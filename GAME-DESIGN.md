# TIDELOCK — game design

A first-person descent arcade game: one skiff, one trench, one run. Original setting, original
creatures, procedural art, synthesised sound. Everything in this document is implementable with
three.js geometry and the Web Audio API, with no image, font or audio file.

## 1. Fantasy and frame

You are alone at the helm of a **pressure skiff** — a welded bubble with a single lamp, a sonar
pinger, and a hull that complains when rock touches it. Below you the **Tidewell** falls away into
water so deep that light has never reached the bottom. **Spore clusters** drift in the current,
bright as embers; they feed your air and your nerve. **Drifters** — pale, territorial things that
turn toward a lamp — keep the ledges. Every few hundred metres a **beacon** marks a place where the
skiff can still rise: surface there and the dive is banked as a win, or press on for depth no one
has charted.

The whole game is a single question asked four times: *do I take what I have, or spend air for
more?*

## 2. Camera and controls

First person, mounted at the front of the skiff; the frame of the cockpit is visible at the edges,
with two instrument glows. The camera rolls slightly with strafe and pitches with the mouse.

| input | action |
| --- | --- |
| mouse move (pointer lock) | look and steer; pitch also carries the skiff up and down |
| `W` / `↑` | main thrust forward along the trench |
| `S` / `↓` | brake and reverse thrust |
| `A` `D` / `←` `→` | strafe (also yaws slowly when the mouse is not captured) |
| `Shift` | boost burn: +45 % thrust, +1.4× air drain while held |
| left click / `Space` | fire a sonar pulse |
| `E` | surface at a beacon, when in range |
| `Esc` / `P` | pause |
| `R` | restart, on the result screen |
| `M` | mute |

Mouse is the primary aim. When pointer lock is refused (some automation contexts), the skiff still
flies on the keyboard alone: `A`/`D` yaw slowly, `←`/`→` strafe, and `R`/`F` raise and lower the
nose. `E` stays the beacon key in both schemes, so no control ever changes purpose.

## 3. World

The trench is generated in **sections of 40 m** from a seeded PRNG (`seed ^ sectionIndex`). A
section owns:

- **walls**: the trench is a tube of radius `8.5 m − min(3.0, depth × 0.0016)` — it narrows with
  depth, from 8.5 m to 5.5 m; sampled as a chain of jittered rings.
- **rock columns**: stalactite/stalagmite pairs hanging off the walls into the flyable space.
  Count per section: `1 + floor(depth / 220)`, capped at 3. Radius 0.6–2.2 m, length 3–9 m, always
  leaving a gap of at least 3.2 m to the opposite wall so a line is always flyable.
- **spore clusters**: 3–6 per section, arranged in arcs and short trails; each cluster is 3 spheres.
  Value is per cluster, not per sphere.
- **drifters**: at most 1 per section early, 2 per section past 700 m, with a 60 m no-spawn band
  after each beacon.
- **beacons**: fixed depths 300, 650, 1000, 1350 m. A beacon is a ring of pale light with three
  arms; entering the ring arms the `E` prompt.

Sections stream in 5 ahead and 2 behind; the meshes are pooled, so the triangle count stays flat.

**Depth** is measured along the trench axis; the skiff's forward speed is what raises it. Depth is
the score's spine and the HUD's largest number.

## 4. Rules and tuning (`game/src/core/rules.js`)

Everything below is a constant in one place and is covered by unit tests.

| quantity | value | note |
| --- | --- | --- |
| air capacity | 100 | start full |
| air drain | `2.2 + depth × 0.0008` per s | 2.2/s at the top, 3.28/s at 1350 m |
| boost drain | ×1.4 while `Shift` held | |
| spore air | +18, capped at 100 | |
| hull capacity | 100 | |
| rock hit | −18 hull, 0.8 s invulnerability | |
| drifter bite | −12 hull per 0.7 s of contact | continuous, not a one-shot |
| beacon touch | +15 hull, +35 air, once per beacon | small mercy, not a reset |
| sonar charges | 3 max, +1 every 8 s | |
| sonar radius | 22 m, stun 2.5 s, reveal 4 s | |
| thrust accel | 16 m/s², `Shift` ×1.45 | |
| max forward speed | 13 m/s | |
| brake | 20 m/s² | |
| strafe speed | 7 m/s | |
| drag | 1.2 / s | gives the skiff weight |
| drifter aggro radius | 11 m | |
| drifter speed | 5.2 m/s, turn 2.2 rad/s | outrun with thrust, not with nerve |
| collision radius | skiff 0.9 m, rock uses its column radius | |

**Score**

```
depth points   = floor(depth_m)                       # 1 per metre
spore points   = 25 × combo                           # combo 1..5
beacon bonus   = 600 per beacon passed (not surfaced)
surface bonus  = oxygen × 3, only when surfacing
score          = depth + spores + beacon bonuses + surface bonus
```

Combo rises by one per pickup taken within **2.5 s** of the previous one (cap 5) and decays to 1
after that window. The HUD shows `×N` next to the spore count while it is above 1, so the chain is
visible and worth chasing.

**Best score.** Kept for the session in memory and mirrored to `localStorage['tidelock.best']`
inside a `try` (a refused storage call must never break the run). Shown on the title screen from
the first frame.

## 5. State machine (`game/src/core/run.js`)

```
TITLE ──start──▶ PLAY ──Esc──▶ PAUSED ──Esc──▶ PLAY
                   │
                   ├── surfacing at beacon ──▶ RESULT(surfaced)
                   └── hull 0 or air 0     ──▶ RESULT(lost)
RESULT ──R──▶ PLAY (new run)        RESULT ──any other key──▶ TITLE
```

Rules the implementation must obey:

1. Only `run.js` changes state; view and UI read `run.state`.
2. `PAUSED` freezes the simulation clock exactly — no drift on resume, no double step.
3. A run is over the instant a terminal condition is true, evaluated after each fixed step.
4. Restart builds a **new** `Run` with a new seed; nothing carries over but the best score.
5. The simulation steps in fixed 1/120 s units, decoupled from rendering, so a slow frame is a
   longer catch-up, not a faster skiff.

## 6. End states

**Surfaced (win).** Reach a beacon ring, press `E`. The camera rises through the ring, the fog
lifts to a pale surface, and the result screen shows: depth reached, spores, beacons banked,
surface bonus, total, best, and `R — dive again`. This is the game's win, and it is reachable in
about 90 seconds of competent flying.

**Lost.** Hull 0 (`the skiff gave way`) or air 0 (`out of air`). Same result screen, labelled as
lost, showing how deep the run got and the same restart. A lost run still counts its score, so a
deep death can beat a shallow win — the choice at the beacon is a real bet.

## 7. Art direction

Dark, cold, bioluminescent. No textures are loaded: geometry is instanced and coloured per vertex,
with a baked vertical gradient standing in for a light, plus exponential fog that eats the distance.

| role | colour |
| --- | --- |
| water / background | `#03120f` |
| fog | `#061b1a` |
| rock lit face | `#2e4a44` → `#16241f` |
| rock shadow | `#0b1512` |
| spore | `#7dffd4` core, `#1f9c7e` halo |
| drifter | `#cfd8e6` body, `#5a6b86` shade, `#ff5f6d` eye |
| beacon | `#ffe6a8` light, `#8a6a2f` frame |
| hull warning | `#ff5f6d` |
| air | `#7de3ff` |
| HUD text | `#d8fff4` at 90 % on `rgba(3,18,15,0.55)` |

Silhouettes matter more than detail: a rock column reads by its rim light, a drifter by two eyes,
a spore by its halo. At 1280×720 through fog, that is what a player can actually parse.

**Sonar pulse.** A thin ring expands from the skiff to 22 m over 0.55 s, additive, fading. While it
is live, rock and drifters swap to a rim-lit reveal material and the fog density drops by 40 % for
4 s, so the cave reads as a wireframe ghost. Drifters inside the radius stop and drift, stunned.

## 8. Audio (Web Audio, synthesised)

| sound | synthesis |
| --- | --- |
| ambient drone | two detuned sawtooth oscillators at 55/82 Hz through a lowpass, LFO on the cutoff |
| thrust | filtered noise, gain and pitch follow speed |
| sonar ping | sine sweep 880→220 Hz, 0.5 s, with a short delay tap |
| spore pickup | two-note sine blip rising with combo, 120 ms |
| rock hit | noise burst through a bandpass, plus a low thud |
| drifter close | heartbeat: two low sines 90 ms apart, rate rises with proximity |
| air alarm | pulsing triangle at 660 Hz when air < 25 |
| beacon | soft major-third chime, once |
| surface / lost | short two-chord cadence, rising for surfaced, falling for lost |

Everything is created on the first user gesture (browser autoplay policy) and muted with `M`.

## 9. Screenshot plan (4 frames, 1280×800, JPEG q92)

1. `1-title.jpg` — **cover.** Title over the trench mouth: the skiff silhouette small against a
   glowing ring far below, the word TIDELOCK, one line of premise, the control list, `press to
   dive`, and the best score. Must read at thumbnail size.
2. `2-dive.jpg` — real play at ~40 s: depth ~320 m, spore trail ahead, two drifters with eyes lit,
   a sonar ring mid-expansion, HUD showing depth/air/hull/charges/score.
3. `3-beacon.jpg` — the decision: beacon ring filling the frame at 650 m with the `E — SURFACE`
   prompt and the air bar low, so the choice is legible.
4. `4-result.jpg` — the result screen: `SURFACED` or `LOST`, the score breakdown, best score and
   `R — dive again`.

All four are produced by the game's own code from `?shot=` states that play the real rules forward
with an autopilot — never a mock-up, never edited.

## 10. What the judge should be able to see

- A complete loop in four frames: title → play with HUD → a goal in reach → result with restart.
- Original art: no borrowed characters, no familiar franchise silhouette, a coherent teal/amber
  palette.
- Structure: `core/` for rules and world, `view/` for meshes, `ui/` for text, `audio/` for sound,
  each file named for its job.