import { useAppStore } from '../app/store';

export function MarkerLineDialog() {
  const draft = useAppStore((state) => state.markerLineDraft);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const setDraft = useAppStore((state) => state.setMarkerLineDraft);
  const cancel = useAppStore((state) => state.cancelMarkerLine);
  const create = useAppStore((state) => state.addMarkerLine);

  if (!draft) return null;
  const ready = !!draft.aId && !!draft.bId && draft.aId !== draft.bId;

  return (
    <div className="overlay-layer dialog-overlay" role="presentation" onClick={cancel}>
      <div
        className="dialog-card marker-line-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="marker-line-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">两点连线</p>
            <h2 id="marker-line-dialog-title">选择两个标记点</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={cancel}>
            ×
          </button>
        </div>
        <div className="dialog-scroll">
          <p className="setting-hint">
            先手动选择起点和终点；创建后直线会随两个标记点移动。
          </p>
          <div className="setting-row column-setting">
            <span className="setting-title">起点</span>
            <select
              className="select-field"
              value={draft.aId}
              aria-label="选择连线起点"
              onChange={(event) => setDraft({ aId: event.target.value })}
            >
              <option value="">请选择起点</option>
              {markedPoints
                .filter((point) => point.id !== draft.bId)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}（{point.point.x.toFixed(2)}, {point.point.y.toFixed(2)}）
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <span className="setting-title">终点</span>
            <select
              className="select-field"
              value={draft.bId}
              aria-label="选择连线终点"
              onChange={(event) => setDraft({ bId: event.target.value })}
            >
              <option value="">请选择终点</option>
              {markedPoints
                .filter((point) => point.id !== draft.aId)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name}（{point.point.x.toFixed(2)}, {point.point.y.toFixed(2)}）
                  </option>
                ))}
            </select>
          </div>
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
              if (ready) create(draft.aId, draft.bId);
            }}
          >
            创建连线
          </button>
        </div>
      </div>
    </div>
  );
}
