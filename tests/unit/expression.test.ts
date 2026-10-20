import { describe, expect, it } from 'vitest';
import { normalizeExpression } from '../../src/core/expression/normalize';
import {
  analyzeDerivative,
  analyzeExpression,
  buildScope,
  clearExpressionCaches,
  type ExpressionSuccess,
} from '../../src/core/expression/analyze';

function mustOk(source: string, allowedVars: ('x' | 'y' | 't' | 'u' | 'v')[] = ['x']) {
  const result = analyzeExpression(source, { allowedVars });
  expect(result.ok, result.ok ? '' : result.error).toBe(true);
  return result as ExpressionSuccess;
}

describe('normalizeExpression', () => {
  it('normalises superscripts, pi and full-width characters', () => {
    const result = normalizeExpression('x² ＋ π × 2');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('x^2 + pi * 2');
  });

  it('normalises log aliases used in Chinese textbooks', () => {
    expect(normalizeExpression('ln(x) + lg(x)').text).toBe('log(x) + log10(x)');
  });

  it('strips common left-hand sides', () => {
    expect(normalizeExpression('y = x^2', { stripPrefix: 'y' }).text).toBe('x^2');
    expect(normalizeExpression('z = x + y', { stripPrefix: 'z' }).text).toBe('x + y');
    expect(normalizeExpression('x(t) = cos(t)', { stripPrefix: 'x-t' }).text).toBe('cos(t)');
  });

  it('converts an implicit equation to an expression equal to zero', () => {
    const result = normalizeExpression('x^2 + y^2 = 4', { allowEquation: true });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('(x^2 + y^2) - (4)');
  });

  it('rejects a second top-level equals sign', () => {
    const result = normalizeExpression('x = y = 1', { allowEquation: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('一个等号');
  });
});

describe('analyzeExpression', () => {
  it('evaluates an explicit function', () => {
    const result = mustOk('x^2 + 1');
    expect(result.evaluate({ x: 3 })).toBe(10);
  });

  it('supports implicit multiplication and constants', () => {
    const result = mustOk('2x + sin(pi / 2)');
    expect(result.evaluate({ x: 2 })).toBeCloseTo(5, 12);
  });

  it('detects parameters and evaluates with a scope', () => {
    const result = mustOk('a*x^2 + b');
    expect(result.params).toEqual(['a', 'b']);
    expect(result.evaluate({ x: 2, a: 3, b: 1 })).toBe(13);
  });

  it('allows three parameters but rejects a fourth', () => {
    expect(analyzeExpression('a*x + b + c', { allowedVars: ['x'] }).ok).toBe(true);
    const four = analyzeExpression('a*x + b + c + d', { allowedVars: ['x'] });
    expect(four.ok).toBe(false);
    if (!four.ok) expect(four.error).toContain('最多支持 3 个参数');
  });

  it('enforces variables per expression', () => {
    const result = analyzeExpression('x + y', { allowedVars: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不能使用变量“y”');
  });

  it('rejects unsupported functions', () => {
    const result = analyzeExpression('gamma(x)', { allowedVars: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不支持的函数');
  });

  it('rejects multi-letter symbols with a useful message', () => {
    const result = analyzeExpression('xy + 1', { allowedVars: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('单个字母');
  });

  it('evaluates an implicit equation through the normaliser', () => {
    const result = analyzeExpression('x^2 + y^2 = 4', {
      allowedVars: ['x', 'y'],
      allowEquation: true,
    });
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
    if (result.ok) {
      expect(result.evaluate({ x: 2, y: 0 })).toBe(0);
      expect(result.evaluate({ x: 0, y: 0 })).toBe(-4);
    }
  });

  it('returns NaN rather than throwing for a domain error', () => {
    const result = mustOk('sqrt(x)');
    expect(Number.isNaN(result.evaluate({ x: -1 }))).toBe(true);
  });

  it('builds a numeric scope with invalid parameters as NaN', () => {
    const scope = buildScope({ x: 2 }, { a: '3', b: 'oops' });
    expect(scope.x).toBe(2);
    expect(scope.a).toBe(3);
    expect(Number.isNaN(scope.b)).toBe(true);
  });
});

describe('analyzeDerivative', () => {
  it('differentiates polynomials symbolically', () => {
    const result = mustOk('x^3');
    const derivative = analyzeDerivative(result);
    expect(derivative.ok).toBe(true);
    if (derivative.ok && !derivative.numeric) {
      expect(derivative.evaluate({ x: 2 })).toBeCloseTo(12, 10);
      expect(derivative.tex).toBeTruthy();
    }
  });

  it('differentiates a product', () => {
    const result = mustOk('x^2 * sin(x)');
    const derivative = analyzeDerivative(result);
    expect(derivative.ok).toBe(true);
    if (derivative.ok && !derivative.numeric) {
      const x = 1.2;
      const expected = 2 * x * Math.sin(x) + x * x * Math.cos(x);
      expect(derivative.evaluate({ x })).toBeCloseTo(expected, 8);
    }
  });

  it('falls back without throwing when a derivative is unsupported', () => {
    const result = mustOk('abs(x)');
    const derivative = analyzeDerivative(result);
    expect(derivative.ok).toBe(true);
  });

  it('returns a failed state for an empty analysis cache edge case', () => {
    clearExpressionCaches();
    const bad = analyzeExpression('sin(', { allowedVars: ['x'] });
    expect(bad.ok).toBe(false);
  });
});
