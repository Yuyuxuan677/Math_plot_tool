import type { Item2D, Point2 } from '../../app/types';
import { recognizeConic, type ConicInfo } from '../locus/tangentLocus';
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
const conicCache = new Map<string, ConicInfo | null>();

function conicFor(item: Item2D, params: Record<string, number>): ConicInfo | null {
  if (item.kind !== 'implicit') return null;
  const key = [
    item.id,
    item.expr,
    Object.keys(params)
      .sort()
      .map((name) => `${name}:${params[name]}`)
      .join(','),
  ].join('|');
  if (conicCache.has(key)) return conicCache.get(key) ?? null;
  const conic = recognizeConic(item, params);
  conicCache.set(key, conic);
  if (conicCache.size > 32) {
    const first = conicCache.keys().next().value;
    if (first) conicCache.delete(first);
  }
  return conic;
}

function exactConicTangentPoint(
  conic: ConicInfo,
  desiredAngle: number,
  currentPoint: Point2 | null,
): Point2 | null {
  if (!['circle', 'ellipse', 'hyperbola'].includes(conic.kind)) return null;
  const nx = -Math.sin(desiredAngle);
  const ny = Math.cos(desiredAngle);
  const a2 = conic.a2;
  const b2 = conic.b2;
  if (!a2 || !b2) return null;
  let candidates: Point2[];
  if (conic.kind === 'hyperbola') {
    const denominator = a2 * nx * nx - b2 * ny * ny;
    if (denominator <= 1e-12) return null;
    const scale = 1 / Math.sqrt(denominator);
    candidates = [
      { x: conic.center.x + a2 * nx * scale, y: conic.center.y - b2 * ny * scale },
      { x: conic.center.x - a2 * nx * scale, y: conic.center.y + b2 * ny * scale },
    ];
  } else {
    const denominator = a2 * nx * nx + b2 * ny * ny;
    if (denominator <= 1e-12) return null;
    const scale = 1 / Math.sqrt(denominator);
    candidates = [
      { x: conic.center.x + a2 * nx * scale, y: conic.center.y + b2 * ny * scale },
      { x: conic.center.x - a2 * nx * scale, y: conic.center.y - b2 * ny * scale },
    ];
  }
  if (!currentPoint) return candidates[0];
  return candidates.reduce((best, point) => {
    const bestDistance = Math.hypot(best.x - currentPoint.x, best.y - currentPoint.y);
    const distance = Math.hypot(point.x - currentPoint.x, point.y - currentPoint.y);
    return distance < bestDistance ? point : best;
  });
}

/**
 * Follow the current connected branch of an implicit curve instead of searching
 * the whole view. The ellipse has two parallel tangents for a given angle, so a
 * global nearest-point search can jump from one to the other and make the
 * tangent intersection teleport.
 */
