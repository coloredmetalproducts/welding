import * as THREE from 'three';
import type { BuildingSpec, Ramp } from './types';
import { findWall, wallFrames } from './walls';
import type { Rect } from './geometry';

/**
 * Ramp running down into the shop from an opening in one wall. Built as a wedge
 * in the wall's own frame, so the same data works on any wall.
 */

const DECK_COLOR = 0xb0aca4;
const OUTLINE_COLOR = 0x6a7078;
const HIGHLIGHT_COLOR = 0xf0a03c;

export interface RampBuild {
  group: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  /** Rise over run as a percentage, for the callout. */
  gradePercent: number;
  footprint: Rect;
  /** Deck height at a point on the ramp, for anything driving over it. */
  heightAt(x: number, z: number): number;
}

export function buildRamp(spec: BuildingSpec, ramp: Ramp): RampBuild {
  const frame = findWall(wallFrames(spec), ramp.wall);
  if (!frame) throw new Error(`Ramp ${ramp.id} names unknown wall ${ramp.wall}`);
  const uStart =
    ramp.fromCorner === 'right' ? ramp.offset : frame.span - ramp.offset - ramp.width;
  const uEnd = uStart + ramp.width;

  // Cross-section in the wall's (inward, up) plane: the deck is highest against
  // the wall and falls to floor level `run` feet into the shop.
  const section = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(ramp.run, 0),
    new THREE.Vector2(0, ramp.rise),
  ]);
  const geometry = new THREE.ExtrudeGeometry(section, {
    depth: ramp.width,
    bevelEnabled: false,
  });
  // Section-local (x, y, z) -> wall-local (uEnd - z, y, x): the section runs
  // inward from the wall, and the extrusion sweeps back across the opening.
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-1, 0, 0),
      )
      .setPosition(uEnd, 0, 0),
  );

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: DECK_COLOR, roughness: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), outlineMaterial));

  // Footprint outline on the floor, so the space the ramp costs reads in plan.
  group.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(uStart, 0.06, 0),
        new THREE.Vector3(uEnd, 0.06, 0),
        new THREE.Vector3(uEnd, 0.06, ramp.run),
        new THREE.Vector3(uStart, 0.06, ramp.run),
      ]),
      outlineMaterial,
    ),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(ramp.width, ramp.rise, ramp.run),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set((uStart + uEnd) / 2, ramp.rise / 2, ramp.run / 2);
  group.add(hoverMesh);

  group.applyMatrix4(frame.matrix);

  // World-space extent, for placement checks later.
  const corners = [
    new THREE.Vector3(uStart, 0, 0),
    new THREE.Vector3(uEnd, 0, 0),
    new THREE.Vector3(uEnd, 0, ramp.run),
    new THREE.Vector3(uStart, 0, ramp.run),
  ].map((p) => p.applyMatrix4(frame.matrix));
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);

  const toLocal = frame.matrix.clone().invert();
  const probe = new THREE.Vector3();

  return {
    group,
    hoverMesh,
    gradePercent: (ramp.rise / ramp.run) * 100,
    heightAt(x, z) {
      // Wall-local z is the inward distance: full rise at the wall, zero inboard.
      probe.set(x, 0, z).applyMatrix4(toLocal);
      const t = Math.max(0, Math.min(1, probe.z / ramp.run));
      return ramp.rise * (1 - t);
    },
    footprint: {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
    },
    setHighlight(on: boolean) {
      outlineMaterial.color.setHex(on ? HIGHLIGHT_COLOR : OUTLINE_COLOR);
      material.emissive.setHex(on ? 0x4a3410 : 0x000000);
    },
  };
}
