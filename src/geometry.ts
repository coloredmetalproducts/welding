import * as THREE from 'three';
import type { BuildingSpec, CornerName } from './types';

/** An axis-aligned rectangle of floor, in world feet. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Plan-space points are Vector2(x, z) - the `y` field carries the world Z.
 * Keeping plan work in 2D lets the same polygon drive the slab, roof and grid.
 */
export type PlanPoint = THREE.Vector2;

/** Underside of the gable roof at a given z. The ridge runs along X. */
export function roofHeightAt(spec: BuildingSpec, z: number): number {
  const half = spec.width / 2;
  const t = z <= half ? z / half : (spec.width - z) / half;
  return spec.eaveHeight + (spec.ridgeHeight - spec.eaveHeight) * t;
}

/**
 * Rectangle positioned from a named corner: offsets run inboard from that
 * corner, then the extents continue in the same direction. Left/right are as
 * seen from outside the front wall, so `left` is x=length.
 */
export function resolveCornerRect(
  spec: BuildingSpec,
  corner: CornerName,
  offsetLength: number,
  offsetWidth: number,
  alongLength: number,
  alongWidth: number,
): Rect {
  const onLeft = corner === 'rearLeft' || corner === 'frontLeft';
  const onRear = corner === 'rearLeft' || corner === 'rearRight';
  const span = (wallAt: number, inward: -1 | 1, offset: number, extent: number) => {
    const a = wallAt + inward * offset;
    const b = a + inward * extent;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  const [x0, x1] = span(onLeft ? spec.length : 0, onLeft ? -1 : 1, offsetLength, alongLength);
  const [z0, z1] = span(onRear ? spec.width : 0, onRear ? -1 : 1, offsetWidth, alongWidth);
  return { x0, x1, z0, z1 };
}

/** Drop points that repeat the one before them, including across the wrap. */
function dedupe(points: PlanPoint[]): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.distanceToSquared(p) > 1e-12) out.push(p);
  }
  while (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < 1e-12) out.pop();
  return out;
}

/**
 * Sutherland-Hodgman clip of a plan polygon against a half-plane in z, used to
 * split the footprint at the ridge so each roof pane is a single flat surface.
 */
export function clipPolygonByZ(
  points: PlanPoint[],
  z: number,
  keepBelow: boolean,
): PlanPoint[] {
  const inside = (p: PlanPoint) => (keepBelow ? p.y <= z + 1e-9 : p.y >= z - 1e-9);
  const out: PlanPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (inside(a)) out.push(a.clone());
    if (inside(a) !== inside(b)) {
      const t = (z - a.y) / (b.y - a.y);
      out.push(new THREE.Vector2(a.x + (b.x - a.x) * t, z));
    }
  }
  return dedupe(out);
}

/** Subtract a set of intervals from [from, to], returning what survives. */
export function subtractIntervals(
  from: number,
  to: number,
  holes: Array<readonly [number, number]>,
): Array<[number, number]> {
  let spans: Array<[number, number]> = [[from, to]];
  for (const [h0, h1] of holes) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of spans) {
      if (h1 <= s0 || h0 >= s1) {
        next.push([s0, s1]);
        continue;
      }
      if (h0 > s0) next.push([s0, h0]);
      if (h1 < s1) next.push([h1, s1]);
    }
    spans = next;
  }
  return spans;
}
