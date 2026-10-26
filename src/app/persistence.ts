import type {
  DivisionMark,
  Geometry,
  HyperbolaShape,
  Implicit3DItem,
  IntersectionMark,
  Item2D,
  Item3D,
  MarkedPoint,
  MarkerLine,
  Orientation,
  ParametricSurfaceItem,
  PerpendicularMark,
  PersistedState,
  Point2,
  Tangent,
  TangentAngleConstraint,
  TangentIntersectionMark,
  TangentRef,
} from './types';

const STORAGE_KEY = 'jiantu.mathplot.v1';
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pointValue(value: unknown): Point2 | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const y = value.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function orientationValue(value: unknown): Orientation {
  return value === 'vertical' ? 'vertical' : 'horizontal';
}

function tangentList(value: unknown): Tangent[] {
  if (!Array.isArray(value)) return [];
  const result: Tangent[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== 'string') continue;
    const point = pointValue(raw.point);
    const metaRaw = raw.meta;
    let meta: Tangent['meta'];
    if (isRecord(metaRaw)) {
      const slope = metaRaw.slope;
      const equation = metaRaw.equation;
      meta = {
        ...(typeof slope === 'number' && Number.isFinite(slope) ? { slope } : {}),
        ...(typeof equation === 'string' ? { equation } : {}),
      };
    }
    result.push({ id: raw.id, point, ...(meta ? { meta } : {}) });
  }
  return result;
}

function sanitizeItem2D(value: unknown): Item2D | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#2563eb';
  const visible = boolValue(value.visible, true);
  const tangents = tangentList(value.tangents);
  if (value.kind === 'explicit') {
    return {
      id: value.id,
      kind: 'explicit',
      color,
      visible,
      tangents,
      expr: stringValue(value.expr, 'x^2'),
      showDerivative: boolValue(value.showDerivative, false),
    };
  }
  if (value.kind === 'parametric') {
    return {
      id: value.id,
      kind: 'parametric',
      color,
      visible,
      tangents,
      xExpr: stringValue(value.xExpr, 'cos(t)'),
      yExpr: stringValue(value.yExpr, 'sin(t)'),
      tMin: numberValue(value.tMin, 0),
      tMax: numberValue(value.tMax, Math.PI * 2),
    };
  }
  if (value.kind === 'implicit') {
    return {
      id: value.id,
      kind: 'implicit',
      color,
      visible,
      tangents,
      expr: stringValue(value.expr, 'x^2 + y^2 = 4'),
    };
  }
  return null;
}

function sanitizeItem3D(value: unknown): Item3D | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#2563eb';
  const visible = boolValue(value.visible, true);
  if (value.kind === 'surface') {
    return {
      id: value.id,
      kind: 'surface',
      color,
      visible,
      expr: stringValue(value.expr, 'sin(x) * cos(y)'),
      xMin: numberValue(value.xMin, -5),
      xMax: numberValue(value.xMax, 5),
      yMin: numberValue(value.yMin, -5),
      yMax: numberValue(value.yMax, 5),
      resolution: numberValue(value.resolution, 56),
    };
  }
  if (value.kind === 'paramSurface') {
    return {
      id: value.id,
      kind: 'paramSurface',
      color,
      visible,
      xExpr: stringValue(value.xExpr, 'cos(u) * sin(v)'),
      yExpr: stringValue(value.yExpr, 'sin(u) * sin(v)'),
      zExpr: stringValue(value.zExpr, 'cos(v)'),
      uMin: numberValue(value.uMin, 0),
      uMax: numberValue(value.uMax, Math.PI * 2),
      vMin: numberValue(value.vMin, 0),
      vMax: numberValue(value.vMax, Math.PI),
      resolution: numberValue(value.resolution, 48),
    } satisfies ParametricSurfaceItem;
  }
  if (value.kind === 'curve3d') {
    return {
      id: value.id,
      kind: 'curve3d',
      color,
      visible,
      xExpr: stringValue(value.xExpr, 'cos(t)'),
      yExpr: stringValue(value.yExpr, 'sin(t)'),
      zExpr: stringValue(value.zExpr, 't / 3'),
      tMin: numberValue(value.tMin, 0),
      tMax: numberValue(value.tMax, Math.PI * 4),
      resolution: numberValue(value.resolution, 700),
    };
  }
  if (value.kind === 'implicit3d') {
    return {
      id: value.id,
      kind: 'implicit3d',
      color,
      visible,
      expr: stringValue(value.expr, 'x + y + z - 1'),
      xMin: numberValue(value.xMin, -4),
      xMax: numberValue(value.xMax, 4),
      yMin: numberValue(value.yMin, -4),
      yMax: numberValue(value.yMax, 4),
      zMin: numberValue(value.zMin, -4),
      zMax: numberValue(value.zMax, 4),
      resolution: numberValue(value.resolution, 34),
    } satisfies Implicit3DItem;
  }
  return null;
}

