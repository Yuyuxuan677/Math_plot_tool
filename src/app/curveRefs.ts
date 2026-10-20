import type { CurveRef, Geometry, Item2D } from './types';
import { geometryTitle } from '../core/geometry/equations';

function shorten(value: string, max = 22): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function item2DLabel(item: Item2D): string {
  if (item.kind === 'explicit') return `函数 y = ${shorten(item.expr)}`;
  if (item.kind === 'parametric') return `参数曲线 (${shorten(item.xExpr)}, ${shorten(item.yExpr)})`;
  return `方程 ${shorten(item.expr)}`;
}

export function geometryLabel(geometry: Geometry): string {
  const base = geometryTitle(geometry.kind);
  switch (geometry.kind) {
    case 'line':
      return `${base} (${geometry.a.x.toFixed(1)}, ${geometry.a.y.toFixed(1)})`;
    case 'circle':
      return `${base} 圆心 (${geometry.center.x.toFixed(1)}, ${geometry.center.y.toFixed(1)})`;
    case 'ellipse':
      return `${base} (${geometry.center.x.toFixed(1)}, ${geometry.center.y.toFixed(1)})`;
    case 'parabola':
      return `${base} (${geometry.vertex.x.toFixed(1)}, ${geometry.vertex.y.toFixed(1)})`;
    case 'hyperbola':
      return `${base} (${geometry.center.x.toFixed(1)}, ${geometry.center.y.toFixed(1)})`;
  }
}

export function buildCurveRefs(items2d: Item2D[], geometry: Geometry[], excludeId?: string): CurveRef[] {
  const refs: CurveRef[] = [];
  for (const item of items2d) {
    if (item.id === excludeId) continue;
    refs.push({ id: item.id, label: item2DLabel(item), kind: item.kind });
  }
  for (const shape of geometry) {
    if (shape.id === excludeId) continue;
    refs.push({ id: shape.id, label: geometryLabel(shape), kind: shape.kind });
  }
  return refs;
}
