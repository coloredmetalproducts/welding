import * as THREE from 'three';
import type { BuildingSpec, CornerName } from './types';
import { resolveCornerRect, type PlanPoint, type Rect } from './geometry';

/**
 * The building is a rectangle with optional corner bites taken out of it, so
 * its footprint is a polygon rather than a box. That polygon drives the slab,
 * the roof panes, the grid, and the wall segments, keeping them consistent.
 */

export interface Footprint {
  /** Perimeter in counter-clockwise order viewed from above. */
  points: PlanPoint[];
  /** The rectangles removed from the envelope. */
  cuts: Rect[];
  /** Usable floor area in square feet. */
  area: number;
}

export function resolveCuts(spec: BuildingSpec): Rect[] {
  return (spec.cutouts ?? []).map((cut) =>
    resolveCornerRect(spec, cut.corner, 0, 0, cut.alongLength, cut.alongWidth),
  );
}

/**
 * Each corner contributes one point, or three if a bite is taken out of it.
 * The replacements are written out per corner rather than derived, because the
 * traversal direction differs at each one and being explicit is easier to check.
 */
function cornerPoints(
  spec: BuildingSpec,
  corner: CornerName,
  cut: { alongLength: number; alongWidth: number } | undefined,
): Array<[number, number]> {
  const { length: L, width: W } = spec;
  if (!cut) {
    return {
      frontRight: [[0, 0]],
      frontLeft: [[L, 0]],
      rearLeft: [[L, W]],
      rearRight: [[0, W]],
    }[corner] as Array<[number, number]>;
  }
  const { alongLength: aL, alongWidth: aW } = cut;
  switch (corner) {
    case 'frontRight':
      return [[0, aW], [aL, aW], [aL, 0]];
    case 'frontLeft':
      return [[L - aL, 0], [L - aL, aW], [L, aW]];
    case 'rearLeft':
      return [[L, W - aW], [L - aL, W - aW], [L - aL, W]];
    case 'rearRight':
      return [[aL, W], [aL, W - aW], [0, W - aW]];
  }
}

export function buildFootprint(spec: BuildingSpec): Footprint {
  const order: CornerName[] = ['frontRight', 'frontLeft', 'rearLeft', 'rearRight'];
  const points: PlanPoint[] = [];
  for (const corner of order) {
    const cut = (spec.cutouts ?? []).find((c) => c.corner === corner);
    for (const [x, z] of cornerPoints(spec, corner, cut)) {
      points.push(new THREE.Vector2(x, z));
    }
  }
  const cuts = resolveCuts(spec);
  const cutArea = cuts.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  return { points, cuts, area: spec.length * spec.width - cutArea };
}

export interface WallSegment {
  /** 'front' | 'rear' | 'leftEnd' | 'rightEnd' for the envelope walls, or a
   *  generated id for a wall created by a corner bite. */
  id: string;
  /** Start of the wall: its RIGHT corner as seen from outside. */
  start: PlanPoint;
  end: PlanPoint;
  span: number;
  outward: THREE.Vector3;
}

/**
 * One segment per perimeter edge.
 *
 * For a counter-clockwise plan polygon the outward normal of edge A->B is
 * (dz, -dx), and "right as seen from outside" always lands on A - so the wall
 * frames can take A as their origin and A->B as their u direction uniformly.
 */
export function wallSegments(spec: BuildingSpec, footprint: Footprint): WallSegment[] {
  const { length: L, width: W } = spec;
  const segments: WallSegment[] = [];
  const pts = footprint.points;
  let generated = 0;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const span = Math.hypot(dx, dz);
    if (span < 1e-9) continue;
    const outward = new THREE.Vector3(dz, 0, -dx).normalize();

    // Name the envelope walls; anything at an interior coordinate is a wall the
    // corner bite created.
    let id: string;
    if (outward.z < -0.5 && a.y === 0) id = 'front';
    else if (outward.z > 0.5 && a.y === W) id = 'rear';
    else if (outward.x > 0.5 && a.x === L) id = 'leftEnd';
    else if (outward.x < -0.5 && a.x === 0) id = 'rightEnd';
    else id = `inner-${++generated}`;

    segments.push({ id, start: a, end: b, span, outward });
  }
  return segments;
}
