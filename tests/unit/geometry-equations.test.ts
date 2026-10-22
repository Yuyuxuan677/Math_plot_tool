import { describe, expect, it } from 'vitest';
import {
  circleEquation,
  divisionPoints,
  ellipseEquation,
  hyperbolaEquation,
  lineEquation,
  parabolaEquation,
} from '../../src/core/geometry/equations';
import type {
  CircleShape,
  EllipseShape,
  HyperbolaShape,
  LineShape,
  ParabolaShape,
} from '../../src/app/types';

const base = {
  id: 'x',
  color: '#2563eb',
  visible: true,
  showEquation: true,
  tangents: [],
};

describe('geometry equations', () => {
  it('writes a slope-intercept line', () => {
    const shape: LineShape = {
      ...base,
      kind: 'line',
      a: { x: 0, y: 1 },
      b: { x: 2, y: 5 },
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
    expect(lineEquation(shape).tex).toContain('y = 2x');
    expect(lineEquation(shape).tex).toContain('+ 1');
  });

  it('writes a vertical line', () => {
    const shape: LineShape = {
      ...base,
      kind: 'line',
      a: { x: 2, y: 0 },
      b: { x: 2, y: 4 },
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
    expect(lineEquation(shape).tex).toBe('x = 2');
  });

  it('writes a circle with centre offset', () => {
    const shape: CircleShape = {
      ...base,
      kind: 'circle',
      center: { x: 1, y: 2 },
      through: { x: 4, y: 2 },
    };
    const eq = circleEquation(shape);
    expect(eq.tex).toContain('\\left(x - 1\\right)^{2}');
    expect(eq.tex).toContain('\\left(y - 2\\right)^{2}');
    expect(eq.tex).toContain('9');
  });

  it('writes an ellipse in standard form', () => {
    const shape: EllipseShape = {
      ...base,
      kind: 'ellipse',
      center: { x: 0, y: 0 },
      corner: { x: 2, y: 3 },
    };
    const eq = ellipseEquation(shape);
    expect(eq.tex).toContain('x^{2}');
    expect(eq.tex).toContain('y^{2}');
    expect(eq.tex).toContain('4');
    expect(eq.tex).toContain('9');
    expect(eq.tex).toContain('= 1');
  });

  it('writes a vertical parabola', () => {
    const shape: ParabolaShape = {
      ...base,
      kind: 'parabola',
      vertex: { x: 0, y: 0 },
      point: { x: 2, y: 2 },
      orientation: 'vertical',
    };
    const eq = parabolaEquation(shape);
    expect(eq.tex).toContain('y =');
    expect(eq.tex).toContain('1/2');
  });

  it('writes a horizontal hyperbola', () => {
    const shape: HyperbolaShape = {
      ...base,
      kind: 'hyperbola',
      center: { x: 0, y: 0 },
      corner: { x: 2, y: 3 },
      orientation: 'horizontal',
    };
    const eq = hyperbolaEquation(shape);
    expect(eq.tex).toContain('x^{2}');
    expect(eq.tex).toContain('y^{2}');
    expect(eq.tex).toContain('= 1');
  });

  it('computes interior division points', () => {
    const points = divisionPoints({ x: 0, y: 0 }, { x: 5, y: 10 }, 5);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 1, y: 2 });
    expect(points[3]).toEqual({ x: 4, y: 8 });
  });
});
