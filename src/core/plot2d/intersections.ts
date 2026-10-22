import type { Geometry, Item2D, Point2 } from '../../app/types';
import { analyze2DItem } from './analysis';
import type {
  ExplicitAnalysis,
  ImplicitAnalysis,
  ParametricAnalysis,
} from './analysis';
import {
  ellipseParams,
  hyperbolaParams,
  parabolaParams,
} from '../geometry/equations';

type BoundingBox = [number, number, number, number];

interface SampleSegment {
  fn: (t: number) => Point2;
  min: number;
  max: number;
}

interface LineEquation {
  vertical: boolean;
  /** x = verticalX for vertical lines. */
  verticalX: number;
  /** y = m x + b for non-vertical lines. */
  m: number;
  b: number;
}

export interface CurveModel {
  id: string;
  color: string;
  implicit?: (x: number, y: number) => number;
  segments: SampleSegment[];
  line?: LineEquation;
}

const EPS = 1e-9;
const ROOT_SAMPLES = 600;
const POLY_SAMPLES = 320;

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function lineFromPoints(a: Point2, b: Point2): LineEquation | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < EPS) return null;
  if (Math.abs(dx) < EPS) {
    return { vertical: true, verticalX: a.x, m: Infinity, b: 0 };
  }
  const m = dy / dx;
  return { vertical: false, verticalX: 0, m, b: a.y - m * a.x };
}

function lineSamples(a: Point2, b: Point2, bbox: BoundingBox): SampleSegment[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return [];
  const ux = dx / length;
  const uy = dy / length;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const xMin = Math.min(bbox[0], bbox[2]);
  const xMax = Math.max(bbox[0], bbox[2]);
  const yMin = Math.min(bbox[1], bbox[3]);
  const yMax = Math.max(bbox[1], bbox[3]);
  const span = Math.max(xMax - xMin, yMax - yMin) * 0.9;
  return [{ fn: (t) => ({ x: cx + ux * t, y: cy + uy * t }), min: -span, max: span }];
}

function buildItemModel(
  item: Item2D,
  params: Record<string, number>,
  bbox: BoundingBox,
): CurveModel | null {
  if (!item.visible) return null;
  const analysis = analyze2DItem(item);
  if (analysis.errors.length > 0) return null;
  const xMin = Math.min(bbox[0], bbox[2]);
  const xMax = Math.max(bbox[0], bbox[2]);
  const yMin = Math.min(bbox[1], bbox[3]);
  const yMax = Math.max(bbox[1], bbox[3]);

  if (item.kind === 'explicit') {
    const explicit = analysis as ExplicitAnalysis;
    if (!explicit.expr.ok) return null;
    const expr = explicit.expr;
    const f = (x: number): number => {
      const value = expr.evaluate({ ...params, x });
      return Number.isFinite(value) ? value : NaN;
    };
    return {
      id: item.id,
      color: item.color,
      implicit: (x, y) => y - f(x),
      segments: [
        {
          fn: (t) => ({ x: t, y: f(t) }),
          min: xMin,
          max: xMax,
        },
      ],
    };
  }

  if (item.kind === 'parametric') {
    const parametric = analysis as ParametricAnalysis;
    if (!parametric.x.ok || !parametric.y.ok) return null;
    const xExpr = parametric.x;
    const yExpr = parametric.y;
    return {
      id: item.id,
      color: item.color,
      segments: [
        {
          fn: (t) => ({
            x: xExpr.evaluate({ ...params, t }),
            y: yExpr.evaluate({ ...params, t }),
          }),
          min: item.tMin,
          max: item.tMax,
        },
      ],
    };
  }

  const implicit = analysis as ImplicitAnalysis;
  if (!implicit.expr.ok) return null;
  const expr = implicit.expr;
  return {
    id: item.id,
    color: item.color,
    implicit: (x, y) => {
      const value = expr.evaluate({ ...params, x, y });
      return Number.isFinite(value) ? value : NaN;
    },
    segments: [],
  };
}

