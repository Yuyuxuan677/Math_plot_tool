import { create } from 'zustand';
import { pickColor, toFiniteNumber, uid } from './utils';
import type {
  CircleShape,
  Curve3DItem,
  DivisionMark,
  EllipseShape,
  ExplicitItem,
  Geometry,
  GeometryKind,
  HyperbolaShape,
  ImplicitItem,
  Implicit3DItem,
  Item2D,
  Item2DKind,
  Item3D,
  Item3DKind,
  IntersectionMark,
  LineShape,
  MarkedPoint,
  MarkerLine,
  Mode,
  Orientation,
  ParametricItem,
  ParametricSurfaceItem,
  ParabolaShape,
  PerpendicularMark,
  Point2,
  SurfaceItem,
  TangentAngleConstraint,
  TangentIntersectionMark,
  Tool,
} from './types';
import { buildTangentChoices } from './tangentRefs';
import {
  buildIntersectionObjects,
  tangentObjectId,
} from './intersectionRefs';
import { buildPerpendicularLineOptions } from './lineRefs';
import { nextMarkedPointName } from './markedPoints';
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
  tangentIntersections: TangentIntersectionMark[];
  tangentAngleConstraints: TangentAngleConstraint[];
  markedPoints: MarkedPoint[];
  divisionMarks: DivisionMark[];
  markerLines: MarkerLine[];
  perpendiculars: PerpendicularMark[];
  paramValues: Record<string, string>;
  view2dBoundingBox: [number, number, number, number] | null;
  snapToGrid: boolean;
  viewResetToken: number;
  autoMovePoints: boolean;

  selectedId: string | null;
  expandedId: string | null;
  intersectionDraft: { aId: string; bId: string } | null;
  markerLineDraft: { aId: string; bId: string } | null;
  perpendicularDraft: { pointId: string; lineId: string } | null;
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
  beginIntersection: () => void;
  setIntersectionDraft: (draft: { aId?: string; bId?: string } | null) => void;
  cancelIntersection: () => void;
  beginMarkerLine: () => void;
  setMarkerLineDraft: (draft: { aId?: string; bId?: string } | null) => void;
  cancelMarkerLine: () => void;
  beginPerpendicular: () => void;
  setPerpendicularDraft: (draft: { pointId?: string; lineId?: string } | null) => void;
  cancelPerpendicular: () => void;
  addPerpendicular: (pointId: string, lineId: string) => string | null;
  updatePerpendicular: (id: string, patch: Partial<PerpendicularMark>) => void;
  removePerpendicular: (id: string) => void;
  syncPerpendicularFoot: (markId: string, point: Point2) => void;
  setActiveTool: (tool: Tool) => void;
  setToolOrientation: (orientation: Orientation) => void;
  setToolTrayOpen: (open: boolean) => void;
  setSheetExpanded: (open: boolean) => void;
  setAddMenuOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setLocusOwnerId: (id: string | null) => void;
  setSnapToGrid: (snap: boolean) => void;
  setAutoMovePoints: (enabled: boolean) => void;
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
  addIntersection: (aId: string, bId: string) => string | null;
  updateIntersection: (id: string, patch: Partial<IntersectionMark>) => void;
  removeIntersection: (id: string) => void;

  addTangentIntersection: () => string | null;
  updateTangentIntersection: (id: string, patch: Partial<TangentIntersectionMark>) => void;
  removeTangentIntersection: (id: string) => void;
  addTangentAngleConstraint: () => string | null;
  updateTangentAngleConstraint: (id: string, patch: Partial<TangentAngleConstraint>) => void;
  removeTangentAngleConstraint: (id: string) => void;

  addMarkedPoint: (ownerId: string, point: Point2) => MarkedPoint | null;
  addFreeMarkedPoint: (point: Point2) => MarkedPoint;
  updateMarkedPoint: (id: string, patch: Partial<MarkedPoint>) => void;
  removeMarkedPoint: (id: string) => void;
  addDivisionMark: () => string | null;
  updateDivisionMark: (id: string, patch: Partial<DivisionMark>) => void;
  removeDivisionMark: (id: string) => void;
  addMarkerLine: (aId: string, bId: string) => string | null;
  updateMarkerLine: (id: string, patch: Partial<MarkerLine>) => void;
  removeMarkerLine: (id: string) => void;
  syncIntersectionMarkers: (
    markId: string,
    kind: 'object' | 'tangent',
    points: Point2[],
  ) => void;

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

