import { useAppStore } from '../app/store';
import { IconHelp } from './Icon';

export function TopBar() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const setHelpOpen = useAppStore((state) => state.setHelpOpen);

  return (
    <header className="topbar">
      <div className="brand" aria-label="简图">
        <span className="brand-mark" aria-hidden="true">
          ∿
        </span>
        <span className="brand-name">简图</span>
        <span className="brand-sub">数学画板</span>
      </div>

      <div className="mode-switch" role="tablist" aria-label="切换维度">
        <button
          type="button"
          role="tab"
          aria-selected={mode === '2d'}
          className={mode === '2d' ? 'mode-option is-active' : 'mode-option'}
          onClick={() => setMode('2d')}
        >
          <span className="mode-long">2D 平面</span>
          <span className="mode-short">平面</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === '3d'}
          className={mode === '3d' ? 'mode-option is-active' : 'mode-option'}
          onClick={() => setMode('3d')}
        >
          <span className="mode-long">3D 空间</span>
          <span className="mode-short">空间</span>
        </button>
      </div>

      <button
        type="button"
        className="icon-button topbar-help"
        aria-label="帮助"
        title="帮助"
        onClick={() => setHelpOpen(true)}
      >
        <IconHelp />
      </button>
    </header>
  );
}
