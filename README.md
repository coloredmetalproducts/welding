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

**Click a door to open or close it.** In plan view the leaves are hidden and
each opening shows as an architectural floor symbol: a threshold band, approach lines for
the overhead door, and swing arcs for the hinged leaves.
