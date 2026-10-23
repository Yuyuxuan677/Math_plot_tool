import { useAppStore } from '../app/store';
import type { IntersectionMark } from '../app/types';
import { buildIntersectionObjects } from '../app/intersectionRefs';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { Switch } from './Switch';

export function IntersectionCard({ mark }: { mark: IntersectionMark }) {
  const expanded = useAppStore((state) => state.expandedId === mark.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const update = useAppStore((state) => state.updateIntersection);
  const remove = useAppStore((state) => state.removeIntersection);
  const items2d = useAppStore((state) => state.items2d);
  const markerLines = useAppStore((state) => state.markerLines);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const objects = buildIntersectionObjects(items2d, markerLines, markedPoints);
  const labelFor = (id: string) =>
    objects.find((object) => object.id === id)?.label ?? '对象已删除';
  const toggleExpanded = () => setExpandedId(expanded ? null : mark.id);

  return (
    <article
      className={`object-card intersection-card ${expanded ? 'is-expanded' : ''}`}
      data-id={mark.id}
    >
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: mark.color }}
          title="修改颜色"
          aria-label="修改颜色"
        >
          <input
            type="color"
            value={mark.color}
            onChange={(event) => update(mark.id, { color: event.target.value })}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">交点</span>
          <span className="card-summary">
            {labelFor(mark.aId)} × {labelFor(mark.bId)}
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={mark.visible ? '隐藏交点' : '显示交点'}
            onClick={() => update(mark.id, { visible: !mark.visible })}
          >
            {mark.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除交点"
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
              <span className="setting-title">第一个对象</span>
              <p className="setting-hint">曲线、切线、连线或坐标轴</p>
            </div>
            <select
              className="select-field"
              value={mark.aId}
              aria-label="选择第一个对象"
              onChange={(event) =>
                update(mark.id, {
                  aId: event.target.value,
                  traceClearToken: mark.traceClearToken + 1,
                })
              }
            >
              {!objects.some((object) => object.id === mark.aId) && (
                <option value={mark.aId}>对象已删除</option>
              )}
              {objects
                .filter((object) => object.id !== mark.bId)
                .map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <div>
              <span className="setting-title">第二个对象</span>
            </div>
            <select
              className="select-field"
              value={mark.bId}
              aria-label="选择第二个对象"
              onChange={(event) =>
                update(mark.id, {
                  bId: event.target.value,
                  traceClearToken: mark.traceClearToken + 1,
                })
              }
            >
              {!objects.some((object) => object.id === mark.bId) && (
                <option value={mark.bId}>对象已删除</option>
              )}
              {objects
                .filter((object) => object.id !== mark.aId)
                .map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">显示交点坐标</span>
            </div>
            <Switch
              checked={mark.showCoordinates}
              onChange={(checked) => update(mark.id, { showCoordinates: checked })}
              label="显示交点坐标"
            />
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-title">记录交点轨迹</span>
              <p className="setting-hint">交点自动成为标记点，可继续参与连线或 N 等分点</p>
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
              label="记录交点轨迹"
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
              清除交点轨迹
            </button>
          )}
        </div>
      )}
    </article>
  );
}
