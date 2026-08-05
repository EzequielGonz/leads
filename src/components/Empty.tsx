import React from "react";
import { UploadCloud, Database, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface EmptyProps {
  title?: string;
  description?: string;
  action?: {
    label: string;
    to?: string;
    onClick?: () => void;
    icon?: React.ElementType;
  };
  variant?: "data" | "upload" | "default";
  className?: string;
}

export default function Empty({
  title,
  description,
  action,
  variant = "default",
  className,
}: EmptyProps) {
  const defaults = {
    data: {
      title: "No hay datos para mostrar",
      description: "Sube tu primer archivo Excel o CSV para comenzar a explorar tus leads.",
      actionLabel: "Subir archivo",
      to: "/upload",
    },
    upload: {
      title: "Ningún archivo seleccionado",
      description: "Arrastra un archivo en el área superior para comenzar.",
      actionLabel: undefined,
    },
    default: {
      title: "Vacío",
      description: "No hay contenido disponible en este momento.",
      actionLabel: undefined,
    },
  };

  const cfg = defaults[variant] as typeof defaults[keyof typeof defaults] & { to?: string };
  const finalTitle = title ?? cfg.title;
  const finalDescription = description ?? cfg.description;
  const ActionIcon = action?.icon ?? UploadCloud;

  const ActionComp = () => {
    const label = action?.label ?? (cfg.actionLabel as string | undefined);
    if (!label) return null;
    const btn = (
      <button
        onClick={action?.onClick}
        className="btn-primary text-sm"
      >
        <ActionIcon className="w-4 h-4" />
        {label}
      </button>
    );

    const target = action?.to ?? (cfg.to as string | undefined);
    if (target) {
      return (
        <Link to={target} className="inline-block">
          {btn}
        </Link>
      );
    }
    return btn;
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-14 sm:py-20 px-6 text-center relative overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />

      <div className="relative z-10 max-w-md mx-auto flex flex-col items-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-accent-cyan/15 blur-3xl rounded-full animate-pulse-slow" />
          <div className="relative w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/30 via-accent-cyan/20 to-accent-gold/20 border border-glass-border flex items-center justify-center shadow-glow">
            {variant === "data" ? (
              <Database className="w-12 h-12 text-accent-cyan" strokeWidth={1.5} />
            ) : variant === "upload" ? (
              <UploadCloud className="w-12 h-12 text-accent-cyan" strokeWidth={1.5} />
            ) : (
              <Sparkles className="w-12 h-12 text-accent-cyan" strokeWidth={1.5} />
            )}
          </div>
        </div>

        <h3 className="font-display font-bold text-xl sm:text-2xl text-text-primary mb-2 tracking-tight">
          {finalTitle}
        </h3>
        <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-sm">
          {finalDescription}
        </p>

        <ActionComp />
      </div>
    </div>
  );
}
