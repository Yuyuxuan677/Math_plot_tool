import { useAppStore } from '../app/store';
import type { IntersectionMark } from '../app/types';
import { buildCurveRefs } from '../app/curveRefs';
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
  const updateIntersection = useAppStore((state) => state.updateIntersection);
  const removeIntersection = useAppStore((state) => state.removeIntersection);
  const items2d = useAppStore((state) => state.items2d);
  const geometry = useAppStore((state) => state.geometry);

  const refs = buildCurveRefs(items2d, geometry);
  const labelFor = (id: string): string =>
    refs.find((ref) => ref.id === id)?.label ?? '曲线已删除';
  const toggleExpanded = () => setExpandedId(expanded ? null : mark.id);
  const clearTrace = () =>
    updateIntersection(mark.id, {
      traceClearToken: mark.traceClearToken + 1,
      showTrace: false,
    });

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
            onChange={(event) =>
              updateIntersection(mark.id, { color: event.target.value })
            }
          />
        </label>
        <button
          type="button"
          className="card-title-button"
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
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
            title={mark.visible ? '隐藏交点' : '显示交点'}
            onClick={() => updateIntersection(mark.id, { visible: !mark.visible })}
          >
            {mark.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除交点"
            title="删除交点"
            onClick={() => removeIntersection(mark.id)}
          >
            <IconTrash size={17} />
          </button>
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={expanded ? '收起' : '展开'}
            title={expanded ? '收起' : '展开'}
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
              <span className="setting-title">第一条曲线/直线</span>
              <p className="setting-hint">选择参与求交点的对象</p>
            </div>
            <select
              className="select-field"
              value={mark.aId}
              aria-label="选择第一条曲线或直线"
              onChange={(event) =>
                updateIntersection(mark.id, { aId: event.target.value })
              }
            >
              {!refs.some((ref) => ref.id === mark.aId) && (
                <option value={mark.aId} disabled>
                  曲线已删除
                </option>
              )}
              {refs
                .filter((ref) => ref.id !== mark.bId)
                .map((ref) => (
                  <option key={ref.id} value={ref.id}>
                    {ref.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="setting-row column-setting">
            <div>
              <span className="setting-title">第二条曲线/直线</span>
              <p className="setting-hint">移动任一对象后会自动求新的交点</p>
            </div>
            <select
              className="select-field"
              value={mark.bId}
              aria-label="选择第二条曲线或直线"
              onChange={(event) =>
                updateIntersection(mark.id, { bId: event.target.value })
              }
            >
              {!refs.some((ref) => ref.id === mark.bId) && (
                <option value={mark.bId} disabled>
                  曲线已删除
                </option>
              )}
              {refs
                .filter((ref) => ref.id !== mark.aId)
                .map((ref) => (
                  <option key={ref.id} value={ref.id}>
                    {ref.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="setting-row">
            <div>
              <span className="setting-title">显示交点坐标</span>
              <p className="setting-hint">在交点旁显示近似坐标</p>
            </div>
            <Switch
              checked={mark.showCoordinates}
              onChange={(checked) =>
                updateIntersection(mark.id, { showCoordinates: checked })
              }
              label="显示交点坐标"
            />
          </div>

          <div className="setting-row">
            <div>
              <span className="setting-title">记录交点轨迹</span>
              <p className="setting-hint">移动相关图像时留下交点经过的轨迹</p>
            </div>
            <Switch
              checked={mark.showTrace}
              onChange={(checked) =>
                updateIntersection(mark.id, {
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
            <button type="button" className="text-button" onClick={clearTrace}>
              清除交点轨迹
            </button>
          )}

          <p className="hint-text">
            交点为数值近似；拖动、缩放画板后会按当前视图重新计算。
          </p>
        </div>
      )}
    </article>
  );
}
