import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

// ── Icon map ───────────────────────────────────────────────────────────────────
const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-green-400 shrink-0" />,
  error:   <XCircle    size={16} className="text-red-400   shrink-0" />,
  info:    <Info       size={16} className="text-blue-400  shrink-0" />,
  warning: <AlertTriangle size={16} className="text-yellow-400 shrink-0" />,
};

const ACCENT: Record<ToastVariant, string> = {
  success: 'border-l-green-500',
  error:   'border-l-red-500',
  info:    'border-l-blue-500',
  warning: 'border-l-yellow-500',
};

// ── Individual Toast ───────────────────────────────────────────────────────────
const ToastCard: React.FC<{ item: ToastItem; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => (
  <div
    className={`
      flex items-start gap-2.5 glass-panel px-4 py-3 rounded-xl shadow-2xl
      border border-white/8 border-l-4 ${ACCENT[item.variant]}
      animate-in slide-in-from-right-4 fade-in duration-300
      min-w-[260px] max-w-[380px]
    `}
  >
    {ICONS[item.variant]}
    <span className="text-sm text-gray-200 font-medium leading-snug flex-1">{item.message}</span>
    <button
      onClick={() => onDismiss(item.id)}
      className="text-gray-500 hover:text-white transition-colors ml-1 shrink-0 mt-0.5"
    >
      <X size={13} />
    </button>
  </div>
);

// ── Provider ───────────────────────────────────────────────────────────────────
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);

      // Auto-dismiss after 4s (errors stay for 6s)
      const delay = variant === 'error' ? 6000 : 4000;
      const timer = setTimeout(() => dismiss(id), delay);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-16 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
