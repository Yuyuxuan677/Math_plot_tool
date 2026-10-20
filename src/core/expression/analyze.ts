import {
  derivative as mathDerivative,
  parse as mathParse,
  simplify as mathSimplify,
  type MathNode,
} from 'mathjs';
import { normalizeExpression, type PrefixKind } from './normalize';

export type VariableName = 'x' | 'y' | 't' | 'u' | 'v';

export const RESERVED_VARIABLES: VariableName[] = ['x', 'y', 't', 'u', 'v'];

const ALLOWED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'log10',
  'sqrt',
  'abs',
  'exp',
  'floor',
  'ceil',
  'round',
  'sign',
  'min',
  'max',
  'pow',
]);

const ALLOWED_NODE_TYPES = new Set([
  'ConstantNode',
  'SymbolNode',
  'OperatorNode',
  'ParenthesisNode',
  'FunctionNode',
]);

const CONSTANT_NAMES = new Set(['pi', 'e']);

const MAX_PARAMS = 3;

export interface AnalyzeOptions {
  allowedVars: VariableName[];
  stripPrefix?: PrefixKind;
  allowEquation?: boolean;
  /** Optional human context used in error messages, e.g. "函数". */
  context?: string;
  maxParams?: number;
}

export interface ExpressionSuccess {
  ok: true;
  source: string;
  normalized: string;
  ast: MathNode;
  params: string[];
  evaluate: (scope: Record<string, number>) => number;
  tex: string;
}

export interface ExpressionFailure {
  ok: false;
  source: string;
  normalized: string;
  error: string;
  params: string[];
}

export type ExpressionAnalysis = ExpressionSuccess | ExpressionFailure;

export interface DerivativeSuccess {
  ok: true;
  /** A numeric fallback derivative has no TeX representation. */
  numeric: boolean;
  evaluate: (scope: Record<string, number>) => number;
  tex?: string;
  error?: string;
}

export interface DerivativeFailure {
  ok: false;
  error: string;
}

export type DerivativeAnalysis = DerivativeSuccess | DerivativeFailure;

interface CacheEntry {
  analysis: ExpressionAnalysis;
}

const analysisCache = new Map<string, CacheEntry>();
const derivativeCache = new Map<string, DerivativeAnalysis>();

function cacheKey(source: string, options: AnalyzeOptions): string {
  return `${options.allowedVars.join(',')}|${options.stripPrefix ?? ''}|${options.allowEquation ? 1 : 0}|${options.maxParams ?? MAX_PARAMS}|${source}`;
}

function sanitizeCompiledResult(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function compileNode(ast: MathNode): (scope: Record<string, number>) => number {
  const compiled = ast.compile();
  return (scope: Record<string, number>): number => {
    try {
      return sanitizeCompiledResult(compiled.evaluate(scope));
    } catch {
      return NaN;
    }
  };
}

function getNodeName(node: MathNode): string | null {
  const value = node as unknown as { name?: unknown };
  return typeof value.name === 'string' ? value.name : null;
}

function translateParseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/\s*\(char\s+\d+\)\s*$/i, '').trim();

  const mappings: Array<[RegExp, string]> = [
    [/Unexpected end of expression/i, '表达式不完整，请检查末尾是否缺少内容或括号'],
    [/Parenthesis \) expected/i, '缺少右括号'],
    [/Parenthesis expected/i, '括号不匹配'],
    [/Unexpected part/i, '这里无法解析，请检查运算符、括号或乘号'],
    [/Value expected/i, '这里需要一个数字、变量或括号'],
    [/Undefined symbol/i, '存在未定义的符号'],
    [/Unknown function/i, '存在不支持的函数'],
    [/Unexpected type of argument/i, '函数参数类型不正确'],
    [/Too many arguments/i, '函数参数过多'],
  ];

  for (const [pattern, chinese] of mappings) {
    if (pattern.test(message)) return chinese;
  }
  return `表达式有误：${message}`;
}

function inspectAst(
  ast: MathNode,
  options: AnalyzeOptions,
): { params: string[] } | { error: string } {
  const functionNames = new Set<string>();
  const symbols = new Set<string>();
  let structuralError = '';

  ast.traverse((node: MathNode) => {
    if (structuralError) return;
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      structuralError = '这里使用了不支持的写法，请只使用数字、变量、四则运算和常见函数';
      return;
    }
    if (node.type === 'FunctionNode') {
      const fn = (node as unknown as { fn?: MathNode }).fn;
      const name = fn ? getNodeName(fn) : getNodeName(node);
      if (name) {
        if (!ALLOWED_FUNCTIONS.has(name)) {
          structuralError = `不支持的函数“${name}”，请使用 sin、cos、sqrt、ln 等常见函数`;
          return;
        }
        functionNames.add(name);
      }
    }
  });

  if (structuralError) return { error: structuralError };

  ast.traverse((node: MathNode) => {
    if (node.type !== 'SymbolNode') return;
    const name = getNodeName(node);
    if (!name || functionNames.has(name) || CONSTANT_NAMES.has(name)) return;
    symbols.add(name);
  });

  const allowed = new Set<string>(options.allowedVars);
  const params: string[] = [];

  for (const name of [...symbols].sort()) {
    if (allowed.has(name)) continue;
    if (RESERVED_VARIABLES.includes(name as VariableName)) {
      return {
        error: `这里不能使用变量“${name}”，当前只支持 ${options.allowedVars.join('、')}`,
      };
    }
    if (/^[A-Za-z]$/.test(name)) {
      params.push(name);
      continue;
    }
    return {
      error: `无法识别符号“${name}”。参数请使用单个字母，两个字母相乘请写成 x*y`,
    };
  }

  const maxParams = options.maxParams ?? MAX_PARAMS;
  if (params.length > maxParams) {
    return {
      error: `每个表达式最多支持 ${maxParams} 个参数，当前有 ${params.join('、')}`,
    };
  }

  return { params };
}

