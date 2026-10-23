import JXG from 'jsxgraph';
import type {
  DivisionMark,
  Geometry,
  IntersectionMark,
  Item2D,
  MarkedPoint,
  MarkerLine,
  Point2,
  Tangent,
  TangentAngleConstraint,
  TangentIntersectionMark,
  TangentRef,
} from '../../app/types';
import { formatNumber } from '../../app/utils';
import { geometryEquation } from '../geometry/equations';
import {
  analyze2DItem,
  collect2DParams,
  type ExplicitAnalysis,
  type ImplicitAnalysis,
  type Item2DAnalysis,
  type ParametricAnalysis,
} from './analysis';
import { buildCurveModels, computeIntersections, type CurveModel } from './intersections';
import { findTangentPointForAngle } from './tangentSolve';

type AnyElement = any;
type BoundingBox = [number, number, number, number];

export interface BoardSnapshot {
  items2d: Item2D[];
  geometry: Geometry[];
  intersections: IntersectionMark[];
  tangentIntersections: TangentIntersectionMark[];
  tangentAngleConstraints: TangentAngleConstraint[];
  markedPoints: MarkedPoint[];
  divisionMarks: DivisionMark[];
  markerLines: MarkerLine[];
  paramValues: Record<string, string>;
  snapToGrid: boolean;
}

export interface BoardCallbacks {
  onViewChange: (bbox: BoundingBox) => void;
  onTangentPointChange: (ownerId: string, tangentId: string, point: Point2) => void;
  onTangentMeta: (
    ownerId: string,
    tangentId: string,
    meta: { slope?: number; equation?: string },
  ) => void;
  onGeometryAnchorChange: (geometryId: string, anchorKey: string, point: Point2) => void;
  onDriverPointChange: (geometryId: string, point: Point2) => void;
  onMarkedPointChange: (pointId: string, point: Point2) => void;
  onIntersectionPoints: (
    markId: string,
    kind: 'object' | 'tangent',
    points: Point2[],
  ) => void;
  onBoardError: (message: string) => void;
}

interface TangentElements {
  glider: AnyElement;
  line: AnyElement;
  pointBeforeDrag: Point2 | null;
  /** Hidden second point used to render an exact tangent for implicit curves. */
  helper?: AnyElement;
  visible: boolean;
}

interface ExpressionEntry {
  id: string;
  item: Item2D;
  analysis: Item2DAnalysis;
  curve: AnyElement | null;
  derivative: AnyElement | null;
  tangents: Map<string, TangentElements>;
  kind: Item2D['kind'];
  rangeKey: string;
  curveStyleKey: string;
}

interface GeometryEntry {
  id: string;
  shape: Geometry;
  structuralKey: string;
  anchorPoints: Record<string, AnyElement>;
  main: AnyElement[];
  divisions: AnyElement[];
  tangents: Map<string, TangentElements>;
  driverGlider: AnyElement | null;
  driverTargetElement: AnyElement | null;
  equationLabel: AnyElement | null;
  lastTraceClearToken: number;
  lastShowDivisions: boolean;
  lastDriverPlaying: boolean;
}

interface IntersectionTrace {
  curve: AnyElement | null;
  points: Point2[];
  last: Point2 | null;
}

interface IntersectionEntry {
  mark: IntersectionMark;
  points: AnyElement[];
  labels: AnyElement[];
  traces: Array<IntersectionTrace | null>;
  lastTraceClearToken: number;
  lastShowTrace: boolean;
  lastHits: Array<Point2 | null>;
  lastLabelPositions: Array<Point2 | null>;
  lastLabelTexts: string[];
  lastColor: string;
}

interface TangentIntersectionEntry {
  mark: TangentIntersectionMark;
  point: AnyElement;
  label: AnyElement;
  trace: IntersectionTrace | null;
  lastTraceClearToken: number;
  lastShowTrace: boolean;
  lastPoint: Point2 | null;
  lastVisible: boolean;
  lastColor: string;
  lastCoordinates: boolean;
  lastLabelReport: number;
}

interface MarkedPointEntry {
  marked: MarkedPoint;
  glider: AnyElement;
  curve: AnyElement | null;
  owned: boolean;
  label: AnyElement | null;
  direction: 1 | -1;
  parameter?: number;
  lastVisible: boolean;
  lastName: string;
  lastX: number;
  lastY: number;
  lastLabelReport: number;
  lockSignature?: string;
  lockPoint?: Point2 | null;
}

interface DivisionEntry {
  mark: DivisionMark;
  segment: AnyElement | null;
  points: AnyElement[];
  labels: AnyElement[];
  traces: Array<IntersectionTrace | null>;
  lastTraceClearToken: number;
  lastShowTrace: boolean;
  lastDivisions: number;
}

interface MarkerLineEntry {
  id: string;
  line: AnyElement;
  pointA: AnyElement;
  pointB: AnyElement;
}

const INITIAL_BBOX: BoundingBox = [-10, 10, 10, -10];

