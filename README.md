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

## Play it – no installation needed

**Open the game:** <https://lub90.github.io/giddy-hop/>

You need a laptop or computer with a webcam and a current browser (Chrome,
Edge, Firefox or Safari). The children stand side by side about 2–3 m in front
of the camera.

1. **Allow the camera.** The browser asks once whether the game may use the
   camera – click *Allow*. If you clicked *Block* by mistake: click the lock
   or camera symbol left of the web address, allow the camera, reload the page.
2. **Install it as an app (optional).** In Chrome or Edge click the install
   symbol at the right end of the address bar (or menu → *Install Giddy
   Hop!*). The game then has its own icon on the desktop / in the start menu
   and opens in its own window. On an iPad: share button → *Add to Home
   Screen*.
3. **Play offline.** After the game has been opened once with internet, it is
   stored on the device (a short note says so) and then also works without
   internet – handy for a party in the garden. When a new version is
   available, a small note *"Neue Version verfügbar – Neu laden"* appears;
   one click and it is up to date.
4. **Own sounds (optional).** On the start screen click *🔊 Eigene Sounds*.
   For whinny, snort and hoofbeat you can choose your own recordings (mp3,
   ogg or wav), listen to them and go back to the built-in sound at any time.
   A whole set can also be loaded at once as a `.zip` file whose file names
   start with `whinny`, `snort` or `hoof`.

**Safety:** the children jump, bounce and lean – so make room before playing:

- Leave at least 1 m of free space around and between the players; move
  tables, chairs and anything breakable or sharp out of the way.
- Play on a non-slippery floor (no socks on smooth floors).
- Put the laptop or screen out of the players' reach, cables away from their feet.
- An adult supervises, especially with several or very young children.

