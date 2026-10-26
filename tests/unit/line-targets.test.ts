import { describe, expect, it } from 'vitest';
import type { ExplicitItem, ImplicitItem } from '../../src/app/types';
import { detectItemLine, projectPointToLine } from '../../src/core/plot2d/lineTargets';

const explicit = (expr: string): ExplicitItem => ({
  id: 'e',
  kind: 'explicit',
  color: '#000',
  visible: true,
  tangents: [],
  expr,
  showDerivative: false,
});

const implicit = (expr: string): ImplicitItem => ({
  id: 'i',
  kind: 'implicit',
  color: '#000',
  visible: true,
  tangents: [],
  expr,
});

describe('line target detection', () => {
  it('recognizes a linear explicit function', () => {
    const line = detectItemLine(explicit('2*x + 1'), {});
    expect(line).not.toBeNull();
    expect(line?.vertical).toBe(false);
    expect(line?.slope).toBeCloseTo(2, 6);
    expect(line?.point.y).toBeCloseTo(1, 6);
  });

  it('recognizes a vertical implicit line', () => {
    const line = detectItemLine(implicit('x = 4'), {});
    expect(line).not.toBeNull();
    expect(line?.vertical).toBe(true);
    expect(line?.point.x).toBeCloseTo(4, 6);
  });

  it('rejects a non-linear implicit curve', () => {
    expect(detectItemLine(implicit('x^2/4 + y^2 = 1'), {})).toBeNull();
  });

  it('projects a point onto a sloped line', () => {
    const foot = projectPointToLine(
      { x: 2, y: 3 },
      { point: { x: 0, y: 1 }, slope: 2, vertical: false },
    );
    expect(foot.x).toBeCloseTo(1.2, 8);
    expect(foot.y).toBeCloseTo(3.4, 8);
  });
});