function sanitizeGeometry(value: unknown): Geometry | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#2563eb';
  const common = {
    id: value.id,
    color,
    visible: boolValue(value.visible, true),
    showEquation: boolValue(value.showEquation, false),
    tangents: tangentList(value.tangents),
  };
  if (value.kind === 'line') {
    const a = pointValue(value.a);
    const b = pointValue(value.b);
    if (!a || !b) return null;
    const divisionN = Math.max(2, Math.min(20, Math.round(numberValue(value.divisionN, 2))));
    const showDivisions = boolValue(value.showDivisions, false);
    const rawConstraint = isRecord(value.angleConstraint) ? value.angleConstraint : null;
    const angleConstraint =
      rawConstraint &&
      typeof rawConstraint.sourceId === 'string' &&
      rawConstraint.sourceId !== value.id &&
      typeof rawConstraint.angleDeg === 'number' &&
      Number.isFinite(rawConstraint.angleDeg)
        ? {
            sourceId: rawConstraint.sourceId,
            angleDeg: rawConstraint.angleDeg,
            offset: pointValue(rawConstraint.offset) ?? { x: 0, y: 0 },
          }
        : null;
    return {
      ...common,
      kind: 'line',
      a,
      b,
      extended: boolValue(value.extended, false),
      divisionN,
      showDivisions,
      showTrace: showDivisions && boolValue(value.showTrace, false),
      driverPlaying: boolValue(value.driverPlaying, false),
      traceClearToken: numberValue(value.traceClearToken, 0),
      movingEndpoint: value.movingEndpoint === 'A' ? 'A' : 'B',
      driverCurveId: typeof value.driverCurveId === 'string' ? value.driverCurveId : null,
      driverPoint: pointValue(value.driverPoint),
      angleConstraint,
    };
  }
  if (value.kind === 'circle') {
    const center = pointValue(value.center);
    const through = pointValue(value.through);
    if (!center || !through) return null;
    return { ...common, kind: 'circle', center, through };
  }
  if (value.kind === 'ellipse') {
    const center = pointValue(value.center);
    const corner = pointValue(value.corner);
    if (!center || !corner) return null;
    return { ...common, kind: 'ellipse', center, corner };
  }
  if (value.kind === 'parabola') {
    const vertex = pointValue(value.vertex);
    const point = pointValue(value.point);
    if (!vertex || !point) return null;
    return {
      ...common,
      kind: 'parabola',
      vertex,
      point,
      orientation: orientationValue(value.orientation),
    };
  }
  if (value.kind === 'hyperbola') {
    const center = pointValue(value.center);
    const corner = pointValue(value.corner);
    if (!center || !corner) return null;
    return {
      ...common,
      kind: 'hyperbola',
      center,
      corner,
      orientation: orientationValue(value.orientation),
    } satisfies HyperbolaShape;
  }
  return null;
}

