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
  /** Move and turn in one go, for driving and path playback. */
  setPose(x: number, z: number, degrees: number): void;
  setSelected(on: boolean): void;
  setHighlight(on: boolean): void;
  /** Re-test against the building and recolour. Returns what is wrong, if anything. */
  check(): string[];
}

/** Points covering a box, including its edges, for testing floor coverage. */
function sampleBox(x0: number, x1: number, z0: number, z1: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const steps = (a: number, b: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / SAMPLE_STEP));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  for (const x of steps(x0, x1)) {
    for (const z of steps(z0, z1)) points.push([x, z]);
  }
  return points;
}

/** Footprint resolved onto the feed axis: local X runs the way material travels. */
export function feedFootprint(item: CatalogItem): { along: number; across: number } {
  return item.feedAxis === 'width'
    ? { along: item.width, across: item.length }
    : { along: item.length, across: item.width };
}

/**
 * Rough massing: a table with the machine's bulk standing to one side of the
 * material path, which is how a vertical tilt-frame saw sits. Enough to read as
 * the right machine at the right size; it is not a model of the casting.
 */
function machineBody(item: CatalogItem): THREE.Group {
  const { along, across } = feedFootprint(item);
  const group = new THREE.Group();
  const color = new THREE.Color(item.color);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(along, item.height * 0.38, across),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25 }),
  );
  base.position.y = (item.height * 0.38) / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // The column and wheels sit off to one side so the material path stays open.
  const headHeight = item.height * 0.62;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(along, headHeight, across * 0.42),
    new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.82),
      roughness: 0.55,
      metalness: 0.3,
    }),
  );
  head.position.set(0, item.height * 0.38 + headHeight / 2, across * 0.27);
  head.castShadow = true;
  group.add(head);

  for (const mesh of [base, head]) {
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateY(mesh.position.y).translateZ(mesh.position.z),
    );
  }
  return group;
}

/**
 * Forklift massing, built along the travel axis with the forks at +X: counter-
 * weight body, mast, forks and overhead guard. The proportions matter more than
 * the detail - what's being planned is the room it needs to move.
 */
function forkliftBody(item: CatalogItem): THREE.Group {
  const { along, across } = feedFootprint(item);
  const group = new THREE.Group();
  const color = new THREE.Color(item.color);
  const steel = new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.5, metalness: 0.5 });
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });

  const forkLength = Math.min(4, along * 0.34);
  const bodyLength = along - forkLength;
  const bodyCentre = -along / 2 + bodyLength / 2;

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateX(x).translateY(y).translateZ(z),
    );
    return mesh;
  };

  add(
    new THREE.BoxGeometry(bodyLength, item.height * 0.42, across),
    paint,
    bodyCentre,
    item.height * 0.21,
  );
  add(
    new THREE.BoxGeometry(0.7, item.height, across * 0.8),
    steel,
    bodyCentre + bodyLength / 2,
    item.height / 2,
  );
  for (const side of [-1, 1]) {
    add(
      new THREE.BoxGeometry(forkLength, 0.2, 0.5),
      steel,
      along / 2 - forkLength / 2,
      0.15,
      side * across * 0.27,
    );
  }
  add(
    new THREE.BoxGeometry(bodyLength * 0.75, 0.25, across),
    steel,
    bodyCentre,
    item.height - 0.15,
  );

  // The operator. Outlines are skipped here - edge lines look wrong on a person.
  const smooth = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    mesh.castShadow = true;
    group.add(mesh);
  };
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b189, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0xb4501f, roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3d6f8c, roughness: 0.85 });
  const seatX = bodyCentre - bodyLength * 0.04;
  const seatY = item.height * 0.42;

  smooth(new THREE.CylinderGeometry(0.42, 0.52, 1.5, 12), shirt, seatX, seatY + 0.75);
  smooth(new THREE.SphereGeometry(0.42, 16, 12), skin, seatX, seatY + 1.86);
  smooth(
    new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    hair,
    seatX - 0.04,
    seatY + 1.9,
  );
  // Cigarette, lit end forward.
  smooth(
    new THREE.CylinderGeometry(0.045, 0.045, 0.52, 8).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.9 }),
    seatX + 0.62,
    seatY + 1.78,
  );
  smooth(
    new THREE.CylinderGeometry(0.05, 0.05, 0.09, 8).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd8541f, emissive: 0xc23a10 }),
    seatX + 0.9,
    seatY + 1.78,
  );
  const smoke = new THREE.MeshStandardMaterial({
    color: 0xdfe3e6,
    transparent: true,
    opacity: 0.42,
    roughness: 1,
  });
  for (const [dx, dy, r] of [[1.05, 2.1, 0.13], [1.2, 2.5, 0.19], [1.32, 2.95, 0.25]] as const) {
    smooth(new THREE.SphereGeometry(r, 10, 8), smoke, seatX + dx, seatY + dy);
  }
  return group;
}

