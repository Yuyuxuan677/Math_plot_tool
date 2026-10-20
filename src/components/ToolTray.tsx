import { useAppStore } from '../app/store';
import type { Tool } from '../app/types';
import {
  IconCircle,
  IconClose,
  IconEllipse,
  IconHyperbola,
  IconLine,
  IconMagnet,
  IconParabola,
  IconSelect,
} from './Icon';

const TOOLS: Array<{ tool: Tool; label: string; icon: typeof IconLine }> = [
  { tool: 'select', label: '选择', icon: IconSelect },
  { tool: 'line', label: '直线', icon: IconLine },
  { tool: 'circle', label: '圆', icon: IconCircle },
  { tool: 'ellipse', label: '椭圆', icon: IconEllipse },
  { tool: 'parabola', label: '抛物线', icon: IconParabola },
  { tool: 'hyperbola', label: '双曲线', icon: IconHyperbola },
];

export function ToolTray() {
  const open = useAppStore((state) => state.toolTrayOpen);
  const setOpen = useAppStore((state) => state.setToolTrayOpen);
  const activeTool = useAppStore((state) => state.activeTool);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const setSheetExpanded = useAppStore((state) => state.setSheetExpanded);
  const snapToGrid = useAppStore((state) => state.snapToGrid);
  const setSnapToGrid = useAppStore((state) => state.setSnapToGrid);

  if (!open) return null;

  const chooseTool = (tool: Tool) => {
    setActiveTool(tool);
    setOpen(false);
    setSheetExpanded(false);
  };

  return (
    <div className="overlay-layer tool-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="tool-tray"
        role="dialog"
        aria-modal="true"
        aria-label="手绘工具"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="action-sheet-head">
          <div>
            <h2>画图</h2>
            <p className="tool-tray-sub">选一个图形，在画布上点两下</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭工具盘"
            onClick={() => setOpen(false)}
          >
            <IconClose />
          </button>
        </div>
        <div className="tool-grid">
          {TOOLS.map(({ tool, label, icon: Icon }) => (
            <button
              type="button"
              key={tool}
              className={`tool-grid-button ${activeTool === tool ? 'is-active' : ''}`}
              onClick={() => chooseTool(tool)}
            >
              <Icon size={24} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="tool-tray-footer">
          <button
            type="button"
            className={`snap-toggle ${snapToGrid ? 'is-on' : ''}`}
            aria-pressed={snapToGrid}
            onClick={() => setSnapToGrid(!snapToGrid)}
          >
            <IconMagnet size={18} />
            <span>网格吸附 {snapToGrid ? '开' : '关'}</span>
          </button>
          <p>拖动锚点可继续调整图形。</p>
        </div>
      </div>
    </div>
  );
}
