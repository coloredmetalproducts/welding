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

## Dimensions

Everything lives in [`data/building.json`](data/building.json) — no code changes needed
to move a door or resize the shell.

Openings are authored the way they're measured in the field: a `wall`, the `fromCorner`
the tape was pulled from, and the `offset` to the near edge. An optional `sill` raises an
opening off the floor — the ramp opening starts 33" up, at the adjacent building's floor
level. **Corners are named as seen
from outside, facing that wall** — the 3D view labels the front wall and both its corners
so the convention is checkable at a glance.

**Hover any door, ramp, or blocked area** — in either view — to see its size and the corner it was measured from.
The hovered opening highlights so it's clear which one the numbers belong to.

Doors can be opened and closed from the panel. In plan view the leaves are hidden and
each opening shows as an architectural floor symbol: a threshold band, approach lines for
the overhead door, and swing arcs for the hinged leaves.
