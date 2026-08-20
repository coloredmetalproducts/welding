/** All dimensions in feet. X runs along the building length, Z along the width, Y up. */

/**
 * Wall identifiers. `front` is the z=0 long wall; `rear` is z=width.
 * `leftEnd` / `rightEnd` are the 48' gable ends, named as seen from outside
 * standing in front of the building - so `leftEnd` is the x=length wall.
 */
export type WallId = 'front' | 'rear' | 'leftEnd' | 'rightEnd';

/** Which corner an offset is measured from, viewed from OUTSIDE that wall. */
export type CornerRef = 'left' | 'right';

/** A building corner, named as seen from outside the front wall. */
export type CornerName = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

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

/**
 * Floor area that can't be used - a walled-off corner, a column enclosure.
 * Anchored to a corner and sized by its extent along each building axis.
 */
export interface Obstruction {
  id: string;
  label: string;
  note?: string;
  corner: CornerName;
  /** Extent measured off the end wall, along the 105' axis. */
  alongLength: number;
  /** Extent measured off the front or rear wall, along the 48' axis. */
  alongWidth: number;
}

/** An exterior ramp running down from the shop floor to a lower grade. */
export interface Ramp {
  id: string;
  label: string;
  note?: string;
  wall: WallId;
  fromCorner: CornerRef;
  /** Distance from that corner to the near edge of the ramp. */
  offset: number;
  width: number;
  /** Horizontal run measured on the floor - NOT the slope length. */
  run: number;
  /** Fall from shop-floor level to the low end of the ramp. */
  drop: number;
}

export interface BuildingSpec {
  name: string;
  length: number;
  width: number;
  eaveHeight: number;
  ridgeHeight: number;
  openings: Opening[];
  obstructions?: Obstruction[];
  ramps?: Ramp[];
}
