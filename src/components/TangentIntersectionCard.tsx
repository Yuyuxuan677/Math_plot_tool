import { useEffect, useState } from 'react';
import { getParamNumberValues, useAppStore } from '../app/store';
import type { TangentIntersectionMark } from '../app/types';
import { buildTangentChoices, tangentRefKey } from '../app/tangentRefs';
import { deriveTangentLocus, type TangentLocusResult } from '../core/locus/tangentLocus';
import { Formula } from './Formula';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { Switch } from './Switch';

export function TangentIntersectionCard({ mark }: { mark: TangentIntersectionMark }) {
  const expanded = useAppStore((state) => state.expandedId === mark.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const update = useAppStore((state) => state.updateTangentIntersection);
  const remove = useAppStore((state) => state.removeTangentIntersection);
  const items2d = useAppStore((state) => state.items2d);
  const params = getParamNumberValues(useAppStore((state) => state.paramValues));
  const tangentAngleConstraints = useAppStore((state) => state.tangentAngleConstraints);
  const [locus, setLocus] = useState<TangentLocusResult | string | null>(null);
  const choices = buildTangentChoices(items2d);
  const aKey = tangentRefKey(mark.a);
  const bKey = tangentRefKey(mark.b);
  const labelFor = (key: string) =>
    choices.find((choice) => tangentRefKey(choice) === key)?.label ?? '切线已删除';
  const toggleExpanded = () => setExpandedId(expanded ? null : mark.id);
  const sameRef = (left: typeof mark.a, right: typeof mark.a) =>
    left.ownerId === right.ownerId && left.tangentId === right.tangentId;
  const constraint = tangentAngleConstraints.find(
    (candidate) =>
      (sameRef(candidate.source, mark.a) && sameRef(candidate.target, mark.b)) ||
      (sameRef(candidate.source, mark.b) && sameRef(candidate.target, mark.a)),
  );
  useEffect(() => {
    if (!expanded || !constraint) return;
    setLocus(deriveTangentLocus(mark, constraint, items2d, params));
    // The derivation is intentionally refreshed when the card is opened or
    // the fixed angle changes, not on every tangent drag frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, constraint?.id, constraint?.angleDeg]);

  return (
    <article
      className={`object-card tangent-intersection-card ${expanded ? 'is-expanded' : ''}`}
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
            {labelFor(aKey)} × {labelFor(bKey)}
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={mark.visible ? '隐藏切线交点' : '显示切线交点'}
            onClick={() => update(mark.id, { visible: !mark.visible })}
          >
            {mark.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除切线交点"
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
              <span className="setting-title">第一条切线</span>
              <p className="setting-hint">两条切线的交点会随切点移动</p>
            </div>
            <select
              className="select-field"
              value={aKey}
              aria-label="选择第一条切线"
              onChange={(event) => {
                const choice = choices.find(
                  (candidate) => tangentRefKey(candidate) === event.target.value,
                );
                if (!choice) return;
                update(mark.id, { a: { ownerId: choice.ownerId, tangentId: choice.tangentId } });
              }}
            >
              {!choices.some((choice) => tangentRefKey(choice) === aKey) && (
                <option value={aKey}>切线已删除</option>
              )}
              {choices
                .filter((choice) => tangentRefKey(choice) !== bKey)
                .map((choice) => (
                  <option key={tangentRefKey(choice)} value={tangentRefKey(choice)}>
                    {choice.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <div>
              <span className="setting-title">第二条切线</span>
            </div>
            <select
              className="select-field"
              value={bKey}
              aria-label="选择第二条切线"
              onChange={(event) => {
                const choice = choices.find(
                  (candidate) => tangentRefKey(candidate) === event.target.value,
                );
                if (!choice) return;
                update(mark.id, { b: { ownerId: choice.ownerId, tangentId: choice.tangentId } });
              }}
            >
              {!choices.some((choice) => tangentRefKey(choice) === bKey) && (
                <option value={bKey}>切线已删除</option>
              )}
              {choices
                .filter((choice) => tangentRefKey(choice) !== aKey)
                .map((choice) => (
                  <option key={tangentRefKey(choice)} value={tangentRefKey(choice)}>
                    {choice.label}
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
              <p className="setting-hint">移动切线时留下两切线交点的轨迹</p>
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
              label="记录切线交点轨迹"
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
          {constraint && (
            <div className="locus-block">
              <button
                type="button"
                className="locus-button"
                onClick={() => {
                  setLocus(deriveTangentLocus(mark, constraint, items2d, params));
                }}
              >
                推导交点轨迹方程
              </button>
              {locus && (
                <div className="locus-result">
                  {typeof locus === 'string' ? (
                    <p className="hint-text">{locus}</p>
                  ) : (
                    <>
                      <p className="locus-title">{locus.title}</p>
                      <Formula tex={locus.equation} display />
                      <p className="locus-note">{locus.note}</p>
                      <ol className="locus-steps">
                        {locus.steps.map((step) => (
                          <li key={step.title}>
                            <strong>{step.title}</strong>
                            <p>{step.body}</p>
                            {step.formula && <Formula tex={step.formula} />}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="hint-text">
            只对两条切线的实际交点生效；两条切线平行时交点隐藏。
          </p>
        </div>
      )}
    </article>
  );
}
