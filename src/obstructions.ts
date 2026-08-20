import * as THREE from 'three';
import type { BuildingSpec, Obstruction } from './types';
import { resolveCornerRect, roofHeightAt, type Rect } from './geometry';

/**
 * Walled-off floor area. Rendered solid in 3D (it runs to the roof) and as a
 * hatched floor patch in plan view, matching how doors swap to floor symbols.
 */

const BLOCK_COLOR = 0x9d9890;
const OUTLINE_COLOR = 0x8a6a2f;
const HIGHLIGHT_COLOR = 0xf0a03c;

export interface ObstructionBuild {
  /** Full-height mass, hidden in plan view. */
  solid: THREE.Group;
  /** Floor hatch and outline, visible in both views. */
  symbol: THREE.Group;
  hoverMesh: THREE.Mesh;
  setHighlight(on: boolean): void;
  footprint: Rect;
}

/** Resolve a corner-referenced obstruction into a world footprint. */
export function resolveFootprint(spec: BuildingSpec, ob: Obstruction): Rect {
  return resolveCornerRect(
    spec,
    ob.corner,
    ob.offsetLength ?? 0,
    ob.offsetWidth ?? 0,
    ob.alongLength,
    ob.alongWidth,
  );
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
  // then extruded across the width. The section folds at the ridge if it spans
  // it; a capped height gives a flat top instead.
  const capped = ob.height !== undefined;
  const topAt = (z: number) => ob.height ?? roofHeightAt(spec, z);
  const ridgeZ = spec.width / 2;
  const section: THREE.Vector2[] = [
    new THREE.Vector2(fp.z0, 0),
    new THREE.Vector2(fp.z1, 0),
    new THREE.Vector2(fp.z1, topAt(fp.z1)),
  ];
  if (!capped && fp.z0 < ridgeZ && ridgeZ < fp.z1) {
    section.push(new THREE.Vector2(ridgeZ, spec.ridgeHeight));
  }
  section.push(new THREE.Vector2(fp.z0, topAt(fp.z0)));

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

  const hoverHeight = ob.height ?? spec.eaveHeight;
  const hoverMesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, hoverHeight, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hoverMesh.position.set(cx, hoverHeight / 2, cz);

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