/**
 * Cantilever rack: columns along the feed axis with arms cantilevered off them,
 * and the stored stock drawn on the arms so its overhang past the frame reads.
 */
function rackBody(item: CatalogItem): THREE.Group {
  const { along, across } = feedFootprint(item);
  const bays = Math.max(1, item.rack?.bays ?? 4);
  const levels = Math.max(1, item.rack?.levels ?? 3);
  const stockLength = item.rack?.stockLength;

  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    roughness: 0.6,
    metalness: 0.35,
  });
  const stockMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d939a,
    roughness: 0.5,
    metalness: 0.6,
  });

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateX(x).translateY(y).translateZ(z),
    );
  };

  // Columns stand at the back so the arms cantilever into the aisle.
  const columnZ = across / 2 - 0.25;
  const baySpacing = along / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -along / 2 + i * baySpacing;
    add(new THREE.BoxGeometry(0.4, item.height, 0.4), steel, x, item.height / 2, columnZ);
    add(new THREE.BoxGeometry(0.55, 0.3, across), steel, x, 0.15, 0);
    for (let level = 1; level <= levels; level++) {
      const y = (item.height / levels) * level;
      add(new THREE.BoxGeometry(0.3, 0.28, across * 0.88), steel, x, y, -0.1);
    }
  }

  // Stock lying on the arms, running past the frame at both ends.
  if (stockLength) {
    for (let level = 1; level <= levels; level++) {
      const y = (item.height / levels) * level + 0.34;
      add(new THREE.BoxGeometry(stockLength, 0.4, across * 0.5), stockMaterial, 0, y, -0.3);
    }
  }
  return group;
}

/**
 * Manual box-and-pan brake. The frame runs wider than the bend length because
 * the counterweights hang off each end, so the end frames are drawn outboard of
 * the working span rather than the whole thing being one block.
 */
function brakeBody(item: CatalogItem): THREE.Group {
  const { along, across } = feedFootprint(item);
  const work = Math.min(item.workingLength ?? across, across);
  const endZone = Math.max(0.4, (across - work) / 2);
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    roughness: 0.6,
    metalness: 0.3,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x6d7178,
    roughness: 0.5,
    metalness: 0.55,
  });

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateX(x).translateY(y).translateZ(z),
    );
    return mesh;
  };

  const bedHeight = item.height * 0.68;

  // End frames, outboard of the bend length, carrying the counterweights.
  for (const sz of [-1, 1]) {
    const zEnd = sz * (across / 2 - endZone / 2);
    add(new THREE.BoxGeometry(along * 0.85, item.height, endZone * 0.85), paint, 0, item.height / 2, zEnd);
    // Counterweight on its arm, swung back behind the frame.
    add(
      new THREE.BoxGeometry(along * 0.5, 0.22, 0.22),
      steel,
      -along * 0.34,
      item.height * 0.52,
      zEnd,
    );
    add(
      new THREE.CylinderGeometry(0.42, 0.42, 0.45, 14).rotateX(Math.PI / 2),
      steel,
      -along * 0.55,
      item.height * 0.52,
      zEnd,
    );
  }

  // Bed, clamping bar with the fingers, and the bending apron at the front.
  add(new THREE.BoxGeometry(along * 0.8, 0.28, work), paint, 0, bedHeight, 0);
  add(new THREE.BoxGeometry(along * 0.34, 0.42, work), steel, -along * 0.18, bedHeight + 0.35, 0);
  add(new THREE.BoxGeometry(along * 0.28, 0.3, work), steel, along * 0.3, bedHeight + 0.05, 0);
  // Operating handles at each end of the apron.
  for (const sz of [-1, 1]) {
    add(
      new THREE.BoxGeometry(along * 0.7, 0.18, 0.18),
      steel,
      along * 0.45,
      bedHeight + 0.5,
      sz * work * 0.46,
    );
  }
  return group;
}

