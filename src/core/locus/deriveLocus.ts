import { parse, simplify, type MathNode } from 'mathjs';
import type { Geometry, Item2D, LineShape, Orientation, Point2 } from '../../app/types';
import { formatNice, niceFraction } from '../../app/utils';
import { analyze2DItem } from '../plot2d/analysis';
import type {
  ExplicitAnalysis,
  ImplicitAnalysis,
  ParametricAnalysis,
} from '../plot2d/analysis';
import {
  geometryEquation,
  type GeometryEquation,
} from '../geometry/equations';

export interface LocusStep {
  title: string;
  tex: string;
}

export interface LocusMetadata {
  kind: 'circle' | 'ellipse' | 'parabola' | 'hyperbola';
  center?: Point2;
  radius?: number;
  a?: number;
  b?: number;
  orientation?: Orientation;
  vertex?: Point2;
}

export interface LocusNumeric {
  kind: 'explicit' | 'implicit' | 'parametric';
  rhs?: (x: number) => number;
  residual?: (x: number, y: number) => number;
  point?: (t: number) => Point2;
}

export interface LocusResult {
  ok: boolean;
  error?: string;
  equationTex: string;
  equationPlain: string;
  steps: LocusStep[];
  kind: 'explicit' | 'implicit' | 'parametric' | 'standard';
  note?: string;
  metadata?: LocusMetadata;
  numeric?: LocusNumeric;
}

export interface LocusInput {
  line: LineShape;
  driver: Item2D | Geometry | null | undefined;
  k: number;
  paramValues?: Record<string, string>;
}

function texNumber(value: number): string {
  if (!Number.isFinite(value)) return '\\text{NaN}';
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  const fraction = niceFraction(value);
  if (fraction && fraction.denominator <= 64) {
    return `\\frac{${fraction.numerator}}{${fraction.denominator}}`;
  }
  return Number(value.toFixed(4)).toString();
}

function plainNumber(value: number): string {
  return formatNice(value, 4);
}

function pointTex(point: Point2): string {
  return `\\left(${texNumber(point.x)},\\ ${texNumber(point.y)}\\right)`;
}

function relationTex(q: Point2, lambda: number): string {
  return `P = Q + \\lambda\\,(M-Q),\\quad Q=${pointTex(q)},\\quad \\lambda=${texNumber(lambda)}`;
}

function substituteVar(source: string, variable: 'x' | 'y', replacement: string): string {
  const pattern = variable === 'x' ? /\bx\b/g : /\by\b/g;
  return source.replace(pattern, `(${replacement})`);
}

function simplifyNode(source: string): { node: MathNode; tex: string; plain: string; error?: string } {
  try {
    const raw = parse(source);
    let node = raw;
    try {
      node = simplify(raw);
    } catch {
      node = raw;
    }
    let tex = source;
    let plain = source;
    try {
      tex = node.toTex({ parenthesis: 'keep' });
    } catch {
      tex = source;
    }
    try {
      plain = node.toString({ parenthesis: 'keep' });
    } catch {
      plain = source;
    }
    return { node, tex, plain };
  } catch (error) {
    return {
      node: parse('0'),
      tex: source,
      plain: source,
      error: error instanceof Error ? error.message : '表达式化简失败',
    };
  }
}

function parameterScope(
  variables: Record<string, number>,
  paramValues: Record<string, string> | undefined,
): Record<string, number> {
  const scope: Record<string, number> = { ...variables };
  for (const [name, raw] of Object.entries(paramValues ?? {})) {
    const value = Number(raw);
    scope[name] = Number.isFinite(value) ? value : NaN;
  }
  return scope;
}

function makeConicBase(): Pick<Geometry, 'id' | 'color' | 'visible' | 'showEquation' | 'tangents'> {
  return {
    id: 'derived',
    color: '#2563eb',
    visible: true,
    showEquation: true,
    tangents: [],
  };
}

function transformPoint(value: Point2, q: Point2, lambda: number): Point2 {
  return {
    x: q.x + lambda * (value.x - q.x),
    y: q.y + lambda * (value.y - q.y),
  };
}

