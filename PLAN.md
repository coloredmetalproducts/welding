# Welding Shop 3D Planner — Phased Build Plan

An interactive, browser-based 3D model of our 50' × 105' clear-span metal building, used for
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
  building.json      — shell: 50 × 105 footprint, eave/ridge heights, wall openings
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
- **Footprint is a polygon, not a rectangle:** a 50' × 105' envelope with corner bites
  taken out of it. The polygon drives the slab, roof panes, wall segments and floor grid, so
  they stay consistent. **Built: 15' × 13' bite at the rear-left corner → 5,055 sq ft floor.**
- Walls, gabled roof — **18' eave, 25' ridge**, ridge running along the 105' length. Each
  wall's top follows the roof underside, so walls across the ridge get a gable peak and
  walls along it get a flat top, with no special-casing.
- Orbit / pan / zoom camera; **top-down orthographic "plan view" toggle** (this is the view
  we'll actually plan in half the time), standard elevation presets, and a toggle to hide all
  dimensions and labels for a clean look.
- **Everything is hoverable** for its dimensions, and **doors are opened by clicking them**
  directly in the scene rather than from a control panel.
- Walls and roof auto-fade when the camera is outside so the interior is always visible.
- 1' floor grid with 5' major lines; N/S/E/W + dimension labels on the slab edges.
- Clean lighting, sky/ground backdrop.

### Phase 2 — Building Features (doors, ramp, mezzanine)
> *Deliverable: the real building, driven entirely by `building.json`.*

- **Garage doors:** parametric — wall, corner the offset is measured from, width, height.
  Rendered with section lines and an open/closed toggle (lifts and lays back under the
  ceiling like the real one). **Built: 24'W × 10'H bay door, 27' off the front-right corner.**
- **Man doors:** parametric, same system, with inswinging leaves.
  **Built: two 36" inswinging leaves (6'-0" total), 15' off the front-left corner.**
- **Plain openings:** framed pass-throughs with no leaf, and an optional sill height so an
  opening can start above the floor. **Built: 7' × 9' opening at the head of the ramp, sill
  33" up at the adjacent building's floor level.**
- **Ramp** from the adjacent building: parametric wall/offset/width/run/rise. It runs
  *into* the shop — the neighbouring building's floor is higher, so the deck is highest at
  the wall and falls to our floor level inboard.
  **Built: 7' wide, 12' run, 33" rise (23% grade), on the left end wall 5'-7" off the
  cinderblock notch. Costs 84 sq ft of sloped floor.**
- **Unusable areas:** obstructions positioned from a named corner by an offset along each
  axis, solid in 3D and hatched on the floor in plan, optionally capped below the roof.
  **Built: 6' × 9' cinderblock notch against the cut corner (54 sq ft).**
- **Mezzanine:** parametric deck that wraps whatever it can't sit on — envelope cutouts
  aren't floor, and obstructions pass through it — plus 4x4 perimeter posts.
  **Built: rear-left corner, 19'-3" × 25'-0" gross wrapping both notches → 232 sq ft of
  deck. 2x8 joists + ¼" ply: 81" clear below, deck top at 7'-5". 25 posts at 6' (assumed).**
- **Sloping site grade:** the slab stands proud of the exterior grade by different amounts,
  and the grade is a *profile* along the front rather than one number — it falls from the
  dock end toward the bay door. **Built: 33" at the dock/ramp end, 49" at the bay door, 6"
  at the rear.** The ground is a sampled grid following that surface, with the gravel yard
  carried as vertex colour.
- **Exterior concrete:** docks and ramps outside the wall, one shape covering both — a wedge
  whose far edge matches its near edge is a flat slab. **Built: 16' × 40' dock at the front-left
  corner, surface level with the interior floor; 6' × 19' man-door ramp falling 33" to grade
  (14% grade).**
- Every TBD item flagged visually (hatched material) until real dimensions replace it.

### Phase 3 — Equipment Catalog + Click-and-Move Placement
> *Deliverable: drag equipment around the floor and try layouts.*

**Started.** Machines come from `data/catalog.json`, placements from `data/layout.json`.

- Click-and-drag to move, snapped to 6"; **R** rotates 90°, **Shift+R** 15°.
- **Working-clearance envelope:** a dashed floor outline projecting off each end of the
  machine's feed axis. It turns red the moment the clearance stops fitting — which is the
  whole point: it answers "can I actually cut 24' stock standing here?" at a glance.
- Placement is checked against the building continuously: outside the walls, over unusable
  floor, on a ramp, or under too little headroom all flag in the selection panel, and the
  machine itself tints red.
- **Feed axis is explicit per machine**, not inferred from the shape — plenty of machines are
  fed across their short side, as the Marvel is.
- **Built: Marvel Series 81 band saw** — 5' × 8' × 7', fed through the 5' side, 24' clearance
  each end (a 53' × 8' envelope). Massed off the real machine: motor and hydraulic cabinet at
  the back, the tall band-wheel frame in front of it, and the roller table reaching out to the
  operator with the cutting run of the band dropping through the stock line.
- **Clearance can be asymmetric.** A saw running long stock needs the same room both
  ways, but a brake or shear needs far more on the operator side than behind, so those
  give `infeed` and `outfeed` separately.
- **Working length is separate from footprint** where they differ — a brake's frame runs
  wider than its bend length because the counterweights hang off each end.
