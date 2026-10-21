import { useAppStore } from '../app/store';
import type { Geometry, LineShape, Orientation } from '../app/types';
import { buildCurveRefs } from '../app/curveRefs';
import { geometryEquation, geometryTitle } from '../core/geometry/equations';
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconTrash,
} from './Icon';
import { Formula } from './Formula';
import { NumberField } from './NumberField';
import { Switch } from './Switch';

function subtitleFor(shape: Geometry): string {
  if (shape.kind === 'line') {
    const count = Math.max(1, shape.divisionN - 1);
    return shape.showDivisions
      ? `${shape.extended ? '直线' : '线段'} · ${count} 个等分点`
      : `${shape.extended ? '直线' : '线段'} · 等分点已隐藏`;
  }
  return `${shape.tangents.length} 条切线`;
}

export function GeometryCard({ shape }: { shape: Geometry }) {
  const expanded = useAppStore((state) => state.expandedId === shape.id);
  const setExpandedId = useAppStore((state) => state.setExpandedId);
  const updateGeometry = useAppStore((state) => state.updateGeometry);
  const removeObject = useAppStore((state) => state.removeObject);
  const toggleVisible = useAppStore((state) => state.toggleVisible);
  const setObjectColor = useAppStore((state) => state.setObjectColor);
  const addTangent = useAppStore((state) => state.addTangent);
  const removeTangent = useAppStore((state) => state.removeTangent);
  const setLocusOwnerId = useAppStore((state) => state.setLocusOwnerId);
  const items2d = useAppStore((state) => state.items2d);
  const allGeometry = useAppStore((state) => state.geometry);
  const showToast = useAppStore((state) => state.showToast);

  const equation = geometryEquation(shape);
  const curveRefs = buildCurveRefs(items2d, allGeometry, shape.id);
  const toggleExpanded = () => setExpandedId(expanded ? null : shape.id);
  const isLine = shape.kind === 'line';

  return (
    <article className={`object-card geometry-card ${expanded ? 'is-expanded' : ''}`} data-id={shape.id}>
      <div className="card-head">
        <label
          className="color-swatch"
          style={{ backgroundColor: shape.color }}
          title="修改颜色"
          aria-label="修改颜色"
        >
          <input
            type="color"
            value={shape.color}
            onChange={(event) => setObjectColor(shape.id, event.target.value)}
          />
        </label>
        <button type="button" className="card-title-button" aria-expanded={expanded} onClick={toggleExpanded}>
          <span className="card-kind">{geometryTitle(shape.kind)}</span>
          <span className="card-summary">{shape.showEquation ? equation.plain : subtitleFor(shape)}</span>
        </button>
        <div className="card-actions">
          <button
            type="button"
            className="icon-button small-icon"
            aria-label={shape.visible ? '隐藏' : '显示'}
            title={shape.visible ? '隐藏' : '显示'}
            onClick={() => toggleVisible(shape.id)}
          >
            {shape.visible ? <IconEye size={17} /> : <IconEyeOff size={17} />}
          </button>
          <button
            type="button"
            className="icon-button small-icon danger-icon"
            aria-label="删除图形"
            title="删除图形"
            onClick={() => removeObject(shape.id)}
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
          <div className="setting-row">
            <div>
              <span className="setting-title">显示方程</span>
              <p className="setting-hint">在画布和卡片中显示当前方程</p>
            </div>
            <Switch
              checked={shape.showEquation}
              onChange={(checked) => updateGeometry(shape.id, { showEquation: checked })}
              label="显示方程"
            />
          </div>

          {shape.showEquation && (
            <div className="equation-preview">
              <Formula tex={equation.tex} display />
            </div>
          )}

          {!shape.showEquation && (
            <p className="hint-text">方程已隐藏，打开上面的开关即可查看。</p>
          )}

          {!isLine && (shape.kind === 'parabola' || shape.kind === 'hyperbola') && (
            <div className="orientation-row">
              <span className="setting-title">开口/方向</span>
              <div className="segmented small-segmented">
                <button
                  type="button"
                  className={shape.orientation === 'horizontal' ? 'is-active' : ''}
                  onClick={() =>
                    updateGeometry(shape.id, {
                      orientation: 'horizontal' as Orientation,
                    } as Partial<Geometry>)
                  }
                >
                  横向
                </button>
                <button
                  type="button"
                  className={shape.orientation === 'vertical' ? 'is-active' : ''}
                  onClick={() =>
                    updateGeometry(shape.id, {
                      orientation: 'vertical' as Orientation,
                    } as Partial<Geometry>)
                  }
                >
                  纵向
                </button>
              </div>
            </div>
          )}

          {isLine && <LineControls shape={shape as LineShape} curveRefs={curveRefs} />}

          {!isLine && (
            <div className="tangent-section">
              <div className="tangent-heading">
                <div>
                  <span className="setting-title">切线</span>
                  <p className="setting-hint">切点可在画布上拖动</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    addTangent(shape.id);
                    showToast('已添加切线，拖动切点调整位置');
                  }}
                >
                  ＋ 添加切线
                </button>
              </div>
              {shape.tangents.length > 0 && (
                <ul className="tangent-list">
                  {shape.tangents.map((tangent, index) => (
                    <li key={tangent.id} className="tangent-row">
                      <span className="tangent-index">切线 {index + 1}</span>
                      <span className="tangent-equation">
                        {tangent.meta?.equation ?? '拖动切点'}
                      </span>
                      <button
                        type="button"
                        className="icon-button small-icon danger-icon"
                        aria-label="删除切线"
                        onClick={() => removeTangent(shape.id, tangent.id)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isLine && (
            <button
              type="button"
              className="locus-button"
              disabled={!shape.driverCurveId}
              onClick={() => setLocusOwnerId(shape.id)}
            >
              <span>推导轨迹方程</span>
              <IconChevronRight size={16} />
            </button>
          )}
          {isLine && !shape.driverCurveId && (
            <p className="hint-text">先在下方“动点沿曲线运动”中选择一条曲线，再推导轨迹方程。</p>
          )}
        </div>
      )}
    </article>
  );
}

function LineControls({
  shape,
  curveRefs,
}: {
  shape: LineShape;
  curveRefs: ReturnType<typeof buildCurveRefs>;
}) {
  const updateGeometry = useAppStore((state) => state.updateGeometry);
  const selectedRef = curveRefs.find((ref) => ref.id === shape.driverCurveId);

  return (
    <>
      <div className="setting-row">
        <div>
          <span className="setting-title">两端延长为直线</span>
          <p className="setting-hint">关闭时显示 A、B 之间的线段</p>
        </div>
        <Switch
          checked={shape.extended}
          onChange={(checked) => updateGeometry(shape.id, { extended: checked })}
          label="延长为直线"
        />
      </div>

      <div className="setting-row">
        <div>
          <span className="setting-title">显示 n 等分点</span>
          <p className="setting-hint">默认隐藏；打开后在线段上标出等分点</p>
        </div>
        <Switch
          checked={shape.showDivisions}
          onChange={(checked) =>
            updateGeometry(shape.id, {
              showDivisions: checked,
              showTrace: checked ? shape.showTrace : false,
              traceClearToken: checked ? shape.traceClearToken : shape.traceClearToken + 1,
            })
          }
          label="显示等分点"
        />
      </div>

      <div className="setting-row">
        <div>
          <span className="setting-title">等分点数量</span>
          <p className="setting-hint">在 A、B 之间标出 n 等分点</p>
        </div>
        <div className="inline-number">
          <NumberField
            value={shape.divisionN}
            onCommit={(value) => {
              const n = Math.max(2, Math.min(20, Math.round(value)));
              updateGeometry(shape.id, { divisionN: n });
            }}
            ariaLabel="等分点数量 n"
            step={1}
          />
          <span className="inline-number-suffix">等分</span>
        </div>
      </div>

      {!shape.showDivisions && (
        <p className="hint-text">等分点已隐藏；打开上面的开关后才会在画布上显示。</p>
      )}

      <div className="setting-row">
        <div>
          <span className="setting-title">动点位置</span>
          <p className="setting-hint">另一端固定；移动端可拖动端点观察</p>
        </div>
        <div className="segmented small-segmented">
          <button
            type="button"
            className={shape.movingEndpoint === 'A' ? 'is-active' : ''}
            onClick={() => updateGeometry(shape.id, { movingEndpoint: 'A' })}
          >
            A 动
          </button>
          <button
            type="button"
            className={shape.movingEndpoint === 'B' ? 'is-active' : ''}
            onClick={() => updateGeometry(shape.id, { movingEndpoint: 'B' })}
          >
            B 动
          </button>
        </div>
      </div>

      <div className="setting-row column-setting">
        <div>
          <span className="setting-title">动点沿曲线运动</span>
          <p className="setting-hint">绑定后可以播放动画并留下轨迹</p>
        </div>
        <select
          className="select-field"
          value={shape.driverCurveId ?? ''}
          aria-label="选择动点所在的曲线"
          onChange={(event) => {
            const value = event.target.value || null;
            updateGeometry(shape.id, {
              driverCurveId: value,
              driverPoint: null,
              driverPlaying: false,
            });
          }}
        >
          <option value="">自由拖动</option>
          {curveRefs.map((ref) => (
            <option key={ref.id} value={ref.id}>
              {ref.label}
            </option>
          ))}
          {shape.driverCurveId && !selectedRef && (
            <option value={shape.driverCurveId}>曲线已删除</option>
          )}
        </select>
        {shape.driverCurveId && (
          <div className="driver-actions">
            <button
              type="button"
              className="text-button"
              onClick={() =>
                updateGeometry(shape.id, { driverPlaying: !shape.driverPlaying })
              }
            >
              {shape.driverPlaying ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                updateGeometry(shape.id, {
                  traceClearToken: shape.traceClearToken + 1,
                  showTrace: false,
                })
              }
            >
              清除轨迹
            </button>
          </div>
        )}
      </div>

      {!shape.driverCurveId && (
        <p className="hint-text">
          拖动{shape.movingEndpoint === 'A' ? 'A' : 'B'}点时，等分点会实时更新；绑定曲线后可播放并推导轨迹方程。
        </p>
      )}

      <div className="setting-row">
        <div>
          <span className="setting-title">记录等分点轨迹</span>
          <p className="setting-hint">
            {shape.showDivisions
              ? '拖动或播放时显示等分点留下的轨迹'
              : '先打开“显示 n 等分点”才能记录轨迹'}
          </p>
        </div>
        <Switch
          checked={shape.showTrace}
          onChange={(checked) =>
            updateGeometry(shape.id, {
              showTrace: checked,
              traceClearToken: checked ? shape.traceClearToken : shape.traceClearToken + 1,
            })
          }
          label="记录等分点轨迹"
          disabled={!shape.showDivisions}
        />
      </div>
    </>
  );
}
