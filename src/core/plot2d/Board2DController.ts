import JXG from 'jsxgraph';
import type {
  Geometry,
  Item2D,
  Point2,
  Tangent,
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

type AnyElement = any;
type BoundingBox = [number, number, number, number];

export interface BoardSnapshot {
  items2d: Item2D[];
  geometry: Geometry[];
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
  onBoardError: (message: string) => void;
}

interface TangentElements {
  glider: AnyElement;
  line: AnyElement;
  pointBeforeDrag: Point2 | null;
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
  private driverTargets = new Map<string, AnyElement>();
  private state: BoardSnapshot = {
    items2d: [],
    geometry: [],
    paramValues: {},
    snapToGrid: true,
  };
  private numericParams: Record<string, number> = {};
  private disposed = false;
  private viewTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
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
        pan: { enabled: true, needTwoFingers: false },
        zoom: { enabled: true, wheel: true },
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

    try {
      const container = document.getElementById(boardId);
      if (container) {
        container.style.touchAction = 'none';
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

    try {
      this.board.update();
    } catch {
      // JSXGraph can complain transiently while elements are being replaced.
    }
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
    this.applyCurveVisibility(entry, visible);
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
      } catch (error) {
        this.callbacks.onBoardError('函数曲线创建失败');
        console.error(error);
      }
    }

    if (entry.curve) {
      entry.curve.setAttribute({
        strokeColor: item.color,
        visible,
        strokeWidth: 2.6,
        fixed: true,
      });
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
      } catch (error) {
        this.callbacks.onBoardError('参数曲线创建失败');
        console.error(error);
      }
    }
    if (entry.curve) {
      entry.curve.setAttribute({
        strokeColor: item.color,
        visible,
        strokeWidth: 2.6,
        fixed: true,
      });
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
      } catch (error) {
        this.callbacks.onBoardError('隐式曲线创建失败');
        console.error(error);
      }
    }
    if (entry.curve) {
      entry.curve.setAttribute({
        strokeColor: item.color,
        visible,
        strokeWidth: 2.6,
        fixed: true,
      });
    }
    if (entry.derivative) {
      this.board.removeObject(entry.derivative);
      entry.derivative = null;
    }
  }

  private applyCurveVisibility(entry: ExpressionEntry, visible: boolean): void {
    if (entry.curve) entry.curve.setAttribute({ visible });
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
        existing.glider.setAttribute({ visible });
        existing.line.setAttribute({ visible });
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
        const elements: TangentElements = { glider, line, pointBeforeDrag: null };
        entry.tangents.set(tangent.id, elements);
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
          const px = current.glider.X();
          const py = current.glider.Y();
          if (Number.isFinite(px) && Number.isFinite(py)) {
            this.callbacks.onTangentPointChange(entry.id, tangent.id, { x: px, y: py });
          }
        });
        glider.on('up', () => {
          pushPoint();
        });
        pushPoint();
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
        entry.tangents.set(tangent.id, { glider, line, pointBeforeDrag: null });
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
      const halfW = ((bb[2] - bb[0]) / 2) * factor;
      const halfH = ((bb[1] - bb[3]) / 2) * factor;
      this.board.setBoundingBox([cx - halfW, cy + halfH, cx + halfW, cy - halfH], true);
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
    if (this.viewTimer) window.clearTimeout(this.viewTimer);
    this.resizeObserver?.disconnect();
    try {
      this.entries.forEach((entry) => this.destroyEntry(entry));
      this.entries.clear();
      this.geometryEntries.forEach((entry) => this.destroyGeometryEntry(entry));
      this.geometryEntries.clear();
      const JXGAny = JXG as any;
      JXGAny.JSXGraph.freeBoard(this.board);
    } catch {
      // ignore teardown errors
    }
  }
}
