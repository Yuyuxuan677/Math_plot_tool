import { describe, expect, it } from 'vitest';
import type { ImplicitItem } from '../../src/app/types';
import { findTangentPointForAngle } from '../../src/core/plot2d/tangentSolve';

const ellipse: ImplicitItem = {
  id: 'ellipse',
  kind: 'implicit',
  color: '#000',
  visible: true,
  tangents: [],
  expr: 'x^2/4 + y^2 = 1',
};

describe('tangent angle solver', () => {
  it('finds an ellipse tangent in several directions', () => {
    for (const angle of [0, Math.PI / 4, Math.PI / 2, 2.5, 1.0272]) {
      const point = findTangentPointForAngle({
        item: ellipse,
        params: {},
        view: [-6, 6, 6, -6],
        desiredAngle: angle,
        currentPoint: null,
      });
      expect(point, `angle ${angle}`).not.toBeNull();
      if (!point) continue;
      const h = 1e-5;
      const evalAt = (x: number, y: number) => (x * x) / 4 + y * y - 1;
      const fx = (evalAt(point.x + h, point.y) - evalAt(point.x - h, point.y)) / (2 * h);
      const fy = (evalAt(point.x, point.y + h) - evalAt(point.x, point.y - h)) / (2 * h);
      const tangentAngle = Math.atan2(fx, -fy);
      let difference = ((tangentAngle - angle) % Math.PI + Math.PI) % Math.PI;
      if (difference > Math.PI / 2) difference = Math.PI - difference;
      expect(Math.abs(difference)).toBeLessThan(0.04);
    }
  });

  it('finds a parabola tangent with slope 2 near x=1', () => {
    const parabola: ImplicitItem = { ...ellipse, id: 'f', kind: 'explicit', expr: 'x^2' } as never;
    const point = findTangentPointForAngle({
      item: parabola,
      params: {},
      view: [-5, 5, 5, -5],
      desiredAngle: Math.atan(2),
      currentPoint: { x: 1, y: 1 },
    });
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(1, 1);
  });
});
