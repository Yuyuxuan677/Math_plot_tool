import * as THREE from 'three';

export interface ImplicitSurfaceOptions {
  field: (x: number, y: number, z: number) => number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  resolution: number;
}

const TETRAHEDRA = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
];

function interpolate(
  a: { x: number; y: number; z: number; v: number },
  b: { x: number; y: number; z: number; v: number },
): { x: number; y: number; z: number } | null {
  if (!Number.isFinite(a.v) || !Number.isFinite(b.v)) return null;
  const denominator = b.v - a.v;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = Math.max(0, Math.min(1, a.v / (a.v - b.v)));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function buildImplicitSurfaceGeometry(
  options: ImplicitSurfaceOptions,
): THREE.BufferGeometry | null {
  const n = Math.max(12, Math.min(56, Math.round(options.resolution || 28)));
  const { xMin, xMax, yMin, yMax, zMin, zMax } = options;
  if (
    ![xMin, xMax, yMin, yMax, zMin, zMax].every(Number.isFinite) ||
    xMax <= xMin ||
    yMax <= yMin ||
    zMax <= zMin
  ) {
    return null;
  }
  const size = n + 1;
  const values = new Float64Array(size * size * size);
  const points = new Array<{ x: number; y: number; z: number }>(size * size * size);
  let hasFinite = false;
  let hasNegative = false;
  let hasPositive = false;
  for (let iz = 0; iz < size; iz += 1) {
    const z = zMin + ((zMax - zMin) * iz) / n;
    for (let iy = 0; iy < size; iy += 1) {
      const y = yMin + ((yMax - yMin) * iy) / n;
      for (let ix = 0; ix < size; ix += 1) {
        const x = xMin + ((xMax - xMin) * ix) / n;
        const index = ix + size * (iy + size * iz);
        points[index] = { x, y, z };
        let value = NaN;
        try {
          value = options.field(x, y, z);
        } catch {
          value = NaN;
        }
        values[index] = value;
        if (Number.isFinite(value)) {
          hasFinite = true;
          if (value < 0) hasNegative = true;
          if (value > 0) hasPositive = true;
        }
      }
    }
  }
  if (!hasFinite || !hasNegative || !hasPositive) return null;

  const positions: number[] = [];
  const vertexIndex = (ix: number, iy: number, iz: number) =>
    ix + size * (iy + size * iz);
  const getPoint = (index: number) => {
    const ix = index % size;
    const iy = Math.floor(index / size) % size;
    const iz = Math.floor(index / (size * size));
    return {
      ...points[index],
      v: values[index],
      ix,
      iy,
      iz,
    };
  };

  const pushTriangle = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (let iz = 0; iz < n; iz += 1) {
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const cube = [
          vertexIndex(ix, iy, iz),
          vertexIndex(ix + 1, iy, iz),
          vertexIndex(ix + 1, iy + 1, iz),
          vertexIndex(ix, iy + 1, iz),
          vertexIndex(ix, iy, iz + 1),
          vertexIndex(ix + 1, iy, iz + 1),
          vertexIndex(ix + 1, iy + 1, iz + 1),
          vertexIndex(ix, iy + 1, iz + 1),
        ];
        for (const tetra of TETRAHEDRA) {
          const vertices = tetra.map((index) => getPoint(cube[index]));
          if (!vertices.every((v) => Number.isFinite(v.v))) continue;
          const inside = vertices.filter((v) => v.v < 0);
          const outside = vertices.filter((v) => v.v >= 0);
          if (inside.length === 0 || outside.length === 0) continue;
          const crossings: Array<{ x: number; y: number; z: number }> = [];
          for (const a of vertices) {
            for (const b of vertices) {
              if (a === b) continue;
              if ((a.v < 0 && b.v >= 0) || (a.v >= 0 && b.v < 0)) {
                const point = interpolate(a, b);
                if (point) crossings.push(point);
              }
            }
          }
          const unique: Array<{ x: number; y: number; z: number }> = [];
          for (const point of crossings) {
            if (
              !unique.some(
                (other) =>
                  Math.hypot(other.x - point.x, other.y - point.y, other.z - point.z) <
                  1e-7,
              )
            ) {
              unique.push(point);
            }
          }
          if (unique.length < 3) continue;
          for (let index = 1; index + 1 < unique.length; index += 1) {
            pushTriangle(unique[0], unique[index], unique[index + 1]);
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