export function analyzeExpression(source: string, options: AnalyzeOptions): ExpressionAnalysis {
  const key = cacheKey(source, options);
  const cached = analysisCache.get(key);
  if (cached) return cached.analysis;

  const normalizedResult = normalizeExpression(source, {
    stripPrefix: options.stripPrefix,
    allowEquation: options.allowEquation,
  });

  if (!normalizedResult.ok) {
    const failure: ExpressionFailure = {
      ok: false,
      source,
      normalized: normalizedResult.text,
      error: normalizedResult.error ?? '表达式有误',
      params: [],
    };
    analysisCache.set(key, { analysis: failure });
    return failure;
  }

  let ast: MathNode;
  try {
    ast = mathParse(normalizedResult.text);
  } catch (error) {
    const failure: ExpressionFailure = {
      ok: false,
      source,
      normalized: normalizedResult.text,
      error: translateParseError(error),
      params: [],
    };
    analysisCache.set(key, { analysis: failure });
    return failure;
  }

  const inspected = inspectAst(ast, options);
  if ('error' in inspected) {
    const failure: ExpressionFailure = {
      ok: false,
      source,
      normalized: normalizedResult.text,
      error: inspected.error,
      params: [],
    };
    analysisCache.set(key, { analysis: failure });
    return failure;
  }

  let tex = normalizedResult.text;
  try {
    tex = ast.toTex({ parenthesis: 'keep' });
  } catch {
    // Keep the normalised source as a fallback.
  }

  const success: ExpressionSuccess = {
    ok: true,
    source,
    normalized: normalizedResult.text,
    ast,
    params: inspected.params,
    evaluate: compileNode(ast),
    tex,
  };
  analysisCache.set(key, { analysis: success });
  if (analysisCache.size > 500) {
    const oldest = analysisCache.keys().next().value;
    if (oldest !== undefined) analysisCache.delete(oldest);
  }
  return success;
}

export function analyzeDerivative(
  analysis: ExpressionSuccess,
  variable: VariableName = 'x',
): DerivativeAnalysis {
  const key = `${analysis.normalized}|d/d${variable}`;
  const cached = derivativeCache.get(key);
  if (cached) return cached;

  try {
    const raw = mathDerivative(analysis.ast, variable);
    let simplified = raw;
    try {
      simplified = mathSimplify(raw);
    } catch {
      simplified = raw;
    }
    const evaluate = compileNode(simplified);
    let tex: string | undefined;
    try {
      tex = simplified.toTex({ parenthesis: 'keep' });
    } catch {
      tex = undefined;
    }
    const result: DerivativeSuccess = {
      ok: true,
      numeric: false,
      evaluate,
      tex,
    };
    derivativeCache.set(key, result);
    return result;
  } catch {
    // Numeric central difference fallback keeps the derivative curve usable.
    const h = 1e-6;
    const evaluate = (scope: Record<string, number>): number => {
      const x = scope[variable];
      if (!Number.isFinite(x)) return NaN;
      const step = h * Math.max(1, Math.abs(x));
      const plus = analysis.evaluate({ ...scope, [variable]: x + step });
      const minus = analysis.evaluate({ ...scope, [variable]: x - step });
      return (plus - minus) / (2 * step);
    };
    const result: DerivativeSuccess = {
      ok: true,
      numeric: true,
      evaluate,
      error: '该函数暂不支持符号求导，已使用数值导数',
    };
    derivativeCache.set(key, result);
    return result;
  }
}

export function buildScope(
  variables: Partial<Record<VariableName, number>>,
  paramValues: Record<string, string>,
): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'number') scope[key] = value;
  }
  for (const [key, raw] of Object.entries(paramValues)) {
    const parsed = Number(raw);
    scope[key] = Number.isFinite(parsed) ? parsed : NaN;
  }
  return scope;
}

export function extractParamName(name: string): string | null {
  return /^[A-Za-z]$/.test(name) ? name : null;
}

export function clearExpressionCaches(): void {
  analysisCache.clear();
  derivativeCache.clear();
}

export { MAX_PARAMS };
