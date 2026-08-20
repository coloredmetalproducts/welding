/** All dimensions in feet. X runs along the building length, Z along the width, Y up. */

/**
 * Wall identifiers. `front` is the z=0 long wall; `rear` is z=width.
 * `leftEnd` / `rightEnd` are the 48' gable ends, named as seen from outside
 * standing in front of the building.
 */
export type WallId = 'front' | 'rear' | 'leftEnd' | 'rightEnd';

/** Which corner an opening's offset is measured from, viewed from OUTSIDE that wall. */
export type CornerRef = 'left' | 'right';

export type OpeningKind = 'overhead' | 'man-double' | 'man-single';

export interface Opening {
  id: string;
  label: string;
  kind: OpeningKind;
  wall: WallId;
  /** Corner the offset is measured from, viewed from outside facing the wall. */
  fromCorner: CornerRef;
  /** Distance from that corner to the near edge of the opening. */
  offset: number;
  /** Total clear width of the opening. */
  width: number;
  /** Clear height of the opening. */
  height: number;
  /** Per-leaf width for man doors. */
  leafWidth?: number;
  swing?: 'in' | 'out';
}

export interface BuildingSpec {
  name: string;
  length: number;
  width: number;
  eaveHeight: number;
  ridgeHeight: number;
  openings: Opening[];
}
