import { useAppStore } from '../app/store';
import { IconClose } from './Icon';

export function AddMenu() {
  const open = useAppStore((state) => state.addMenuOpen);
  const setOpen = useAppStore((state) => state.setAddMenuOpen);
  const mode = useAppStore((state) => state.mode);
  const addItem2D = useAppStore((state) => state.addItem2D);
  const addItem3D = useAppStore((state) => state.addItem3D);

  if (!open) return null;

  const options =
    mode === '2d'
      ? [
          { label: '函数', detail: 'y = f(x)', action: () => addItem2D('explicit') },
          { label: '参数曲线', detail: '(x(t), y(t))', action: () => addItem2D('parametric') },
          { label: '隐式方程', detail: 'F(x, y) = 0', action: () => addItem2D('implicit') },
        ]
      : [
          { label: '曲面', detail: 'z = f(x, y)', action: () => addItem3D('surface') },
          {
            label: '参数曲面',
            detail: '(x(u,v), y(u,v), z(u,v))',
            action: () => addItem3D('paramSurface'),
          },
          {
            label: '空间曲线',
            detail: '(x(t), y(t), z(t))',
            action: () => addItem3D('curve3d'),
          },
        ];

  return (
    <div className="overlay-layer add-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="添加对象"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="action-sheet-head">
          <h2>添加对象</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          >
            <IconClose />
          </button>
        </div>
        <div className="action-sheet-options">
          {options.map((option) => (
            <button
              type="button"
              className="action-option"
              key={option.label}
              onClick={() => {
                option.action();
                setOpen(false);
              }}
            >
              <span className="action-option-label">{option.label}</span>
              <span className="action-option-detail">{option.detail}</span>
            </button>
          ))}
        </div>
        <p className="action-sheet-note">
          {mode === '2d' ? '新建后可以在对象卡片里编辑表达式。' : '新建后可以设置范围与精度。'}
        </p>
      </div>
    </div>
  );
}
