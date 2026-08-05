import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  MapPin,
  Mail,
  Instagram,
  UploadCloud,
  FileSpreadsheet,
  Clock,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import ChartsSection, {
  type LocationData,
  type TipoData,
} from "@/components/ChartsSection";
import Empty from "@/components/Empty";
import {
  getDashboardStats,
  getFiles,
  type FileInfo,
} from "@/lib/api";
import { useLeadsStore } from "@/store/useLeadsStore";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TIPO_LABELS: Record<string, string> = {
  abogado: "⚖️ Abogado",
  contador: "📊 Contador",
  medico: "🩺 Médico",
  empresa: "🏢 Empresa",
  sin_clasificar: "⚪ Sin clasificar",
  otro: "🔹 Otro",
};

export default function Home() {
  const lastImportTs = useLeadsStore((s) => s.lastImportTimestamp);
  const [reloadKey, setReloadKey] = React.useState(0);
  const queryKey = React.useMemo(
    () => ["dashboard-stats", lastImportTs, reloadKey],
    [lastImportTs, reloadKey]
  );
  const filesQueryKey = React.useMemo(
    () => ["files-list", lastImportTs, reloadKey],
    [lastImportTs, reloadKey]
  );

  const statsQuery = useQuery({
    queryKey,
    queryFn: () => getDashboardStats(),
    staleTime: 2000,
    retry: 1,
  });

  const filesQuery = useQuery({
    queryKey: filesQueryKey,
    queryFn: () => getFiles(),
    staleTime: 2000,
    retry: 1,
  });

  const stats = statsQuery.data;
  const files: FileInfo[] = filesQuery.data?.files ?? [];

  const totalLeads = stats?.total_leads ?? 0;
  const argentinaCount = stats?.argentina_count ?? 0;
  const emailsCount = stats?.emails_count ?? 0;
  const instagramCount = stats?.instagram_count ?? 0;
  const isLoading = statsQuery.isLoading || filesQuery.isLoading;

  const ubicacionesData: LocationData[] = React.useMemo(() => {
    if (!stats?.por_ubicacion) return [];
    return Object.entries(stats.por_ubicacion).map(([ubicacion, count]) => ({
      ubicacion:
        ubicacion.charAt(0).toUpperCase() + ubicacion.slice(1).toLowerCase(),
      count,
    }));
  }, [stats]);

  const tipoData: TipoData[] = React.useMemo(() => {
    if (!stats?.por_tipo) return [];
    return Object.entries(stats.por_tipo).map(([tipo, count]) => ({
      tipo: TIPO_LABELS[tipo] ?? tipo,
      count,
    }));
  }, [stats]);

  return (
    <div className="space-y-6 lg:space-y-8 max-w-[1400px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="glass-card gradient-border-top p-6 sm:p-8 lg:p-10 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent-cyan/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-2xl min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-gold/10 border border-accent-gold/25 mb-4">
                <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" />
                <span className="text-xs font-semibold text-accent-gold tracking-wide">
                  PREMIUM · DASHBOARD
                </span>
              </div>
              <h1 className="font-display font-bold tracking-tight text-3xl sm:text-4xl lg:text-5xl mb-3">
                <span className="text-gradient">Panel de software de ESTUDIO JURIDICO VITA</span>
              </h1>
              <p className="text-text-secondary text-base sm:text-lg leading-relaxed max-w-xl">
                Este es el software creado especificamente para analizar archivos excel, y enviar mensajes automatizados con whatsapp: ESTUDIO JURIDICO VITA
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                to="/upload"
                className="btn-primary text-sm sm:text-base px-5 py-3"
              >
                <UploadCloud className="w-5 h-5" />
                Subir nuevo archivo
              </Link>
              <Link
                to="/explorer"
                className="btn-secondary text-sm sm:text-base px-5 py-3"
              >
                Explorar datos
                <ArrowUpRight className="w-4.5 h-4.5" />
              </Link>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="btn-secondary !py-3 !px-3 text-sm sm:text-base"
                title="Refrescar datos"
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    isLoading ? "animate-spin text-accent-cyan" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={totalLeads}
          accent="blue"
          delay={100}
          isLoading={isLoading}
        />
        <StatCard
          icon={MapPin}
          label="🇦🇷 Argentina"
          value={argentinaCount}
          accent="cyan"
          suffix=""
          delay={200}
          isLoading={isLoading}
        />
        <StatCard
          icon={Mail}
          label="Emails Encontrados"
          value={emailsCount}
          accent="gold"
          delay={300}
          isLoading={isLoading}
        />
        <StatCard
          icon={Instagram}
          label="Perfiles Instagram"
          value={instagramCount}
          accent="purple"
          delay={400}
          isLoading={isLoading}
        />
      </section>

      <section className="opacity-0 animate-stagger-3">
        <div className="flex items-end justify-between mb-4 sm:mb-5">
          <div>
            <h2 className="section-title text-xl sm:text-2xl">
              Estadísticas & Análisis
            </h2>
            <p className="section-subtitle">
              Distribución geográfica y por tipo de perfil
            </p>
          </div>
          <Link
            to="/analysis"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-accent-cyan hover:text-cyan-300 transition-colors"
          >
            Ver análisis completo
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <ChartsSection ubicaciones={ubicacionesData} porTipo={tipoData} />
      </section>

      <section className="opacity-0 animate-stagger-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="section-title text-xl sm:text-2xl">Subidas recientes</h2>
            <p className="section-subtitle">
              Últimos archivos procesados en el sistema
            </p>
          </div>
          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-accent-cyan hover:text-cyan-300 transition-colors"
          >
            Gestionar
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="glass-card gradient-border-top overflow-hidden">
          {files.length === 0 ? (
            <Empty
              variant="upload"
              action={{
                label: "Subir primer archivo",
                to: "/upload",
                icon: UploadCloud,
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-left">Archivo</th>
                    <th className="text-left">Filas</th>
                    <th className="text-left">Columnas</th>
                    <th className="text-left hidden sm:table-cell">Subido</th>
                    <th className="text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((u) => (
                    <tr
                      key={u.id}
                      className="cursor-pointer hover:bg-accent-cyan/5 transition-colors"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-display font-semibold text-text-primary truncate max-w-[260px]">
                              {u.filename}
                            </div>
                            <div className="text-xs text-text-muted">
                              ID: {u.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="font-display font-semibold text-accent-cyan">
                          {u.total_rows.toLocaleString("es-AR")}
                        </span>
                        <span className="text-text-muted text-xs ml-1">leads</span>
                      </td>
                      <td>
                        <span className="text-text-secondary text-xs sm:text-sm">
                          {u.columns_detected.length} campos
                        </span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-text-secondary text-sm">
                          <Clock className="w-3.5 h-3.5 text-text-muted" />
                          {formatDate(u.uploaded_at)}
                        </div>
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/explorer?file_id=${u.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-cyan hover:text-cyan-300 transition-colors px-3 py-1.5 rounded-md hover:bg-accent-cyan/10"
                        >
                          Abrir
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
