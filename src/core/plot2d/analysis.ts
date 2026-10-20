import {
  analyzeDerivative,
  analyzeExpression,
  type DerivativeAnalysis,
  type ExpressionAnalysis,
  type ExpressionSuccess,
} from '../expression/analyze';
import type { Item2D, Item3D } from '../../app/types';

export interface FieldError {
  field: string;
  message: string;
}

export interface ExplicitAnalysis {
  item: Extract<Item2D, { kind: 'explicit' }>;
  expr: ExpressionAnalysis;
  derivative: DerivativeAnalysis | null;
  errors: FieldError[];
  params: string[];
}

export interface ParametricAnalysis {
  item: Extract<Item2D, { kind: 'parametric' }>;
  x: ExpressionAnalysis;
  y: ExpressionAnalysis;
  errors: FieldError[];
  params: string[];
}

export interface ImplicitAnalysis {
  item: Extract<Item2D, { kind: 'implicit' }>;
  expr: ExpressionAnalysis;
  errors: FieldError[];
  params: string[];
}

export type Item2DAnalysis = ExplicitAnalysis | ParametricAnalysis | ImplicitAnalysis;

export function analyze2DItem(item: Item2D): Item2DAnalysis {
  if (item.kind === 'explicit') {
    const expr = analyzeExpression(item.expr, { allowedVars: ['x'], stripPrefix: 'y' });
    const derivative = expr.ok ? analyzeDerivative(expr as ExpressionSuccess, 'x') : null;
    const errors: FieldError[] = [];
    if (!expr.ok) errors.push({ field: 'expr', message: expr.error });
    return {
      item,
      expr,
      derivative,
      errors,
      params: expr.ok ? expr.params : [],
    };
  }

  if (item.kind === 'parametric') {
    const x = analyzeExpression(item.xExpr, {
      allowedVars: ['t'],
      stripPrefix: 'x-t',
    });
    const y = analyzeExpression(item.yExpr, {
      allowedVars: ['t'],
      stripPrefix: 'y-t',
    });
    const errors: FieldError[] = [];
    if (!x.ok) errors.push({ field: 'xExpr', message: x.error });
    if (!y.ok) errors.push({ field: 'yExpr', message: y.error });
    const params = [...new Set([...(x.ok ? x.params : []), ...(y.ok ? y.params : [])])].sort();
    return { item, x, y, errors, params };
  }

  const expr = analyzeExpression(item.expr, {
    allowedVars: ['x', 'y'],
    allowEquation: true,
  });
  const errors: FieldError[] = [];
  if (!expr.ok) errors.push({ field: 'expr', message: expr.error });
  return {
    item,
    expr,
    errors,
    params: expr.ok ? expr.params : [],
  };
}

export function collect2DParams(items: Item2D[]): string[] {
  const params = new Set<string>();
  for (const item of items) {
    if (!item.visible) continue;
    const analysis = analyze2DItem(item);
    for (const param of analysis.params) params.add(param);
  }
  return [...params].sort();
}

export interface FieldAnalysis {
  field: string;
  analysis: ExpressionAnalysis;
}

export interface Item3DAnalysis {
  item: Item3D;
  fields: FieldAnalysis[];
  errors: FieldError[];
  params: string[];
}

export function analyze3DItem(item: Item3D): Item3DAnalysis {
  let fields: FieldAnalysis[] = [];
  if (item.kind === 'surface') {
    fields = [
      {
        field: 'expr',
        analysis: analyzeExpression(item.expr, { allowedVars: ['x', 'y'], stripPrefix: 'z' }),
      },
    ];
  } else if (item.kind === 'paramSurface') {
    fields = [
      {
        field: 'xExpr',
        analysis: analyzeExpression(item.xExpr, {
          allowedVars: ['u', 'v'],
          stripPrefix: 'x-uv',
        }),
      },
      {
        field: 'yExpr',
        analysis: analyzeExpression(item.yExpr, {
          allowedVars: ['u', 'v'],
          stripPrefix: 'y-uv',
        }),
      },
      {
        field: 'zExpr',
        analysis: analyzeExpression(item.zExpr, {
          allowedVars: ['u', 'v'],
          stripPrefix: 'z-uv',
        }),
      },
    ];
  } else {
    fields = [
      {
        field: 'xExpr',
        analysis: analyzeExpression(item.xExpr, {
          allowedVars: ['t'],
          stripPrefix: 'x-3d-t',
        }),
      },
      {
        field: 'yExpr',
        analysis: analyzeExpression(item.yExpr, {
          allowedVars: ['t'],
          stripPrefix: 'y-3d-t',
        }),
      },
      {
        field: 'zExpr',
        analysis: analyzeExpression(item.zExpr, {
          allowedVars: ['t'],
          stripPrefix: 'z-3d-t',
        }),
      },
    ];
  }

  const errors: FieldError[] = [];
  const params = new Set<string>();
  for (const field of fields) {
    if (field.analysis.ok) {
      for (const param of field.analysis.params) params.add(param);
    } else {
      errors.push({ field: field.field, message: field.analysis.error });
    }
  }
  return { item, fields, errors, params: [...params].sort() };
}

export function collect3DParams(items: Item3D[]): string[] {
  const params = new Set<string>();
  for (const item of items) {
    if (!item.visible) continue;
    for (const param of analyze3DItem(item).params) params.add(param);
  }
  return [...params].sort();
}

export function isExpressionSuccess(
  analysis: ExpressionAnalysis,
): analysis is ExpressionSuccess {
  return analysis.ok;
}

export type { DerivativeAnalysis, ExpressionAnalysis, ExpressionSuccess };
