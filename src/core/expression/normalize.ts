/**
 * Input normalisation for the mathjs expression parser.
 *
 * This is intentionally a *thin* layer: we only clean up symbols commonly typed
 * on a Chinese keyboard, aliases used in school textbooks, and an optional
 * left-hand side such as `y = ...`. Parsing and evaluation are done by mathjs.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '^0',
  '¹': '^1',
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁷': '^7',
  '⁸': '^8',
  '⁹': '^9',
};

const CHAR_MAP: Record<string, string> = {
  '−': '-',
  '–': '-',
  '—': '-',
  '×': '*',
  '·': '*',
  '⋅': '*',
  '÷': '/',
  'π': 'pi',
  '∞': 'Infinity',
};

const PREFIX_PATTERNS: Record<string, RegExp> = {
  y: /^\s*(?:y|f\s*\(\s*x\s*\))\s*=/i,
  z: /^\s*z\s*=/i,
  'x-t': /^\s*x\s*\(\s*t\s*\)\s*=/i,
  'y-t': /^\s*y\s*\(\s*t\s*\)\s*=/i,
  'x-uv': /^\s*x\s*\(\s*u\s*,\s*v\s*\)\s*=/i,
  'y-uv': /^\s*y\s*\(\s*u\s*,\s*v\s*\)\s*=/i,
  'z-uv': /^\s*z\s*\(\s*u\s*,\s*v\s*\)\s*=/i,
  'x-3d-t': /^\s*x\s*\(\s*t\s*\)\s*=/i,
  'y-3d-t': /^\s*y\s*\(\s*t\s*\)\s*=/i,
  'z-3d-t': /^\s*z\s*\(\s*t\s*\)\s*=/i,
};

export type PrefixKind = keyof typeof PREFIX_PATTERNS;

export interface NormalizeOptions {
  /** Remove a common left-hand side such as `y =` or `x(t) =`. */
  stripPrefix?: PrefixKind;
  /** Split a single top-level `=` into `left - (right)`. */
  allowEquation?: boolean;
}

export interface NormalizeResult {
  ok: boolean;
  text: string;
  error?: string;
}

function replaceSuperscripts(input: string): string {
  return input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (char) => SUPERSCRIPT_MAP[char] ?? char);
}

/** Index of a top-level equality sign, or -1. */
function findTopLevelEquals(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === '=' && depth === 0) return index;
  }
  return -1;
}

/** Find a second top-level equality sign (invalid for our equation inputs). */
function hasSecondTopLevelEquals(text: string, first: number): boolean {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === '=' && depth === 0 && index !== first) return true;
  }
  return false;
}

export function normalizeExpression(raw: string, options: NormalizeOptions = {}): NormalizeResult {
  let text = raw.trim();
  if (!text) {
    return { ok: false, text: '', error: '请输入一个表达式' };
  }

  // Superscripts must be handled before NFKC, otherwise x² becomes x2.
  text = replaceSuperscripts(text);
  text = text.normalize('NFKC');
  text = text.replace(/[−–—×·⋅÷π∞]/g, (char) => CHAR_MAP[char] ?? char);
  text = text.replace(/\*\*/g, '^');
  text = text.replace(/√\s*\(/g, 'sqrt(');
  text = text.replace(/\barcsin\s*\(/gi, 'asin(');
  text = text.replace(/\barccos\s*\(/gi, 'acos(');
  text = text.replace(/\barctan\s*\(/gi, 'atan(');
  text = text.replace(/\bln\s*\(/gi, 'log(');
  text = text.replace(/\blg\s*\(/gi, 'log10(');
  text = text.replace(/\s+/g, ' ').trim();

  if (options.stripPrefix) {
    text = text.replace(PREFIX_PATTERNS[options.stripPrefix], '').trim();
    if (!text) {
      return { ok: false, text: '', error: '等号右侧还没有表达式' };
    }
  }

  if (options.allowEquation) {
    text = text.replace(/==/g, '=');
    const equalsIndex = findTopLevelEquals(text);
    if (equalsIndex >= 0) {
      if (hasSecondTopLevelEquals(text, equalsIndex)) {
        return { ok: false, text, error: '一个方程只能包含一个等号' };
      }
      const left = text.slice(0, equalsIndex).trim();
      const right = text.slice(equalsIndex + 1).trim();
      if (!left || !right) {
        return { ok: false, text, error: '等号两边都要有表达式' };
      }
      text = `(${left}) - (${right})`;
    }
  } else if (text.includes('=')) {
    return { ok: false, text, error: '这个输入框不需要等号，请直接输入等号右边的表达式' };
  }

  return { ok: true, text };
}