function sanitizeIntersection(value: unknown): IntersectionMark | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (typeof value.aId !== 'string' || typeof value.bId !== 'string') return null;
  if (!value.aId || !value.bId || value.aId === value.bId) return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#dc2626';
  return {
    id: value.id,
    aId: value.aId,
    bId: value.bId,
    color,
    visible: boolValue(value.visible, true),
    showCoordinates: boolValue(value.showCoordinates, true),
    showTrace: boolValue(value.showTrace, false),
    traceClearToken: numberValue(value.traceClearToken, 0),
  };
}

function sanitizeTangentRef(value: unknown): TangentRef | null {
  if (!isRecord(value)) return null;
  if (typeof value.ownerId !== 'string' || typeof value.tangentId !== 'string') return null;
  return { ownerId: value.ownerId, tangentId: value.tangentId };
}

function sanitizeTangentIntersection(value: unknown): TangentIntersectionMark | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const a = sanitizeTangentRef(value.a);
  const b = sanitizeTangentRef(value.b);
  if (!a || !b) return null;
  if (a.ownerId === b.ownerId && a.tangentId === b.tangentId) return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#dc2626';
  return {
    id: value.id,
    a,
    b,
    color,
    visible: boolValue(value.visible, true),
    showCoordinates: boolValue(value.showCoordinates, true),
    showTrace: boolValue(value.showTrace, false),
    traceClearToken: numberValue(value.traceClearToken, 0),
  };
}

function sanitizeTangentConstraint(value: unknown): TangentAngleConstraint | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const source = sanitizeTangentRef(value.source);
  const target = sanitizeTangentRef(value.target);
  if (!source || !target) return null;
  if (
    source.ownerId === target.ownerId &&
    source.tangentId === target.tangentId
  ) {
    return null;
  }
  return {
    id: value.id,
    source,
    target,
    angleDeg: numberValue(value.angleDeg, 90),
  };
}

function sanitizeMarkedPoint(value: unknown): MarkedPoint | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (typeof value.name !== 'string') return null;
  const point = pointValue(value.point);
  if (!point) return null;
  const name = /^[A-Za-z]\d*$/.test(value.name) ? value.name : 'A';
  const source =
    value.source === 'tangent'
      ? 'tangent'
      : value.source === 'free'
        ? 'free'
        : value.source === 'intersection'
          ? 'intersection'
          : value.source === 'perpendicular'
            ? 'perpendicular'
            : 'manual';
  const ownerId =
    source === 'free' || source === 'intersection' || source === 'perpendicular'
      ? ''
      : typeof value.ownerId === 'string'
        ? value.ownerId
        : '';
  if (source !== 'free' && source !== 'intersection' && source !== 'perpendicular' && !ownerId) {
    return null;
  }
  const perpendicularMarkId =
    source === 'perpendicular' && typeof value.perpendicularMarkId === 'string'
      ? value.perpendicularMarkId
      : undefined;
  if (source === 'perpendicular' && !perpendicularMarkId) return null;
  const intersectionMarkId =
    source === 'intersection' && typeof value.intersectionMarkId === 'string'
      ? value.intersectionMarkId
      : undefined;
  if (
    source === 'intersection' &&
    (!intersectionMarkId ||
      (value.intersectionKind !== 'object' && value.intersectionKind !== 'tangent'))
  ) {
    return null;
  }
  const tangentOwnerId =
    source === 'tangent' && typeof value.tangentOwnerId === 'string'
      ? value.tangentOwnerId
      : undefined;
  const tangentId =
    source === 'tangent' && typeof value.tangentId === 'string'
      ? value.tangentId
      : undefined;
  if (source === 'tangent' && (!tangentOwnerId || !tangentId)) return null;
  return {
    id: value.id,
    ownerId,
    source,
    tangentOwnerId,
    tangentId,
    intersectionMarkId,
    perpendicularMarkId,
    intersectionIndex:
      source === 'intersection'
        ? Math.max(0, Math.round(numberValue(value.intersectionIndex, 0)))
        : undefined,
    intersectionKind:
      source === 'intersection'
        ? value.intersectionKind === 'tangent'
          ? 'tangent'
          : 'object'
        : undefined,
    name,
    point,
    visible: boolValue(value.visible, true),
    autoMove: boolValue(value.autoMove, false),
    coordinateLock:
      isRecord(value.coordinateLock) &&
      (value.coordinateLock.axis === 'x' || value.coordinateLock.axis === 'y') &&
      typeof value.coordinateLock.value === 'number' &&
      Number.isFinite(value.coordinateLock.value)
        ? {
            axis: value.coordinateLock.axis,
            value: value.coordinateLock.value,
          }
        : undefined,
  };
}

