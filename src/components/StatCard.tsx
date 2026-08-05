import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: { value: number; label?: string };
  accent?: "blue" | "cyan" | "gold" | "red" | "purple";
  className?: string;
  delay?: number;
  isLoading?: boolean;
}

const ACCENT_STYLES: Record<
  NonNullable<StatCardProps["accent"]>,
  {
    iconWrap: string;
    glow: string;
    trendUp: string;
  }
> = {
  blue: {
    iconWrap: "bg-primary/20 text-blue-300",
    glow: "shadow-glow-blue",
    trendUp: "text-blue-400",
  },
  cyan: {
    iconWrap: "bg-accent-cyan/15 text-accent-cyan",
    glow: "shadow-glow",
    trendUp: "text-accent-cyan",
  },
  gold: {
    iconWrap: "bg-accent-gold/15 text-accent-gold",
    glow: "",
    trendUp: "text-accent-gold",
  },
  red: {
    iconWrap: "bg-accent-red/20 text-red-300",
    glow: "",
    trendUp: "text-red-400",
  },
  purple: {
    iconWrap: "bg-violet-500/15 text-violet-300",
    glow: "",
    trendUp: "text-violet-400",
  },
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  trend,
  accent = "cyan",
  className,
  delay = 0,
  isLoading = false,
}: StatCardProps) {
  const { formatted } = useCountUp(isLoading ? 0 : value, { decimals });
  const styles = ACCENT_STYLES[accent];

  const animationStyle: React.CSSProperties =
    delay > 0
      ? {
          animation: `fadeUp 0.6s ease-out ${delay}ms forwards`,
          opacity: 0,
        }
      : {};

  return (
    <div
      className={cn(
        "glass-card glass-card-hover gradient-border-top p-5 sm:p-6",
        styles.glow,
        className
      )}
      style={animationStyle}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-text-muted uppercase tracking-wider mb-2">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            {prefix && !isLoading && (
              <span className="text-lg font-display text-text-muted font-semibold">
                {prefix}
              </span>
            )}
            <span
              className={cn(
                "font-display font-bold tracking-tight text-2xl sm:text-3xl lg:text-4xl",
                isLoading
                  ? "text-transparent bg-clip-text bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600 animate-shimmer bg-[length:200%_100%]"
                  : "text-text-primary"
              )}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {isLoading ? "····" : formatted}
            </span>
            {suffix && !isLoading && (
              <span className="text-sm font-display text-text-muted font-medium">
                {suffix}
              </span>
            )}
          </div>

          {!isLoading && trend && (
            <div className="mt-3 flex items-center gap-1.5">
              {trend.value >= 0 ? (
                <TrendingUp
                  className={cn("w-3.5 h-3.5", styles.trendUp)}
                  strokeWidth={2.5}
                />
              ) : (
                <TrendingDown
                  className="w-3.5 h-3.5 text-red-400"
                  strokeWidth={2.5}
                />
              )}
              <span
                className={cn(
                  "text-xs font-semibold",
                  trend.value >= 0 ? styles.trendUp : "text-red-400"
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value}%
              </span>
              {trend.label && (
                <span className="text-xs text-text-muted">vs anterior</span>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            "w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300",
            isLoading ? "opacity-50" : "",
            styles.iconWrap
          )}
          style={{
            boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08)",
          }}
        >
          <Icon
            className={cn(
              "w-6 h-6 sm:w-7 sm:h-7",
              isLoading ? "animate-pulse-slow" : ""
            )}
            strokeWidth={2}
          />
        </div>
      </div>
    </div>
  );
}
