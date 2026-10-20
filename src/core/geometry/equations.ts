import type {
  CircleShape,
  EllipseShape,
  Geometry,
  GeometryKind,
  HyperbolaShape,
  LineShape,
  ParabolaShape,
  Point2,
} from '../../app/types';
import { formatNice } from '../../app/utils';

export interface GeometryEquation {
  tex: string;
  plain: string;
  title: string;
}

export function geometryTitle(kind: GeometryKind): string {
  switch (kind) {
    case 'line':
      return '直线';
    case 'circle':
      return '圆';
    case 'ellipse':
      return '椭圆';
    case 'parabola':
      return '抛物线';
    case 'hyperbola':
      return '双曲线';
  }
}

function num(value: number): string {
  return formatNice(value);
}

function texShiftedTerm(variable: string, offset: number): string {
  if (Math.abs(offset) < 1e-9) return `${variable}^{2}`;
  const sign = offset > 0 ? '-' : '+';
  return `\\left(${variable} ${sign} ${num(Math.abs(offset))}\\right)^{2}`;
}

function plainShiftedTerm(variable: string, offset: number): string {
  if (Math.abs(offset) < 1e-9) return `${variable}²`;
  const sign = offset > 0 ? '−' : '+';
  return `(${variable} ${sign} ${num(Math.abs(offset))})²`;
}

export function lineEquation(shape: LineShape): GeometryEquation {
  const dx = shape.b.x - shape.a.x;
  const dy = shape.b.y - shape.a.y;
  if (Math.abs(dx) < 1e-9) {
    const x = num(shape.a.x);
    return { tex: `x = ${x}`, plain: `x = ${x}`, title: '直线' };
  }
  const k = dy / dx;
  const intercept = shape.a.y - k * shape.a.x;

  if (Math.abs(k) < 1e-9) {
    const value = num(intercept);
    return { tex: `y = ${value}`, plain: `y = ${value}`, title: '直线' };
  }

  const slopeText =
    Math.abs(k - 1) < 1e-9 ? '' : Math.abs(k + 1) < 1e-9 ? '-' : num(k);
  let tex = `y = ${slopeText}x`;
  let plain = `y = ${slopeText === '-' ? '−' : slopeText}x`;
  if (Math.abs(intercept) > 1e-9) {
    const sign = intercept > 0 ? '+' : '-';
    const magnitude = num(Math.abs(intercept));
    tex += ` ${sign} ${magnitude}`;
    plain += ` ${sign === '-' ? '−' : '+'} ${magnitude}`;
  }
  return { tex, plain, title: '直线' };
}

export function circleEquation(shape: CircleShape): GeometryEquation {
  const dx = shape.through.x - shape.center.x;
  const dy = shape.through.y - shape.center.y;
  const radiusSq = dx * dx + dy * dy;
  const xTerm = texShiftedTerm('x', shape.center.x);
  const yTerm = texShiftedTerm('y', shape.center.y);
  const xPlain = plainShiftedTerm('x', shape.center.x);
  const yPlain = plainShiftedTerm('y', shape.center.y);
  return {
    tex: `${xTerm} + ${yTerm} = ${num(radiusSq)}`,
    plain: `${xPlain} + ${yPlain} = ${num(radiusSq)}`,
    title: '圆',
  };
}

export function ellipseParams(shape: EllipseShape): { a: number; b: number } {
  return {
    a: Math.abs(shape.corner.x - shape.center.x),
    b: Math.abs(shape.corner.y - shape.center.y),
  };
}

export function ellipseEquation(shape: EllipseShape): GeometryEquation {
  const { a, b } = ellipseParams(shape);
  const xTerm = texShiftedTerm('x', shape.center.x);
  const yTerm = texShiftedTerm('y', shape.center.y);
  const xPlain = plainShiftedTerm('x', shape.center.x);
  const yPlain = plainShiftedTerm('y', shape.center.y);
  return {
    tex: `\\frac{${xTerm}}{${num(a * a)}} + \\frac{${yTerm}}{${num(b * b)}} = 1`,
    plain: `${xPlain}/${num(a * a)} + ${yPlain}/${num(b * b)} = 1`,
    title: '椭圆',
  };
}

export function parabolaParams(shape: ParabolaShape): { a: number } {
  if (shape.orientation === 'vertical') {
    const dx = shape.point.x - shape.vertex.x;
    if (Math.abs(dx) < 1e-9) return { a: 0 };
    return { a: (shape.point.y - shape.vertex.y) / (dx * dx) };
  }
  const dy = shape.point.y - shape.vertex.y;
  if (Math.abs(dy) < 1e-9) return { a: 0 };
  return { a: (shape.point.x - shape.vertex.x) / (dy * dy) };
}

