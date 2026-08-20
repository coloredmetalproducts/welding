import * as THREE from 'three';
import type { BuildingSpec, Opening } from './types';
import { roofHeightAt } from './geometry';
import { buildFootprint, wallSegments, type Footprint, type WallSegment } from './footprint';

/**
 * A wall's local coordinate system.
 *
 * `u` runs along the wall starting at its RIGHT corner as seen from outside,
 * `v` is up, and local +Z always points INTO the building. Storing offsets in
 * this frame lets openings be authored the way they're measured in the field
 * ("27' off the right corner") regardless of which wall they land on.
 */
export interface WallFrame {
  id: string;
  /** Length of the wall along u. */
  span: number;
  /** Outward-facing normal, for camera-side fading. */
  outward: THREE.Vector3;
  /** Transforms wall-local (u, v, inward) into world space. */
  matrix: THREE.Matrix4;
  /** World z at a point along the wall, which sets the roof height above it. */
  zAt(u: number): number;
}

export interface ResolvedOpening extends Opening {
  /** Near edge of the opening in wall-local u. */
  uStart: number;
  /** Far edge of the opening in wall-local u. */
  uEnd: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function makeFrame(segment: WallSegment): WallFrame {
  const uDir = new THREE.Vector3(
    (segment.end.x - segment.start.x) / segment.span,
    0,
    (segment.end.y - segment.start.y) / segment.span,
  );
  // uDir x UP is the inward normal for a counter-clockwise perimeter.
  const inward = new THREE.Vector3().crossVectors(uDir, UP);
  const matrix = new THREE.Matrix4()
    .makeBasis(uDir, UP, inward)
    .setPosition(segment.start.x, 0, segment.start.y);
  const z0 = segment.start.y;
  const z1 = segment.end.y;
  return {
    id: segment.id,
    span: segment.span,
    outward: segment.outward,
    matrix,
    zAt: (u) => z0 + ((z1 - z0) * u) / segment.span,
  };
}

export function wallFrames(spec: BuildingSpec, footprint?: Footprint): WallFrame[] {
  const fp = footprint ?? buildFootprint(spec);
  return wallSegments(spec, fp).map(makeFrame);
}

/** Look up a wall by id, for openings and ramps that name one. */
export function findWall(frames: WallFrame[], id: string): WallFrame | undefined {
  return frames.find((frame) => frame.id === id);
}

/** Convert an opening's corner-relative offset into wall-local u coordinates. */
export function resolveOpening(opening: Opening, frame: WallFrame): ResolvedOpening {
  const uStart =
    opening.fromCorner === 'right'
      ? opening.offset
      : frame.span - opening.offset - opening.width;
  return { ...opening, uStart, uEnd: uStart + opening.width };
}

/**
 * Outline of a wall in local (u, v), counter-clockwise. The top follows the
 * underside of the roof, which gives flat tops to walls running along the ridge
 * and gable peaks to those crossing it.
 */
export function wallOutline(spec: BuildingSpec, frame: WallFrame): THREE.Vector2[] {
  const topAt = (u: number) => roofHeightAt(spec, frame.zAt(u));
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(frame.span, 0),
    new THREE.Vector2(frame.span, topAt(frame.span)),
  ];

  // Insert the peak where the wall crosses the ridge line.
  const ridgeZ = spec.width / 2;
  const z0 = frame.zAt(0);
  const z1 = frame.zAt(frame.span);
  if ((z0 - ridgeZ) * (z1 - ridgeZ) < 0) {
    pts.push(new THREE.Vector2((frame.span * (ridgeZ - z0)) / (z1 - z0), spec.ridgeHeight));
  }

  pts.push(new THREE.Vector2(0, topAt(0)));
  return pts;
}

/** Wall face geometry in world space, with each opening punched out as a hole. */
export function wallGeometry(
  spec: BuildingSpec,
  frame: WallFrame,
  openings: ResolvedOpening[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape(wallOutline(spec, frame));
  for (const op of openings) {
    const sill = op.sill ?? 0;
    const head = sill + op.height;
    const hole = new THREE.Path();
    hole.moveTo(op.uStart, sill);
    hole.lineTo(op.uEnd, sill);
    hole.lineTo(op.uEnd, head);
    hole.lineTo(op.uStart, head);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.applyMatrix4(frame.matrix);
  return geo;
}
