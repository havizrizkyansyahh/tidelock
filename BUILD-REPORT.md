# TIDELOCK — build report

Entry for make.fun **best-game-01** ("Make the best game"). This report separates what was
measured from what remains unverified. Nothing here is a claim about server-side grading or about
the judge's verdict: those have not run.

Commit of this report: the commit that adds it. Repository is local; nothing has been pushed or
submitted.

## 1. What the entry is

A first-person descent arcade game in the browser: one pressure skiff, a dark trench, sonar pulses
that reveal the cave and stun what lives in it, spore clusters that pay score and air, rock columns
and drifters that cost hull, and beacons where the dive can be banked as a win or pushed deeper.

- `game/` — 19 files, 26 entries, 2,218,746 bytes; `index.html` 12,037 bytes; no build step, no
  network, no external font or asset.
- `main.ts` — Node entrypoint, standard library only, copies `game/` and `screenshots/` and writes
  `dossier.json` with the official `vendor/makefun-game.ts` (kit sha256 `dc671875…`, unchanged).
- `screenshots/` — four 1280×720 JPEGs, 38,724–85,377 bytes each.
- Source split by job: `core/` (rules, rng, trench, skiff, run — no three.js), `view/` (render,
  trench, entities, light shafts), `ui/` (hud, screens), `audio/`, `input.js`, `shots.js`, `main.js`.

## 2. Unit tests — run, passed

```
$ node --test tests/
tests 41   pass 41   fail 0
```

Coverage by file: `rules.test.mjs` 8 (air drain, combo, score), `trench.test.mjs` 11 (determinism,
rock gaps, spore counts, beacon placement, clear bands), `run.test.mjs` 20 (air, hull, spores,
combo decay, sonar charges and stun radius, rock immunity, drifter bite rhythm, beacon banking and
surfacing, pause freeze, restart, seeded determinism, autopilot, streaming, yaw-rate contract),
`feel.test.mjs` 2 (milestones fire once).

Each of these began as a failing test. Two bugs the tests caught in phase 2 were real: combo never
decayed, and every rock column was silently dropped by a spawn-clearance check that read the wrong
fields (found by a 60-second autopilot run reporting `rocks: 0`).

## 3. Browser checks — run, observed

Headless Chromium 145, WebGL2 via SwiftShader (CPU rasterizer), page served by the repository's own
`serve.ts`.

| check | result |
| --- | --- |
| console / page errors | 0 |
| resources requested | 17, all same-origin under `game/`, zero external |
| Enter on title | state `playing`, depth 0, HUD shown |
| hold W 1.6 s | depth 0 → 12.09 m, air 100 → 95.36 |
| hold A 0.8 s | yaw 0 → 1.333 rad (1.6 rad/s), D returns it to 0.053 |
| Space | sonar 3 → 2 charges, reveal 3.73 s |
| Escape | paused, overlay shown; Escape again resumes |
| render cost in play | 25 draw calls, 6,210 triangles (was 19 / 2,632 before the landmark pass) |
| render cost with sonar live | 26 draw calls, 5,978 triangles |
| HUD layout at 1280×720 | every readout inside the viewport, no overlap or clipping |
| title screen | `#hud` and `#crosshair` computed `display: none`; no run number behind the panel |

### Rendering before and after the landmark pass

| scene | draw calls | triangles |
| --- | --- | --- |
| dive, before landmarks | 19 | 2,632 |
| dive, after landmarks | 25 | 6,210 |
| sonar pulse live | 26 | 5,978 |

The extra cost is six draws: wall strata, arches, vent clusters, distant silhouettes and two dust
layers. Instance counts are fixed and `update()` reuses its matrix, quaternion and vector, so a
frame allocates nothing.

### Defects found by review and fixed in this phase

1. **HUD type too small for the judge's contact sheet.** Labels were 9–11 px at 720 p; the sheet
   shrinks the cover to at most 768×480, where that type disappears. The scale was raised (labels
   12–14 px, depth 36–60 px, score 24–36 px, prompt 15–20 px) and all four frames were recaptured.
2. **`innerHTML` used to build HUD nodes.** Harmless (static string) but an avoidable sink; the HUD
   now appends `document.createElement('i')` nodes and never parses markup at run time.
3. **A hidden tab kept flying.** `visibilitychange` now pauses the dive, shows the pause card and
   releases pointer lock, so a blurred tab cannot lose a run it was not playing.

### Behaviours checked rather than assumed

