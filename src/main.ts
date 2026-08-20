import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import buildingData from '../data/building.json';
import { buildBuilding, updatePanelFades } from './building';
import { makeFloorGrid } from './grid';
import { makeTextSprite } from './labels';
import type { BuildingSpec } from './types';

// JSON widens string literals, so the spec shape is asserted at the boundary.
const spec = buildingData as unknown as BuildingSpec;
const { length: L, width: W } = spec;
const center = new THREE.Vector3(L / 2, 0, W / 2);

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

// Surrounding ground (slab top sits at y=0, slab is 6" thick). The ramp is
// internal - the neighbouring building shares our grade - so this stays flat.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshStandardMaterial({ color: 0x9aa08d, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(center.x, -0.5, center.z);
ground.receiveShadow = true;
scene.add(ground);

const building = buildBuilding(spec);
scene.add(building.group);
scene.add(makeFloorGrid(L, W));

// ------------------------------------------------------------------ labels
// Footprint dimensions on all four sides.
for (const z of [-4, W + 7]) {
  const label = makeTextSprite(`${L}'-0"`, 5);
  label.position.set(L / 2, 0.1, z);
  scene.add(label);
}
for (const x of [-9, L + 9]) {
  const label = makeTextSprite(`${W}'-0"`, 5);
  label.position.set(x, 0.1, W / 2);
  scene.add(label);
}

// Orientation aids: opening offsets are measured from a corner "as seen from
// outside", so name the front wall and its corners to make that checkable.
const frontLabel = makeTextSprite('FRONT WALL', 5, '#2c6e9e');
frontLabel.position.set(L / 2, 0.1, -30);
scene.add(frontLabel);
const rightCorner = makeTextSprite('RIGHT\nCORNER', 3, '#2c6e9e');
rightCorner.position.set(9, 0.1, -22);
scene.add(rightCorner);
const leftCorner = makeTextSprite('LEFT\nCORNER', 3, '#2c6e9e');
leftCorner.position.set(L - 9, 0.1, -22);
scene.add(leftCorner);

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
planCamera.position.set(center.x, 200, center.z);
planCamera.up.set(0, 0, -1);
planCamera.lookAt(center);

const planControls = new OrbitControls(planCamera, renderer.domElement);
planControls.target.copy(center);
planControls.enableRotate = false;
planControls.screenSpacePanning = true;
planControls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
planControls.enabled = false;

function fitPlanCamera(): void {
  const margin = 34;
  const aspect = window.innerWidth / window.innerHeight;
  let halfW = (L + margin * 2) / 2;
  let halfH = (W + margin * 2) / 2;
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

// ------------------------------------------------------------- door toggles
const doorList = document.getElementById('doorList')!;
for (const door of building.doors) {
  const button = document.createElement('button');
  const render = () => {
    button.textContent = `${door.label}: ${door.isOpen() ? 'open' : 'closed'}`;
    button.classList.toggle('active', door.isOpen());
  };
  button.addEventListener('click', () => {
    door.toggle();
    render();
  });
  render();
  doorList.appendChild(button);
}

// ----------------------------------------------------------- hover tooltip
// Door dimensions stay out of the way until asked for: hovering an opening
// (in either view) reveals its size and the corner it was measured from.
const tooltip = document.getElementById('tooltip')!;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hoverMeshes = building.hoverTargets.map((target) => target.mesh);

let hovered: (typeof building.hoverTargets)[number] | null = null;
let dragging = false;

function clearHover(): void {
  hovered?.setHighlight(false);
  hovered = null;
  tooltip.style.display = 'none';
}

function updateHover(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
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
    return;
  }

  tooltip.innerHTML = [
    `<strong>${target.title}</strong>`,
    ...target.lines,
    ...(target.note ? [`<span class="muted">${target.note}</span>`] : []),
  ].join('<br />');
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
  if (dragging) return;
  updateHover(event);
});
renderer.domElement.addEventListener('pointerdown', () => {
  dragging = true;
  clearHover();
});
window.addEventListener('pointerup', () => {
  dragging = false;
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
renderer.setAnimationLoop(() => {
  const camera = planView ? planCamera : perspCamera;
  (planView ? planControls : orbit).update();
  for (const door of building.doors) door.tick();
  camera.getWorldPosition(cameraWorldPos);
  updatePanelFades(building.fadePanels, cameraWorldPos);
  renderer.render(scene, camera);
});
