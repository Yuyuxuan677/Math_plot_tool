import { describe, expect, it } from 'vitest';
import { computeKeyboardInset } from '../../src/app/useKeyboardInset';

describe('keyboard inset', () => {
  it('is zero when the visual viewport is full height', () => {
    expect(computeKeyboardInset(844, 844)).toBe(0);
  });

  it('ignores small browser-toolbar differences', () => {
    expect(computeKeyboardInset(844, 760)).toBe(0);
    expect(computeKeyboardInset(844, 700)).toBe(0);
  });

  it('raises the sheet by the keyboard height', () => {
    expect(computeKeyboardInset(844, 520)).toBe(324);
    expect(computeKeyboardInset(844, 500, 10)).toBe(334);
  });

  it('tolerates missing and invalid measurements', () => {
    expect(computeKeyboardInset(Number.NaN, 500)).toBe(0);
    expect(computeKeyboardInset(844, Number.NaN)).toBe(0);
    expect(computeKeyboardInset(844, 500, Number.NaN)).toBe(344);
  });
});
