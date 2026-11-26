"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToastItem {
  id: number;
  message: string;
}

const ToastContext = React.createContext<((message: string) => void) | null>(null);

const TOAST_MS = 6000;

/**
 * Success toasts (docs/design/design-system.md, Toast). One polite live region, 16 px above the
 * bottom nav on phone and at the bottom edge from md up. A toast closes itself after a few
 * seconds and can be dismissed. Mounted once by the (app) shell, so a toast survives a navigation.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(0);

  const dismiss = React.useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = React.useCallback(
    (message: string) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, message }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-testid="toast-region"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-lg border border-border bg-popover py-1 pl-4 pr-1 text-body text-popover-foreground shadow-lg"
          >
            <span className="min-w-0 flex-1 break-words py-2">{t.message}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => dismiss(t.id)}>
              <X aria-hidden="true" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast("Household created.")`. A no-op outside the provider. */
export function useToast(): (message: string) => void {
  return React.useContext(ToastContext) ?? (() => {});
}
