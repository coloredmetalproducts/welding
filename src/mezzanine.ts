import * as THREE from 'three';
import type { BuildingSpec, Mezzanine } from './types';
import { resolveCornerRect, subtractIntervals, type PlanPoint, type Rect } from './geometry';
import { resolveCuts } from './footprint';
import { resolveFootprint } from './obstructions';

/**
 * The deck wraps whatever it can't sit on: envelope cutouts aren't floor at
 * all, and obstructions run past deck height and pass through it. Both are
 * subtracted from the named rectangle.
 */

const DECK_COLOR = 0xbfae90;
const POST_COLOR = 0x9d8c72;
const OUTLINE_COLOR = 0x7a6647;
const HIGHLIGHT_COLOR = 0xf0a03c;
const DEFAULT_POST_SPACING = 6;
const DEFAULT_POST_SIZE = 3.5 / 12;

export interface MezzanineBuild {
  /** Deck slab, hidden in plan view so the floor beneath stays readable. */
  deck: THREE.Group;
  /** Posts and the floor outline, which stay visible in plan. */
  supports: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  footprint: Rect;
  area: number;
  postCount: number;
}

/**
 * Slice the deck rectangle into bands in z, and in each band work out the
 * surviving x span. Every band here has a single span, which makes the outline
 * a staircase: up one side through the band edges, and back down the other.
 */
function deckOutline(
  spec: BuildingSpec,
  rect: Rect,
): { points: PlanPoint[]; area: number } {
  const removed = [
    ...resolveCuts(spec),
    ...(spec.obstructions ?? []).map((ob) => resolveFootprint(spec, ob)),
  ];

  const edges = new Set<number>([rect.z0, rect.z1]);
  for (const r of removed) {
    for (const z of [r.z0, r.z1]) if (z > rect.z0 && z < rect.z1) edges.add(z);
  }
  const zs = [...edges].sort((a, b) => a - b);

  const bands: Array<{ z0: number; z1: number; x0: number; x1: number }> = [];
  let area = 0;
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i];
    const z1 = zs[i + 1];
    const mid = (z0 + z1) / 2;
    const holes = removed
      .filter((r) => mid > r.z0 && mid < r.z1)
      .map((r) => [r.x0, r.x1] as const);
    for (const [x0, x1] of subtractIntervals(rect.x0, rect.x1, holes)) {
      bands.push({ z0, z1, x0, x1 });
      area += (x1 - x0) * (z1 - z0);
    }
  }

  // Trace the staircase: low side of every band going up, then the high side
  // coming back down.
  const points: PlanPoint[] = [];
  for (const band of bands) {
    points.push(new THREE.Vector2(band.x0, band.z0), new THREE.Vector2(band.x0, band.z1));
  }
  for (const band of [...bands].reverse()) {
    points.push(new THREE.Vector2(band.x1, band.z1), new THREE.Vector2(band.x1, band.z0));
  }

  // Drop the collinear duplicates the trace leaves behind.
  const cleaned: PlanPoint[] = [];
  for (const p of points) {
    const last = cleaned[cleaned.length - 1];
    if (!last || last.distanceToSquared(p) > 1e-12) cleaned.push(p);
  }
  return { points: cleaned, area };
}

export function buildMezzanine(spec: BuildingSpec, mez: Mezzanine): MezzanineBuild {
  const rect = resolveCornerRect(
    spec,
    mez.corner,
    mez.offsetLength ?? 0,
    mez.offsetWidth ?? 0,
    mez.alongLength,
    mez.alongWidth,
  );
  const { points, area } = deckOutline(spec, rect);
  const postSize = mez.postSize ?? DEFAULT_POST_SIZE;
  const spacing = mez.postSpacing ?? DEFAULT_POST_SPACING;

  // Deck. The shape is built as (z, x) so the extrusion runs upward in world Y.
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.y, p.x)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: mez.deckDepth,
    bevelEnabled: false,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      )
      .setPosition(0, mez.clearHeight, 0),
  );

  const deckMaterial = new THREE.MeshStandardMaterial({ color: DECK_COLOR, roughness: 0.85 });
  const deck = new THREE.Group();
  const deckMesh = new THREE.Mesh(geometry, deckMaterial);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  deck.add(deckMesh);
  deck.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
    ),
  );

  // Posts just inside every edge, evenly spread so the corners always get one.
  const supports = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({ color: POST_COLOR, roughness: 0.9 });
  const postGeometry = new THREE.BoxGeometry(postSize, mez.clearHeight, postSize);
  const placed = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const span = a.distanceTo(b);
    if (span < 1e-9) continue;
    // Inward normal of a counter-clockwise edge, to set the posts off the edge.
    const inset = postSize / 2;
    const nx = (-(b.y - a.y) / span) * inset;
    const nz = ((b.x - a.x) / span) * inset;
    const steps = Math.max(1, Math.round(span / spacing));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t + nx;
      const z = a.y + (b.y - a.y) * t + nz;
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (placed.has(key)) continue;
      placed.add(key);
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x, mez.clearHeight / 2, z);
      post.castShadow = true;
      supports.add(post);
    }
  }

  // Floor footprint, so the deck's extent still reads with the deck hidden in
  // plan view. Filled as well as outlined - a bare outline is easy to miss.
  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  const fillGeometry = new THREE.ShapeGeometry(
    new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y))),
  );
  fillGeometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, -1, 0),
      )
      .setPosition(0, 0.05, 0),
  );
  supports.add(
    new THREE.Mesh(
      fillGeometry,
      new THREE.MeshBasicMaterial({
        color: DECK_COLOR,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  supports.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, 0.09, p.y)),
      ),
      outlineMaterial,
    ),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(rect.x1 - rect.x0, mez.deckDepth, rect.z1 - rect.z0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set(
    (rect.x0 + rect.x1) / 2,
    mez.clearHeight + mez.deckDepth / 2,
    (rect.z0 + rect.z1) / 2,
  );

  return {
    deck,
    supports,
    hoverMesh,
    footprint: rect,
    area,
    postCount: placed.size,
    setHighlight(on: boolean) {
      outlineMaterial.color.setHex(on ? HIGHLIGHT_COLOR : OUTLINE_COLOR);
      deckMaterial.emissive.setHex(on ? 0x4a3410 : 0x000000);
    },
  };
}
