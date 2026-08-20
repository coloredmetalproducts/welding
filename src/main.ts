import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import buildingData from '../data/building.json';
import { buildBuilding, updatePanelFades, type HoverTarget } from './building';
import { makeFloorGrid } from './grid';
import { formatFeet, makeTextSprite } from './labels';
import { gradeDropAt } from './geometry';
import { buildPlacement, feedFootprint, type Placement } from './equipment';
import { createTravelPath } from './path';
import catalogData from '../data/catalog.json';
import layoutData from '../data/layout.json';
import type { Catalog, Layout } from './types';
import type { BuildingSpec } from './types';

// JSON widens string literals, so the spec shape is asserted at the boundary.
const spec = buildingData as unknown as BuildingSpec;
const { length: L, width: W } = spec;
const center = new THREE.Vector3(L / 2, 0, W / 2);
// Exterior concrete projects in front of the building, so plan view and the
// front labels have to reckon with more than the footprint.
const frontReach = Math.max(0, ...(spec.exterior ?? []).map((work) => work.depth));
const planCenter = new THREE.Vector3(L / 2, 0, (W - frontReach) / 2);

// ---------------------------------------------------------------- renderer
const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ------------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
scene.fog = new THREE.Fog(0xdfe7ee, 350, 1000);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa08d, 1.4));
const fill = new THREE.DirectionalLight(0xeef4ff, 0.7);
fill.position.set(-60, 50, 120);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
sun.position.set(L * 0.75, 90, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
sun.shadow.camera.far = 300;
sun.target.position.copy(center);
scene.add(sun, sun.target);

// Exterior grade. The site slopes: the slab stands 49" proud at the front,
// where the doors are effectively at dock height, and only 6" at the rear. The
// ground ramps between the two along the building and runs flat beyond it.
// A sampled grid rather than a plane, because the grade varies in both
// directions: it falls along the front from the dock end to the bay door, and
// again from the front wall to the rear. Gravel vs dirt rides on vertex colour.
const REACH = 320;
const CELL = 6;
const DIRT = new THREE.Color(0x9aa08d);
const GRAVEL = new THREE.Color(0xb0aa9c);

function buildGround(): THREE.Mesh {
  const x0 = -REACH;
  const x1 = L + REACH;
  const z0 = -REACH;
  const z1 = W + REACH;
  const geometry = new THREE.PlaneGeometry(
    x1 - x0,
    z1 - z0,
    Math.ceil((x1 - x0) / CELL),
    Math.ceil((z1 - z0) / CELL),
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const yard = spec.gravelYard;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, -gradeDropAt(spec, x, z));
    const onGravel =
      yard !== undefined && x >= yard.x0 && x <= yard.x1 && z >= yard.z0 && z <= yard.z1;
    (onGravel ? GRAVEL : DIRT).toArray(colors, i * 3);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildGround());

const building = buildBuilding(spec);
scene.add(building.group);
scene.add(makeFloorGrid(L, W, building.footprint.cuts));

// ------------------------------------------------------------------ labels
// The cut corner makes the floor area non-obvious, so state it outright.
document.getElementById('dims')!.textContent =
  `${W}' × ${L}' envelope · ${building.footprint.area.toLocaleString()} sq ft floor` +
  ` · ${spec.eaveHeight}' eave / ${spec.ridgeHeight}' ridge`;

const annotations = new THREE.Group();
scene.add(annotations);

// One dimension label per envelope wall. A corner cutout shortens two of them,
// so these are measured off the actual wall rather than the overall envelope.
for (const wall of building.walls) {
  if (!(wall.id in { front: 1, rear: 1, leftEnd: 1, rightEnd: 1 })) continue;
  const mid = new THREE.Vector3(wall.span / 2, 0.1, 0).applyMatrix4(wall.matrix);
  const label = makeTextSprite(formatFeet(wall.span), 5);
  label.position.copy(mid.addScaledVector(wall.outward, 8)).setY(0.1);
  annotations.add(label);
}

// Orientation aids: opening offsets are measured from a corner "as seen from
// outside", so name the front wall and its corners to make that checkable.
const frontLabel = makeTextSprite('FRONT WALL', 5, '#2c6e9e');
frontLabel.position.set(L / 2, 0.1, -(frontReach + 15));
annotations.add(frontLabel);
const rightCorner = makeTextSprite('RIGHT\nCORNER', 3, '#2c6e9e');
rightCorner.position.set(9, 0.1, -(frontReach + 7));
annotations.add(rightCorner);
const leftCorner = makeTextSprite('LEFT\nCORNER', 3, '#2c6e9e');
leftCorner.position.set(L - 9, 0.1, -(frontReach + 7));
annotations.add(leftCorner);

// ----------------------------------------------------------------- cameras
const perspCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.5,
  2000,
);
// Start outside the front wall, where every opening so far lives.
perspCamera.position.set(L * 0.28, 52, -82);

