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
  note?: string;
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

/**
 * A raised deck occupying part of the floor. Its footprint is the named
 * rectangle minus anything that isn't floor (envelope cutouts) and anything
 * that passes through it (obstructions), so the deck wraps around them.
 */
export interface Mezzanine {
  id: string;
  label: string;
  note?: string;
  corner: CornerName;
  offsetLength?: number;
  offsetWidth?: number;
  alongLength: number;
  alongWidth: number;
  /** Slab to the UNDERSIDE of the deck structure - the headroom below. */
  clearHeight: number;
  /** Thickness of the deck structure itself: joists plus sheathing. */
  deckDepth: number;
  /** Nominal spacing of the perimeter posts. */
  postSpacing?: number;
  /** Actual post dimension, e.g. 3.5/12 for a 4x4. */
  postSize?: number;
}

/** A machine or fixture that can be placed on the floor. */
export interface CatalogItem {
  id: string;
  label: string;
  note?: string;
  /** Footprint as the machine is normally described, not as it feeds. */
  width: number;
  length: number;
  height: number;
  /**
   * Which footprint dimension material travels along. Plenty of machines are
   * fed across their short side, so this can't be inferred from the shape.
   */
  feedAxis: 'width' | 'length';
  /** How to mass it in 3D. Defaults to a generic machine block. */
  shape?: 'machine' | 'forklift' | 'rack';
  /** Cantilever rack build-up. Bays run along the feed axis, levels up it. */
  rack?: {
    bays: number;
    levels: number;
    /** Stock length carried, so the overhang past the frame can be drawn. */
    stockLength?: number;
  };
  color: string;
  mobility: 'fixed' | 'rolling' | 'driven';
  /**
   * Working clearance the machine needs beyond its own footprint, projected
   * off each end of the feed axis - the room to run long stock through it.
   */
  clearance?: { eachEnd: number; label: string };
}

/** One placed instance of a catalog item. */
export interface PlacedItem {
  catalogId: string;
  /** Centre of the footprint, in world feet. */
  x: number;
  z: number;
  /** Rotation about vertical, in degrees. 0 runs the feed axis along X, the building's length. */
  rotation: number;
}

export interface Catalog {
  items: CatalogItem[];
}

export interface Layout {
  name: string;
  items: PlacedItem[];
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
  mezzanines?: Mezzanine[];
  exterior?: ExteriorWork[];
  /**
   * How far the slab sits above the exterior grade. The site slopes both ways:
   * `front` is a profile along the building length, because the grade falls
   * between the dock end and the bay door, and `rear` is a single value.
   */
  grade?: { front: GradePoint[]; rear: number };
  /** Gravel yard, in world feet. Everything else outside is dirt. */
  gravelYard?: { x0: number; x1: number; z0: number; z1: number };
}

/** Slab height above grade at a station along the building length. */
export interface GradePoint {
  x: number;
  drop: number;
}

/**
 * Concrete outside the wall: a flat dock, or a ramp down to grade. One shape
 * covers both - a wedge whose far edge equals its near edge is just a slab.
 */
export interface ExteriorWork {
  id: string;
  label: string;
  note?: string;
  kind: 'dock' | 'ramp';
  wall: WallId;
  fromCorner: CornerRef;
  offset: number;
  /** Extent along the wall. */
  width: number;
  /** How far it projects away from the wall. */
  depth: number;
  /** Surface height at the wall, relative to the slab (0 = level with it). */
  topAtWall: number;
  /** Surface height at the far edge. Equal to topAtWall for a flat dock. */
  topAtFar: number;
}
