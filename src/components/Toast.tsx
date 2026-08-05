import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

interface ToastContextValue {
  toast: (opts: {
    type?: ToastType;
    title: string;
    description?: string;
    duration?: number;
  }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const ICON_COLORS: Record<ToastType, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-cyan-400",
  warning: "text-amber-400",
};

function SingleToast({
  t,
  onClose,
}: {
  t: ToastItem;
  onClose: (id: string) => void;
}) {
  const Icon = ICONS[t.type];

  useEffect(() => {
    if (t.duration > 0) {
      const timer = setTimeout(() => onClose(t.id), t.duration);
      return () => clearTimeout(timer);
    }
  }, [t.id, t.duration, onClose]);

  return (
    <div className={cn("toast", `toast-${t.type}`)}>
      <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", ICON_COLORS[t.type])} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold font-display text-text-primary text-sm">
          {t.title}
        </div>
        {t.description && (
          <div className="text-text-muted text-xs mt-0.5 leading-relaxed">
            {t.description}
          </div>
        )}
      </div>
      <button
        onClick={() => onClose(t.id)}
        className="text-text-muted hover:text-text-primary transition-colors shrink-0 -mr-1 -mt-0.5 p-1 rounded-md hover:bg-white/5"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({
      type = "info",
      title,
      description,
      duration = 4000,
    }: {
      type?: ToastType;
      title: string;
      description?: string;
      duration?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, type, title, description, duration }]);
    },
    []
  );

  const value: ToastContextValue = {
    toast,
    success: (title, description) => toast({ type: "success", title, description }),
    error: (title, description) => toast({ type: "error", title, description, duration: 6000 }),
    info: (title, description) => toast({ type: "info", title, description }),
    warning: (title, description) => toast({ type: "warning", title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <SingleToast key={t.id} t={t} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
