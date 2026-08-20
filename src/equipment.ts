import * as THREE from 'three';
import type { CatalogItem, PlacedItem } from './types';
import type { SiteQuery } from './building';

/**
 * A placed machine, plus the floor area it needs to work. The clearance
 * envelope projects off each end of the feed axis, which is what actually
 * decides whether long stock can run through where the machine is standing.
 */

const OUTLINE_COLOR = 0x2f3d47;
const ENVELOPE_OK = 0x3f7d68;
const ENVELOPE_BAD = 0xc2452f;
const SELECTED_COLOR = 0xf0a03c;
const BODY_BAD = 0xb04a34;
const SAMPLE_STEP = 1.5;

export interface Placement {
  group: THREE.Group;
  hoverMesh: THREE.Mesh;
  catalog: CatalogItem;
  placed: PlacedItem;
  setPosition(x: number, z: number): void;
  setRotation(degrees: number): void;
  setSelected(on: boolean): void;
  setHighlight(on: boolean): void;
  /** Re-test against the building and recolour. Returns what is wrong, if anything. */
  check(): string[];
}

/** Points covering a rectangle, including its edges, for testing floor coverage. */
function sampleRect(halfX: number, halfZ: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const steps = (half: number) => {
    const n = Math.max(1, Math.ceil((half * 2) / SAMPLE_STEP));
    return Array.from({ length: n + 1 }, (_, i) => -half + (half * 2 * i) / n);
  };
  for (const x of steps(halfX)) {
    for (const z of steps(halfZ)) points.push([x, z]);
  }
  return points;
}

/**
 * Rough massing for a vertical tilt-frame saw: a table running the length of
 * the machine with the frame standing over it. Enough to read as the right
 * machine at the right size; it is not a model of the casting.
 */
function machineBody(item: CatalogItem): THREE.Group {
  const group = new THREE.Group();
  const color = new THREE.Color(item.color);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(item.length, item.height * 0.38, item.width),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25 }),
  );
  base.position.y = (item.height * 0.38) / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const headHeight = item.height * 0.62;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(item.length * 0.34, headHeight, item.width),
    new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.82),
      roughness: 0.55,
      metalness: 0.3,
    }),
  );
  head.position.set(-item.length * 0.22, item.height * 0.38 + headHeight / 2, 0);
  head.castShadow = true;
  group.add(head);

  for (const mesh of [base, head]) {
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateX(mesh.position.x).translateY(mesh.position.y),
    );
  }
  return group;
}

export function buildPlacement(
  catalog: CatalogItem,
  placed: PlacedItem,
  site: SiteQuery,
): Placement {
  const group = new THREE.Group();
  const body = machineBody(catalog);
  group.add(body);

  const bodyMaterials: THREE.MeshStandardMaterial[] = [];
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) bodyMaterials.push(mesh.material as THREE.MeshStandardMaterial);
  });
  const bodyColors = bodyMaterials.map((m) => m.color.getHex());

  // Working envelope: the footprint stretched along the feed axis by the
  // clearance at each end.
  const reach = catalog.clearance?.eachEnd ?? 0;
  const halfL = (catalog.length + reach * 2) / 2;
  const halfW = catalog.width / 2;
  const envelopeMaterial = new THREE.LineDashedMaterial({
    color: ENVELOPE_OK,
    dashSize: 1.1,
    gapSize: 0.7,
  });
  let envelope: THREE.Line | undefined;
  if (reach > 0) {
    const corners = [
      new THREE.Vector3(-halfL, 0.09, -halfW),
      new THREE.Vector3(halfL, 0.09, -halfW),
      new THREE.Vector3(halfL, 0.09, halfW),
      new THREE.Vector3(-halfL, 0.09, halfW),
    ];
    envelope = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]),
      envelopeMaterial,
    );
    envelope.computeLineDistances();
    group.add(envelope);
  }

  // Footprint outline, so the machine's own extent stays readable in plan.
  const footprintMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  group.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-catalog.length / 2, 0.11, -halfW),
        new THREE.Vector3(catalog.length / 2, 0.11, -halfW),
        new THREE.Vector3(catalog.length / 2, 0.11, halfW),
        new THREE.Vector3(-catalog.length / 2, 0.11, halfW),
      ]),
      footprintMaterial,
    ),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(catalog.length, catalog.height, catalog.width),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.y = catalog.height / 2;
  group.add(hoverMesh);

  const bodySamples = sampleRect(catalog.length / 2, catalog.width / 2);
  const envelopeSamples = reach > 0 ? sampleRect(halfL, halfW) : [];
  const world = new THREE.Vector3();

  const apply = () => {
    group.position.set(placed.x, 0, placed.z);
    group.rotation.y = THREE.MathUtils.degToRad(placed.rotation);
    group.updateMatrixWorld(true);
  };

  const check = (): string[] => {
    apply();
    const problems: string[] = [];
    let outside = false;
    let blocked = false;
    let lowHeadroom = Infinity;
    let sloped = false;

    for (const [u, v] of bodySamples) {
      world.set(u, 0, v).applyMatrix4(group.matrixWorld);
      if (!site.isInside(world.x, world.z)) outside = true;
      if (site.isBlocked(world.x, world.z)) blocked = true;
      if (site.isSloped(world.x, world.z)) sloped = true;
      lowHeadroom = Math.min(lowHeadroom, site.headroomAt(world.x, world.z));
    }
    if (outside) problems.push('Sticks out past the building');
    if (blocked) problems.push('Overlaps unusable floor');
    if (sloped) problems.push('Standing on the ramp');
    if (lowHeadroom < catalog.height) {
      problems.push(
        `Needs ${catalog.height.toFixed(1)}' but only ${lowHeadroom.toFixed(1)}' of headroom`,
      );
    }

    let envelopeClear = true;
    for (const [u, v] of envelopeSamples) {
      world.set(u, 0, v).applyMatrix4(group.matrixWorld);
      if (!site.isInside(world.x, world.z) || site.isBlocked(world.x, world.z)) {
        envelopeClear = false;
        break;
      }
    }
    if (reach > 0 && !envelopeClear) {
      problems.push(`Working clearance doesn't fit — ${catalog.clearance?.label ?? ''}`);
    }

    envelopeMaterial.color.setHex(envelopeClear ? ENVELOPE_OK : ENVELOPE_BAD);
    const bad = outside || blocked || lowHeadroom < catalog.height;
    bodyMaterials.forEach((material, i) => {
      material.color.setHex(bad ? BODY_BAD : bodyColors[i]);
    });
    return problems;
  };

  check();

  return {
    group,
    hoverMesh,
    catalog,
    placed,
    setPosition(x, z) {
      placed.x = x;
      placed.z = z;
      check();
    },
    setRotation(degrees) {
      placed.rotation = ((degrees % 360) + 360) % 360;
      check();
    },
    setSelected(on) {
      footprintMaterial.color.setHex(on ? SELECTED_COLOR : OUTLINE_COLOR);
      for (const material of bodyMaterials) {
        material.emissive.setHex(on ? 0x3a2a10 : 0x000000);
      }
    },
    setHighlight(on) {
      for (const material of bodyMaterials) {
        material.emissiveIntensity = on ? 1.4 : 1;
      }
    },
    check,
  };
}