const orbit = new OrbitControls(perspCamera, renderer.domElement);
orbit.target.copy(center);
orbit.maxPolarAngle = Math.PI / 2 - 0.02;
orbit.enableDamping = true;

const planCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
planCamera.position.set(planCenter.x, 200, planCenter.z);
planCamera.up.set(0, 0, -1);
planCamera.lookAt(planCenter);

const planControls = new OrbitControls(planCamera, renderer.domElement);
planControls.target.copy(planCenter);
planControls.enableRotate = false;
planControls.screenSpacePanning = true;
planControls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
planControls.enabled = false;

function fitPlanCamera(): void {
  const margin = 24;
  const aspect = window.innerWidth / window.innerHeight;
  let halfW = (L + margin * 2) / 2;
  let halfH = (W + frontReach + margin * 2) / 2;
  if (halfW / halfH < aspect) halfW = halfH * aspect;
  else halfH = halfW / aspect;
  planCamera.left = -halfW;
  planCamera.right = halfW;
  planCamera.top = halfH;
  planCamera.bottom = -halfH;
  planCamera.updateProjectionMatrix();
}
fitPlanCamera();

let planView = false;
const viewToggle = document.getElementById('viewToggle') as HTMLButtonElement;
const hint = document.getElementById('hint')!;

function setPlanView(on: boolean): void {
  planView = on;
  orbit.enabled = !on;
  planControls.enabled = on;
  viewToggle.textContent = on ? 'Switch to 3D view' : 'Switch to plan view';
  viewToggle.classList.toggle('active', on);
  for (const solid of building.planHiddenGroups) solid.visible = !on;
  clearHover();
  hint.innerHTML = on
    ? 'Drag: pan &middot; Scroll: zoom'
    : 'Left-drag: orbit &middot; Right-drag: pan<br />Scroll: zoom';
}
viewToggle.addEventListener('click', () => setPlanView(!planView));
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) setPlanView(!planView);
});

// ------------------------------------------------------------ view presets
// Standard elevations, so a given wall can be inspected without hunting for
// the angle by hand.
const PRESETS: Array<[string, THREE.Vector3]> = [
  ['Iso', new THREE.Vector3(L * 0.28, 52, -82)],
  ['Front', new THREE.Vector3(L / 2, 26, -78)],
  ['Left', new THREE.Vector3(L + 74, 30, W / 2)],
  ['Rear', new THREE.Vector3(L / 2, 26, W + 78)],
  ['Right', new THREE.Vector3(-74, 30, W / 2)],
];
const presetRow = document.getElementById('viewPresets')!;
for (const [name, position] of PRESETS) {
  const button = document.createElement('button');
  button.textContent = name;
  button.addEventListener('click', () => {
    if (planView) setPlanView(false);
    perspCamera.position.copy(position);
    orbit.target.copy(center);
    orbit.update();
  });
  presetRow.appendChild(button);
}

// ------------------------------------------------------------ label toggle
const labelToggle = document.getElementById('labelToggle') as HTMLButtonElement;
let labelsVisible = true;
labelToggle.addEventListener('click', () => {
  labelsVisible = !labelsVisible;
  annotations.visible = labelsVisible;
  labelToggle.textContent = labelsVisible
    ? 'Hide dimensions and labels'
    : 'Show dimensions and labels';
  labelToggle.classList.toggle('active', !labelsVisible);
});

