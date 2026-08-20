import * as THREE from 'three';
import type { ResolvedOpening, WallFrame } from './walls';

/** A door that can be opened and closed, animated toward its target each frame. */
export interface DoorControl {
  id: string;
  label: string;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  toggle(): void;
  /** Eases the door toward its target. Returns true while still moving. */
  tick(): boolean;
}

export interface DoorBuild {
  group: THREE.Group;
  control: DoorControl;
}

const JAMB_COLOR = 0x4a535b;
// Door leaves are deliberately darker than the 0xe3e8ec wall so they read as
// doors rather than blending into the panel behind them.
const OVERHEAD_LEAF = 0xb3bcc4;
const MAN_LEAF = 0xcfc6b6;
const PANEL_LINE = 0x69737c;

/** Jamb and header framing around an opening, drawn in wall-local coordinates. */
function addJambs(parent: THREE.Object3D, op: ResolvedOpening, depth: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: JAMB_COLOR, roughness: 0.7 });
  const t = 0.33;
  const addBox = (w: number, h: number, cx: number, cy: number) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mat);
    box.position.set(cx, cy, 0);
    parent.add(box);
  };
  addBox(t, op.height, op.uStart - t / 2, op.height / 2);
  addBox(t, op.height, op.uEnd + t / 2, op.height / 2);
  addBox(op.width + t * 2, t, (op.uStart + op.uEnd) / 2, op.height + t / 2);
}

/**
 * Sectional overhead door. Closed it fills the opening; open it lifts to the
 * header and lies back horizontally under the ceiling, the way the real one will.
 */
export function makeOverheadDoor(op: ResolvedOpening, frame: WallFrame): DoorBuild {
  const group = new THREE.Group();
  addJambs(group, op, 0.5);

  // Pivot sits at the sill, centered in the opening; rotating it about the wall's
  // u-axis swings the whole leaf from vertical to horizontal.
  const pivot = new THREE.Group();
  pivot.position.set((op.uStart + op.uEnd) / 2, 0, 0.3);
  group.add(pivot);

  const sections = Math.max(3, Math.round(op.height / 1.75));
  const sectionH = op.height / sections;
  const panelMat = new THREE.MeshStandardMaterial({
    color: OVERHEAD_LEAF,
    roughness: 0.5,
    metalness: 0.3,
  });
  for (let i = 0; i < sections; i++) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(op.width - 0.15, sectionH - 0.07, 0.28),
      panelMat,
    );
    panel.position.y = sectionH * (i + 0.5);
    panel.castShadow = true;
    pivot.add(panel);
    pivot.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(panel.geometry),
        new THREE.LineBasicMaterial({ color: PANEL_LINE }),
      ).translateY(panel.position.y),
    );
  }

  group.applyMatrix4(frame.matrix);

  let target = 0;
  let current = 0;
  const apply = () => {
    // Lift to the header, then lay back inward.
    pivot.rotation.x = (current * Math.PI) / 2;
    pivot.position.y = current * op.height;
  };
  apply();

  return {
    group,
    control: {
      id: op.id,
      label: op.label,
      isOpen: () => target > 0.5,
      setOpen: (open) => {
        target = open ? 1 : 0;
      },
      toggle: () => {
        target = target > 0.5 ? 0 : 1;
      },
      tick: () => {
        if (Math.abs(current - target) < 0.001) {
          if (current !== target) {
            current = target;
            apply();
          }
          return false;
        }
        current += (target - current) * 0.12;
        apply();
        return true;
      },
    },
  };
}

/** Pair of inswinging leaves, hinged at the outer edges of the opening. */
export function makeManDoor(op: ResolvedOpening, frame: WallFrame): DoorBuild {
  const group = new THREE.Group();
  addJambs(group, op, 0.75);

  const leafWidth = op.leafWidth ?? op.width / 2;
  const leafMat = new THREE.MeshStandardMaterial({ color: MAN_LEAF, roughness: 0.65 });

  // Left leaf hinges at uStart and right leaf at uEnd; both swing toward +Z (inside).
  const hinges: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const hinge = new THREE.Group();
    hinge.position.set(side < 0 ? op.uStart : op.uEnd, 0, 0);
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, op.height - 0.1, 0.18),
      leafMat,
    );
    leaf.position.set((side < 0 ? 1 : -1) * (leafWidth / 2), op.height / 2, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    hinge.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(leaf.geometry),
        new THREE.LineBasicMaterial({ color: PANEL_LINE }),
      ).translateX(leaf.position.x).translateY(leaf.position.y),
    );
    group.add(hinge);
    hinges.push(hinge);
  }

  group.applyMatrix4(frame.matrix);

  let target = 0;
  let current = 0;
  const apply = () => {
    const angle = (current * Math.PI) / 2;
    // Negative on the left leaf, positive on the right, swings both inward.
    hinges[0].rotation.y = -angle;
    hinges[1].rotation.y = angle;
  };
  apply();

  return {
    group,
    control: {
      id: op.id,
      label: op.label,
      isOpen: () => target > 0.5,
      setOpen: (open) => {
        target = open ? 1 : 0;
      },
      toggle: () => {
        target = target > 0.5 ? 0 : 1;
      },
      tick: () => {
        if (Math.abs(current - target) < 0.001) {
          if (current !== target) {
            current = target;
            apply();
          }
          return false;
        }
        current += (target - current) * 0.14;
        apply();
        return true;
      },
    },
  };
}
