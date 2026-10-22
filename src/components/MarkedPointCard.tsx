import { useAppStore } from '../app/store';
import type { MarkedPoint } from '../app/types';
import { item2DLabel } from '../app/curveRefs';
import { formatNumber } from '../app/utils';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';

export function MarkedPointCard({ marked }: { marked: MarkedPoint }) {
  const expanded = useAppStore((state) => state.expandedId === marked.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const items2d = useAppStore((state) => state.items2d);
  const update = useAppStore((state) => state.updateMarkedPoint);
  const remove = useAppStore((state) => state.removeMarkedPoint);
  const owner = items2d.find((item) => item.id === marked.ownerId);
  const toggleExpanded = () => setExpandedId(expanded ? null : marked.id);

  return (
    <article
      className={`object-card marked-point-card ${expanded ? 'is-expanded' : ''}`}
      data-id={marked.id}
    >
      <div className="card-head">
        <span
          className="color-swatch static-swatch"
          style={{ backgroundColor: owner?.color ?? '#0f766e' }}
          aria-hidden="true"
        />
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">标记点 {marked.name}</span>
          <span className="card-summary">
            （{formatNumber(marked.point.x)}, {formatNumber(marked.point.y)}） ·{' '}
            {owner ? item2DLabel(owner) : '曲线已删除'}
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={marked.visible ? '隐藏标记点' : '显示标记点'}
            onClick={() => update(marked.id, { visible: !marked.visible })}
          >
            {marked.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label={`删除标记点 ${marked.name}`}
            onClick={() => remove(marked.id)}
          >
            <IconTrash size={17} />
          </button>
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={expanded ? '收起' : '展开'}
            onClick={toggleExpanded}
          >
            {expanded ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="card-body">
          <p className="setting-hint">
            点 {marked.name} 可在曲线上拖动；坐标为实时值。
          </p>
          <div className="setting-row">
            <span className="setting-title">当前坐标</span>
            <span className="inline-number-suffix">
              （{formatNumber(marked.point.x)}, {formatNumber(marked.point.y)}）
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
