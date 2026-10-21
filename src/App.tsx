import { lazy, Suspense, useEffect } from 'react';
import { savePersistedState } from './app/persistence';
import { useAppStore } from './app/store';
import { useMediaQuery } from './app/useMediaQuery';
import { useKeyboardInset } from './app/useKeyboardInset';
import { AddMenu } from './components/AddMenu';
import { Board2D } from './components/Board2D';
import { EmptyState } from './components/EmptyState';
import { HelpDialog } from './components/HelpDialog';
import { LocusDialog } from './components/LocusDialog';
import { MobileSheet } from './components/MobileSheet';
import { ObjectsPanel } from './components/ObjectsPanel';
import { Toast } from './components/Toast';
import { ToolTray } from './components/ToolTray';
import { TopBar } from './components/TopBar';

const Scene3D = lazy(() =>
  import('./components/Scene3D').then((module) => ({ default: module.Scene3D })),
);

export default function App() {
  const mode = useAppStore((state) => state.mode);
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const geometry = useAppStore((state) => state.geometry);
  const paramValues = useAppStore((state) => state.paramValues);
  const view2dBoundingBox = useAppStore((state) => state.view2dBoundingBox);
  const snapToGrid = useAppStore((state) => state.snapToGrid);
  const isMobile = useMediaQuery('(max-width: 900px)');
  useKeyboardInset();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      savePersistedState({
        version: 1,
        mode,
        items2d,
        items3d,
        geometry,
        paramValues,
        view2dBoundingBox,
        snapToGrid,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [mode, items2d, items3d, geometry, paramValues, view2dBoundingBox, snapToGrid]);

  return (
    <div className={`app mode-${mode}`}>
      <TopBar />
      <div className="workspace">
        {!isMobile && (
          <aside className="desktop-sidebar">
            <ObjectsPanel />
          </aside>
        )}
        <main className="canvas-region">
          {mode === '2d' ? (
            <Board2D />
          ) : (
            <Suspense fallback={<div className="scene3d-loading">正在加载 3D 画布…</div>}>
              <Scene3D />
            </Suspense>
          )}
          <EmptyState />
          <Toast />
        </main>
      </div>
      {isMobile && <MobileSheet />}
      <AddMenu />
      {mode === '2d' && <ToolTray />}
      <LocusDialog />
      <HelpDialog />
    </div>
  );
}
