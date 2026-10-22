import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildImplicitSurfaceGeometry } from '../../src/core/plot3d/implicitSurface';

describe('implicit surface geometry', () => {
  it('builds triangles for a plane', () => {
    const geometry = buildImplicitSurfaceGeometry({
      field: (x, y, z) => x + y + z - 1,
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: -2,
      zMax: 2,
      resolution: 24,
    });
    expect(geometry).not.toBeNull();
    const positions = geometry!.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    expect(geometry!.boundingSphere?.radius ?? 0).toBeGreaterThan(0);
  });

  it('builds a sphere around radius 2', () => {
    const geometry = buildImplicitSurfaceGeometry({
      field: (x, y, z) => x * x + y * y + z * z - 4,
      xMin: -3,
      xMax: 3,
      yMin: -3,
      yMax: 3,
      zMin: -3,
      zMax: 3,
      resolution: 28,
    });
    expect(geometry).not.toBeNull();
    const positions = geometry!.getAttribute('position');
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      point.set(positions.getX(index), positions.getY(index), positions.getZ(index));
      expect(point.length()).toBeCloseTo(2, 1);
      break;
    }
  });

  it('returns null when there is no zero crossing', () => {
    const geometry = buildImplicitSurfaceGeometry({
      field: () => 1,
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: -2,
      zMax: 2,
      resolution: 20,
    });
    expect(geometry).toBeNull();
  });
});
