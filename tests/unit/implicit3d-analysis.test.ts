import { describe, expect, it } from 'vitest';
import type { Implicit3DItem } from '../../src/app/types';
import { analyze3DItem } from '../../src/core/plot2d/analysis';

function implicit3d(expr: string): Implicit3DItem {
  return {
    id: 'implicit3d',
    kind: 'implicit3d',
    color: '#2563eb',
    visible: true,
    expr,
    xMin: -4,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    zMin: -4,
    zMax: 4,
    resolution: 30,
  };
}

describe('3D implicit analysis', () => {
  it('accepts a plane and four parameters', () => {
    const analysis = analyze3DItem(implicit3d('a*x + b*y + c*z + d = 0'));
    expect(analysis.errors).toHaveLength(0);
    expect(analysis.params.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects a fifth parameter in 3D', () => {
    const analysis = analyze3DItem(implicit3d('a*x + b*y + c*z + d + f'));
    expect(analysis.errors.length).toBeGreaterThan(0);
    expect(analysis.errors[0].message).toContain('最多支持 4 个参数');
  });

  it('accepts uppercase plane coefficients as parameters', () => {
    const analysis = analyze3DItem(implicit3d('A*x + B*y + C*z + D = 0'));
    expect(analysis.errors).toHaveLength(0);
    expect(analysis.params.sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('recognizes z as a variable', () => {
    const analysis = analyze3DItem(implicit3d('x + y + z - 1'));
    expect(analysis.errors).toHaveLength(0);
  });
});
