import { useAppStore } from '../app/store';
import { buildIntersectionObjects } from '../app/intersectionRefs';

export function IntersectionDialog() {
  const draft = useAppStore((state) => state.intersectionDraft);
  const items2d = useAppStore((state) => state.items2d);
  const markerLines = useAppStore((state) => state.markerLines);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const setDraft = useAppStore((state) => state.setIntersectionDraft);
  const cancel = useAppStore((state) => state.cancelIntersection);
  const create = useAppStore((state) => state.addIntersection);

  if (!draft) return null;
  const objects = buildIntersectionObjects(items2d, markerLines, markedPoints);
  const ready = !!draft.aId && !!draft.bId && draft.aId !== draft.bId;

  return (
    <div className="overlay-layer dialog-overlay" role="presentation" onClick={cancel}>
      <div
        className="dialog-card intersection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intersection-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">构建交点</p>
            <h2 id="intersection-dialog-title">选择两个对象</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={cancel}>
            ×
          </button>
        </div>
        <div className="dialog-scroll">
          <p className="setting-hint">
            可以选择函数/参数/隐式曲线、切线、已有两点连线，也可以选择 x 轴或 y 轴。
          </p>
          <div className="setting-row column-setting">
            <span className="setting-title">第一个对象</span>
            <select
              className="select-field"
              value={draft.aId}
              aria-label="选择第一个对象"
              onChange={(event) => setDraft({ aId: event.target.value })}
            >
              <option value="">请选择第一个对象</option>
              {objects
                .filter((object) => object.id !== draft.bId)
                .map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="setting-row column-setting">
            <span className="setting-title">第二个对象</span>
            <select
              className="select-field"
              value={draft.bId}
              aria-label="选择第二个对象"
              onChange={(event) => setDraft({ bId: event.target.value })}
            >
              <option value="">请选择第二个对象</option>
              {objects
                .filter((object) => object.id !== draft.aId)
                .map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.label}
                  </option>
                ))}
            </select>
          </div>
          <p className="hint-text">
            创建后两个对象的所有实际交点都会显示，并自动成为标记点；可在交点卡片中记录轨迹。
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
              if (ready) create(draft.aId, draft.bId);
            }}
          >
            创建交点
          </button>
        </div>
      </div>
    </div>
  );
}
