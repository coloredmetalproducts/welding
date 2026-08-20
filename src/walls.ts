import * as THREE from 'three';
import type { BuildingSpec, Opening, WallId } from './types';

/**
 * A wall's local coordinate system.
 *
 * `u` runs along the wall starting at its RIGHT corner as seen from outside,
 * `v` is up, and local +Z always points INTO the building. Storing offsets in
 * this frame lets openings be authored the way they're measured in the field
 * ("27' off the right corner") regardless of which wall they land on.
 */
export interface WallFrame {
  id: WallId;
  /** Length of the wall along u. */
  span: number;
  /** Outward-facing normal, for camera-side fading. */
  outward: THREE.Vector3;
  /** Transforms wall-local (u, v, inward) into world space. */
  matrix: THREE.Matrix4;
}

export interface ResolvedOpening extends Opening {
  /** Near edge of the opening in wall-local u. */
  uStart: number;
  /** Far edge of the opening in wall-local u. */
  uEnd: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function makeFrame(
  id: WallId,
  origin: THREE.Vector3,
  uDir: THREE.Vector3,
  outward: THREE.Vector3,
  span: number,
): WallFrame {
  // uDir x UP always yields the inward normal for these four walls.
  const inward = new THREE.Vector3().crossVectors(uDir, UP);
  const matrix = new THREE.Matrix4().makeBasis(uDir, UP, inward).setPosition(origin);
  return { id, span, outward, matrix };
}

export function wallFrames(spec: BuildingSpec): Record<WallId, WallFrame> {
  const { length: L, width: W } = spec;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    front: makeFrame('front', v(0, 0, 0), v(1, 0, 0), v(0, 0, -1), L),
    rear: makeFrame('rear', v(L, 0, W), v(-1, 0, 0), v(0, 0, 1), L),
    leftEnd: makeFrame('leftEnd', v(0, 0, W), v(0, 0, -1), v(-1, 0, 0), W),
    rightEnd: makeFrame('rightEnd', v(L, 0, 0), v(0, 0, 1), v(1, 0, 0), W),
  };
}

/** Convert an opening's corner-relative offset into wall-local u coordinates. */
export function resolveOpening(opening: Opening, frame: WallFrame): ResolvedOpening {
  const uStart =
    opening.fromCorner === 'right'
      ? opening.offset
      : frame.span - opening.offset - opening.width;
  return { ...opening, uStart, uEnd: uStart + opening.width };
}

/** Outline of a wall in local (u, v), counter-clockwise. Gable ends carry the peak. */
export function wallOutline(spec: BuildingSpec, frame: WallFrame): THREE.Vector2[] {
  const { eaveHeight: eave, ridgeHeight: ridge } = spec;
  const isGableEnd = frame.id === 'leftEnd' || frame.id === 'rightEnd';
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(frame.span, 0),
    new THREE.Vector2(frame.span, eave),
  ];
  if (isGableEnd) pts.push(new THREE.Vector2(frame.span / 2, ridge));
  pts.push(new THREE.Vector2(0, eave));
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
    const hole = new THREE.Path();
    hole.moveTo(op.uStart, 0);
    hole.lineTo(op.uEnd, 0);
    hole.lineTo(op.uEnd, op.height);
    hole.lineTo(op.uStart, op.height);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.applyMatrix4(frame.matrix);
  return geo;
}
