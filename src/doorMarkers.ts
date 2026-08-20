import * as THREE from 'three';
import type { ResolvedOpening, WallFrame } from './walls';

/**
 * Per-opening annotations: floor symbols that make doors readable from directly
 * above (walls are edge-on in plan view), plus a hover outline in the wall plane.
 */

const OVERHEAD_COLOR = 0xd2761f;
const MAN_COLOR = 0x2c6e9e;
const HIGHLIGHT_COLOR = 0xf0a03c;
const MARKER_Y = 0.06;
const BAND_OPACITY = 0.5;
const BAND_OPACITY_HOVER = 0.85;

export interface DoorAnnotations {
  group: THREE.Group;
  setHighlight(on: boolean): void;
}

/** Wall-local (u, inward) -> world, at floor level. */
function toWorld(u: number, w: number, frame: WallFrame): THREE.Vector3 {
  return new THREE.Vector3(u, MARKER_Y, w).applyMatrix4(frame.matrix);
}

function line(points: THREE.Vector3[], color: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

export function makeDoorAnnotations(
  op: ResolvedOpening,
  frame: WallFrame,
): DoorAnnotations {
  const group = new THREE.Group();
  const isOverhead = op.kind === 'overhead';
  const color = isOverhead ? OVERHEAD_COLOR : MAN_COLOR;

  // Threshold band filling the opening, so the door reads as a gap in the wall.
  const bandMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: BAND_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(op.width, isOverhead ? 1.2 : 0.8),
    bandMaterial,
  );
  band.rotation.x = -Math.PI / 2;
  band.position.set((op.uStart + op.uEnd) / 2, MARKER_Y, 0);
  const bandHolder = new THREE.Group();
  bandHolder.add(band);
  bandHolder.applyMatrix4(frame.matrix);
  group.add(bandHolder);

  if (isOverhead) {
    // Approach lane projecting the clear width into the shop.
    const lane = 8;
    for (const u of [op.uStart, op.uEnd]) {
      group.add(line([toWorld(u, 0, frame), toWorld(u, lane, frame)], color));
    }
  } else {
    // Hinged leaves: quarter-circle swing arcs plus the leaf at 90 degrees open.
    const leafWidth = op.leafWidth ?? op.width / 2;
    for (const side of [-1, 1] as const) {
      const hingeU = side < 0 ? op.uStart : op.uEnd;
      const dir = side < 0 ? 1 : -1;
      const arc: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * (Math.PI / 2);
        arc.push(
          toWorld(hingeU + dir * leafWidth * Math.cos(a), leafWidth * Math.sin(a), frame),
        );
      }
      group.add(line(arc, color));
      group.add(line([toWorld(hingeU, 0, frame), toWorld(hingeU, leafWidth, frame)], color));
    }
  }

  // Hover outline tracing the opening in the wall plane. Drawn without depth
  // testing so it reads even when the wall in front of it is opaque.
  const outlineHolder = new THREE.Group();
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(op.uStart, 0.05, 0),
      new THREE.Vector3(op.uEnd, 0.05, 0),
      new THREE.Vector3(op.uEnd, op.height, 0),
      new THREE.Vector3(op.uStart, op.height, 0),
    ]),
    new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, depthTest: false }),
  );
  outline.renderOrder = 5;
  outline.visible = false;
  outlineHolder.add(outline);
  outlineHolder.applyMatrix4(frame.matrix);
  group.add(outlineHolder);

  return {
    group,
    setHighlight(on: boolean) {
      outline.visible = on;
      bandMaterial.opacity = on ? BAND_OPACITY_HOVER : BAND_OPACITY;
    },
  };
}
