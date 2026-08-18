import React, { useEffect, useMemo, useState } from "react";
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
  FileSpreadsheet,
  ChevronDown,
  Trash2,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import DataTable, { ArgentinaBadge, TipoBadge } from "@/components/DataTable";
import LeadProfileModal from "@/components/LeadProfileModal";
import Empty from "@/components/Empty";
import { useToast } from "@/components/Toast";
import useLeadsStore from "@/store/useLeadsStore";
import {
  clearAllData,
  exportLeads,
  getFiles,
  getLeads,
  getWhatsAppTemplates,
  sendWhatsAppTestMessage,
  type FileInfo,
  type Lead,
  type LeadTipo,
} from "@/lib/api";
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

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

async function fetchAllLeadsForFile(fileId: string, base: Record<string, unknown>) {
  const all: Lead[] = [];
  let page = 1;
  let total = 0;
  while (true) {
    const res = await getLeads({ ...base, file_id: fileId, page, size: 500 });
    all.push(...res.data);
    total = res.total;
    if (res.data.length < 500 || all.length >= total) break;
    page += 1;
  }
  return { leads: all, total };
}

export default function ExplorerPage() {
  const {
    selectedLead,
    selectLead,
    filters,
    setFilters,
    resetFilters,
    lastImportTimestamp,
    clearAll,
  } = useLeadsStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search ?? "");
  const [searchDebounced, setSearchDebounced] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sendTarget, setSendTarget] = useState<Lead | null>(null);
  const [sending, setSending] = useState(false);
  const [sendForm, setSendForm] = useState<{
    message_type: "text" | "template";
    body: string;
    template_name: string;
    template_language: string;
    template_variables: string;
  }>({
    message_type: "template",
    body: "Hola {{full_name}}, te escribimos desde Estudio Juridico Vita.",
    template_name: "",
    template_language: "es_AR",
    template_variables: `{{full_name}}\n[Nombre del asesor]\n[Nombre del estudio]`,
  });
  const { success, info, error } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(localSearch), 400);
    return () => clearTimeout(t);
  }, [localSearch]);

  const filesQuery = useQuery({
    queryKey: ["explorer-files", lastImportTimestamp],
    queryFn: getFiles,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const files = filesQuery.data?.files ?? [];

  const fileLeadsQuery = useQuery({
    queryKey: [
      "explorer-leads-by-file",
      files.map((f) => f.id).join("|"),
      searchDebounced,
      filters.argentina_only,
      filters.tipo,
      filters.ubicacion,
      lastImportTimestamp,
    ],
    queryFn: async () => {
      const base = {
        search: searchDebounced || undefined,
        argentina_only: filters.argentina_only,
        tipo: filters.tipo,
        ubicacion: filters.ubicacion,
      };
      const byFile: Record<string, { leads: Lead[]; total: number }> = {};
      for (const f of files) {
        byFile[f.id] = await fetchAllLeadsForFile(f.id, base);
      }
      return byFile;
    },
    enabled: files.length > 0,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const sendTemplatesQuery = useQuery({
    queryKey: ["explorer-send-templates", Boolean(sendTarget)],
    queryFn: getWhatsAppTemplates,
    enabled: Boolean(sendTarget),
    staleTime: 60_000,
    retry: false,
  });
  const sendTemplates = sendTemplatesQuery.data?.data ?? [];

  const totalCount = useMemo(
    () =>
      files.reduce(
        (acc, f) => acc + (fileLeadsQuery.data?.[f.id]?.total ?? 0),
        0
      ),
    [files, fileLeadsQuery.data]
  );

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

  const handleClearAll = async () => {
    if (
      !window.confirm(
        "¿Borrar TODOS los datos? Se eliminarán todos los leads, los archivos subidos y la información importada. Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await clearAllData();
      clearAll();
      setExpanded({});
      success(
        "Datos borrados",
        `Se eliminaron ${res.deleted_leads} leads y ${res.deleted_files} archivo(s).`
      );
      await filesQuery.refetch();
    } catch (e) {
      error(
        "No se pudieron borrar los datos",
        e instanceof Error ? e.message : "Intente nuevamente."
      );
    } finally {
      setDeleting(false);
    }
  };

  const toggleFile = (fileId: string) => {
    setExpanded((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const openSendModal = (lead: Lead) => {
    setSendTarget(lead);
    setSendForm((prev) => ({
      ...prev,
      template_name: prev.template_name || "",
    }));
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sendTarget) return;
    setSending(true);
    try {
      const templateName =
        sendForm.message_type === "template"
          ? sendForm.template_name || sendTemplates[0]?.name || ""
          : "";
      await sendWhatsAppTestMessage({
        to: sendTarget.telefono ?? "",
        message_type: sendForm.message_type,
        body: sendForm.body,
        template_name: templateName,
        template_language: sendForm.template_language,
        template_variables: sendForm.template_variables
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      success(
        "Mensaje enviado",
        `Se envió a ${sendTarget.full_name || sendTarget.telefono}.`
      );
      setSendTarget(null);
    } catch (e) {
      error(
        "No se pudo enviar el mensaje",
        e instanceof Error ? e.message : "Intente nuevamente."
      );
    } finally {
      setSending(false);
    }
  };

  const hasActiveFilters =
    filters.argentina_only !== undefined ||
    !!filters.tipo ||
    !!filters.ubicacion ||
    !!searchDebounced;

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-1">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-1.5">
              Explorar Datos
            </h1>
            <p className="text-text-muted text-sm sm:text-base">
              Cada archivo Excel subido se muestra por separado. Abrí el que
              quieras para ver sus leads.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-argentina">
              <Users className="w-3 h-3" />
              {totalCount.toLocaleString("es-AR")} totales
            </span>
            <button
              onClick={() => {
                void fileLeadsQuery.refetch();
                void filesQuery.refetch();
              }}
              className="btn-secondary text-xs py-1.5 px-3"
              title="Refrescar datos"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5",
                  (fileLeadsQuery.isRefetching || filesQuery.isFetching) &&
                    "animate-spin"
                )}
              />
              Refrescar
            </button>
            <button
              onClick={() => void handleClearAll()}
              disabled={deleting || totalCount === 0}
              className="text-xs py-1.5 px-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 hover:bg-red-500/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Borrar todos los datos"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Borrar todos los datos
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
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setFilters({
                  argentina_only:
                    filters.argentina_only === true ? undefined : true,
                });
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
              onChange={(e) =>
                setFilters({ tipo: (e.target.value as LeadTipo) || undefined })
              }
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
              onChange={(e) =>
                setFilters({ ubicacion: e.target.value || undefined })
              }
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
            {filters.argentina_only && <ArgentinaBadge es_argentina={true} />}
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
              disabled={totalCount === 0 || fileLeadsQuery.isLoading}
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
        {filesQuery.isLoading && files.length === 0 ? (
          <div className="glass-card gradient-border-top p-16 flex items-center justify-center text-text-muted gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando archivos...
          </div>
        ) : files.length === 0 ? (
          <div className="glass-card gradient-border-top">
            <Empty
              variant="data"
              title="Sin archivos para mostrar"
              description="Sube un archivo Excel en la sección Subir Archivos para poblarlo. Cada archivo se muestra por separado."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file: FileInfo) => {
              const isOpen = !!expanded[file.id];
              const fileData = fileLeadsQuery.data?.[file.id];
              const leads = fileData?.leads ?? [];
              const count =
                fileData?.total ?? file.total_rows ?? leads.length;
              const isLoadingFile = fileLeadsQuery.isLoading && !fileData;
              return (
                <div
                  key={file.id}
                  className="glass-card gradient-border-top overflow-hidden"
                >
                  <button
                    onClick={() => toggleFile(file.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-semibold text-text-primary truncate">
                        {file.filename}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {count.toLocaleString("es-AR")} leads · subido el{" "}
                        {formatDate(file.uploaded_at)}
                      </div>
                    </div>
                    <span className="badge badge-default shrink-0">
                      <Users className="w-3 h-3" />
                      {count.toLocaleString("es-AR")}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-text-muted shrink-0 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-glass-border/60">
                      {isLoadingFile ? (
                        <div className="p-12 flex items-center justify-center text-text-muted gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Cargando leads...
                        </div>
                      ) : leads.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">
                          No se encontraron leads en este archivo con los
                          filtros aplicados.
                        </div>
                      ) : (
                        <DataTable
                          data={leads}
                          onRowClick={onRowClick}
                          enableGlobalFilter={false}
                          showControls={false}
                          emptyMessage="No se encontraron leads con los filtros aplicados."
                          rowActions={(lead) => {
                            openSendModal(lead);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

      {sendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => !sending && setSendTarget(null)}
          />
          <form
            onSubmit={handleSendMessage}
            className="relative w-full max-w-lg glass-card gradient-border-top p-5 sm:p-6 shadow-2xl animate-fade-up"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h3 className="font-display font-bold text-lg text-text-primary flex items-center gap-2">
                  <Send className="w-4 h-4 text-accent-cyan" />
                  Enviar mensaje
                </h3>
                <p className="text-sm text-text-muted truncate mt-0.5">
                  {sendTarget.full_name || "Sin nombre"} ·{" "}
                  <span className="text-text-secondary font-medium">
                    {sendTarget.telefono}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSendTarget(null)}
                disabled={sending}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Tipo de envío
                </label>
                <select
                  className="select-field"
                  value={sendForm.message_type}
                  onChange={(e) =>
                    setSendForm((prev) => ({
                      ...prev,
                      message_type: e.target.value as "text" | "template",
                    }))
                  }
                >
                  <option value="template">Plantilla aprobada</option>
                  <option value="text">Texto libre</option>
                </select>
              </div>

              {sendForm.message_type === "template" ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-2 block">
                      Plantilla
                    </label>
                    <select
                      className="select-field"
                      value={sendForm.template_name || sendTemplates[0]?.name || ""}
                      onChange={(e) =>
                        setSendForm((prev) => ({
                          ...prev,
                          template_name: e.target.value,
                        }))
                      }
                    >
                      {sendTemplates.length === 0 ? (
                        <option value="">Sin plantillas (verificá WhatsApp)</option>
                      ) : (
                        sendTemplates.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name} ({t.status})
                          </option>
                        ))
                      )}
                    </select>
                    {sendTemplates.length === 0 && (
                      <p className="text-xs text-text-muted mt-1.5">
                        No se pudieron cargar plantillas. Revisá la conexión de
                        WhatsApp en el panel correspondiente.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-secondary mb-2 block">
                      Variables (una por línea)
                    </label>
                    <textarea
                      className="input-field resize-y"
                      rows={3}
                      value={sendForm.template_variables}
                      onChange={(e) =>
                        setSendForm((prev) => ({
                          ...prev,
                          template_variables: e.target.value,
                        }))
                      }
                      placeholder="{{full_name}}&#10;[Nombre del asesor]&#10;[Nombre del estudio]"
                    />
                    <p className="text-xs text-text-muted mt-1.5">
                      Puedés usar variables del lead como{" "}
                      <code className="text-accent-cyan">{"{{full_name}}"}</code>{" "}
                      o{" "}
                      <code className="text-accent-cyan">{"{{lesion}}"}</code>.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Texto
                  </label>
                  <textarea
                    className="input-field resize-y"
                    rows={4}
                    value={sendForm.body}
                    onChange={(e) =>
                      setSendForm((prev) => ({ ...prev, body: e.target.value }))
                    }
                  />
                  <p className="text-xs text-text-muted mt-1.5">
                    El texto libre solo aplica dentro de la ventana de 24 horas;
                    para contactos nuevos usá plantilla aprobada.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Se enviará a {sendTarget.telefono} por el número Business
                configurado.
              </span>
              <button
                type="submit"
                disabled={sending}
                className="btn-primary px-5 py-3 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending ? "Enviando..." : "Enviar mensaje"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
