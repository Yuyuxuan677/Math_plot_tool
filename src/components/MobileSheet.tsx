import { useEffect, useRef } from 'react';
import { useAppStore } from '../app/store';
import { ObjectsPanel } from './ObjectsPanel';
import {
  IconChevronDown,
  IconChevronUp,
  IconDraw,
  IconPlus,
} from './Icon';

export function MobileSheet() {
  const expanded = useAppStore((state) => state.sheetExpanded);
  const setExpanded = useAppStore((state) => state.setSheetExpanded);
  const setAddMenuOpen = useAppStore((state) => state.setAddMenuOpen);
  const setToolTrayOpen = useAppStore((state) => state.setToolTrayOpen);
  const mode = useAppStore((state) => state.mode);
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const geometry = useAppStore((state) => state.geometry);
  const intersections = useAppStore((state) => state.intersections);

  const startY = useRef<number | null>(null);
  const intent = useRef<'up' | 'down' | null>(null);
  const suppressClick = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [expanded]);

  const count =
    mode === '2d' ? items2d.length + geometry.length + intersections.length : items3d.length;

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
    setExpanded(true);
    window.setTimeout(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 280);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary) return;
    startY.current = event.clientY;
    intent.current = null;
    suppressClick.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null) return;
    const dy = event.clientY - startY.current;
    if (dy < -22) intent.current = 'up';
    else if (dy > 22) intent.current = 'down';
  };

  const handlePointerUp = () => {
    if (intent.current === 'up') {
      setExpanded(true);
      suppressClick.current = true;
    } else if (intent.current === 'down') {
      setExpanded(false);
      suppressClick.current = true;
    }
    startY.current = null;
    intent.current = null;
  };

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setExpanded(!expanded);
  };

  return (
    <section
      className={`mobile-sheet ${expanded ? 'is-expanded' : ''}`}
      aria-label="对象面板"
    >
      <button
        type="button"
        className="sheet-grabber"
        aria-expanded={expanded}
        aria-label={expanded ? '收起对象面板' : '展开对象面板'}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="grabber-bar" />
      </button>

      <div className="sheet-peekbar">
        <button type="button" className="sheet-title" onClick={handleClick}>
          <span className="sheet-title-label">对象</span>
          <span className="sheet-count">{count}</span>
          {expanded ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
        </button>
        <div className="sheet-quick-actions">
          <button
            type="button"
            className="sheet-quick-button"
            onClick={() => setAddMenuOpen(true)}
          >
            <IconPlus size={18} />
            <span>添加</span>
          </button>
          {mode === '2d' && (
            <button
              type="button"
              className="sheet-quick-button"
              onClick={() => setToolTrayOpen(true)}
            >
              <IconDraw size={18} />
              <span>画图</span>
            </button>
          )}
        </div>
      </div>

      <div
        ref={contentRef}
        className="sheet-content"
        role="region"
        aria-label="对象列表"
        onFocusCapture={handleFocus}
      >
        <ObjectsPanel compact />
        <div className="sheet-bottom-pad" />
      </div>
    </section>
  );
}
