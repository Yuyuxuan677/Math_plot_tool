import { useAppStore } from '../app/store';

interface Example {
  label: string;
  hint: string;
  apply: () => void;
}

export function EmptyState() {
  const mode = useAppStore((state) => state.mode);
  const items2d = useAppStore((state) => state.items2d);
  const items3d = useAppStore((state) => state.items3d);
  const geometry = useAppStore((state) => state.geometry);
  const addItem2D = useAppStore((state) => state.addItem2D);
  const addItem3D = useAppStore((state) => state.addItem3D);
  const updateItem2D = useAppStore((state) => state.updateItem2D);
  const updateItem3D = useAppStore((state) => state.updateItem3D);
  const setSheetExpanded = useAppStore((state) => state.setSheetExpanded);
  const showToast = useAppStore((state) => state.showToast);

  const hasContent = mode === '2d' ? items2d.length + geometry.length > 0 : items3d.length > 0;
  if (hasContent) return null;

  const finish = (message: string) => {
    setSheetExpanded(false);
    showToast(message);
  };

  const examples2D: Example[] = [
    {
      label: 'y = x²',
      hint: '二次函数',
      apply: () => {
        addItem2D('explicit');
        finish('已添加函数，可在对象卡片继续编辑');
      },
    },
    {
      label: 'y = sin(x)',
      hint: '三角函数',
      apply: () => {
        const id = addItem2D('explicit');
        updateItem2D(id, { expr: 'sin(x)' });
        finish('已添加 sin(x)，可在对象卡片继续编辑');
      },
    },
    {
      label: 'x² + y² = 4',
      hint: '隐式方程',
      apply: () => {
        addItem2D('implicit');
        finish('已添加隐式方程，可在对象卡片继续编辑');
      },
    },
    {
      label: '(cos t, sin t)',
      hint: '参数曲线',
      apply: () => {
        addItem2D('parametric');
        finish('已添加参数曲线，可在对象卡片继续编辑');
      },
    },
  ];

  const examples3D: Example[] = [
    {
      label: '波浪面',
      hint: 'z = sin(x)cos(y)',
      apply: () => {
        addItem3D('surface');
        finish('已添加波浪面');
      },
    },
    {
      label: '马鞍面',
      hint: 'z = x² − y²',
      apply: () => {
        const id = addItem3D('surface');
        updateItem3D(id, { expr: 'x^2 - y^2' });
        finish('已添加马鞍面');
      },
    },
    {
      label: '球面',
      hint: '参数曲面',
      apply: () => {
        addItem3D('paramSurface');
        finish('已添加球面');
      },
    },
    {
      label: '螺旋线',
      hint: '空间曲线',
      apply: () => {
        const id = addItem3D('curve3d');
        updateItem3D(id, { zExpr: 't / 3' });
        finish('已添加螺旋线');
      },
    },
  ];

  const examples = mode === '2d' ? examples2D : examples3D;

  return (
    <div className="empty-state" aria-live="polite">
      <div className="empty-card">
        <p className="empty-eyebrow">{mode === '2d' ? '平面画板' : '空间画板'}</p>
        <h1>{mode === '2d' ? '从一个表达式开始' : '看看空间里的形状'}</h1>
        <p className="empty-copy">
          {mode === '2d'
            ? '输入函数、参数曲线或方程；也可以直接画圆、椭圆和圆锥曲线。'
            : '输入曲面或空间曲线，拖动旋转、双指缩放。'}
        </p>
        <div className="example-grid">
          {examples.map((example) => (
            <button
              type="button"
              className="example-button"
              key={example.label}
              onClick={example.apply}
            >
              <span className="example-label">{example.label}</span>
              <span className="example-hint">{example.hint}</span>
            </button>
          ))}
        </div>
        <p className="empty-footnote">
          {mode === '2d' ? '单指拖动 · 双指缩放 · 点 ＋ 添加更多' : '单指旋转 · 双指缩放'}
        </p>
      </div>
    </div>
  );
}
