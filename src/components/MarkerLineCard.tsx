import { useAppStore } from '../app/store';
import type { MarkerLine } from '../app/types';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';

export function MarkerLineCard({ line }: { line: MarkerLine }) {
  const expanded = useAppStore((state) => state.expandedId === line.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const update = useAppStore((state) => state.updateMarkerLine);
  const remove = useAppStore((state) => state.removeMarkerLine);
  const a = markedPoints.find((point) => point.id === line.aId);
  const b = markedPoints.find((point) => point.id === line.bId);
  const toggleExpanded = () => setExpandedId(expanded ? null : line.id);

  return (
    <article
      className={`object-card marker-line-card ${expanded ? 'is-expanded' : ''}`}
      data-id={line.id}
    >
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: line.color }}
          title="修改颜色"
          aria-label="修改连线颜色"
        >
          <input
            type="color"
            value={line.color}
            onChange={(event) => update(line.id, { color: event.target.value })}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">两点连线</span>
          <span className="card-summary">
            {a?.name ?? 'A'} — {b?.name ?? 'B'}
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={line.visible ? '隐藏连线' : '显示连线'}
            onClick={() => update(line.id, { visible: !line.visible })}
          >
            {line.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除连线"
            onClick={() => remove(line.id)}
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
          <div className="setting-row column-setting">
            <div>
              <span className="setting-title">起点</span>
            </div>
            <select
              className="select-field"
              value={line.aId}
              aria-label="选择连线起点"
              onChange={(event) => update(line.id, { aId: event.target.value })}
            >
              {!a && <option value={line.aId}>标记点已删除</option>}
              {markedPoints
                .filter((point) => point.id !== line.bId)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <div>
              <span className="setting-title">终点</span>
            </div>
            <select
              className="select-field"
              value={line.bId}
              aria-label="选择连线终点"
              onChange={(event) => update(line.id, { bId: event.target.value })}
            >
              {!b && <option value={line.bId}>标记点已删除</option>}
              {markedPoints
                .filter((point) => point.id !== line.aId)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
            </select>
          </div>
          <p className="hint-text">连线会跟随两个标记点移动，也可参与交点计算。</p>
        </div>
      )}
    </article>
  );
}