function buildGeometryModel(shape: Geometry, bbox: BoundingBox): CurveModel | null {
  if (!shape.visible) return null;
  const color = shape.color;
  if (shape.kind === 'line') {
    const line = lineFromPoints(shape.a, shape.b);
    if (!line) return null;
    return {
      id: shape.id,
      color,
      line,
      implicit: (x, y) =>
        line.vertical ? x - line.verticalX : y - (line.m * x + line.b),
      segments: lineSamples(shape.a, shape.b, bbox),
    };
  }
  if (shape.kind === 'circle') {
    const r = Math.hypot(shape.through.x - shape.center.x, shape.through.y - shape.center.y);
    if (r < EPS) return null;
    const cx = shape.center.x;
    const cy = shape.center.y;
    return {
      id: shape.id,
      color,
      implicit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 - r * r,
      segments: [
        {
          fn: (t) => ({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }),
          min: 0,
          max: Math.PI * 2,
        },
      ],
    };
  }
  if (shape.kind === 'ellipse') {
    const { a, b } = ellipseParams(shape);
    if (a < EPS || b < EPS) return null;
    const cx = shape.center.x;
    const cy = shape.center.y;
    return {
      id: shape.id,
      color,
      implicit: (x, y) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 - 1,
      segments: [
        {
          fn: (t) => ({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) }),
          min: 0,
          max: Math.PI * 2,
        },
      ],
    };
  }
  if (shape.kind === 'parabola') {
    const { a } = parabolaParams(shape);
    if (!Number.isFinite(a) || Math.abs(a) < 1e-12) return null;
    const h = shape.vertex.x;
    const k = shape.vertex.y;
    if (shape.orientation === 'vertical') {
      return {
        id: shape.id,
        color,
        implicit: (x, y) => y - (k + a * (x - h) ** 2),
        segments: [
          {
            fn: (t) => ({ x: t, y: k + a * (t - h) ** 2 }),
            min: -10,
            max: 10,
          },
        ],
      };
    }
    return {
      id: shape.id,
      color,
      implicit: (x, y) => x - (h + a * (y - k) ** 2),
      segments: [
        {
          fn: (t) => ({ x: h + a * (t - k) ** 2, y: t }),
          min: -10,
          max: 10,
        },
      ],
    };
  }

  const { a, b } = hyperbolaParams(shape);
  if (a < EPS || b < EPS) return null;
  const cx = shape.center.x;
  const cy = shape.center.y;
  const horizontal = shape.orientation === 'horizontal';
  const tX = Math.acosh(Math.max(1.0001, 1 + 20 / a));
  const tY = Math.asinh(Math.max(1, 20 / b));
  const tMax = Math.min(8, Math.max(1.4, Math.max(tX, tY)));
  const branches: SampleSegment[] = [];
  if (horizontal) {
    for (const sign of [-1, 1]) {
      branches.push({
        fn: (t) => ({
          x: cx + sign * a * Math.cosh(t),
          y: cy + b * Math.sinh(t),
        }),
        min: -tMax,
        max: tMax,
      });
    }
    return {
      id: shape.id,
      color,
      implicit: (x, y) => ((x - cx) / a) ** 2 - ((y - cy) / b) ** 2 - 1,
      segments: branches,
    };
  }
  for (const sign of [-1, 1]) {
    branches.push({
      fn: (t) => ({
        x: cx + b * Math.sinh(t),
        y: cy + sign * a * Math.cosh(t),
      }),
      min: -tMax,
      max: tMax,
    });
  }
  return {
    id: shape.id,
    color,
    implicit: (x, y) => ((y - cy) / a) ** 2 - ((x - cx) / b) ** 2 - 1,
    segments: branches,
  };
}

export function buildCurveModels(
  items2d: Item2D[],
  geometry: Geometry[],
  params: Record<string, number>,
  bbox: BoundingBox,
): Map<string, CurveModel> {
  const result = new Map<string, CurveModel>();
  for (const item of items2d) {
    const model = buildItemModel(item, params, bbox);
    if (model) result.set(item.id, model);
  }
  for (const shape of geometry) {
    const model = buildGeometryModel(shape, bbox);
    if (model) result.set(shape.id, model);
  }
  return result;
}

function dedupe(points: Point2[]): Point2[] {
  const result: Point2[] = [];
  for (const point of points) {
    if (!finitePoint(point)) continue;
    if (result.some((existing) => Math.hypot(existing.x - point.x, existing.y - point.y) < 1e-4)) {
      continue;
    }
    result.push(point);
  }
  return result.sort((a, b) => a.x - b.x || a.y - b.y);
}

