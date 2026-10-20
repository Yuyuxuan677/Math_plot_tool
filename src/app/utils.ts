export const COLOR_PALETTE = [
  '#2563eb',
  '#e11d48',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be185d',
  '#4d7c0f',
] as const;

export function pickColor(used: string[]): string {
  const unused = COLOR_PALETTE.find((color) => !used.includes(color));
  return unused ?? COLOR_PALETTE[used.length % COLOR_PALETTE.length];
}

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) {
    return value.toExponential(2).replace('e+', '×10^').replace('e-', '×10^−');
  }
  return Number(value.toFixed(digits)).toString();
}

export function nearlyEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Convert a small decimal into a nice fraction for equation labels. */
export function niceFraction(value: number): { numerator: number; denominator: number } | null {
  if (!Number.isFinite(value)) return null;
  for (let denominator = 1; denominator <= 64; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) < 1e-9 * Math.max(1, Math.abs(value))) {
      return reduceFraction(numerator, denominator);
    }
  }
  return null;
}

function reduceFraction(numerator: number, denominator: number): {
  numerator: number;
  denominator: number;
} {
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  const divisor = gcd(numerator, denominator) || 1;
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function formatNice(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  const fraction = niceFraction(value);
  if (fraction && fraction.denominator <= 12) {
    return `${fraction.numerator}/${fraction.denominator}`;
  }
  return Number(value.toFixed(digits)).toString();
}
