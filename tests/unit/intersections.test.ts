import { describe, expect, it } from 'vitest';
import type { CircleShape, ExplicitItem, LineShape } from '../../src/app/types';
import { buildCurveModels, computeIntersections } from '../../src/core/plot2d/intersections';

const bbox: [number, number, number, number] = [-10, 10, 10, -10];

function line(id: string, a = { x: -2, y: 2 }, b = { x: 2, y: 2 }): LineShape {
  return {
    id,
    kind: 'line',
    color: '#2563eb',
    visible: true,
    showEquation: false,
    tangents: [],
    a,
    b,
    extended: true,
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

function explicit(id: string, expr: string): ExplicitItem {
  return {
    id,
    kind: 'explicit',
    color: '#e11d48',
    visible: true,
    tangents: [],
    expr,
    showDerivative: false,
  };
}

function circle(id = 'circle'): CircleShape {
  return {
    id,
    kind: 'circle',
    color: '#059669',
    visible: true,
    showEquation: false,
    tangents: [],
    center: { x: 0, y: 0 },
    through: { x: 2, y: 0 },
  };
}

describe('intersection models', () => {
  it('finds both intersections of a parabola and a horizontal line', () => {
    const models = buildCurveModels([explicit('fn', 'x^2')], [line('l')], {}, bbox);
    const points = computeIntersections(models.get('fn')!, models.get('l')!);
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-Math.SQRT2, 4);
    expect(points[0].y).toBeCloseTo(2, 4);
    expect(points[1].x).toBeCloseTo(Math.SQRT2, 4);
  });

  it('uses exact line-line intersection', () => {
    const horizontal = line('h', { x: -2, y: 0 }, { x: 2, y: 0 });
    const vertical = line('v', { x: 1, y: -2 }, { x: 1, y: 2 });
    const models = buildCurveModels([], [horizontal, vertical], {}, bbox);
    const points = computeIntersections(models.get('h')!, models.get('v')!);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(1, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
  });

  it('finds a line through a circle', () => {
    const shape = circle();
    const models = buildCurveModels([], [shape, line('secant', { x: -5, y: 0 }, { x: 5, y: 0 })], {}, bbox);
    const points = computeIntersections(models.get('secant')!, models.get('circle')!);
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-2, 4);
    expect(points[1].x).toBeCloseTo(2, 4);
  });

  it('finds intersections of two explicit functions', () => {
    const models = buildCurveModels(
      [explicit('a', 'x^2'), explicit('b', 'x + 2')],
      [],
      {},
      bbox,
    );
    const points = computeIntersections(models.get('a')!, models.get('b')!);
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-1, 4);
    expect(points[1].x).toBeCloseTo(2, 4);
  });

  it('ignores hidden curves', () => {
    const hiddenLine = { ...line('hidden'), visible: false };
    const models = buildCurveModels([explicit('fn', 'x^2')], [hiddenLine], {}, bbox);
    expect(models.has('hidden')).toBe(false);
  });
});
