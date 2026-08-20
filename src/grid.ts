import * as THREE from 'three';
import { subtractIntervals, type Rect } from './geometry';

/**
 * 1' grid with 5' major lines, clipped to the footprint so it stops at any
 * corner bite rather than running out over ground that isn't the building.
 */
export function makeFloorGrid(length: number, width: number, cuts: Rect[] = []): THREE.Group {
  const group = new THREE.Group();
  const minor: number[] = [];
  const major: number[] = [];

  for (let x = 0; x <= length; x++) {
    const holes = cuts
      .filter((c) => x > c.x0 && x < c.x1)
      .map((c) => [c.z0, c.z1] as const);
    for (const [z0, z1] of subtractIntervals(0, width, holes)) {
      (x % 5 === 0 ? major : minor).push(x, 0, z0, x, 0, z1);
    }
  }
  for (let z = 0; z <= width; z++) {
    const holes = cuts
      .filter((c) => z > c.z0 && z < c.z1)
      .map((c) => [c.x0, c.x1] as const);
    for (const [x0, x1] of subtractIntervals(0, length, holes)) {
      (z % 5 === 0 ? major : minor).push(x0, 0, z, x1, 0, z);
    }
  }

  const makeLines = (positions: number[], color: number, opacity: number, y: number) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    lines.position.y = y;
    return lines;
  };

  group.add(makeLines(minor, 0xa9b2ba, 0.35, 0.02));
  group.add(makeLines(major, 0x7d8792, 0.6, 0.03));
  return group;
}
