# Giddy Hop! 🐴

*Auf die Pferde, fertig, los! – On your horses, get set, go!*

A webcam motion game for a kids' birthday party with a horse-show theme.
Up to four children stand in front of the laptop webcam and ride a parcours
in first-person view on a split screen – controlled only by their bodies:

| Movement | Effect |
| --- | --- |
| Bounce / rock rhythmically | Gallop – the faster the rhythm, the faster the horse |
| Lean left / right | Steer (needed in curves, otherwise the horse drifts outwards) |
| Jump up (a real jump) | Horse jumps anywhere – inside the jump zone ("HOPP!") the jump is timed over the fence |

Children who do not raise an arm are ignored, so spectators may stand in the picture.

On the course:

| | |
| --- | --- |
| 🥕 Carrot | Turbo: +30 % speed for 2.5 s – even above the normal top speed |
| Jump without jumping (fence, wall, hedge, water) / hitting a cone | The horse stops for a moment and has to run up again |
| Grass strip / rails | Slower until back on the sand |

The ranking is the plain finish time – carrots and faults already count during
the race. Cones and carrots can be switched off on the start screen.

At the finish the camera swings 180° around the horse and looks back along the
track (riders still coming are visible); the horse rears up, paddles with its
front hooves, shakes its head and whinnies – repeated until everyone has
finished and the last horse has celebrated once. Then the award ceremony shows
a podium with the horse names and a table with time, knock-downs and carrots,
with the celebrating horses in the background. After 25 s (`race.resultsSeconds`)
the game goes back to the registration by itself; the players stay registered
and confirm "ready" again for the next race. Hoofbeats follow each horse's
speed and gait and come from the side of its rider's screen. (Sound is synthesized in the
browser; browsers only allow it after a key press or click.)

### Lobby (no keyboard needed)

Every gesture counts after holding it for a moment (progress ring in the camera
image); afterwards the arms must come down before the next gesture counts.
Several children can register or get ready at the same time: short detection
gaps and a wrist missed for a frame do not restart the progress ring.

| Who | Gesture | Effect |
| --- | --- | --- |
| New person | hold one arm up | Register – the player number follows the registration order |
| Registered | hold one arm up again | Ready |
| Ready | hold both arms up | Not ready any more |
| Registered, not ready | hold both arms up | Unregister (the number becomes free; the others keep theirs) |
| – | everyone ready | "Laden …" for 10 s, then countdown 10 … 1, "Los!" – only then the horses move. During the first 5 s of the countdown every quadrant shows the camera picture of its rider (head and shoulders), so each child knows which screen is theirs |
| Any player during "Laden …" | hold both arms up | Cancel; that player is not ready any more |

## Running

```bash
npm install
npm run dev        # development server with hot reload → http://localhost:5173
npm run build      # type check + production build → dist/index.html (single file)
npm run preview    # serve the build → http://localhost:4173
```

With several cameras connected, the start screen shows a camera dropdown; the
choice is remembered (falling back to the default camera when it is not
connected) and the list updates when a camera is plugged in or out.

`dist/index.html` is self-contained and can also be opened by double-click
(Firefox asks for camera permission). The MoveNet model weights are downloaded
from the internet on start, so an internet connection is required.

## Keys

| Key | Where | Action |
| --- | --- | --- |
| Space | Registration | Mark everyone ready (starts "Laden …") |
| Space | Laden … | Skip the wait |
| Space | Countdown / race | Pause and resume |
| Q | Countdown / race | Abort, back to the start screen |
| B | Race | End now: horses still riding are ranked by their position, then the award ceremony |
| Esc | Laden … | Cancel back to the registration |
| Esc | Anywhere else | Back to registration |
| Backspace | Registration | Unregister everyone |
| T | Registration | Add a keyboard rider (testing without camera; becomes ready with Space) |
| F or button in the start menu | Anywhere | Toggle fullscreen (Esc leaves it without affecting the game) |
| Ctrl+Alt+D | Anywhere | Toggle debug panel |

Keyboard riders (also usable alongside body control):
P1 `W` gallop / `A` `D` steer / `S` jump · P2 `I` / `J` `L` / `K` ·
P3 `↑` / `←` `→` / `↓` · P4 `Num8` / `Num4` `Num6` / `Num5`.

## Courses

Courses are YAML files in [courses/](courses/) – one file per course, picked
up automatically and offered in the course dropdown on the start screen (the
last selection is remembered). The format is documented in
[courses/README.md](courses/README.md); `npm test` validates every course
(format, no self-crossing, at least one jump).

## Own sound recordings (local only)

All sounds are synthesized in the browser. Real recordings can replace them:
put files (`.mp3` / `.wav` / `.ogg` / `.m4a`) into the folder `local-assets/`;
the start of the file name decides what they are used for:

| File name | Used as |
| --- | --- |
| `whinny*` | whinny at the finish celebration |
| `snort*` | snort after the whinny |
| `hoof*` | **one single hoofbeat** – the gait rhythm is made by the game |

With several files of one kind, a random one is played each time; kinds without
files keep the synthesized sound. Other files in the folder (e.g. long reference
recordings) are ignored. The folder is git-ignored: recordings from the internet
usually allow private use but not redistribution, so they never end up in the
repository. They are bundled into `dist/index.html` when building, so the game
still works by double-click.

## Languages

The UI is available in German and English ([src/i18n/](src/i18n/), one JSON
file per language; a test makes sure both contain the same keys). The language
is chosen in this order:

