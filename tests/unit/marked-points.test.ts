import { describe, expect, it } from 'vitest';
import type { MarkedPoint } from '../../src/app/types';
import {
  divisionFractions,
  divisionPoint,
  nextMarkedPointName,
} from '../../src/app/markedPoints';

function point(name: string): MarkedPoint {
  return {
    id: name,
    ownerId: 'curve',
    name,
    point: { x: 0, y: 0 },
    visible: true,
  };
}

describe('marked points helpers', () => {
  it('assigns the first unused A/B/C name', () => {
    expect(nextMarkedPointName([])).toBe('A');
    expect(nextMarkedPointName([point('A')])).toBe('B');
    expect(nextMarkedPointName([point('A'), point('B')])).toBe('C');
    expect(nextMarkedPointName([point('A'), point('C')])).toBe('B');
  });

  it('returns N-1 interior fractions', () => {
    expect(divisionFractions(2)).toEqual([0.5]);
    expect(divisionFractions(4)).toEqual([0.25, 0.5, 0.75]);
    expect(divisionFractions(1)).toEqual([0.5]);
    expect(divisionFractions(100).length).toBe(19);
  });

  it('interpolates division points along the chord', () => {
    expect(divisionPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({
      x: 2.5,
      y: 5,
    });
    expect(divisionPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({
      x: 5,
      y: 10,
    });
  });
});