export function findLocalImplicitTangentPoint(
  evaluate: (x: number, y: number) => number,
  start: Point2,
  desiredAngle: number,
  scale: number,
): Point2 | null {
  const step = Math.max(1e-4, scale / 1200);
  const maxSteps = 1600;
  const project = (point: Point2): Point2 | null => {
    let x = point.x;
    let y = point.y;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const value = evaluate(x, y);
      if (!Number.isFinite(value)) return null;
      const h = 1e-4 * Math.max(1, Math.abs(x), Math.abs(y));
      const fx = (evaluate(x + h, y) - evaluate(x - h, y)) / (2 * h);
      const fy = (evaluate(x, y + h) - evaluate(x, y - h)) / (2 * h);
      const norm = fx * fx + fy * fy;
      if (!Number.isFinite(norm) || norm < 1e-12) return null;
      const correction = value / norm;
      x -= correction * fx;
      y -= correction * fy;
      if (Math.abs(value) < 1e-10) break;
    }
    return { x, y };
  };
  const tangentAt = (point: Point2): { angle: number; tx: number; ty: number } | null => {
    const h = 1e-4 * Math.max(1, Math.abs(point.x), Math.abs(point.y));
    const fx = (evaluate(point.x + h, point.y) - evaluate(point.x - h, point.y)) / (2 * h);
    const fy = (evaluate(point.x, point.y + h) - evaluate(point.x, point.y - h)) / (2 * h);
    const length = Math.hypot(fx, fy);
    if (!Number.isFinite(length) || length < 1e-10) return null;
    return { angle: Math.atan2(fx, -fy), tx: -fy / length, ty: fx / length };
  };
  const projected = project(start);
  if (!projected) return null;
  const initial = tangentAt(projected);
  if (!initial) return null;
  if (angleError(initial.angle, desiredAngle) <= 0.012) return projected;

  let best: { point: Point2; error: number; steps: number; score: number } | null = null;
  for (const direction of [1, -1]) {
    let point = projected;
    let tangent = initial;
    for (let index = 1; index <= maxSteps; index += 1) {
      const next = project({
        x: point.x + direction * tangent.tx * step,
        y: point.y + direction * tangent.ty * step,
      });
      if (!next) break;
      const nextTangent = tangentAt(next);
      if (!nextTangent) break;
      // Keep marching in the same direction; a flipped tangent would indicate
      // that projection landed on another branch.
      if (absoluteAngleDifference(nextTangent.angle, tangent.angle) > Math.PI / 2) {
        break;
      }
      point = next;
      tangent = nextTangent;
      const error = angleError(tangent.angle, desiredAngle);
      // Prefer the closest crossing along this branch. Without the step term
      // the far parallel tangent can win merely because its discrete angle is
      // slightly more accurate.
      const score = index + error * 80;
      if (!best || score < best.score) {
        best = { point, error, steps: index, score };
      }
      if (error <= 0.012) break;
    }
  }
  if (!best || best.error > 0.05) return null;
  // Refine the crossing with progressively smaller steps. The coarse march
  // finds the correct parallel tangent, but its discrete step can leave a
  // visible angle error; this keeps the actual angle accurate.
  let refined = best.point;
  let refineStep = step;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const tangent = tangentAt(refined);
    if (!tangent) break;
    let candidateBest: { point: Point2; error: number } = {
      point: refined,
      error: angleError(tangent.angle, desiredAngle),
    };
    for (let offset = -3; offset <= 3; offset += 1) {
      if (offset === 0) continue;
      const candidate = project({
        x: refined.x + tangent.tx * refineStep * offset,
        y: refined.y + tangent.ty * refineStep * offset,
      });
      if (!candidate) continue;
      const candidateTangent = tangentAt(candidate);
      if (!candidateTangent) continue;
      const candidateError = angleError(candidateTangent.angle, desiredAngle);
      if (candidateError < candidateBest.error) {
        candidateBest = { point: candidate, error: candidateError };
      }
    }
    refined = candidateBest.point;
    if (candidateBest.error <= 0.0005) break;
    refineStep /= 3;
  }
  return refined;
}

function absoluteAngleDifference(a: number, b: number): number {
  const difference = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(difference, Math.PI - difference);
}

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
    if (error > 0.12) return;
    const distance = target.currentPoint
      ? Math.hypot(point.x - target.currentPoint.x, point.y - target.currentPoint.y)
      : 0;
    // Continuity first: among all valid-angle candidates choose the one nearest
    // to the current point. Angle error only breaks ties, otherwise the solver
    // can hop between the two parallel tangents that satisfy the same angle.
    const score = distance + error * 0.02;
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
    const conic = conicFor(target.item, params);
    if (conic) {
      const exact = exactConicTangentPoint(conic, target.desiredAngle, target.currentPoint);
      if (exact) return exact;
    }
    if (target.currentPoint) {
      const local = findLocalImplicitTangentPoint(
        evaluate,
        target.currentPoint,
        target.desiredAngle,
        Math.max(xMax - xMin, yMax - yMin),
      );
      if (local) return local;
    }
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
  return best ? best.point : null;
}