export function parabolaEquation(shape: ParabolaShape): GeometryEquation {
  const { a } = parabolaParams(shape);
  const h = shape.vertex.x;
  const k = shape.vertex.y;

  if (!Number.isFinite(a) || Math.abs(a) < 1e-12) {
    return {
      tex: '\\text{无法生成方程}',
      plain: '无法生成方程',
      title: '抛物线',
    };
  }

  if (shape.orientation === 'vertical') {
    const xTerm = texShiftedTerm('x', h);
    const xPlain = plainShiftedTerm('x', h);
    const coeff = Math.abs(a - 1) < 1e-9 ? '' : num(a);
    const kSign = k > 0 ? '+' : '-';
    const tex =
      `y = ${coeff}${xTerm}` +
      (Math.abs(k) > 1e-9 ? ` ${kSign} ${num(Math.abs(k))}` : '');
    const plain =
      `y = ${coeff}${xPlain}` +
      (Math.abs(k) > 1e-9 ? ` ${kSign === '-' ? '−' : '+'} ${num(Math.abs(k))}` : '');
    return { tex, plain, title: '抛物线' };
  }

  const yTerm = texShiftedTerm('y', k);
  const yPlain = plainShiftedTerm('y', k);
  const coeff = Math.abs(a - 1) < 1e-9 ? '' : num(a);
  const hSign = h > 0 ? '+' : '-';
  const tex =
    `x = ${coeff}${yTerm}` +
    (Math.abs(h) > 1e-9 ? ` ${hSign} ${num(Math.abs(h))}` : '');
  const plain =
    `x = ${coeff}${yPlain}` +
    (Math.abs(h) > 1e-9 ? ` ${hSign === '-' ? '−' : '+'} ${num(Math.abs(h))}` : '');
  return { tex, plain, title: '抛物线' };
}

export function hyperbolaParams(shape: HyperbolaShape): { a: number; b: number } {
  const dx = Math.abs(shape.corner.x - shape.center.x);
  const dy = Math.abs(shape.corner.y - shape.center.y);
  return shape.orientation === 'horizontal'
    ? { a: dx, b: dy }
    : { a: dy, b: dx };
}

export function hyperbolaEquation(shape: HyperbolaShape): GeometryEquation {
  const { a, b } = hyperbolaParams(shape);
  const xTerm = texShiftedTerm('x', shape.center.x);
  const yTerm = texShiftedTerm('y', shape.center.y);
  const xPlain = plainShiftedTerm('x', shape.center.x);
  const yPlain = plainShiftedTerm('y', shape.center.y);
  if (shape.orientation === 'horizontal') {
    return {
      tex: `\\frac{${xTerm}}{${num(a * a)}} - \\frac{${yTerm}}{${num(b * b)}} = 1`,
      plain: `${xPlain}/${num(a * a)} − ${yPlain}/${num(b * b)} = 1`,
      title: '双曲线',
    };
  }
  return {
    tex: `\\frac{${yTerm}}{${num(a * a)}} - \\frac{${xTerm}}{${num(b * b)}} = 1`,
    plain: `${yPlain}/${num(a * a)} − ${xPlain}/${num(b * b)} = 1`,
    title: '双曲线',
  };
}

export function geometryEquation(shape: Geometry): GeometryEquation {
  switch (shape.kind) {
    case 'line':
      return lineEquation(shape);
    case 'circle':
      return circleEquation(shape);
    case 'ellipse':
      return ellipseEquation(shape);
    case 'parabola':
      return parabolaEquation(shape);
    case 'hyperbola':
      return hyperbolaEquation(shape);
  }
}

/** n−1 interior division points between A and B. */
export function divisionPoints(a: Point2, b: Point2, n: number): Point2[] {
  const count = Math.max(0, Math.floor(n) - 1);
  const points: Point2[] = [];
  for (let k = 1; k <= count; k += 1) {
    const t = k / Math.floor(n);
    points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return points;
}

export function geometryCenter(shape: Geometry): Point2 {
  switch (shape.kind) {
    case 'line':
      return { x: (shape.a.x + shape.b.x) / 2, y: (shape.a.y + shape.b.y) / 2 };
    case 'circle':
      return shape.center;
    case 'ellipse':
      return shape.center;
    case 'parabola':
      return shape.vertex;
    case 'hyperbola':
      return shape.center;
  }
}
