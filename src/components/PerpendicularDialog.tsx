import { useAppStore } from '../app/store';
import { buildPerpendicularLineOptions } from '../app/lineRefs';

export function PerpendicularDialog() {
  const draft = useAppStore((state) => state.perpendicularDraft);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const items2d = useAppStore((state) => state.items2d);
  const markerLines = useAppStore((state) => state.markerLines);
  const paramValues = useAppStore((state) => state.paramValues);
  const perpendiculars = useAppStore((state) => state.perpendiculars);
  const setDraft = useAppStore((state) => state.setPerpendicularDraft);
  const cancel = useAppStore((state) => state.cancelPerpendicular);
  const create = useAppStore((state) => state.addPerpendicular);
  if (!draft) return null;
  const lines = buildPerpendicularLineOptions(
    items2d,
    markerLines,
    markedPoints,
    paramValues,
    perpendiculars,
  );
  const ready = !!draft.pointId && !!draft.lineId;

  return (
    <div className="overlay-layer dialog-overlay" role="presentation" onClick={cancel}>
      <div
        className="dialog-card perpendicular-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perpendicular-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">过点作垂线</p>
            <h2 id="perpendicular-dialog-title">选择标记点和直线</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={cancel}>
            ×
          </button>
        </div>
        <div className="dialog-scroll">
          <p className="setting-hint">
            垂线会经过所选标记点并垂直于所选直线，垂足自动成为标记点。
          </p>
          <div className="setting-row column-setting">
            <span className="setting-title">经过的标记点</span>
            <select
              className="select-field"
              value={draft.pointId}
              aria-label="选择垂线经过的标记点"
              onChange={(event) => setDraft({ pointId: event.target.value })}
            >
              <option value="">请选择标记点</option>
              {markedPoints.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}（{point.point.x.toFixed(2)}, {point.point.y.toFixed(2)}）
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <span className="setting-title">垂直的直线</span>
            <select
              className="select-field"
              value={draft.lineId}
              aria-label="选择垂直的直线"
              onChange={(event) => setDraft({ lineId: event.target.value })}
            >
              <option value="">请选择直线</option>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.label}
                </option>
              ))}
            </select>
          </div>
          <p className="hint-text">
            可选坐标轴、两点连线、切线，以及可以识别为直线的函数/隐式方程。
          </p>
        </div>
        <div className="dialog-footer">
          <button type="button" className="secondary-small-button" onClick={cancel}>
            取消
          </button>
          <button
            type="button"
            className="primary-small-button"
            disabled={!ready}
            onClick={() => {
              if (ready) create(draft.pointId, draft.lineId);
            }}
          >
            创建垂线
          </button>
        </div>
      </div>
    </div>
  );
}