/**
 * Guillotine shear: a deep housing carrying the blade beam, a low support table
 * running out to the operator side, and the control pendant on its own stand.
 * Massed to read like the machine in plan and elevation, not to detail it.
 */
function shearBody(item: CatalogItem): THREE.Group {
  const { along, across } = feedFootprint(item);
  const group = new THREE.Group();
  const housing = new THREE.MeshStandardMaterial({
    color: new THREE.Color(item.color),
    roughness: 0.5,
    metalness: 0.2,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x565c64, roughness: 0.6, metalness: 0.4 });
  const beam = new THREE.MeshStandardMaterial({ color: 0x2f7cc4, roughness: 0.45, metalness: 0.3 });

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    group.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
      ).translateX(x).translateY(y).translateZ(z),
    );
  };

  const bodyDepth = along * 0.6;
  const bodyX = -along / 2 + bodyDepth / 2;
  const bedHeight = item.height * 0.45;

  add(new THREE.BoxGeometry(bodyDepth, bedHeight, across), dark, bodyX, bedHeight / 2);
  add(
    new THREE.BoxGeometry(bodyDepth, item.height - bedHeight, across),
    housing,
    bodyX,
    bedHeight + (item.height - bedHeight) / 2,
  );
  // Blade beam across the front face of the housing.
  add(
    new THREE.BoxGeometry(0.3, 0.55, across * 0.97),
    beam,
    bodyX + bodyDepth / 2 + 0.1,
    bedHeight + 0.32,
  );
  // Support table running out to the operator.
  const tableDepth = along - bodyDepth;
  add(
    new THREE.BoxGeometry(tableDepth, 0.18, across),
    dark,
    along / 2 - tableDepth / 2,
    bedHeight,
  );
  for (const sz of [-0.66, 0, 0.66]) {
    add(
      new THREE.BoxGeometry(0.22, bedHeight, 0.22),
      dark,
      along / 2 - 0.4,
      bedHeight / 2,
      sz * across * 0.5,
    );
  }
  // Control pendant on its stand, at the operator's side.
  const pendantZ = across / 2 - 0.6;
  add(
    new THREE.BoxGeometry(0.22, item.height * 0.6, 0.22),
    dark,
    along / 2 - 0.9,
    item.height * 0.3,
    pendantZ,
  );
  add(
    new THREE.BoxGeometry(0.35, item.height * 0.3, 0.8),
    housing,
    along / 2 - 0.9,
    item.height * 0.72,
    pendantZ,
  );
  return group;
}

