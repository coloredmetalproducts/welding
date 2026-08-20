import * as THREE from 'three';
import type { BuildingSpec, WallId } from './types';
import { resolveOpening, wallFrames, wallGeometry, type ResolvedOpening } from './walls';
import { makeManDoor, makeOverheadDoor, type DoorBuild, type DoorControl } from './doors';
import { makeDoorMarkers } from './doorMarkers';

/** A surface that fades out when the camera moves to its outside. */
export interface FadePanel {
  materials: THREE.Material[];
  outwardNormal: THREE.Vector3;
  point: THREE.Vector3;
}

export interface BuildingModel {
  group: THREE.Group;
  fadePanels: FadePanel[];
  doors: DoorControl[];
  /** Door leaf/jamb groups, hidden in plan view so floor symbols read cleanly. */
  doorGroups: THREE.Group[];
  openings: ResolvedOpening[];
  /** World position just outside each opening, for placing labels. */
  openingAnchors: Map<string, THREE.Vector3>;
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

/** Outline edges stay opaque when a panel fades, so the shell always reads. */
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
    new THREE.Float32BufferAttribute([a, b, c, d].flatMap((v) => [v.x, v.y, v.z]), 3),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

export function buildBuilding(spec: BuildingSpec): BuildingModel {
  const { length: L, width: W, eaveHeight: eave, ridgeHeight: ridge } = spec;
  const group = new THREE.Group();
  const fadePanels: FadePanel[] = [];
  const doors: DoorControl[] = [];
  const doorGroups: THREE.Group[] = [];
  const allOpenings: ResolvedOpening[] = [];
  const openingAnchors = new Map<string, THREE.Vector3>();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const addFading = (
    geometry: THREE.BufferGeometry,
    color: number,
    outwardNormal: THREE.Vector3,
    point: THREE.Vector3,
  ) => {
    const material = panelMaterial(color);
    group.add(new THREE.Mesh(geometry, material));
    group.add(edgesFor(geometry));
    fadePanels.push({
      materials: [material],
      outwardNormal: outwardNormal.clone().normalize(),
      point,
    });
  };

  // Slab: top surface at y=0.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(L, 0.5, W),
    new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.95 }),
  );
  slab.position.set(L / 2, -0.25, W / 2);
  slab.receiveShadow = true;
  group.add(slab);

  // Walls, each punched with the openings assigned to it.
  const frames = wallFrames(spec);
  for (const id of Object.keys(frames) as WallId[]) {
    const frame = frames[id];
    const openings = spec.openings
      .filter((op) => op.wall === id)
      .map((op) => resolveOpening(op, frame));
    allOpenings.push(...openings);

    const midHeight = (id === 'leftEnd' || id === 'rightEnd' ? (eave + ridge) / 2 : eave) / 2;
    const wallCenter = new THREE.Vector3(frame.span / 2, midHeight, 0).applyMatrix4(
      frame.matrix,
    );
    addFading(
      wallGeometry(spec, frame, openings),
      WALL_COLOR,
      frame.outward,
      wallCenter,
    );

    for (const op of openings) {
      const built: DoorBuild =
        op.kind === 'overhead' ? makeOverheadDoor(op, frame) : makeManDoor(op, frame);
      group.add(built.group);
      doors.push(built.control);
      doorGroups.push(built.group);

      // Doors deliberately stay opaque while their wall ghosts out: looking in
      // from outside, the openings are exactly what we're here to review.
      const center = new THREE.Vector3((op.uStart + op.uEnd) / 2, op.height / 2, 0)
        .applyMatrix4(frame.matrix);

      group.add(makeDoorMarkers(op, frame));
      openingAnchors.set(
        op.id,
        center.clone().addScaledVector(frame.outward, 13).setY(op.height + 4),
      );
    }
  }

  // Roof panes from each eave up to the ridge (ridge runs along X at z = W/2).
  const rise = ridge - eave;
  addFading(
    quadGeometry(v(0, eave, 0), v(L, eave, 0), v(L, ridge, W / 2), v(0, ridge, W / 2)),
    ROOF_COLOR,
    v(0, W / 2, -rise),
    v(L / 2, (eave + ridge) / 2, W / 4),
  );
  addFading(
    quadGeometry(v(0, ridge, W / 2), v(L, ridge, W / 2), v(L, eave, W), v(0, eave, W)),
    ROOF_COLOR,
    v(0, W / 2, rise),
    v(L / 2, (eave + ridge) / 2, (3 * W) / 4),
  );

  return { group, fadePanels, doors, doorGroups, openings: allOpenings, openingAnchors };
}

/**
 * Fade any panel whose outside faces the camera, so the interior is always
 * visible while the far walls keep the sense of enclosure.
 */
export function updatePanelFades(
  fadePanels: FadePanel[],
  cameraPosition: THREE.Vector3,
): void {
  const toCamera = new THREE.Vector3();
  for (const panel of fadePanels) {
    toCamera.subVectors(cameraPosition, panel.point);
    const outside = toCamera.dot(panel.outwardNormal) > 0;
    const target = outside ? 0.05 : 1;
    for (const material of panel.materials) {
      const next = material.opacity + (target - material.opacity) * 0.18;
      material.opacity = Math.abs(next - target) < 0.01 ? target : next;
      material.depthWrite = material.opacity > 0.5;
    }
  }
}
