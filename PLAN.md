# TIDELOCK — build plan

A first-person descent arcade game for make.fun's **best-game-01 "Make the best game"** bounty.
This document is the phase-1 contract and design record: what the grader checks, what this
machine can actually do, what we are building, and how each claim in the submission will be
verified before it is made.

Deadline from the live requirements (`GET /api/competitions/best-game-01/requirements`,
fetched 2026-11-17T01:28Z, HTTP 200, 112,846 bytes): `entries_close` **2026-11-18T18:00:00Z**.

---

## 1. Contract, as verified from the kit

Source of truth: `best-game-01-kit/RULES.txt` (94,121 bytes, sha256 `c72f5ca9…` per `kit.json`),
`starter/main.ts`, `starter/serve.ts`, `starter/vendor/makefun-game.ts`, and the live
requirements JSON saved as `makefun-batch-control/game-requirements-live.json`.

| Rule | Verified value | Where |
| --- | --- | --- |
| Entrypoint | `main.ts` at repo root, Node 22+, standard library only, no install step | RULES "Submitting" |
| Determinism | program runs twice, both runs must write the same bytes | RULES "Submitting" |
| Sandbox | 1 CPU, 1024 MB, 64 pids, 120 s per run, read-only `/bot`, writable `/output`, no network | RULES "Submitting" |
| Output | `game/` + `screenshots/` copied to `/output`; `dossier.json` from `buildDossier` | `starter/main.ts` |
| Dossier caps | `text_max_bytes: 163840`, `screenshots.max: 4`, `screenshots.max_bytes: 262144`, `game_max_files: 993`, `game_max_bytes: 50331648`, `game_path_max_bytes: 1000` | `starter/main.ts` |
| Reference rule | every reference is a `data:` URI or a path to a regular file inside `game/`; no network at all | RULES "The gate" |
| Screenshots | 3–4 PNG/JPEG, each ≤ 256 KiB, long side ≤ 1280, short side ≥ 480, names `[A-Za-z0-9._-]`, first by name is the cover | RULES "The gate" |
| `index.html` | regular file ≤ 1 MiB, at `game/index.html` | RULES "The gate" |
| Vendoring | a library under `vendor/` or a `*.min.js` file is listed as vendored, never shown as source | RULES "The task" |
| Starter exclusion | the kit starter's lines are left out of the counted lines | `thinking_reproduces` |
| Gate rows | `game_files`, `references`, `screenshots`, `dossier_matches` decide validity; `js_parses` is shown only | RULES "The gate" |

The judge reads a **contact sheet of the screenshots** (cover large on top, the rest small
beneath) plus a short **outline of declarations** — file paths, sizes, first functions/classes.
So: the game must look complete in four frames, and the file names must say what each file does.

## 2. Prerequisite audit (real command output, this machine)

```
$ node --version
v26.12.1                     # satisfies "22.18 or later"; harness itself runs node v26.13.1
$ git --version
git version 2.47.3
$ git config user.name && git config user.email
havizrizkyansyahh
110213014+havizrizkyansyahh@users.noreply.github.com
$ command -v google-chrome chromium chrome      # nothing on PATH
$ node --version && curl -sI http://127.0.0.1:8099/   # local static server reachable
```

There is no Chrome binary on `PATH`; verification and screenshots run through the bundled
headless Chromium that the browser tool drives. Its capabilities, read from the page itself:

```
UA        HeadlessChrome/145.0.0.0
WebGL2    true   ("WebGL 2.0 (OpenGL ES 3.0 Chromium)", MAX_TEXTURE_SIZE 8192)
WebGL1    true
renderer  ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)
cores     4, deviceMemory 8, devicePixelRatio 1
AudioContext, ES modules, pointer lock: all present
```

**The rasterizer is SwiftShader: this is CPU rendering.** Frame rates measured here are a floor,
not a forecast of a real GPU. Two probes, same 1280×800 viewport, same scene (260 instanced rock
columns, fog, spores), 120 frames each, from `/home/agent/.hermes/cache/scratch/tidelock-probe/`:

| pipeline | avg ms | p95 ms | fps | draw calls |
| --- | --- | --- | --- | --- |
| `MeshStandardMaterial` + lights + antialias | 92.22 | 116.6 | 10.8 | 24 |
| unlit `MeshBasicMaterial` + vertex colours, no AA | 19.86 | 33.3 | 50.4 | 23 |

That 4.6× gap decides the art direction: **bake the light into vertex colours and fog, do not
shade per pixel.** A real GPU will hold 60 fps comfortably on that pipeline; SwiftShader at
~50 fps is enough to play-test and screenshot here.

**Screenshot pipeline verified end to end** (CDP `Page.captureScreenshot` at 1280×800):

| format | bytes |
| --- | --- |
| JPEG q80 | 14,702 |
| JPEG q86 | 17,180 |
| JPEG q92 | 21,484 |
| PNG | 31,519 |

Dimensions read back from the JPEG SOF and PNG IHDR: 1280×800. Long side 1280 ≤ 1280, short side
800 ≥ 480, size far under 256 KiB. Screenshots are not a risk; there is room for PNG quality.

## 3. The game

You pilot a pressure skiff down **the Tidewell**, a lightless trench. The run is one descent:
push forward, steer through rock, gather spore clusters that pay score and refill your air, keep
your hull off the walls and off the drifters that guard their territory, and reach a **beacon**
where you may surface — banking your score as a win — or dive on for more.

The full design (world generation, creatures, tuning tables, audio, palette, UX copy) is in
`GAME-DESIGN.md`. Summary:

**Core loop.** Thrust down the trench → read the fog with a sonar pulse that briefly reveals the
cave and stuns drifters → collect spores for score and air → survive rock and drifters → decide at
each beacon whether to surface (win, bank score) or dive deeper (more score, less air, denser
hazards).

