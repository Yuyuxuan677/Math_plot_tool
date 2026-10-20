import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../app/store';
import type { LineShape } from '../app/types';
import {
  deriveLocus,
  locusKindLabel,
} from '../core/locus/deriveLocus';
import { geometryTitle } from '../core/geometry/equations';
import { Formula } from './Formula';
import { IconClose } from './Icon';

export function LocusDialog() {
  const ownerId = useAppStore((state) => state.locusOwnerId);
  const setOwnerId = useAppStore((state) => state.setLocusOwnerId);
  const geometry = useAppStore((state) => state.geometry);
  const items2d = useAppStore((state) => state.items2d);
  const paramValues = useAppStore((state) => state.paramValues);

  const owner = geometry.find((shape) => shape.id === ownerId);
  const line = owner?.kind === 'line' ? (owner as LineShape) : null;
  const maxK = line ? Math.max(1, Math.floor(line.divisionN) - 1) : 1;
  const [k, setK] = useState(1);

  useEffect(() => {
    if (!ownerId) return;
    setK((current) => Math.max(1, Math.min(maxK, current)));
  }, [ownerId, maxK]);

  const driver = useMemo(() => {
    if (!line?.driverCurveId) return null;
    return (
      items2d.find((item) => item.id === line.driverCurveId) ??
      geometry.find((shape) => shape.id === line.driverCurveId) ??
      null
    );
  }, [line?.driverCurveId, items2d, geometry]);

  const result = useMemo(() => {
    if (!line) return null;
    return deriveLocus({ line, driver, k, paramValues });
  }, [line, driver, k, paramValues]);

  if (!ownerId || !line) return null;

  const close = () => setOwnerId(null);
  const driverLabel = driver
    ? 'xExpr' in driver
      ? driver.kind === 'parametric'
        ? '参数曲线'
        : '参数曲面'
      : 'expr' in driver
        ? driver.kind === 'implicit'
          ? '隐式方程'
          : '函数'
        : 'kind' in driver
          ? geometryTitle(driver.kind)
          : '曲线'
    : '未选择';

  return (
    <div className="overlay-layer dialog-overlay" role="presentation" onClick={close}>
      <div
        className="dialog-card locus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locus-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">轨迹方程</p>
            <h2 id="locus-title">第 k 个等分点的轨迹</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭轨迹方程" onClick={close}>
            <IconClose />
          </button>
        </div>

        <div className="dialog-scroll locus-scroll">
          <div className="locus-summary">
            <span>固定端点 Q</span>
            <strong>{line.movingEndpoint === 'B' ? 'A' : 'B'}</strong>
            <span className="locus-sep">·</span>
            <span>动点</span>
            <strong>{line.movingEndpoint}</strong>
            <span className="locus-sep">·</span>
            <span>驱动</span>
            <strong>{driverLabel}</strong>
          </div>

          <div className="locus-k-picker">
            <span className="setting-title">选择等分点</span>
            {maxK <= 8 ? (
              <div className="locus-k-chips">
                {Array.from({ length: maxK }, (_, index) => index + 1).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={value === k ? 'is-active' : ''}
                    onClick={() => setK(value)}
                  >
                    P{value}
                  </button>
                ))}
              </div>
            ) : (
              <select
                className="select-field locus-select"
                value={k}
                aria-label="选择第几个等分点"
                onChange={(event) => setK(Number(event.target.value))}
              >
                {Array.from({ length: maxK }, (_, index) => index + 1).map((value) => (
                  <option value={value} key={value}>
                    P{value}（λ = {value}/{line.divisionN}）
                  </option>
                ))}
              </select>
            )}
          </div>

          {!result ? null : result.ok ? (
            <>
              <div className="locus-result">
                <div className="locus-result-head">
                  <span className="locus-kind">{locusKindLabel(result.kind)}</span>
                  <span className="locus-point-label">P{k}</span>
                </div>
                <div className="locus-equation">
                  <Formula tex={result.equationTex} display />
                </div>
                {result.note && <p className="setting-hint">{result.note}</p>}
              </div>

              <div className="locus-steps">
                <h3>推导步骤</h3>
                {result.steps.map((step, index) => (
                  <div className="locus-step" key={`${step.title}-${index}`}>
                    <span className="locus-step-index">{index + 1}</span>
                    <div>
                      <p className="locus-step-title">{step.title}</p>
                      <div className="locus-step-formula">
                        <Formula tex={step.tex} display />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="locus-note">
                方程随固定端点、参数和驱动曲线实时更新。参数曲线的轨迹以参数方程表示。
              </p>
            </>
          ) : (
            <div className="locus-error">
              <p>{result.error ?? '暂时无法推导轨迹方程'}</p>
              <p className="setting-hint">
                请确认动点已绑定到曲线，且第 k 个等分点存在。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
