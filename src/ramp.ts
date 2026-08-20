import * as THREE from 'three';
import type { BuildingSpec, Ramp } from './types';
import { wallFrames } from './walls';

/**
 * Exterior ramp falling from shop-floor level to a lower grade outside.
 * Built as a wedge in the wall's own frame so the same data works on any wall.
 */

const DECK_COLOR = 0xa8a49c;
const OUTLINE_COLOR = 0x6a7078;
const HIGHLIGHT_COLOR = 0xf0a03c;

export interface RampBuild {
  group: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  /** Rise over run as a percentage, for the callout. */
  gradePercent: number;
}

export function buildRamp(spec: BuildingSpec, ramp: Ramp): RampBuild {
  const frame = wallFrames(spec)[ramp.wall];
  const uStart =
    ramp.fromCorner === 'right'
      ? ramp.offset
      : frame.span - ramp.offset - ramp.width;

  // Cross-section in the wall's (outward, up) plane: a right triangle with the
  // deck falling from floor level at the wall to `drop` below it at `run` out.
  const section = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0, -ramp.drop),
    new THREE.Vector2(ramp.run, -ramp.drop),
  ]);
  const geometry = new THREE.ExtrudeGeometry(section, {
    depth: ramp.width,
    bevelEnabled: false,
  });
  // Section-local (x, y, z) -> wall-local (u, v, inward): the section runs
  // outward from the wall, so its x maps to -inward.
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(1, 0, 0),
      )
      .setPosition(uStart, 0, 0),
  );

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: DECK_COLOR, roughness: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  group.add(
    new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), outlineMaterial),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(ramp.width, ramp.drop, ramp.run),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set(uStart + ramp.width / 2, -ramp.drop / 2, -ramp.run / 2);
  group.add(hoverMesh);

  group.applyMatrix4(frame.matrix);

  return {
    group,
    hoverMesh,
    gradePercent: (ramp.drop / ramp.run) * 100,
    setHighlight(on: boolean) {
      outlineMaterial.color.setHex(on ? HIGHLIGHT_COLOR : OUTLINE_COLOR);
      material.emissive.setHex(on ? 0x4a3410 : 0x000000);
    },
  };
}
