import { useAppStore } from '../app/store';
import type { MarkedPoint } from '../app/types';
import { item2DLabel } from '../app/curveRefs';
import { buildIntersectionObjects } from '../app/intersectionRefs';
import { buildTangentChoices } from '../app/tangentRefs';
import { formatNumber } from '../app/utils';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { NumberField } from './NumberField';
import { Switch } from './Switch';

export function MarkedPointCard({ marked }: { marked: MarkedPoint }) {
  const expanded = useAppStore((state) => state.expandedId === marked.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const setSelectedId = useAppStore((state) => state.setSelectedId);
  const items2d = useAppStore((state) => state.items2d);
  const intersections = useAppStore((state) => state.intersections);
  const tangentIntersections = useAppStore((state) => state.tangentIntersections);
  const markerLines = useAppStore((state) => state.markerLines);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const update = useAppStore((state) => state.updateMarkedPoint);
  const remove = useAppStore((state) => state.removeMarkedPoint);
  const owner = items2d.find((item) => item.id === marked.ownerId);
  const isFree = marked.source === 'free';
  const isIntersection = marked.source === 'intersection';
  const canLockCoordinate = marked.source === 'manual' && !isFree;
  const lock = marked.coordinateLock;
  const toggleExpanded = () => setExpandedId(expanded ? null : marked.id);
  const kind = isFree
    ? '自由点'
    : isIntersection
      ? '交点'
      : marked.source === 'tangent'
        ? '切点'
        : '标记点';

  const objectIntersection = isIntersection
    ? intersections.find((item) => item.id === marked.intersectionMarkId)
    : undefined;
  const tangentIntersection = isIntersection
    ? tangentIntersections.find((item) => item.id === marked.intersectionMarkId)
    : undefined;
  const intersectionObjects = buildIntersectionObjects(items2d, markerLines, markedPoints);
  const tangentChoices = buildTangentChoices(items2d);
  const sourceMarkId = marked.intersectionMarkId;
  const intersectionSource = objectIntersection
    ? `${intersectionObjects.find((object) => object.id === objectIntersection.aId)?.label ?? '对象已删除'} × ${
        intersectionObjects.find((object) => object.id === objectIntersection.bId)?.label ?? '对象已删除'
      }`
    : tangentIntersection
      ? `${tangentChoices.find((choice) => choice.ownerId === tangentIntersection.a.ownerId && choice.tangentId === tangentIntersection.a.tangentId)?.label ?? '切线已删除'} × ${
          tangentChoices.find((choice) => choice.ownerId === tangentIntersection.b.ownerId && choice.tangentId === tangentIntersection.b.tangentId)?.label ?? '切线已删除'
        }`
      : '来源交点已删除';

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
          <span className="card-kind">
            {kind} {marked.name}
          </span>
          <span className="card-summary">
            （{formatNumber(marked.point.x)}, {formatNumber(marked.point.y)}） ·{' '}
            {isFree
              ? '自由点，可手动输入坐标'
              : isIntersection
                ? '由交点自动生成'
                : owner
                  ? item2DLabel(owner)
                  : '曲线已删除'}
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
          {marked.source !== 'tangent' && !isIntersection && (
            <button
              type="button"
              className="icon-button small-icon danger-icon"
              aria-label={`删除标记点 ${marked.name}`}
              onClick={() => remove(marked.id)}
            >
              <IconTrash size={17} />
            </button>
          )}
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
            {isFree
              ? `自由点 ${marked.name} 不依附曲线，可以直接拖动或手动输入固定坐标。`
              : isIntersection
                ? `交点 ${marked.name} 自动跟随两个对象移动，可用于连线或 N 等分点。`
                : marked.source === 'tangent'
                  ? `由切线自动生成的切点 ${marked.name}；拖动切线切点改变位置。`
                  : `点 ${marked.name} 可在曲线上拖动；坐标为实时值。`}
          </p>

          {isFree ? (
            <>
              <div className="setting-heading">固定坐标</div>
              <div className="range-row">
                <NumberField
                  value={marked.point.x}
                  onCommit={(value) =>
                    update(marked.id, { point: { ...marked.point, x: value } })
                  }
                  ariaLabel="自由点横坐标"
                  step={0.1}
                />
                <span className="range-separator">x，y</span>
                <NumberField
                  value={marked.point.y}
                  onCommit={(value) =>
                    update(marked.id, { point: { ...marked.point, y: value } })
                  }
                  ariaLabel="自由点纵坐标"
                  step={0.1}
                />
              </div>
            </>
          ) : isIntersection ? (
            <>
              <div className="setting-heading">交点来源</div>
              <p className="setting-hint marked-point-source">
                {intersectionSource}
                {objectIntersection && marked.intersectionIndex !== undefined
                  ? `（第 ${marked.intersectionIndex + 1} 个交点）`
                  : ''}
              </p>
              {sourceMarkId && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelectedId(sourceMarkId);
                    setExpandedId(sourceMarkId);
                  }}
                >
                  查看交点详情
                </button>
              )}
              <p className="setting-hint">交点位置由所选两个对象决定，不能单独拖动。</p>
            </>
          ) : (
            <>
              <div className="setting-row">
                <div>
                  <span className="setting-title">自动移动</span>
                  <p className="setting-hint">只移动勾选的点；配合对象栏的“自动移动”按钮启动</p>
                </div>
                <Switch
                  checked={!!marked.autoMove}
                  onChange={(checked) => update(marked.id, { autoMove: checked })}
                  label={`自动移动 ${marked.name}`}
                />
              </div>

              {canLockCoordinate && (
                <>
                  <div className="setting-row column-setting">
                    <div>
                      <span className="setting-title">坐标限制</span>
                      <p className="setting-hint">固定横坐标或纵坐标，另一个坐标由曲线自动求出</p>
                    </div>
                    <select
                      className="select-field"
                      value={lock?.axis ?? ''}
                      aria-label="选择坐标限制"
                      onChange={(event) => {
                        const axis = event.target.value;
                        if (axis !== 'x' && axis !== 'y') {
                          update(marked.id, { coordinateLock: undefined });
                          return;
                        }
                        update(marked.id, {
                          coordinateLock: {
                            axis,
                            value: axis === 'x' ? marked.point.x : marked.point.y,
                          },
                        });
                      }}
                    >
                      <option value="">不限制</option>
                      <option value="x">固定横坐标 x</option>
                      <option value="y">固定纵坐标 y</option>
                    </select>
                  </div>
                  {lock && (
                    <div className="setting-row">
                      <span className="setting-title">
                        {lock.axis === 'x' ? '固定 x =' : '固定 y ='}
                      </span>
                      <div className="inline-number">
                        <NumberField
                          value={lock.value}
                          onCommit={(value) =>
                            update(marked.id, {
                              coordinateLock: { axis: lock.axis, value },
                            })
                          }
                          ariaLabel="坐标限制值"
                          step={0.1}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

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
