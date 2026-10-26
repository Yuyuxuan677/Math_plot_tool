import { describe, expect, it } from 'vitest';
import type { CircleShape, ExplicitItem, ImplicitItem, LineShape } from '../../src/app/types';
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

function implicit(id: string, expr: string): ImplicitItem {
  return {
    id,
    kind: 'implicit',
    color: '#7c3aed',
    visible: true,
    tangents: [],
    expr,
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

  it('finds intersections of two implicit curves', () => {
    const models = buildCurveModels(
      [implicit('ellipse', 'x^2/4 + y^2 = 1'), implicit('line', 'y - 2*x = 0')],
      [],
      {},
      bbox,
    );
    const points = computeIntersections(
      models.get('ellipse')!,
      models.get('line')!,
      bbox,
    );
    expect(points).toHaveLength(2);
    const x = Math.sqrt(1 / 4.25);
    const sorted = [...points].sort((a, b) => a.x - b.x);
    expect(sorted[0].x).toBeCloseTo(-x, 5);
    expect(sorted[0].y).toBeCloseTo(-2 * x, 5);
    expect(sorted[1].x).toBeCloseTo(x, 5);
    expect(sorted[1].y).toBeCloseTo(2 * x, 5);
  });

  it('finds intersections of two non-linear implicit curves', () => {
    const models = buildCurveModels(
      [implicit('ellipse', 'x^2/4 + y^2 = 1'), implicit('circle', 'x^2 + y^2 = 1')],
      [],
      {},
      bbox,
    );
    const points = computeIntersections(
      models.get('ellipse')!,
      models.get('circle')!,
      bbox,
    );
    expect(points).toHaveLength(2);
    const sorted = [...points].sort((a, b) => a.y - b.y);
    expect(sorted[0].x).toBeCloseTo(0, 4);
    expect(sorted[0].y).toBeCloseTo(-1, 4);
    expect(sorted[1].x).toBeCloseTo(0, 4);
    expect(sorted[1].y).toBeCloseTo(1, 4);
  });

  it('ignores hidden curves', () => {
    const hiddenLine = { ...line('hidden'), visible: false };
    const models = buildCurveModels([explicit('fn', 'x^2')], [hiddenLine], {}, bbox);
    expect(models.has('hidden')).toBe(false);
  });
});
