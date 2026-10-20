import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../app/store';
import { Scene3DController } from '../core/plot3d/Scene3DController';
import { IconReset } from './Icon';

export function Scene3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Scene3DController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items3d = useAppStore((state) => state.items3d);
  const paramValues = useAppStore((state) => state.paramValues);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let controller: Scene3DController;
    try {
      controller = new Scene3DController(container, {
        onError: (message) => setError(message),
      });
      controllerRef.current = controller;
      controller.update(useAppStore.getState().items3d, useAppStore.getState().paramValues);
    } catch (caught) {
      console.error(caught);
      setError('当前浏览器无法启动 3D 画布。请使用最新版 Chrome 或 Edge 打开。');
      return () => undefined;
    }
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update(items3d, paramValues);
  }, [items3d, paramValues]);

  return (
    <div className="scene3d-root">
      <div ref={containerRef} className="scene3d-canvas" />
      <div className="scene3d-hint">拖动旋转 · 双指缩放</div>
      <button
        type="button"
        className="icon-button control-button scene3d-reset"
        aria-label="重置 3D 视角"
        title="重置视角"
        onClick={() => {
          setError(null);
          controllerRef.current?.resetView();
        }}
      >
        <IconReset />
      </button>
      {error && (
        <div className="scene3d-fallback" role="alert">
          <strong>3D 画布暂不可用</strong>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
