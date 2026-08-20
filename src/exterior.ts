import * as THREE from 'three';
import type { BuildingSpec, ExteriorWork } from './types';
import { gradeDropAt, type Rect } from './geometry';
import { findWall, wallFrames } from './walls';

/**
 * Concrete outside the wall. A dock and a ramp are the same wedge: the far edge
 * matches the near edge for a flat slab, and drops below it for a ramp.
 */

const CONCRETE_COLOR = 0xc4c2bc;
const OUTLINE_COLOR = 0x6d7278;
const HIGHLIGHT_COLOR = 0xf0a03c;

export interface ExteriorBuild {
  group: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  footprint: Rect;
  /** Fall from the near edge to the far edge, negative when it drops. */
  fall: number;
  gradePercent: number;
  /** Surface height at a point, for anything driving over it. */
  heightAt(x: number, z: number): number;
}

export function buildExteriorWork(spec: BuildingSpec, work: ExteriorWork): ExteriorBuild {
  const frame = findWall(wallFrames(spec), work.wall);
  if (!frame) throw new Error(`Exterior work ${work.id} names unknown wall ${work.wall}`);
  const uStart =
    work.fromCorner === 'right' ? work.offset : frame.span - work.offset - work.width;
  const uEnd = uStart + work.width;

  // World extent, which also gives the grade to sit the underside on.
  const corners = [
    new THREE.Vector3(uStart, 0, 0),
    new THREE.Vector3(uEnd, 0, -work.depth),
  ].map((p) => p.applyMatrix4(frame.matrix));
  const footprint: Rect = {
    x0: Math.min(corners[0].x, corners[1].x),
    x1: Math.max(corners[0].x, corners[1].x),
    z0: Math.min(corners[0].z, corners[1].z),
    z1: Math.max(corners[0].z, corners[1].z),
  };
  const base = -gradeDropAt(
    spec,
    (footprint.x0 + footprint.x1) / 2,
    (footprint.z0 + footprint.z1) / 2,
  );

  // Cross-section in (outward, height), wound counter-clockwise. A ramp's far
  // edge coincides with the base, so drop the duplicate point.
  const raw = [
    new THREE.Vector2(0, base),
    new THREE.Vector2(work.depth, base),
    new THREE.Vector2(work.depth, work.topAtFar),
    new THREE.Vector2(0, work.topAtWall),
  ];
  const section: THREE.Vector2[] = [];
  for (const p of raw) {
    const last = section[section.length - 1];
    if (!last || last.distanceToSquared(p) > 1e-9) section.push(p);
  }

  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(section), {
    depth: work.width,
    bevelEnabled: false,
  });
  // Section-local (x, y, z) -> wall-local (uStart + z, y, -x): the section runs
  // outward from the wall and the extrusion sweeps along it.
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
  const material = new THREE.MeshStandardMaterial({
    color: CONCRETE_COLOR,
    roughness: 0.95,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), outlineMaterial));

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(work.width, Math.max(0.5, work.topAtWall - base), work.depth),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set(
    (uStart + uEnd) / 2,
    (work.topAtWall + base) / 2,
    -work.depth / 2,
  );
  group.add(hoverMesh);

  group.applyMatrix4(frame.matrix);

  const fall = work.topAtFar - work.topAtWall;
  const toLocal = frame.matrix.clone().invert();
  const probe = new THREE.Vector3();

  return {
    group,
    hoverMesh,
    footprint,
    fall,
    heightAt(x, z) {
      // The slab runs outward from the wall, which is negative wall-local z.
      probe.set(x, 0, z).applyMatrix4(toLocal);
      const t = Math.max(0, Math.min(1, -probe.z / work.depth));
      return work.topAtWall + fall * t;
    },
    gradePercent: work.depth > 0 ? (Math.abs(fall) / work.depth) * 100 : 0,
    setHighlight(on: boolean) {
      outlineMaterial.color.setHex(on ? HIGHLIGHT_COLOR : OUTLINE_COLOR);
      material.emissive.setHex(on ? 0x4a3410 : 0x000000);
    },
  };
}
