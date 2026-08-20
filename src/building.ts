import * as THREE from 'three';
import type { BuildingSpec } from './types';
import {
  resolveOpening,
  wallFrames,
  wallGeometry,
  type ResolvedOpening,
  type WallFrame,
} from './walls';
import {
  makeManDoor,
  makeOpeningFrame,
  makeOverheadDoor,
  type DoorBuild,
  type DoorControl,
} from './doors';
import { makeDoorAnnotations } from './doorMarkers';
import { buildObstruction } from './obstructions';
import { buildRamp } from './ramp';
import { buildFootprint, type Footprint } from './footprint';
import { clipPolygonByZ, roofHeightAt, type PlanPoint, type Rect } from './geometry';
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
  blockedFootprints: Rect[];
  /** Sloped floor - drivable, but nothing should be set down on it. */
  rampFootprints: Rect[];
  hoverTargets: HoverTarget[];
  footprint: Footprint;
  walls: WallFrame[];
}

const WALL_COLOR = 0xe3e8ec;
const ROOF_COLOR = 0xb6bfc7;
const SLAB_COLOR = 0xcfceca;
const EDGE_COLOR = 0x46525d;
const SLAB_DEPTH = 0.5;

const WALL_NAMES: Record<string, string> = {
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

/** Invisible volume used purely as a raycast target for hover callouts. */
function hoverProxy(width: number, height: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
}

/** Extrude the plan polygon downward into a slab whose top sits at y=0. */
function slabGeometry(points: PlanPoint[]): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: SLAB_DEPTH,
    bevelEnabled: false,
  });
  // Shape-local (x, y, z) -> world (x, -z, y): plan y carries world z, and the
  // extrusion runs downward.
  geo.applyMatrix4(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    ),
  );
  return geo;
}

/**
 * One roof pane from a plan polygon, lifted so every vertex sits on the
 * underside of the gable. The polygon must not cross the ridge, or the pane
 * would cut through it instead of folding.
 */
function roofPane(spec: BuildingSpec, points: PlanPoint[]): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(points));
  const position = geo.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getY(i);
    position.setXYZ(i, x, roofHeightAt(spec, z), z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildBuilding(spec: BuildingSpec): BuildingModel {
  const { width: W, eaveHeight: eave, ridgeHeight: ridge } = spec;
  const group = new THREE.Group();
  const fadePanels: FadePanel[] = [];
  const doors: DoorControl[] = [];
  const planHiddenGroups: THREE.Object3D[] = [];
  const allOpenings: ResolvedOpening[] = [];
  const blockedFootprints: Rect[] = [];
  const rampFootprints: Rect[] = [];
  const hoverTargets: HoverTarget[] = [];

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

  const footprint = buildFootprint(spec);

  const slab = new THREE.Mesh(
    slabGeometry(footprint.points),
    new THREE.MeshStandardMaterial({ color: SLAB_COLOR, roughness: 0.95 }),
  );
  slab.receiveShadow = true;
  group.add(slab);

  // Walls, each punched with the openings assigned to it.
  const walls = wallFrames(spec, footprint);
  for (const frame of walls) {
    const openings = spec.openings
      .filter((op) => op.wall === frame.id)
      .map((op) => resolveOpening(op, frame));
    allOpenings.push(...openings);

    const midHeight = roofHeightAt(spec, frame.zAt(frame.span / 2)) / 2;
    const wallCenter = new THREE.Vector3(frame.span / 2, midHeight, 0).applyMatrix4(
      frame.matrix,
    );
    addFading(wallGeometry(spec, frame, openings), WALL_COLOR, frame.outward, wallCenter);

    for (const op of openings) {
      const sill = op.sill ?? 0;

      if (op.kind === 'open') {
        // A plain pass-through: framed, but with no leaf to operate.
        group.add(makeOpeningFrame(op, frame));
      } else {
        // Doors deliberately stay opaque while their wall ghosts out: looking in
        // from outside, the openings are exactly what we're here to review.
        const built: DoorBuild =
          op.kind === 'overhead' ? makeOverheadDoor(op, frame) : makeManDoor(op, frame);
        group.add(built.group);
        doors.push(built.control);
        planHiddenGroups.push(built.group);
      }

      const annotations = makeDoorAnnotations(op, frame);
      group.add(annotations.group);

      // The proxy has real depth so it can also be hit from straight above in
      // plan view, where the wall itself is edge-on.
      const proxyHolder = new THREE.Group();
      const proxy = hoverProxy(op.width, op.height, 4);
      proxy.position.set((op.uStart + op.uEnd) / 2, sill + op.height / 2, 0);
      proxyHolder.add(proxy);
      proxyHolder.applyMatrix4(frame.matrix);
      group.add(proxyHolder);

      hoverTargets.push({
        mesh: proxy,
        title: op.label,
        lines: [
          `${formatFeet(op.width)} W × ${formatFeet(op.height)} H clear`,
          ...(sill > 0.1 ? [`Sill ${formatFeet(sill)} above the slab`] : []),
          `${formatFeet(op.offset)} off the ${op.fromCorner} corner`,
        ],
        note: `${WALL_NAMES[op.wall] ?? op.wall} · measured from outside`,
        setHighlight: annotations.setHighlight,
      });
    }
  }

  // Walled-off areas inside the shop. Solid in 3D, hatched floor patch in plan.
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
        ob.height === undefined ? 'Full height to the roof' : `${formatFeet(ob.height)} tall`,
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

  // Roof: the footprint split at the ridge, each half lifted onto the gable.
  const ridgeZ = W / 2;
  const rise = ridge - eave;
  for (const [keepBelow, normal] of [
    [true, new THREE.Vector3(0, ridgeZ, -rise)],
    [false, new THREE.Vector3(0, ridgeZ, rise)],
  ] as const) {
    const half = clipPolygonByZ(footprint.points, ridgeZ, keepBelow);
    if (half.length < 3) continue;
    const centerZ = half.reduce((sum, p) => sum + p.y, 0) / half.length;
    const centerX = half.reduce((sum, p) => sum + p.x, 0) / half.length;
    addFading(
      roofPane(spec, half),
      ROOF_COLOR,
      normal,
      new THREE.Vector3(centerX, roofHeightAt(spec, centerZ), centerZ),
    );
  }

  return {
    group,
    fadePanels,
    doors,
    planHiddenGroups,
    openings: allOpenings,
    blockedFootprints,
    rampFootprints,
    hoverTargets,
    footprint,
    walls,
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
