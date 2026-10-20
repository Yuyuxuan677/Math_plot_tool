import { useMemo } from 'react';
import { useAppStore } from '../app/store';
import type { Item2D } from '../app/types';
import { analyze2DItem, type ExplicitAnalysis } from '../core/plot2d/analysis';
import { Formula } from './Formula';
import {
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { NumberField } from './NumberField';
import { Switch } from './Switch';

function kindLabel(kind: Item2D['kind']): string {
  if (kind === 'explicit') return '函数';
  if (kind === 'parametric') return '参数曲线';
  return '隐式方程';
}

function summaryFor(item: Item2D): string {
  if (item.kind === 'explicit') return `y = ${item.expr || '…'}`;
  if (item.kind === 'parametric') return `x=${item.xExpr || '…'}, y=${item.yExpr || '…'}`;
  return item.expr || '…';
}

export interface ExpressionCardProps {
  item: Item2D;
}

export function ExpressionCard({ item }: ExpressionCardProps) {
  const expanded = useAppStore((state) => state.expandedId === item.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const updateItem2D = useAppStore((state) => state.updateItem2D);
  const removeObject = useAppStore((state) => state.removeObject);
  const toggleVisible = useAppStore((state) => state.toggleVisible);
  const setObjectColor = useAppStore((state) => state.setObjectColor);
  const addTangent = useAppStore((state) => state.addTangent);
  const removeTangent = useAppStore((state) => state.removeTangent);
  const showToast = useAppStore((state) => state.showToast);

  const analysis = useMemo(() => analyze2DItem(item), [item]);
  const explicitAnalysis = item.kind === 'explicit' ? (analysis as ExplicitAnalysis) : null;
  const hasError = analysis.errors.length > 0;
  const tangentDisabled = hasError;

  const fieldError = (field: string) =>
    analysis.errors.find((error) => error.field === field)?.message;

  const toggleExpanded = () => {
    setExpandedId(expanded ? null : item.id);
  };

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

        <button
          type="button"
          className="card-title-button"
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
          <span className="card-kind">
            {kindLabel(item.kind)}
            {hasError && <span className="error-dot" aria-label="有错误" />}
          </span>
          <span className="card-summary">{summaryFor(item) || '点击输入表达式'}</span>
        </button>

        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={item.visible ? '隐藏' : '显示'}
            title={item.visible ? '隐藏' : '显示'}
            onClick={() => toggleVisible(item.id)}
          >
            {item.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除"
            title="删除"
            onClick={() => removeObject(item.id)}
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
          {item.kind === 'explicit' && (
            <>
              <label className="field-label" htmlFor={`expr-${item.id}`}>
                函数表达式
              </label>
              <div className={`field-row ${fieldError('expr') ? 'has-error' : ''}`}>
                <span className="field-prefix">y =</span>
                <input
                  id={`expr-${item.id}`}
                  className="expression-input"
                  type="text"
                  value={item.expr}
                  placeholder="例如 x^2、sin(x)、a*x + b"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem2D(item.id, { expr: event.target.value })}
                />
              </div>
              {fieldError('expr') && <p className="field-error">{fieldError('expr')}</p>}

              <div className="setting-row">
                <div>
                  <span className="setting-title">显示导函数</span>
                  <p className="setting-hint">同色虚线绘制 f′(x)</p>
                </div>
                <Switch
                  checked={item.showDerivative}
                  onChange={(checked) => updateItem2D(item.id, { showDerivative: checked })}
                  label="显示导函数"
                />
              </div>

              {item.showDerivative && (
                <div className="derivative-box">
                  {explicitAnalysis?.derivative?.ok ? (
                    explicitAnalysis.derivative.numeric ? (
                      <p className="hint-text">该函数暂不支持符号求导，图中使用数值导数。</p>
                    ) : explicitAnalysis.derivative.tex ? (
                      <div className="derivative-formula">
                        <span className="math-caption">f′(x) =</span>
                        <Formula tex={explicitAnalysis.derivative.tex} />
                      </div>
                    ) : null
                  ) : (
                    <p className="field-error">
                      {explicitAnalysis?.derivative && !explicitAnalysis.derivative.ok
                        ? explicitAnalysis.derivative.error
                        : '暂时无法计算导数'}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {item.kind === 'parametric' && (
            <>
              <label className="field-label">参数曲线</label>
              <div className={`field-row ${fieldError('xExpr') ? 'has-error' : ''}`}>
                <span className="field-prefix">x(t) =</span>
                <input
                  className="expression-input"
                  type="text"
                  value={item.xExpr}
                  placeholder="cos(t)"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem2D(item.id, { xExpr: event.target.value })}
                />
              </div>
              {fieldError('xExpr') && <p className="field-error">{fieldError('xExpr')}</p>}
              <div className={`field-row ${fieldError('yExpr') ? 'has-error' : ''}`}>
                <span className="field-prefix">y(t) =</span>
                <input
                  className="expression-input"
                  type="text"
                  value={item.yExpr}
                  placeholder="sin(t)"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem2D(item.id, { yExpr: event.target.value })}
                />
              </div>
              {fieldError('yExpr') && <p className="field-error">{fieldError('yExpr')}</p>}

              <label className="field-label range-label">t 的范围</label>
              <div className="range-row">
                <NumberField
                  value={item.tMin}
                  onCommit={(value) => updateItem2D(item.id, { tMin: value })}
                  ariaLabel="t 的最小值"
                />
                <span className="range-separator">到</span>
                <NumberField
                  value={item.tMax}
                  onCommit={(value) => updateItem2D(item.id, { tMax: value })}
                  ariaLabel="t 的最大值"
                />
              </div>
              {item.tMax <= item.tMin && (
                <p className="field-error">t 的最大值需要大于最小值</p>
              )}
            </>
          )}

          {item.kind === 'implicit' && (
            <>
              <label className="field-label" htmlFor={`expr-${item.id}`}>
                方程
              </label>
              <div className={`field-row ${fieldError('expr') ? 'has-error' : ''}`}>
                <input
                  id={`expr-${item.id}`}
                  className="expression-input"
                  type="text"
                  value={item.expr}
                  placeholder="例如 x^2 + y^2 = 4"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => updateItem2D(item.id, { expr: event.target.value })}
                />
              </div>
              {fieldError('expr') && <p className="field-error">{fieldError('expr')}</p>}
              <p className="setting-hint">可直接输入带等号的方程，或输入 F(x,y)。</p>
            </>
          )}

          <div className="tangent-section">
            <div className="tangent-heading">
              <div>
                <span className="setting-title">切线</span>
                <p className="setting-hint">切点可在画布上拖动</p>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={tangentDisabled}
                onClick={() => {
                  if (tangentDisabled) return;
                  addTangent(item.id);
                  showToast('已添加切线，拖动切点调整位置');
                }}
              >
                ＋ 添加切线
              </button>
            </div>
            {item.tangents.length > 0 && (
              <ul className="tangent-list">
                {item.tangents.map((tangent, index) => (
                  <li key={tangent.id} className="tangent-row">
                    <span className="tangent-index">切线 {index + 1}</span>
                    <span className="tangent-equation">
                      {tangent.meta?.equation ?? '拖动切点'}
                    </span>
                    <button
                      type="button"
                      className="icon-button small-icon danger-icon"
                      aria-label="删除切线"
                      onClick={() => removeTangent(item.id, tangent.id)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
