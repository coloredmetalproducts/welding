import * as THREE from 'three';
import type { BuildingSpec } from './types';

/** A wall/roof panel that auto-fades when the camera is on its outside. */
export interface FadePanel {
  material: THREE.MeshStandardMaterial;
  outwardNormal: THREE.Vector3;
  point: THREE.Vector3;
}

export interface BuildingModel {
  group: THREE.Group;
  fadePanels: FadePanel[];
}

const WALL_COLOR = 0xe3e8ec;
const ROOF_COLOR = 0xb6bfc7;
const SLAB_COLOR = 0xcfceca;
const EDGE_COLOR = 0x46525d;

function panelMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    metalness: 0.1,
    roughness: 0.8,
  });
}

/** Outline edges stay opaque even when their panel fades, so the shell always reads. */
function edgesFor(geometry: THREE.BufferGeometry): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 20),
    new THREE.LineBasicMaterial({ color: EDGE_COLOR }),
  );
}

function quadGeometry(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [a, b, c, d].flatMap((v) => [v.x, v.y, v.z]),
      3,
    ),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

export function buildBuilding(spec: BuildingSpec): BuildingModel {
  const { length: L, width: W, eaveHeight: eave, ridgeHeight: ridge } = spec;
  const group = new THREE.Group();
  const fadePanels: FadePanel[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const addPanel = (
    geometry: THREE.BufferGeometry,
    color: number,
    outwardNormal: THREE.Vector3,
    point: THREE.Vector3,
  ) => {
    const material = panelMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    group.add(edgesFor(geometry));
    fadePanels.push({ material, outwardNormal: outwardNormal.normalize(), point });
  };

  // Slab: top surface at y=0.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(L, 0.5, W),
    new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.95 }),
  );
  slab.position.set(L / 2, -0.25, W / 2);
  slab.receiveShadow = true;
  group.add(slab);

  // Side walls along the length (z = 0 and z = W).
  addPanel(quadGeometry(v(0, 0, 0), v(L, 0, 0), v(L, eave, 0), v(0, eave, 0)), WALL_COLOR, v(0, 0, -1), v(L / 2, eave / 2, 0));
  addPanel(quadGeometry(v(0, 0, W), v(L, 0, W), v(L, eave, W), v(0, eave, W)), WALL_COLOR, v(0, 0, 1), v(L / 2, eave / 2, W));

  // Gable end walls (x = 0 and x = L): rectangle plus peak up to the ridge.
  for (const [x, nx] of [
    [0, -1],
    [L, 1],
  ] as const) {
    const geo = new THREE.BufferGeometry();
    const pts = [v(x, 0, 0), v(x, 0, W), v(x, eave, W), v(x, ridge, W / 2), v(x, eave, 0)];
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    geo.computeVertexNormals();
    addPanel(geo, WALL_COLOR, v(nx, 0, 0), v(x, eave / 2, W / 2));
  }

  // Roof panes from each eave up to the ridge (ridge runs along X at z = W/2).
  const rise = ridge - eave;
  addPanel(
    quadGeometry(v(0, eave, 0), v(L, eave, 0), v(L, ridge, W / 2), v(0, ridge, W / 2)),
    ROOF_COLOR,
    v(0, W / 2, -rise),
    v(L / 2, (eave + ridge) / 2, W / 4),
  );
  addPanel(
    quadGeometry(v(0, ridge, W / 2), v(L, ridge, W / 2), v(L, eave, W), v(0, eave, W)),
    ROOF_COLOR,
    v(0, W / 2, rise),
    v(L / 2, (eave + ridge) / 2, (3 * W) / 4),
  );

  return { group, fadePanels };
}

/**
 * Fade any panel whose outside faces the camera, so the interior is always
 * visible while the far walls keep the sense of enclosure.
 */
export function updatePanelFades(fadePanels: FadePanel[], cameraPosition: THREE.Vector3): void {
  const toCamera = new THREE.Vector3();
  for (const panel of fadePanels) {
    toCamera.subVectors(cameraPosition, panel.point);
    const outside = toCamera.dot(panel.outwardNormal) > 0;
    const target = outside ? 0.05 : 1;
    const opacity = panel.material.opacity + (target - panel.material.opacity) * 0.18;
    panel.material.opacity = Math.abs(opacity - target) < 0.01 ? target : opacity;
    panel.material.depthWrite = panel.material.opacity > 0.5;
  }
}