function sanitizeDivisionMark(value: unknown): DivisionMark | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (typeof value.aId !== 'string' || typeof value.bId !== 'string') return null;
  if (!value.aId || !value.bId || value.aId === value.bId) return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#0f766e';
  return {
    id: value.id,
    aId: value.aId,
    bId: value.bId,
    divisions: Math.max(2, Math.min(20, Math.round(numberValue(value.divisions, 2)))),
    color,
    visible: boolValue(value.visible, true),
    showTrace: boolValue(value.showTrace, false),
    traceClearToken: numberValue(value.traceClearToken, 0),
  };
}

function sanitizeMarkerLine(value: unknown): MarkerLine | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (typeof value.aId !== 'string' || typeof value.bId !== 'string') return null;
  if (!value.aId || !value.bId || value.aId === value.bId) return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#0f766e';
  return {
    id: value.id,
    aId: value.aId,
    bId: value.bId,
    color,
    visible: boolValue(value.visible, true),
  };
}

function sanitizePerpendicular(value: unknown): PerpendicularMark | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (typeof value.pointId !== 'string' || typeof value.lineId !== 'string') return null;
  if (!value.pointId || !value.lineId) return null;
  const color = typeof value.color === 'string' && COLOR_RE.test(value.color) ? value.color : '#0f766e';
  return {
    id: value.id,
    pointId: value.pointId,
    lineId: value.lineId,
    color,
    visible: boolValue(value.visible, true),
    showCoordinates: boolValue(value.showCoordinates, false),
    showTrace: boolValue(value.showTrace, false),
    traceClearToken: numberValue(value.traceClearToken, 0),
  };
}

