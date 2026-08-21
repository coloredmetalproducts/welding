# Welding Shop 3D Planner

Interactive 3D space-planning model of our welding/fab shop building — a 50' × 105'
envelope with a corner cut out of it, giving 5,055 sq ft of floor.
Drag equipment around, save layout scenarios, and simulate forklift material flow
(including 24' stock) to test workflows before we move anything real.

**Status:** Phase 1 (shell) done; Phase 2 in progress (doors, ramp, and the cinderblock
notch built; mezzanine pending dimensions). See [PLAN.md](PLAN.md) for the phased build plan.

## Running it

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build in dist/
```

Controls: left-drag orbits, right-drag pans, scroll zooms. Press **P** (or use the
button) to toggle the top-down plan view, and use the **View from** buttons to jump to a
standard elevation. Walls and roof automatically fade when
the camera is outside them so the interior stays visible.

## Footprint

The building is not a rectangle. It's a 50' × 105' envelope with corner bites removed, and
that polygon drives the slab, roof panes, wall segments, and floor grid together — so a
`cutouts` entry shortens the affected walls, trims the roof, and stops the grid in one go.
Wall dimension labels are measured off each actual wall, not the envelope.

## Site

The slab is not at grade, and the grade is not level. The floor stands about 33" above grade
at the dock and man-door ramp, 49" at the bay door, and 6" at the rear — so the front grade
is stored as a profile along the building's length, not a single number. The ground is a
sampled grid following that surface.

The front yard is gravel; the 16' × 40' dock and the man-door ramp are concrete. The dock
surface is level with the interior floor, and the ramp falls 33" to grade over 19'.

Nothing drives in at grade. The bay door is a loading dock, so everything arrives over the
dock, off a trailer at the bay door, or through the internal ramp from the adjacent building.

## Dimensions

Everything lives in [`data/building.json`](data/building.json) — no code changes needed
to move a door or resize the shell.

Openings are authored the way they're measured in the field: a `wall`, the `fromCorner`
the tape was pulled from, and the `offset` to the near edge. An optional `sill` raises an
opening off the floor — the ramp opening starts 33" up, at the adjacent building's floor
level. **Corners are named as seen
from outside, facing that wall** — the 3D view labels the front wall and both its corners
so the convention is checkable at a glance.

**Hover anything** — in either view — to see its size and the corner it was measured from.
The hovered opening highlights so it's clear which one the numbers belong to.

**Drag equipment to move it**, **R** to rotate 90° (**Shift+R** for 15°). Each machine draws
a dashed working-clearance envelope off its feed axis; it turns red when the clearance stops
fitting, and the selection panel says why. Equipment lives in
[`data/catalog.json`](data/catalog.json), placements in [`data/layout.json`](data/layout.json).

Machines are massed off the real thing rather than drawn as blocks — the band saw has its
motor cabinet, band-wheel frame, roller table and cutting run; the brake its bed, apron and
outboard counterweights; the shear its housing, blade beam and pendant.

The material racks are parametric: bay count, level count and stock length come from the
catalog, and the stored stock is drawn on the arms so its overhang past the frame is visible.
Three of them stand along the rear wall.

**Select the forklift and drive it with the arrow keys** — it follows the surface underneath
and pitches to the slope, so it climbs the ramps. Or click **Draw path**, click points on the
floor, and hit **Play** to watch it run the route.

## Printing

**Print plan (11x17)** opens a plan sheet — a real drawing, not a screenshot. It is SVG
authored in hundredths of an inch at a standard architect's scale, so plotted at 100% on
tabloid it measures correctly under a scale rule. The sheet carries a 5 ft grid heavy every
25 ft, a graphic scale bar that stays true even if it does get scaled, dimension strings off
the front wall, door swing symbols, a title block and a numbered equipment schedule.

Two toggles: **Equipment** off gives the base building only, and **Dock & exterior ramp**
adds the concrete outside. That second one costs scale — the dock reaches 40' out, so the
sheet drops from 1/8" = 1'-0" to 1/16" and says so in the title block.

The drawing is generated from the same building model the 3D view is built from, so it
can't drift from what's on screen.

## Saving layouts

There's no server behind this, so layouts live in your own browser — which is what we
want with two of us using it: each person keeps their own named scenarios and neither
overwrites the other.

- The arrangement is **saved as you go**, so a refresh picks up where you left off.
- **Save as…** stores the current arrangement under a name; **Load** brings it back.
- **Reset** returns to the default arrangement in
  [`data/layout.json`](data/layout.json), which is what a new browser starts from.
- **Export** writes a JSON file in exactly that shape. That's how you hand a layout to
  the other person (they **Import** it), and how a layout becomes the new default —
  drop the file in as `data/layout.json` and commit it.

The one thing it can't do is show you the other person's saved layouts live; that would
need a server. Export/Import is the swap.

**Click a door to open or close it.** In plan view the leaves are hidden and
each opening shows as an architectural floor symbol: a threshold band, approach lines for
the overhead door, and swing arcs for the hinged leaves.
