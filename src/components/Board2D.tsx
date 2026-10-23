import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../app/store';
import { nextMarkedPointName } from '../app/markedPoints';
import type { Point2, Tool } from '../app/types';
import { Board2DController, type BoardSnapshot } from '../core/plot2d/Board2DController';
import { IconClose, IconMagnet, IconPlus, IconReset } from './Icon';

interface PendingPoint {
  world: Point2;
  screen: { left: number; top: number };
}

interface MarkCandidate {
  ownerId: string;
  point: Point2;
  screen: { left: number; top: number };
  offCurve?: boolean;
}

function toolLabel(tool: Tool): string {
  switch (tool) {
    case 'markPoint':
      return '标记点';
    case 'line':
      return '直线';
    case 'circle':
      return '圆';
    case 'ellipse':
      return '椭圆';
    case 'parabola':
      return '抛物线';
    case 'hyperbola':
      return '双曲线';
    default:
      return '选择';
  }
}

function instructionFor(tool: Tool, step: number): string {
  if (tool === 'markPoint') {
    return step === 0 ? '点击图像上的位置；系统会吸附到最近的曲线' : '确认是否标记这个点';
  }
  if (tool === 'line') return step === 0 ? '点击直线的第一个端点' : '点击第二个端点';
  if (tool === 'circle') return step === 0 ? '点击圆心' : '点击圆上一点';
  if (tool === 'ellipse') return step === 0 ? '点击椭圆中心' : '点击确定 a、b 的位置';
  if (tool === 'parabola') return step === 0 ? '点击抛物线顶点' : '点击抛物线上的另一点';
  if (tool === 'hyperbola') return step === 0 ? '点击双曲线中心' : '点击决定 a、b 的位置';
  return '';
}

