import type { Item2D, Point2 } from '../../app/types';
import { analyze2DItem } from './analysis';
import type {
  ExplicitAnalysis,
  ImplicitAnalysis,
  ParametricAnalysis,
} from './analysis';

export interface TangentAngleTarget {
  item: Item2D;
  params: Record<string, number>;
  view: [number, number, number, number];
  desiredAngle: number;
  currentPoint: Point2 | null;
}

function angleError(a: number, b: number): number {
  let difference = ((a - b) % Math.PI + Math.PI) % Math.PI;
  if (difference > Math.PI / 2) difference = Math.PI - difference;
  return Math.abs(difference);
}

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function scopeFor(params: Record<string, number>, variables: Record<string, number>): Record<string, number> {
  return { ...params, ...variables };
}

interface AngleCandidate {
  point: Point2;
  angle: number;
}

const implicitCandidateCache = new Map<string, AngleCandidate[]>();

export function findTangentPointForAngle(target: TangentAngleTarget): Point2 | null {
  const analysis = analyze2DItem(target.item);
  if (analysis.errors.length > 0) return null;
  const params = { ...target.params };
  const xMin = Math.min(target.view[0], target.view[2]);
  const xMax = Math.max(target.view[0], target.view[2]);
  const yMin = Math.min(target.view[1], target.view[3]);
  const yMax = Math.max(target.view[1], target.view[3]);
  const bestHolder: { value: { point: Point2; score: number; error: number } | null } = {
    value: null,
  };

  const consider = (point: Point2, tangentAngle: number) => {
    if (!finitePoint(point) || !Number.isFinite(tangentAngle)) return;
    const error = angleError(tangentAngle, target.desiredAngle);
    if (error > 0.03) return;
    const distance = target.currentPoint
      ? Math.hypot(point.x - target.currentPoint.x, point.y - target.currentPoint.y)
      : 0;
    const score = error * 20 + distance * 0.002;
    if (!bestHolder.value || score < bestHolder.value.score) {
      bestHolder.value = { point, score, error };
    }
  };

  if (target.item.kind === 'explicit') {
    const expression = (analysis as ExplicitAnalysis).expr;
    if (!expression.ok) return null;
    const evaluate = (x: number) => expression.evaluate(scopeFor(params, { x }));
    const samples = 520;
    for (let index = 0; index <= samples; index += 1) {
      const x = xMin + ((xMax - xMin) * index) / samples;
      const y = evaluate(x);
      if (!Number.isFinite(y)) continue;
      const h = 1e-4 * Math.max(1, Math.abs(x));
      const slope = (evaluate(x + h) - evaluate(x - h)) / (2 * h);
      if (!Number.isFinite(slope)) continue;
      consider({ x, y }, Math.atan2(slope, 1));
    }
  } else if (target.item.kind === 'parametric') {
    const parametric = analysis as ParametricAnalysis;
    if (!parametric.x.ok || !parametric.y.ok) return null;
    const samples = 720;
    for (let index = 0; index <= samples; index += 1) {
      const t = target.item.tMin + ((target.item.tMax - target.item.tMin) * index) / samples;
      const x = parametric.x.evaluate(scopeFor(params, { t }));
      const y = parametric.y.evaluate(scopeFor(params, { t }));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const h = 1e-4 * Math.max(1, Math.abs(t));
      const dx = parametric.x.evaluate(scopeFor(params, { t: t + h })) -
        parametric.x.evaluate(scopeFor(params, { t: t - h }));
      const dy = parametric.y.evaluate(scopeFor(params, { t: t + h })) -
        parametric.y.evaluate(scopeFor(params, { t: t - h }));
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-12) continue;
      consider({ x, y }, Math.atan2(dy, dx));
    }
  } else {
    const expression = (analysis as ImplicitAnalysis).expr;
    if (!expression.ok) return null;
    const evaluate = (x: number, y: number) => expression.evaluate(scopeFor(params, { x, y }));
    const cacheKey = [
      target.item.id,
      expression.normalized,
      xMin,
      xMax,
      yMin,
      yMax,
      Object.keys(params)
        .sort()
        .map((name) => `${name}:${params[name]}`)
        .join(','),
    ].join('|');
    let candidates = implicitCandidateCache.get(cacheKey);
    if (!candidates) {
      candidates = [];
      const grid = 420;
      const h = Math.max(1e-4, Math.max(xMax - xMin, yMax - yMin) / 900);
      for (let iy = 0; iy < grid; iy += 1) {
        const y0 = yMin + ((yMax - yMin) * iy) / grid;
        const y1 = yMin + ((yMax - yMin) * (iy + 1)) / grid;
        for (let ix = 0; ix < grid; ix += 1) {
          const x0 = xMin + ((xMax - xMin) * ix) / grid;
          const x1 = xMin + ((xMax - xMin) * (ix + 1)) / grid;
          const corners = [
            { x: x0, y: y0, value: evaluate(x0, y0) },
            { x: x1, y: y0, value: evaluate(x1, y0) },
            { x: x1, y: y1, value: evaluate(x1, y1) },
            { x: x0, y: y1, value: evaluate(x0, y1) },
          ];
          for (let index = 0; index < 4; index += 1) {
            const a = corners[index];
            const b = corners[(index + 1) % 4];
            if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
            if (a.value === 0 || b.value === 0 || a.value * b.value < 0) {
              const t = Math.abs(a.value) + Math.abs(b.value) < 1e-12
                ? 0.5
                : Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value));
              const px = a.x + (b.x - a.x) * t;
              const py = a.y + (b.y - a.y) * t;
              const fx = (evaluate(px + h, py) - evaluate(px - h, py)) / (2 * h);
              const fy = (evaluate(px, py + h) - evaluate(px, py - h)) / (2 * h);
              if (!Number.isFinite(fx) || !Number.isFinite(fy) || Math.hypot(fx, fy) < 1e-9) continue;
              candidates.push({ point: { x: px, y: py }, angle: Math.atan2(fx, -fy) });
            }
          }
        }
      }
      if (implicitCandidateCache.size > 8) {
        const first = implicitCandidateCache.keys().next().value;
        if (first) implicitCandidateCache.delete(first);
      }
      implicitCandidateCache.set(cacheKey, candidates);
    }
    for (const candidate of candidates) consider(candidate.point, candidate.angle);
  }

  const best = bestHolder.value;
  return best && best.error <= 0.035 ? best.point : null;}
