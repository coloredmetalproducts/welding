import * as THREE from 'three';
import type { BuildingSpec, WallId } from './types';
import { resolveOpening, wallFrames, wallGeometry, type ResolvedOpening } from './walls';
import { makeManDoor, makeOverheadDoor, type DoorBuild, type DoorControl } from './doors';
import { makeDoorAnnotations } from './doorMarkers';
import { buildObstruction, type Footprint } from './obstructions';
import { buildRamp } from './ramp';
import { formatFeet } from './labels';

/** A surface that fades out when the camera moves to its outside. */
export interface FadePanel {
  materials: THREE.Material[];
  outwardNormal: THREE.Vector3;
  point: THREE.Vector3;
}

/** Anything the pointer can hover to reveal its dimensions on demand. */
export interface HoverTarget {
  /** Invisible proxy volume the raycaster tests against. */
  mesh: THREE.Mesh;
  title: string;
  lines: string[];
  note?: string;
  setHighlight(on: boolean): void;
}

export interface BuildingModel {
  group: THREE.Group;
  fadePanels: FadePanel[];
  doors: DoorControl[];
  /** Solid masses swapped for floor symbols in plan view. */
  planHiddenGroups: THREE.Object3D[];
  openings: ResolvedOpening[];
  /** Unusable floor areas, for placement checks later. */
  blockedFootprints: Footprint[];
  /** Sloped floor - drivable, but nothing should be set down on it. */
  rampFootprints: Footprint[];
  hoverTargets: HoverTarget[];
}

const WALL_COLOR = 0xe3e8ec;
const ROOF_COLOR = 0xb6bfc7;
const SLAB_COLOR = 0xcfceca;
const EDGE_COLOR = 0x46525d;

const WALL_NAMES: Record<WallId, string> = {
  front: 'front wall',
  rear: 'rear wall',
  leftEnd: 'left end wall',
  rightEnd: 'right end wall',
};

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

/** Invisible volume used purely as a raycast target for hover callouts. */
function hoverProxy(width: number, height: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
}

export function buildBuilding(spec: BuildingSpec): BuildingModel {
  const { length: L, width: W, eaveHeight: eave, ridgeHeight: ridge } = spec;
  const group = new THREE.Group();
  const fadePanels: FadePanel[] = [];
  const doors: DoorControl[] = [];
  const planHiddenGroups: THREE.Object3D[] = [];
  const allOpenings: ResolvedOpening[] = [];
  const blockedFootprints: Footprint[] = [];
  const rampFootprints: Footprint[] = [];
  const hoverTargets: HoverTarget[] = [];
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
  const slabDepth = 0.5;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(L, slabDepth, W),
    new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.95 }),
  );
  slab.position.set(L / 2, -slabDepth / 2, W / 2);
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
    addFading(wallGeometry(spec, frame, openings), WALL_COLOR, frame.outward, wallCenter);

    for (const op of openings) {
      // Doors deliberately stay opaque while their wall ghosts out: looking in
      // from outside, the openings are exactly what we're here to review.
      const built: DoorBuild =
        op.kind === 'overhead' ? makeOverheadDoor(op, frame) : makeManDoor(op, frame);
      group.add(built.group);
      doors.push(built.control);
      planHiddenGroups.push(built.group);

      const annotations = makeDoorAnnotations(op, frame);
      group.add(annotations.group);

      // The proxy has real depth so it can also be hit from straight above in
      // plan view, where the wall itself is edge-on.
      const proxyHolder = new THREE.Group();
      const proxy = hoverProxy(op.width, op.height, 4);
      proxy.position.set((op.uStart + op.uEnd) / 2, op.height / 2, 0);
      proxyHolder.add(proxy);
      proxyHolder.applyMatrix4(frame.matrix);
      group.add(proxyHolder);

      hoverTargets.push({
        mesh: proxy,
        title: op.label,
        lines: [
          `${formatFeet(op.width)} W × ${formatFeet(op.height)} H`,
          `${formatFeet(op.offset)} off the ${op.fromCorner} corner`,
        ],
        note: `${WALL_NAMES[op.wall]} · measured from outside`,
        setHighlight: annotations.setHighlight,
      });
    }
  }

  // Walled-off corners. Solid to the roof in 3D, hatched floor patch in plan.
  for (const ob of spec.obstructions ?? []) {
    const built = buildObstruction(spec, ob);
    group.add(built.solid, built.symbol, built.hoverMesh);
    planHiddenGroups.push(built.solid);
    blockedFootprints.push(built.footprint);
    hoverTargets.push({
      mesh: built.hoverMesh,
      title: ob.label,
      lines: [
        `${formatFeet(ob.alongLength)} × ${formatFeet(ob.alongWidth)} footprint`,
        `${ob.alongLength * ob.alongWidth} sq ft of floor lost`,
        'Full height to the roof',
      ],
      note: ob.note,
      setHighlight: built.setHighlight,
    });
  }

  // Ramps down into the shop from a neighbouring building at a higher floor.
  for (const ramp of spec.ramps ?? []) {
    const built = buildRamp(spec, ramp);
    group.add(built.group);
    rampFootprints.push(built.footprint);
    hoverTargets.push({
      mesh: built.hoverMesh,
      title: ramp.label,
      lines: [
        `${formatFeet(ramp.width)} wide · ${formatFeet(ramp.run)} run`,
        `${formatFeet(ramp.rise)} rise · ${built.gradePercent.toFixed(0)}% grade`,
        `${Math.round(ramp.width * ramp.run)} sq ft of sloped floor`,
      ],
      note: ramp.note,
      setHighlight: built.setHighlight,
    });
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

  return {
    group,
    fadePanels,
    doors,
    planHiddenGroups,
    openings: allOpenings,
    blockedFootprints,
    rampFootprints,
    hoverTargets,
  };
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
