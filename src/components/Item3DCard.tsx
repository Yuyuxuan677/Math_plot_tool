import { useMemo } from 'react';
import { useAppStore } from '../app/store';
import type { Item3D } from '../app/types';
import { analyze3DItem } from '../core/plot2d/analysis';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { NumberField } from './NumberField';

function kindLabel(kind: Item3D['kind']): string {
  if (kind === 'surface') return '曲面';
  if (kind === 'paramSurface') return '参数曲面';
  if (kind === 'implicit3d') return '隐式曲面';
  return '空间曲线';
}

function summaryFor(item: Item3D): string {
  if (item.kind === 'surface') return `z = ${item.expr}`;
  if (item.kind === 'paramSurface') return `(${item.xExpr}, ${item.yExpr}, ${item.zExpr})`;
  if (item.kind === 'implicit3d') return item.expr || 'F(x,y,z) = 0';
  return `(${item.xExpr}, ${item.yExpr}, ${item.zExpr})`;
}

export function Item3DCard({ item }: { item: Item3D }) {
  const expanded = useAppStore((state) => state.expandedId === item.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const updateItem3D = useAppStore((state) => state.updateItem3D);
  const removeObject = useAppStore((state) => state.removeObject);
  const toggleVisible = useAppStore((state) => state.toggleVisible);
  const setObjectColor = useAppStore((state) => state.setObjectColor);

  const analysis = useMemo(() => analyze3DItem(item), [item]);
  const hasError = analysis.errors.length > 0;
  const fieldError = (field: string) =>
    analysis.errors.find((error) => error.field === field)?.message;
  const toggleExpanded = () => setExpandedId(expanded ? null : item.id);

  return (
    <article
      className={`object-card ${expanded ? 'is-expanded' : ''} ${hasError ? 'has-error' : ''}`}
      data-kind={item.kind}
      data-id={item.id}
    >
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: item.color }}
          title="修改颜色"
          aria-label="修改颜色"
        >
          <input
            type="color"
            value={item.color}
            onChange={(event) => setObjectColor(item.id, event.target.value)}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">
            {kindLabel(item.kind)}
            {hasError && <span className="error-dot" aria-label="有错误" />}
          </span>
          <span className="card-summary">{summaryFor(item)}</span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={item.visible ? '隐藏' : '显示'}
            onClick={() => toggleVisible(item.id)}
          >
            {item.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除"
            onClick={() => removeObject(item.id)}
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
          {item.kind === 'surface' && (
            <>
              <label className="field-label">显式曲面</label>
              <div className={`field-row ${fieldError('expr') ? 'has-error' : ''}`}>
                <span className="field-prefix">z =</span>
                <input
                  className="expression-input"
                  type="text"
                  value={item.expr}
                  placeholder="x^2 - y^2"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem3D(item.id, { expr: event.target.value })}
                />
              </div>
              {fieldError('expr') && <p className="field-error">{fieldError('expr')}</p>}
              <div className="setting-heading">x 范围</div>
              <div className="range-row">
                <NumberField
                  value={item.xMin}
                  onCommit={(value) => updateItem3D(item.id, { xMin: value })}
                  ariaLabel="x 最小值"
                  step={0.5}
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.xMax}
                  onCommit={(value) => updateItem3D(item.id, { xMax: value })}
                  ariaLabel="x 最大值"
                  step={0.5}
                />
              </div>
              <div className="setting-heading">y 范围</div>
              <div className="range-row">
                <NumberField
                  value={item.yMin}
                  onCommit={(value) => updateItem3D(item.id, { yMin: value })}
                  ariaLabel="y 最小值"
                  step={0.5}
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.yMax}
                  onCommit={(value) => updateItem3D(item.id, { yMax: value })}
                  ariaLabel="y 最大值"
                  step={0.5}
                />
              </div>
              {item.xMax <= item.xMin || item.yMax <= item.yMin ? (
                <p className="field-error">范围的最大值需要大于最小值</p>
              ) : null}
              <div className="setting-row">
                <span className="setting-title">网格精度</span>
                <NumberField
                  value={item.resolution}
                  onCommit={(value) =>
                    updateItem3D(item.id, {
                      resolution: Math.max(12, Math.min(100, Math.round(value))),
                    })
                  }
                  ariaLabel="曲面网格精度"
                  step={2}
                />
              </div>
            </>
          )}

          {item.kind === 'paramSurface' && (
            <>
              <label className="field-label">参数曲面</label>
              {(['xExpr', 'yExpr', 'zExpr'] as const).map((field) => (
                <div key={field}>
                  <div className={`field-row ${fieldError(field) ? 'has-error' : ''}`}>
                    <span className="field-prefix">
                      {field === 'xExpr' ? 'x(u,v) =' : field === 'yExpr' ? 'y(u,v) =' : 'z(u,v) ='}
                    </span>
                    <input
                      className="expression-input"
                      type="text"
                      value={item[field]}
                      placeholder={field === 'xExpr' ? 'cos(u)*sin(v)' : field === 'yExpr' ? 'sin(u)*sin(v)' : 'cos(v)'}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(event) => updateItem3D(item.id, { [field]: event.target.value })}
                    />
                  </div>
                  {fieldError(field) && <p className="field-error">{fieldError(field)}</p>}
                </div>
              ))}
              <div className="setting-heading">u 范围</div>
              <div className="range-row">
                <NumberField
                  value={item.uMin}
                  onCommit={(value) => updateItem3D(item.id, { uMin: value })}
                  ariaLabel="u 最小值"
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.uMax}
                  onCommit={(value) => updateItem3D(item.id, { uMax: value })}
                  ariaLabel="u 最大值"
                />
              </div>
              <div className="setting-heading">v 范围</div>
              <div className="range-row">
                <NumberField
                  value={item.vMin}
                  onCommit={(value) => updateItem3D(item.id, { vMin: value })}
                  ariaLabel="v 最小值"
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.vMax}
                  onCommit={(value) => updateItem3D(item.id, { vMax: value })}
                  ariaLabel="v 最大值"
                />
              </div>
              <div className="setting-row">
                <span className="setting-title">网格精度</span>
                <NumberField
                  value={item.resolution}
                  onCommit={(value) =>
                    updateItem3D(item.id, {
                      resolution: Math.max(12, Math.min(100, Math.round(value))),
                    })
                  }
                  ariaLabel="参数曲面网格精度"
                  step={2}
                />
              </div>
            </>
          )}

          {item.kind === 'implicit3d' && (
            <>
              <label className="field-label">隐式方程</label>
              <div className={`field-row ${fieldError('expr') ? 'has-error' : ''}`}>
                <input
                  className="expression-input"
                  type="text"
                  value={item.expr}
                  placeholder="例如 x + y + z - 1 = 0 或 x^2+y^2+z^2=4"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem3D(item.id, { expr: event.target.value })}
                />
              </div>
              {fieldError('expr') && <p className="field-error">{fieldError('expr')}</p>}
              <p className="setting-hint">输入 F(x,y,z)=0 或带等号的方程；3D 最多支持 4 个参数。</p>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div key={axis}>
                  <div className="setting-heading">{axis} 范围</div>
                  <div className="range-row">
                    <NumberField
                      value={item[`${axis}Min` as 'xMin' | 'yMin' | 'zMin']}
                      onCommit={(value) =>
                        updateItem3D(item.id, {
                          [`${axis}Min`]: value,
                        } as Partial<Item3D>)
                      }
                      ariaLabel={`${axis} 最小值`}
                      step={0.5}
                    />
                    <span className="range-separator">到</span>
                    <NumberField
                      value={item[`${axis}Max` as 'xMax' | 'yMax' | 'zMax']}
                      onCommit={(value) =>
                        updateItem3D(item.id, {
                          [`${axis}Max`]: value,
                        } as Partial<Item3D>)
                      }
                      ariaLabel={`${axis} 最大值`}
                      step={0.5}
                    />
                  </div>
                </div>
              ))}
              <div className="setting-row">
                <span className="setting-title">网格精度</span>
                <NumberField
                  value={item.resolution}
                  onCommit={(value) =>
                    updateItem3D(item.id, {
                      resolution: Math.max(12, Math.min(56, Math.round(value))),
                    })
                  }
                  ariaLabel="隐式曲面网格精度"
                  step={2}
                />
              </div>
            </>
          )}

          {item.kind === 'curve3d' && (
            <>
              <label className="field-label">空间曲线</label>
              {(['xExpr', 'yExpr', 'zExpr'] as const).map((field) => (
                <div key={field}>
                  <div className={`field-row ${fieldError(field) ? 'has-error' : ''}`}>
                    <span className="field-prefix">
                      {field === 'xExpr' ? 'x(t) =' : field === 'yExpr' ? 'y(t) =' : 'z(t) ='}
                    </span>
                    <input
                      className="expression-input"
                      type="text"
                      value={item[field]}
                      placeholder={field === 'xExpr' ? 'cos(t)' : field === 'yExpr' ? 'sin(t)' : 't/3'}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(event) => updateItem3D(item.id, { [field]: event.target.value })}
                    />
                  </div>
                  {fieldError(field) && <p className="field-error">{fieldError(field)}</p>}
                </div>
              ))}
              <div className="setting-heading">t 范围</div>
              <div className="range-row">
                <NumberField
                  value={item.tMin}
                  onCommit={(value) => updateItem3D(item.id, { tMin: value })}
                  ariaLabel="t 最小值"
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.tMax}
                  onCommit={(value) => updateItem3D(item.id, { tMax: value })}
                  ariaLabel="t 最大值"
                />
              </div>
              <div className="setting-row">
                <span className="setting-title">采样点数</span>
                <NumberField
                  value={item.resolution}
                  onCommit={(value) =>
                    updateItem3D(item.id, {
                      resolution: Math.max(80, Math.min(2000, Math.round(value))),
                    })
                  }
                  ariaLabel="空间曲线采样点数"
                  step={50}
                />
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
