import type { MarkedPoint, Point2 } from './types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** First unused A-Z name; falls back to P27, P28... for large sets. */
export function nextMarkedPointName(points: MarkedPoint[]): string {
  const used = new Set(points.map((point) => point.name));
  for (const letter of ALPHABET) {
    if (!used.has(letter)) return letter;
  }
  for (let index = 27; index < 999; index += 1) {
    const name = `P${index}`;
    if (!used.has(name)) return name;
  }
  return `P${Date.now()}`;
}

/** Interior equal-division fractions, k / divisions for k=1..divisions-1. */
export function divisionFractions(divisions: number): number[] {
  const n = Math.max(2, Math.min(20, Math.round(divisions)));
  return Array.from({ length: n - 1 }, (_, index) => (index + 1) / n);
}

export function divisionPoint(a: Point2, b: Point2, fraction: number): Point2 {
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
  };
}
