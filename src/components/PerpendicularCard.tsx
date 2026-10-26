import { useAppStore } from '../app/store';
import type { PerpendicularMark } from '../app/types';
import { buildPerpendicularLineOptions } from '../app/lineRefs';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { Switch } from './Switch';

export function PerpendicularCard({ mark }: { mark: PerpendicularMark }) {
  const expanded = useAppStore((state) => state.expandedId === mark.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const items2d = useAppStore((state) => state.items2d);
  const markerLines = useAppStore((state) => state.markerLines);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const paramValues = useAppStore((state) => state.paramValues);
  const perpendiculars = useAppStore((state) => state.perpendiculars);
  const update = useAppStore((state) => state.updatePerpendicular);
  const remove = useAppStore((state) => state.removePerpendicular);
  const point = markedPoints.find((item) => item.id === mark.pointId);
  const foot = markedPoints.find(
    (item) => item.source === 'perpendicular' && item.perpendicularMarkId === mark.id,
  );
  const lines = buildPerpendicularLineOptions(
    items2d,
    markerLines,
    markedPoints,
    paramValues,
    perpendiculars,
  ).filter((line) => line.id !== `perp:${mark.id}`);
  const toggleExpanded = () => setExpandedId(expanded ? null : mark.id);

  return (
    <article
      className={`object-card perpendicular-card ${expanded ? 'is-expanded' : ''}`}
      data-id={mark.id}
    >
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: mark.color }}
          title="修改颜色"
          aria-label="修改垂线颜色"
        >
          <input
            type="color"
            value={mark.color}
            onChange={(event) => update(mark.id, { color: event.target.value })}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">垂线</span>
          <span className="card-summary">
            {point?.name ?? '点已删除'} → {lines.find((line) => line.id === mark.lineId)?.label ?? '直线已删除'}
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={mark.visible ? '隐藏垂线' : '显示垂线'}
            onClick={() => update(mark.id, { visible: !mark.visible })}
          >
            {mark.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除垂线"
            onClick={() => remove(mark.id)}
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
            <span className="setting-title">经过的标记点</span>
            <select
              className="select-field"
              value={mark.pointId}
              aria-label="选择垂线经过的标记点"
              onChange={(event) => update(mark.id, { pointId: event.target.value })}
            >
              {!point && <option value={mark.pointId}>标记点已删除</option>}
              {markedPoints
                .filter((item) => item.id !== foot?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（{item.point.x.toFixed(2)}, {item.point.y.toFixed(2)}）
                  </option>
                ))}            </select>
          </div>
          <div className="setting-row column-setting">
            <span className="setting-title">垂直的直线</span>
            <select
              className="select-field"
              value={mark.lineId}
              aria-label="选择垂直的直线"
              onChange={(event) => update(mark.id, { lineId: event.target.value })}
            >
              {!lines.some((line) => line.id === mark.lineId) && (
                <option value={mark.lineId}>直线已删除</option>
              )}
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.label}
                </option>
              ))}
            </select>
          </div>
          <p className="hint-text">
            垂足 {foot?.name ?? '生成中'} 自动跟随点或直线移动。
          </p>
          <div className="setting-row">
            <div>
              <span className="setting-title">显示垂足坐标</span>
            </div>
            <Switch
              checked={mark.showCoordinates}
              onChange={(checked) => update(mark.id, { showCoordinates: checked })}
              label="显示垂足坐标"
            />
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">记录垂足轨迹</span>
              <p className="setting-hint">默认关闭</p>
            </div>
            <Switch
              checked={mark.showTrace}
              onChange={(checked) =>
                update(mark.id, {
                  showTrace: checked,
                  traceClearToken: checked
                    ? mark.traceClearToken
                    : mark.traceClearToken + 1,
                })
              }
              label="记录垂足轨迹"
            />
          </div>
          {mark.showTrace && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                update(mark.id, {
                  traceClearToken: mark.traceClearToken + 1,
                  showTrace: false,
                })
              }
            >
              清除垂足轨迹
            </button>
          )}
        </div>
      )}
    </article>
  );
}
