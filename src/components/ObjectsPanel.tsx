import { useEffect } from 'react';
import { useAppStore } from '../app/store';
import { ExpressionCard } from './ExpressionCard';
import { MarkedPointCard } from './MarkedPointCard';
import { DivisionCard } from './DivisionCard';
import { IntersectionCard } from './IntersectionCard';
import { MarkerLineCard } from './MarkerLineCard';
import { Item3DCard } from './Item3DCard';
import { ParameterPanel } from './ParameterPanel';
import { TangentAngleCard } from './TangentAngleCard';
import { TangentIntersectionCard } from './TangentIntersectionCard';
import { IconPause, IconPlay, IconPlus, IconTarget } from './Icon';

export function ObjectsPanel({ compact = false }: { compact?: boolean }) {
  const mode = useAppStore((state) => state.mode);
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const intersections = useAppStore((state) => state.intersections);
  const tangentIntersections = useAppStore((state) => state.tangentIntersections);
  const tangentAngleConstraints = useAppStore((state) => state.tangentAngleConstraints);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const divisionMarks = useAppStore((state) => state.divisionMarks);
  const markerLines = useAppStore((state) => state.markerLines);
  const autoMovePoints = useAppStore((state) => state.autoMovePoints);
  const setAutoMovePoints = useAppStore((state) => state.setAutoMovePoints);
  const expandedId = useAppStore((state) => state.expandedId);
  const setAddMenuOpen = useAppStore((state) => state.setAddMenuOpen);
  const setActiveTool = useAppStore((state) => state.setActiveTool);

  const objects = mode === '2d' ? items2d : items3d;
  const count =
    objects.length +
    (mode === '2d'
      ? intersections.length +
        tangentIntersections.length +
        tangentAngleConstraints.length +
        markedPoints.length +
        divisionMarks.length +
        markerLines.length
      : 0);

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
            {mode === '2d' && markedPoints.length > 0 && (
              <button
                type="button"
                className={`secondary-small-button ${autoMovePoints ? 'is-active' : ''}`}
                aria-pressed={autoMovePoints}
                onClick={() => setAutoMovePoints(!autoMovePoints)}
              >
                {autoMovePoints ? <IconPause size={15} /> : <IconPlay size={15} />}
                {autoMovePoints ? '暂停' : '自动移动'}
              </button>
            )}
            {mode === '2d' && (
              <button
                type="button"
                className="secondary-small-button"
                onClick={() => setActiveTool('markPoint')}
              >
                <IconTarget size={16} />
                标点
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

      {objects.length === 0 && (
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

      {mode === '2d' && markedPoints.length > 0 && (
        <section className="panel-section marked-points-section" aria-label="标记点">
          <div className="section-heading">
            <h3>标记点</h3>
            <span className="section-count">{markedPoints.length}</span>
          </div>
          <div className="object-list">
            {markedPoints.map((marked) => (
              <MarkedPointCard key={marked.id} marked={marked} />
            ))}
          </div>
        </section>
      )}

      {mode === '2d' && divisionMarks.length > 0 && (
        <section className="panel-section divisions-section" aria-label="N 等分点">
          <div className="section-heading">
            <h3>N 等分点</h3>
            <span className="section-count">{divisionMarks.length}</span>
          </div>
          <div className="object-list">
            {divisionMarks.map((mark) => (
              <DivisionCard key={mark.id} mark={mark} />
            ))}
          </div>
        </section>
      )}

      {mode === '2d' && tangentAngleConstraints.length > 0 && (
        <section className="panel-section tangent-constraints-section" aria-label="切线夹角约束">
          <div className="section-heading">
            <h3>切线约束</h3>
            <span className="section-count">{tangentAngleConstraints.length}</span>
          </div>
          <div className="object-list">
            {tangentAngleConstraints.map((constraint) => (
              <TangentAngleCard key={constraint.id} constraint={constraint} />
            ))}
          </div>
        </section>
      )}

      {mode === '2d' && (intersections.length > 0 || tangentIntersections.length > 0) && (
        <section className="panel-section tangent-intersections-section" aria-label="交点">
          <div className="section-heading">
            <h3>交点</h3>
            <span className="section-count">
              {intersections.length + tangentIntersections.length}
            </span>
          </div>
          <div className="object-list">
            {intersections.map((mark) => (
              <IntersectionCard key={mark.id} mark={mark} />
            ))}
            {tangentIntersections.map((mark) => (
              <TangentIntersectionCard key={mark.id} mark={mark} />
            ))}
          </div>
        </section>
      )}

      {mode === '2d' && markerLines.length > 0 && (
        <section className="panel-section marker-lines-section" aria-label="两点连线">
          <div className="section-heading">
            <h3>连线</h3>
            <span className="section-count">{markerLines.length}</span>
          </div>
          <div className="object-list">
            {markerLines.map((line) => (
              <MarkerLineCard key={line.id} line={line} />
            ))}
          </div>
        </section>
      )}

      {compact && objects.length === 0 && (
        <p className="sheet-empty-hint">点上方“添加”新建表达式曲线。</p>
      )}
</div>
  );
}