The game is provided as is, without any warranty (see [License](#license)).

**Privacy:** the camera picture is analysed only on your device and never
leaves it – nothing is sent, recorded or stored, and the game collects no
data at all (no accounts, no tracking, no cookies). Settings and own sounds
are kept only in this browser on this device. The game does not even contact
any server after loading: everything it needs comes with it.

How to play is explained below – the short version: raise one arm to join,
raise it again when ready, then bounce to gallop, lean to steer and jump to
hop over the fences.

## How it works

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
with the celebrating horses in the background. After 12 s (`race.resultsSeconds`)
the game goes back to the registration by itself; the players stay registered
and confirm "ready" again for the next race. Hoofbeats follow each horse's
speed and gait and come from the side of its rider's screen. (Sound is synthesized in the
browser; browsers only allow it after a key press or click.)

### Lobby (no keyboard needed)

Every gesture counts after holding it for a moment (progress ring in the camera
image); afterwards the arms must come down before the next gesture counts.
Back on the start screen (after a race or an abort) everyone has to lower the arms
once, and nobody can get ready in the first 2 s (`tracking.readyLockSeconds`) – so
arms still up from the race never start the next loading by accident.
Several children can register or get ready at the same time: short detection
gaps and a wrist missed for a frame do not restart the progress ring.

| Who | Gesture | Effect |
| --- | --- | --- |
| New person | hold one arm up | Register – the player number follows the registration order |
| Registered | hold one arm up again | Ready |
| Ready | hold both arms up | Not ready any more |
| Registered, not ready | hold both arms up | Unregister (the number becomes free; the others keep theirs) |
| – | everyone ready | "Laden …" for 10 s, then countdown 10 … 1, "Los!" – only then the horses move. During the first 5 s of the countdown every quadrant shows the camera picture of its rider (head and shoulders), so each child knows which screen is theirs |
| Any player during "Laden …" | hold both arms up | Cancel; nobody is ready any more, everyone confirms again |

## Running

```bash
npm install
npm run dev        # development server with hot reload → http://localhost:5173
npm run build      # type check + production build → dist/ (for any web server)
npm run preview    # serve the build → http://localhost:4173
npm run build:single  # everything in one file → dist-single/index.html (double-click)
```

With several cameras connected, the start screen shows a camera dropdown; the
choice is remembered (falling back to the default camera when it is not
connected) and the list updates when a camera is plugged in or out.

`dist-single/index.html` is self-contained and can also be opened by
double-click (Firefox asks for camera permission).

The game never contacts an external server: all files – including the MoveNet
pose model ([src/assets/models/](src/assets/models/), Apache 2.0) – are part of
the build. An e2e test fails if the page requests anything from elsewhere.

### Hosting under a sub-path (GitHub Pages)

The build uses `/` as base path. For a sub-path, pass it on the command line:
`npm run build -- --base /giddy-hop/`. The workflow
[.github/workflows/pages.yml](.github/workflows/pages.yml) does exactly this on
every push to `main` and publishes `dist/` on GitHub Pages (one-time setup in the
repository: *Settings → Pages → Source: GitHub Actions*). Nothing else in the
project depends on GitHub Pages.

Note: own sound files in `local-assets/` are bundled into local builds. The
Pages build runs on GitHub, where that folder does not exist – so they are never
published there.

## Keys

| Key | Where | Action |
| --- | --- | --- |
| Space | Registration | Mark everyone ready (starts "Laden …") |
| Space | Laden … | Skip the wait |
| Space | Countdown / race | Pause and resume |
| Q | Countdown / race | Abort, back to the start screen; nobody is ready any more |
| B | Race | End now: horses still riding are ranked by their position, then the award ceremony |
| B or Q | Laden … | Cancel back to the registration; nobody is ready any more |
| B or Q | Award ceremony | Back to the start screen right away |
| Backspace | Registration | Unregister everyone |
| T | Registration | Add a keyboard rider (testing without camera; becomes ready with Space) |
| F or button in the start menu | Anywhere | Toggle fullscreen |
| Esc | Anywhere | Only leaves fullscreen – it is no game key, so it never cancels or aborts anything |
| Ctrl+Alt+D | Anywhere | Toggle debug panel |

Keyboard riders (also usable alongside body control):
P1 `W` gallop / `A` `D` steer / `S` jump · P2 `I` / `J` `L` / `K` ·
P3 `↑` / `←` `→` / `↓` · P4 `Num8` / `Num4` `Num6` / `Num5`.

## Courses

Courses are YAML files in [courses/](courses/) – one file per course, picked
up automatically and offered in the course dropdown on the start screen (the
last selection is remembered). The format is documented in
[courses/README.md](courses/README.md); `npm test` validates every course
(format, no self-crossing). Besides the jump courses there are two practice
courses without any obstacles: *Galopp-Gerade* (150 m straight ahead) and
*Kurven-Schlange* (left and right curves, for steering).

## Own sounds

All sounds are synthesized in the browser. Real recordings can replace them,
per sound slot; the start of the file name decides the slot:

| File name | Used as |
| --- | --- |
| `whinny*` | whinny at the finish celebration |
| `snort*` | snort after the whinny |
| `hoof*` | **one single hoofbeat** – the gait rhythm is made by the game |

With several files for one slot, a random one is played each time. Each sound
comes from the first of these that has files:

1. **Uploaded in the game** – start screen → *🔊 Eigene Sounds*: per slot choose
   files, listen, go back to the default; or load a whole **sound package**
   (a `.zip` with files named as above, folders inside are fine). Formats mp3,
   ogg, wav, at most 5 MB per file and 20 files per slot; invalid files are
   refused with a reason. The files are stored in the browser (IndexedDB,
   database `giddyhop.sounds`) and **never leave the device**.
2. **The folder `local-assets/`** (`.mp3` / `.wav` / `.ogg` / `.m4a`), bundled
   into local builds. Other files in the folder (e.g. long reference recordings)
   are ignored. The folder is git-ignored: recordings from the internet usually
   allow private use but not redistribution, so they never end up in the
   repository – and therefore not on GitHub Pages either.
3. **The synthesized sound.**

The repository ships no sound files: the built-in sounds are generated by the
game's own code.

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
npm run e2e:subpath  # the same tests with a build served under /giddy-hop/ (like GitHub Pages)
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
| `vite-plugin-singlefile` (dev) | `npm run build:single`: inlines everything into one `dist-single/index.html` (works via double-click) |
| `typescript`, `@types/three`, `@types/node` (dev) | Type checking |
| `vitest` (dev) | Unit tests |
| `@playwright/test` (dev) | End-to-end smoke tests in a real browser |

`pose-detection` also imports `@mediapipe/pose` and the WebGPU backend; both are
replaced by tiny stubs in [src/vendor/](src/vendor/) via aliases in
[vite.config.ts](vite.config.ts) because only MoveNet on WebGL is used.

## License

Copyright (C) 2026 lub90 and contributors

Giddy Hop! is free software: you can redistribute it and/or modify it under the
terms of the **GNU Affero General Public License** as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version ([LICENSE](LICENSE)). It is distributed in the hope that it will
be useful, but **without any warranty**; without even the implied warranty of
merchantability or fitness for a particular purpose – see the license for
details, including the limitation of liability.

In short:

- Everyone may play, use (also professionally, e.g. as a children's
  entertainer), study, change and pass on the game.
- Whoever passes on the game or a changed version – or runs a changed version
  for others on a web server – must provide its source code under the same
  license. So the game can be sold, but every buyer receives it as free
  software and may give it away.
- The libraries and the pose model used by the game keep their own (permissive)
  licenses: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
