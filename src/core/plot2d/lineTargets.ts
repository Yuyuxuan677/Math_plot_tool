import type { Item2D, Point2 } from '../../app/types';
import {
  analyze2DItem,
  type ExplicitAnalysis,
  type ImplicitAnalysis,
  type ParametricAnalysis,
} from './analysis';

export interface LineInfo {
  point: Point2;
  slope: number;
  vertical: boolean;
}

const lineCache = new Map<string, LineInfo | null>();

function cacheKey(item: Item2D, params: Record<string, number>): string {
  const values = Object.keys(params)
    .sort()
    .map((key) => `${key}:${params[key]}`)
    .join(',');
  const expression =
    item.kind === 'parametric'
      ? `${item.xExpr}|${item.yExpr}|${item.tMin}|${item.tMax}`
      : item.expr;
  return `${item.kind}|${expression}|${values}`;
}

function explicitLine(
  expression: ExplicitAnalysis,
  params: Record<string, number>,
): LineInfo | null {
  const expr = expression.expr;
  if (!expr.ok) return null;
  const evaluate = (x: number) => {
    const value = expr.evaluate({ ...params, x });
    return Number.isFinite(value) ? value : NaN;
  };
  const values = [-2, -1, 0, 1, 2].map(evaluate);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const slopes = [values[1] - values[0], values[2] - values[1], values[3] - values[2], values[4] - values[3]];
  const slope = (values[4] - values[0]) / 4;
  const tolerance = 1e-5 * (1 + Math.abs(slope));
  if (slopes.some((value) => Math.abs(value - slope) > tolerance)) return null;
  return { point: { x: 0, y: values[2] }, slope, vertical: false };
}

function implicitLine(
  expression: ImplicitAnalysis,
  params: Record<string, number>,
): LineInfo | null {
  const expr = expression.expr;
  if (!expr.ok) return null;
  const evaluate = (x: number, y: number) => {
    const value = expr.evaluate({ ...params, x, y });
    return Number.isFinite(value) ? value : NaN;
  };
  const h = 1e-3;
  const gradient = (x: number, y: number) => {
    const f0 = evaluate(x, y);
    const fx = (evaluate(x + h, y) - evaluate(x - h, y)) / (2 * h);
    const fy = (evaluate(x, y + h) - evaluate(x, y - h)) / (2 * h);
    return Number.isFinite(f0) && Number.isFinite(fx) && Number.isFinite(fy)
      ? { f0, fx, fy }
      : null;
  };
  const probes = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const gradients = probes.map((probe) => gradient(probe.x, probe.y));
  if (gradients.some((value) => !value)) return null;
  const first = gradients[0];
  if (!first || Math.hypot(first.fx, first.fy) < 1e-10) return null;
  const nx = first.fx;
  const ny = first.fy;
  const norm = Math.hypot(nx, ny);
  for (const current of gradients) {
    if (!current) return null;
    const currentNorm = Math.hypot(current.fx, current.fy);
    if (currentNorm < 1e-10) return null;
    const cross = Math.abs(nx * current.fy - ny * current.fx) / (norm * currentNorm);
    const dot = (nx * current.fx + ny * current.fy) / (norm * currentNorm);
    if (cross > 1e-6 || dot < 0.999999) return null;
  }
  const c = first.f0;
  const point = {
    x: (-c * nx) / (norm * norm),
    y: (-c * ny) / (norm * norm),
  };
  if (!Number.isFinite(evaluate(point.x, point.y))) return null;
  if (Math.abs(evaluate(point.x, point.y)) > 1e-6 * Math.max(1, Math.abs(c))) return null;
  const vertical = Math.abs(ny) < 1e-8 * norm;
  return { point, slope: vertical ? Infinity : -nx / ny, vertical };
}

function parametricLine(
  expression: ParametricAnalysis,
  params: Record<string, number>,
): LineInfo | null {
  const xExpr = expression.x;
  const yExpr = expression.y;
  if (!xExpr.ok || !yExpr.ok) return null;
  const evaluate = (t: number) => {
    const x = xExpr.evaluate({ ...params, t });
    const y = yExpr.evaluate({ ...params, t });
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  const first = evaluate(expression.item.tMin);
  const middle = evaluate((expression.item.tMin + expression.item.tMax) / 2);
  const last = evaluate(expression.item.tMax);
  if (!first || !middle || !last) return null;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) < 1e-8) return null;
  const cross = Math.abs(dx * (middle.y - first.y) - dy * (middle.x - first.x));
  if (cross > 1e-6 * Math.hypot(dx, dy)) return null;
  const vertical = Math.abs(dx) < 1e-8 * Math.hypot(dx, dy);
  return { point: first, slope: vertical ? Infinity : dy / dx, vertical };
}

export function detectItemLine(item: Item2D, params: Record<string, number>): LineInfo | null {
  if (!item.visible) return null;
  const key = cacheKey(item, params);
  if (lineCache.has(key)) return lineCache.get(key) ?? null;
  const analysis = analyze2DItem(item);
  let result: LineInfo | null = null;
  if (analysis.errors.length === 0) {
    if (item.kind === 'explicit') result = explicitLine(analysis as ExplicitAnalysis, params);
    else if (item.kind === 'implicit') result = implicitLine(analysis as ImplicitAnalysis, params);
    else result = parametricLine(analysis as ParametricAnalysis, params);
  }
  lineCache.set(key, result);
  if (lineCache.size > 64) {
    const first = lineCache.keys().next().value;
    if (first) lineCache.delete(first);
  }
  return result;
}

export function projectPointToLine(point: Point2, line: LineInfo): Point2 {
  if (line.vertical) return { x: line.point.x, y: point.y };
  const dx = point.x - line.point.x;
  const dy = point.y - line.point.y;
  const t = (dx + line.slope * dy) / (1 + line.slope * line.slope);
  return { x: line.point.x + t, y: line.point.y + line.slope * t };
}
