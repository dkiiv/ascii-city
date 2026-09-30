# ASCII CITY

A walkable city rendered entirely with coloured characters — no WebGL, no game
engines, no libraries. One `<canvas>`, one ray per character cell.

![screenshot](docs/screenshot.png)

## Run it

Open `index.html` in a browser. There is no build step and no module loader, so
`file://` works as-is.

```bash
python3 -m http.server 8080     # or serve the folder any way you like
```

## Controls

| Key | Action |
|---|---|
| Click | Capture the mouse (look around) |
| `W A S D` / arrows | Walk |
| `Shift` | Run |
| `E` | Use a phone, talk, board the monorail |
| `Esc` | Release the mouse · close a panel · cancel a ride |
| `T` | Auto tour — the city drives you |
| `Y` | Sky taxi to the selected destination |
| `Shift + Y` | Ground taxi — a real drive along the road graph |
| `M` | Cycle map zoom |
| `G` | Render mode (classic · solid · outline · dense glyph ramps) |
| `P` | Hide / show pedestrians |
| `V` | Weather: clear → rain → storm |
| `N` | Generate a new city |
| `+ / -` | Character density |

Touch devices get dual thumbsticks plus USE / BACK / PANEL / PAUSE.

## What is in the box

Everything the city holds is generated from one integer seed — press `N` for a
different city, same rules.

- **The city** — a 100×100 cell grid at 4 units per cell. Two-cell-wide roads
  every 13 cells, random building footprints inside each block, a river across
  one quarter, plazas, trees, kerbside furniture and 250 street lamps whose
  light is baked into a ground glow map.
- **16 districts**, each with its own name, height bias (tall downtown, low at
  the edge), tree cover, sign density and colour tint. The panel tells you which
  one you are standing in.
- **Traffic** — 96 cars path around a 64-node road graph. They keep to the right
  lane, brake for red lights, queue behind each other, yield if you stand in the
  carriageway, and pick turns by weighting straight-on.
- **Signals** — an 11-second cycle, staggered into two waves so the intersections
  do not all flip at once.
- **Pedestrians** — 150 of them wander the pavements and only cross the street on
  the walk phase, at crossings, which is why the crossing counter moves.
- **Monorail** — an elevated deck with five stations, carried on pillars you can
  walk underneath. A train dwells, runs, brakes and reverses. Board at a platform,
  pick a station, ride, step out.
- **Taxis** — a sky taxi lifts off and flies an arc to your destination; a ground
  taxi follows a Dijkstra route along the actual road graph.
- **Neon** — ~330 signs hung on building faces. The text is laid out *along the
  wall* rather than across the screen, so signs stay glued to the building at
  grazing angles.
- **Weather** — rain with parallax, wet reflective streets, cloud that eats the
  stars, and lightning during storms.
- **A story** — a phone rings near where you spawn. Answering it starts a short
  delivery job with branches and two endings. Every kind of place you can walk up
  to (mart, bar, shrine, archive, overlook, taxi rank, landing pad, square,
  station) has its own small beat.

## How the renderer works

Each frame the renderer casts one ray per character cell of the viewport across a
grid heightfield:

1. **Ray cast** — a 2D DDA walk across the XZ grid solves the first hit per ray:
   a building wall, a roof plane, a tree blob, the elevated rail deck (a slab in
   the air you can pass under), or the ground. Distance gives perspective, depth
   ordering and fog.
2. **ASCII shading** — hits become letters, digits and symbols from a density
   ramp. Nearby surfaces get larger, brighter clusters of characters; distant ones
   shrink and fade into the night.
3. **Windows** — building walls get a procedural window grid from a per-building
   hash. Lit panes glow warm, dark panes stay cold, and a few flicker.
4. **Sprites** — people, cars, props, signs, the train and the rain are projected
   into the same character grid and depth-tested against the raycast buffer, so
   they occlude and are occluded correctly.
5. **Night palette** — a dim moon key light shades wall faces, streetlights bake
   warm pools onto the road, and the sky carries stars and a moon.

The full raycast plus sprite pass runs in about **1.5 ms per frame** at the
default raster, so there is a lot of headroom above 60 fps.

## Layout

```
index.html          markup: viewport, terminal panel, overlays, touch rig
assets/style.css    the phosphor-terminal chrome, CRT overlay, responsive rules
assets/world.js     seeded generation: grid, districts, graph, rail, props, POIs
assets/render.js    raycaster, ASCII shading, sprites, weather
assets/sim.js       traffic, signals, pedestrians, monorail, taxis, tour, player
assets/story.js     narrative beats, relay captions, tour narration (pure data)
assets/ui.js        readouts, relay map, context bay, transfer overlay, touch
assets/main.js      boot, input, frame loop
```

Plain `<script>` tags and one `AC` global — deliberately, so the whole thing
still runs from a double-clicked file.

## Tuning

Knobs live at the top of `world.js` and `render.js`: `GW/GH` (city size),
`PERIOD` (block size), `CELL`, `MAXD` (view distance), `RAIL_DECK_H`, the `RAMPS`
character strings, `FOG`, and the moon direction in `MOON`.

## Lineage

A reimplementation in the spirit of the *ASCII City* series by Grow Now! Games —
the base walkable city, then traffic and detail, then maps and exploration, then
transportation. This build folds all four stages into one codebase.
