import { describe, expect, it } from 'vitest';
import type { Geometry, LineShape } from '../../src/app/types';
import { applyLineAngleConstraints } from '../../src/app/store';

function line(id: string, a: { x: number; y: number }, b: { x: number; y: number }): LineShape {
  return {
    id,
    kind: 'line',
    color: '#2563eb',
    visible: true,
    showEquation: false,
    tangents: [],
    a,
    b,
    extended: false,
    divisionN: 2,
    showDivisions: false,
    showTrace: false,
    driverPlaying: false,
    traceClearToken: 0,
    movingEndpoint: 'B',
    driverCurveId: null,
    driverPoint: null,
    angleConstraint: null,
  };
}

describe('line angle constraints', () => {
  it('makes a target line perpendicular to its source and keeps the center offset', () => {
    const source = line('source', { x: -2, y: 0 }, { x: 2, y: 0 });
    const target = line('target', { x: -2, y: 2 }, { x: 2, y: 2 });
    target.angleConstraint = {
      sourceId: source.id,
      angleDeg: 90,
      offset: { x: 0, y: 2 },
    };
    const result = applyLineAngleConstraints([source, target] as Geometry[]);
    const updated = result.find((item) => item.id === 'target') as LineShape;
    expect(updated.a.x).toBeCloseTo(0, 6);
    expect(updated.b.x).toBeCloseTo(0, 6);
    expect((updated.a.y + updated.b.y) / 2).toBeCloseTo(2, 6);
    const angle = Math.atan2(updated.b.y - updated.a.y, updated.b.x - updated.a.x) * 180 / Math.PI;
    expect(Math.abs(angle)).toBeCloseTo(90, 6);
  });

  it('follows source translation and rotation together', () => {
    const source = line('source', { x: -2, y: 0 }, { x: 2, y: 0 });
    const target = line('target', { x: -2, y: 2 }, { x: 2, y: 2 });
    target.angleConstraint = {
      sourceId: source.id,
      angleDeg: 0,
      offset: { x: 1, y: 2 },
    };
    const movedSource = line('source', { x: 0, y: 1 }, { x: 4, y: 5 });
    const result = applyLineAngleConstraints([movedSource, target] as Geometry[]);
    const updated = result.find((item) => item.id === 'target') as LineShape;
    const center = { x: (updated.a.x + updated.b.x) / 2, y: (updated.a.y + updated.b.y) / 2 };
    expect(center.x).toBeCloseTo(3, 6);
    expect(center.y).toBeCloseTo(5, 6);
    const angle = Math.atan2(updated.b.y - updated.a.y, updated.b.x - updated.a.x);
    expect(angle).toBeCloseTo(Math.atan2(4, 4), 6);
  });

  it('ignores a missing source', () => {
    const target = line('target', { x: 0, y: 0 }, { x: 2, y: 0 });
    target.angleConstraint = { sourceId: 'missing', angleDeg: 90, offset: { x: 0, y: 0 } };
    const [updated] = applyLineAngleConstraints([target] as Geometry[]);
    expect(updated).toEqual(target);
  });
});