function isFinitePoint(point: Point2 | null | undefined): point is Point2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export class Board2DController {
  readonly board: AnyElement;
  private readonly callbacks: BoardCallbacks;
  private readonly boardId: string;
  private readonly initialView: BoundingBox;
  private entries = new Map<string, ExpressionEntry>();
  private geometryEntries = new Map<string, GeometryEntry>();
  private intersectionEntries = new Map<string, IntersectionEntry>();
  private tangentIntersectionEntries = new Map<string, TangentIntersectionEntry>();
  private traceCanvas: HTMLCanvasElement | null = null;
  private traceContext: CanvasRenderingContext2D | null = null;
  private traceFrame: number | null = null;
  private autoMoveTimer: number | null = null;
  private markedPointEntries = new Map<string, MarkedPointEntry>();
  private divisionEntries = new Map<string, DivisionEntry>();
  private markerLineEntries = new Map<string, MarkerLineEntry>();
  private draggingPointIds = new Set<string>();
  private draggingTangentRefs = new Set<string>();
  private boardInteracting = false;
  private tangentConstraintStates = new Map<
    string,
    { source: Point2; target: Point2; angleDeg: number }
  >();
  private lastConstraintTargetReport = new Map<string, number>();
  private lastIntersectionMarkerReport = new Map<string, number>();
  private lastIntersectionMarkerCount = new Map<string, number>();
  private driverTargets = new Map<string, AnyElement>();
  private state: BoardSnapshot = {
    items2d: [],
    geometry: [],
    intersections: [],
    tangentIntersections: [],
    tangentAngleConstraints: [],
    markedPoints: [],
    divisionMarks: [],
    markerLines: [],
    paramValues: {},
    snapToGrid: true,
  };
  private numericParams: Record<string, number> = {};
  private disposed = false;
  private viewTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private wheelHandler: ((event: WheelEvent) => void) | null = null;
  private boardContainer: HTMLElement | null = null;
  private lastBBox: BoundingBox = INITIAL_BBOX;

  constructor(
    boardId: string,
    callbacks: BoardCallbacks,
    initialView: BoundingBox | null,
    snapshot: BoardSnapshot,
  ) {
    this.boardId = boardId;
    this.callbacks = callbacks;
    this.initialView = initialView ?? INITIAL_BBOX;
    this.lastBBox = this.initialView;
    this.state = snapshot;
    this.updateNumericParams(snapshot.paramValues, collect2DParams(snapshot.items2d));

    const JXGAny = JXG as any;
    try {
      this.board = JXGAny.JSXGraph.initBoard(boardId, {
        boundingbox: this.initialView,
        showNavigation: false,
        showCopyright: false,
        showInfobox: false,
        pan: { enabled: true, needTwoFingers: false, needShift: false },
        zoom: { enabled: true, wheel: false },
        keepAspectRatio: true,
        axis: {
          strokeColor: '#94a3b8',
          strokeWidth: 1.2,
          ticks: { strokeColor: '#cbd5e1', label: { fontSize: 11, strokeColor: '#64748b' } },
        },
        grid: {
          strokeColor: '#eef2f7',
          strokeWidth: 1,
        },
        defaultAxes: {
          x: {},
          y: {},
        },
      });
    } catch (error) {
      throw new Error(
        `画板初始化失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.board.on('boundingbox', () => {
      if (this.disposed) return;
      this.requestTraceRedraw();
      if (this.viewTimer) window.clearTimeout(this.viewTimer);
      this.viewTimer = window.setTimeout(() => {
        if (this.disposed) return;
        try {
          const bb = this.board.getBoundingBox() as BoundingBox;
          this.lastBBox = bb;
          this.callbacks.onViewChange(bb);
        } catch {
          // ignore transient board state
        }
      }, 180);
    });
    this.board.on('down', () => {
      this.boardInteracting = true;
    });
    this.board.on('up', () => {
      this.boardInteracting = false;
      this.invalidateIntersectionMarkerReports();
    });

    try {
      const container = document.getElementById(boardId);
      if (container) {
        container.style.touchAction = 'none';
        this.boardContainer = container;
        this.wheelHandler = (event: WheelEvent) => {
          if (this.disposed) return;
          const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
          if (!Number.isFinite(delta) || delta === 0) return;
          event.preventDefault();
          const rect = container.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          const bb = this.getBoundingBox();
          const fx = (event.clientX - rect.left) / rect.width;
          const fy = (event.clientY - rect.top) / rect.height;
          const anchorX = bb[0] + fx * (bb[2] - bb[0]);
          const anchorY = bb[1] + fy * (bb[3] - bb[1]);
          const factor = Math.min(2, Math.max(0.5, Math.exp(delta * 0.0015)));
          this.zoomAt(factor, anchorX, anchorY);
        };
        container.addEventListener('wheel', this.wheelHandler, { passive: false });
        const traceCanvas = document.createElement('canvas');
        traceCanvas.className = 'jxg-trace-overlay';
        traceCanvas.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
        container.appendChild(traceCanvas);
        this.traceCanvas = traceCanvas;
        this.traceContext = traceCanvas.getContext('2d');
        this.resizeObserver = new ResizeObserver((entries) => {
          if (this.disposed) return;
          const entry = entries[0];
          if (!entry) return;
          const width = Math.max(1, Math.round(entry.contentRect.width));
          const height = Math.max(1, Math.round(entry.contentRect.height));
          try {
            (this.board as any).resizeContainer?.(width, height, true);
            this.board.update();
          } catch {
            // Some JSXGraph versions resize automatically.
          }
          this.requestTraceRedraw();
        });
        this.resizeObserver.observe(container);
      }
    } catch {
      // Resize is a progressive enhancement.
    }

    this.sync(snapshot);
  }

  private updateNumericParams(
    paramValues: Record<string, string>,
    defaultParams: string[] = [],
  ): void {
    const next: Record<string, number> = {};
    for (const [name, raw] of Object.entries(paramValues)) {
      const value = Number(raw);
      next[name] = Number.isFinite(value) ? value : NaN;
    }
    for (const name of defaultParams) {
      if (!(name in next)) next[name] = 1;
    }
    this.numericParams = next;
  }

  private scope(extra: Record<string, number>): Record<string, number> {
    return { ...this.numericParams, ...extra };
  }

  /** Update the board from a store snapshot. */
  update(snapshot: BoardSnapshot): void {
    if (this.disposed) return;
    this.state = snapshot;
    this.updateNumericParams(snapshot.paramValues, collect2DParams(snapshot.items2d));
    this.sync(snapshot);
  }

  private sync(snapshot: BoardSnapshot): void {
    if (this.disposed) return;
    const seenItems = new Set<string>();
    for (const item of snapshot.items2d) {
      seenItems.add(item.id);
      this.syncItem(item);
    }
    for (const [id, entry] of this.entries) {
      if (!seenItems.has(id)) {
        this.destroyEntry(entry);
        this.entries.delete(id);
      }
    }

    const seenGeometry = new Set<string>();
    const nonLines = snapshot.geometry.filter((shape) => shape.kind !== 'line');
    const lines = snapshot.geometry.filter((shape) => shape.kind === 'line');
    for (const shape of nonLines) {
      seenGeometry.add(shape.id);
      this.syncGeometry(shape);
    }

    // Drivers may only reference expression curves and non-line geometry curves.
    // Rebuilding the target registry before syncing lines keeps the dependency
    // direction acyclic.
    this.driverTargets.clear();
    for (const [id, entry] of this.entries) {
      if (entry.curve) this.driverTargets.set(id, entry.curve);
    }
    for (const shape of nonLines) {
      const entry = this.geometryEntries.get(shape.id);
      if (entry?.main[0]) this.driverTargets.set(shape.id, entry.main[0]);
    }

    for (const shape of lines) {
      seenGeometry.add(shape.id);
      this.syncGeometry(shape);
      const entry = this.geometryEntries.get(shape.id);
      if (entry?.main[0]) this.driverTargets.set(shape.id, entry.main[0]);
    }
    // A line can also glide on another line. After all line elements exist,
    // rebuild any dependent line whose target was created later in this pass.
    for (const shape of lines) {
      if (!shape.driverCurveId) continue;
      const target = this.driverTargets.get(shape.driverCurveId);
      const entry = this.geometryEntries.get(shape.id);
      if (target && entry && entry.driverTargetElement !== target) {
        this.syncGeometry(shape);
      }
    }
    for (const [id, entry] of this.geometryEntries) {
      if (!seenGeometry.has(id)) {
        this.destroyGeometryEntry(entry);
        this.geometryEntries.delete(id);
      }
    }

    this.syncIntersections(snapshot);
    this.syncTangentAngleConstraints(snapshot);
    this.syncTangentIntersections(snapshot);
    this.syncMarkedPoints(snapshot);
    this.syncMarkerLines(snapshot);
    this.syncDivisionMarks(snapshot);

    try {
      this.board.update();
    } catch {
      // JSXGraph can complain transiently while elements are being replaced.
    }
  }

  private ensureIntersectionPoint(entry: IntersectionEntry, index: number): void {
    while (entry.points.length <= index) {
      const point = this.board.create('point', [0, 0], {
        name: '',
        withLabel: false,
        fixed: true,
        size: 3,
        fillColor: entry.mark.color,
        strokeColor: '#ffffff',
        strokeWidth: 1.4,
        highlight: false,
        showInfobox: false,
        visible: false,
        layer: 11,
      });
      const label = this.board.create('text', [0, 0, ''], {
        fontSize: 11,
        strokeColor: entry.mark.color,
        fixed: true,
        highlight: false,
        withLabel: false,
        showInfobox: false,
        visible: false,
        layer: 12,
      });
      entry.points.push(point);
      entry.labels.push(label);
      entry.traces.push(null);
    }
  }

  private ensureIntersectionTrace(entry: IntersectionEntry, index: number): IntersectionTrace {
    const existing = entry.traces[index];
    if (existing) return existing;
    const trace: IntersectionTrace = { curve: null, points: [], last: null };
    entry.traces[index] = trace;
    return trace;
  }

  private requestTraceRedraw(): void {
    if (this.disposed || this.traceFrame !== null) return;
    this.traceFrame = window.requestAnimationFrame(() => {
      this.traceFrame = null;
      this.drawTraceOverlay();
    });
  }

  private drawTraceOverlay(): void {
    const canvas = this.traceCanvas;
    const context = this.traceContext;
    const container = this.boardContainer;
    if (!canvas || !context || !container || this.disposed) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const bb = this.getBoundingBox();
    if (bb[2] === bb[0] || bb[1] === bb[3]) return;
    const project = (point: Point2): [number, number] => [
      ((point.x - bb[0]) / (bb[2] - bb[0])) * width,
      ((bb[1] - point.y) / (bb[1] - bb[3])) * height,
    ];
    const drawPath = (points: Point2[], color: string, lineWidth: number) => {
      if (points.length < 2) return;
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.globalAlpha = 0.86;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      const projected = points.map(project);
      context.beginPath();
      context.moveTo(projected[0][0], projected[0][1]);
      if (projected.length === 2) {
        context.lineTo(projected[1][0], projected[1][1]);
      } else {
        for (let index = 1; index < projected.length - 1; index += 1) {
          const current = projected[index];
          const next = projected[index + 1];
          context.quadraticCurveTo(
            current[0],
            current[1],
            (current[0] + next[0]) / 2,
            (current[1] + next[1]) / 2,
          );
        }
        const last = projected[projected.length - 1];
        context.lineTo(last[0], last[1]);
      }
      context.stroke();
    };
    for (const entry of this.tangentIntersectionEntries.values()) {
      const trace = entry.trace;
      if (!trace || trace.points.length < 2) continue;
      drawPath(trace.points, entry.mark.color, 2.4);
    }
    for (const entry of this.intersectionEntries.values()) {
      for (const trace of entry.traces) {
        if (!trace || trace.points.length < 2) continue;
        drawPath(trace.points, entry.mark.color, 2.2);
      }
    }
    for (const entry of this.divisionEntries.values()) {
      for (const trace of entry.traces) {
        if (!trace || trace.points.length < 2) continue;
        drawPath(trace.points, entry.mark.color, 2);
      }
    }
    context.globalAlpha = 1;
  }

  private rebuildIntersectionTrace(trace: IntersectionTrace, color: string): void {
    if (trace.curve) {
      try {
        this.board.removeObject(trace.curve);
      } catch {
        // ignore
      }
    }
    if (trace.points.length < 2) {
      trace.curve = null;
      return;
    }
    trace.curve = this.board.create(
      'curve',
      [trace.points.map((point) => point.x), trace.points.map((point) => point.y)],
      {
        strokeColor: color,
        strokeWidth: 3,
        strokeOpacity: 0.82,
        highlight: false,
        fixed: true,
        withLabel: false,
        layer: 20,
      },
    );
  }

  private clearIntersectionTrace(trace: IntersectionTrace): void {
    if (trace.curve) {
      try {
        this.board.removeObject(trace.curve);
      } catch {
        // ignore
      }
    }
    trace.curve = null;
    trace.points = [];
    trace.last = null;
    this.requestTraceRedraw();
  }

  private destroyIntersectionEntry(entry: IntersectionEntry): void {
    for (const point of entry.points) {
      try {
        this.board.removeObject(point);
      } catch {
        // ignore
      }
    }
    for (const label of entry.labels) {
      try {
        this.board.removeObject(label);
      } catch {
        // ignore
      }
    }
    for (const trace of entry.traces) {
      if (!trace) continue;
      this.clearIntersectionTrace(trace);
    }
    this.intersectionEntries.delete(entry.mark.id);
  }

  private reportIntersectionMarkers(
    markId: string,
    kind: 'object' | 'tangent',
    points: Point2[],
  ): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.lastIntersectionMarkerReport.get(markId);
    const lastCount = this.lastIntersectionMarkerCount.get(markId);
    const dragging =
      this.boardInteracting ||
      this.draggingTangentRefs.size > 0 ||
      this.draggingPointIds.size > 0;
    if (dragging && points.length === lastCount) return;
    if (points.length === lastCount && last !== undefined) {
      if (now - last < 120) return;
    }
    this.lastIntersectionMarkerReport.set(markId, now);
    this.lastIntersectionMarkerCount.set(markId, points.length);
    this.callbacks.onIntersectionPoints(markId, kind, points);
  }

  private invalidateIntersectionMarkerReports(): void {
    this.lastIntersectionMarkerReport.clear();
    this.lastIntersectionMarkerCount.clear();
  }

  private lineCurveModel(
    id: string,
    color: string,
    point: Point2,
    slope: number,
    bbox: BoundingBox,
  ): CurveModel {
    const vertical = !Number.isFinite(slope);
    const m = vertical ? 0 : slope;
    const b = vertical ? 0 : point.y - slope * point.x;
    const xMin = Math.min(bbox[0], bbox[2]);
    const xMax = Math.max(bbox[0], bbox[2]);
    const yMin = Math.min(bbox[1], bbox[3]);
    const yMax = Math.max(bbox[1], bbox[3]);
    return {
      id,
      color,
      line: vertical
        ? { vertical: true, verticalX: point.x, m: Infinity, b: 0 }
        : { vertical: false, verticalX: 0, m, b },
      implicit: vertical
        ? (x) => x - point.x
        : (x, y) => y - (m * x + b),
      segments: [
        vertical
          ? { fn: (t) => ({ x: point.x, y: t }), min: yMin, max: yMax }
          : { fn: (t) => ({ x: t, y: m * t + b }), min: xMin, max: xMax },
      ],
    };
  }

  private buildObjectIntersectionModels(snapshot: BoardSnapshot): Map<string, CurveModel> {
    const bbox = this.getBoundingBox();
    const models = buildCurveModels(
      snapshot.items2d,
      snapshot.geometry,
      this.numericParams,
      bbox,
    );
    const xMin = Math.min(bbox[0], bbox[2]);
    const xMax = Math.max(bbox[0], bbox[2]);
    const yMin = Math.min(bbox[1], bbox[3]);
    const yMax = Math.max(bbox[1], bbox[3]);

    models.set('axis:x', {
      id: 'axis:x',
      color: '#64748b',
      line: { vertical: false, verticalX: 0, m: 0, b: 0 },
      implicit: (_x, y) => y,
      segments: [{ fn: (t) => ({ x: t, y: 0 }), min: xMin, max: xMax }],
    });
    models.set('axis:y', {
      id: 'axis:y',
      color: '#64748b',
      line: { vertical: true, verticalX: 0, m: Infinity, b: 0 },
      implicit: (x) => x,
      segments: [{ fn: (t) => ({ x: 0, y: t }), min: yMin, max: yMax }],
    });

    for (const item of snapshot.items2d) {
      for (const tangent of item.tangents) {
        const ref = { ownerId: item.id, tangentId: tangent.id };
        const info = this.tangentLineInfo(ref);
        if (!info) continue;
        models.set(
          `tan:${item.id}:${tangent.id}`,
          this.lineCurveModel(
            `tan:${item.id}:${tangent.id}`,
            item.color,
            { x: info.px, y: info.py },
            info.slope,
            bbox,
          ),
        );
      }
    }

    for (const line of snapshot.markerLines) {
      const a = snapshot.markedPoints.find((point) => point.id === line.aId);
      const b = snapshot.markedPoints.find((point) => point.id === line.bId);
      if (!a || !b) continue;
      const dx = b.point.x - a.point.x;
      const dy = b.point.y - a.point.y;
      const slope = Math.abs(dx) < 1e-12 ? Infinity : dy / dx;
      models.set(
        `line:${line.id}`,
        this.lineCurveModel(`line:${line.id}`, line.color, a.point, slope, bbox),
      );
    }
    return models;
  }

  private syncIntersections(snapshot: BoardSnapshot): void {
    if (snapshot.intersections.length === 0 && this.intersectionEntries.size === 0) return;
    const seen = new Set<string>();
    let models: Map<string, CurveModel> | null = null;

    for (const mark of snapshot.intersections) {
      seen.add(mark.id);
      let entry = this.intersectionEntries.get(mark.id);
      if (!entry) {
        entry = {
          mark,
          points: [],
          labels: [],
          traces: [],
          lastTraceClearToken: mark.traceClearToken,
          lastShowTrace: mark.showTrace,
          lastHits: [],
          lastLabelPositions: [],
          lastLabelTexts: [],
          lastColor: '',
        };
        this.intersectionEntries.set(mark.id, entry);
      }
      entry.mark = mark;

      if (!models) {
        models = this.buildObjectIntersectionModels(snapshot);
      }
      const a = models.get(mark.aId);
      const b = models.get(mark.bId);
      const intersections = mark.visible && a && b ? computeIntersections(a, b) : [];
      this.reportIntersectionMarkers(mark.id, 'object', intersections);
      const traceReset =
        entry.lastTraceClearToken !== mark.traceClearToken ||
        entry.lastShowTrace !== mark.showTrace;
      entry.lastTraceClearToken = mark.traceClearToken;
      entry.lastShowTrace = mark.showTrace;
      const shouldTrace = mark.visible && mark.showTrace;

      for (let index = 0; index < 8; index += 1) {
        this.ensureIntersectionPoint(entry, index);
        const point = entry.points[index];
        const label = entry.labels[index];
        const trace = entry.traces[index];
        const hit = intersections[index];

        if (hit) {
          try {
            const pointVisible = !!point.visProp?.visible;
            const labelVisible = !!label.visProp?.visible;
            const colorChanged = entry.lastColor !== mark.color;
            if (!pointVisible) {
              point.setAttribute({
                visible: true,
                fillColor: mark.color,
                strokeColor: '#ffffff',
              });
            } else if (colorChanged) {
              point.setAttribute({ fillColor: mark.color });
            }
            const previousPoint = entry.lastHits[index];
            if (
              !previousPoint ||
              Math.abs(previousPoint.x - hit.x) > 1e-4 ||
              Math.abs(previousPoint.y - hit.y) > 1e-4
            ) {
              point.setPosition(JXG.COORDS_BY_USER, [hit.x, hit.y]);
              entry.lastHits[index] = { x: hit.x, y: hit.y };
            }
            const shouldShowLabel = mark.visible && mark.showCoordinates;
            if (labelVisible !== shouldShowLabel || colorChanged) {
              label.setAttribute({
                visible: shouldShowLabel,
                strokeColor: mark.color,
              });
            }
            const text = `(${formatNumber(hit.x)}, ${formatNumber(hit.y)})`;
            if (entry.lastLabelTexts[index] !== text) {
              label.setText(text);
              entry.lastLabelTexts[index] = text;
            }
            const labelPosition = { x: hit.x + 0.22, y: hit.y + 0.22 };
            const previousLabel = entry.lastLabelPositions[index];
            if (
              !previousLabel ||
              Math.abs(previousLabel.x - labelPosition.x) > 1e-4 ||
              Math.abs(previousLabel.y - labelPosition.y) > 1e-4
            ) {
              label.setPosition(JXG.COORDS_BY_USER, [labelPosition.x, labelPosition.y]);
              entry.lastLabelPositions[index] = labelPosition;
            }
          } catch {
            // ignore transient point errors
          }
        } else {
          try {
            if (point.visProp?.visible) point.setAttribute({ visible: false });
            if (label.visProp?.visible) label.setAttribute({ visible: false });
            entry.lastHits[index] = null;
            entry.lastLabelPositions[index] = null;
          } catch {
            // ignore
          }
        }

        if (trace) {
          try {
            if (traceReset || !shouldTrace) {
              this.clearIntersectionTrace(trace);
            }
            if (shouldTrace && hit) {
              if (
                !trace.last ||
                Math.hypot(trace.last.x - hit.x, trace.last.y - hit.y) > 1e-4
              ) {
                trace.points.push({ x: hit.x, y: hit.y });
                if (trace.points.length > 600) {
                  trace.points.splice(0, trace.points.length - 600);
                }
                trace.last = { x: hit.x, y: hit.y };
                this.requestTraceRedraw();
              }
            }
          } catch {
            // ignore trace errors
          }
        } else if (shouldTrace && hit) {
          try {
            const created = this.ensureIntersectionTrace(entry, index);
            created.last = { x: hit.x, y: hit.y };
          } catch {
            // ignore
          }
        }
      }
      entry.lastColor = mark.color;
    }

    for (const [id, entry] of this.intersectionEntries) {
      if (!seen.has(id)) this.destroyIntersectionEntry(entry);
    }
  }

  private resolveTangent(ref: TangentRef): {
    entry: ExpressionEntry;
    tangent: TangentElements;
    item: Item2D;
  } | null {
    const entry = this.entries.get(ref.ownerId);
    const tangent = entry?.tangents.get(ref.tangentId);
    if (!entry || !tangent || !entry.item.visible) return null;
    return { entry, tangent, item: entry.item };
  }

  private tangentLineInfo(ref: TangentRef): {
    px: number;
    py: number;
    slope: number;
    m: number;
    b: number;
    vertical: boolean;
  } | null {
    const resolved = this.resolveTangent(ref);
    if (!resolved) return null;
    try {
      const px = resolved.tangent.glider.X();
      const py = resolved.tangent.glider.Y();
      if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
      let slope: number;
      if (resolved.entry.item.kind === 'implicit') {
        const exact = this.implicitTangentSlope(resolved.entry, px, py);
        slope = exact === null ? NaN : exact;
      } else {
        const raw = resolved.tangent.line.getSlope();
        slope = typeof raw === 'number' && Number.isFinite(raw) ? raw : Infinity;
      }
      if (Number.isNaN(slope)) {
        const raw = resolved.tangent.line.getSlope();
        slope = typeof raw === 'number' && Number.isFinite(raw) ? raw : Infinity;
      }
      const vertical = !Number.isFinite(slope);
      return {
        px,
        py,
        slope,
        m: vertical ? 0 : slope,
        b: vertical ? 0 : py - slope * px,
        vertical,
      };
    } catch {
      return null;
    }
  }

  private tangentAngleOf(ref: TangentRef): number | null {
    const info = this.tangentLineInfo(ref);
    if (!info) return null;
    return info.vertical ? Math.PI / 2 : Math.atan2(info.m, 1);
  }
  private syncTangentAngleConstraints(snapshot: BoardSnapshot): void {
    if (snapshot.tangentAngleConstraints.length === 0) {
      this.tangentConstraintStates.clear();
      return;
    }
    const seen = new Set<string>();
    for (const constraint of snapshot.tangentAngleConstraints) {
      seen.add(constraint.id);
      if (
        constraint.source.ownerId === constraint.target.ownerId &&
        constraint.source.tangentId === constraint.target.tangentId
      ) {
        continue;
      }
      const source = this.resolveTangent(constraint.source);
      const target = this.resolveTangent(constraint.target);
      const sourceAngle = this.tangentAngleOf(constraint.source);
      const targetAngle = this.tangentAngleOf(constraint.target);
      if (!source || !target || sourceAngle === null || targetAngle === null) continue;
      const sourcePoint = { x: source.tangent.glider.X(), y: source.tangent.glider.Y() };
      const targetPoint = { x: target.tangent.glider.X(), y: target.tangent.glider.Y() };
      const previous = this.tangentConstraintStates.get(constraint.id);
      const sourceMoved =
        !previous ||
        Math.hypot(previous.source.x - sourcePoint.x, previous.source.y - sourcePoint.y) > 1e-4 ||
        Math.abs(previous.angleDeg - constraint.angleDeg) > 1e-6;
      const targetMoved =
        !previous ||
        Math.hypot(previous.target.x - targetPoint.x, previous.target.y - targetPoint.y) > 1e-4;
      const driver = sourceMoved ? 'source' : targetMoved ? 'target' : null;
      if (!driver) continue;
      const desiredAngle =
        driver === 'source'
          ? sourceAngle + (constraint.angleDeg * Math.PI) / 180
          : targetAngle - (constraint.angleDeg * Math.PI) / 180;
      const moving = driver === 'source' ? target : source;
      const movingRef = driver === 'source' ? constraint.target : constraint.source;
      const current = driver === 'source' ? targetPoint : sourcePoint;
      const point = findTangentPointForAngle({
        item: moving.item,
        params: this.numericParams,
        view: this.getBoundingBox(),
        desiredAngle,
        currentPoint: current,
      });
      if (!point) continue;
      if (Math.hypot(point.x - current.x, point.y - current.y) > 1e-4) {
        try {
          moving.tangent.glider.setPosition(JXG.COORDS_BY_USER, [point.x, point.y]);
          this.updateImplicitTangentLine(moving.entry, moving.tangent);
          if (moving.item.kind !== 'implicit') this.board.update();
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const last = this.lastConstraintTargetReport.get(constraint.id) ?? 0;
          const dragging =
            this.draggingTangentRefs.has(
              `${constraint.source.ownerId}:${constraint.source.tangentId}`,
            ) ||
            this.draggingTangentRefs.has(
              `${constraint.target.ownerId}:${constraint.target.tangentId}`,
            );
          if (!dragging && now - last >= 80) {
            this.lastConstraintTargetReport.set(constraint.id, now);
            this.callbacks.onTangentPointChange(movingRef.ownerId, movingRef.tangentId, point);
            this.callbacks.onTangentMeta(
              movingRef.ownerId,
              movingRef.tangentId,
              this.tangentMeta(moving.tangent.glider, moving.tangent.line),
            );
          }
        } catch {
          // ignore transient tangent constraint errors
        }
      }
      try {
        this.tangentConstraintStates.set(constraint.id, {
          source: { x: source.tangent.glider.X(), y: source.tangent.glider.Y() },
          target: { x: target.tangent.glider.X(), y: target.tangent.glider.Y() },
          angleDeg: constraint.angleDeg,
        });
      } catch {
        // ignore
      }
    }
    for (const id of this.tangentConstraintStates.keys()) {
      if (!seen.has(id)) this.tangentConstraintStates.delete(id);
    }
  }

  private ensureTangentIntersectionEntry(mark: TangentIntersectionMark): TangentIntersectionEntry {
    let entry = this.tangentIntersectionEntries.get(mark.id);
    if (entry) {
      entry.mark = mark;
      return entry;
    }
    const point = this.board.create('point', [0, 0], {
      name: '',
      withLabel: false,
      fixed: true,
      size: 3.4,
      fillColor: mark.color,
      strokeColor: '#ffffff',
      strokeWidth: 1.5,
      highlight: false,
      showInfobox: false,
      visible: false,
      layer: 11,
    });
    const label = this.board.create('text', [0, 0, ''], {
      fontSize: 11,
      strokeColor: mark.color,
      fixed: true,
      highlight: false,
      withLabel: false,
      showInfobox: false,
      visible: false,
      layer: 12,
    });
    entry = {
      mark,
      point,
      label,
      trace: null,
      lastTraceClearToken: mark.traceClearToken,
      lastShowTrace: mark.showTrace,
      lastPoint: null,
      lastVisible: false,
      lastColor: '',
      lastCoordinates: false,
      lastLabelReport: 0,
    };
    this.tangentIntersectionEntries.set(mark.id, entry);
    return entry;
  }

  private tangentLinesIntersection(refA: TangentRef, refB: TangentRef): Point2 | null {
    const a = this.tangentLineInfo(refA);
    const b = this.tangentLineInfo(refB);
    if (!a || !b) return null;
    if (a.vertical && b.vertical) return null;
    if (a.vertical) return { x: a.px, y: b.m * a.px + b.b };
    if (b.vertical) return { x: b.px, y: a.m * b.px + a.b };
    if (Math.abs(a.m - b.m) < 1e-9) return null;
    const x = (b.b - a.b) / (a.m - b.m);
    return { x, y: a.m * x + a.b };
  }

  private destroyTangentIntersectionEntry(entry: TangentIntersectionEntry): void {
    try {
      this.board.removeObject(entry.point);
      this.board.removeObject(entry.label);
      if (entry.trace?.curve) this.board.removeObject(entry.trace.curve);
    } catch {
      // ignore
    }
    this.tangentIntersectionEntries.delete(entry.mark.id);
  }

  private reportConstraintCounterpart(ownerId: string, tangentId: string): void {
    if (this.disposed) return;
    for (const constraint of this.state.tangentAngleConstraints) {
      const isSource =
        constraint.source.ownerId === ownerId && constraint.source.tangentId === tangentId;
      const isTarget =
        constraint.target.ownerId === ownerId && constraint.target.tangentId === tangentId;
      if (!isSource && !isTarget) continue;
      const ref = isSource ? constraint.target : constraint.source;
      const resolved = this.resolveTangent(ref);
      if (!resolved) continue;
      try {
        const point = { x: resolved.tangent.glider.X(), y: resolved.tangent.glider.Y() };
        this.callbacks.onTangentPointChange(ref.ownerId, ref.tangentId, point);
        this.callbacks.onTangentMeta(
          ref.ownerId,
          ref.tangentId,
          this.tangentMeta(resolved.tangent.glider, resolved.tangent.line),
        );
        this.lastConstraintTargetReport.set(
          constraint.id,
          typeof performance !== 'undefined' ? performance.now() : Date.now(),
        );
      } catch {
        // ignore
      }
    }
  }

  private clearTangentTracesFor(ownerId: string, tangentId: string): void {
    for (const entry of this.tangentIntersectionEntries.values()) {
      const references =
        (entry.mark.a.ownerId === ownerId && entry.mark.a.tangentId === tangentId) ||
        (entry.mark.b.ownerId === ownerId && entry.mark.b.tangentId === tangentId);
      if (!references || !entry.trace) continue;
      this.clearIntersectionTrace(entry.trace);
    }
    this.requestTraceRedraw();
  }

  private traceJumpTooLarge(last: Point2, next: Point2): boolean {
    const container = this.boardContainer;
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const bb = this.getBoundingBox();
    const dx = ((next.x - last.x) / (bb[2] - bb[0])) * rect.width;
    const dy = ((next.y - last.y) / (bb[1] - bb[3])) * rect.height;
    return Math.hypot(dx, dy) > 70;
  }

  private syncTangentIntersections(snapshot: BoardSnapshot): void {
    if (snapshot.tangentIntersections.length === 0 && this.tangentIntersectionEntries.size === 0) {
      return;
    }
    const seen = new Set<string>();
    for (const mark of snapshot.tangentIntersections) {
      seen.add(mark.id);
      const entry = this.ensureTangentIntersectionEntry(mark);
      const hit =
        mark.visible && this.resolveTangent(mark.a) && this.resolveTangent(mark.b)
          ? this.tangentLinesIntersection(mark.a, mark.b)
          : null;
      const reset =
        entry.lastTraceClearToken !== mark.traceClearToken ||
        entry.lastShowTrace !== mark.showTrace;
      entry.lastTraceClearToken = mark.traceClearToken;
      entry.lastShowTrace = mark.showTrace;

      const pointChanged =
        !entry.lastPoint ||
        Math.hypot(entry.lastPoint.x - (hit?.x ?? 0), entry.lastPoint.y - (hit?.y ?? 0)) >
          1e-5;
      const styleChanged =
        entry.lastVisible !== mark.visible ||
        entry.lastColor !== mark.color ||
        entry.lastCoordinates !== mark.showCoordinates;
      if (hit) {
        if (pointChanged || styleChanged) {
          try {
            if (styleChanged) {
              entry.point.setAttribute({
                visible: mark.visible,
                fillColor: mark.color,
                strokeColor: '#ffffff',
              });
              entry.label.setAttribute({
                visible: mark.visible && mark.showCoordinates,
                strokeColor: mark.color,
              });
            }
            if (pointChanged) {
              entry.point.setPosition(JXG.COORDS_BY_USER, [hit.x, hit.y]);
              const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (now - entry.lastLabelReport >= 100) {
                entry.lastLabelReport = now;
                entry.label.setText(`(${formatNumber(hit.x)}, ${formatNumber(hit.y)})`);
                entry.label.setPosition(JXG.COORDS_BY_USER, [hit.x + 0.22, hit.y + 0.22]);
              }
            }
          } catch {
            // ignore
          }
        }
        entry.lastVisible = mark.visible;
        entry.lastColor = mark.color;
        entry.lastCoordinates = mark.showCoordinates;
      } else if (entry.lastVisible) {
        try {
          entry.point.setAttribute({ visible: false });
          entry.label.setAttribute({ visible: false });
        } catch {
          // ignore
        }
        entry.lastVisible = false;
      }

      if (!entry.trace) {
        entry.trace = { curve: null, points: [], last: null };
      }
      const trace = entry.trace;
      if (reset || !mark.visible || !mark.showTrace) {
        this.clearIntersectionTrace(trace);
      }
      if (hit && mark.visible && mark.showTrace) {
        if (!trace.last || Math.hypot(trace.last.x - hit.x, trace.last.y - hit.y) > 1e-4) {
          trace.points.push({ x: hit.x, y: hit.y });
          if (trace.points.length > 600) trace.points.splice(0, trace.points.length - 600);
          trace.last = { x: hit.x, y: hit.y };
        }
      }
      entry.lastPoint = hit;
      this.reportIntersectionMarkers(mark.id, 'tangent', hit ? [hit] : []);
    }
    for (const [id, entry] of this.tangentIntersectionEntries) {
      if (!seen.has(id)) this.destroyTangentIntersectionEntry(entry);
    }
    this.requestTraceRedraw();
  }

  private solveCoordinateLock(
    entry: ExpressionEntry,
    current: Point2,
    lock: { axis: 'x' | 'y'; value: number },
  ): Point2 | null {
    const item = entry.item;
    const bb = this.getBoundingBox();
    const xMin = Math.min(bb[0], bb[2]);
    const xMax = Math.max(bb[0], bb[2]);
    const yMin = Math.min(bb[1], bb[3]);
    const yMax = Math.max(bb[1], bb[3]);
    const target = lock.value;
    const residual = (point: Point2) => Math.abs((lock.axis === 'x' ? point.x : point.y) - target);
    const choose = (candidates: Point2[]): Point2 | null => {
      if (candidates.length === 0) return null;
      return candidates.reduce((best, point) => {
        const bestDistance =
          residual(best) * 1000 +
          Math.hypot(best.x - current.x, best.y - current.y);
        const distance =
          residual(point) * 1000 + Math.hypot(point.x - current.x, point.y - current.y);
        return distance < bestDistance ? point : best;
      });
    };

    if (item.kind === 'explicit') {
      const analysis = entry.analysis as ExplicitAnalysis;
      if (!analysis.expr.ok) return null;
      if (lock.axis === 'x') {
        const y = analysis.expr.evaluate(this.scope({ x: target }));
        return Number.isFinite(y) ? { x: target, y } : null;
      }
      const samples = 1200;
      const candidates: Point2[] = [];
      for (let index = 0; index <= samples; index += 1) {
        const x = xMin + ((xMax - xMin) * index) / samples;
        const y = analysis.expr.evaluate(this.scope({ x }));
        if (Number.isFinite(y)) candidates.push({ x, y });
      }
      return choose(candidates);
    }

    if (item.kind === 'parametric') {
      const analysis = entry.analysis as ParametricAnalysis;
      if (!analysis.x.ok || !analysis.y.ok) return null;
      const samples = 1200;
      const candidates: Point2[] = [];
      for (let index = 0; index <= samples; index += 1) {
        const t = item.tMin + ((item.tMax - item.tMin) * index) / samples;
        const scope = this.scope({ t });
        const x = analysis.x.evaluate(scope);
        const y = analysis.y.evaluate(scope);
        if (Number.isFinite(x) && Number.isFinite(y)) candidates.push({ x, y });
      }
      return choose(candidates);
    }

    const analysis = entry.analysis as ImplicitAnalysis;
    if (!analysis.expr.ok) return null;
    const evaluate = (x: number, y: number) =>
      analysis.expr.ok ? analysis.expr.evaluate(this.scope({ x, y })) : NaN;
    const grid = 180;
    const candidates: Point2[] = [];
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
        for (let edge = 0; edge < 4; edge += 1) {
          const a = corners[edge];
          const b = corners[(edge + 1) % 4];
          if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
          if (a.value === 0 || b.value === 0 || a.value * b.value < 0) {
            const ratio =
              Math.abs(a.value) + Math.abs(b.value) < 1e-12
                ? 0.5
                : Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value));
            const point = {
              x: a.x + (b.x - a.x) * ratio,
              y: a.y + (b.y - a.y) * ratio,
            };
            const projected = this.projectImplicit(evaluate, point);
            if (projected && this.insideView(projected)) candidates.push(projected);
          }
        }
      }
    }
    return choose(candidates);
  }

  public findCurvePointAt(
    x: number,
    y: number,
    tolerancePx = 28,
  ): { ownerId: string; point: Point2; distancePx: number } | null {
    const bb = this.getBoundingBox();
    const width = Math.max(1, Number((this.board as any).canvasWidth) || 1);
    const height = Math.max(1, Number((this.board as any).canvasHeight) || 1);
    const xSpan = bb[2] - bb[0];
    const ySpan = bb[1] - bb[3];
    if (xSpan <= 0 || ySpan <= 0) return null;
    let bestHolder: { value: { ownerId: string; point: Point2; distancePx: number } | null } = {
      value: null,
    };
    const consider = (ownerId: string, point: Point2) => {
      if (!isFinitePoint(point)) return;
      const distancePx = Math.hypot(
        ((point.x - x) / xSpan) * width,
        ((point.y - y) / ySpan) * height,
      );
      if (!bestHolder.value || distancePx < bestHolder.value.distancePx) {
        bestHolder.value = { ownerId, point, distancePx };
      }
    };
    for (const [ownerId, entry] of this.entries) {
      if (!entry.item.visible || !entry.curve) continue;
      const model = buildCurveModels([entry.item], [], this.numericParams, bb).get(ownerId);
      if (!model) continue;
      for (const segment of model.segments) {
        const samples = 480;
        for (let index = 0; index <= samples; index += 1) {
          const t = segment.min + ((segment.max - segment.min) * index) / samples;
          consider(ownerId, segment.fn(t));
        }
      }
      if (model.implicit) {
        const grid = 150;
        for (let iy = 0; iy < grid; iy += 1) {
          const y0 = bb[3] + ((bb[1] - bb[3]) * iy) / grid;
          const y1 = bb[3] + ((bb[1] - bb[3]) * (iy + 1)) / grid;
          for (let ix = 0; ix < grid; ix += 1) {
            const x0 = bb[0] + ((bb[2] - bb[0]) * ix) / grid;
            const x1 = bb[0] + ((bb[2] - bb[0]) * (ix + 1)) / grid;
            const corners = [
              { x: x0, y: y0, value: model.implicit(x0, y0) },
              { x: x1, y: y0, value: model.implicit(x1, y0) },
              { x: x1, y: y1, value: model.implicit(x1, y1) },
              { x: x0, y: y1, value: model.implicit(x0, y1) },
            ];
            for (let edge = 0; edge < 4; edge += 1) {
              const a = corners[edge];
              const b = corners[(edge + 1) % 4];
              if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
              if (a.value === 0 || b.value === 0 || a.value * b.value < 0) {
                const ratio =
                  Math.abs(a.value) + Math.abs(b.value) < 1e-12
                    ? 0.5
                    : Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value));
                consider(ownerId, {
                  x: a.x + (b.x - a.x) * ratio,
                  y: a.y + (b.y - a.y) * ratio,
                });
              }
            }
          }
        }
      }
    }
    const best = bestHolder.value;
    return best && best.distancePx <= tolerancePx ? best : null;
  }

  private destroyMarkedPointEntry(entry: MarkedPointEntry): void {    if (entry.owned) {
      try {
        this.board.removeObject(entry.glider);
      } catch {
        // ignore
      }
    }
    if (entry.label) {
      try {
        this.board.removeObject(entry.label);
      } catch {
        // ignore
      }
    }
    this.markedPointEntries.delete(entry.marked.id);
  }

  private ensureMarkedPointEntry(
    marked: MarkedPoint,
    curve: AnyElement,
  ): MarkedPointEntry | null {
    const existing = this.markedPointEntries.get(marked.id);
    if (existing && existing.owned && existing.curve === curve) return existing;
    if (existing) this.destroyMarkedPointEntry(existing);
    try {
      const glider = this.board.create('glider', [marked.point.x, marked.point.y, curve], {
        name: marked.name,
        withLabel: true,
        size: 5,
        fillColor: '#0f766e',
        strokeColor: '#ffffff',
        strokeWidth: 2,
        highlight: false,
        showInfobox: false,
        layer: 9,
        label: {
          offset: [8, -8],
          fontSize: 12,
          strokeColor: '#0f766e',
        },
      });
      const entry: MarkedPointEntry = {
        marked,
        glider,
        curve,
        owned: true,
        label: null,
        direction: 1,
        lastVisible: false,
        lastName: '',
        lastX: NaN,
        lastY: NaN,
        lastLabelReport: 0,
      };
      glider.on('down', () => {
        this.draggingPointIds.add(marked.id);
      });
      glider.on('drag', () => {
        this.draggingPointIds.add(marked.id);
        this.callbacks.onMarkedPointChange(marked.id, {
          x: glider.X(),
          y: glider.Y(),
        });
      });
      glider.on('up', () => {
        this.draggingPointIds.delete(marked.id);
        this.callbacks.onMarkedPointChange(marked.id, {
          x: glider.X(),
          y: glider.Y(),
        });
      });
      this.markedPointEntries.set(marked.id, entry);
      return entry;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private ensureFreeMarkedPointEntry(marked: MarkedPoint): MarkedPointEntry | null {
    const existing = this.markedPointEntries.get(marked.id);
    if (existing && existing.owned && existing.curve === null) return existing;
    if (existing) this.destroyMarkedPointEntry(existing);
    try {
      const point = this.board.create('point', [marked.point.x, marked.point.y], {
        name: marked.name,
        withLabel: true,
        size: 5,
        fillColor: '#0f766e',
        strokeColor: '#ffffff',
        strokeWidth: 2,
        highlight: false,
        showInfobox: false,
        layer: 9,
        label: {
          offset: [8, -8],
          fontSize: 12,
          strokeColor: '#0f766e',
        },
      });
      const entry: MarkedPointEntry = {
        marked,
        glider: point,
        curve: null,
        owned: true,
        label: null,
        direction: 1,
        lastVisible: false,
        lastName: '',
        lastX: NaN,
        lastY: NaN,
        lastLabelReport: 0,
      };
      point.on('down', () => {
        this.draggingPointIds.add(marked.id);
      });
      point.on('drag', () => {
        this.draggingPointIds.add(marked.id);
        this.callbacks.onMarkedPointChange(marked.id, { x: point.X(), y: point.Y() });
      });
      point.on('up', () => {
        this.draggingPointIds.delete(marked.id);
        this.callbacks.onMarkedPointChange(marked.id, { x: point.X(), y: point.Y() });
      });
      this.markedPointEntries.set(marked.id, entry);
      return entry;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private ensureTangentMarkedPointEntry(
    marked: MarkedPoint,
    tangent: TangentElements,
    curve: AnyElement,
  ): MarkedPointEntry | null {
    if (!tangent) return null;
    const existing = this.markedPointEntries.get(marked.id);
    if (existing && !existing.owned && existing.glider === tangent.glider) {
      return existing;
    }
    if (existing) this.destroyMarkedPointEntry(existing);
    try {
      const label = this.board.create('text', [0, 0, marked.name], {
        fontSize: 12,
        strokeColor: '#0f766e',
        fixed: true,
        highlight: false,
        withLabel: false,
        showInfobox: false,
        layer: 9,
      });
      const entry: MarkedPointEntry = {
        marked,
        glider: tangent.glider,
        curve,
        owned: false,
        label,
        direction: 1,
        lastVisible: false,
        lastName: '',
        lastX: NaN,
        lastY: NaN,
        lastLabelReport: 0,
      };
      this.markedPointEntries.set(marked.id, entry);
      return entry;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private ensureIntersectionMarkedPointEntry(marked: MarkedPoint): MarkedPointEntry | null {
    const existing = this.markedPointEntries.get(marked.id);
    if (existing && existing.owned && existing.curve === null) return existing;
    if (existing) this.destroyMarkedPointEntry(existing);
    try {
      const anchor = this.board.create('point', [marked.point.x, marked.point.y], {
        visible: false,
        fixed: true,
        withLabel: false,
        showInfobox: false,
        layer: 8,
      });
      const label = this.board.create('text', [0, 0, marked.name], {
        fontSize: 12,
        strokeColor: '#be123c',
        fixed: true,
        highlight: false,
        withLabel: false,
        showInfobox: false,
        layer: 12,
      });
      const entry: MarkedPointEntry = {
        marked,
        glider: anchor,
        curve: null,
        owned: true,
        label,
        direction: 1,
        lastVisible: false,
        lastName: '',
        lastX: NaN,
        lastY: NaN,
        lastLabelReport: 0,
      };
      this.markedPointEntries.set(marked.id, entry);
      return entry;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private syncMarkedPoints(snapshot: BoardSnapshot): void {
    const seen = new Set<string>();
    for (const marked of snapshot.markedPoints) {
      seen.add(marked.id);
      if (marked.source === 'intersection') {
        const entry = this.ensureIntersectionMarkedPointEntry(marked);
        if (!entry) continue;
        entry.marked = marked;
        try {
          const labelX = marked.point.x + 0.16;
          const labelY = marked.point.y + 0.16;
          if (
            entry.lastVisible !== marked.visible ||
            entry.lastName !== marked.name
          ) {
            entry.glider.setPosition(JXG.COORDS_BY_USER, [marked.point.x, marked.point.y]);
            entry.label?.setAttribute({ visible: marked.visible });
            entry.label?.setText?.(marked.name);
            entry.lastVisible = marked.visible;
            entry.lastName = marked.name;
          }
          if (
            Math.abs(labelX - entry.lastX) > 1e-4 ||
            Math.abs(labelY - entry.lastY) > 1e-4
          ) {
            entry.glider.setPosition(JXG.COORDS_BY_USER, [marked.point.x, marked.point.y]);
            entry.label?.setPosition(JXG.COORDS_BY_USER, [labelX, labelY]);
            entry.lastX = labelX;
            entry.lastY = labelY;
          }
        } catch {
          // ignore
        }
        continue;
      }
      if (marked.source === 'free') {
        const entry = this.ensureFreeMarkedPointEntry(marked);
        if (!entry) continue;
        entry.marked = marked;
        try {
          if (entry.lastVisible !== marked.visible || entry.lastName !== marked.name) {
            entry.glider.setAttribute({
              visible: marked.visible,
              fillColor: '#0f766e',
              name: marked.name,
            });
            entry.glider.label?.setText?.(marked.name);
            entry.lastVisible = marked.visible;
            entry.lastName = marked.name;
          }
          if (
            !this.draggingPointIds.has(marked.id) &&
            (Math.abs(entry.glider.X() - marked.point.x) > 1e-4 ||
              Math.abs(entry.glider.Y() - marked.point.y) > 1e-4)
          ) {
            entry.glider.setPosition(JXG.COORDS_BY_USER, [marked.point.x, marked.point.y]);
          }
        } catch {
          // ignore
        }
        continue;
      }
      const expression = this.entries.get(marked.ownerId);
      if (!expression?.curve) {
        const existing = this.markedPointEntries.get(marked.id);
        if (existing) this.destroyMarkedPointEntry(existing);
        continue;
      }
      if (marked.source === 'tangent') {
        const tangent = marked.tangentId
          ? expression.tangents.get(marked.tangentId)
          : undefined;
        if (!tangent) {
          const existing = this.markedPointEntries.get(marked.id);
          if (existing) this.destroyMarkedPointEntry(existing);
          continue;
        }
        const entry = this.ensureTangentMarkedPointEntry(
          marked,
          tangent,
          expression.curve,
        );
        if (!entry) continue;
        entry.marked = marked;
        const visible = marked.visible && expression.item.visible;
        try {
          const labelX = tangent.glider.X() + 0.18;
          const labelY = tangent.glider.Y() + 0.18;
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const moved =
            Math.abs(labelX - entry.lastX) > 1e-4 ||
            Math.abs(labelY - entry.lastY) > 1e-4;
          if (
            entry.lastVisible !== visible ||
            entry.lastName !== marked.name ||
            (moved && now - entry.lastLabelReport >= 250)
          ) {
            entry.label?.setAttribute({ visible });
            entry.label?.setText?.(marked.name);
            entry.label?.setPosition(JXG.COORDS_BY_USER, [labelX, labelY]);
            entry.lastVisible = visible;
            entry.lastName = marked.name;
            entry.lastX = labelX;
            entry.lastY = labelY;
            entry.lastLabelReport = now;
          }
        } catch {
          // ignore
        }
        continue;
      }
      const entry = this.ensureMarkedPointEntry(marked, expression.curve);
      if (!entry) continue;
      entry.marked = marked;
      const visible = marked.visible && expression.item.visible;
      let pointToUse = marked.point;
      if (marked.source === 'manual' && marked.coordinateLock) {
        const lock = marked.coordinateLock;
        const expressionKey =
          expression.item.kind === 'parametric'
            ? `${expression.item.xExpr}|${expression.item.yExpr}|${expression.item.tMin}|${expression.item.tMax}`
            : expression.item.expr;
        const signature = `${marked.ownerId}|${expression.item.kind}|${expressionKey}|${JSON.stringify(
          this.numericParams,
        )}|${lock.axis}:${lock.value}`;
        if (entry.lockSignature !== signature) {
          entry.lockPoint = this.solveCoordinateLock(expression, marked.point, lock);
          entry.lockSignature = signature;
        }
        pointToUse = entry.lockPoint ?? marked.point;
      } else {
        entry.lockSignature = undefined;
        entry.lockPoint = undefined;
      }
      try {
        if (entry.lastVisible !== visible || entry.lastName !== marked.name) {
          entry.glider.setAttribute({
            visible,
            fillColor: '#0f766e',
            name: marked.name,
          });
          entry.glider.label?.setText?.(marked.name);
          entry.lastVisible = visible;
          entry.lastName = marked.name;
        }
        if (
          !this.draggingPointIds.has(marked.id) &&
          (Math.abs(entry.glider.X() - pointToUse.x) > 1e-4 ||
            Math.abs(entry.glider.Y() - pointToUse.y) > 1e-4)
        ) {
          entry.glider.setPosition(JXG.COORDS_BY_USER, [pointToUse.x, pointToUse.y]);
        }
        if (
          pointToUse !== marked.point &&
          (Math.abs(pointToUse.x - marked.point.x) > 1e-4 ||
            Math.abs(pointToUse.y - marked.point.y) > 1e-4)
        ) {
          this.callbacks.onMarkedPointChange(marked.id, pointToUse);
        }
      } catch {
        // transient glider state
      }
    }
    for (const [id, entry] of this.markedPointEntries) {
      if (!seen.has(id)) this.destroyMarkedPointEntry(entry);
    }
  }

  private destroyDivisionEntry(entry: DivisionEntry): void {
    for (const point of entry.points) {
      try {
        this.board.removeObject(point);
      } catch {
        // ignore
      }
    }
    for (const label of entry.labels) {
      try {
        this.board.removeObject(label);
      } catch {
        // ignore
      }
    }
    for (const trace of entry.traces) {
      if (trace) this.clearIntersectionTrace(trace);
    }
    if (entry.segment) {
      try {
        this.board.removeObject(entry.segment);
      } catch {
        // ignore
      }
    }
    this.divisionEntries.delete(entry.mark.id);
  }

  private ensureDivisionEntry(
    mark: DivisionMark,
    a: MarkedPointEntry,
    b: MarkedPointEntry,
  ): DivisionEntry {
    let entry = this.divisionEntries.get(mark.id);
    if (
      entry &&
      entry.lastDivisions === mark.divisions &&
      entry.segment &&
      (entry.segment as any).point1 === a.glider &&
      (entry.segment as any).point2 === b.glider
    ) {
      return entry;
    }
    if (entry) this.destroyDivisionEntry(entry);
    entry = {
      mark,
      segment: null,
      points: [],
      labels: [],
      traces: [],
      lastTraceClearToken: mark.traceClearToken,
      lastShowTrace: mark.showTrace,
      lastDivisions: mark.divisions,
    };
    try {
      entry.segment = this.board.create('segment', [a.glider, b.glider], {
        strokeColor: mark.color,
        strokeWidth: 1.4,
        dash: 2,
        highlight: false,
        fixed: true,
        withLabel: false,
        layer: 7,
      });
      const count = Math.max(1, mark.divisions - 1);
      for (let index = 0; index < count; index += 1) {
        const point = this.board.create('point', [0, 0], {
          name: '',
          withLabel: false,
          fixed: true,
          size: 3.2,
          fillColor: mark.color,
          strokeColor: '#ffffff',
          strokeWidth: 1.4,
          highlight: false,
          showInfobox: false,
          layer: 10,
        });
        entry.points.push(point);
        entry.traces.push({ curve: null, points: [], last: null });
      }
    } catch (error) {
      console.error(error);
    }
    this.divisionEntries.set(mark.id, entry);
    return entry;
  }

  public setAutoMove(enabled: boolean): void {
    if (this.disposed) return;
    if (enabled && this.autoMoveTimer === null) {
      this.autoMoveTimer = window.setInterval(() => this.advanceMarkedPoints(), 33);
    } else if (!enabled && this.autoMoveTimer !== null) {
      window.clearInterval(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
  }

  private nearestParametricT(
    item: Extract<Item2D, { kind: 'parametric' }>,
    analysis: ParametricAnalysis,
    point: Point2,
  ): number {
    if (!analysis.x.ok || !analysis.y.ok) return item.tMin;
    const xAnalysis = analysis.x;
    const yAnalysis = analysis.y;
    const samples = 500;
    let bestT = item.tMin;
    let bestDistance = Infinity;
    for (let index = 0; index <= samples; index += 1) {
      const t = item.tMin + ((item.tMax - item.tMin) * index) / samples;
      const scope = this.scope({ t });
      const x = xAnalysis.evaluate(scope);
      const y = yAnalysis.evaluate(scope);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = t;
      }
    }
    return bestT;
  }

  private insideView(point: Point2, margin = 0): boolean {
    const bb = this.getBoundingBox();
    return (
      point.x > Math.min(bb[0], bb[2]) + margin &&
      point.x < Math.max(bb[0], bb[2]) - margin &&
      point.y > Math.min(bb[1], bb[3]) + margin &&
      point.y < Math.max(bb[1], bb[3]) - margin
    );
  }

  private projectImplicit(
    evaluate: (x: number, y: number) => number,
    point: Point2,
  ): Point2 | null {
    let x = point.x;
    let y = point.y;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const value = evaluate(x, y);
      if (!Number.isFinite(value)) return null;
      const h = 1e-4 * Math.max(1, Math.abs(x), Math.abs(y));
      const fx = (evaluate(x + h, y) - evaluate(x - h, y)) / (2 * h);
      const fy = (evaluate(x, y + h) - evaluate(x, y - h)) / (2 * h);
      const norm = fx * fx + fy * fy;
      if (!Number.isFinite(norm) || norm < 1e-12) return null;
      x -= (value / norm) * fx;
      y -= (value / norm) * fy;
      if (Math.abs(value) < 1e-10) break;
    }
    return { x, y };
  }

  private advanceCurvePoint(
    entry: MarkedPointEntry,
    point: Point2,
    step: number,
  ): { point: Point2; direction: 1 | -1 } | null {
    const expression = this.entries.get(entry.marked.ownerId);
    if (!expression) return null;
    const item = expression.item;
    const tryDirection = (direction: 1 | -1): { point: Point2; direction: 1 | -1 } | null => {
      if (item.kind === 'explicit') {
        const analysis = expression.analysis as ExplicitAnalysis;
        if (!analysis.expr.ok) return null;
        const nextX = point.x + direction * step;
        const bb = this.getBoundingBox();
        const xMin = Math.min(bb[0], bb[2]) + 0.02;
        const xMax = Math.max(bb[0], bb[2]) - 0.02;
        const x = nextX;
        if (x < xMin || x > xMax) return null;
        const y = analysis.expr.evaluate(this.scope({ x }));
        if (!Number.isFinite(y) || !this.insideView({ x, y })) return null;
        return { point: { x, y }, direction };
      }
      if (item.kind === 'parametric') {
        const analysis = expression.analysis as ParametricAnalysis;
        if (!analysis.x.ok || !analysis.y.ok) return null;
        const range = item.tMax - item.tMin;
        if (range <= 0) return null;
        if (entry.parameter === undefined) {
          entry.parameter = this.nearestParametricT(item, analysis, point);
        }
        const t = entry.parameter + direction * (range / 240);
        if (t < item.tMin || t > item.tMax) return null;
        const next = {
          x: analysis.x.evaluate(this.scope({ t })),
          y: analysis.y.evaluate(this.scope({ t })),
        };
        if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return null;
        if (!this.insideView(next)) return null;
        entry.parameter = t;
        return { point: next, direction };
      }
      const analysis = expression.analysis as ImplicitAnalysis;
      if (!analysis.expr.ok) return null;
      const evaluate = (x: number, y: number) =>
        analysis.expr.ok ? analysis.expr.evaluate(this.scope({ x, y })) : NaN;
      const h = 1e-4 * Math.max(1, Math.abs(point.x), Math.abs(point.y));
      const fx = (evaluate(point.x + h, point.y) - evaluate(point.x - h, point.y)) / (2 * h);
      const fy = (evaluate(point.x, point.y + h) - evaluate(point.x, point.y - h)) / (2 * h);
      const length = Math.hypot(fx, fy);
      if (!Number.isFinite(length) || length < 1e-10) return null;
      const candidate = this.projectImplicit(evaluate, {
        x: point.x + direction * (-fy / length) * step,
        y: point.y + direction * (fx / length) * step,
      });
      if (!candidate || !this.insideView(candidate)) return null;
      return { point: candidate, direction };
    };
    const forward = tryDirection(entry.direction);
    if (forward) return forward;
    const direction: 1 | -1 = entry.direction === 1 ? -1 : 1;
    entry.direction = direction;
    return tryDirection(direction);
  }

  private advanceMarkedPoints(): void {
    if (this.disposed || this.markedPointEntries.size === 0) return;
    const targetRefs = new Set(
      this.state.tangentAngleConstraints.map(
        (constraint) =>
          `${constraint.target.ownerId}:${constraint.target.tangentId}`,
      ),
    );
    const step = 0.055;
    for (const entry of this.markedPointEntries.values()) {
      const marked = entry.marked;
      if (
        !marked.visible ||
        marked.source === 'free' ||
        marked.source === 'intersection' ||
        marked.coordinateLock ||
        !marked.autoMove ||
        this.draggingPointIds.has(marked.id)
      ) {
        continue;
      }
      const owner = this.entries.get(marked.ownerId);
      if (!owner?.item.visible) continue;
      if (
        marked.source === 'tangent' &&
        marked.tangentOwnerId &&
        marked.tangentId &&
        (targetRefs.has(`${marked.tangentOwnerId}:${marked.tangentId}`) ||
          this.draggingTangentRefs.has(`${marked.tangentOwnerId}:${marked.tangentId}`))
      ) {
        continue;
      }
      try {
        const point = { x: entry.glider.X(), y: entry.glider.Y() };
        const advanced = this.advanceCurvePoint(entry, point, step);
        if (!advanced) continue;
        if (marked.source === 'tangent' && marked.tangentOwnerId && marked.tangentId) {
          const expression = this.entries.get(marked.ownerId);
          const tangent = expression?.tangents.get(marked.tangentId);
          if (!tangent) continue;
          tangent.glider.setPosition(JXG.COORDS_BY_USER, [advanced.point.x, advanced.point.y]);
          if (expression) this.updateImplicitTangentLine(expression, tangent);
          this.callbacks.onTangentPointChange(marked.tangentOwnerId, marked.tangentId, advanced.point);
          this.callbacks.onTangentMeta(
            marked.tangentOwnerId,
            marked.tangentId,
            this.tangentMeta(tangent.glider, tangent.line),
          );
        } else {
          entry.glider.setPosition(JXG.COORDS_BY_USER, [advanced.point.x, advanced.point.y]);
          this.callbacks.onMarkedPointChange(marked.id, advanced.point);
        }
      } catch {
        // skip transient point errors
      }
    }
    this.requestTraceRedraw();
  }

  private syncMarkerLines(snapshot: BoardSnapshot): void {
    if (snapshot.markerLines.length === 0 && this.markerLineEntries.size === 0) return;
    const seen = new Set<string>();
    for (const mark of snapshot.markerLines) {
      seen.add(mark.id);
      const a = this.markedPointEntries.get(mark.aId);
      const b = this.markedPointEntries.get(mark.bId);
      const aPoint = snapshot.markedPoints.find((point) => point.id === mark.aId);
      const bPoint = snapshot.markedPoints.find((point) => point.id === mark.bId);
      if ((!a && !aPoint) || (!b && !bPoint)) {
        const existing = this.markerLineEntries.get(mark.id);
        if (existing) this.destroyMarkerLineEntry(existing);
        continue;
      }
      let entry = this.markerLineEntries.get(mark.id);
      if (!entry) {
        const pointA = this.board.create('point', [0, 0], {
          visible: false,
          fixed: true,
          withLabel: false,
          showInfobox: false,
          layer: 8,
        });
        const pointB = this.board.create('point', [0, 0], {
          visible: false,
          fixed: true,
          withLabel: false,
          showInfobox: false,
          layer: 8,
        });
        const line = this.board.create('line', [pointA, pointB], {
          strokeColor: mark.color,
          strokeWidth: 2,
          highlight: false,
          fixed: true,
          withLabel: false,
          layer: 8,
        });
        entry = { id: mark.id, line, pointA, pointB };
        this.markerLineEntries.set(mark.id, entry);
      }
      const pa = a
        ? { x: a.glider.X(), y: a.glider.Y() }
        : { x: aPoint?.point.x ?? 0, y: aPoint?.point.y ?? 0 };
      const pb = b
        ? { x: b.glider.X(), y: b.glider.Y() }
        : { x: bPoint?.point.x ?? 0, y: bPoint?.point.y ?? 0 };
      try {
        entry.pointA.setPosition(JXG.COORDS_BY_USER, [pa.x, pa.y]);
        entry.pointB.setPosition(JXG.COORDS_BY_USER, [pb.x, pb.y]);
        entry.line.setAttribute({
          visible: mark.visible && (aPoint?.visible ?? true) && (bPoint?.visible ?? true),
          strokeColor: mark.color,
        });
      } catch {
        // ignore
      }
    }
    for (const [id, entry] of this.markerLineEntries) {
      if (!seen.has(id)) this.destroyMarkerLineEntry(entry);
    }
  }

  private destroyMarkerLineEntry(entry: MarkerLineEntry): void {
    try {
      this.board.removeObject(entry.line);
      this.board.removeObject(entry.pointA);
      this.board.removeObject(entry.pointB);
    } catch {
      // ignore
    }
    this.markerLineEntries.delete(entry.id);
  }

  private syncDivisionMarks(snapshot: BoardSnapshot): void {
    const seen = new Set<string>();
    for (const mark of snapshot.divisionMarks) {
      seen.add(mark.id);
      const a = this.markedPointEntries.get(mark.aId);
      const b = this.markedPointEntries.get(mark.bId);
      if (!a || !b) {
        const existing = this.divisionEntries.get(mark.id);
        if (existing) this.destroyDivisionEntry(existing);
        continue;
      }
      const entry = this.ensureDivisionEntry(mark, a, b);
      entry.mark = mark;
      const reset =
        entry.lastTraceClearToken !== mark.traceClearToken ||
        entry.lastShowTrace !== mark.showTrace;
      entry.lastTraceClearToken = mark.traceClearToken;
      entry.lastShowTrace = mark.showTrace;
      let ax: number;
      let ay: number;
      let bx: number;
      let by: number;
      try {
        ax = a.glider.X();
        ay = a.glider.Y();
        bx = b.glider.X();
        by = b.glider.Y();
      } catch {
        continue;
      }
      const count = Math.max(1, mark.divisions - 1);
      for (let index = 0; index < count; index += 1) {
        const fraction = (index + 1) / mark.divisions;
        const point = {
          x: ax + (bx - ax) * fraction,
          y: ay + (by - ay) * fraction,
        };
        const element = entry.points[index];
        const trace = entry.traces[index];
        if (!element || !trace) continue;
        const visible = mark.visible;
        try {
          element.setAttribute({
            visible,
            fillColor: mark.color,
          });
          element.setPosition(JXG.COORDS_BY_USER, [point.x, point.y]);
        } catch {
          // ignore
        }
        if (reset || !visible || !mark.showTrace) {
          this.clearIntersectionTrace(trace);
        }
        if (visible && mark.showTrace) {
          if (!trace.last || Math.hypot(trace.last.x - point.x, trace.last.y - point.y) > 1e-4) {
            trace.points.push({ x: point.x, y: point.y });
            if (trace.points.length > 900) trace.points.splice(0, trace.points.length - 900);
            trace.last = { x: point.x, y: point.y };
          }
        }
      }
      try {
        if (entry.segment) entry.segment.setAttribute({ visible: mark.visible, strokeColor: mark.color });
      } catch {
        // ignore
      }
    }
    for (const [id, entry] of this.divisionEntries) {
      if (!seen.has(id)) this.destroyDivisionEntry(entry);
    }
    this.requestTraceRedraw();
  }

  private getEntry(item: Item2D): ExpressionEntry {
    let entry = this.entries.get(item.id);
    if (entry && entry.kind !== item.kind) {
      this.destroyEntry(entry);
      entry = undefined;
    }
    if (!entry) {
      entry = {
        id: item.id,
        item,
        analysis: analyze2DItem(item),
        curve: null,
        derivative: null,
        tangents: new Map(),
        kind: item.kind,
        rangeKey: '',
        curveStyleKey: '',
      };
      this.entries.set(item.id, entry);
    }
    entry.item = item;
    entry.analysis = analyze2DItem(item);
    return entry;
  }

  private syncItem(item: Item2D): void {
    const entry = this.getEntry(item);
    const valid = entry.analysis.errors.length === 0;
    const visible = item.visible && valid;
    if (item.kind === 'explicit') {
      this.syncExplicit(entry, item, visible);
    } else if (item.kind === 'parametric') {
      this.syncParametric(entry, item, visible);
    } else {
      this.syncImplicit(entry, item, visible);
    }
    this.syncTangents(entry, visible);
  }

  private applyCurveStyle(entry: ExpressionEntry, item: Item2D, visible: boolean): void {
    if (!entry.curve) return;
    const key = `${item.color}|${visible}`;
    if (entry.curveStyleKey === key) return;
    entry.curve.setAttribute({
      strokeColor: item.color,
      visible,
      strokeWidth: 2.6,
      fixed: true,
    });
    entry.curveStyleKey = key;
  }

  private evalExplicit(entry: ExpressionEntry, x: number): number {
    const analysis = entry.analysis as ExplicitAnalysis;
    if (!analysis.expr.ok) return NaN;
    return analysis.expr.evaluate(this.scope({ x }));
  }

  private syncExplicit(entry: ExpressionEntry, item: Item2D, visible: boolean): void {
    if (item.kind !== 'explicit') return;
    if (!entry.curve) {
      try {
        entry.curve = this.board.create(
          'functiongraph',
          [(x: number) => this.evalExplicit(entry, x)],
          {
            strokeColor: item.color,
            strokeWidth: 2.6,
            highlight: false,
            withLabel: false,
            fixed: true,
            layer: 6,
          },
        );
        entry.rangeKey = 'function';
        entry.curveStyleKey = '';
      } catch (error) {
        this.callbacks.onBoardError('函数曲线创建失败');
        console.error(error);
      }
    }

    if (entry.curve) {
      this.applyCurveStyle(entry, item, visible);
    }

    const analysis = entry.analysis as ExplicitAnalysis;
    const derivativeAvailable =
      item.showDerivative && visible && !!analysis.derivative && analysis.derivative.ok;

    if (derivativeAvailable) {
      if (!entry.derivative) {
        try {
          entry.derivative = this.board.create(
            'functiongraph',
            [
              (x: number) => {
                const current = entry.analysis as ExplicitAnalysis;
                if (!current.derivative || !current.derivative.ok) return NaN;
                return current.derivative.evaluate(this.scope({ x }));
              },
            ],
            {
              strokeColor: item.color,
              strokeWidth: 1.8,
              dash: 2,
              strokeOpacity: 0.65,
              highlight: false,
              withLabel: false,
              fixed: true,
              layer: 5,
            },
          );
          entry.derivative.setAttribute({ visible: true });
        } catch (error) {
          console.error(error);
        }
      } else {
        entry.derivative.setAttribute({
          visible: true,
          strokeColor: item.color,
          dash: 2,
          strokeOpacity: 0.65,
        });
      }
    } else if (entry.derivative) {
      entry.derivative.setAttribute({ visible: false });
    }
  }

  private evalParametric(entry: ExpressionEntry, t: number): [number, number] {
    const analysis = entry.analysis as ParametricAnalysis;
    if (!analysis.x.ok || !analysis.y.ok) return [NaN, NaN];
    const scope = this.scope({ t });
    return [analysis.x.evaluate(scope), analysis.y.evaluate(scope)];
  }

  private syncParametric(entry: ExpressionEntry, item: Item2D, visible: boolean): void {
    if (item.kind !== 'parametric') return;
    const rangeKey = `${item.tMin}|${item.tMax}`;
    if (entry.curve && entry.rangeKey !== rangeKey) {
      this.removeEntryCurveAndTangents(entry);
    }
    if (!entry.curve) {
      try {
        entry.curve = this.board.create(
          'curve',
          [
            (t: number) => this.evalParametric(entry, t)[0],
            (t: number) => this.evalParametric(entry, t)[1],
            item.tMin,
            item.tMax,
          ],
          {
            strokeColor: item.color,
            strokeWidth: 2.6,
            highlight: false,
            withLabel: false,
            fixed: true,
            layer: 6,
          },
        );
        entry.rangeKey = rangeKey;
        entry.curveStyleKey = '';
      } catch (error) {
        this.callbacks.onBoardError('参数曲线创建失败');
        console.error(error);
      }
    }
    if (entry.curve) {
      this.applyCurveStyle(entry, item, visible);
    }
    if (entry.derivative) {
      this.board.removeObject(entry.derivative);
      entry.derivative = null;
    }
  }

  private evalImplicit(entry: ExpressionEntry, x: number, y: number): number {
    const analysis = entry.analysis as ImplicitAnalysis;
    if (!analysis.expr.ok) return NaN;
    return analysis.expr.evaluate(this.scope({ x, y }));
  }

  private syncImplicit(entry: ExpressionEntry, item: Item2D, visible: boolean): void {
    if (item.kind !== 'implicit') return;
    if (!entry.curve) {
      try {
        entry.curve = this.board.create(
          'implicitcurve',
          [(x: number, y: number) => this.evalImplicit(entry, x, y)],
          {
            strokeColor: item.color,
            strokeWidth: 2.6,
            highlight: false,
            withLabel: false,
            fixed: true,
            layer: 6,
            resolution_outer: 6,
            resolution_inner: 6,
          },
        );
        entry.rangeKey = 'implicit';
        entry.curveStyleKey = '';
      } catch (error) {
        this.callbacks.onBoardError('隐式曲线创建失败');
        console.error(error);
      }
    }
    if (entry.curve) {
      this.applyCurveStyle(entry, item, visible);
    }
    if (entry.derivative) {
      this.board.removeObject(entry.derivative);
      entry.derivative = null;
    }
  }

  private defaultTangentPoint(
    entry: ExpressionEntry,
    tangentIndex: number,
    occupied: Point2[],
  ): Point2 | null {
    const item = entry.item;
    const bb = (() => {
      try {
        return this.board.getBoundingBox() as BoundingBox;
      } catch {
        return INITIAL_BBOX;
      }
    })();

    const farEnough = (point: Point2) =>
      occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) > 0.8);

    if (item.kind === 'explicit') {
      const analysis = entry.analysis as ExplicitAnalysis;
      if (!analysis.expr.ok) return null;
      const fractions = [0.25, 0.75, 0.1, 0.9, 0.4, 0.6, 0.5];
      const ordered = fractions.map((f) => f).slice(tangentIndex % fractions.length).concat(
        fractions.slice(0, tangentIndex % fractions.length),
      );
      for (const fraction of ordered) {
        const x = bb[0] + (bb[2] - bb[0]) * fraction;
        const y = analysis.expr.evaluate(this.scope({ x }));
        if (Number.isFinite(y) && y > bb[3] && y < bb[1]) {
          const point = { x, y };
          if (farEnough(point)) return point;
        }
      }
      for (let i = 0; i <= 24; i += 1) {
        const x = bb[0] + ((bb[2] - bb[0]) * i) / 24;
        const y = analysis.expr.evaluate(this.scope({ x }));
        if (Number.isFinite(y) && y > bb[3] && y < bb[1]) {
          const point = { x, y };
          if (farEnough(point)) return point;
        }
      }
      return null;
    }

    if (item.kind === 'parametric') {
      const analysis = entry.analysis as ParametricAnalysis;
      if (!analysis.x.ok || !analysis.y.ok) return null;
      const fractions = [0.2, 0.8, 0.4, 0.6, 0.35, 0.65, 0.5];
      const ordered = fractions.slice(tangentIndex % fractions.length).concat(
        fractions.slice(0, tangentIndex % fractions.length),
      );
      for (const fraction of ordered) {
        const t = item.tMin + (item.tMax - item.tMin) * fraction;
        const scope = this.scope({ t });
        const x = analysis.x.evaluate(scope);
        const y = analysis.y.evaluate(scope);
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          x > bb[0] &&
          x < bb[2] &&
          y > bb[3] &&
          y < bb[1]
        ) {
          const point = { x, y };
          if (farEnough(point)) return point;
        }
      }
      return null;
    }

    // Implicit curve: sample the current view for points close to F=0.
    const analysis = entry.analysis as ImplicitAnalysis;
    if (!analysis.expr.ok) return null;
    const candidates: Array<{ point: Point2; residual: number }> = [];
    for (let ix = 0; ix <= 48; ix += 1) {
      const x = bb[0] + ((bb[2] - bb[0]) * ix) / 48;
      for (let iy = 0; iy <= 32; iy += 1) {
        const y = bb[3] + ((bb[1] - bb[3]) * iy) / 32;
        const value = analysis.expr.evaluate(this.scope({ x, y }));
        if (!Number.isFinite(value)) continue;
        candidates.push({ point: { x, y }, residual: Math.abs(value) });
      }
    }
    candidates.sort((a, b) => a.residual - b.residual);
    const threshold = Math.max(0.02, candidates[0]?.residual ?? 0) * 20;
    for (const candidate of candidates) {
      if (candidate.residual > threshold) break;
      if (farEnough(candidate.point)) return candidate.point;
    }
    return null;
  }

  private tangentMeta(glider: AnyElement, line: AnyElement): { slope?: number; equation?: string } {
    let slope: number | undefined;
    try {
      const raw = line.getSlope();
      slope = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
    } catch {
      slope = undefined;
    }
    const px = typeof glider.X === 'function' ? glider.X() : NaN;
    const py = typeof glider.Y === 'function' ? glider.Y() : NaN;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return { slope };
    if (slope === undefined) {
      return { slope, equation: `x = ${formatNumber(px)}` };
    }
    if (Math.abs(slope) < 1e-9) {
      return { slope, equation: `y = ${formatNumber(py)}` };
    }
    const intercept = py - slope * px;
    const slopeText =
      Math.abs(slope - 1) < 1e-9 ? '' : Math.abs(slope + 1) < 1e-9 ? '−' : formatNumber(slope);
    let equation = `y = ${slopeText}x`;
    if (Math.abs(intercept) > 1e-9) {
      const sign = intercept > 0 ? '+' : '−';
      equation += ` ${sign} ${formatNumber(Math.abs(intercept))}`;
    }
    return { slope, equation };
  }

  private implicitTangentSlope(entry: ExpressionEntry, x: number, y: number): number | null {
    if (entry.item.kind !== 'implicit') return null;
    const analysis = entry.analysis as ImplicitAnalysis;
    if (!analysis.expr.ok) return null;
    const h = 1e-4 * Math.max(1, Math.abs(x), Math.abs(y));
    const fx = analysis.expr.evaluate(this.scope({ x: x + h, y })) -
      analysis.expr.evaluate(this.scope({ x: x - h, y }));
    const fy = analysis.expr.evaluate(this.scope({ x, y: y + h })) -
      analysis.expr.evaluate(this.scope({ x, y: y - h }));
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
    if (Math.abs(fy) < 1e-9) return Infinity;
    return -fx / fy;
  }

  private updateImplicitTangentLine(entry: ExpressionEntry, elements: TangentElements): void {
    if (entry.item.kind !== 'implicit' || !elements.helper) return;
    try {
      const x = elements.glider.X();
      const y = elements.glider.Y();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const slope = this.implicitTangentSlope(entry, x, y);
      if (slope === null) return;
      const helper = elements.helper;
      if (!Number.isFinite(slope)) {
        helper.setPosition(JXG.COORDS_BY_USER, [x, y + 1]);
      } else {
        helper.setPosition(JXG.COORDS_BY_USER, [x + 1, y + slope]);
      }
    } catch {
      // ignore transient tangent line errors
    }
  }

  private syncTangents(entry: ExpressionEntry, visible: boolean): void {
    if (!entry.curve) {
      for (const [id, elements] of entry.tangents) {
        this.removeTangentElements(elements);
        entry.tangents.delete(id);
      }
      return;
    }
    const desired = new Map(entry.item.tangents.map((tangent) => [tangent.id, tangent]));
    for (const [id, elements] of entry.tangents) {
      if (!desired.has(id)) {
        this.removeTangentElements(elements);
        entry.tangents.delete(id);
      }
    }
    for (const [index, tangent] of entry.item.tangents.entries()) {
      const existing = entry.tangents.get(tangent.id);
      if (existing) {
        if (existing.visible !== visible) {
          existing.glider.setAttribute({ visible });
          existing.line.setAttribute({ visible });
          existing.visible = visible;
        }
        this.updateImplicitTangentLine(entry, existing);
        continue;
      }
      const occupied = [...entry.tangents.values()].map((elements) => ({
        x: elements.glider.X(),
        y: elements.glider.Y(),
      }));
      const point = isFinitePoint(tangent.point)
        ? tangent.point
        : this.defaultTangentPoint(entry, index, occupied);
      if (!point) continue;
      try {
        const glider = this.board.create(
          'glider',
          [point.x, point.y, entry.curve],
          {
            visible,
            withLabel: false,
            size: 3,
            fillColor: '#d97706',
            strokeColor: '#b45309',
            strokeWidth: 1,
            highlight: true,
            highlightFillColor: '#f59e0b',
            highlightStrokeColor: '#92400e',
          },
        );
        const isImplicit = entry.item.kind === 'implicit';
        const helper = isImplicit
          ? this.board.create('point', [point.x + 1, point.y], {
              visible: false,
              fixed: true,
              withLabel: false,
              showInfobox: false,
              layer: 6,
            })
          : null;
        const line = helper
          ? this.board.create('line', [glider, helper], {
              visible,
              strokeColor: '#d97706',
              strokeWidth: 1.7,
              dash: 2,
              strokeOpacity: 0.85,
              fixed: true,
              highlight: false,
              withLabel: false,
              layer: 7,
            })
          : this.board.create('tangent', [glider], {
              visible,
              strokeColor: '#d97706',
              strokeWidth: 1.7,
              dash: 2,
              strokeOpacity: 0.85,
              fixed: true,
              highlight: false,
              withLabel: false,
              layer: 7,
            });
        const elements: TangentElements = {
          glider,
          line,
          pointBeforeDrag: null,
          helper: helper ?? undefined,
          visible,
        };
        entry.tangents.set(tangent.id, elements);
        let lastDragReport = 0;
        this.updateImplicitTangentLine(entry, elements);
        const pushPoint = () => {
          const current = entry.tangents.get(tangent.id);
          if (!current) return;
          const px = current.glider.X();
          const py = current.glider.Y();
          if (!Number.isFinite(px) || !Number.isFinite(py)) return;
          this.callbacks.onTangentMeta(
            entry.id,
            tangent.id,
            this.tangentMeta(current.glider, current.line),
          );
        };
        glider.on('drag', () => {
          const current = entry.tangents.get(tangent.id);
          if (!current) return;
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (now - lastDragReport < 32) return;
          lastDragReport = now;
          this.updateImplicitTangentLine(entry, current);
          const px = current.glider.X();
          const py = current.glider.Y();
          if (Number.isFinite(px) && Number.isFinite(py)) {
            this.callbacks.onTangentPointChange(entry.id, tangent.id, { x: px, y: py });
          }
        });
        glider.on('down', () => {
          this.draggingTangentRefs.add(`${entry.id}:${tangent.id}`);
          this.clearTangentTracesFor(entry.id, tangent.id);
        });
        glider.on('up', () => {
          const current = entry.tangents.get(tangent.id);
          if (current) {
            const px = current.glider.X();
            const py = current.glider.Y();
            if (Number.isFinite(px) && Number.isFinite(py)) {
              this.callbacks.onTangentPointChange(entry.id, tangent.id, { x: px, y: py });
            }
          }
          pushPoint();
          this.draggingTangentRefs.delete(`${entry.id}:${tangent.id}`);
          this.invalidateIntersectionMarkerReports();
          window.setTimeout(() => this.reportConstraintCounterpart(entry.id, tangent.id), 60);
        });
        pushPoint();
        this.callbacks.onTangentPointChange(entry.id, tangent.id, {
          x: glider.X(),
          y: glider.Y(),
        });
      } catch (error) {
        console.error('Tangent creation failed', error);
      }
    }
  }

  private removeTangentElements(elements: TangentElements): void {
    try {
      this.board.removeObject(elements.line);
    } catch {
      // ignore
    }
    if (elements.helper) {
      try {
        this.board.removeObject(elements.helper);
      } catch {
        // ignore
      }
    }
    try {
      this.board.removeObject(elements.glider);
    } catch {
      // ignore
    }
  }

  private removeEntryCurveAndTangents(entry: ExpressionEntry): void {
    for (const elements of entry.tangents.values()) this.removeTangentElements(elements);
    entry.tangents.clear();
    if (entry.curve) {
      try {
        this.board.removeObject(entry.curve);
      } catch {
        // ignore
      }
      entry.curve = null;
    }
    if (entry.derivative) {
      try {
        this.board.removeObject(entry.derivative);
      } catch {
        // ignore
      }
      entry.derivative = null;
    }
  }

  private destroyEntry(entry: ExpressionEntry): void {
    this.removeEntryCurveAndTangents(entry);
  }

  // ---------------------------------------------------------------------------
  // 2D constructions (line, circle, ellipse, parabola, hyperbola)
  // ---------------------------------------------------------------------------

  private geometryStructuralKey(shape: Geometry): string {
    switch (shape.kind) {
      case 'line':
        return `line:${shape.divisionN}:${shape.driverCurveId ?? 'free'}:${shape.movingEndpoint}`;
      case 'parabola':
        return `parabola:${shape.orientation}`;
      case 'hyperbola':
        return `hyperbola:${shape.orientation}`;
      default:
        return shape.kind;
    }
  }

  private makeAnchor(
    entry: GeometryEntry,
    key: string,
    point: Point2,
    label?: string,
  ): AnyElement {
    const shape = entry.shape;
    const anchor = this.board.create('point', [point.x, point.y], {
      name: label ?? '',
      withLabel: !!label,
      label: { fontSize: 11, strokeColor: '#64748b' },
      size: 3,
      fillColor: '#ffffff',
      strokeColor: shape.color,
      strokeWidth: 1.8,
      highlightFillColor: '#eef2ff',
      highlightStrokeColor: shape.color,
      highlightStrokeWidth: 2.5,
      snapToGrid: this.state.snapToGrid,
      showInfobox: false,
      fixed: false,
      layer: 9,
    });
    let lastReport = 0;
    const report = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastReport < 32) return;
      lastReport = now;
      try {
        this.callbacks.onGeometryAnchorChange(entry.id, key, {
          x: anchor.X(),
          y: anchor.Y(),
        });
      } catch {
        // ignore transient coordinate errors
      }
    };
    anchor.on('drag', report);
    anchor.on('up', () => {
      try {
        this.callbacks.onGeometryAnchorChange(entry.id, key, {
          x: anchor.X(),
          y: anchor.Y(),
        });
      } catch {
        // ignore transient coordinate errors
      }
    });
    return anchor;
  }

  private makeDriverGlider(entry: GeometryEntry, target: AnyElement, seed: Point2, label: string): AnyElement {
    const glider = this.board.create('glider', [seed.x, seed.y, target], {
      name: label,
      withLabel: true,
      label: { fontSize: 11, strokeColor: '#64748b' },
      size: 3.5,
      fillColor: '#ffffff',
      strokeColor: entry.shape.color,
      strokeWidth: 2,
      highlightFillColor: '#eef2ff',
      highlightStrokeColor: entry.shape.color,
      showInfobox: false,
      layer: 9,
    });
    let lastReport = 0;
    const report = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastReport < 32) return;
      lastReport = now;
      try {
        this.callbacks.onDriverPointChange(entry.id, { x: glider.X(), y: glider.Y() });
      } catch {
        // ignore
      }
    };
    glider.on('drag', report);
    glider.on('up', () => {
      try {
        this.callbacks.onDriverPointChange(entry.id, { x: glider.X(), y: glider.Y() });
      } catch {
        // ignore
      }
    });
    return glider;
  }

  private makeMainElement(entry: GeometryEntry, shape: Geometry): void {
    const stroke = {
      strokeColor: shape.color,
      strokeWidth: 2.6,
      highlight: false,
      withLabel: false,
      fixed: true,
      layer: 6,
    };

    if (shape.kind === 'circle') {
      const center = entry.anchorPoints.center;
      const through = entry.anchorPoints.through;
      entry.main = [
        this.board.create('circle', [center, through], {
          ...stroke,
          fillOpacity: 0,
          highlightFillColor: 'none',
        }),
      ];
      return;
    }

    if (shape.kind === 'ellipse') {
      const center = entry.anchorPoints.center;
      const corner = entry.anchorPoints.corner;
      const cx = () => center.X();
      const cy = () => center.Y();
      const a = () => Math.max(1e-6, Math.abs(corner.X() - cx()));
      const b = () => Math.max(1e-6, Math.abs(corner.Y() - cy()));
      entry.main = [
        this.board.create(
          'curve',
          [
            (t: number) => cx() + a() * Math.cos(t),
            (t: number) => cy() + b() * Math.sin(t),
            0,
            Math.PI * 2,
          ],
          stroke,
        ),
      ];
      return;
    }

    if (shape.kind === 'parabola') {
      const vertex = entry.anchorPoints.vertex;
      const point = entry.anchorPoints.point;
      const vertical = shape.orientation === 'vertical';
      const h = () => vertex.X();
      const k = () => vertex.Y();
      const coefficient = () => {
        if (vertical) {
          const dx = point.X() - h();
          return Math.abs(dx) < 1e-9 ? 0 : (point.Y() - k()) / (dx * dx);
        }
        const dy = point.Y() - k();
        return Math.abs(dy) < 1e-9 ? 0 : (point.X() - h()) / (dy * dy);
      };
      const X = vertical
        ? (t: number) => h() + t
        : (t: number) => h() + coefficient() * t * t;
      const Y = vertical
        ? (t: number) => k() + coefficient() * t * t
        : (t: number) => k() + t;
      entry.main = [this.board.create('curve', [X, Y, -30, 30], stroke)];
      return;
    }

    if (shape.kind === 'hyperbola') {
      const center = entry.anchorPoints.center;
      const corner = entry.anchorPoints.corner;
      const h = () => center.X();
      const k = () => center.Y();
      const dx = () => Math.max(1e-4, Math.abs(corner.X() - h()));
      const dy = () => Math.max(1e-4, Math.abs(corner.Y() - k()));
      const a = () => (shape.orientation === 'horizontal' ? dx() : dy());
      const b = () => (shape.orientation === 'horizontal' ? dy() : dx());
      const tMin = -5.5;
      const tMax = 5.5;
      if (shape.orientation === 'horizontal') {
        entry.main = [
          this.board.create(
            'curve',
            [
              (t: number) => h() + a() * Math.cosh(t),
              (t: number) => k() + b() * Math.sinh(t),
              tMin,
              tMax,
            ],
            stroke,
          ),
          this.board.create(
            'curve',
            [
              (t: number) => h() - a() * Math.cosh(t),
              (t: number) => k() + b() * Math.sinh(t),
              tMin,
              tMax,
            ],
            stroke,
          ),
        ];
      } else {
        entry.main = [
          this.board.create(
            'curve',
            [
              (t: number) => h() + a() * Math.sinh(t),
              (t: number) => k() + b() * Math.cosh(t),
              tMin,
              tMax,
            ],
            stroke,
          ),
          this.board.create(
            'curve',
            [
              (t: number) => h() + a() * Math.sinh(t),
              (t: number) => k() - b() * Math.cosh(t),
              tMin,
              tMax,
            ],
            stroke,
          ),
        ];
      }
      return;
    }

    if (shape.kind === 'line') {
      const movingKey = shape.movingEndpoint === 'A' ? 'a' : 'b';
      const fixedKey = movingKey === 'a' ? 'b' : 'a';
      const movingSeed = shape[movingKey] ?? shape.driverPoint ?? { x: 0, y: 0 };
      const fixedSeed = shape[fixedKey];
      const target = shape.driverCurveId ? this.driverTargets.get(shape.driverCurveId) ?? null : null;
      let movingPoint: AnyElement;
      if (target) {
        movingPoint = this.makeDriverGlider(
          entry,
          target,
          isFinitePoint(shape.driverPoint) ? shape.driverPoint : movingSeed,
          movingKey.toUpperCase(),
        );
        entry.driverGlider = movingPoint;
        entry.driverTargetElement = target;
      } else {
        movingPoint = this.makeAnchor(entry, movingKey, movingSeed, movingKey.toUpperCase());
        entry.driverGlider = null;
        entry.driverTargetElement = null;
      }
      const fixedPoint = this.makeAnchor(entry, fixedKey, fixedSeed, fixedKey.toUpperCase());
      const aPoint = movingKey === 'a' ? movingPoint : fixedPoint;
      const bPoint = movingKey === 'b' ? movingPoint : fixedPoint;
      entry.anchorPoints.a = aPoint;
      entry.anchorPoints.b = bPoint;
      const line = this.board.create('line', [aPoint, bPoint], {
        straightFirst: shape.extended,
        straightLast: shape.extended,
        strokeColor: shape.color,
        strokeWidth: 2.6,
        highlight: false,
        withLabel: false,
        fixed: true,
        layer: 6,
      });
      entry.main = [line];
      const n = Math.max(2, shape.divisionN);
      for (let index = 1; index < n; index += 1) {
        const ratio = index / n;
        const division = this.board.create(
          'point',
          [
            () => aPoint.X() + (bPoint.X() - aPoint.X()) * ratio,
            () => aPoint.Y() + (bPoint.Y() - aPoint.Y()) * ratio,
          ],
          {
            withLabel: false,
            fixed: true,
            size: 2.4,
            fillColor: shape.color,
            strokeColor: '#ffffff',
            strokeWidth: 1,
            highlight: false,
            showInfobox: false,
            trace: shape.showDivisions && shape.showTrace,
            traceAttributes: {
              strokeColor: shape.color,
              strokeWidth: 1.2,
              strokeOpacity: 0.42,
              dash: 1,
            },
            layer: 8,
          },
        );
        entry.divisions.push(division);
      }
    }
  }

  private geometryLabelPosition(entry: GeometryEntry): Point2 {
    const shape = entry.shape;
    const p = entry.anchorPoints;
    const safe = (key: string): Point2 => {
      const anchor = p[key];
      if (!anchor) return { x: 0, y: 0 };
      return { x: anchor.X(), y: anchor.Y() };
    };
    if (shape.kind === 'line') {
      const a = safe('a');
      const b = safe('b');
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.9 };
    }
    if (shape.kind === 'circle') {
      const center = safe('center');
      const through = safe('through');
      const radius = Math.hypot(through.x - center.x, through.y - center.y);
      return { x: center.x, y: center.y + radius + 1.1 };
    }
    if (shape.kind === 'ellipse') {
      const center = safe('center');
      const corner = safe('corner');
      return { x: center.x, y: center.y + Math.abs(corner.y - center.y) + 1.1 };
    }
    if (shape.kind === 'parabola') {
      const vertex = safe('vertex');
      return { x: vertex.x, y: vertex.y + 1.4 };
    }
    const center = safe('center');
    const corner = safe('corner');
    return { x: center.x, y: center.y + Math.abs(corner.y - center.y) + 1.1 };
  }

  private createGeometryLabel(entry: GeometryEntry): void {
    const position = this.geometryLabelPosition(entry);
    entry.equationLabel = this.board.create(
      'text',
      [position.x, position.y, geometryEquation(entry.shape).plain],
      {
        fontSize: 12,
        strokeColor: '#64748b',
        fixed: true,
        highlight: false,
        withLabel: false,
        showInfobox: false,
        layer: 10,
      },
    );
  }

  private buildGeometry(entry: GeometryEntry, shape: Geometry): void {
    entry.shape = shape;
    if (shape.kind === 'line') {
      // Anchors are created in makeMainElement because a moving endpoint may be
      // a glider on an existing curve.
      this.makeMainElement(entry, shape);
    } else if (shape.kind === 'circle') {
      entry.anchorPoints.center = this.makeAnchor(entry, 'center', shape.center);
      entry.anchorPoints.through = this.makeAnchor(entry, 'through', shape.through);
      this.makeMainElement(entry, shape);
    } else if (shape.kind === 'ellipse') {
      entry.anchorPoints.center = this.makeAnchor(entry, 'center', shape.center);
      entry.anchorPoints.corner = this.makeAnchor(entry, 'corner', shape.corner);
      this.makeMainElement(entry, shape);
    } else if (shape.kind === 'parabola') {
      entry.anchorPoints.vertex = this.makeAnchor(entry, 'vertex', shape.vertex);
      entry.anchorPoints.point = this.makeAnchor(entry, 'point', shape.point);
      this.makeMainElement(entry, shape);
    } else {
      entry.anchorPoints.center = this.makeAnchor(entry, 'center', shape.center);
      entry.anchorPoints.corner = this.makeAnchor(entry, 'corner', shape.corner);
      this.makeMainElement(entry, shape);
    }
    this.createGeometryLabel(entry);
  }

  private syncGeometry(shape: Geometry): void {
    const key = this.geometryStructuralKey(shape);
    let entry = this.geometryEntries.get(shape.id);
    if (entry && entry.structuralKey !== key) {
      this.destroyGeometryEntry(entry);
      entry = undefined;
    }
    if (shape.kind === 'line' && entry) {
      const desiredTarget = shape.driverCurveId
        ? this.driverTargets.get(shape.driverCurveId) ?? null
        : null;
      if (entry.driverTargetElement !== desiredTarget) {
        this.destroyGeometryEntry(entry);
        entry = undefined;
      }
    }
    if (!entry) {
      entry = {
        id: shape.id,
        shape,
        structuralKey: key,
        anchorPoints: {},
        main: [],
        divisions: [],
        tangents: new Map(),
        driverGlider: null,
        driverTargetElement: null,
        equationLabel: null,
        lastTraceClearToken: shape.kind === 'line' ? shape.traceClearToken : 0,
        lastShowDivisions: shape.kind === 'line' ? shape.showDivisions : true,
        lastDriverPlaying: false,
      };
      this.geometryEntries.set(shape.id, entry);
      try {
        this.buildGeometry(entry, shape);
      } catch (error) {
        console.error('Geometry creation failed', error);
        this.callbacks.onBoardError('图形创建失败');
      }
    }
    entry.shape = shape;
    const visible = shape.visible;

    if (shape.kind === 'line' && !entry.driverGlider) {
      const syncAnchor = (key: 'a' | 'b', point: Point2) => {
        const anchor = entry.anchorPoints[key];
        if (!anchor) return;
        try {
          if (
            Math.abs(anchor.X() - point.x) > 1e-9 ||
            Math.abs(anchor.Y() - point.y) > 1e-9
          ) {
            anchor.setPosition(JXG.COORDS_BY_USER, [point.x, point.y]);
          }
        } catch {
          // ignore transient anchor errors
        }
      };
      syncAnchor('a', shape.a);
      syncAnchor('b', shape.b);
    }

    for (const element of entry.main) {
      try {
        element.setAttribute({ visible, strokeColor: shape.color });
      } catch {
        // ignore
      }
    }
    for (const anchor of Object.values(entry.anchorPoints)) {
      try {
        anchor.setAttribute({
          visible,
          strokeColor: shape.color,
          snapToGrid: this.state.snapToGrid,
        });
      } catch {
        // ignore
      }
    }
    if (entry.driverGlider) {
      try {
        entry.driverGlider.setAttribute({
          visible,
          strokeColor: shape.color,
          snapToGrid: this.state.snapToGrid,
        });
      } catch {
        // ignore
      }
    }
    const showDivisions = shape.kind === 'line' ? shape.showDivisions : true;
    for (const division of entry.divisions) {
      try {
        division.setAttribute({
          visible: visible && showDivisions,
          fillColor: shape.color,
          trace: shape.kind === 'line' ? showDivisions && shape.showTrace : false,
        });
      } catch {
        // ignore
      }
    }

    if (entry.main[0] && shape.kind === 'line') {
      try {
        entry.main[0].setAttribute({
          straightFirst: shape.extended,
          straightLast: shape.extended,
        });
      } catch {
        // ignore
      }
    }

    if (entry.equationLabel) {
      const equation = geometryEquation(shape);
      const position = this.geometryLabelPosition(entry);
      try {
        entry.equationLabel.setText(equation.plain);
        entry.equationLabel.setPosition(JXG.COORDS_BY_USER, [position.x, position.y]);
        entry.equationLabel.setAttribute({
          visible: visible && shape.showEquation,
          strokeColor: '#64748b',
        });
      } catch {
        // label updates are cosmetic
      }
    }

    this.syncGeometryTangents(entry, visible);

    if (shape.kind === 'line') {
      if (
        entry.driverGlider &&
        shape.driverPlaying !== entry.lastDriverPlaying
      ) {
        try {
          if (shape.driverPlaying) {
            (entry.driverGlider as any).startAnimation?.(1, 260, 24);
          } else {
            (entry.driverGlider as any).stopAnimation?.();
          }
        } catch {
          // Some curve types do not support animation; dragging still works.
        }
        entry.lastDriverPlaying = shape.driverPlaying;
      }
      if (
        entry.lastTraceClearToken !== shape.traceClearToken ||
        entry.lastShowDivisions !== showDivisions
      ) {
        for (const division of entry.divisions) {
          try {
            division.clearTrace();
          } catch {
            // ignore
          }
        }
        entry.lastTraceClearToken = shape.traceClearToken;
        entry.lastShowDivisions = showDivisions;
      }
    }
  }

  private geometryTangentSeed(
    entry: GeometryEntry,
    index: number,
    tangent: Tangent,
  ): { point: Point2; target: AnyElement } | null {
    if (entry.main.length === 0) return null;
    const shape = entry.shape;
    if (shape.kind === 'line') return null;
    let branchIndex = index % entry.main.length;
    if (shape.kind === 'hyperbola' && isFinitePoint(tangent.point)) {
      const center = { x: entry.anchorPoints.center.X(), y: entry.anchorPoints.center.Y() };
      if (shape.orientation === 'horizontal') {
        branchIndex = tangent.point.x >= center.x ? 0 : 1;
      } else {
        branchIndex = tangent.point.y >= center.y ? 0 : 1;
      }
    }
    const target = entry.main[Math.min(branchIndex, entry.main.length - 1)];
    if (isFinitePoint(tangent.point)) return { point: tangent.point, target };

    if (shape.kind === 'circle') {
      const center = { x: entry.anchorPoints.center.X(), y: entry.anchorPoints.center.Y() };
      const through = { x: entry.anchorPoints.through.X(), y: entry.anchorPoints.through.Y() };
      const radius = Math.hypot(through.x - center.x, through.y - center.y);
      const angle = 0.7 + index * 1.05;
      return {
        point: {
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        },
        target,
      };
    }
    if (shape.kind === 'ellipse') {
      const center = { x: entry.anchorPoints.center.X(), y: entry.anchorPoints.center.Y() };
      const corner = { x: entry.anchorPoints.corner.X(), y: entry.anchorPoints.corner.Y() };
      const a = Math.abs(corner.x - center.x);
      const b = Math.abs(corner.y - center.y);
      const angle = 0.6 + index * 1.05;
      return {
        point: {
          x: center.x + a * Math.cos(angle),
          y: center.y + b * Math.sin(angle),
        },
        target,
      };
    }
    if (shape.kind === 'parabola') {
      const vertex = { x: entry.anchorPoints.vertex.X(), y: entry.anchorPoints.vertex.Y() };
      const point = { x: entry.anchorPoints.point.X(), y: entry.anchorPoints.point.Y() };
      const vertical = shape.orientation === 'vertical';
      const coefficient = vertical
        ? Math.abs(point.x - vertex.x) < 1e-9
          ? 0
          : (point.y - vertex.y) / ((point.x - vertex.x) ** 2)
        : Math.abs(point.y - vertex.y) < 1e-9
          ? 0
          : (point.x - vertex.x) / ((point.y - vertex.y) ** 2);
      const t = (index % 2 === 0 ? -1 : 1) * (2 + index * 0.9);
      return {
        point: vertical
          ? { x: vertex.x + t, y: vertex.y + coefficient * t * t }
          : { x: vertex.x + coefficient * t * t, y: vertex.y + t },
        target,
      };
    }
    if (shape.kind === 'hyperbola') {
      const center = { x: entry.anchorPoints.center.X(), y: entry.anchorPoints.center.Y() };
      const corner = { x: entry.anchorPoints.corner.X(), y: entry.anchorPoints.corner.Y() };
      const dx = Math.abs(corner.x - center.x);
      const dy = Math.abs(corner.y - center.y);
      const a = shape.orientation === 'horizontal' ? dx : dy;
      const b = shape.orientation === 'horizontal' ? dy : dx;
      const t = 0.75 + Math.floor(index / Math.max(1, entry.main.length)) * 0.7;
      const sign = branchIndex === 0 ? 1 : -1;
      return {
        point:
          shape.orientation === 'horizontal'
            ? {
                x: center.x + sign * a * Math.cosh(t),
                y: center.y + b * Math.sinh(t),
              }
            : {
                x: center.x + a * Math.sinh(t),
                y: center.y + sign * b * Math.cosh(t),
              },
        target,
      };
    }
    return null;
  }

  private syncGeometryTangents(entry: GeometryEntry, visible: boolean): void {
    const shape = entry.shape;
    if (shape.kind === 'line' || entry.main.length === 0) {
      for (const elements of entry.tangents.values()) this.removeTangentElements(elements);
      entry.tangents.clear();
      return;
    }
    const desired = new Map(shape.tangents.map((tangent) => [tangent.id, tangent]));
    for (const [id, elements] of entry.tangents) {
      if (!desired.has(id)) {
        this.removeTangentElements(elements);
        entry.tangents.delete(id);
      }
    }
    for (const [index, tangent] of shape.tangents.entries()) {
      const existing = entry.tangents.get(tangent.id);
      if (existing) {
        existing.glider.setAttribute({ visible });
        existing.line.setAttribute({ visible });
        continue;
      }
      const seed = this.geometryTangentSeed(entry, index, tangent);
      if (!seed) continue;
      try {
        const glider = this.board.create('glider', [seed.point.x, seed.point.y, seed.target], {
          visible,
          withLabel: false,
          size: 3,
          fillColor: '#d97706',
          strokeColor: '#b45309',
          strokeWidth: 1,
          highlightFillColor: '#f59e0b',
          highlightStrokeColor: '#92400e',
          showInfobox: false,
        });
        const line = this.board.create('tangent', [glider], {
          visible,
          strokeColor: '#d97706',
          strokeWidth: 1.7,
          dash: 2,
          strokeOpacity: 0.85,
          fixed: true,
          highlight: false,
          withLabel: false,
          layer: 7,
        });
        entry.tangents.set(tangent.id, { glider, line, pointBeforeDrag: null, visible });
        const pushMeta = () => {
          try {
            this.callbacks.onTangentMeta(
              entry.id,
              tangent.id,
              this.tangentMeta(glider, line),
            );
          } catch {
            // ignore
          }
        };
        glider.on('drag', () => {
          try {
            this.callbacks.onTangentPointChange(entry.id, tangent.id, {
              x: glider.X(),
              y: glider.Y(),
            });
          } catch {
            // ignore
          }
        });
        glider.on('up', pushMeta);
        pushMeta();
      } catch (error) {
        console.error('Geometry tangent creation failed', error);
      }
    }
  }

  private destroyGeometryEntry(entry: GeometryEntry): void {
    if (entry.driverGlider) {
      try {
        (entry.driverGlider as any).stopAnimation?.();
      } catch {
        // ignore
      }
    }
    for (const elements of entry.tangents.values()) this.removeTangentElements(elements);
    entry.tangents.clear();
    for (const division of entry.divisions) {
      try {
        this.board.removeObject(division);
      } catch {
        // ignore
      }
    }
    entry.divisions = [];
    for (const element of entry.main) {
      try {
        this.board.removeObject(element);
      } catch {
        // ignore
      }
    }
    entry.main = [];
    if (entry.equationLabel) {
      try {
        this.board.removeObject(entry.equationLabel);
      } catch {
        // ignore
      }
      entry.equationLabel = null;
    }
    if (entry.driverGlider) {
      try {
        this.board.removeObject(entry.driverGlider);
      } catch {
        // ignore
      }
      entry.driverGlider = null;
    }
    for (const anchor of Object.values(entry.anchorPoints)) {
      try {
        this.board.removeObject(anchor);
      } catch {
        // ignore
      }
    }
    entry.anchorPoints = {};
    entry.driverTargetElement = null;
  }

  resetView(): void {
    try {
      this.board.setBoundingBox(this.initialView, true);
      this.board.update();
    } catch {
      // ignore
    }
  }

  zoom(factor: number): void {
    try {
      const bb = this.board.getBoundingBox() as BoundingBox;
      const cx = (bb[0] + bb[2]) / 2;
      const cy = (bb[1] + bb[3]) / 2;
      this.zoomAt(factor, cx, cy);
    } catch {
      // ignore
    }
  }

  /** Zoom keeping the given world-space point under the cursor fixed. */
  zoomAt(factor: number, anchorX: number, anchorY: number): void {
    try {
      if (!Number.isFinite(factor) || factor <= 0) return;
      const bb = this.board.getBoundingBox() as BoundingBox;
      const x1 = anchorX + (bb[0] - anchorX) * factor;
      const y1 = anchorY + (bb[1] - anchorY) * factor;
      const x2 = anchorX + (bb[2] - anchorX) * factor;
      const y2 = anchorY + (bb[3] - anchorY) * factor;
      this.board.setBoundingBox([x1, y1, x2, y2], true);
      this.board.update();
    } catch {
      // ignore
    }
  }

  getBoundingBox(): BoundingBox {
    try {
      return this.board.getBoundingBox() as BoundingBox;
    } catch {
      return this.lastBBox;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.autoMoveTimer !== null) {
      window.clearInterval(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    if (this.viewTimer) window.clearTimeout(this.viewTimer);
    if (this.traceFrame !== null) {
      window.cancelAnimationFrame(this.traceFrame);
      this.traceFrame = null;
    }
    this.traceCanvas?.remove();
    this.traceCanvas = null;
    this.traceContext = null;
    this.resizeObserver?.disconnect();
    if (this.boardContainer && this.wheelHandler) {
      this.boardContainer.removeEventListener('wheel', this.wheelHandler);
      this.wheelHandler = null;
    }
    try {
      this.entries.forEach((entry) => this.destroyEntry(entry));
      this.entries.clear();
      this.geometryEntries.forEach((entry) => this.destroyGeometryEntry(entry));
      this.geometryEntries.clear();
      this.intersectionEntries.forEach((entry) => this.destroyIntersectionEntry(entry));
      this.intersectionEntries.clear();
      this.tangentIntersectionEntries.forEach((entry) =>
        this.destroyTangentIntersectionEntry(entry),
      );
      this.tangentIntersectionEntries.clear();
      this.divisionEntries.forEach((entry) => this.destroyDivisionEntry(entry));
      this.divisionEntries.clear();
      this.markerLineEntries.forEach((entry) => this.destroyMarkerLineEntry(entry));
      this.markerLineEntries.clear();
      this.markedPointEntries.forEach((entry) => this.destroyMarkedPointEntry(entry));
      this.markedPointEntries.clear();
      const JXGAny = JXG as any;
      JXGAny.JSXGraph.freeBoard(this.board);
    } catch {
      // ignore teardown errors
    }
  }
}
