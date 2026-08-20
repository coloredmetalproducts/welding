# Welding Shop 3D Planner

Interactive 3D space-planning model of our 48' × 105' welding/fab shop building.
Drag equipment around, save layout scenarios, and simulate forklift material flow
(including 24' stock) to test workflows before we move anything real.

**Status:** Phase 1 (building shell) built. See [PLAN.md](PLAN.md) for the phased build plan.

## Running it

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build in dist/
```

Controls: left-drag orbits, right-drag pans, scroll zooms. Press **P** (or use the
button) to toggle the top-down plan view. Walls and roof automatically fade when
the camera is outside them so the interior stays visible.

Building dimensions live in [`data/building.json`](data/building.json) — real door,
ramp, and mezzanine dimensions drop in there as we get them (Phase 2).
