import { useAppStore } from '../app/store';
import type { DivisionMark } from '../app/types';
import { divisionFractions } from '../app/markedPoints';
import { NumberField } from './NumberField';
import { Switch } from './Switch';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';

export function DivisionCard({ mark }: { mark: DivisionMark }) {
  const expanded = useAppStore((state) => state.expandedId === mark.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const update = useAppStore((state) => state.updateDivisionMark);
  const remove = useAppStore((state) => state.removeDivisionMark);
  const a = markedPoints.find((point) => point.id === mark.aId);
  const b = markedPoints.find((point) => point.id === mark.bId);
  const toggleExpanded = () => setExpandedId(expanded ? null : mark.id);
  const count = divisionFractions(mark.divisions).length;

  return (
    <article
      className={`object-card division-card ${expanded ? 'is-expanded' : ''}`}
      data-id={mark.id}
    >
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: mark.color }}
          title="修改颜色"
          aria-label="修改等分点颜色"
        >
          <input
            type="color"
            value={mark.color}
            onChange={(event) => update(mark.id, { color: event.target.value })}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">N 等分点</span>
          <span className="card-summary">
            {a?.name ?? 'A'} → {b?.name ?? 'B'} · {count} 个内分点
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={mark.visible ? '隐藏等分点' : '显示等分点'}
            onClick={() => update(mark.id, { visible: !mark.visible })}
          >
            {mark.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除 N 等分点"
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
            <div>
              <span className="setting-title">起点</span>
              <p className="setting-hint">选择第一个标记点</p>
            </div>
            <select
              className="select-field"
              value={mark.aId}
              aria-label="选择等分起点"
              onChange={(event) => update(mark.id, { aId: event.target.value })}
            >
              {!a && <option value={mark.aId}>标记点已删除</option>}
              {markedPoints
                .filter((point) => point.id !== mark.bId)
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
              <p className="setting-hint">选择第二个标记点</p>
            </div>
            <select
              className="select-field"
              value={mark.bId}
              aria-label="选择等分终点"
              onChange={(event) => update(mark.id, { bId: event.target.value })}
            >
              {!b && <option value={mark.bId}>标记点已删除</option>}
              {markedPoints
                .filter((point) => point.id !== mark.aId)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">等分数 N</span>
              <p className="setting-hint">显示两点之间的 N−1 个内分点</p>
            </div>
            <div className="inline-number">
              <NumberField
                value={mark.divisions}
                onCommit={(value) =>
                  update(mark.id, {
                    divisions: Math.max(2, Math.min(20, Math.round(value))),
                  })
                }
                ariaLabel="N 等分数"
                step={1}
              />
            </div>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">显示等分点</span>
            </div>
            <Switch
              checked={mark.visible}
              onChange={(checked) => update(mark.id, { visible: checked })}
              label="显示等分点"
            />
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">记录等分点轨迹</span>
              <p className="setting-hint">拖动曲线上的标记点时留下轨迹</p>
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
              label="记录等分点轨迹"
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
              清除等分点轨迹
            </button>
          )}
          <p className="hint-text">
            等分点按两点连线插值；拖动标记点时，等分点和轨迹会实时更新。
          </p>
        </div>
      )}
    </article>
  );
}
