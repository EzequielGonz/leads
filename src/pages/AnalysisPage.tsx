import React, { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Target,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  MapPin,
  Users,
  Mail,
  Phone,
  Instagram,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ChartsSection from "@/components/ChartsSection";
import StatCard from "@/components/StatCard";
import Empty from "@/components/Empty";
import { useToast } from "@/components/Toast";
import { exportLeads, getDashboardStats } from "@/lib/api";
import useLeadsStore from "@/store/useLeadsStore";
import { cn } from "@/lib/utils";

const COLOR_CLASS: Record<string, string> = {
  cyan: "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30",
  gold: "bg-accent-gold/15 text-accent-gold border-accent-gold/30",
  purple: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  blue: "bg-primary/25 text-blue-300 border-primary/40",
  red: "bg-accent-red/20 text-red-300 border-accent-red/35",
};

const TIPO_EMOJI: Record<string, string> = {
  abogado: "⚖️",
  contador: "📊",
  medico: "🩺",
  empresa: "🏢",
  sin_clasificar: "❔",
  otro: "✨",
};

export default function AnalysisPage() {
  const [exporting, setExporting] = useState<string | null>(null);
  const { success, error } = useToast();
  const { lastImportTimestamp } = useLeadsStore();

  const { data: stats, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["analysis-stats", lastImportTimestamp],
    queryFn: () => getDashboardStats(),
    staleTime: 60_000,
  });

  const total = stats?.total_leads ?? 0;
  const argentina = stats?.argentina_count ?? 0;
  const emails = stats?.emails_count ?? 0;
  const telefonos = stats?.telefonos_count ?? 0;
  const instagrams = stats?.instagram_count ?? 0;

  const porTipo = stats?.por_tipo ?? {};
  const porUbicacion = stats?.por_ubicacion ?? [];

  const pctArgentina = total > 0 ? Math.round((argentina / total) * 1000) / 10 : 0;
  const pctEmail = total > 0 ? Math.round((emails / total) * 1000) / 10 : 0;
  const dataQuality =
    total > 0
      ? Math.round(((emails + telefonos + instagrams) / (total * 3)) * 1000) / 10
      : 0;

  const ubicacionesUnicas = Object.keys(porUbicacion).length;

  const insights = useMemo(() => {
    if (total === 0) return [];
    const arr: Array<{
      icon: React.ElementType;
      color: string;
      title: string;
      text: string;
      stat: string;
    }> = [];

    if (pctArgentina > 0) {
      arr.push({
        icon: MapPin,
        color: "cyan",
        title: "Cobertura Argentina",
        text: `El ${pctArgentina}% de tus leads (${argentina.toLocaleString(
          "es-AR"
        )}) fueron detectados como geolocalizados en Argentina.`,
        stat: `${pctArgentina}% 🇦🇷`,
      });
    }

    const tipoArr = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
    if (tipoArr.length > 0) {
      const [topTipo, topCant] = tipoArr[0];
      const pct = Math.round((topCant / total) * 100);
      const emoji = TIPO_EMOJI[topTipo] ?? "📌";
      const tipoLabel = {
        abogado: "Abogados",
        contador: "Contadores",
        medico: "Médicos",
        empresa: "Empresas",
        sin_clasificar: "Sin clasificar",
        otro: "Otros",
      }[topTipo] ?? topTipo;
      arr.push({
        icon: Users,
        color: "blue",
        title: `Perfil predominante: ${tipoLabel}`,
        text: `El rubro más numeroso es ${tipoLabel.toLowerCase()} con ${topCant.toLocaleString(
          "es-AR"
        )} registros (${pct}% del total). Considera enfocar outreach en este segmento.`,
        stat: `${emoji} ${pct}%`,
      });
    }

    if (ubicacionesUnicas > 0) {
      const topUbi = Object.entries(porUbicacion).sort(
        (a, b) => b[1] - a[1]
      )[0];
      if (topUbi) {
        const [ubi, cant] = topUbi as [string, number];
        const pct = Math.round((cant / total) * 100);
        arr.push({
          icon: Target,
          color: "gold",
          title: `Zona caliente: ${ubi}`,
          text: `${ubi} concentra ${cant.toLocaleString(
            "es-AR"
          )} leads (${pct}%). Prioriza campañas y acciones en esta región primero.`,
          stat: `📍 ${pct}%`,
        });
      }
    }

    if (pctEmail < 70 && total > 0) {
      const faltan = total - emails;
      arr.push({
        icon: Mail,
        color: "purple",
        title: "Oportunidad en emails",
        text: `Te faltan ${faltan.toLocaleString(
          "es-AR"
        )} emails (${100 - pctEmail}%). Recomendamos enriquecer la base con email-finder especializado en AR.`,
        stat: `${100 - pctEmail}% sin mail`,
      });
    }

    if (dataQuality > 0) {
      arr.push({
        icon: CheckCircle2,
        color: dataQuality >= 70 ? "cyan" : "red",
        title: "Índice de calidad de datos",
        text:
          dataQuality >= 70
            ? `Excelente. La base tiene un score de ${dataQuality}/100 en completitud de campos de contacto (email/teléfono/IG).`
            : `Regular (${dataQuality}/100). Hay campos de contacto vacíos que conviene completar para outreach.`,
        stat: `${dataQuality}/100`,
      });
    }

    return arr.slice(0, 5);
  }, [total, argentina, porTipo, porUbicacion, pctArgentina, pctEmail, dataQuality, ubicacionesUnicas, emails]);

  const handleExport = async (format: "xlsx" | "csv" | "json") => {
    setExporting(format);
    try {
      await exportLeads(format, {});
      success(
        `Exportación ${format.toUpperCase()} completa`,
        "Incluye estadísticas agregadas + datos crudos filtrados."
      );
    } catch (e) {
      error(
        "Error al exportar",
        e instanceof Error ? e.message : "Intenta nuevamente en unos minutos."
      );
    } finally {
      setTimeout(() => setExporting(null), 800);
    }
  };

  const EXPORT_BUTTONS = [
    {
      format: "xlsx" as const,
      label: "Excel",
      icon: FileSpreadsheet,
      description: "Con gráficos",
      color: "from-emerald-500 to-emerald-700",
    },
    {
      format: "csv" as const,
      label: "CSV",
      icon: FileText,
      description: "Universal",
      color: "from-blue-500 to-blue-700",
    },
    {
      format: "json" as const,
      label: "JSON",
      icon: FileJson,
      description: "API raw",
      color: "from-amber-500 to-amber-700",
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8 max-w-[1400px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-1">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-1.5">
              Análisis & Exportación
            </h1>
            <p className="text-text-muted text-sm sm:text-base">
              Visualiza métricas avanzadas y exporta tu base en múltiples formatos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-gold/10 border border-accent-gold/25 self-start">
                <Sparkles className="w-4 h-4 text-accent-gold" />
                <span className="text-xs font-semibold text-accent-gold">
                  Insights calculados
                </span>
              </div>
            )}
            <button
              onClick={() => refetch()}
              className="btn-secondary text-xs py-1.5 px-3 self-start"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")}
              />
              Actualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          icon={Target}
          label="% Argentina detectado"
          value={pctArgentina}
          suffix="%"
          accent="cyan"
          decimals={1}
          isLoading={isLoading}
          delay={100}
        />
        <StatCard
          icon={BarChart3}
          label="Calidad de datos"
          value={dataQuality}
          suffix="/100"
          accent="gold"
          decimals={0}
          isLoading={isLoading}
          delay={200}
        />
        <StatCard
          icon={MapPin}
          label="Ubicaciones únicas"
          value={ubicacionesUnicas}
          accent="blue"
          isLoading={isLoading}
          delay={300}
        />
        <StatCard
          icon={CheckCircle2}
          label="% Emails capturados"
          value={pctEmail}
          suffix="%"
          accent="purple"
          decimals={1}
          isLoading={isLoading}
          delay={400}
        />
      </section>

      <section className="opacity-0 animate-stagger-3">
        <div className="flex items-end justify-between mb-4 sm:mb-5">
          <div>
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-accent-cyan" />
              Visualizaciones avanzadas
            </h2>
            <p className="section-subtitle">
              Gráficos interactivos con distribución geográfica y tipologías.
            </p>
          </div>
        </div>
        <ChartsSection ubicaciones={porUbicacion} porTipo={porTipo} />
      </section>

      <section className="opacity-0 animate-stagger-4">
        <div className="flex items-end justify-between mb-4 sm:mb-5">
          <div>
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-gold" />
              Insights & Recomendaciones
            </h2>
            <p className="section-subtitle">
              Análisis automático sobre tu base de leads argentina.
            </p>
          </div>
        </div>

        {insights.length === 0 && !isLoading ? (
          <div className="glass-card gradient-border-top">
            <Empty
              variant="data"
              title="Sube un archivo para ver insights"
              description="Cuando importes un Excel, calcularemos recomendaciones automáticamente."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    "glass-card glass-card-hover p-5 relative overflow-hidden",
                    "opacity-0"
                  )}
                  style={{
                    animation: `fadeUp 0.6s ease-out ${i * 80}ms forwards`,
                  }}
                >
                  <div className="absolute -top-10 -right-10 w-36 h-36 bg-white/5 rounded-full blur-2xl" />
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center border",
                          COLOR_CLASS[ins.color]
                        )}
                      >
                        <Icon className="w-5.5 h-5.5" strokeWidth={2} />
                      </div>
                      <span className="badge badge-default font-display text-[11px] font-bold">
                        {ins.stat}
                      </span>
                    </div>
                    <h3 className="font-display font-semibold text-text-primary text-lg mb-2 leading-tight">
                      {ins.title}
                    </h3>
                    <p className="text-sm text-text-secondary leading-relaxed flex-1 mb-4">
                      {ins.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="opacity-0 animate-stagger-5">
        <div className="glass-card gradient-border-top p-6 sm:p-8 relative overflow-hidden ring-1 ring-accent-cyan/20 shadow-glow">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent-cyan/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="font-display font-bold tracking-tight text-2xl sm:text-3xl text-gradient mb-2">
                Exportar base completa
              </h2>
              <p className="text-text-secondary leading-relaxed">
                Descarga todos tus leads con todos los filtros aplicados.
                Incluye metadata, scores y enriquecimientos calculados.
              </p>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {[
                  "Ubicación + tipo detectado",
                  "Score geográfico AR",
                  "Formato listo para CRM/Outreach",
                  "Sin marcas de agua premium",
                ].map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:w-auto lg:min-w-[520px]">
              {EXPORT_BUTTONS.map((b) => {
                const Icon = b.icon;
                const active = exporting === b.format;
                return (
                  <button
                    key={b.format}
                    disabled={active || total === 0}
                    onClick={() => handleExport(b.format)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-300",
                      "bg-bg-secondary/80 border border-glass-border hover:border-accent-cyan/40",
                      "hover:-translate-y-1 hover:shadow-glow disabled:opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity",
                        `bg-gradient-to-br ${b.color}`
                      )}
                    />
                    <div className="relative z-10 flex items-start justify-between mb-3">
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-md",
                          b.color
                        )}
                      >
                        {active ? (
                          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Icon className="w-5.5 h-5.5" />
                        )}
                      </div>
                      <Download className="w-4 h-4 text-text-muted group-hover:text-accent-cyan transition-colors" />
                    </div>
                    <div className="relative z-10">
                      <div className="font-display font-bold text-text-primary text-lg leading-tight">
                        {b.label}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        {b.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
