import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearPersistedState } from '../app/persistence';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '页面遇到未知错误',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('简图页面异常', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="app-fallback">
        <div className="app-fallback-card">
          <p className="dialog-eyebrow">简图</p>
          <h1>页面遇到了一点问题</h1>
          <p>
            画板已经安全停下，没有丢失其他内容。可以先重新加载；如果反复出现，可以清空本地画板数据。
          </p>
          <div className="app-fallback-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
            <button
              type="button"
              className="danger-text-button"
              onClick={() => {
                clearPersistedState();
                window.location.reload();
              }}
            >
              清空并重新开始
            </button>
          </div>
          <details>
            <summary>错误详情</summary>
            <pre>{this.state.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
