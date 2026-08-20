import * as THREE from 'three';

/** 1' grid with 5' major lines covering the slab. */
export function makeFloorGrid(length: number, width: number): THREE.Group {
  const group = new THREE.Group();
  const minor: number[] = [];
  const major: number[] = [];

  for (let x = 0; x <= length; x++) {
    (x % 5 === 0 ? major : minor).push(x, 0, 0, x, 0, width);
  }
  for (let z = 0; z <= width; z++) {
    (z % 5 === 0 ? major : minor).push(0, 0, z, length, 0, z);
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
