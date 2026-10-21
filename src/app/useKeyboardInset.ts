import { useEffect } from 'react';

/**
 * On iOS the layout viewport does not shrink when the software keyboard opens:
 * fixed elements stay behind the keyboard. visualViewport reports the smaller
 * visible area. Raise the sheet by the difference, but ignore small differences
 * caused by browser toolbars.
 */
export function computeKeyboardInset(
  innerHeight: number,
  visualHeight: number,
  visualOffsetTop = 0,
): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(visualHeight)) return 0;
  const raw = innerHeight - visualHeight - (Number.isFinite(visualOffsetTop) ? visualOffsetTop : 0);
  return raw > 160 ? Math.max(0, Math.round(raw)) : 0;
}

export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const inset = computeKeyboardInset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      );
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
    };
    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      document.documentElement.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
