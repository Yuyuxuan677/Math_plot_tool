import { useEffect } from 'react';
import { useAppStore } from '../app/store';
import { ExpressionCard } from './ExpressionCard';
import { GeometryCard } from './GeometryCard';
import { IntersectionCard } from './IntersectionCard';
import { Item3DCard } from './Item3DCard';
import { ParameterPanel } from './ParameterPanel';
import { IconDraw, IconPlus } from './Icon';

export function ObjectsPanel({ compact = false }: { compact?: boolean }) {
  const mode = useAppStore((state) => state.mode);
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const geometry = useAppStore((state) => state.geometry);
  const intersections = useAppStore((state) => state.intersections);
  const expandedId = useAppStore((state) => state.expandedId);
  const setAddMenuOpen = useAppStore((state) => state.setAddMenuOpen);
  const setToolTrayOpen = useAppStore((state) => state.setToolTrayOpen);

  const objects = mode === '2d' ? items2d : items3d;
  const count =
    objects.length + (mode === '2d' ? geometry.length + intersections.length : 0);

  useEffect(() => {
    if (!expandedId) return;
    const timer = window.setTimeout(() => {
      const element = document.querySelector(`[data-id="${expandedId}"]`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [expandedId]);

  return (
    <div className={`objects-panel ${compact ? 'is-compact' : ''}`}>
      {!compact && (
        <div className="objects-panel-head">
          <div>
            <h2>对象</h2>
            <p>{count > 0 ? `${count} 个对象` : '从一条曲线开始'}</p>
          </div>
          <div className="objects-head-actions">
            {mode === '2d' && (
              <button
                type="button"
                className="secondary-small-button"
                onClick={() => setToolTrayOpen(true)}
              >
                <IconDraw size={16} />
                画图
              </button>
            )}
            <button
              type="button"
              className="primary-small-button"
              onClick={() => setAddMenuOpen(true)}
            >
              <IconPlus size={17} />
              添加
            </button>
          </div>
        </div>
      )}

      {objects.length === 0 && geometry.length === 0 && intersections.length === 0 && (
        <div className="objects-empty">
          <p>还没有对象。</p>
          <button type="button" className="text-button" onClick={() => setAddMenuOpen(true)}>
            添加第一个对象
          </button>
        </div>
      )}

      <div className="object-list">
        {mode === '2d'
          ? items2d.map((item) => <ExpressionCard key={item.id} item={item} />)
          : items3d.map((item) => <Item3DCard key={item.id} item={item} />)}
      </div>

      <ParameterPanel />

      {mode === '2d' && geometry.length > 0 && (
        <section className="panel-section geometry-section" aria-label="几何图形">
          <div className="section-heading">
            <h3>图形</h3>
            <span className="section-count">{geometry.length}</span>
          </div>
          <div className="object-list">
            {geometry.map((shape) => (
              <GeometryCard key={shape.id} shape={shape} />
            ))}
          </div>
        </section>
      )}

      {mode === '2d' && intersections.length > 0 && (
        <section className="panel-section intersections-section" aria-label="交点标记">
          <div className="section-heading">
            <h3>交点</h3>
            <span className="section-count">{intersections.length}</span>
          </div>
          <div className="object-list">
            {intersections.map((mark) => (
              <IntersectionCard key={mark.id} mark={mark} />
            ))}
          </div>
        </section>
      )}

      {compact && objects.length === 0 && geometry.length === 0 && intersections.length === 0 && (
        <p className="sheet-empty-hint">点上方“添加”新建对象，或点“画图”直接在坐标系里画圆。</p>
      )}
    </div>
  );
}