function implicit3DItem(color: string): Implicit3DItem {
  return {
    id: uid('isrf'),
    kind: 'implicit3d',
    color,
    visible: true,
    expr: 'x + y + z - 1',
    xMin: -4,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    zMin: -4,
    zMax: 4,
    resolution: 34,
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

function initialMarkedPoints(
  items2d: Item2D[],
  existing: MarkedPoint[],
): MarkedPoint[] {
  const result = [...existing];
  const tangentKeys = new Set<string>();
  for (const item of items2d) {
    for (const tangent of item.tangents) {
      const ownerId = item.id;
      const key = `${ownerId}:${tangent.id}`;
      tangentKeys.add(key);
      if (
        result.some(
          (point) =>
            point.source === 'tangent' &&
            point.tangentOwnerId === ownerId &&
            point.tangentId === tangent.id,
        )
      ) {
        continue;
      }
      result.push({
        id: uid('pt'),
        ownerId,
        source: 'tangent',
        tangentOwnerId: ownerId,
        tangentId: tangent.id,
        name: nextMarkedPointName(result),
        point: tangent.point ?? { x: 0, y: 0 },
        visible: true,
      });
    }
  }
  return result.filter(
    (point) =>
      point.source !== 'tangent' ||
      (point.tangentOwnerId &&
        point.tangentId &&
        tangentKeys.has(`${point.tangentOwnerId}:${point.tangentId}`)),
  );
}

const initialItems2d = persisted?.items2d ?? [];
const initialPoints = initialMarkedPoints(initialItems2d, persisted?.markedPoints ?? []);

export const useAppStore = create<AppState>((set, get) => ({
  mode: persisted?.mode ?? '2d',
  items2d: initialItems2d,
  items3d: persisted?.items3d ?? [],
  geometry: persisted?.geometry ?? [],
  intersections: persisted?.intersections ?? [],
  tangentIntersections: persisted?.tangentIntersections ?? [],
  tangentAngleConstraints: persisted?.tangentAngleConstraints ?? [],
  markedPoints: initialPoints,
  divisionMarks: persisted?.divisionMarks ?? [],
  markerLines: persisted?.markerLines ?? [],
  perpendiculars: persisted?.perpendiculars ?? [],
  paramValues: persisted?.paramValues ?? initialParamValues(),
  view2dBoundingBox: persisted?.view2dBoundingBox ?? null,
  snapToGrid: persisted?.snapToGrid ?? true,
  viewResetToken: 0,
  autoMovePoints: false,

  selectedId: null,
  expandedId: null,
  intersectionDraft: null,
  markerLineDraft: null,
  perpendicularDraft: null,
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
  beginIntersection: () => {
    const state = get();
    const objects = buildIntersectionObjects(
      state.items2d,
      state.markerLines,
      state.markedPoints,
    );
    if (objects.length < 2) {
      state.showToast('至少需要两个对象才能构建交点', 'error');
      return;
    }
    set({
      intersectionDraft: { aId: '', bId: '' },
      addMenuOpen: false,
      sheetExpanded: false,
    });
  },
  setIntersectionDraft: (draft) =>
    set((state) => ({
      intersectionDraft: draft
        ? {
            aId: draft.aId ?? state.intersectionDraft?.aId ?? '',
            bId: draft.bId ?? state.intersectionDraft?.bId ?? '',
          }
        : null,
    })),
  cancelIntersection: () => set({ intersectionDraft: null }),
  beginMarkerLine: () => {
    const state = get();
    if (state.markedPoints.length < 2) {
      state.showToast('至少需要两个标记点才能连线', 'error');
      return;
    }
    set({
      markerLineDraft: { aId: '', bId: '' },
      addMenuOpen: false,
      sheetExpanded: false,
    });
  },
  setMarkerLineDraft: (draft) =>
    set((state) => ({
      markerLineDraft: draft
        ? {
            aId: draft.aId ?? state.markerLineDraft?.aId ?? '',
            bId: draft.bId ?? state.markerLineDraft?.bId ?? '',
          }
        : null,
    })),
  cancelMarkerLine: () => set({ markerLineDraft: null }),
  beginPerpendicular: () => {
    const state = get();
    if (state.markedPoints.length === 0) {
      state.showToast('请先创建至少一个标记点', 'error');
      return;
    }
    const lines = buildPerpendicularLineOptions(
      state.items2d,
      state.markerLines,
      state.markedPoints,
      state.paramValues,
      state.perpendiculars,
    );
    if (lines.length === 0) {
      state.showToast('请先创建一条直线', 'error');
      return;
    }
    set({
      perpendicularDraft: { pointId: '', lineId: '' },
      addMenuOpen: false,
      sheetExpanded: false,
    });
  },
  setPerpendicularDraft: (draft) =>
    set((state) => ({
      perpendicularDraft: draft
        ? {
            pointId: draft.pointId ?? state.perpendicularDraft?.pointId ?? '',
            lineId: draft.lineId ?? state.perpendicularDraft?.lineId ?? '',
          }
        : null,
    })),
  cancelPerpendicular: () => set({ perpendicularDraft: null }),
  addPerpendicular: (pointId, lineId) => {
    const state = get();
    const point = state.markedPoints.find((item) => item.id === pointId);
    const line = buildPerpendicularLineOptions(
      state.items2d,
      state.markerLines,
      state.markedPoints,
      state.paramValues,
      state.perpendiculars,
    ).find((item) => item.id === lineId);
    if (!point || !line) {
      state.showToast('请选择标记点和直线', 'error');
      return null;
    }
    const mark: PerpendicularMark = {
      id: uid('perp'),
      pointId,
      lineId,
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.perpendiculars.map((item) => item.color),
      ]),
      visible: true,
      showCoordinates: false,
      showTrace: false,
      traceClearToken: 0,
    };
    set({
      perpendiculars: [...state.perpendiculars, mark],
      perpendicularDraft: null,
      expandedId: mark.id,
      selectedId: mark.id,
      addMenuOpen: false,
      sheetExpanded: false,
    });
    return mark.id;
  },
  updatePerpendicular: (id, patch) =>
    set((state) => ({
      perpendiculars: state.perpendiculars.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  removePerpendicular: (id) =>
    set((state) => {
      const removedPerpIds = new Set([
        id,
        ...state.perpendiculars
          .filter((item) => item.lineId === `perp:${id}`)
          .map((item) => item.id),
      ]);
      const removedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              point.source === 'perpendicular' &&
              point.perpendicularMarkId &&
              removedPerpIds.has(point.perpendicularMarkId),
          )
          .map((point) => point.id),
      );
      return {
        perpendiculars: state.perpendiculars.filter(
          (item) => !removedPerpIds.has(item.id),
        ),
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        markerLines: state.markerLines.filter(
          (line) =>
            !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
        expandedId: state.expandedId === id ? null : state.expandedId,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),
  syncPerpendicularFoot: (markId, point) => {
    const state = get();
    const existing = state.markedPoints.find(
      (item) =>
        item.source === 'perpendicular' && item.perpendicularMarkId === markId,
    );
    if (existing) {
      if (Math.hypot(existing.point.x - point.x, existing.point.y - point.y) < 1e-5) {
        return;
      }
      set({
        markedPoints: state.markedPoints.map((item) =>
          item.id === existing.id
            ? { ...item, point: { x: point.x, y: point.y } }
            : item,
        ),
      });
      return;
    }
    set({
      markedPoints: [
        ...state.markedPoints,
        {
          id: uid('pt'),
          ownerId: '',
          source: 'perpendicular',
          perpendicularMarkId: markId,
          name: nextMarkedPointName(state.markedPoints),
          point: { x: point.x, y: point.y },
          visible: true,
        },
      ],
    });
  },
  setActiveTool: (activeTool) => set({ activeTool }),
  setToolOrientation: (toolOrientation) => set({ toolOrientation }),
  setToolTrayOpen: (toolTrayOpen) => set({ toolTrayOpen }),
  setSheetExpanded: (sheetExpanded) => set({ sheetExpanded }),
  setAddMenuOpen: (addMenuOpen) => set({ addMenuOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setLocusOwnerId: (locusOwnerId) => set({ locusOwnerId }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setAutoMovePoints: (autoMovePoints) => {
    const state = get();
    if (autoMovePoints && !state.markedPoints.some((point) => point.autoMove)) {
      state.showToast('请先在标记点卡片里勾选“自动移动”', 'info');
      return;
    }
    set({ autoMovePoints });
  },
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
          : kind === 'implicit3d'
            ? implicit3DItem(color)
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
      const removedIntersectionIds = new Set(
        state.intersections
          .filter((item) => item.id === id || item.aId === id || item.bId === id)
          .map((item) => item.id),
      );
      const removedTangentIntersectionIds = new Set(
        state.tangentIntersections
          .filter((mark) => mark.a.ownerId === id || mark.b.ownerId === id)
          .map((mark) => mark.id),
      );
      const baseRemovedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              point.ownerId === id ||
              (point.source === 'intersection' &&
                point.intersectionMarkId &&
                (removedIntersectionIds.has(point.intersectionMarkId) ||
                  removedTangentIntersectionIds.has(point.intersectionMarkId))),
          )
          .map((point) => point.id),
      );
      const removedPerpIds = new Set(
        state.perpendiculars
          .filter(
            (item) =>
              item.lineId === `item:${id}` ||
              item.lineId.startsWith(`tan:${id}:`) ||
              baseRemovedMarkerIds.has(item.pointId),
          )
          .map((item) => item.id),
      );
      const removedMarkerIds = new Set([
        ...baseRemovedMarkerIds,
        ...state.markedPoints
          .filter(
            (point) =>
              point.source === 'perpendicular' &&
              point.perpendicularMarkId &&
              removedPerpIds.has(point.perpendicularMarkId),
          )
          .map((point) => point.id),
      ]);
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
          (item) => !removedIntersectionIds.has(item.id),
        ),
        tangentIntersections: state.tangentIntersections.filter(
          (mark) => !removedTangentIntersectionIds.has(mark.id),
        ),
        tangentAngleConstraints: state.tangentAngleConstraints.filter(
          (constraint) =>
            constraint.source.ownerId !== id && constraint.target.ownerId !== id,
        ),
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        divisionMarks: state.divisionMarks.filter((mark) => {
          const a = state.markedPoints.find((point) => point.id === mark.aId);
          const b = state.markedPoints.find((point) => point.id === mark.bId);
          return (
            !!a &&
            !!b &&
            !removedMarkerIds.has(mark.aId) &&
            !removedMarkerIds.has(mark.bId) &&
            a.ownerId !== id &&
            b.ownerId !== id
          );
        }),
        markerLines: state.markerLines.filter(
          (line) =>
            !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        perpendiculars: state.perpendiculars.filter(
          (item) => !removedPerpIds.has(item.id),
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

  addIntersection: (aId, bId) => {
    const state = get();
    const objects = buildIntersectionObjects(
      state.items2d,
      state.markerLines,
      state.markedPoints,
    );
    const aExists = objects.some((object) => object.id === aId);
    const bExists = objects.some((object) => object.id === bId);
    if (!aId || !bId || aId === bId || !aExists || !bExists) {
      state.showToast('请选择两个不同的对象', 'error');
      return null;
    }
    const mark: IntersectionMark = {
      id: uid('ix'),
      aId,
      bId,
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.geometry.map((item) => item.color),
        ...state.intersections.map((item) => item.color),
      ]),
      visible: true,
      showCoordinates: false,
      showTrace: false,
      traceClearToken: 0,
    };
    set({
      intersections: [...state.intersections, mark],
      expandedId: mark.id,
      selectedId: mark.id,
      intersectionDraft: null,
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
      const removedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              point.source === 'intersection' &&
              point.intersectionMarkId === id &&
              (point.intersectionKind ?? 'object') === 'object',
          )
          .map((point) => point.id),
      );
      const next: Partial<AppState> = {
        intersections: state.intersections.filter((item) => item.id !== id),
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        markerLines: state.markerLines.filter(
          (line) => !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
      };
      if (state.expandedId === id) next.expandedId = null;
      if (state.selectedId === id) next.selectedId = null;
      return next;
    }),

  addTangentIntersection: () => {
    const state = get();
    const refs = buildTangentChoices(state.items2d);
    if (refs.length < 2) {
      state.showToast('至少需要两条切线才能标记切线的交点', 'error');
      return null;
    }
    const mark: TangentIntersectionMark = {
      id: uid('tix'),
      a: { ownerId: refs[0].ownerId, tangentId: refs[0].tangentId },
      b: { ownerId: refs[1].ownerId, tangentId: refs[1].tangentId },
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.tangentIntersections.map((item) => item.color),
      ]),
      visible: true,
      showCoordinates: false,
      showTrace: false,
      traceClearToken: 0,
    };
    set({
      tangentIntersections: [...state.tangentIntersections, mark],
      expandedId: mark.id,
      selectedId: mark.id,
      addMenuOpen: false,
      sheetExpanded: false,
      mode: '2d',
    });
    return mark.id;
  },

  updateTangentIntersection: (id, patch) =>
    set((state) => ({
      tangentIntersections: state.tangentIntersections.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),

  removeTangentIntersection: (id) =>
    set((state) => {
      const removedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              point.source === 'intersection' &&
              point.intersectionMarkId === id &&
              point.intersectionKind === 'tangent',
          )
          .map((point) => point.id),
      );
      return {
        tangentIntersections: state.tangentIntersections.filter((item) => item.id !== id),
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        markerLines: state.markerLines.filter(
          (line) => !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
        expandedId: state.expandedId === id ? null : state.expandedId,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  addTangentAngleConstraint: () => {
    const state = get();
    const refs = buildTangentChoices(state.items2d);
    if (refs.length < 2) {
      state.showToast('至少需要两条切线才能设置夹角约束', 'error');
      return null;
    }
    const constraint: TangentAngleConstraint = {
      id: uid('tac'),
      source: { ownerId: refs[0].ownerId, tangentId: refs[0].tangentId },
      target: { ownerId: refs[1].ownerId, tangentId: refs[1].tangentId },
      angleDeg: 90,
    };
    const matches = (mark: TangentIntersectionMark) =>
      (mark.a.ownerId === constraint.source.ownerId &&
        mark.a.tangentId === constraint.source.tangentId &&
        mark.b.ownerId === constraint.target.ownerId &&
        mark.b.tangentId === constraint.target.tangentId) ||
      (mark.a.ownerId === constraint.target.ownerId &&
        mark.a.tangentId === constraint.target.tangentId &&
        mark.b.ownerId === constraint.source.ownerId &&
        mark.b.tangentId === constraint.source.tangentId);
    const existing = state.tangentIntersections.find(matches);
    const tangentIntersections = existing
      ? state.tangentIntersections.map((mark) =>
          mark.id === existing.id ? { ...mark, showTrace: true } : mark,
        )
      : [
          ...state.tangentIntersections,
          {
            id: uid('tix'),
            a: { ...constraint.source },
            b: { ...constraint.target },
            color: pickColor([
              ...state.items2d.map((item) => item.color),
              ...state.tangentIntersections.map((item) => item.color),
            ]),
            visible: true,
            showCoordinates: false,
            showTrace: true,
            traceClearToken: 0,
          },
        ];
    set({
      tangentAngleConstraints: [...state.tangentAngleConstraints, constraint],
      tangentIntersections,
      expandedId: constraint.id,
      selectedId: constraint.id,
      addMenuOpen: false,
      sheetExpanded: false,
      mode: '2d',
    });
    return constraint.id;
  },

  updateTangentAngleConstraint: (id, patch) =>
    set((state) => ({
      tangentAngleConstraints: state.tangentAngleConstraints.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),

  removeTangentAngleConstraint: (id) =>
    set((state) => ({
      tangentAngleConstraints: state.tangentAngleConstraints.filter((item) => item.id !== id),
      expandedId: state.expandedId === id ? null : state.expandedId,
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  addMarkedPoint: (ownerId, point) => {
    const state = get();
    if (!state.items2d.some((item) => item.id === ownerId)) return null;
    const marked: MarkedPoint = {
      id: uid('pt'),
      ownerId,
      source: 'manual',
      name: nextMarkedPointName(state.markedPoints),
      point: { x: point.x, y: point.y },
      visible: true,
    };
    set({
      markedPoints: [...state.markedPoints, marked],
      expandedId: marked.id,
      selectedId: marked.id,
      addMenuOpen: false,
    });
    return marked;
  },

  updateMarkedPoint: (id, patch) =>
    set((state) => ({
      markedPoints: state.markedPoints.map((point) =>
        point.id === id ? { ...point, ...patch } : point,
      ),
    })),

  addFreeMarkedPoint: (point) => {
    const state = get();
    const marked: MarkedPoint = {
      id: uid('pt'),
      ownerId: '',
      source: 'free',
      name: nextMarkedPointName(state.markedPoints),
      point: { x: point.x, y: point.y },
      visible: true,
    };
    set({
      markedPoints: [...state.markedPoints, marked],
      expandedId: marked.id,
      selectedId: marked.id,
    });
    return marked;
  },

  removeMarkedPoint: (id) =>
    set((state) => {
      const removedPerpIds = new Set(
        state.perpendiculars
          .filter((item) => item.pointId === id)
          .map((item) => item.id),
      );
      const removedMarkerIds = new Set([
        id,
        ...state.markedPoints
          .filter(
            (point) =>
              point.source === 'perpendicular' &&
              point.perpendicularMarkId &&
              removedPerpIds.has(point.perpendicularMarkId),
          )
          .map((point) => point.id),
      ]);
      return {
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        perpendiculars: state.perpendiculars.filter(
          (item) => !removedPerpIds.has(item.id),
        ),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
        markerLines: state.markerLines.filter(
          (line) => !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        expandedId: state.expandedId === id ? null : state.expandedId,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  addDivisionMark: () => {
    const state = get();
    if (state.markedPoints.length < 2) {
      state.showToast('至少需要标记两个点才能显示 N 等分点', 'error');
      return null;
    }
    const mark: DivisionMark = {
      id: uid('div'),
      aId: state.markedPoints[0].id,
      bId: state.markedPoints[1].id,
      divisions: 2,
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.divisionMarks.map((mark) => mark.color),
      ]),
      visible: true,
      showTrace: false,
      traceClearToken: 0,
    };
    set({
      divisionMarks: [...state.divisionMarks, mark],
      expandedId: mark.id,
      selectedId: mark.id,
      addMenuOpen: false,
      sheetExpanded: false,
    });
    return mark.id;
  },

  updateDivisionMark: (id, patch) =>
    set((state) => ({
      divisionMarks: state.divisionMarks.map((mark) =>
        mark.id === id ? { ...mark, ...patch } : mark,
      ),
    })),

  removeDivisionMark: (id) =>
    set((state) => ({
      divisionMarks: state.divisionMarks.filter((mark) => mark.id !== id),
      expandedId: state.expandedId === id ? null : state.expandedId,
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  addMarkerLine: (aId, bId) => {
    const state = get();
    const aExists = state.markedPoints.some((point) => point.id === aId);
    const bExists = state.markedPoints.some((point) => point.id === bId);
    if (!aId || !bId || aId === bId || !aExists || !bExists) {
      state.showToast('请选择两个不同的标记点', 'error');
      return null;
    }
    const line: MarkerLine = {
      id: uid('line'),
      aId,
      bId,
      color: pickColor([
        ...state.items2d.map((item) => item.color),
        ...state.markerLines.map((item) => item.color),
      ]),
      visible: true,
    };
    set({
      markerLines: [...state.markerLines, line],
      expandedId: line.id,
      selectedId: line.id,
      markerLineDraft: null,
      addMenuOpen: false,
      sheetExpanded: false,
    });
    return line.id;
  },

  updateMarkerLine: (id, patch) =>
    set((state) => ({
      markerLines: state.markerLines.map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    })),

  removeMarkerLine: (id) =>
    set((state) => {
      const removedPerpIds = new Set(
        state.perpendiculars
          .filter((item) => item.lineId === `line:${id}`)
          .map((item) => item.id),
      );
      const removedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              point.source === 'perpendicular' &&
              point.perpendicularMarkId &&
              removedPerpIds.has(point.perpendicularMarkId),
          )
          .map((point) => point.id),
      );
      return {
        markerLines: state.markerLines.filter((line) => line.id !== id),
        perpendiculars: state.perpendiculars.filter(
          (item) => !removedPerpIds.has(item.id),
        ),
        markedPoints: state.markedPoints.filter(
          (point) => !removedMarkerIds.has(point.id),
        ),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
        expandedId: state.expandedId === id ? null : state.expandedId,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  syncIntersectionMarkers: (markId, kind, points) => {
    const state = get();
    const existing = state.markedPoints.filter(
      (point) =>
        point.source === 'intersection' &&
        point.intersectionMarkId === markId &&
        (point.intersectionKind ?? 'object') === kind,
    );
    const maxPoints = Math.min(points.length, 8);
    const nextPoints = [...state.markedPoints];
    const removedIds = new Set<string>();
    let changed = false;
    for (let index = 0; index < maxPoints; index += 1) {
      const point = points[index];
      const marker = existing.find((item) => item.intersectionIndex === index);
      if (marker) {
        const markerIndex = nextPoints.findIndex((item) => item.id === marker.id);
        if (
          markerIndex >= 0 &&
          Math.hypot(
            nextPoints[markerIndex].point.x - point.x,
            nextPoints[markerIndex].point.y - point.y,
          ) > 1e-5
        ) {
          nextPoints[markerIndex] = {
            ...nextPoints[markerIndex],
            point: { x: point.x, y: point.y },
          };
          changed = true;
        }
      } else {
        const coincident = nextPoints.find(
          (item) =>
            !removedIds.has(item.id) &&
            Math.hypot(item.point.x - point.x, item.point.y - point.y) < 2e-2,
        );
        if (coincident) continue;
        nextPoints.push({
          id: uid('pt'),
          ownerId: '',
          source: 'intersection',
          intersectionMarkId: markId,
          intersectionIndex: index,
          intersectionKind: kind,
          name: nextMarkedPointName(nextPoints),
          point: { x: point.x, y: point.y },
          visible: true,
        });
        changed = true;
      }
    }
    for (const marker of existing) {
      if ((marker.intersectionIndex ?? 0) >= maxPoints) removedIds.add(marker.id);
    }
    // Keep only the first point when different intersections produce the same
    // coordinates. Later duplicates are remapped for existing lines/divisions.
    const kept: MarkedPoint[] = [];
    const aliases = new Map<string, string>();
    for (const point of nextPoints) {
      if (removedIds.has(point.id)) continue;
      if (point.source === 'intersection') {
        const first = kept.find(
          (candidate) =>
            Math.hypot(
              candidate.point.x - point.point.x,
              candidate.point.y - point.point.y,
            ) < 2e-2,
        );
        if (first) {
          aliases.set(point.id, first.id);
          removedIds.add(point.id);
          changed = true;
          continue;
        }
      }
      kept.push(point);
    }
    if (!changed && removedIds.size === 0) return;
    const remap = (id: string) => aliases.get(id) ?? id;
    set({
      markedPoints: kept,
      markerLines: state.markerLines
        .map((line) => ({ ...line, aId: remap(line.aId), bId: remap(line.bId) }))
        .filter(
          (line) =>
            line.aId !== line.bId &&
            !removedIds.has(line.aId) &&
            !removedIds.has(line.bId),
        ),
      divisionMarks: state.divisionMarks
        .map((mark) => ({ ...mark, aId: remap(mark.aId), bId: remap(mark.bId) }))
        .filter(
          (mark) =>
            mark.aId !== mark.bId &&
            !removedIds.has(mark.aId) &&
            !removedIds.has(mark.bId),
        ),
    });
  },

  addTangent: (ownerId) =>
    set((state) => {
      const tangent = { id: uid('tan'), point: null };
      const marker: MarkedPoint = {
        id: uid('pt'),
        ownerId,
        source: 'tangent',
        tangentOwnerId: ownerId,
        tangentId: tangent.id,
        name: nextMarkedPointName(state.markedPoints),
        point: { x: 0, y: 0 },
        visible: true,
      };
      return {
        items2d: state.items2d.map((item) =>
          item.id === ownerId ? { ...item, tangents: [...item.tangents, tangent] } : item,
        ),
        geometry: state.geometry.map((item) =>
          item.id === ownerId ? { ...item, tangents: [...item.tangents, tangent] } : item,
        ),
        markedPoints: [...state.markedPoints, marker],
      };
    }),

  removeTangent: (ownerId, tangentId) =>
    set((state) => {
      const keep = (ref: { ownerId: string; tangentId: string }) =>
        !(ref.ownerId === ownerId && ref.tangentId === tangentId);
      const tangentRef = tangentObjectId(ownerId, tangentId);
      const removedTangentIntersectionIds = new Set(
        state.tangentIntersections
          .filter((mark) => !(keep(mark.a) && keep(mark.b)))
          .map((mark) => mark.id),
      );
      const removedObjectIntersectionIds = new Set(
        state.intersections
          .filter((mark) => mark.aId === tangentRef || mark.bId === tangentRef)
          .map((mark) => mark.id),
      );
      const baseRemovedMarkerIds = new Set(
        state.markedPoints
          .filter(
            (point) =>
              (point.source === 'tangent' &&
                point.tangentOwnerId === ownerId &&
                point.tangentId === tangentId) ||
              (point.source === 'intersection' &&
                point.intersectionMarkId &&
                (removedTangentIntersectionIds.has(point.intersectionMarkId) ||
                  removedObjectIntersectionIds.has(point.intersectionMarkId))),
          )
          .map((point) => point.id),
      );
      const removedPerpIds = new Set(
        state.perpendiculars
          .filter(
            (item) =>
              item.lineId === tangentRef || baseRemovedMarkerIds.has(item.pointId),
          )
          .map((item) => item.id),
      );
      const removedMarkerIds = new Set([
        ...baseRemovedMarkerIds,
        ...state.markedPoints
          .filter(
            (point) =>
              point.source === 'perpendicular' &&
              point.perpendicularMarkId &&
              removedPerpIds.has(point.perpendicularMarkId),
          )
          .map((point) => point.id),
      ]);
      return {
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
        tangentIntersections: state.tangentIntersections.filter(
          (mark) => !removedTangentIntersectionIds.has(mark.id),
        ),
        intersections: state.intersections.filter(
          (mark) => !removedObjectIntersectionIds.has(mark.id),
        ),
        tangentAngleConstraints: state.tangentAngleConstraints.filter(
          (constraint) => keep(constraint.source) && keep(constraint.target),
        ),
        markedPoints: state.markedPoints.filter((point) => !removedMarkerIds.has(point.id)),
        divisionMarks: state.divisionMarks.filter(
          (mark) => !removedMarkerIds.has(mark.aId) && !removedMarkerIds.has(mark.bId),
        ),
        markerLines: state.markerLines.filter(
          (line) => !removedMarkerIds.has(line.aId) && !removedMarkerIds.has(line.bId),
        ),
        perpendiculars: state.perpendiculars.filter(
          (item) => !removedPerpIds.has(item.id),
        ),
      };
    }),

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
      markedPoints: state.markedPoints.map((marker) =>
        marker.source === 'tangent' &&
        marker.tangentOwnerId === ownerId &&
        marker.tangentId === tangentId
          ? { ...marker, point }
          : marker,
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
      tangentIntersections: [],
      tangentAngleConstraints: [],
      markedPoints: [],
      divisionMarks: [],
      markerLines: [],
      perpendiculars: [],
      paramValues: {},
      view2dBoundingBox: null,
      selectedId: null,
      expandedId: null,
      intersectionDraft: null,
      markerLineDraft: null,
      perpendicularDraft: null,
      activeTool: 'select',
      toolTrayOpen: false,
      autoMovePoints: false,
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
