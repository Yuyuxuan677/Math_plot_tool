import type { Item2D, MarkedPoint, MarkerLine, PerpendicularMark } from './types';
import { item2DLabel } from './curveRefs';
import { toFiniteNumber } from './utils';
import { detectItemLine } from '../core/plot2d/lineTargets';

export interface PerpendicularLineOption {
  id: string;
  label: string;
}

export function buildPerpendicularLineOptions(
  items2d: Item2D[],
  markerLines: MarkerLine[],
  markedPoints: MarkedPoint[],
  paramValues: Record<string, string>,
  perpendiculars: PerpendicularMark[] = [],
): PerpendicularLineOption[] {
  const params: Record<string, number> = {};
  for (const [name, value] of Object.entries(paramValues)) {
    params[name] = toFiniteNumber(value, 0);
  }
  const options: PerpendicularLineOption[] = [
    { id: 'axis:x', label: 'x 轴' },
    { id: 'axis:y', label: 'y 轴' },
  ];
  markerLines.forEach((line, index) => {
    const a = markedPoints.find((point) => point.id === line.aId);
    const b = markedPoints.find((point) => point.id === line.bId);
    options.push({
      id: `line:${line.id}`,
      label: `两点连线 ${index + 1}（${a?.name ?? '?'}—${b?.name ?? '?'}）`,
    });
  });
  for (const item of items2d) {
    item.tangents.forEach((tangent, index) => {
      options.push({
        id: `tan:${item.id}:${tangent.id}`,
        label: `${item2DLabel(item)} · 切线 ${index + 1}`,
      });
    });
    if (detectItemLine(item, params)) {
      options.push({
        id: `item:${item.id}`,
        label: `${item2DLabel(item)}（直线）`,
      });
    }
  }
  perpendiculars.forEach((mark, index) => {
    const point = markedPoints.find((item) => item.id === mark.pointId);
    options.push({
      id: `perp:${mark.id}`,
      label: `垂线 ${index + 1}（过 ${point?.name ?? '?'}）`,
    });
  });
  return options;
}

export function perpendicularLineLabel(
  lineId: string,
  items2d: Item2D[],
  markerLines: MarkerLine[],
  markedPoints: MarkedPoint[],
  paramValues: Record<string, string>,
  perpendiculars: PerpendicularMark[] = [],
): string {
  return (
    buildPerpendicularLineOptions(
      items2d,
      markerLines,
      markedPoints,
      paramValues,
      perpendiculars,
    ).find((option) => option.id === lineId)?.label ?? '直线已删除'
  );
}
