# Welding Shop 3D Planner — Phased Build Plan

An interactive, browser-based 3D model of our 48' × 105' clear-span metal building, used for
space planning, workflow experiments, and material-flow simulation as we convert it into the
new welding/fab shop.

---

## Goals

1. **Base building model** — accurate shell with garage doors, ramp to the adjacent building,
   and mezzanine features. All dimensions data-driven so real numbers drop in as we get them.
2. **Placeable equipment** — welding tables, welders, press brake, shear, ironworker, saw,
   shelving racks, forklift. Click-and-drag placement, rotation, duplication, snap-to-grid.
3. **Motion simulation** — draw a travel path for the forklift (optionally carrying 24' stock),
   press play, and watch it drive the path so we can see what it clears and what has to move.
4. **Scenario management** — save/load/compare named layouts ("Layout A: saw on north wall",
   "Layout B: staging by door 2") and export/import them as JSON files committed to this repo.

## Non-goals (for now)

- Photorealism. This is a planning tool — clean, legible, fast beats pretty.
- Structural/engineering accuracy (load calcs, code compliance). It's spatial only.
- Multi-user / server backend. Single-page app, runs locally or on GitHub Pages.

---

## Tech Stack

| Choice | What | Why |
|---|---|---|
| Renderer | **Three.js** | Industry-standard WebGL, great docs, handles everything we need (orbit camera, drag controls, path animation) |
| Build | **Vite + TypeScript** | Instant dev server, typed data model catches unit/dimension mistakes |
| UI | Plain HTML/CSS overlay panel | Equipment palette, layout manager, play controls — no framework needed |
| Persistence | JSON files + localStorage | Layouts are plain JSON: versionable in git, diffable, hand-editable |
| Hosting | GitHub Pages (optional, later) | Zero-cost sharing — open it on a phone in the shop |

**Units:** everything is authored in **feet** (decimal internally, displayed as ft-in).
Grid default 1', placement snap default 6" (adjustable).

## Data Model (all dimensions live in JSON, not code)

```
data/
  building.json      — shell: 48 × 105 footprint, eave/ridge heights, wall openings
                       (garage doors, man doors), ramp geometry, mezzanine geometry
  catalog.json       — equipment definitions: footprint, height, color, mobility
                       (fixed | rolling | driven), parametric options (rack bays, etc.)
layouts/
  layout-a.json      — placed instances: {catalogId, position, rotation, params}
                       plus saved forklift paths for that scenario
```

Real dimensions (door locations, ramp, mezzanine) get dropped into `building.json` as they
arrive — no code changes needed. Placeholders are clearly marked `"TBD": true` until then.

---

## Phases

### Phase 1 — Scaffold + Building Shell
> *Deliverable: walk around inside an accurate empty building in the browser.*

- Vite + TypeScript + Three.js project scaffold, npm scripts, README.
- 48' × 105' slab, walls, gabled roof — **18' eave, 25' ridge** (ridge assumed to run along
  the 105' length, standard for a clear-span metal building).
- Orbit / pan / zoom camera; **top-down orthographic "plan view" toggle** (this is the view
  we'll actually plan in half the time).
- Walls and roof auto-fade when the camera is outside so the interior is always visible.
- 1' floor grid with 5' major lines; N/S/E/W + dimension labels on the slab edges.
- Clean lighting, sky/ground backdrop.

### Phase 2 — Building Features (doors, ramp, mezzanine)
> *Deliverable: the real building, driven entirely by `building.json`.*

- **Garage doors:** parametric — wall, corner the offset is measured from, width, height.
  Rendered with section lines and an open/closed toggle (lifts and lays back under the
  ceiling like the real one). **Built: 24'W × 10'H bay door, 27' off the front-right corner.**
- **Man doors:** parametric, same system, with inswinging leaves.
  **Built: two 42" inswinging leaves (7'-0" total), 15' off the front-left corner.**
- **Ramp** from the adjacent building: parametric wall/offset/width/run/rise. It runs
  *into* the shop — the neighbouring building's floor is higher, so the deck is highest at
  the wall and falls to our floor level inboard.
  **Built: 7' wide, 12' run, 33" rise (23% grade), on the left end wall 5'-7" off the
  cinderblock notch. Costs 84 sq ft of sloped floor.**
- **Unusable areas:** corner-anchored obstructions, solid to the roof in 3D and hatched on
  the floor in plan. **Built: 6' × 9' cinderblock notch at the rear-left corner (54 sq ft).**
- **Mezzanine:** parametric platform (footprint, deck height, stair location, railing).
  Clearance under it is honored by the placement system. (Dims TBD.)
- Every TBD item flagged visually (hatched material) until real dimensions replace it.

### Phase 3 — Equipment Catalog + Click-and-Move Placement
> *Deliverable: drag equipment around the floor and try layouts.*

Interaction model:
- Click palette → item appears at cursor → click to place.
- Click-and-drag to move (constrained to floor); **R** or handle to rotate 15°/90° steps;
  snap-to-grid; **D** duplicate; **Del** delete; Esc cancels.
- Items tint **red on overlap** with equipment, walls, or mezzanine posts.
- Optional per-item **clearance halo** (e.g. 3' work zone around a table) shown as a floor ring.

Starter catalog (dims are typical placeholders — we'll true them up to your actual iron):

| Item | Footprint (placeholder) | Mobility |
|---|---|---|
| Welding table | 4' × 8', 36" tall | rolling |
| Welding machine + cart | 2' × 3' | rolling |
| Press brake | 12' × 6' | fixed |
| Shear | 12' × 7' | fixed |
| Ironworker | 4' × 4' | fixed |
| Cutting table (plasma/oxy) | 6' × 12' (placeholder) | fixed |
| Band/cold saw + infeed | 6' × 4' (+ material clearance zone) | fixed |
| **Material rack (parametric)** | 20' wide × 5' deep × up to 12' tall, vertical bays 4'–5' wide — holds 24' stock (2' overhang each end, shown) | movable |
| Forklift | ~8' × 4' (+ forks) | driven (Phase 5) |
| Pallet / staging marker | 4' × 4' | movable |
| Person figure (scale check) | — | movable |

The rack is fully parametric (width / depth / bay count / level count) so we can experiment —
and stored stock longer than the rack (24' in a 20' rack) renders with visible overhang.

### Phase 4 — Layouts: Save / Load / Compare
> *Deliverable: named scenarios we can flip between and keep in git.*

- Save current placement as a named layout; instant switch between layouts.
- Autosave to localStorage (never lose work on refresh).
- Export/import layout JSON → commit the good ones to `layouts/` in this repo.
- "Duplicate layout" to branch an experiment.

### Phase 5 — Forklift Path Simulation
> *Deliverable: draw a path, hit play, watch the forklift (with 24' stock) thread the shop.*

- **Draw mode:** click waypoints on the floor; corners get realistic turning arcs; drag
  waypoints to edit; per-segment forward/reverse.
- **Load toggle:** none / pallet / **24' stick on the forks** (crosswise), rendered on the truck.
- **Play controls:** play / pause / scrub / speed.
- **Swept envelope:** translucent ribbon showing everything the truck + load passes over —
  the "do the welding tables have to move?" answer at a glance.
- Live **collision flash** when truck or load clips placed equipment; a clearance report lists
  every item it hits or passes within N inches of.
- Paths are saved per-layout (e.g. "unload from Door 1 → rack").

### Phase 6 — Workflow & Analysis Polish
> *Deliverable: the tool earns its keep in planning meetings.*

- Tape-measure tool (click two points → ft-in readout).
- Aisle/walkway painter — mark keep-clear lanes on the floor; equipment placed on a lane warns.
- First-person walk mode (eye-level sanity check).
- One-click screenshot / printable top-down plan with dimensions.
- Nice-to-haves as demanded: door-approach aprons outside, truck at the door for unloading
  sims, jib-crane swing-radius discs.

---

## Dimensions Needed (drop in as we go — placeholders until then)

- [x] Eave height 18', ridge (center) height 25'
- [x] Front-wall bay door: 24'W × 10'H, 27' off the right corner
- [x] Front-wall man doors: 2 × 42" inswinging, 15' off the left corner (height 7'-0" assumed)
- [ ] Any other garage/man doors on the rear or end walls?
- [ ] Which compass direction does the front wall face?
- [x] Ramp: internal, left end wall, 7' wide, 12' run, 33" rise, 5'-7" off the notch
- [x] Cinderblock notch: rear-left corner, 6' off the left wall × 9' off the rear wall
- [ ] Opening in the left end wall at the head of the ramp — width and height? (its sill
      sits 33" above our slab, at the adjacent building's floor level)
- [ ] Grade at the front bay door — is the apron level with the slab?
- [ ] Mezzanine: footprint, deck height, stair location, what's under/on it
- [ ] Real equipment list w/ measured footprints (brake, shear, ironworker, saw, cutting table, tables, welders)
- [x] Rack spec: 20' wide × 5' deep, up to 12' tall, bays 4'–5' wide, holds 24' stock
- [ ] Forklift model/size (affects turning radius) and typical load lengths

## Things Possibly Being Forgotten (flagging for discussion)

- **Saw infeed/outfeed** — cutting 24' stock needs ~25'+ of clear line on the infeed side;
  this constrains layout more than almost anything except the forklift.
- **Material staging** — an inbound "dump zone" near the receiving door so trucks unload fast,
  separate from the racks.
- **Grinding/finishing area** — sparks + dust want distance/separation from welding and paint.
- **Assembly/fit-up floor space** — big weldments need open slab; worth marking as a zone.
- **Overhead handling** — jib cranes or a bridge crane change everything about table placement.
- **Power drops & air** — welder locations follow bus/drop locations; compressor placement.
- **Office / break / restroom / tool crib** — often lands under or on the mezzanine.
- **Egress & fire lanes** — keep man doors and extinguisher access clear in every layout.
- **Scrap bins & dumpster path** — scrap flows out somehow, usually by forklift.
- **Outside the doors** — truck approach/apron: can a 24' load actually swing in the door?

---

## Sequencing & Working Agreement

Each phase lands as a working, pushed increment on this branch — the model is usable from
Phase 1 onward, and real dimensions can be dropped into `building.json` at any time without
waiting on a phase. Plan lives here; we edit it as decisions get made.
