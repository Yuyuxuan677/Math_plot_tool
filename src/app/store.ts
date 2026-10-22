import { create } from 'zustand';
import { pickColor, toFiniteNumber, uid } from './utils';
import type {
  CircleShape,
  Curve3DItem,
  EllipseShape,
  ExplicitItem,
  Geometry,
  GeometryKind,
  HyperbolaShape,
  ImplicitItem,
  Item2D,
  Item2DKind,
  Item3D,
  Item3DKind,
  IntersectionMark,
  LineShape,
  Mode,
  Orientation,
  ParametricItem,
  ParametricSurfaceItem,
  ParabolaShape,
  Point2,
  SurfaceItem,
  Tool,
} from './types';
import { buildCurveRefs } from './curveRefs';
import { loadPersistedState } from './persistence';
import { clearExpressionCaches } from '../core/expression/analyze';

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'info' | 'error';
}

export interface AppState {
  mode: Mode;
  items2d: Item2D[];
  items3d: Item3D[];
  geometry: Geometry[];
  intersections: IntersectionMark[];
  paramValues: Record<string, string>;
  view2dBoundingBox: [number, number, number, number] | null;
  snapToGrid: boolean;
  viewResetToken: number;

  selectedId: string | null;
  expandedId: string | null;
  activeTool: Tool;
  toolOrientation: Orientation;
  toolTrayOpen: boolean;
  sheetExpanded: boolean;
  addMenuOpen: boolean;
  helpOpen: boolean;
  locusOwnerId: string | null;
  toast: ToastMessage | null;

  setMode: (mode: Mode) => void;
  setSelectedId: (id: string | null) => void;
  setExpandedId: (id: string | null) => void;
  setActiveTool: (tool: Tool) => void;
  setToolOrientation: (orientation: Orientation) => void;
  setToolTrayOpen: (open: boolean) => void;
  setSheetExpanded: (open: boolean) => void;
  setAddMenuOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setLocusOwnerId: (id: string | null) => void;
  setSnapToGrid: (snap: boolean) => void;
  setView2D: (bbox: [number, number, number, number] | null) => void;
  requestViewReset: () => void;
  setParamValue: (name: string, value: string) => void;
  showToast: (text: string, tone?: 'info' | 'error') => void;
  clearToast: () => void;

  addItem2D: (kind: Item2DKind) => string;
  addItem3D: (kind: Item3DKind) => string;
  updateItem2D: (id: string, patch: Partial<Item2D>) => void;
  updateItem3D: (id: string, patch: Partial<Item3D>) => void;
  removeObject: (id: string) => void;
  toggleVisible: (id: string) => void;
  setObjectColor: (id: string, color: string) => void;
  duplicateObject: (id: string) => void;

  addLine: (a: Point2, b: Point2) => string;
  addCircle: (center: Point2, through: Point2) => string;
  addEllipse: (center: Point2, corner: Point2) => string;
  addParabola: (vertex: Point2, point: Point2) => string;
  addHyperbola: (center: Point2, corner: Point2, orientation: Orientation) => string;
  updateGeometry: (id: string, patch: Partial<Geometry>) => void;
  addIntersection: () => string | null;
  updateIntersection: (id: string, patch: Partial<IntersectionMark>) => void;
  removeIntersection: (id: string) => void;

  addTangent: (ownerId: string) => void;
  removeTangent: (ownerId: string, tangentId: string) => void;
  updateTangentPoint: (ownerId: string, tangentId: string, point: Point2) => void;
  updateTangentMeta: (
    ownerId: string,
    tangentId: string,
    meta: { slope?: number; equation?: string },
  ) => void;

  resetAll: () => void;
}

const DEFAULT_VIEW: [number, number, number, number] = [-10, 10, 10, -10];

const initialParamValues = (): Record<string, string> => ({});

function explicitItem(color: string): ExplicitItem {
  return {
    id: uid('fn'),
    kind: 'explicit',
    color,
    visible: true,
    tangents: [],
    expr: 'x^2',
    showDerivative: false,
  };
}

function parametricItem(color: string): ParametricItem {
  return {
    id: uid('par'),
    kind: 'parametric',
    color,
    visible: true,
    tangents: [],
    xExpr: 'cos(t)',
    yExpr: 'sin(t)',
    tMin: 0,
    tMax: Math.PI * 2,
  };
}

