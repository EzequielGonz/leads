import React, { useEffect, useMemo, useState } from "react";
import type { PaginationState } from "@tanstack/react-table";
import {
  Search,
  Filter,
  Download,
  MapPin,
  SlidersHorizontal,
  RefreshCw,
  Building2,
  User,
  Users,
  Scale,
  Calculator,
  Stethoscope,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import DataTable, { ArgentinaBadge, TipoBadge } from "@/components/DataTable";
import LeadProfileModal from "@/components/LeadProfileModal";
import Empty from "@/components/Empty";
import { useToast } from "@/components/Toast";
import useLeadsStore from "@/store/useLeadsStore";
import { exportLeads, getLeads, type Lead, type LeadTipo } from "@/lib/api";
import { cn } from "@/lib/utils";

const UBICACIONES_OPT = [
  "CABA",
  "Buenos Aires",
  "Córdoba",
  "Rosario",
  "Mendoza",
  "La Plata",
  "Mar del Plata",
  "Salta",
  "Tucumán",
  "Santa Fe",
  "San Juan",
  "Entre Ríos",
  "Corrientes",
  "Neuquén",
];

const TIPOS_OPT: LeadTipo[] = [
  "abogado",
  "contador",
  "medico",
  "empresa",
  "sin_clasificar",
  "otro",
];

const TIPO_LABEL: Record<LeadTipo, string> = {
  abogado: "Abogado / Estudio Jurídico",
  contador: "Contador / Estudio Contable",
  medico: "Médico / Profesional Salud",
  empresa: "Empresa / Emprendedor",
  sin_clasificar: "Sin clasificar",
  otro: "Otro",
};

const TIPO_ICONS: Record<LeadTipo, React.ElementType> = {
  abogado: Scale,
  contador: Calculator,
  medico: Stethoscope,
  empresa: Building2,
  sin_clasificar: User,
  otro: Users,
};

export default function ExplorerPage() {
  const {
    selectedLead,
    selectLead,
    filters,
    setFilters,
    resetFilters,
    lastImportTimestamp,
  } = useLeadsStore();

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: filters.size ?? 25,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search ?? "");
  const [searchDebounced, setSearchDebounced] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState<string | null>(null);
  const { success, info, error } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(localSearch), 400);
    return () => clearTimeout(t);
  }, [localSearch]);

  const queryParams = useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      size: pagination.pageSize,
      search: searchDebounced || undefined,
      argentina_only: filters.argentina_only,
      tipo: filters.tipo,
      ubicacion: filters.ubicacion,
      file_id: filters.file_id,
    }),
    [pagination, searchDebounced, filters]
  );

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["leads-explorer", queryParams, lastImportTimestamp],
    queryFn: async () => getLeads(queryParams),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const leads = data?.data ?? [];
  const totalCount = data?.total ?? 0;

  const onRowClick = (lead: Lead) => {
    selectLead(lead);
    setModalOpen(true);
  };

  const handleExport = async (format: "xlsx" | "csv" | "json") => {
    setExporting(format);
    try {
      await exportLeads(format, {
        search: searchDebounced,
        argentina_only: filters.argentina_only,
        tipo: filters.tipo,
        ubicacion: filters.ubicacion,
        file_id: filters.file_id,
      });
      success(
        `Exportación ${format.toUpperCase()}`,
        `Se exportó la base de leads correctamente.`
      );
      info("Descarga iniciada", "El archivo se está descargando en tu navegador.");
    } catch (e) {
      error(
        "Error en exportación",
        e instanceof Error ? e.message : "No se pudo generar el archivo."
      );
    } finally {
      setTimeout(() => setExporting(null), 800);
    }
  };

  const hasActiveFilters =
    filters.argentina_only !== undefined ||
    !!filters.tipo ||
    !!filters.ubicacion ||
    !!searchDebounced ||
    !!filters.file_id;

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-1">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-1.5">
              Explorar Datos
            </h1>
            <p className="text-text-muted text-sm sm:text-base">
              Filtra, busca y exporta tu base completa de leads.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-argentina">
              <Users className="w-3 h-3" />
              {totalCount.toLocaleString("es-AR")} totales
            </span>
            <button
              onClick={() => refetch()}
              className="btn-secondary text-xs py-1.5 px-3"
              title="Refrescar datos"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")}
              />
              Refrescar
            </button>
          </div>
        </div>
      </section>

      <section className="glass-card gradient-border-top p-4 sm:p-5 opacity-0 animate-stagger-2">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-4 h-4 text-accent-cyan" />
          <h3 className="font-display font-semibold text-text-primary">Filtros</h3>
          <div className="ml-auto flex gap-2">
            <button
              onClick={resetFilters}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restablecer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="input-field pl-9"
              placeholder="Buscar por nombre, email, teléfono, IG..."
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setFilters({
                  argentina_only: filters.argentina_only === true ? undefined : true,
                });
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              className={cn(
                "input-field flex items-center justify-between cursor-pointer text-left",
                filters.argentina_only === true &&
                  "border-accent-cyan bg-accent-cyan/10 text-text-primary"
              )}
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-accent-cyan" />
                {filters.argentina_only === true
                  ? "🇦🇷 Solo Argentina"
                  : "País: Todos"}
              </span>
            </button>
          </div>

          <div>
            <select
              className="select-field"
              value={filters.tipo ?? ""}
              onChange={(e) => {
                setFilters({ tipo: (e.target.value as LeadTipo) || undefined });
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <option value="">Tipo: Todos</option>
              {TIPOS_OPT.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="select-field"
              value={filters.ubicacion ?? ""}
              onChange={(e) => {
                setFilters({ ubicacion: e.target.value || undefined });
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            >
              <option value="">Ubicación: Todas</option>
              {UBICACIONES_OPT.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-glass-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
            <Filter className="w-3.5 h-3.5" />
            Activos:
            {filters.argentina_only && (
              <ArgentinaBadge es_argentina={true} />
            )}
            {filters.tipo && <TipoBadge tipo={filters.tipo} />}
            {filters.ubicacion && (
              <span className="badge badge-default">
                <MapPin className="w-3 h-3" />
                {filters.ubicacion}
              </span>
            )}
            {searchDebounced && (
              <span className="badge badge-default">
                <Search className="w-3 h-3" />
                "{searchDebounced}"
              </span>
            )}
            {!hasActiveFilters && (
              <span className="italic opacity-75">Ningún filtro aplicado</span>
            )}
          </div>

          <div className="relative group">
            <button
              className="btn-primary text-sm"
              disabled={totalCount === 0 || isLoading}
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-30 min-w-[180px]">
              <div className="glass-card p-2 shadow-2xl">
                {(["xlsx", "csv", "json"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    disabled={exporting === fmt || totalCount === 0}
                    onClick={() => handleExport(fmt)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {exporting === fmt ? (
                      <span className="w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-accent-cyan" />
                    )}
                    <span className="font-semibold uppercase text-xs mr-1 opacity-75">
                      {fmt}
                    </span>
                    <span className="ml-auto text-text-muted">
                      {fmt === "xlsx"
                        ? "Excel"
                        : fmt === "csv"
                        ? "Hoja de cálculo"
                        : "Datos brutos"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="opacity-0 animate-stagger-3">
        {totalCount === 0 && !isLoading ? (
          <div className="glass-card gradient-border-top">
            <Empty
              variant="data"
              title="Sin leads para mostrar"
              description="Sube un archivo Excel en la sección Subir Datos para poblar el explorador."
            />
          </div>
        ) : (
          <DataTable
            data={leads}
            onRowClick={onRowClick}
            pagination={pagination}
            onPaginationChange={setPagination}
            enableGlobalFilter={false}
            showControls={false}
            manualPagination={true}
            totalCount={totalCount}
            loading={isLoading}
            emptyMessage="No se encontraron leads con los filtros aplicados."
          />
        )}
      </section>

      <LeadProfileModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          selectLead(null);
        }}
        lead={selectedLead}
      />
    </div>
  );
}
