import * as THREE from 'three';
import type { SiteQuery } from './building';

/**
 * A travel path drawn on the floor. Waypoints are 2D; the line is drawn at the
 * surface height so it climbs the ramps with everything else, and playback
 * samples it by distance so speed stays constant through corners.
 */

const LINE_COLOR = 0x2c6e9e;
const NODE_COLOR = 0xf0a03c;

export interface PathSample {
  x: number;
  z: number;
  /** Yaw in radians that points a machine's local +X down the path. */
  heading: number;
}

export interface TravelPath {
  group: THREE.Group;
  addPoint(x: number, z: number): void;
  removeLast(): void;
  clear(): void;
  count(): number;
  totalLength(): number;
  sample(distance: number): PathSample | null;
}

/** Yaw that points local +X along (dx, dz): rotating +X by yaw gives (cos, 0, -sin). */
export function headingFor(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

export function createTravelPath(site: SiteQuery): TravelPath {
  const points: Array<{ x: number; z: number }> = [];
  const group = new THREE.Group();

  const lineMaterial = new THREE.LineDashedMaterial({
    color: LINE_COLOR,
    dashSize: 1.4,
    gapSize: 0.8,
    depthTest: false,
  });
  let line: THREE.Line | undefined;
  const nodes = new THREE.Group();
  group.add(nodes);
  group.renderOrder = 6;

  const nodeGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16);
  const nodeMaterial = new THREE.MeshBasicMaterial({ color: NODE_COLOR, depthTest: false });

  const rebuild = () => {
    if (line) {
      group.remove(line);
      line.geometry.dispose();
      line = undefined;
    }
    nodes.clear();
    for (const point of points) {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.set(point.x, site.surfaceHeightAt(point.x, point.z) + 0.16, point.z);
      node.renderOrder = 7;
      nodes.add(node);
    }
    if (points.length < 2) return;
    // Subdivide so the line follows the surface up ramps instead of cutting
    // straight through them.
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        vertices.push(new THREE.Vector3(x, site.surfaceHeightAt(x, z) + 0.14, z));
      }
    }
    const last = points[points.length - 1];
    vertices.push(
      new THREE.Vector3(last.x, site.surfaceHeightAt(last.x, last.z) + 0.14, last.z),
    );
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), lineMaterial);
    line.computeLineDistances();
    line.renderOrder = 6;
    group.add(line);
  };

  const segmentLengths = () =>
    points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.z - points[i].z));

  return {
    group,
    addPoint(x, z) {
      points.push({ x, z });
      rebuild();
    },
    removeLast() {
      points.pop();
      rebuild();
    },
    clear() {
      points.length = 0;
      rebuild();
    },
    count: () => points.length,
    totalLength: () => segmentLengths().reduce((sum, n) => sum + n, 0),
    sample(distance) {
      if (points.length < 2) return null;
      const lengths = segmentLengths();
      let remaining = Math.max(0, distance);
      for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
          const a = points[i];
          const b = points[i + 1];
          const t = lengths[i] === 0 ? 0 : Math.min(1, remaining / lengths[i]);
          return {
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
            heading: headingFor(b.x - a.x, b.z - a.z),
          };
        }
        remaining -= lengths[i];
      }
      return null;
    },
  };
}
