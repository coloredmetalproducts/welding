import * as THREE from 'three';
import type { ResolvedOpening, WallFrame } from './walls';

/**
 * Floor symbols for each opening. Walls are seen edge-on from directly above,
 * so plan view needs these to show where the doors actually are: a threshold
 * band across the opening plus architectural swing arcs for hinged leaves.
 */

const OVERHEAD_COLOR = 0xd2761f;
const MAN_COLOR = 0x2c6e9e;
const MARKER_Y = 0.06;

/** Wall-local (u, inward) -> world, at floor level. */
function toWorld(u: number, w: number, frame: WallFrame): THREE.Vector3 {
  return new THREE.Vector3(u, MARKER_Y, w).applyMatrix4(frame.matrix);
}

function line(points: THREE.Vector3[], color: number, width = 2): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: width }));
}

export function makeDoorMarkers(op: ResolvedOpening, frame: WallFrame): THREE.Group {
  const group = new THREE.Group();
  const isOverhead = op.kind === 'overhead';
  const color = isOverhead ? OVERHEAD_COLOR : MAN_COLOR;

  // Threshold band filling the opening, so the door reads as a gap in the wall.
  const bandDepth = isOverhead ? 1.2 : 0.8;
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(op.width, bandDepth),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  band.rotation.x = -Math.PI / 2;
  band.position.set((op.uStart + op.uEnd) / 2, MARKER_Y, 0);
  const bandHolder = new THREE.Group();
  bandHolder.add(band);
  bandHolder.applyMatrix4(frame.matrix);
  group.add(bandHolder);

  if (isOverhead) {
    // Approach lane showing the clear width projected into the shop.
    const lane = 8;
    group.add(
      line(
        [toWorld(op.uStart, 0, frame), toWorld(op.uStart, lane, frame)],
        color,
      ),
    );
    group.add(
      line([toWorld(op.uEnd, 0, frame), toWorld(op.uEnd, lane, frame)], color),
    );
    return group;
  }

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
    group.add(
      line([toWorld(hingeU, 0, frame), toWorld(hingeU, leafWidth, frame)], color),
    );
  }
  return group;
}