**Controls.** `W` thrust · `S` brake · `A`/`D` strafe · mouse (pointer lock) look and steer ·
`Shift` boost · left click / `Space` sonar pulse · `E` surface at a beacon · `Esc` pause ·
`R` restart at the result · `M` mute.

**State machine.** `TITLE → PLAY → PAUSED → PLAY`, `PLAY → RESULT(surfaced|lost) → TITLE|PLAY`.
A single `Run` object owns the transitions; nothing else may change state.

**Scoring.** `score = floor(depth_m) + Σ(spores × 25 × combo) + 600 × beacons_banked`, plus
`oxygen × 3` on a successful surfacing. Best score is kept for the session (in memory, mirrored
to `localStorage` when available).

**End states.** Win: surface at a beacon — result screen shows the breakdown, the best score and
`R` to dive again. Loss: hull reaches 0 or air reaches 0 — same screen, labelled as lost, with
the depth reached.

**HUD.** Depth (large), air bar, hull segments, sonar charges, spore count and score, best score,
beacon range prompt, and a threat pulse when a drifter is close. All DOM text over the canvas so
it stays crisp at 1280×720 and 1440×900.

## 4. Architecture — one job per file

`game/` is static: `index.html` plus ES modules, no build step, no network.

| path | job |
| --- | --- |
| `game/index.html` | page shell, canvas, HUD markup, loads `src/main.js` |
| `game/src/main.js` | boot, frame loop, wiring of simulation to view to HUD |
| `game/src/core/rng.js` | seeded PRNG, deterministic for a given seed |
| `game/src/core/rules.js` | pure rules: air drain, hull, sonar charges, score formula |
| `game/src/core/skiff.js` | skiff motion integration and collision response (pure math) |
| `game/src/core/trench.js` | deterministic section generation: rock, spores, drifters, beacons |
| `game/src/core/run.js` | run state machine, events, scoring, end conditions (pure) |
| `game/src/view/renderer.js` | three.js renderer, camera, fog, resize |
| `game/src/view/trenchview.js` | instanced rock walls, seafloor, streaming by depth |
| `game/src/view/entitiesview.js` | pooled spore, drifter and beacon meshes |
| `game/src/view/sonarfx.js` | pulse ring, reveal, hit flash, camera shake |
| `game/src/view/cockpit.js` | first-person skiff frame and instrument glows |
| `game/src/ui/hud.js` | DOM HUD writer |
| `game/src/ui/screens.js` | title, pause, result overlays and their input |
| `game/src/audio/audio.js` | WebAudio synthesis: drone, thrust, ping, pickup, hit, alarm |
| `game/src/input.js` | keyboard, mouse, pointer lock |
| `game/src/shots.js` | `?shot=` deterministic demo states for screenshots |
| `game/vendor/three/` | three.js 0.187.0, copied byte-identical, MIT |

The split is deliberate: `core/` holds no three.js import, so Node's test runner can import the
rules directly, and the judge's outline shows small, named files.

## 5. Verification strategy

1. **Unit tests (RED first).** `node --test tests/` against `game/src/core/*` — air drain, score,
   combo decay, beacon banking, collision response, deterministic trench generation. The first
   test is written in phase 1, before the module it imports exists, so it fails for the right
   reason.
2. **Module contract test.** Every `game/src/**/*.js` parses as an ES module and imports only
   relative paths that exist inside `game/` — the `references` row, checked locally before the
   grader sees it.
3. **Browser verification.** Serve `game/` with our own static server, open it in headless Chrome,
   drive real key events, assert: no console errors, depth advances, HUD text updates, run can be
   paused, lost and restarted, and the frame budget stays under ~60 draw calls. Record measured
   frame times honestly, labelled as SwiftShader.
4. **Screenshot capture** at 1280×800 (and one 1440×900 legibility check), JPEG q92, dimensions
   and sizes asserted against the gate's numbers.
5. **Gate rehearsal.** A local script rebuilds the dossier with the official
   `vendor/makefun-game.ts`, runs `main.ts` twice into two output dirs, diffs them byte for byte,
   re-parses every reachable module, and checks the five rows' thresholds before submission.

## 6. Risks

| risk | mitigation |
| --- | --- |
| SwiftShader measures ~10 fps for a lit pipeline | unlit vertex-colour pipeline (measured 50 fps), no shadows, no post-processing, instancing, capped pixel ratio |
| "60 fps" cannot be proven on this box | state the measurement honestly; keep draw calls and triangles low so a real GPU has headroom |
| pointer lock unavailable in headless | keyboard look fallback; screenshots never need pointer lock |
| fog reveal is expensive | reveal by material swap and an additive ring, never a full-screen pass |
| dossier text cut at 160 KiB | target ≲ 100 KiB of source; verify the cut line is absent |
| judge sees mostly the contact sheet | four frames: title, play with HUD, beacon decision, result with restart |
| authored-lines gate | every line written in this session; only three.js and the official dossier helper are third-party |
| deadline 2026-11-18T18:00Z | phases 2–5 finish implementation, verification and screenshots with margin before release |

## 7. Phase plan

1. **Contract and design** (this phase): this plan, `GAME-DESIGN.md`, `LICENSE`, `.gitignore`, the
   first failing test. No game code, no screenshots, no `main.ts`.
2. Simulation core: `rng`, `rules`, `skiff`, `trench`, `run` + their tests green.
3. Presentation: three.js scene, HUD, audio, screens, input, `main.ts` and dossier.
4. Play, measure, fix: browser playtests, tuning, frame budget, edge cases.
5. Screenshots and gate rehearsal.
6. Review, commit, release.