function implicitItem(color: string): ImplicitItem {
  return {
    id: uid('imp'),
    kind: 'implicit',
    color,
    visible: true,
    tangents: [],
    expr: 'x^2 + y^2 = 4',
  };
}

function surfaceItem(color: string): SurfaceItem {
  return {
    id: uid('srf'),
    kind: 'surface',
    color,
    visible: true,
    expr: 'sin(x) * cos(y)',
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    resolution: 56,
  };
}

function parametricSurfaceItem(color: string): ParametricSurfaceItem {
  return {
    id: uid('psf'),
    kind: 'paramSurface',
    color,
    visible: true,
    xExpr: 'cos(u) * sin(v)',
    yExpr: 'sin(u) * sin(v)',
    zExpr: 'cos(v)',
    uMin: 0,
    uMax: Math.PI * 2,
    vMin: 0,
    vMax: Math.PI,
    resolution: 48,
  };
}

function curve3DItem(color: string): Curve3DItem {
  return {
    id: uid('crv'),
    kind: 'curve3d',
    color,
    visible: true,
    xExpr: 'cos(t)',
    yExpr: 'sin(t)',
    zExpr: 't / 3',
    tMin: 0,
    tMax: Math.PI * 4,
    resolution: 700,
  };
}

function geometryDefaults(kind: GeometryKind, color: string): GeometryBaseFields {
  return {
    id: uid(kind),
    kind,
    color,
    visible: true,
    showEquation: false,
    tangents: [],
  };
}

type GeometryBaseFields = Pick<Geometry, 'id' | 'kind' | 'color' | 'visible' | 'showEquation' | 'tangents'>;

function lineCenter(shape: LineShape): Point2 {
  return { x: (shape.a.x + shape.b.x) / 2, y: (shape.a.y + shape.b.y) / 2 };
}

function lineAngle(shape: LineShape): number {
  return Math.atan2(shape.b.y - shape.a.y, shape.b.x - shape.a.x);
}

export function applyLineAngleConstraints(geometry: Geometry[]): Geometry[] {
  const result = [...geometry];
  for (let index = 0; index < result.length; index += 1) {
    const target = result[index];
    if (target.kind !== 'line' || !target.angleConstraint) continue;
    const constraint = target.angleConstraint;
    if (!constraint.sourceId || constraint.sourceId === target.id) continue;
    const source = result.find((item) => item.id === constraint.sourceId);
    if (!source || source.kind !== 'line') continue;
    const length = Math.hypot(target.b.x - target.a.x, target.b.y - target.a.y);
    if (!Number.isFinite(length) || length < 1e-9) continue;
    const sourceCenter = lineCenter(source);
    const desiredCenter = {
      x: sourceCenter.x + (constraint.offset?.x ?? 0),
      y: sourceCenter.y + (constraint.offset?.y ?? 0),
    };
    const desiredAngle = lineAngle(source) + (constraint.angleDeg * Math.PI) / 180;
    const halfX = (Math.cos(desiredAngle) * length) / 2;
    const halfY = (Math.sin(desiredAngle) * length) / 2;
    const nextA = { x: desiredCenter.x - halfX, y: desiredCenter.y - halfY };
    const nextB = { x: desiredCenter.x + halfX, y: desiredCenter.y + halfY };
    if (
      Math.hypot(nextA.x - target.a.x, nextA.y - target.a.y) < 1e-9 &&
      Math.hypot(nextB.x - target.b.x, nextB.y - target.b.y) < 1e-9
    ) {
      continue;
    }
    result[index] = {
      ...target,
      a: nextA,
      b: nextB,
      driverPoint: null,
      traceClearToken: target.traceClearToken + 1,
    };
  }
  return result;
}

const persisted = loadPersistedState();