1. URL parameter, e.g. `index.html?lang=en`
2. The language picked in the dropdown on the start screen (remembered)
3. The browser language (`navigator.languages`, first German or English entry)
4. English

Course names and descriptions are translated in the course files themselves.
To add a language: add `src/i18n/<code>.json`, register it in
[src/i18n/index.ts](src/i18n/index.ts) and `LANGUAGES` in
[src/game/courseFormat.ts](src/game/courseFormat.ts), and add the texts to the courses.

## Tuning on site

Open the debug panel (Ctrl+Alt+D). It shows per player: tracked, lean angle,
steer, bounce cadence (Hz), drive, current and peak jump rise – plus the camera
image with skeletons. All thresholds can be adjusted with sliders; changes are
saved in the browser and survive reloads. "Copy config (JSON)" copies the current
values so good ones can be transferred into [src/config.ts](src/config.ts).

How the gestures are measured (all independent of body size and camera distance):
- **Steering**: sideways tilt angle of the upper body, through a soft curve
  `steer = (tilt / fullLeanDegrees) ^ curveExponent`.
- **Speed**: bounce cadence – turning points of the up/down movement are detected
  (ignoring jitter below `gallop.minAmplitude`); the frequency sets the speed.
- **Jump**: hips *and* shoulders rise at least `jump.minRise` torso lengths above the
  lowest position of the last `jump.windowSeconds`, for `jump.confirmFrames` frames.

Typical adjustments:
- Jumps not detected → lower `jump.minRise` (compare with the `max` column after a real jump).
- Jumps detected while galloping → raise `jump.minRise` or `jump.confirmFrames`.
- Full speed too hard to reach → lower `gallop.cadenceFull` (compare with the `Hz` column).
- Horse moves while standing still → raise `gallop.minAmplitude`.
- Steering too twitchy → raise `steer.fullLeanDegrees` or `steer.curveExponent` (compare with the `lean°` column).
- Curves too hard → lower `horse.driftFactor`.

## Architecture

```
src/
  main.ts               entry point, loads saved tuning values
  app.ts                wires modules together, main loop, keyboard commands
  config.ts             all tuning knobs
  core/                 math helpers, config persistence
  pose/                 camera, MoveNet service (own loop), pose types, PlayerTracker (registration + identity), arm gestures
  input/                GestureAnalyzer (lean/bounce/jump → input), keyboard fallback, input merging
  game/                 course file format + loader, track geometry, horse state, race rules/scoring, lobby rules, game phases
  render/               single-canvas split renderer, world/scenery, horse model, obstacles, cameras, layout
  ui/                   HUD per viewport, overlay screens, camera preview
  i18n/                 translations (de.json, en.json) and language detection
  debug/                debug panel
courses/                course files (YAML)
tests/                  unit tests (Vitest) – pure logic, no browser needed
e2e/                    smoke tests (Playwright) – real build in Microsoft Edge with fake webcam
```

Data flow per frame: `PoseService` (independent detection loop) → `PlayerTracker`
(who is who) → `GestureAnalyzer` per player → `PlayerInput` (merged with keyboard)
→ `GameFlow` / `Race` (pure simulation) → `RaceView` + `SplitRenderer` + `Hud`.

Design decisions:
- **One WebGL canvas, several viewports** (scissor test) instead of four canvases.
- **three.js layers** give every player their own fences and carrots in a shared scene.
- **Own horse as a drawing**: in the rider view the own horse is an SVG overlay (neck,
  mane, ears, bridle) instead of the box model – prettier and costs no 3D rendering.
  Other riders and the overview still see the 3D horse; it returns for the finish celebration.
- **Pose detection decoupled from rendering** – the game renders at full frame rate
  even if MoveNet only delivers ~20 results per second.
- **Semi-guided steering**: horses follow the track; curves push outwards and leaning compensates.
- **Simulation is DOM-free** (game/, input/, pose/playerTracker) and therefore unit-testable.

## Tests

```bash
npm test           # unit tests (Vitest)
npm run e2e        # builds, serves and runs smoke tests in Microsoft Edge
npm run typecheck
```

The unit tests check the requirements with synthetic poses: leaning steers,
bouncing/rocking accelerates independent of child size and position, jumps are
detected via upward velocity but not confused with bouncing, registration needs a
raised arm, bystanders are ignored, player identities stay stable when someone is
briefly not detected, curves push horses outwards and leaning keeps them on track,
the jump zone clears fences, scoring/ranking, game phases and split-screen layout.

## Packages

| Package | Purpose |
| --- | --- |
| `three` | 3D rendering (scene, cameras, split-screen viewports) |
| `@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow/tfjs-converter` | TensorFlow.js runtime on the GPU, required by the pose model |
| `@tensorflow-models/pose-detection` | MoveNet MultiPose – detects up to 6 people with 17 keypoints each |
| `lil-gui` | Sliders in the debug panel |
| `yaml` | Reads the course files (YAML allows comments, easy to edit by hand) |
| `i18next` | Translations (German / English), including plural forms |
| `vite` (dev) | Dev server and build tool |
| `vite-plugin-singlefile` (dev) | Inlines everything into one `dist/index.html` (works via double-click) |
| `typescript`, `@types/three`, `@types/node` (dev) | Type checking |
| `vitest` (dev) | Unit tests |
| `@playwright/test` (dev) | End-to-end smoke tests in a real browser |

`pose-detection` also imports `@mediapipe/pose` and the WebGPU backend; both are
replaced by tiny stubs in [src/vendor/](src/vendor/) via aliases in
[vite.config.ts](vite.config.ts) because only MoveNet on WebGL is used.