// -------------------------------------------------------------- equipment
const catalog = catalogData as unknown as Catalog;
const layout = layoutData as unknown as Layout;
const placements: Placement[] = [];

for (const item of layout.items) {
  const definition = catalog.items.find((entry) => entry.id === item.catalogId);
  if (!definition) {
    console.warn(`Layout references unknown catalog item: ${item.catalogId}`);
    continue;
  }
  const placement = buildPlacement(definition, item, building.site);
  scene.add(placement.group);
  placements.push(placement);
}

const selectionPanel = document.getElementById('selection')!;
let selected: Placement | null = null;

function describe(placement: Placement): string {
  const { catalog: def, placed } = placement;
  const problems = placement.check();
  return [
    `<strong>${def.label}</strong>`,
    `${formatFeet(def.width)} × ${formatFeet(def.length)} × ${formatFeet(def.height)} tall`,
    ...(def.clearance
      ? [`Feeds through the ${formatFeet(feedFootprint(def).along)} side`]
      : []),
    `Rotated ${Math.round(placed.rotation)}°`,
    ...(def.clearance ? [`<span class="muted">${def.clearance.label}</span>`] : []),
    ...problems.map((p) => `<span class="warn">${p}</span>`),
    ...(problems.length === 0 ? ['<span class="ok">Fits where it stands</span>'] : []),
  ].join('<br />');
}

function select(placement: Placement | null): void {
  selected?.setSelected(false);
  selected = placement;
  selected?.setSelected(true);
  if (!selected) {
    selectionPanel.style.display = 'none';
    return;
  }
  selectionPanel.style.display = 'block';
  selectionPanel.innerHTML = describe(selected);
}

function rotateSelected(step: number): void {
  if (!selected) return;
  selected.setRotation(selected.placed.rotation + step);
  selectionPanel.innerHTML = describe(selected);
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey) return;
  rotateSelected(event.shiftKey ? 15 : 90);
});

// ------------------------------------------------------- driving and paths
// Arrow keys drive whatever driven machine is selected. Held keys are tracked
// and applied in the render loop so motion is smooth and frame-rate independent.
const DRIVE_SPEED = 7;
const TURN_SPEED = 75;
const held = new Set<string>();
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', (event) => {
  if (!ARROWS.includes(event.key)) return;
  if (!selected || selected.catalog.mobility !== 'driven') return;
  event.preventDefault();
  held.add(event.key);
});
window.addEventListener('keyup', (event) => held.delete(event.key));
window.addEventListener('blur', () => held.clear());

function driveSelected(dt: number): void {
  if (!selected || selected.catalog.mobility !== 'driven' || held.size === 0) return;
  const item = selected.placed;
  let rotation = item.rotation;
  if (held.has('ArrowLeft')) rotation += TURN_SPEED * dt;
  if (held.has('ArrowRight')) rotation -= TURN_SPEED * dt;

  let step = 0;
  if (held.has('ArrowUp')) step += DRIVE_SPEED * dt;
  if (held.has('ArrowDown')) step -= DRIVE_SPEED * dt;
  const yaw = THREE.MathUtils.degToRad(rotation);
  selected.setPose(item.x + Math.cos(yaw) * step, item.z - Math.sin(yaw) * step, rotation);
  selectionPanel.innerHTML = describe(selected);
}

const forklift = placements.find((p) => p.catalog.mobility === 'driven');
const travelPath = createTravelPath(building.site);
scene.add(travelPath.group);

const pathDraw = document.getElementById('pathDraw') as HTMLButtonElement;
const pathPlay = document.getElementById('pathPlay') as HTMLButtonElement;
const pathClear = document.getElementById('pathClear') as HTMLButtonElement;
const pathHint = document.getElementById('pathHint')!;

let drawing = false;
let playing = false;
let travelled = 0;
let playHeading = 0;

