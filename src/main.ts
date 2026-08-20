import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import buildingData from '../data/building.json';
import { buildBuilding, updatePanelFades } from './building';
import { makeFloorGrid } from './grid';
import { makeTextSprite } from './labels';
import type { BuildingSpec } from './types';

const spec: BuildingSpec = buildingData;
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

// Surrounding ground (slab top sits at y=0, slab is 6" thick).
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

// Footprint dimension labels just outside the slab, on both sides.
for (const z of [-7, W + 7]) {
  const label = makeTextSprite(`${L}'-0"`, 5);
  label.position.set(L / 2, 0.1, z);
  scene.add(label);
}
for (const x of [-9, L + 9]) {
  const label = makeTextSprite(`${W}'-0"`, 5);
  label.position.set(x, 0.1, W / 2);
  scene.add(label);
}

// ----------------------------------------------------------------- cameras
const perspCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.5,
  2000,
);
perspCamera.position.set(L / 2 - 30, 70, W + 75);

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
planControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
planControls.enabled = false;

function fitPlanCamera(): void {
  const margin = 18;
  const extentW = L + margin * 2;
  const extentH = W + margin * 2;
  const aspect = window.innerWidth / window.innerHeight;
  let halfW = extentW / 2;
  let halfH = extentH / 2;
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
  hint.innerHTML = on
    ? 'Drag: pan &middot; Scroll: zoom'
    : 'Left-drag: orbit &middot; Right-drag: pan<br />Scroll: zoom';
}
viewToggle.addEventListener('click', () => setPlanView(!planView));
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) setPlanView(!planView);
});

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
  camera.getWorldPosition(cameraWorldPos);
  updatePanelFades(building.fadePanels, cameraWorldPos);
  renderer.render(scene, camera);
});