Pause freezes the simulation exactly (tested); restart starts a fresh dive and keeps the best score
(tested); window resize re-creates the projection (`render.resize` on `resize`); audio is only
created after a gesture (`sound.ensure()` on the first click or key) and `M` mutes it; pointer lock
is requested on click and its refusal falls back to keyboard steering; memory is bounded by
construction — spores, rocks, drifters and beacons are pruned behind the skiff, instance counts are
fixed at 160/96/24/3, and `run.events` is drained every frame.
### Not verified

- **Frame rate.** `requestAnimationFrame` is throttled in this headless tab and `gl.finish()` does
  not prove a flush under ANGLE/SwiftShader. Only geometry cost is known (19 draw calls, 2,632
  triangles). No 60 fps claim is made.
- **Visual inspection by eye.** No vision tool was callable in this session and delegation was not
  permitted, so the frames were reviewed by measurement: JPEG dimensions, byte sizes, luminance
  statistics (mean 16–36, 2.2 % of pixels above mid-grey, maxima ~250) and DOM bounding boxes.

## 4. Output checks — run, passed

`node tools/audit-build.mjs` runs `main.ts` twice into two clean directories and audits the result;
it wrote `tests/build-audit.json`. **18 checks, 0 failures.**

| check | observed |
| --- | --- |
| two runs, identical path sets | 25 paths each |
| two runs, identical bytes | every file equal by sha256 |
| dossier matches independent helper rebuild | 438,388 bytes, sha256 `37b330cd…` |
| both runs rebuild to the same dossier | equal |
| `game/` entries ≤ 993 | 27 |
| `game/` bytes ≤ 48 MiB | 2,228,450 |
| every `game/` path ≤ 1,000 bytes | longest 32 |
| `index.html` ≤ 1 MiB | 12,037 |
| screenshots 3–4 | 4 |
| each ≤ 256 KiB | 80,484 / 53,262 / 67,191 / 54,056 |
| long side ≤ 1280, short ≥ 480 | all 1280×720 |
| names URL-safe | `1-title.jpg … 4-result.jpg` |
| references inside `game/` | every script tag and every static import in 18 modules resolves inside `game/` |
| no http(s) in `index.html` | none |
| every source module parses as ESM | 18 modules, `node --check` |
| vendored helper unchanged | `dc671875…` = kit manifest |
| no secrets or private paths shipped | 20 files scanned |
| dossier text not cut at 160 KiB | no `Cut at 163840 bytes` line in the dossier text |

Two audit failures were found and fixed in the audit itself before it passed: it flagged licence
URLs inside the vendored three.js build (the gate parses references, not comments) and it flagged
base64 screenshot data as a possible key string (the dossier is now scanned as parsed text).

## 5. Runtime used

The final audit ran on **Node v22.22.0**, the grader's major version
(`/home/agent/.hermes/cache/scratch/node-v22.22.0-linux-arm64/bin/node` on this aarch64 host):

```
$ node --version                     # the Node 22 binary
v22.22.0
$ node --test tests/rules.test.mjs tests/trench.test.mjs tests/run.test.mjs tests/feel.test.mjs
# tests 41   # pass 41   # fail 0
$ node tools/audit-build.mjs
"passed": 18, "failed": 0
```

Node 22's test runner does not accept a bare directory argument — `node --test tests/` makes it try
to load `tests` as a module — so the four files are named explicitly. With Node 26 the directory
form works; both were exercised during the build.

## 6. Unverified, by category

- **Frame rate on real hardware.** Every frame in this report was rendered by ANGLE's SwiftShader
  software rasterizer on four CPU cores; there is no desktop GPU in this environment. The scene
  costs 25 draw calls and 6,210 triangles with no post-processing, no shadows and no per-pixel
  lights, which is what the measurements can say. A 60 fps claim on real hardware is not made and
  was not measured; the headless tab also throttles `requestAnimationFrame`, so even a software
  frame time could not be read honestly here.
- **Server-side grading**: the five-row gate, the run in the grader's sandbox, and the AI judge
  have not run. This report proves the local equivalent of four rows and the parse row; it does not
  prove the server's scorer will agree.
- **Finalist review**: nobody has played the built entry in a desktop browser with a GPU, with a
  mouse captured by pointer lock, at 1440×900. The 1280×720 path is the one exercised.
- **Transcript gate**: out of scope here; the parent session exports the logs and runs the official
  check.

## 7. How to reproduce

```
node --test tests/*.test.mjs             # 41 unit tests (name the files on Node 22)
node serve.ts --port 8123                # play at http://localhost:8123
node tools/audit-build.mjs               # 18 output checks, writes tests/build-audit.json
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```