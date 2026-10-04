# Courses

Every `*.yaml` file in this folder is a course. It is bundled into the game
automatically and appears in the course selection on the start screen
(file name = course id). Broken files are skipped and reported in the browser
console; `npm test` validates all courses and fails on errors.

## Format

```yaml
name:                 # shown in the course selection – one text, or one per language
  de: Großer Parcours
  en: Grand Parcours
description:          # optional, same rules as name
  de: Lange Strecke mit fünf Sprüngen.
  en: Long track with five jumps.
order: 1              # optional, position in the course list (lower first)
hidden: false         # optional, true = not shown in the dropdown (select with index.html?course=<id>)

width: 7              # optional, width of the sand track in m (default 7)
grass: 4              # optional, grass strip between sand and rails on each side in m (default 4)

segments:             # the track, from start to finish
  - straight: 25                  # straight piece, length in m

  - straight: 30
    obstacles:                    # optional
      - { at: 15, type: fence }   # at = m from the start of this segment
      - { at: 25, type: water }   # jumps: fence, wall, hedge, water

  - curve: right                  # left | right
    angle: 90                     # degrees, 1–360
    radius: 22                    # m, must be larger than width/2 + grass + 2
    carrots: 3                    # optional shorthand: carrots evenly spread on the inner side
```

### Obstacles

| Field | Meaning |
| --- | --- |
| `at` | Distance from the start of the segment (m) |
| `type` | Jumps: `fence` (striped poles), `wall` (brick wall), `hedge`, `water` (water ditch) – all behave the same, they only look different. Others: `cone` (steer around it – hitting it stops the horse), `carrot` (collect it for a short turbo) |
| `lateral` | Sideways position in m, negative = left, positive = right, 0 = center (default). Ignored for jumps, which span the whole track. |

`carrots: n` on a segment places `n` carrots evenly along it – on the inner side
of a curve, on the center line of a straight.

## Tips

- Riding speed is up to ~9 m/s; a course of 300–400 m takes about one minute.
- Leave at least ~8 m between two jumps so a jump can land before the next one.
- The course must not cross itself; `npm test` checks this for every course.
- Keep the total of all curve angles in mind: the start and finish gates are
  placed at the ends of the track, wherever they end up.
- A straight 30 m run-out is added automatically behind the finish line (for the
  finish celebration) – leave room for it so it does not cross the course.
- To try out a course directly, open `index.html?course=<file name without .yaml>`.
- `test-sprint.yaml` is a hidden 45 m sprint used by the automated browser tests.
