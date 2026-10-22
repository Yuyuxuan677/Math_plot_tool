import { describe, expect, it } from 'vitest';
import { findLocalImplicitTangentPoint } from '../../src/core/plot2d/tangentSolve';

const ellipse = (x: number, y: number) => (x * x) / 4 + y * y - 1;

describe('local implicit tangent branch', () => {
  it('stays on the current side instead of hopping to the parallel tangent', () => {
    const point = findLocalImplicitTangentPoint(
      ellipse,
      { x: -1.913, y: 0.291 },
      1.072,
      28,
    );
    expect(point).not.toBeNull();
    expect(point!.x).toBeLessThan(0);
    expect(Math.hypot(point!.x + 1.913, point!.y - 0.291)).toBeLessThan(0.6);
  });

  it('moves continuously when the desired angle changes slightly', () => {
    let current = { x: -1.913, y: 0.291 };
    for (let angle = 1.0; angle <= 1.6; angle += 0.05) {
      const next = findLocalImplicitTangentPoint(ellipse, current, angle, 28);
      expect(next).not.toBeNull();
      expect(Math.hypot(next!.x - current.x, next!.y - current.y)).toBeLessThan(0.8);
      current = next!;
    }
  });
});