function refreshPathUi(): void {
  pathDraw.textContent = drawing ? 'Done drawing' : 'Draw path';
  pathDraw.classList.toggle('active', drawing);
  pathPlay.textContent = playing ? 'Stop' : 'Play';
  pathPlay.classList.toggle('active', playing);
  pathPlay.disabled = travelPath.count() < 2;
  pathHint.textContent = drawing
    ? `Click the floor to add points (${travelPath.count()} so far)`
    : travelPath.count() < 2
      ? 'No path yet'
      : `${travelPath.count()} points · ${formatFeet(travelPath.totalLength())} long`;
}

pathDraw.addEventListener('click', () => {
  drawing = !drawing;
  if (drawing) {
    playing = false;
    select(forklift ?? null);
  }
  refreshPathUi();
});
pathClear.addEventListener('click', () => {
  travelPath.clear();
  playing = false;
  drawing = false;
  refreshPathUi();
});
pathPlay.addEventListener('click', () => {
  if (travelPath.count() < 2 || !forklift) return;
  playing = !playing;
  if (playing) {
    drawing = false;
    travelled = 0;
    const start = travelPath.sample(0);
    if (start) {
      playHeading = start.heading;
      forklift.setPose(start.x, start.z, THREE.MathUtils.radToDeg(start.heading));
    }
  }
  refreshPathUi();
});

function advancePlayback(dt: number): void {
  if (!playing || !forklift) return;
  travelled += DRIVE_SPEED * dt;
  const total = travelPath.totalLength();
  const at = travelPath.sample(Math.min(travelled, total));
  if (!at) return;
  // Ease the heading round rather than snapping at each corner, so a turn looks
  // like a turn.
  let delta = at.heading - playHeading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  playHeading += delta * Math.min(1, dt * 6);
  forklift.setPose(at.x, at.z, THREE.MathUtils.radToDeg(playHeading));
  selectionPanel.innerHTML = describe(forklift);
  if (travelled >= total) {
    playing = false;
    refreshPathUi();
  }
}

// Dragging happens on the floor plane, which works the same under the
// perspective and orthographic cameras.
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPoint = new THREE.Vector3();
const SNAP = 0.5;
let dragging: { placement: Placement; offsetX: number; offsetZ: number } | null = null;

function floorUnderPointer(): THREE.Vector3 | null {
  return raycaster.ray.intersectPlane(floorPlane, dragPoint) ? dragPoint : null;
}

// ----------------------------------------------------------- hover tooltip
// Door dimensions stay out of the way until asked for: hovering an opening
// (in either view) reveals its size and the corner it was measured from.
const tooltip = document.getElementById('tooltip')!;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
for (const placement of placements) {
  building.hoverTargets.push({
    mesh: placement.hoverMesh,
    title: placement.catalog.label,
    lines: [
      `${formatFeet(placement.catalog.width)} × ${formatFeet(
        placement.catalog.length,
      )} × ${formatFeet(placement.catalog.height)} tall`,
      ...(placement.catalog.clearance ? [placement.catalog.clearance.label] : []),
    ],
    note: placement.catalog.note,
    setHighlight: (on) => placement.setHighlight(on),
    actionLabel: () => 'Drag to move · R to rotate',
  });
}
const hoverMeshes = building.hoverTargets.map((target) => target.mesh);
const placementByMesh = new Map(placements.map((p) => [p.hoverMesh, p]));

let hovered: HoverTarget | null = null;
let orbiting = false;

function clearHover(): void {
  hovered?.setHighlight(false);
  hovered = null;
  tooltip.style.display = 'none';
  renderer.domElement.style.cursor = 'default';
}

function setPointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function updateHover(event: PointerEvent): void {
  setPointer(event);
  raycaster.setFromCamera(pointer, planView ? planCamera : perspCamera);
  const hit = raycaster.intersectObjects(hoverMeshes, false)[0];
  const target = hit
    ? (building.hoverTargets.find((t) => t.mesh === hit.object) ?? null)
    : null;

  if (target !== hovered) {
    hovered?.setHighlight(false);
    target?.setHighlight(true);
    hovered = target;
  }
  if (!target) {
    tooltip.style.display = 'none';
    renderer.domElement.style.cursor = 'default';
    return;
  }

  tooltip.innerHTML = [
    `<strong>${target.title}</strong>`,
    ...target.lines,
    ...(target.note ? [`<span class="muted">${target.note}</span>`] : []),
    ...(target.actionLabel ? [`<span class="action">${target.actionLabel()}</span>`] : []),
  ].join('<br />');
  renderer.domElement.style.cursor = target.activate ? 'pointer' : 'default';
  tooltip.style.display = 'block';

  // Flip the tooltip back across the cursor rather than let it run off-screen.
  const pad = 16;
  const x = event.clientX + pad;
  const y = event.clientY + pad;
  tooltip.style.left = `${
    x + tooltip.offsetWidth > window.innerWidth ? event.clientX - pad - tooltip.offsetWidth : x
  }px`;
  tooltip.style.top = `${
    y + tooltip.offsetHeight > window.innerHeight ? event.clientY - pad - tooltip.offsetHeight : y
  }px`;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  if (dragging) {
    setPointer(event);
    raycaster.setFromCamera(pointer, planView ? planCamera : perspCamera);
    const hit = floorUnderPointer();
    if (hit) {
      const snap = (value: number) => Math.round(value / SNAP) * SNAP;
      dragging.placement.setPosition(
        snap(hit.x + dragging.offsetX),
        snap(hit.z + dragging.offsetZ),
      );
      selectionPanel.innerHTML = describe(dragging.placement);
    }
    return;
  }
  if (orbiting) return;
  updateHover(event);
});
let pressed: { x: number; y: number; target: HoverTarget | null } | null = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  pressed = { x: event.clientX, y: event.clientY, target: hovered };

  // Pressing on a machine grabs it rather than orbiting the camera. The grab
  // offset keeps it from jumping so its centre lands under the cursor.
  const grabbed = hovered ? placementByMesh.get(hovered.mesh) : undefined;
  if (grabbed && event.button === 0) {
    setPointer(event);
    raycaster.setFromCamera(pointer, planView ? planCamera : perspCamera);
    const hit = floorUnderPointer();
    if (hit) {
      select(grabbed);
      dragging = {
        placement: grabbed,
        offsetX: grabbed.placed.x - hit.x,
        offsetZ: grabbed.placed.z - hit.z,
      };
      orbit.enabled = false;
      planControls.enabled = false;
      clearHover();
      return;
    }
  }

  orbiting = true;
  clearHover();
});
window.addEventListener('pointerup', (event) => {
  if (dragging) {
    dragging = null;
    orbit.enabled = !planView;
    planControls.enabled = planView;
    pressed = null;
    return;
  }
  orbiting = false;
  // Only a press that barely moved counts as a click; anything more was a drag
  // of the camera and must not operate a door.
  if (pressed) {
    const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    if (moved < 5) {
      if (drawing && event.target === renderer.domElement) {
        setPointer(event as PointerEvent);
        raycaster.setFromCamera(pointer, planView ? planCamera : perspCamera);
        const hit = floorUnderPointer();
        if (hit) {
          travelPath.addPoint(hit.x, hit.z);
          refreshPathUi();
        }
      } else if (pressed.target?.activate) pressed.target.activate();
      else if (!pressed.target) select(null);
    }
  }
  pressed = null;
  if (event.target === renderer.domElement) updateHover(event as PointerEvent);
});
renderer.domElement.addEventListener('pointerleave', clearHover);

// ------------------------------------------------------------------ resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  perspCamera.aspect = window.innerWidth / window.innerHeight;
  perspCamera.updateProjectionMatrix();
  fitPlanCamera();
});

// -------------------------------------------------------------------- loop
const cameraWorldPos = new THREE.Vector3();
const clock = new THREE.Clock();
refreshPathUi();

renderer.setAnimationLoop(() => {
  // Clamped so a backgrounded tab does not teleport anything on the next frame.
  const dt = Math.min(0.1, clock.getDelta());
  driveSelected(dt);
  advancePlayback(dt);
  const camera = planView ? planCamera : perspCamera;
  (planView ? planControls : orbit).update();
  for (const door of building.doors) door.tick();
  camera.getWorldPosition(cameraWorldPos);
  updatePanelFades(building.fadePanels, cameraWorldPos);
  renderer.render(scene, camera);
});
