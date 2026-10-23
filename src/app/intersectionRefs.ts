import type { Item2D, MarkedPoint, MarkerLine } from './types';
import { item2DLabel } from './curveRefs';

export type IntersectionObjectKind = 'curve' | 'axis' | 'tangent' | 'line';

export interface IntersectionObject {
  id: string;
  label: string;
  kind: IntersectionObjectKind;
}

export function axisObjectId(axis: 'x' | 'y'): string {
  return `axis:${axis}`;
}

export function tangentObjectId(ownerId: string, tangentId: string): string {
  return `tan:${ownerId}:${tangentId}`;
}

export function markerLineObjectId(lineId: string): string {
  return `line:${lineId}`;
}

export function buildIntersectionObjects(
  items2d: Item2D[],
  markerLines: MarkerLine[],
  markedPoints: MarkedPoint[],
): IntersectionObject[] {
  const objects: IntersectionObject[] = [
    { id: axisObjectId('x'), label: 'x 轴', kind: 'axis' },
    { id: axisObjectId('y'), label: 'y 轴', kind: 'axis' },
  ];

  for (const item of items2d) {
    objects.push({ id: item.id, label: item2DLabel(item), kind: 'curve' });
    item.tangents.forEach((tangent, index) => {
      objects.push({
        id: tangentObjectId(item.id, tangent.id),
        label: `${item2DLabel(item)} · 切线 ${index + 1}`,
        kind: 'tangent',
      });
    });
  }

  markerLines.forEach((line, index) => {
    const a = markedPoints.find((point) => point.id === line.aId);
    const b = markedPoints.find((point) => point.id === line.bId);
    objects.push({
      id: markerLineObjectId(line.id),
      label: `连线 ${index + 1}（${a?.name ?? '?'}—${b?.name ?? '?'}）`,
      kind: 'line',
    });
  });

  return objects;
}

export function defaultIntersectionIds(objects: IntersectionObject[]): [string, string] | null {
  const curves = objects.filter((object) => object.kind === 'curve');
  if (curves.length >= 2) return [curves[0].id, curves[1].id];
  if (curves.length === 1) {
    const axis = objects.find((object) => object.kind === 'axis');
    if (axis) return [curves[0].id, axis.id];
  }
  const nonAxis = objects.find(
    (object) => object.kind === 'tangent' || object.kind === 'line',
  );
  if (nonAxis) {
    const axis = objects.find((object) => object.kind === 'axis');
    if (axis) return [nonAxis.id, axis.id];
  }
  if (objects.length >= 2) return [objects[0].id, objects[1].id];
  return null;
}