export function Board2D() {
  const boardId = useRef(`jxg-board-${Math.random().toString(36).slice(2, 10)}`).current;
  const controllerRef = useRef<Board2DController | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPoint | null>(null);
  const [markCandidate, setMarkCandidate] = useState<MarkCandidate | null>(null);

  const items2d = useAppStore((state) => state.items2d);
  const geometry = useAppStore((state) => state.geometry);
  const intersections = useAppStore((state) => state.intersections);
  const tangentIntersections = useAppStore((state) => state.tangentIntersections);
  const tangentAngleConstraints = useAppStore((state) => state.tangentAngleConstraints);
  const markedPoints = useAppStore((state) => state.markedPoints);
  const divisionMarks = useAppStore((state) => state.divisionMarks);
  const markerLines = useAppStore((state) => state.markerLines);
  const autoMovePoints = useAppStore((state) => state.autoMovePoints);
  const paramValues = useAppStore((state) => state.paramValues);
  const snapToGrid = useAppStore((state) => state.snapToGrid);
  const viewResetToken = useAppStore((state) => state.viewResetToken);
  const activeTool = useAppStore((state) => state.activeTool);
  const toolOrientation = useAppStore((state) => state.toolOrientation);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const setView2D = useAppStore((state) => state.setView2D);
  const setSnapToGrid = useAppStore((state) => state.setSnapToGrid);
  const updateTangentPoint = useAppStore((state) => state.updateTangentPoint);
  const updateTangentMeta = useAppStore((state) => state.updateTangentMeta);
  const updateMarkedPoint = useAppStore((state) => state.updateMarkedPoint);
  const addMarkedPoint = useAppStore((state) => state.addMarkedPoint);
  const addFreeMarkedPoint = useAppStore((state) => state.addFreeMarkedPoint);
  const syncIntersectionMarkers = useAppStore((state) => state.syncIntersectionMarkers);
  const showToast = useAppStore((state) => state.showToast);
  const addLine = useAppStore((state) => state.addLine);
  const addCircle = useAppStore((state) => state.addCircle);
  const addEllipse = useAppStore((state) => state.addEllipse);
  const addParabola = useAppStore((state) => state.addParabola);
  const addHyperbola = useAppStore((state) => state.addHyperbola);

  const initialSnapshot = useMemo<BoardSnapshot>(
    () => ({
      items2d: useAppStore.getState().items2d,
      geometry: useAppStore.getState().geometry,
      intersections: useAppStore.getState().intersections,
      tangentIntersections: useAppStore.getState().tangentIntersections,
      tangentAngleConstraints: useAppStore.getState().tangentAngleConstraints,
      markedPoints: useAppStore.getState().markedPoints,
      divisionMarks: useAppStore.getState().divisionMarks,
      markerLines: useAppStore.getState().markerLines,
      paramValues: useAppStore.getState().paramValues,
      snapToGrid: useAppStore.getState().snapToGrid,
    }),
    [],
  );

  useEffect(() => {
    let controller: Board2DController;
    try {
      controller = new Board2DController(
        boardId,
        {
          onViewChange: (bbox) => setView2D(bbox),
          onTangentPointChange: (ownerId, tangentId, point) =>
            updateTangentPoint(ownerId, tangentId, point),
          onTangentMeta: (ownerId, tangentId, meta) =>
            updateTangentMeta(ownerId, tangentId, meta),
          onMarkedPointChange: (pointId, point) => updateMarkedPoint(pointId, { point }),
          onIntersectionPoints: (markId, kind, points) =>
            syncIntersectionMarkers(markId, kind, points),
          onGeometryAnchorChange: (geometryId, anchorKey, point) => {
            const shape = useAppStore
              .getState()
              .geometry.find((candidate) => candidate.id === geometryId);
            if (!shape) return;
            const state = useAppStore.getState();
            if (shape.kind === 'line') {
              state.updateGeometry(geometryId, {
                [anchorKey === 'a' ? 'a' : 'b']: point,
                traceClearToken: shape.traceClearToken + 1,
              } as any);
            } else if (shape.kind === 'circle') {
              state.updateGeometry(geometryId, {
                [anchorKey === 'center' ? 'center' : 'through']: point,
              } as any);
            } else if (shape.kind === 'ellipse' || shape.kind === 'hyperbola') {
              state.updateGeometry(geometryId, {
                [anchorKey === 'center' ? 'center' : 'corner']: point,
              } as any);
            } else if (shape.kind === 'parabola') {
              state.updateGeometry(geometryId, {
                [anchorKey === 'vertex' ? 'vertex' : 'point']: point,
              } as any);
            }
          },
          onDriverPointChange: (geometryId, point) => {
            const shape = useAppStore
              .getState()
              .geometry.find((candidate) => candidate.id === geometryId);
            if (!shape || shape.kind !== 'line') return;
            const endpoint = shape.movingEndpoint === 'A' ? 'a' : 'b';
            useAppStore.getState().updateGeometry(geometryId, {
              driverPoint: point,
              [endpoint]: point,
            } as any);
          },
          onBoardError: (message) => setBoardError(message),
        },
        useAppStore.getState().view2dBoundingBox,
        initialSnapshot,
      );
      controllerRef.current = controller;
      if (import.meta.env.DEV) {
        (window as unknown as { __board2d?: Board2DController }).__board2d = controller;
      }
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : '画板初始化失败');
      return () => undefined;
    }

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
    // The board is intentionally created once. Store changes are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!controllerRef.current) return;
    controllerRef.current.update({
      items2d,
      geometry,
      intersections,
      tangentIntersections,
      tangentAngleConstraints,
      markedPoints,
      divisionMarks,
      markerLines,
      paramValues,
      snapToGrid,
    });
  }, [
    items2d,
    geometry,
    intersections,
    tangentIntersections,
    tangentAngleConstraints,
    markedPoints,
    divisionMarks,
    markerLines,
    paramValues,
    snapToGrid,
  ]);

  useEffect(() => {
    controllerRef.current?.setAutoMove(autoMovePoints);
  }, [autoMovePoints]);

  useEffect(() => {
    if (viewResetToken === 0) return;
    controllerRef.current?.resetView();
  }, [viewResetToken]);

  useEffect(() => {
    setPending(null);
    setMarkCandidate(null);
  }, [activeTool]);

  useEffect(() => {
    if (activeTool === 'select') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveTool('select');
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, setActiveTool]);

  const toWorld = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      allowSnap = true,
    ): { world: Point2; screen: PendingPoint['screen'] } | null => {
      const controller = controllerRef.current;
      const layer = layerRef.current;
      if (!controller || !layer) return null;
      const rect = layer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const bbox = controller.getBoundingBox();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      let x = bbox[0] + fx * (bbox[2] - bbox[0]);
      let y = bbox[1] + fy * (bbox[3] - bbox[1]);
      if (snapToGrid && allowSnap) {
        x = Math.round(x * 2) / 2;
        y = Math.round(y * 2) / 2;
      }
      return {
        world: { x, y },
        screen: { left: event.clientX - rect.left, top: event.clientY - rect.top },
      };
    },
    [snapToGrid],
  );

  const handleCanvasTap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'select') return;
    event.preventDefault();
    event.stopPropagation();
    if (activeTool === 'markPoint') {
      const controller = controllerRef.current;
      if (!controller) return;
      const hit = toWorld(event, false);
      if (!hit) return;
      const curvePoint = controller.findCurvePointAt(hit.world.x, hit.world.y);
      setMarkCandidate({
        ownerId: curvePoint?.ownerId ?? '',
        point: curvePoint?.point ?? hit.world,
        screen: hit.screen,
        offCurve: !curvePoint,
      });
      return;
    }
    const hit = toWorld(event);
    if (!hit) return;

    if (!pending) {
      setPending(hit);
      return;
    }

    const a = pending.world;
    const b = hit.world;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 0.08) {
      showToast('两点太近了，请点得远一点', 'info');
      return;
    }

    try {
      if (activeTool === 'line') {
        addLine(a, b);
        showToast('已创建直线');
      } else if (activeTool === 'circle') {
        addCircle(a, b);
        showToast('已创建圆');
      } else if (activeTool === 'ellipse') {
        addEllipse(a, b);
        showToast('已创建椭圆');
      } else if (activeTool === 'parabola') {
        addParabola(a, b);
        showToast('已创建抛物线');
      } else if (activeTool === 'hyperbola') {
        addHyperbola(a, b, toolOrientation);
        showToast('已创建双曲线');
      }
    } catch (error) {
      console.error(error);
      showToast('创建图形失败，请重试', 'error');
    }
    setPending(null);
  };

  const toolStep = activeTool === 'markPoint' ? (markCandidate ? 1 : 0) : pending ? 1 : 0;

  return (
    <div className="board2d-root">
      <div id={boardId} className="jxgbox board-canvas" />
      {boardError && (
        <div className="board-error" role="alert">
          <span>{boardError}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setBoardError(null)}
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      {activeTool === 'select' && (
        <div className="canvas-controls">
          <button
            type="button"
            className="icon-button control-button desktop-only-control"
            aria-label="放大"
            title="放大"
            onClick={() => controllerRef.current?.zoom(0.8)}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="icon-button control-button desktop-only-control"
            aria-label="缩小"
            title="缩小"
            onClick={() => controllerRef.current?.zoom(1.25)}
          >
            <span className="minus-symbol">−</span>
          </button>
          <button
            type="button"
            className="icon-button control-button"
            aria-label="复位视图"
            title="复位视图"
            onClick={() => controllerRef.current?.resetView()}
          >
            <IconReset />
          </button>
          <button
            type="button"
            className={`icon-button control-button snap-button ${snapToGrid ? 'is-active' : ''}`}
            aria-label={snapToGrid ? '关闭网格吸附' : '开启网格吸附'}
            title={snapToGrid ? '关闭网格吸附' : '开启网格吸附'}
            onClick={() => setSnapToGrid(!snapToGrid)}
          >
            <IconMagnet />
          </button>
        </div>
      )}

      {activeTool !== 'select' && (
        <>
          <div
            ref={layerRef}
            className="tool-click-layer"
            onPointerDown={handleCanvasTap}
            role="presentation"
          >
            {pending && (
              <span
                className="pending-dot"
                style={{ left: pending.screen.left, top: pending.screen.top }}
              />
            )}
            {markCandidate && (
              <span
                className="pending-dot mark-candidate-dot"
                style={{
                  left: markCandidate.screen.left,
                  top: markCandidate.screen.top,
                }}
              />
            )}
          </div>
          {markCandidate && (
            <div
              className="point-confirm-card"
              style={{
                left: Math.min(markCandidate.screen.left + 14, 9999),
                top: Math.min(markCandidate.screen.top + 14, 9999),
              }}
              role="dialog"
              aria-label="确认标记点"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span className="point-confirm-title">
                标记为 {nextMarkedPointName(markedPoints)}
                {markCandidate.offCurve ? '（曲线外点）' : ''}？
              </span>
              <div className="point-confirm-actions">
                <button
                  type="button"
                  className="primary-small-button"
                  onClick={() => {
                    const marked = markCandidate.offCurve
                      ? addFreeMarkedPoint(markCandidate.point)
                      : addMarkedPoint(markCandidate.ownerId, markCandidate.point);
                    setMarkCandidate(null);
                    setActiveTool('select');
                    if (marked) showToast(`已标记点 ${marked.name}`);
                  }}
                >
                  标记
                </button>
                <button
                  type="button"
                  className="secondary-small-button"
                  onClick={() => setMarkCandidate(null)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          <div
            className="tool-hint"
            onPointerDown={(event) => event.stopPropagation()}
            role="status"
          >
            <div className="tool-hint-text">
              <strong>{toolLabel(activeTool)}</strong>
              <span>{instructionFor(activeTool, toolStep)}</span>
            </div>
            {activeTool === 'hyperbola' && (
              <div className="tool-orientation">
                <button
                  type="button"
                  className={toolOrientation === 'horizontal' ? 'is-active' : ''}
                  onClick={() => useAppStore.getState().setToolOrientation('horizontal')}
                >
                  横向
                </button>
                <button
                  type="button"
                  className={toolOrientation === 'vertical' ? 'is-active' : ''}
                  onClick={() => useAppStore.getState().setToolOrientation('vertical')}
                >
                  纵向
                </button>
              </div>
            )}
            <button
              type="button"
              className="tool-cancel"
              onClick={() => {
                setActiveTool('select');
                setPending(null);
              }}
            >
              取消
            </button>
          </div>
        </>
      )}
    </div>
  );
}
