/** All dimensions in feet. X runs along the building length, Z along the width, Y up. */

/**
 * Wall identifiers. `front` is the z=0 long wall; `rear` is z=width.
 * `leftEnd` / `rightEnd` are the gable ends, named as seen from outside
 * standing in front of the building - so `leftEnd` is the x=length wall.
 */
export type WallId = 'front' | 'rear' | 'leftEnd' | 'rightEnd';

/** Which corner an offset is measured from, viewed from OUTSIDE that wall. */
export type CornerRef = 'left' | 'right';

/** A building corner, named as seen from outside the front wall. */
export type CornerName = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export type OpeningKind = 'overhead' | 'man-double' | 'man-single' | 'open';

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
  /** Clear height of the opening, measured up from its sill. */
  height: number;
  /** Height of the sill above the slab. Defaults to 0 (floor level). */
  sill?: number;
  /** Per-leaf width for man doors. */
  leafWidth?: number;
  swing?: 'in' | 'out';
}

/**
 * A corner bite taken out of the rectangular envelope - floor that isn't part
 * of the building at all, so the walls and roof stop short of it.
 */
export interface Cutout {
  id: string;
  label: string;
  note?: string;
  corner: CornerName;
  /** Extent along the length axis, measured off the end wall. */
  alongLength: number;
  /** Extent along the width axis, measured off the front or rear wall. */
  alongWidth: number;
}

/**
 * Floor area that can't be used - a walled-off corner, a column enclosure.
 * Positioned from a named corner by an offset along each building axis, so
 * areas that sit behind another one can still be measured off the same corner.
 */
export interface Obstruction {
  id: string;
  label: string;
  note?: string;
  corner: CornerName;
  /** Gap between the end wall and the near edge, along the length axis. Default 0. */
  offsetLength?: number;
  /** Gap between the front/rear wall and the near edge, along the width axis. Default 0. */
  offsetWidth?: number;
  /** Extent along the length axis. */
  alongLength: number;
  /** Extent along the width axis. */
  alongWidth: number;
  /** Flat top at this height. Omit to run all the way up to the roof. */
  height?: number;
}

/**
 * A ramp running INTO the shop from an opening in one wall: highest at the
 * wall, falling to floor level `run` feet inboard. The adjacent building's
 * floor sits `rise` above ours.
 */
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
  /** Height of the deck where it meets the wall, falling to 0 at the inboard end. */
  rise: number;
}

export interface BuildingSpec {
  name: string;
  /** Overall envelope, before any corner cutouts. */
  length: number;
  width: number;
  eaveHeight: number;
  ridgeHeight: number;
  cutouts?: Cutout[];
  openings: Opening[];
  obstructions?: Obstruction[];
  ramps?: Ramp[];
}