function standardConic(
  driver: Exclude<Geometry, LineShape>,
  q: Point2,
  lambda: number,
): { equation: GeometryEquation; metadata: LocusMetadata } {
  if (driver.kind === 'circle') {
    const center = transformPoint(driver.center, q, lambda);
    const through = transformPoint(driver.through, q, lambda);
    const radius = Math.hypot(through.x - center.x, through.y - center.y);
    const synthetic = {
      ...makeConicBase(),
      ...driver,
      id: 'derived-circle',
      center,
      through,
      tangents: [],
      showEquation: true,
    };
    return {
      equation: geometryEquation(synthetic),
      metadata: { kind: 'circle', center, radius },
    };
  }
  if (driver.kind === 'ellipse') {
    const center = transformPoint(driver.center, q, lambda);
    const corner = transformPoint(driver.corner, q, lambda);
    const synthetic = {
      ...makeConicBase(),
      ...driver,
      id: 'derived-ellipse',
      center,
      corner,
      tangents: [],
      showEquation: true,
    };
    return {
      equation: geometryEquation(synthetic),
      metadata: {
        kind: 'ellipse',
        center,
        a: Math.abs(corner.x - center.x),
        b: Math.abs(corner.y - center.y),
      },
    };
  }
  if (driver.kind === 'parabola') {
    const vertex = transformPoint(driver.vertex, q, lambda);
    const point = transformPoint(driver.point, q, lambda);
    const synthetic = {
      ...makeConicBase(),
      ...driver,
      id: 'derived-parabola',
      vertex,
      point,
      tangents: [],
      showEquation: true,
    };
    return {
      equation: geometryEquation(synthetic),
      metadata: {
        kind: 'parabola',
        vertex,
        orientation: driver.orientation,
      },
    };
  }
  const center = transformPoint(driver.center, q, lambda);
  const corner = transformPoint(driver.corner, q, lambda);
  const synthetic = {
    ...makeConicBase(),
    ...driver,
    id: 'derived-hyperbola',
    center,
    corner,
    tangents: [],
    showEquation: true,
  };
  const dx = Math.abs(corner.x - center.x);
  const dy = Math.abs(corner.y - center.y);
  return {
    equation: geometryEquation(synthetic),
    metadata: {
      kind: 'hyperbola',
      center,
      a: driver.orientation === 'horizontal' ? dx : dy,
      b: driver.orientation === 'horizontal' ? dy : dx,
      orientation: driver.orientation,
    },
  };
}

