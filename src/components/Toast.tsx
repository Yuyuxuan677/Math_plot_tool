import { useEffect } from 'react';
import { useAppStore } from '../app/store';
import { IconCheck, IconInfo } from './Icon';

export function Toast() {
  const toast = useAppStore((state) => state.toast);
  const clearToast = useAppStore((state) => state.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(), 2800);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone === 'error' ? 'is-error' : ''}`} role="status">
      {toast.tone === 'error' ? <IconInfo size={17} /> : <IconCheck size={17} />}
      <span>{toast.text}</span>
    </div>
  );
}
