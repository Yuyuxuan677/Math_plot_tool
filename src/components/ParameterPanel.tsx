import { useMemo } from 'react';
import { useAppStore } from '../app/store';
import { collect2DParams } from '../core/plot2d/analysis';
import { collect3DParams } from '../core/plot2d/analysis';

function sliderRange(value: number): { min: number; max: number } {
  if (!Number.isFinite(value)) return { min: -10, max: 10 };
  const magnitude = Math.max(10, Math.abs(value) * 1.4);
  return { min: -magnitude, max: magnitude };
}

export function ParameterPanel() {
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const paramValues = useAppStore((state) => state.paramValues);
  const setParamValue = useAppStore((state) => state.setParamValue);

  const params = useMemo(() => {
    const names = new Set<string>();
    for (const name of collect2DParams(items2d)) names.add(name);
    for (const name of collect3DParams(items3d)) names.add(name);
    return [...names].sort();
  }, [items2d, items3d]);

  if (params.length === 0) return null;

  return (
    <section className="panel-section parameters-section" aria-label="参数">
      <div className="section-heading">
        <h3>参数</h3>
        <span className="section-count">{params.length}</span>
      </div>
      <div className="parameter-list">
        {params.map((name) => {
          const raw = paramValues[name] ?? '1';
          const numeric = Number(raw);
          const valid = raw.trim() !== '' && Number.isFinite(numeric);
          const sliderValue = valid ? numeric : 1;
          const range = sliderRange(sliderValue);
          return (
            <div className={`parameter-row ${valid ? '' : 'has-error'}`} key={name}>
              <label className="parameter-name" htmlFor={`param-${name}`}>
                {name}
              </label>
              <input
                id={`param-${name}`}
                className="parameter-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={raw}
                aria-label={`参数 ${name} 的数值`}
                onChange={(event) => setParamValue(name, event.target.value)}
              />
              <input
                className="parameter-slider"
                type="range"
                min={range.min}
                max={range.max}
                step={0.01}
                value={sliderValue}
                aria-label={`拖动参数 ${name}`}
                onChange={(event) =>
                  setParamValue(name, String(Number(Number(event.target.value).toFixed(3))))
                }
              />
              {!valid && <p className="field-error">请输入一个数字</p>}
            </div>
          );
        })}
      </div>
      <p className="section-note">每个输入框最多 3 个参数；同名参数共享数值。</p>
    </section>
  );
}