export function buildPlacement(
  catalog: CatalogItem,
  placed: PlacedItem,
  site: SiteQuery,
): Placement {
  const group = new THREE.Group();
  const body =
    catalog.shape === 'forklift'
      ? forkliftBody(catalog)
      : catalog.shape === 'rack'
        ? rackBody(catalog)
        : catalog.shape === 'brake'
          ? brakeBody(catalog)
          : catalog.shape === 'shear'
            ? shearBody(catalog)
            : machineBody(catalog);
  group.add(body);

  const bodyMaterials: THREE.MeshStandardMaterial[] = [];
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) bodyMaterials.push(mesh.material as THREE.MeshStandardMaterial);
  });
  const bodyColors = bodyMaterials.map((m) => m.color.getHex());

  // Working envelope: the footprint stretched along the feed axis by the
  // clearance at each end.
  const feed = feedFootprint(catalog);
  // Clearance can be lopsided: a shear wants room to load and little behind.
  const reachIn = catalog.clearance?.infeed ?? catalog.clearance?.eachEnd ?? 0;
  const reachOut = catalog.clearance?.outfeed ?? catalog.clearance?.eachEnd ?? 0;
  const envX0 = -feed.along / 2 - reachIn;
  const envX1 = feed.along / 2 + reachOut;
  const halfW = feed.across / 2;
  const hasClearance = reachIn > 0 || reachOut > 0;
  const envelopeMaterial = new THREE.LineDashedMaterial({
    color: ENVELOPE_OK,
    dashSize: 1.1,
    gapSize: 0.7,
  });
  let envelope: THREE.Line | undefined;
  if (hasClearance) {
    const corners = [
      new THREE.Vector3(envX0, 0.09, -halfW),
      new THREE.Vector3(envX1, 0.09, -halfW),
      new THREE.Vector3(envX1, 0.09, halfW),
      new THREE.Vector3(envX0, 0.09, halfW),
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
        new THREE.Vector3(-feed.along / 2, 0.11, -halfW),
        new THREE.Vector3(feed.along / 2, 0.11, -halfW),
        new THREE.Vector3(feed.along / 2, 0.11, halfW),
        new THREE.Vector3(-feed.along / 2, 0.11, halfW),
      ]),
      footprintMaterial,
    ),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(feed.along, catalog.height, feed.across),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.y = catalog.height / 2;
  group.add(hoverMesh);

  const bodySamples = sampleBox(-feed.along / 2, feed.along / 2, -halfW, halfW);
  const envelopeSamples = hasClearance ? sampleBox(envX0, envX1, -halfW, halfW) : [];
  const world = new THREE.Vector3();

  const apply = () => {
    // Sit on whatever surface is underneath, so machines on the dock and the
    // forklift on a ramp both land at the right height.
    group.position.set(
      placed.x,
      site.surfaceHeightAt(placed.x, placed.z),
      placed.z,
    );
    group.rotation.order = 'YXZ';
    const yaw = THREE.MathUtils.degToRad(placed.rotation);
    group.rotation.y = yaw;
    if (catalog.mobility === 'driven') {
      // Pitch to the slope under the wheelbase, so driving a ramp looks like it.
      const fx = Math.cos(yaw);
      const fz = -Math.sin(yaw);
      const half = feed.along / 2;
      const ahead = site.surfaceHeightAt(placed.x + fx * half, placed.z + fz * half);
      const behind = site.surfaceHeightAt(placed.x - fx * half, placed.z - fz * half);
      group.rotation.z = Math.atan2(ahead - behind, feed.along);
    }
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
    // A forklift is meant to leave the building and climb ramps; a machine is not.
    const driven = catalog.mobility === 'driven';
    if (outside && !driven) problems.push('Sticks out past the building');
    if (blocked) problems.push('Overlaps unusable floor');
    if (sloped && !driven) problems.push('Standing on the ramp');
    if (lowHeadroom < catalog.height) {
      problems.push(
        `Needs ${catalog.height.toFixed(1)}' but only ${lowHeadroom.toFixed(1)}' of headroom`,
      );
    }

    let envelopeClear = true;
    void sloped;
    for (const [u, v] of envelopeSamples) {
      world.set(u, 0, v).applyMatrix4(group.matrixWorld);
      if (!site.isInside(world.x, world.z) || site.isBlocked(world.x, world.z)) {
        envelopeClear = false;
        break;
      }
    }
    if (hasClearance && !envelopeClear) {
      problems.push(`Working clearance doesn't fit — ${catalog.clearance?.label ?? ''}`);
    }

    envelopeMaterial.color.setHex(envelopeClear ? ENVELOPE_OK : ENVELOPE_BAD);
    const bad = (outside && !driven) || blocked || lowHeadroom < catalog.height;
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
    setPose(x, z, degrees) {
      placed.x = x;
      placed.z = z;
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
