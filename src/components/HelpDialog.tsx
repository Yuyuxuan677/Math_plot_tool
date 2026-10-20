import { useAppStore } from '../app/store';
import { IconClose } from './Icon';

export function HelpDialog() {
  const open = useAppStore((state) => state.helpOpen);
  const setOpen = useAppStore((state) => state.setHelpOpen);
  const resetAll = useAppStore((state) => state.resetAll);
  const requestViewReset = useAppStore((state) => state.requestViewReset);
  const showToast = useAppStore((state) => state.showToast);

  if (!open) return null;

  const clearAll = () => {
    if (!window.confirm('清空当前画板的所有对象和参数？此操作不可撤销。')) return;
    resetAll();
    requestViewReset();
    setOpen(false);
    showToast('画板已清空');
  };

  return (
    <div className="overlay-layer dialog-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="dialog-card help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">简图</p>
            <h2 id="help-title">三分钟上手</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭帮助"
            onClick={() => setOpen(false)}
          >
            <IconClose />
          </button>
        </div>

        <div className="dialog-scroll">
          <section className="help-section">
            <h3>输入表达式</h3>
            <p>
              函数直接写等号右边，例如 <code>x^2</code>、<code>sin(x)</code>、
              <code>a*x + b</code>。支持 <code>sin cos tan ln lg sqrt abs</code>、<code>pi</code>、
              隐式乘法 <code>2x</code>；两个字母相乘请写 <code>x*y</code>。
            </p>
            <p>
              参数会自动出现滑条，<strong>每个输入框最多 3 个参数</strong>；同名参数共享数值。
            </p>
          </section>

          <section className="help-section">
            <h3>图形与切线</h3>
            <p>
              点“画图”选择直线、圆、椭圆、抛物线或双曲线，在画布上点两下即可创建；锚点可拖动。
              图形卡片里可打开“显示方程”。每条曲线都可以添加多条切线，拖动切点即可调整。
            </p>
          </section>

          <section className="help-section">
            <h3>等分点、轨迹与轨迹方程</h3>
            <p>
              直线卡片里设置 n 等分点；把动点 A 或 B 绑定到一条曲线后，可以播放、记录等分点轨迹，
              并打开“推导轨迹方程”查看方程和推导步骤。
            </p>
          </section>

          <section className="help-section">
            <h3>手机手势</h3>
            <p>
              画布：单指拖动平移、双指捏合缩放；点或端点可以直接拖动。
              底部面板：上滑或点击“对象”展开，下滑收起。
            </p>
          </section>

          <section className="help-section">
            <h3>出错时</h3>
            <p>
              输入框下方会给出中文提示；出错的曲线只是暂停显示，不会影响其他对象，也不会让页面崩溃。
            </p>
          </section>
        </div>

        <div className="dialog-footer">
          <button type="button" className="danger-text-button" onClick={clearAll}>
            清空画板
          </button>
          <button type="button" className="primary-button" onClick={() => setOpen(false)}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