export function loadPersistedState(): Partial<PersistedState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) return null;

    const items2d = Array.isArray(parsed.items2d)
      ? parsed.items2d.map(sanitizeItem2D).filter((item): item is Item2D => item !== null)
      : [];
    const items3d = Array.isArray(parsed.items3d)
      ? parsed.items3d.map(sanitizeItem3D).filter((item): item is Item3D => item !== null)
      : [];
    // Hand-drawn geometry has been removed; ignore old persisted geometry.
    const geometry: Geometry[] = [];
    const knownTangentKeys = new Set<string>();
    for (const item of items2d) {
      for (const tangent of item.tangents) {
        knownTangentKeys.add(`${item.id}:${tangent.id}`);
      }
    }
    const tangentIntersections = Array.isArray(parsed.tangentIntersections)
      ? parsed.tangentIntersections
          .map(sanitizeTangentIntersection)
          .filter(
            (item): item is TangentIntersectionMark =>
              item !== null &&
              knownTangentKeys.has(`${item.a.ownerId}:${item.a.tangentId}`) &&
              knownTangentKeys.has(`${item.b.ownerId}:${item.b.tangentId}`),
          )
      : [];
    const tangentAngleConstraints = Array.isArray(parsed.tangentAngleConstraints)
      ? parsed.tangentAngleConstraints
          .map(sanitizeTangentConstraint)
          .filter(
            (item): item is TangentAngleConstraint =>
              item !== null &&
              knownTangentKeys.has(`${item.source.ownerId}:${item.source.tangentId}`) &&
              knownTangentKeys.has(`${item.target.ownerId}:${item.target.tangentId}`),
          )
      : [];
    const intersections: IntersectionMark[] = Array.isArray(parsed.intersections)
      ? parsed.intersections
          .map(sanitizeIntersection)
          .filter((item): item is IntersectionMark => item !== null)
      : [];

    const knownItemIds = new Set(items2d.map((item) => item.id));
    const objectIntersectionIds = new Set(intersections.map((item) => item.id));
    const tangentIntersectionIds = new Set(tangentIntersections.map((item) => item.id));
    const pendingPerpendiculars = Array.isArray(parsed.perpendiculars)
      ? parsed.perpendiculars
          .map(sanitizePerpendicular)
          .filter((item): item is PerpendicularMark => item !== null)
      : [];
    const perpendicularIds = new Set(pendingPerpendiculars.map((item) => item.id));
    const markedPoints = Array.isArray(parsed.markedPoints)
      ? parsed.markedPoints
          .map(sanitizeMarkedPoint)
          .filter(
            (item): item is MarkedPoint =>
              item !== null &&
              (item.source === 'free' ||
                (item.source === 'intersection'
                  ? item.intersectionKind === 'tangent'
                    ? !!item.intersectionMarkId &&
                      tangentIntersectionIds.has(item.intersectionMarkId)
                    : !!item.intersectionMarkId &&
                      objectIntersectionIds.has(item.intersectionMarkId)
                  : item.source === 'perpendicular'
                    ? !!item.perpendicularMarkId &&
                      perpendicularIds.has(item.perpendicularMarkId)
                    : knownItemIds.has(item.ownerId))) &&
              (item.source !== 'tangent' ||
                knownTangentKeys.has(`${item.tangentOwnerId}:${item.tangentId}`)),
          )
      : [];
    const markedPointIds = new Set(markedPoints.map((point) => point.id));
    const perpendiculars = pendingPerpendiculars.filter((item) =>
      markedPointIds.has(item.pointId),
    );
    const divisionMarks = Array.isArray(parsed.divisionMarks)
      ? parsed.divisionMarks
          .map(sanitizeDivisionMark)
          .filter(
            (item): item is DivisionMark =>
              item !== null &&
              markedPointIds.has(item.aId) &&
              markedPointIds.has(item.bId),
          )
      : [];
    const markerLines = Array.isArray(parsed.markerLines)
      ? parsed.markerLines
          .map(sanitizeMarkerLine)
          .filter(
            (item): item is MarkerLine =>
              item !== null &&
              markedPointIds.has(item.aId) &&
              markedPointIds.has(item.bId),
          )
      : [];

    const paramValues: Record<string, string> = {};
    if (isRecord(parsed.paramValues)) {
      for (const [key, value] of Object.entries(parsed.paramValues)) {
        if (/^[A-Za-z]$/.test(key) && (typeof value === 'string' || typeof value === 'number')) {
          paramValues[key] = String(value);
        }
      }
    }

    let bbox: [number, number, number, number] | null = null;
    if (Array.isArray(parsed.view2dBoundingBox) && parsed.view2dBoundingBox.length === 4) {
      const values = parsed.view2dBoundingBox;
      if (values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        bbox = values as [number, number, number, number];
      }
    }

    return {
      mode: parsed.mode === '3d' ? '3d' : '2d',
      items2d,
      items3d,
      geometry,
      intersections,
      tangentIntersections,
      tangentAngleConstraints,
      markedPoints,
      divisionMarks,
      markerLines,
      perpendiculars,
      paramValues,
      view2dBoundingBox: bbox,
      snapToGrid: boolValue(parsed.snapToGrid, true),
    };
  } catch {
    return null;
  }
}

export function savePersistedState(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode: persistence is optional, never break the app.
  }
}

export function clearPersistedState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { STORAGE_KEY };