export const useAppStore = create<AppState>((set, get) => ({
  mode: persisted?.mode ?? '2d',
  items2d: persisted?.items2d ?? [],
  items3d: persisted?.items3d ?? [],
  geometry: persisted?.geometry ?? [],
  intersections: persisted?.intersections ?? [],
  paramValues: persisted?.paramValues ?? initialParamValues(),
  view2dBoundingBox: persisted?.view2dBoundingBox ?? null,
  snapToGrid: persisted?.snapToGrid ?? true,
  viewResetToken: 0,

  selectedId: null,
  expandedId: null,
  activeTool: 'select',
  toolOrientation: 'horizontal',
  toolTrayOpen: false,
  sheetExpanded: false,
  addMenuOpen: false,
  helpOpen: false,
  locusOwnerId: null,
  toast: null,

  setMode: (mode) => set({ mode, activeTool: 'select', toolTrayOpen: false }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setExpandedId: (expandedId) => set({ expandedId, selectedId: expandedId }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setToolOrientation: (toolOrientation) => set({ toolOrientation }),
  setToolTrayOpen: (toolTrayOpen) => set({ toolTrayOpen }),
  setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
  setAddMenuOpen: (addMenuOpen) => set({ addMenuOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setLocusOwnerId: (locusOwnerId) => set({ locusOwnerId }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setView2D: (view2dBoundingBox) => set({ view2dBoundingBox }),
  requestViewReset: () => set((state) => ({ viewResetToken: state.viewResetToken + 1 })),
  setParamValue: (name, value) =>
    set((state) => ({ paramValues: { ...state.paramValues, [name]: value } })),
  showToast: (text, tone = 'info') =>
    set({ toast: { id: uid('toast'), text, tone } }),
  clearToast: () => set({ toast: null }),

  addItem2D: (kind) => {
    const state = get();
    const used = [...state.items2d.map((item) => item.color), ...state.geometry.map((g) => g.color)];
    const color = pickColor(used);
    const item =
      kind === 'explicit'
        ? explicitItem(color)
        : kind === 'parametric'
          ? parametricItem(color)
          : implicitItem(color);
    set({
      items2d: [...state.items2d, item],
      selectedId: item.id,
      expandedId: item.id,
      addMenuOpen: false,
      sheetExpanded: false,
      mode: '2d',
    });
    return item.id;
  },

  addItem3D: (kind) => {
    const state = get();
    const used = state.items3d.map((item) => item.color);
    const color = pickColor(used);
    const item =
      kind === 'surface'
        ? surfaceItem(color)
        : kind === 'paramSurface'
          ? parametricSurfaceItem(color)
          : curve3DItem(color);
    set({
      items3d: [...state.items3d, item],
      selectedId: item.id,
      expandedId: item.id,
      addMenuOpen: false,
      sheetExpanded: true,
      mode: '3d',
    });
    return item.id;
  },

  updateItem2D: (id, patch) =>
    set((state) => ({
      items2d: state.items2d.map((item) =>
        item.id === id ? ({ ...item, ...patch } as Item2D) : item,
      ),
    })),

  updateItem3D: (id, patch) =>
    set((state) => ({
      items3d: state.items3d.map((item) =>
        item.id === id ? ({ ...item, ...patch } as Item3D) : item,
      ),
    })),

  removeObject: (id) =>
    set((state) => {
      const next: Partial<AppState> = {
        items2d: state.items2d.filter((item) => item.id !== id),
        items3d: state.items3d.filter((item) => item.id !== id),
        geometry: state.geometry
          .filter((item) => item.id !== id)
          .map((item) => {
            if (item.kind !== 'line') return item;
            if (item.driverCurveId === id) {
              return {
                ...item,
                driverCurveId: null,
                driverPoint: null,
                angleConstraint:
                  item.angleConstraint?.sourceId === id ? null : item.angleConstraint,
              };
            }
            if (item.angleConstraint?.sourceId === id) {
              return { ...item, angleConstraint: null };
            }
            return item;
          }),
        intersections: state.intersections.filter(
          (item) => item.id !== id && item.aId !== id && item.bId !== id,
        ),
      };
      if (state.expandedId === id) next.expandedId = null;
      if (state.selectedId === id) next.selectedId = null;
      if (state.locusOwnerId === id) next.locusOwnerId = null;
      return next;
    }),

  toggleVisible: (id) =>
    set((state) => ({
      items2d: state.items2d.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
      items3d: state.items3d.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
      geometry: state.geometry.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    })),

  setObjectColor: (id, color) =>
    set((state) => ({
      items2d: state.items2d.map((item) => (item.id === id ? { ...item, color } : item)),
      items3d: state.items3d.map((item) => (item.id === id ? { ...item, color } : item)),
      geometry: state.geometry.map((item) => (item.id === id ? { ...item, color } : item)),
    })),

  duplicateObject: (id) => {
    const state = get();
    const item2d = state.items2d.find((item) => item.id === id);
    const item3d = state.items3d.find((item) => item.id === id);
    const geometry = state.geometry.find((item) => item.id === id);
    if (!item2d && !item3d && !geometry) return;
    const used = [...state.items2d.map((item) => item.color), ...state.items3d.map((item) => item.color), ...state.geometry.map((item) => item.color)];
    const color = pickColor(used);
    if (item2d) {
      const clone = { ...item2d, id: uid(item2d.kind), color, tangents: [] };
      set({ items2d: [...state.items2d, clone], expandedId: clone.id, selectedId: clone.id });
      return;
    }
    if (item3d) {
      const clone = { ...item3d, id: uid(item3d.kind), color };
      set({ items3d: [...state.items3d, clone], expandedId: clone.id, selectedId: clone.id });
      return;
    }
    if (geometry) {
      const clone = { ...geometry, id: uid(geometry.kind), color, tangents: [] };
      set({ geometry: [...state.geometry, clone], expandedId: clone.id, selectedId: clone.id });
    }
  },

  addLine: (a, b) => {
    const state = get();
    const color = pickColor([...state.geometry.map((item) => item.color)]);
    const shape: LineShape = {
      ...geometryDefaults('line', color),
      kind: 'line',
      a,
      b,
      extended: false,
      divisionN: 2,
      showDivisions: false,
      showTrace: false,
      driverPlaying: false,
      traceClearToken: 0,
      movingEndpoint: 'B',
      driverCurveId: null,
      driverPoint: null,
      angleConstraint: null,
    };
    set({
      geometry: [...state.geometry, shape],
      expandedId: shape.id,
      selectedId: shape.id,
      activeTool: 'select',
      sheetExpanded: false,
    });
    return shape.id;
  },

  addCircle: (center, through) => {
    const state = get();
    const color = pickColor([...state.geometry.map((item) => item.color)]);
    const shape: CircleShape = {
      ...geometryDefaults('circle', color),
      kind: 'circle',
      center,
      through,
    };
    set({
      geometry: [...state.geometry, shape],
      expandedId: shape.id,
      selectedId: shape.id,
      activeTool: 'select',
      sheetExpanded: false,
    });
    return shape.id;
  },

  addEllipse: (center, corner) => {
    const state = get();
    const color = pickColor([...state.geometry.map((item) => item.color)]);
    const shape: EllipseShape = {
      ...geometryDefaults('ellipse', color),
      kind: 'ellipse',
      center,
      corner,
    };
    set({
      geometry: [...state.geometry, shape],
      expandedId: shape.id,
      selectedId: shape.id,
      activeTool: 'select',
      sheetExpanded: false,
    });
    return shape.id;
  },

  addParabola: (vertex, point) => {
    const state = get();
    const color = pickColor([...state.geometry.map((item) => item.color)]);
    const dx = point.x - vertex.x;
    const dy = point.y - vertex.y;
    const orientation: Orientation = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    const shape: ParabolaShape = {
      ...geometryDefaults('parabola', color),
      kind: 'parabola',
      vertex,
      point,
      orientation,
    };
    set({
      geometry: [...state.geometry, shape],
      expandedId: shape.id,
      selectedId: shape.id,
      activeTool: 'select',
      sheetExpanded: false,
    });
    return shape.id;
  },

  addHyperbola: (center, corner, orientation) => {
    const state = get();
    const color = pickColor([...state.geometry.map((item) => item.color)]);
    const shape: HyperbolaShape = {
      ...geometryDefaults('hyperbola', color),
      kind: 'hyperbola',
      center,
      corner,
      orientation,
    };
    set({
      geometry: [...state.geometry, shape],
      expandedId: shape.id,
      selectedId: shape.id,
      activeTool: 'select',
      sheetExpanded: false,
    });
    return shape.id;
  },

  updateGeometry: (id, patch) =>
    set((state) => {
      const geometry = state.geometry.map((item) =>
        item.id === id ? ({ ...item, ...patch } as Geometry) : item,
      );
      return { geometry: applyLineAngleConstraints(geometry) };
    }),

  addIntersection: () => {
    const state = get();
    const refs = buildCurveRefs(state.items2d, state.geometry);
    if (refs.length < 2) {
      state.showToast('至少需要两条曲线或直线才能标记交点', 'error');
      return null;
    }
    const mark: IntersectionMark = {
      id: uid('ix'),
      aId: refs[0].id,
      bId: refs[1].id,
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.geometry.map((item) => item.color),
        ...state.intersections.map((item) => item.color),
      ]),
      visible: true,
      showCoordinates: true,
      showTrace: false,
      traceClearToken: 0,
    };
    set({
      intersections: [...state.intersections, mark],
      expandedId: mark.id,
      selectedId: mark.id,
      addMenuOpen: false,
      sheetExpanded: false,
      mode: '2d',
    });
    return mark.id;
  },

  updateIntersection: (id, patch) =>
    set((state) => ({
      intersections: state.intersections.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),

  removeIntersection: (id) =>
    set((state) => {
      const next: Partial<AppState> = {
        intersections: state.intersections.filter((item) => item.id !== id),
      };
      if (state.expandedId === id) next.expandedId = null;
      if (state.selectedId === id) next.selectedId = null;
      return next;
    }),

  addTangent: (ownerId) =>
    set((state) => {
      const tangent = { id: uid('tan'), point: null };
      return {
        items2d: state.items2d.map((item) =>
          item.id === ownerId ? { ...item, tangents: [...item.tangents, tangent] } : item,
        ),
        geometry: state.geometry.map((item) =>
          item.id === ownerId ? { ...item, tangents: [...item.tangents, tangent] } : item,
        ),
        expandedId: ownerId,
      };
    }),

  removeTangent: (ownerId, tangentId) =>
    set((state) => ({
      items2d: state.items2d.map((item) =>
        item.id === ownerId
          ? { ...item, tangents: item.tangents.filter((tangent) => tangent.id !== tangentId) }
          : item,
      ),
      geometry: state.geometry.map((item) =>
        item.id === ownerId
          ? { ...item, tangents: item.tangents.filter((tangent) => tangent.id !== tangentId) }
          : item,
      ),
    })),

  updateTangentPoint: (ownerId, tangentId, point) =>
    set((state) => ({
      items2d: state.items2d.map((item) =>
        item.id === ownerId
          ? {
              ...item,
              tangents: item.tangents.map((tangent) =>
                tangent.id === tangentId ? { ...tangent, point } : tangent,
              ),
            }
          : item,
      ),
      geometry: state.geometry.map((item) =>
        item.id === ownerId
          ? {
              ...item,
              tangents: item.tangents.map((tangent) =>
                tangent.id === tangentId ? { ...tangent, point } : tangent,
              ),
            }
          : item,
      ),
    })),

  updateTangentMeta: (ownerId, tangentId, meta) =>
    set((state) => ({
      items2d: state.items2d.map((item) =>
        item.id === ownerId
          ? {
              ...item,
              tangents: item.tangents.map((tangent) =>
                tangent.id === tangentId ? { ...tangent, meta } : tangent,
              ),
            }
          : item,
      ),
      geometry: state.geometry.map((item) =>
        item.id === ownerId
          ? {
              ...item,
              tangents: item.tangents.map((tangent) =>
                tangent.id === tangentId ? { ...tangent, meta } : tangent,
              ),
            }
          : item,
      ),
    })),

  resetAll: () => {
    clearExpressionCaches();
    set({
      items2d: [],
      items3d: [],
      geometry: [],
      intersections: [],
      paramValues: {},
      view2dBoundingBox: null,
      selectedId: null,
      expandedId: null,
      activeTool: 'select',
      toolTrayOpen: false,
      sheetExpanded: false,
      helpOpen: false,
      locusOwnerId: null,
      toast: null,
    });
  },
}));

export const DEFAULT_2D_BOUNDING_BOX = DEFAULT_VIEW;

export function getParamNumberValues(paramValues: Record<string, string>): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [key, raw] of Object.entries(paramValues)) {
    values[key] = toFiniteNumber(raw, 1);
  }
  return values;
}
