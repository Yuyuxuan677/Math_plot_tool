export type Mode = '2d' | '3d';

export interface Point2 {
  x: number;
  y: number;
}

export interface Tangent {
  id: string;
  /** Approximate point on the host curve, used to restore the glider. */
  point: Point2 | null;
  /** Slope / line label computed by the 2D board. */
  meta?: {
    slope?: number;
    equation?: string;
  };
}

export interface ItemBase2D {
  id: string;
  color: string;
  visible: boolean;
  tangents: Tangent[];
}

export interface ExplicitItem extends ItemBase2D {
  kind: 'explicit';
  expr: string;
  showDerivative: boolean;
}

export interface ParametricItem extends ItemBase2D {
  kind: 'parametric';
  xExpr: string;
  yExpr: string;
  tMin: number;
  tMax: number;
}

export interface ImplicitItem extends ItemBase2D {
  kind: 'implicit';
  expr: string;
}

export type Item2D = ExplicitItem | ParametricItem | ImplicitItem;
export type Item2DKind = Item2D['kind'];

export interface ItemBase3D {
  id: string;
  color: string;
  visible: boolean;
}

export interface SurfaceItem extends ItemBase3D {
  kind: 'surface';
  expr: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  resolution: number;
}

export interface ParametricSurfaceItem extends ItemBase3D {
  kind: 'paramSurface';
  xExpr: string;
  yExpr: string;
  zExpr: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  resolution: number;
}

export interface Curve3DItem extends ItemBase3D {
  kind: 'curve3d';
  xExpr: string;
  yExpr: string;
  zExpr: string;
  tMin: number;
  tMax: number;
  resolution: number;
}

export interface Implicit3DItem extends ItemBase3D {
  kind: 'implicit3d';
  expr: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  resolution: number;
}

export type Item3D = SurfaceItem | ParametricSurfaceItem | Curve3DItem | Implicit3DItem;
export type Item3DKind = Item3D['kind'];

export interface TangentRef {
  ownerId: string;
  tangentId: string;
}

export interface TangentIntersectionMark {
  id: string;
  a: TangentRef;
  b: TangentRef;
  color: string;
  visible: boolean;
  showCoordinates: boolean;
  showTrace: boolean;
  traceClearToken: number;
}

export interface TangentAngleConstraint {
  id: string;
  source: TangentRef;
  target: TangentRef;
  angleDeg: number;
}

export interface GeometryBase {
  id: string;
  kind: GeometryKind;
  color: string;
  visible: boolean;
  showEquation: boolean;
  tangents: Tangent[];
}

export type GeometryKind = 'line' | 'circle' | 'ellipse' | 'parabola' | 'hyperbola';
export type Orientation = 'horizontal' | 'vertical';
export type EndpointName = 'A' | 'B';

export interface LineAngleConstraint {
  /** Another hand-drawn line used as the direction reference. */
  sourceId: string;
  /** Relative angle in degrees. 90 means perpendicular. */
  angleDeg: number;
  /** Target-center offset from the source center, kept while the source moves. */
  offset: Point2;
}

export interface LineShape extends GeometryBase {
  kind: 'line';
  a: Point2;
  b: Point2;
  /** Show an infinite line instead of the segment between A and B. */
  extended: boolean;
  divisionN: number;
  /** Paint the n−1 division markers on the canvas. */
  showDivisions: boolean;
  showTrace: boolean;
  driverPlaying: boolean;
  traceClearToken: number;
  movingEndpoint: EndpointName;
  driverCurveId: string | null;
  /** Approximate current glider position, used to restore a moving endpoint. */
  driverPoint: Point2 | null;
  angleConstraint: LineAngleConstraint | null;
}

export interface CircleShape extends GeometryBase {
  kind: 'circle';
  center: Point2;
  through: Point2;
}

export interface EllipseShape extends GeometryBase {
  kind: 'ellipse';
  center: Point2;
  corner: Point2;
}

export interface ParabolaShape extends GeometryBase {
  kind: 'parabola';
  vertex: Point2;
  point: Point2;
  orientation: Orientation;
}

export interface HyperbolaShape extends GeometryBase {
  kind: 'hyperbola';
  center: Point2;
  corner: Point2;
  orientation: Orientation;
}

export type Geometry =
  | LineShape
  | CircleShape
  | EllipseShape
  | ParabolaShape
  | HyperbolaShape;

export type GeometryKindToShape = {
  line: LineShape;
  circle: CircleShape;
  ellipse: EllipseShape;
  parabola: ParabolaShape;
  hyperbola: HyperbolaShape;
};

export type Tool = 'select' | 'markPoint' | GeometryKind;

export interface MarkedPoint {
  id: string;
  /** Expression curve that owns this point. */
  ownerId: string;
  /** Manual point or the point of a tangent, or an off-curve free point. */
  source?: 'manual' | 'tangent' | 'free';
  /** Present when source === 'tangent'. */
  tangentOwnerId?: string;
  tangentId?: string;
  /** Auto-assigned display name such as A, B, C. */
  name: string;
  point: Point2;
  visible: boolean;
  /** Whether this point participates when animation is running. */
  autoMove?: boolean;
  /** Optional coordinate lock for points that live on a curve. */
  coordinateLock?: { axis: 'x' | 'y'; value: number };
}

export interface DivisionMark {
  id: string;
  /** First marked point. */
  aId: string;
  /** Second marked point. */
  bId: string;
  /** Number of equal segments; interior points count is divisions - 1. */
  divisions: number;
  color: string;
  visible: boolean;
  showTrace: boolean;
  traceClearToken: number;
}

export interface IntersectionMark {
  id: string;
  /** First curve/line object. */
  aId: string;
  /** Second curve/line object. */
  bId: string;
  color: string;
  visible: boolean;
  showCoordinates: boolean;
  showTrace: boolean;
  traceClearToken: number;
}

export interface View2D {
  boundingBox: [number, number, number, number] | null;
}

export interface PersistedState {
  version: 1;
  mode: Mode;
  items2d: Item2D[];
  items3d: Item3D[];
  geometry: Geometry[];
  intersections: IntersectionMark[];
  tangentIntersections: TangentIntersectionMark[];
  tangentAngleConstraints: TangentAngleConstraint[];
  markedPoints: MarkedPoint[];
  divisionMarks: DivisionMark[];
  paramValues: Record<string, string>;
  view2dBoundingBox: [number, number, number, number] | null;
  snapToGrid: boolean;
}

export type CurveRef = {
  id: string;
  label: string;
  kind: string;
};