export function deriveLocus(input: LocusInput): LocusResult {
  const { line, driver, k, paramValues } = input;
  const n = Math.max(2, Math.floor(line.divisionN));
  if (k < 1 || k >= n) {
    return {
      ok: false,
      error: '请选择 1 到 n−1 之间的等分点',
      equationTex: '',
      equationPlain: '',
      steps: [],
      kind: 'implicit',
    };
  }
  if (!driver) {
    return {
      ok: false,
      error: '请先把动点绑定到一条曲线，才能推导轨迹方程',
      equationTex: '',
      equationPlain: '',
      steps: [],
      kind: 'implicit',
    };
  }
  const movingIsB = line.movingEndpoint === 'B';
  const q = movingIsB ? line.a : line.b;
  const ratio = k / n;
  const lambda = movingIsB ? ratio : 1 - ratio;
  if (!Number.isFinite(lambda) || lambda === 0) {
    return {
      ok: false,
      error: '等分点位置无效',
      equationTex: '',
      equationPlain: '',
      steps: [],
      kind: 'implicit',
    };
  }

  const commonSteps: LocusStep[] = [
    {
      title: '等分关系',
      tex: `P = Q + \\lambda(M-Q),\\quad Q=${pointTex(q)},\\quad \\lambda=${texNumber(lambda)}`,
    },
    {
      title: '反解动点',
      tex: `M = Q + \\frac{P-Q}{\\lambda}`,
    },
  ];

  if ('expr' in driver || 'xExpr' in driver) {
    const item = driver as Item2D;
    const analysis = analyze2DItem(item);

    if (item.kind === 'explicit') {
      const explicitAnalysis = analysis as ExplicitAnalysis;
      if (!explicitAnalysis.expr.ok) {
        return {
          ok: false,
          error: explicitAnalysis.expr.error,
          equationTex: '',
          equationPlain: '',
          steps: [],
          kind: 'explicit',
        };
      }
      const uExpr = `(${q.x}) + ((x) - (${q.x})) / (${lambda})`;
      const fAtU = substituteVar(explicitAnalysis.expr.normalized, 'x', uExpr);
      const rhsSource = `(${q.y}) + (${lambda}) * ((${fAtU}) - (${q.y}))`;
      const simplified = simplifyNode(rhsSource);
      if (simplified.error) {
        return {
          ok: false,
          error: '轨迹方程化简失败，请换一种等价写法再试',
          equationTex: '',
          equationPlain: '',
          steps: commonSteps,
          kind: 'explicit',
        };
      }
      let numeric: LocusNumeric | undefined;
      try {
        const compiled = simplified.node.compile();
        numeric = {
          kind: 'explicit',
          rhs: (x: number) => {
            try {
              const value = compiled.evaluate(parameterScope({ x }, paramValues));
              return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
            } catch {
              return NaN;
            }
          },
        };
      } catch {
        numeric = undefined;
      }
      return {
        ok: true,
        equationTex: `y = ${simplified.tex}`,
        equationPlain: `y = ${simplified.plain}`,
        kind: 'explicit',
        steps: [
          commonSteps[0],
          commonSteps[1],
          {
            title: '代入函数',
            tex: `M=(u,f(u)),\\quad u=${texNumber(q.x)}+\\frac{x-${texNumber(q.x)}}{${texNumber(lambda)}},\\quad y=${texNumber(q.y)}+\\lambda(f(u)-${texNumber(q.y)})`,
          },
          {
            title: '化简结果',
            tex: `y = ${simplified.tex}`,
          },
        ],
        numeric,
      };
    }

    if (item.kind === 'implicit') {
      const implicitAnalysis = analysis as ImplicitAnalysis;
      if (!implicitAnalysis.expr.ok) {
        return {
          ok: false,
          error: implicitAnalysis.expr.error,
          equationTex: '',
          equationPlain: '',
          steps: [],
          kind: 'implicit',
        };
      }
      const xDriver = `${q.x} + ((X) - (${q.x})) / (${lambda})`;
      const yDriver = `${q.y} + ((Y) - (${q.y})) / (${lambda})`;
      let substituted = substituteVar(implicitAnalysis.expr.normalized, 'x', xDriver);
      substituted = substituteVar(substituted, 'y', yDriver);
      const simplified = simplifyNode(substituted);
      if (simplified.error) {
        return {
          ok: false,
          error: '轨迹方程化简失败，请换一种等价写法再试',
          equationTex: '',
          equationPlain: '',
          steps: commonSteps,
          kind: 'implicit',
        };
      }
      const tex = simplified.tex.replace(/\bX\b/g, 'x').replace(/\bY\b/g, 'y');
      const plain = simplified.plain.replace(/\bX\b/g, 'x').replace(/\bY\b/g, 'y');
      let numeric: LocusNumeric | undefined;
      try {
        const compiled = simplified.node.compile();
        numeric = {
          kind: 'implicit',
          residual: (x: number, y: number) => {
            try {
              const value = compiled.evaluate(parameterScope({ X: x, Y: y }, paramValues));
              return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
            } catch {
              return NaN;
            }
          },
        };
      } catch {
        numeric = undefined;
      }
      return {
        ok: true,
        equationTex: `${tex} = 0`,
        equationPlain: `${plain} = 0`,
        kind: 'implicit',
        steps: [
          commonSteps[0],
          commonSteps[1],
          {
            title: '代入驱动曲线',
            tex: `F\\left(${texNumber(q.x)}+\\frac{x-${texNumber(q.x)}}{${texNumber(lambda)}},\\ ${texNumber(q.y)}+\\frac{y-${texNumber(q.y)}}{${texNumber(lambda)}}\\right)=0`,
          },
          {
            title: '化简结果',
            tex: `${tex} = 0`,
          },
        ],
        numeric,
      };
    }

    if (item.kind === 'parametric') {
      const parametricAnalysis = analysis as ParametricAnalysis;
      if (!parametricAnalysis.x.ok || !parametricAnalysis.y.ok) {
        return {
          ok: false,
          error: '参数曲线表达式有误',
          equationTex: '',
          equationPlain: '',
          steps: [],
          kind: 'parametric',
        };
      }
      const xRhs = simplifyNode(
        `(${q.x}) + (${lambda}) * ((${parametricAnalysis.x.normalized}) - (${q.x}))`,
      );
      const yRhs = simplifyNode(
        `(${q.y}) + (${lambda}) * ((${parametricAnalysis.y.normalized}) - (${q.y}))`,
      );
      if (xRhs.error || yRhs.error) {
        return {
          ok: false,
          error: '参数形式轨迹方程化简失败',
          equationTex: '',
          equationPlain: '',
          steps: commonSteps,
          kind: 'parametric',
        };
      }
      let numeric: LocusNumeric | undefined;
      try {
        const xCompiled = xRhs.node.compile();
        const yCompiled = yRhs.node.compile();
        numeric = {
          kind: 'parametric',
          point: (t: number) => {
            try {
              const scope = parameterScope({ t }, paramValues);
              const x = xCompiled.evaluate(scope);
              const y = yCompiled.evaluate(scope);
              return {
                x: typeof x === 'number' && Number.isFinite(x) ? x : NaN,
                y: typeof y === 'number' && Number.isFinite(y) ? y : NaN,
              };
            } catch {
              return { x: NaN, y: NaN };
            }
          },
        };
      } catch {
        numeric = undefined;
      }
      return {
        ok: true,
        equationTex: `\\begin{cases} x = ${xRhs.tex} \\\\ y = ${yRhs.tex} \\end{cases}`,
        equationPlain: `x = ${xRhs.plain}; y = ${yRhs.plain}`,
        kind: 'parametric',
        note: '该驱动曲线以参数形式给出，因此轨迹以参数方程表示。',
        steps: [
          commonSteps[0],
          commonSteps[1],
          {
            title: '平移缩放参数曲线',
            tex: `\\begin{cases} x = ${xRhs.tex} \\\\ y = ${yRhs.tex} \\end{cases}`,
          },
        ],
        numeric,
      };
    }
  }

  // Hand-drawn conic drivers
  if ('kind' in driver && driver.kind !== 'line') {
    const geometry = driver as Exclude<Geometry, LineShape>;
    const { equation, metadata } = standardConic(geometry, q, lambda);
    const driverEquation = geometryEquation(geometry);
    return {
      ok: true,
      equationTex: equation.tex,
      equationPlain: equation.plain,
      kind: 'standard',
      steps: [
        commonSteps[0],
        commonSteps[1],
        {
          title: '驱动曲线',
          tex: driverEquation.tex,
        },
        {
          title: '位似变换',
          tex: `\\text{以 }Q\\text{ 为中心、比例 }\\lambda=${texNumber(lambda)}\\text{ 作位似变换，曲线类型不变。}`,
        },
        {
          title: '化简结果',
          tex: equation.tex,
        },
      ],
      metadata,
    };
  }

  return {
    ok: false,
    error: '暂不支持以这一类对象作为驱动曲线',
    equationTex: '',
    equationPlain: '',
    steps: [],
    kind: 'implicit',
  };
}

export function locusKindLabel(kind: LocusResult['kind']): string {
  if (kind === 'explicit') return '显式方程';
  if (kind === 'implicit') return '隐式方程';
  if (kind === 'parametric') return '参数方程';
  return '标准方程';
}

export { texNumber, plainNumber, relationTex };
