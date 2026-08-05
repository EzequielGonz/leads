import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  Database,
  BarChart3,
  Instagram,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Subir Archivos", to: "/upload", icon: Upload },
  { label: "Explorar Datos", to: "/explorer", icon: Database },
  { label: "Análisis & Export", to: "/analysis", icon: BarChart3 },
  { label: "Scraper Instagram", to: "/scraper", icon: Instagram },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/upload": "Subir Archivos",
  "/explorer": "Explorar Datos",
  "/analysis": "Análisis & Export",
  "/scraper": "Scraper Instagram",
};

function AppSidebar({
  collapsed,
  onClose,
}: {
  collapsed: boolean;
  onClose?: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed lg:sticky top-0 left-0 z-40 h-screen flex flex-col transition-all duration-300",
        "bg-bg-primary/80 backdrop-blur-2xl border-r border-glass-border",
        collapsed
          ? "w-0 lg:w-20 overflow-hidden"
          : "w-72 lg:w-64 translate-x-0"
      )}
    >
      <div className="flex items-center justify-between px-5 py-5 border-b border-glass-border/60">
        <div
          className={cn(
            "flex items-center gap-3 overflow-hidden",
            collapsed && "lg:justify-center lg:px-0 w-full"
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-accent-cyan to-accent-gold flex items-center justify-center shrink-0 shadow-glow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-display font-bold text-text-primary leading-tight tracking-tight">
                Leads AR
              </span>
              <span className="text-[11px] text-text-muted font-medium">
                Premium Panel
              </span>
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        <div className="space-y-1">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "nav-item",
                  isActive && "active",
                  collapsed && "lg:justify-center lg:px-0"
                )
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm">{label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      <div
        className={cn(
          "p-4 border-t border-glass-border/60",
          collapsed && "lg:hidden"
        )}
      >
        <div className="glass-card p-4 gradient-border-top">
          <div className="text-xs font-display font-semibold text-accent-gold mb-1">
            💡 Consejo Pro
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Sube archivos Excel/CSV y mapea columnas para enriquecer tus leads
            argentinos.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const currentLabel =
    BREADCRUMB_LABELS[location.pathname] || "Panel de Leads";

  return (
    <div className="relative min-h-screen flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="hidden lg:block">
        <AppSidebar collapsed={collapsed} />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-y-0 left-0 z-40">
          <AppSidebar collapsed={false} onClose={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="sticky top-0 z-20 bg-bg-primary/70 backdrop-blur-xl border-b border-glass-border/60">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setMobileOpen(true);
                  } else {
                    setCollapsed((c) => !c);
                  }
                }}
                className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors shrink-0"
                aria-label="Menú"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <span className="hidden sm:flex items-center gap-2 text-xs text-text-muted font-medium">
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-glass-border text-[10px] uppercase tracking-wider">
                    Leads
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
                <h1 className="font-display font-semibold text-text-primary truncate text-lg">
                  {currentLabel}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-emerald-300">
                  Sistema Activo
                </span>
              </div>

              <div className="flex items-center gap-2 pl-3 border-l border-glass-border/60">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent-cyan flex items-center justify-center shadow-soft">
                  <span className="text-sm font-display font-bold text-white">
                    AR
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 min-w-0">
          <div className="opacity-0 animate-fade-up" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