function bisectRoot(
  segment: SampleSegment,
  implicit: (x: number, y: number) => number,
  left: number,
  right: number,
): Point2 | null {
  let lo = left;
  let hi = right;
  const start = segment.fn(lo);
  let flo = implicit(start.x, start.y);
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const point = segment.fn(mid);
    const fmid = implicit(point.x, point.y);
    if (!Number.isFinite(fmid)) return null;
    if (Math.abs(fmid) < 1e-10) return point;
    if (Number.isFinite(flo) && flo * fmid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return segment.fn((lo + hi) / 2);
}

function rootsOnSegment(
  segment: SampleSegment,
  implicit: (x: number, y: number) => number,
): Point2[] {
  const points: Point2[] = [];
  const span = segment.max - segment.min;
  if (!Number.isFinite(span) || span <= 0) return points;
  let prevT = segment.min;
  let prevPoint = segment.fn(prevT);
  let prevValue = implicit(prevPoint.x, prevPoint.y);
  if (Number.isFinite(prevValue) && Math.abs(prevValue) < 1e-8) points.push(prevPoint);
  for (let index = 1; index <= ROOT_SAMPLES; index += 1) {
    const t = segment.min + (span * index) / ROOT_SAMPLES;
    const point = segment.fn(t);
    const value = implicit(point.x, point.y);
    if (!finitePoint(point) || !Number.isFinite(value)) {
      prevT = t;
      prevPoint = point;
      prevValue = value;
      continue;
    }
    if (Number.isFinite(prevValue) && prevValue * value < 0) {
      const root = bisectRoot(segment, implicit, prevT, t);
      if (root) points.push(root);
    } else if (Math.abs(value) < 1e-8) {
      points.push(point);
    }
    prevT = t;
    prevPoint = point;
    prevValue = value;
  }
  return points;
}

function lineLineIntersection(a: LineEquation, b: LineEquation): Point2[] {
  if (a.vertical && b.vertical) return [];
  if (a.vertical) {
    return [{ x: a.verticalX, y: b.m * a.verticalX + b.b }];
  }
  if (b.vertical) {
    return [{ x: b.verticalX, y: a.m * b.verticalX + a.b }];
  }
  if (Math.abs(a.m - b.m) < 1e-9) return [];
  const x = (b.b - a.b) / (a.m - b.m);
  return [{ x, y: a.m * x + a.b }];
}

function segmentIntersection(p1: Point2, p2: Point2, q1: Point2, q2: Point2): Point2 | null {
  const rX = p2.x - p1.x;
  const rY = p2.y - p1.y;
  const sX = q2.x - q1.x;
  const sY = q2.y - q1.y;
  const denominator = rX * sY - rY * sX;
  if (Math.abs(denominator) < 1e-10) return null;
  const t = ((q1.x - p1.x) * sY - (q1.y - p1.y) * sX) / denominator;
  const u = ((q1.x - p1.x) * rY - (q1.y - p1.y) * rX) / denominator;
  if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return { x: p1.x + t * rX, y: p1.y + t * rY };
}

function polylineIntersections(a: CurveModel, b: CurveModel): Point2[] {
  const points: Point2[] = [];
  const sample = (segments: SampleSegment[]): Point2[][] =>
    segments.map((segment) => {
      const result: Point2[] = [];
      const span = segment.max - segment.min;
      for (let i = 0; i <= POLY_SAMPLES; i += 1) {
        const point = segment.fn(segment.min + (span * i) / POLY_SAMPLES);
        if (finitePoint(point)) result.push(point);
      }
      return result;
    });
  const aLines = sample(a.segments);
  const bLines = sample(b.segments);
  for (const lineA of aLines) {
    for (let i = 0; i + 1 < lineA.length; i += 1) {
      for (const lineB of bLines) {
        for (let j = 0; j + 1 < lineB.length; j += 1) {
          const point = segmentIntersection(lineA[i], lineA[i + 1], lineB[j], lineB[j + 1]);
          if (point) points.push(point);
        }
      }
    }
  }
  return points;
}

export function computeIntersections(a: CurveModel, b: CurveModel): Point2[] {
  if (a.line && b.line) return dedupe(lineLineIntersection(a.line, b.line));

  const roots: Point2[] = [];
  if (a.segments.length > 0 && b.implicit) {
    for (const segment of a.segments) roots.push(...rootsOnSegment(segment, b.implicit));
  } else if (b.segments.length > 0 && a.implicit) {
    for (const segment of b.segments) roots.push(...rootsOnSegment(segment, a.implicit));
  } else if (a.segments.length > 0 && b.segments.length > 0) {
    roots.push(...polylineIntersections(a, b));
  }
  return dedupe(roots).slice(0, 8);
}
