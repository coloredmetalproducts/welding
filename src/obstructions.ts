import * as THREE from 'three';
import type { BuildingSpec, Obstruction } from './types';

/**
 * Walled-off floor area. Rendered solid in 3D (it runs to the roof) and as a
 * hatched floor patch in plan view, matching how doors swap to floor symbols.
 */

const BLOCK_COLOR = 0x9d9890;
const OUTLINE_COLOR = 0x8a6a2f;
const HIGHLIGHT_COLOR = 0xf0a03c;

export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface ObstructionBuild {
  /** Full-height mass, hidden in plan view. */
  solid: THREE.Group;
  /** Floor hatch and outline, visible in both views. */
  symbol: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  footprint: Footprint;
}

/** Underside of the roof at a given z. */
export function roofHeightAt(spec: BuildingSpec, z: number): number {
  const half = spec.width / 2;
  const t = z <= half ? z / half : (spec.width - z) / half;
  return spec.eaveHeight + (spec.ridgeHeight - spec.eaveHeight) * t;
}

/** Resolve a corner-anchored obstruction into a world footprint. */
export function resolveFootprint(spec: BuildingSpec, ob: Obstruction): Footprint {
  // Left/right as seen from outside the front wall: right is x=0, left is x=length.
  const onLeft = ob.corner === 'rearLeft' || ob.corner === 'frontLeft';
  const onRear = ob.corner === 'rearLeft' || ob.corner === 'rearRight';
  return {
    x0: onLeft ? spec.length - ob.alongLength : 0,
    x1: onLeft ? spec.length : ob.alongLength,
    z0: onRear ? spec.width - ob.alongWidth : 0,
    z1: onRear ? spec.width : ob.alongWidth,
  };
}

/** Diagonal hazard hatching, used to mark floor area that can't be used. */
function hatchTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(138, 106, 47, 0.85)';
  ctx.lineWidth = 7;
  for (let i = -size; i < size * 2; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function buildObstruction(spec: BuildingSpec, ob: Obstruction): ObstructionBuild {
  const fp = resolveFootprint(spec, ob);
  const w = fp.x1 - fp.x0;
  const d = fp.z1 - fp.z0;
  const cx = (fp.x0 + fp.x1) / 2;
  const cz = (fp.z0 + fp.z1) / 2;

  // Cross-section in the (z, y) plane so the top can follow the roof slope,
  // then extruded across the width. The section folds at the ridge if it spans it.
  const ridgeZ = spec.width / 2;
  const section: THREE.Vector2[] = [
    new THREE.Vector2(fp.z0, 0),
    new THREE.Vector2(fp.z1, 0),
    new THREE.Vector2(fp.z1, roofHeightAt(spec, fp.z1)),
  ];
  if (fp.z0 < ridgeZ && ridgeZ < fp.z1) {
    section.push(new THREE.Vector2(ridgeZ, spec.ridgeHeight));
  }
  section.push(new THREE.Vector2(fp.z0, roofHeightAt(spec, fp.z0)));

  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(section), {
    depth: w,
    bevelEnabled: false,
  });
  // Section-local (x, y, z) -> world (x1 - z, y, x): section x holds world z,
  // and the extrusion runs back from the far wall.
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-1, 0, 0),
      )
      .setPosition(fp.x1, 0, 0),
  );

  const blockMaterial = new THREE.MeshStandardMaterial({
    color: BLOCK_COLOR,
    roughness: 0.95,
  });
  const solid = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, blockMaterial);
  mesh.castShadow = true;
  solid.add(mesh);
  solid.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({ color: 0x5f5a52 }),
    ),
  );

  // Floor symbol.
  const symbol = new THREE.Group();
  const texture = hatchTexture();
  texture.repeat.set(w / 3, d / 3);
  const patch = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(cx, 0.07, cz);
  symbol.add(patch);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
  symbol.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fp.x0, 0.08, fp.z0),
        new THREE.Vector3(fp.x1, 0.08, fp.z0),
        new THREE.Vector3(fp.x1, 0.08, fp.z1),
        new THREE.Vector3(fp.x0, 0.08, fp.z1),
      ]),
      outlineMaterial,
    ),
  );

  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, spec.eaveHeight, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set(cx, spec.eaveHeight / 2, cz);

  return {
    solid,
    symbol,
    hoverMesh,
    footprint: fp,
    setHighlight(on: boolean) {
      outlineMaterial.color.setHex(on ? HIGHLIGHT_COLOR : OUTLINE_COLOR);
      blockMaterial.emissive.setHex(on ? 0x4a3410 : 0x000000);
    },
  };
}
