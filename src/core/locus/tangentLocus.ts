import type {
  Item2D,
  Point2,
  TangentAngleConstraint,
  TangentIntersectionMark,
} from '../../app/types';
import { analyze2DItem } from '../plot2d/analysis';
import type { ImplicitAnalysis } from '../plot2d/analysis';

export interface LocusStep {
  title: string;
  body: string;
  formula?: string;
}

export interface TangentLocusResult {
  equation: string;
  title: string;
  note: string;
  steps: LocusStep[];
}

function evaluateImplicit(
  item: Item2D,
  params: Record<string, number>,
  x: number,
  y: number,
): number | null {
  if (item.kind !== 'implicit') return null;
  const analysis = analyze2DItem(item) as ImplicitAnalysis;
  if (!analysis.expr.ok) return null;
  const value = analysis.expr.evaluate({ ...params, x, y });
  return Number.isFinite(value) ? value : null;
}

function num(value: number): string {
  if (!Number.isFinite(value)) return '?';
  if (Math.abs(value) < 1e-9) return '0';
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatCircle(center: Point2, radiusSquared: number): string {
  const radius = Math.sqrt(Math.max(0, radiusSquared));
  const cx = num(center.x);
  const cy = num(center.y);
  if (Math.abs(center.x) < 1e-9 && Math.abs(center.y) < 1e-9) {
    return `x^2 + y^2 = ${num(radiusSquared)} \\quad\\left(R = ${num(radius)}\\right)`;
  }
  return `(x - ${cx})^2 + (y - ${cy})^2 = ${num(radiusSquared)} \\quad\\left(R = ${num(radius)}\\right)`;
}

export interface ConicInfo {
  kind: 'circle' | 'ellipse' | 'hyperbola' | 'parabola';
  center: Point2;
  a2?: number;
  b2?: number;
  radius?: number;
  directrix?: { axis: 'x' | 'y'; value: number };
  equation: string;
}

export function recognizeConic(
  item: Item2D,
  params: Record<string, number>,
): ConicInfo | null {
  if (item.kind !== 'implicit') return null;
  const f = (x: number, y: number) => evaluateImplicit(item, params, x, y);
  const h = 1e-3;
  const f0 = f(0, 0);
  const fx = (f(h, 0) ?? NaN) - (f(-h, 0) ?? NaN);
  const fy = (f(0, h) ?? NaN) - (f(0, -h) ?? NaN);
  const fxx = (f(h, 0) ?? NaN) - 2 * (f0 ?? NaN) + (f(-h, 0) ?? NaN);
  const fyy = (f(0, h) ?? NaN) - 2 * (f0 ?? NaN) + (f(0, -h) ?? NaN);
  const fxy =
    (f(h, h) ?? NaN) -
    (f(h, -h) ?? NaN) -
    (f(-h, h) ?? NaN) +
    (f(-h, -h) ?? NaN);
  if (![f0, fx, fy, fxx, fyy, fxy].every(Number.isFinite)) return null;
  const A = fxx / (2 * h * h);
  const C = fyy / (2 * h * h);
  const B = fxy / (4 * h * h);
  const D = fx / (2 * h);
  const E = fy / (2 * h);
  const F0 = f0 as number;
  const scale = Math.max(1, Math.abs(A), Math.abs(C), Math.abs(D), Math.abs(E), Math.abs(F0));
  if (Math.abs(B) > 1e-3 * scale) return null;
  const EPS = 1e-5 * scale;
  const nearlyZero = (value: number) => Math.abs(value) < EPS;

  if (nearlyZero(A) && nearlyZero(C)) return null;

  if (nearlyZero(A) || nearlyZero(C)) {
    let axis: 'x' | 'y';
    let directrixValue: number;
    if (nearlyZero(A)) {
      if (nearlyZero(C) || nearlyZero(D)) return null;
      const k = -E / (2 * C);
      const vertexX = ((E * E) / (4 * C) - F0) / D;
      const p = -D / (4 * C);
      directrixValue = vertexX - p;
      axis = 'x';
      void k;
    } else {
      if (nearlyZero(E)) return null;
      const vertexY = ((D * D) / (4 * A) - F0) / E;
      const p = -E / (4 * A);
      directrixValue = vertexY - p;
      axis = 'y';
    }
    return {
      kind: 'parabola',
      center: { x: 0, y: 0 },
      directrix: { axis, value: directrixValue },
      equation:
        axis === 'x'
          ? `x = ${num(directrixValue)}`
          : `y = ${num(directrixValue)}`,
    };
  }

  const center = {
    x: -D / (2 * A),
    y: -E / (2 * C),
  };
  const centerValue = f(center.x, center.y);
  if (centerValue === null) return null;
  const a2 = -centerValue / A;
  const b2 = -centerValue / C;
  if (a2 > 0 && b2 > 0) {
    const circle = Math.abs(a2 - b2) < 1e-3 * Math.max(a2, b2);
    if (circle) {
      return {
        kind: 'circle',
        center,
        a2,
        b2,
        radius: Math.sqrt((a2 + b2) / 2),
        equation: formatCircle(center, a2),
      };
    }
    return {
      kind: 'ellipse',
      center,
      a2,
      b2,
      equation: `\\frac{(x - ${num(center.x)})^2}{${num(a2)}} + \\frac{(y - ${num(center.y)})^2}{${num(b2)}} = 1`,
    };
  }
  if (a2 > 0 && b2 < 0) {
    return {
      kind: 'hyperbola',
      center,
      a2,
      b2: -b2,
      equation: `\\frac{(x - ${num(center.x)})^2}{${num(a2)}} - \\frac{(y - ${num(center.y)})^2}{${num(-b2)}} = 1`,
    };
  }
  if (a2 < 0 && b2 > 0) {
    return {
      kind: 'hyperbola',
      center,
      a2: b2,
      b2: -a2,
      equation: `\\frac{(y - ${num(center.y)})^2}{${num(b2)}} - \\frac{(x - ${num(center.x)})^2}{${num(-a2)}} = 1`,
    };
  }
  return null;
}

export function deriveTangentLocus(
  mark: TangentIntersectionMark,
  constraint: TangentAngleConstraint,
  items2d: Item2D[],
  params: Record<string, number>,
): TangentLocusResult | string {
  const ownerA = items2d.find((item) => item.id === mark.a.ownerId);
  const ownerB = items2d.find((item) => item.id === mark.b.ownerId);
  if (!ownerA || !ownerB) return '无法找到对应的曲线。';
  if (ownerA.id !== ownerB.id) {
    return '当前解析推导只支持同一圆锥曲线上的两条切线。';
  }
  const conic = recognizeConic(ownerA, params);
  if (!conic) {
    return '当前只支持标准圆锥曲线（圆、椭圆、双曲线、抛物线）的隐式方程。';
  }
  const angle = Math.abs(constraint.angleDeg) % 180;
  if (conic.kind === 'circle') {
    const radius = conic.radius ?? Math.sqrt(conic.a2 ?? 0);
    const cosine = Math.cos((angle * Math.PI) / 360);
    if (cosine <= 1e-6) return '该夹角下两条切线平行，不存在有限交点。';
    const resultRadius = radius / cosine;
    return {
      title: '圆的切线交点轨迹',
      equation: formatCircle(conic.center, resultRadius * resultRadius),
      note: `两条切线夹角为 ${num(angle)}°，交点轨迹是同心圆。`,
      steps: [
        {
          title: '1. 设圆',
          body: `圆方程为 ${conic.equation}。设两条切线的切点分别为 P、Q。`,
          formula: conic.equation,
        },
        {
          title: '2. 切线夹角',
          body: `半径 OP⊥切线 PA，OQ⊥切线 QB。两条切线的夹角等于圆心角 ∠POQ 的补角（或自身），因此交点到圆心的距离只由半径和夹角决定。`,
          formula: 'OA=OB=R,\\quad \\angle APB=\\theta',
        },
        {
          title: '3. 求交点距离',
          body: '在由圆心、切点和交点组成的直角三角形中，',
          formula: 'OP=R,\\quad \\angle OPA=90^\\circ,\\quad \\angle APO=\\frac{\\theta}{2}',
        },
        {
          title: '4. 得轨迹',
          body: '消去切点参数，得到同心圆：',
          formula: `x^2 + y^2 = \\left(\\frac{R}{\\cos(\\theta/2)}\\right)^2 = ${num(resultRadius * resultRadius)}`,
        },
      ],
    };
  }
  if (angle !== 90) {
    return `当前解析推导支持 90° 的椭圆、双曲线和抛物线，以及圆的任意固定夹角；当前为 ${num(angle)}°。`;
  }
  if (conic.kind === 'ellipse') {
    const a2 = conic.a2 ?? 0;
    const b2 = conic.b2 ?? 0;
    const radiusSquared = a2 + b2;
    return {
      title: '椭圆两条垂直切线的交点轨迹',
      equation: formatCircle(conic.center, radiusSquared),
      note: '这就是椭圆的蒙日圆（导演圆）。',
      steps: [
        {
          title: '1. 设椭圆',
          body: '把椭圆化为标准形式（必要时平移坐标）：',
          formula: `\\frac{x^2}{${num(a2)}} + \\frac{y^2}{${num(b2)}} = 1`,
        },
        {
          title: '2. 参数化切点',
          body: '取椭圆上一点 P 的参数表示，并写出 P 处切线：',
          formula: 'P=(a\\cos t,\\,b\\sin t),\\quad \\frac{x\\cos t}{a}+\\frac{y\\sin t}{b}=1',
        },
        {
          title: '3. 取垂直切线',
          body: '另一条切线与它垂直。设交点 M=(x,y)，则 M 到两条切线的距离关系等价于两条切线方向的数量积为 0。',
          formula: 'm_1m_2=-1',
        },
        {
          title: '4. 消去参数',
          body: '将两条切线方程联立并利用三角恒等式消去 t，得到：',
          formula: `(x - ${num(conic.center.x)})^2 + (y - ${num(conic.center.y)})^2 = ${num(radiusSquared)}`,
        },
        {
          title: '5. 结论',
          body: '交点轨迹是以椭圆中心为圆心、半径为 √(a²+b²) 的圆。',
          formula: `R = \\sqrt{${num(a2)} + ${num(b2)}} = ${num(Math.sqrt(radiusSquared))}`,
        },
      ],
    };
  }
  if (conic.kind === 'hyperbola') {
    const a2 = conic.a2 ?? 0;
    const b2 = conic.b2 ?? 0;
    const radiusSquared = a2 - b2;
    if (radiusSquared <= 0) {
      return '该双曲线的两条垂直切线交点轨迹不是实圆（a² ≤ b²）。';
    }
    return {
      title: '双曲线两条垂直切线的交点轨迹',
      equation: formatCircle(conic.center, radiusSquared),
      note: '这是双曲线的导演圆。',
      steps: [
        {
          title: '1. 设双曲线',
          body: '化为标准形式：',
          formula: `\\frac{x^2}{${num(a2)}} - \\frac{y^2}{${num(b2)}} = 1`,
        },
        {
          title: '2. 切线方程',
          body: '双曲线上一点处的切线可写成参数形式；两条切线垂直时，其斜率乘积为 −1。',
          formula: 'm_1m_2=-1',
        },
        {
          title: '3. 消去参数',
          body: '联立两条切线并消去切点参数：',
          formula: `x^2 + y^2 = ${num(radiusSquared)}`,
        },
        {
          title: '4. 结论',
          body: '交点轨迹为以中心为圆心的导演圆，条件是 a² > b²。',
          formula: `R^2 = ${num(a2)} - ${num(b2)} = ${num(radiusSquared)}`,
        },
      ],
    };
  }
  if (conic.kind === 'parabola' && conic.directrix) {
    const directrix = conic.directrix;
    return {
      title: '抛物线两条垂直切线的交点轨迹',
      equation: directrix.axis === 'x' ? `x = ${num(directrix.value)}` : `y = ${num(directrix.value)}`,
      note: '两条互相垂直的切线交点落在抛物线的准线上。',
      steps: [
        {
          title: '1. 设抛物线',
          body: '取标准抛物线 y²=4px（或 x²=4py），令切点参数为 t。',
          formula: 'y^2 = 4px',
        },
        {
          title: '2. 两条切线',
          body: '过参数 t、s 的两条切线方程分别为：',
          formula: 'ty=x+pt^2,\\quad sy=x+ps^2',
        },
        {
          title: '3. 垂直条件与交点',
          body: '两条切线垂直等价于 ts=−1。联立两切线求交点，得到：',
          formula: 'x=p ts=-p',
        },
        {
          title: '4. 结论',
          body: '交点横坐标为 −p，即交点轨迹是抛物线的准线。',
          formula: `x = ${num(directrix.value)}`,
        },
      ],
    };
  }
  return '暂时无法识别该圆锥曲线的标准形式。';
}
