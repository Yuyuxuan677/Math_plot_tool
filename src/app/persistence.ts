import type {
  Geometry,
  HyperbolaShape,
  Item2D,
  Item3D,
  Orientation,
  ParametricSurfaceItem,
  PersistedState,
  Point2,
  Tangent,
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
    const geometry = Array.isArray(parsed.geometry)
      ? parsed.geometry.map(sanitizeGeometry).filter((item): item is Geometry => item !== null)
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
