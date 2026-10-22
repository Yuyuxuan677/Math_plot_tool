import { describe, expect, it } from 'vitest';
import type {
  ImplicitItem,
  TangentAngleConstraint,
  TangentIntersectionMark,
} from '../../src/app/types';
import { deriveTangentLocus } from '../../src/core/locus/tangentLocus';

function ellipse(expr: string, id = 'ellipse'): ImplicitItem {
  return {
    id,
    kind: 'implicit',
    color: '#2563eb',
    visible: true,
    tangents: [],
    expr,
  };
}

const constraint: TangentAngleConstraint = {
  id: 'c',
  source: { ownerId: 'ellipse', tangentId: 'a' },
  target: { ownerId: 'ellipse', tangentId: 'b' },
  angleDeg: 90,
};

const mark: TangentIntersectionMark = {
  id: 'm',
  a: { ownerId: 'ellipse', tangentId: 'a' },
  b: { ownerId: 'ellipse', tangentId: 'b' },
  color: '#dc2626',
  visible: true,
  showCoordinates: true,
  showTrace: true,
  traceClearToken: 0,
};

describe('tangent locus derivation', () => {
  it('derives the ellipse director circle', () => {
    const result = deriveTangentLocus(mark, constraint, [ellipse('x^2/4 + y^2 = 1')], {});
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.equation).toContain('= 5');
    expect(result.title).toContain('椭圆');
    expect(result.steps.length).toBeGreaterThan(2);
  });

  it('derives the circle locus for an arbitrary fixed angle', () => {
    const circleConstraint = { ...constraint, angleDeg: 60 };
    const result = deriveTangentLocus(
      mark,
      circleConstraint,
      [ellipse('x^2 + y^2 = 4')],
      {},
    );
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.equation).toContain('x^2 + y^2');
  });

  it('explains unsupported cases instead of throwing', () => {
    const other = ellipse('x^2/4 + y^2 = 1', 'other');
    const mixedMark = {
      ...mark,
      b: { ownerId: 'other', tangentId: 'b' },
    };
    const mixedConstraint = {
      ...constraint,
      target: { ownerId: 'other', tangentId: 'b' },
    };
    const result = deriveTangentLocus(
      mixedMark,
      mixedConstraint,
      [ellipse('x^2/4 + y^2 = 1'), other],
      {},
    );
    expect(typeof result).toBe('string');
  });
});