- **Built: 10' manual brake (Baileigh BB-12014)** — hand-operated box-and-pan brake for
  sheet, **12'-2" overall × 2'-10" deep × 4'-0" tall on a 10' bend length**, 6' operator
  side / 3' behind for the counterweight swing.
- **Built: 12' hydraulic shear** — guillotine shear, 12' bed × 6' deep × 6' tall, 10' to
  load / 5' behind. Massed as housing + blade beam + support table + pendant stand.
- **Built: forklift** — 4' × 12' × 7', drivable, with an operator aboard.
- **Default arrangement** (in `data/layout.json`): racks down the right-end wall and one
  along the front by the man door, the saw running its 53' cut line across the front bay,
  the shear on the rear wall and the brake tucked under the mezzanine beside the
  cinderblock notch.
- **Built: material rack** — parametric cantilever rack. 20' of frame in 5' bays, arms 4'
  apart, 5' deep, 12' tall, with the stored 24' stock drawn on the arms so its 2' overhang
  past each end of the frame reads. Three placed along the rear wall.

Still to do: palette to add items, duplicate, delete, per-item clearance halos.

### Phase 5 — Forklift movement — *started early*

- **Arrow-key driving:** select the forklift and drive it. Up/down move along its heading,
  left/right steer. It sits on whatever surface is under it and pitches to the slope, so it
  visibly climbs the ramps and rolls out onto the dock.
- **Draw a path and play it:** click *Draw path*, click points on the floor, then *Play*. The
  truck tracks the line at a constant speed and eases round corners rather than snapping.
- Warnings are mobility-aware: a forklift is *meant* to leave the building and climb ramps, so
  it isn't flagged for either — but low headroom and blocked floor still are.

Still to do: the 24' load on the forks, the swept envelope, and collision reporting.

Starter catalog (dims are typical placeholders — we'll true them up to your actual iron):

| Item | Footprint (placeholder) | Mobility |
|---|---|---|
| Welding table | 4' × 8', 36" tall | rolling |
| Welding machine + cart | 2' × 3' | rolling |
| **10' press brake** ✅ built | 10' bed × 8' deep × 10' tall, 8'/3' clearance | fixed |
| **12' hydraulic shear** ✅ built | 12' bed × 8' deep × 6' tall, 10'/5' clearance | fixed |
| Ironworker | 4' × 4' | fixed |
| Cutting table (plasma/oxy) | 6' × 12' (placeholder) | fixed |
| **Marvel Series 81 band saw** ✅ built | 5' × 8' × 7' tall, 24' clearance each end | fixed |
| **Material rack (parametric)** ✅ built | 20' wide × 5' deep × 12' tall, 5' bays, 4' level spacing — holds 24' stock, 2' overhang each end shown | rolling |
| **Forklift** ✅ built | 4' × 12' (incl. forks) × 7' | driven |
| Pallet / staging marker | 4' × 4' | movable |
| Person figure (scale check) | — | movable |

The rack is fully parametric (width / depth / bay count / level count) so we can experiment —
and stored stock longer than the rack (24' in a 20' rack) renders with visible overhang.

### Phase 4 — Layouts: Save / Load / Compare — *mostly built*
> *Deliverable: named scenarios we can flip between and keep in git.*

- **Built: named layouts in browser storage.** Only two people use this and there is no
  server, so per-browser storage is the right answer, not a limitation to work around:
  each of us keeps our own scenarios and neither overwrites the other.
- **Built: autosave.** Every drag, rotate and drive writes the working state on a short
  delay, so a refresh picks up mid-shuffle. The name of the layout you're on persists too.
- **Built: Export / Import.** Export writes the same shape as `data/layout.json`, so it is
  both how a layout gets handed to the other person and how one becomes the default
  everybody starts from — drop it in as `data/layout.json` and commit it.
- **Built: Reset** back to the committed default.
- Still to do: side-by-side compare, duplicate-to-branch-an-experiment, and a `layouts/`
  folder of committed scenarios. Sharing live between the two of us would need a server;
  Export/Import is the swap until then.

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
- [x] Front-wall man doors: 2 × 36" inswinging, 15' off the left corner (height 7'-0" assumed)
- [ ] Any other garage/man doors on the rear or end walls?
- [ ] Which compass direction does the front wall face?
- [x] Ramp: internal, left end wall, 7' wide, 12' run, 33" rise, 5'-7" off the notch
      (14'-7" off the cut corner, since the left end wall now runs only 37')
- [x] Rear-left corner: 15' × 13' is outside the building envelope (not an obstruction)
- [x] Cinderblock notch: 6' × 9', hard against the cut corner, 13' off the envelope rear
- [x] Ramp opening: 7' wide × 9' tall, sill 33" up (top of ramp), left end wall
- [x] Grade: 49" below the slab at the front, 6" at the rear
- [x] Mezzanine: footprint, 81" clear below, 8" deck, 4x4 posts
- [x] Exterior man-door ramp: 19' long, falling 33" to grade (width assumed 6')
- [x] Raised dock: 16' × 40' concrete at the front-left corner, level with the floor
- [x] Front yard is gravel except the dock and ramp, which are concrete
- [x] The 24' bay door is served **as a loading dock** — no floor-level access from the yard
- [x] Exterior ramp width confirmed close enough at 6'
- [ ] Mezzanine stairs and railing; post spacing 6' assumed
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
