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
              参数会自动出现滑条，<strong>2D 每个输入框最多 3 个参数，3D 最多 4 个</strong>；同名参数共享数值。
            </p>
          </section>

          <section className="help-section">
            <h3>表达式与切线</h3>
            <p>
              输入函数、参数曲线或隐式方程；每条曲线都可以添加多条切线，拖动切点即可调整。
              2D 每个输入框最多 3 个参数，3D 最多 4 个参数。
            </p>
          </section>

          <section className="help-section">
            <h3>切线夹角、轨迹与轨迹方程</h3>
            <p>
              “添加 → 切线夹角约束”可让两条切线保持固定夹角：90° 时拖动切线，另一条会沿自身曲线分支自动旋转，
              可用来演示椭圆两条垂直切线交点形成的蒙日圆。
            </p>
            <p>
              添加夹角约束后会自动创建两条切线的交点并开启轨迹记录；展开交点卡片可查看坐标，
              点击“推导交点轨迹方程”可查看轨迹方程和推导过程。
            </p>
          </section>

          <section className="help-section">
            <h3>通用交点与两点连线</h3>
            <p>
              “添加 → 交点”创建后，在卡片里任选两个对象：函数/参数曲线/隐式曲线、切线、已有连线，
              或 x 轴 / y 轴。所有实际交点会显示，并自动成为标记点。
            </p>
            <p>
              开启“记录交点轨迹”后，移动对象会留下交点轨迹；展开卡片可切换两个对象。
              切线交点与普通曲线交点共用这个入口。
            </p>
            <p>
              “添加 → 两点连线”选择两个标记点，构造一条随标记点移动的直线；连线也可以参与交点计算。
            </p>
          </section>

          <section className="help-section">
            <h3>标记点、自动移动与 N 等分点</h3>
            <p>
              点对象栏的“标点”，再点击曲线附近：出现确认卡片后选择是否标记，系统会自动命名为 A、B、C…
              标记点会吸附在曲线上，可以直接拖动。每条切线的切点也会自动成为一个标记点。
            </p>
            <p>
              点“自动移动”（或在添加菜单中开启）后，只会移动在标记点卡片里勾选了“自动移动”的点；
              点击曲线外位置可以创建自由点，自由点可手动输入固定坐标。
            </p>
            <p>
              曲线上的手动标记点还可以固定横坐标或纵坐标，另一个坐标由曲线自动求出。
            </p>
            <p>
              “添加 → N 等分点”选择两个标记点并设置 N，会按两点连线等分显示 N−1 个内分点；
              拖动标记点或自动移动时可记录这些等分点的轨迹。
            </p>
          </section>

          <section className="help-section">
            <h3>手机手势</h3>
            <p>
              画布：单指拖动平移、双指捏合缩放；单指拖动旋转 3D。
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
