import { describe, expect, it } from 'vitest';
import type {
  CircleShape,
  EllipseShape,
  ExplicitItem,
  HyperbolaShape,
  ImplicitItem,
  LineShape,
  ParametricItem,
  ParabolaShape,
} from '../../src/app/types';
import { deriveLocus } from '../../src/core/locus/deriveLocus';

const baseGeometry = {
  id: 'driver',
  color: '#2563eb',
  visible: true,
  showEquation: true,
  tangents: [],
};

function line(overrides: Partial<LineShape> = {}): LineShape {
  return {
    ...baseGeometry,
    id: 'line',
    kind: 'line',
    a: { x: 0, y: 0 },
    b: { x: 2, y: 0 },
    extended: false,
    divisionN: 2,
    showDivisions: false,
    showTrace: false,
    driverPlaying: false,
    traceClearToken: 0,
    movingEndpoint: 'B',
    driverCurveId: 'driver',
    driverPoint: null,
    angleConstraint: null,
    ...overrides,
  };
}

function circle(overrides: Partial<CircleShape> = {}): CircleShape {
  return {
    ...baseGeometry,
    id: 'driver',
    kind: 'circle',
    center: { x: 0, y: 0 },
    through: { x: 2, y: 0 },
    ...overrides,
  };
}

function explicitItem(expr: string): ExplicitItem {
  return {
    id: 'driver',
    kind: 'explicit',
    color: '#2563eb',
    visible: true,
    tangents: [],
    expr,
    showDerivative: false,
  };
}

function implicitItem(expr: string): ImplicitItem {
  return {
    id: 'driver',
    kind: 'implicit',
    color: '#2563eb',
    visible: true,
    tangents: [],
    expr,
  };
}

function parametricItem(): ParametricItem {
  return {
    id: 'driver',
    kind: 'parametric',
    color: '#2563eb',
    visible: true,
    tangents: [],
    xExpr: 'cos(t)',
    yExpr: 'sin(t)',
    tMin: 0,
    tMax: 2 * Math.PI,
  };
}

describe('deriveLocus', () => {
  it('derives a circle locus from a circle driver', () => {
    const result = deriveLocus({ line: line(), driver: circle(), k: 1 });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('standard');
    expect(result.metadata?.kind).toBe('circle');
    expect(result.metadata?.radius).toBeCloseTo(1, 10);
    expect(result.metadata?.center).toEqual({ x: 0, y: 0 });
    expect(result.equationTex).toContain('1');
  });

  it('derives a shifted circle from a fixed off-centre point', () => {
    const result = deriveLocus({
      line: line({ a: { x: 1, y: 0 }, b: { x: 3, y: 0 } }),
      driver: circle(),
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.radius).toBeCloseTo(1, 10);
    expect(result.metadata?.center?.x).toBeCloseTo(0.5, 10);
    expect(result.metadata?.center?.y).toBeCloseTo(0, 10);
  });

  it('uses (n-k)/n when endpoint A is moving', () => {
    const result = deriveLocus({
      line: line({
        a: { x: 2, y: 0 },
        b: { x: 0, y: 0 },
        divisionN: 4,
        movingEndpoint: 'A',
      }),
      driver: circle(),
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.radius).toBeCloseTo(1.5, 10);
  });

  it('derives y = 2x^2 for a midpoint on y = x^2', () => {
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }),
      driver: explicitItem('x^2'),
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('explicit');
    expect(result.numeric?.rhs?.(2)).toBeCloseTo(8, 6);
    expect(result.numeric?.rhs?.(1.5)).toBeCloseTo(4.5, 6);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('derives an implicit locus from an implicit driver', () => {
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }),
      driver: implicitItem('x^2 + y^2 = 4'),
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('implicit');
    expect(result.numeric?.residual?.(1, 0)).toBeCloseTo(0, 4);
    expect(result.numeric?.residual?.(0.5, 0)).toBeLessThan(0);
  });

  it('keeps a parametric driver as a parametric locus', () => {
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }),
      driver: parametricItem(),
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('parametric');
    expect(result.note).toContain('参数');
    const atZero = result.numeric?.point?.(0);
    expect(atZero?.x).toBeCloseTo(0.5, 6);
    expect(atZero?.y).toBeCloseTo(0, 6);
    const atHalfPi = result.numeric?.point?.(Math.PI / 2);
    expect(atHalfPi?.x).toBeCloseTo(0, 6);
    expect(atHalfPi?.y).toBeCloseTo(0.5, 6);
  });

  it('derives a standard parabola locus', () => {
    const driver: ParabolaShape = {
      ...baseGeometry,
      id: 'driver',
      kind: 'parabola',
      vertex: { x: 0, y: 0 },
      point: { x: 2, y: 2 },
      orientation: 'vertical',
    };
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }),
      driver,
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('standard');
    expect(result.metadata?.kind).toBe('parabola');
    expect(result.metadata?.vertex).toEqual({ x: 0, y: 0 });
    expect(result.equationTex).toContain('y =');
  });

  it('derives a standard ellipse locus with scaled axes', () => {
    const driver: EllipseShape = {
      ...baseGeometry,
      id: 'driver',
      kind: 'ellipse',
      center: { x: 0, y: 0 },
      corner: { x: 2, y: 3 },
    };
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }),
      driver,
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.kind).toBe('ellipse');
    expect(result.metadata?.a).toBeCloseTo(1, 10);
    expect(result.metadata?.b).toBeCloseTo(1.5, 10);
    expect(result.equationTex).toContain('= 1');
  });

  it('derives a standard hyperbola locus with scaled axes', () => {
    const driver: HyperbolaShape = {
      ...baseGeometry,
      id: 'driver',
      kind: 'hyperbola',
      center: { x: 0, y: 0 },
      corner: { x: 2, y: 3 },
      orientation: 'horizontal',
    };
    const result = deriveLocus({
      line: line({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }),
      driver,
      k: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.metadata?.kind).toBe('hyperbola');
    expect(result.metadata?.a).toBeCloseTo(1, 10);
    expect(result.metadata?.b).toBeCloseTo(1.5, 10);
  });

  it('returns a friendly failure when no driver is selected', () => {
    const result = deriveLocus({ line: line(), driver: null, k: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('绑定');
  });

  it('returns a friendly failure when k is out of range', () => {
    const result = deriveLocus({ line: line(), driver: circle(), k: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('等分点');
  });
});
