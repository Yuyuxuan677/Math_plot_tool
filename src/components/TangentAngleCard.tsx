import { useAppStore } from '../app/store';
import type { TangentAngleConstraint } from '../app/types';
import { buildTangentChoices, tangentRefKey } from '../app/tangentRefs';
import { NumberField } from './NumberField';
import { IconTrash } from './Icon';

export function TangentAngleCard({ constraint }: { constraint: TangentAngleConstraint }) {
  const items2d = useAppStore((state) => state.items2d);
  const update = useAppStore((state) => state.updateTangentAngleConstraint);
  const remove = useAppStore((state) => state.removeTangentAngleConstraint);
  const choices = buildTangentChoices(items2d);
  const sourceKey = tangentRefKey(constraint.source);
  const targetKey = tangentRefKey(constraint.target);
  const source = choices.find((choice) => tangentRefKey(choice) === sourceKey);
  const target = choices.find((choice) => tangentRefKey(choice) === targetKey);

  return (
    <article className="object-card tangent-angle-card" data-id={constraint.id}>
      <div className="card-head">
        <span className="card-kind tangent-card-kind">切线夹角</span>
        <button type="button" className="card-title-button" aria-expanded="true">
          <span className="card-summary">
            {source?.label ?? '源切线'} ↔ {target?.label ?? '目标切线'} · {constraint.angleDeg}°
          </span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除切线夹角约束"
            title="删除切线夹角约束"
            onClick={() => remove(constraint.id)}
          >
            <IconTrash size={17} />
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="setting-row column-setting">
          <div>
            <span className="setting-title">切线 A</span>
            <p className="setting-hint">拖动 A 或 B，另一条都会绕自身曲线旋转以保持夹角</p>
          </div>
          <select
            className="select-field"
            value={sourceKey}
            aria-label="选择源切线"
            onChange={(event) => {
              const choice = choices.find(
                (candidate) => tangentRefKey(candidate) === event.target.value,
              );
              if (!choice) return;
              update(constraint.id, {
                source: { ownerId: choice.ownerId, tangentId: choice.tangentId },
              });
            }}
          >
            {!source && <option value={sourceKey}>源切线已删除</option>}
            {choices
              .filter((choice) => tangentRefKey(choice) !== targetKey)
              .map((choice) => (
                <option key={tangentRefKey(choice)} value={tangentRefKey(choice)}>
                  {choice.label}
                </option>
              ))}
          </select>
        </div>

        <div className="setting-row column-setting">
          <div>
            <span className="setting-title">切线 B</span>
            <p className="setting-hint">
              目标切点会沿当前曲线分支连续移动，不会切换到另一条平行切线
            </p>
          </div>
          <select
            className="select-field"
            value={targetKey}
            aria-label="选择目标切线"
            onChange={(event) => {
              const choice = choices.find(
                (candidate) => tangentRefKey(candidate) === event.target.value,
              );
              if (!choice) return;
              update(constraint.id, {
                target: { ownerId: choice.ownerId, tangentId: choice.tangentId },
              });
            }}
          >
            {!target && <option value={targetKey}>目标切线已删除</option>}
            {choices
              .filter((choice) => tangentRefKey(choice) !== sourceKey)
              .map((choice) => (
                <option key={tangentRefKey(choice)} value={tangentRefKey(choice)}>
                  {choice.label}
                </option>
              ))}
          </select>
        </div>

        <div className="setting-row">
          <div>
            <span className="setting-title">相对夹角</span>
            <p className="setting-hint">90° 即垂直；两条垂直切线可画出蒙日圆轨迹</p>
          </div>
          <div className="inline-number">
            <NumberField
              value={constraint.angleDeg}
              onCommit={(value) => update(constraint.id, { angleDeg: value })}
              ariaLabel="切线相对夹角（度）"
              step={5}
            />
            <span className="inline-number-suffix">°</span>
          </div>
        </div>

        <button
          type="button"
          className="text-button"
          onClick={() =>
            update(constraint.id, {
              source: constraint.target,
              target: constraint.source,
            })
          }
        >
          交换源 / 目标切线
        </button>
      </div>
    </article>
  );
}
