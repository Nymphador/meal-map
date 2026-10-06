import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; action?: ToastAction; error?: boolean };

const ToastContext = createContext<(message: string, opts?: { action?: ToastAction; error?: boolean }) => void>(
  () => {},
);

export const useToast = () => useContext(ToastContext);

/** One toast at a time above the tab bar; used for confirmations and Undo. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, opts: { action?: ToastAction; error?: boolean } = {}) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, ...opts });
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), opts.action ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-above-nav z-50 flex justify-center px-4 pb-3 md:bottom-[calc(1.5rem+var(--ad-h,0px))] md:pb-0">
          <div role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-4 rounded-xl px-4 py-3 text-sm shadow-lg ${
              toast.error ? "bg-danger text-danger-ink" : "bg-ink text-bg"}`}>
            <span>{toast.message}</span>
            {toast.action && (
              <button className="font-semibold text-brand-soft underline-offset-2 hover:underline"
                onClick={() => { toast.action!.run(); setToast(null); }}>
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
