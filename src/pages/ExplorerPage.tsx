import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  Download,
  Upload,
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
  exportData,
  exportLeads,
  getFiles,
  getLeads,
  getWhatsAppTemplates,
  importData,
  sendWhatsAppTestMessage,
  startBatchSend,
  getBatchStatus,
  cancelBatchSend,
  startAntiSpamBatch,
  stopAntiSpamBatch,
  pauseAntiSpamBatch,
  resumeAntiSpamBatch,
  getAntiSpamBatchStatus,
  type BatchStatus,
  type BatchAntiSpamStatus,
  type FileInfo,
  type Lead,
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
  // Batch send state
  const [batchFileId, setBatchFileId] = useState("");
  const [batchTemplateName, setBatchTemplateName] = useState("");
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  // Anti-spam batch
  const [antiSpamStatus, setAntiSpamStatus] = useState<BatchAntiSpamStatus | null>(null);

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
      filters.barrio,
      filters.ubicacion,
      lastImportTimestamp,
    ],
    queryFn: async () => {
      const base = {
        search: searchDebounced || undefined,
        argentina_only: filters.argentina_only,
        barrio: filters.barrio,
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
    queryKey: ["explorer-send-templates"],
    queryFn: getWhatsAppTemplates,
    enabled: Boolean(sendTarget) || showBatchPanel,
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
        barrio: filters.barrio,
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

  // Batch send handlers
  const handleStartBatch = async () => {
    if (!batchFileId || !batchTemplateName) {
      error("Faltan datos", "Seleccioná un archivo y una plantilla.");
      return;
    }
    setBatchLoading(true);
    try {
      await startBatchSend({
        file_id: batchFileId,
        template_name: batchTemplateName,
        template_language: "es_AR",
      });
      success("Envio iniciado", "Los mensajes se enviarian automaticamente.");
      // Start polling
      pollBatchStatus();
    } catch (e) {
      error("No se pudo iniciar", e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setBatchLoading(false);
    }
  };

  const handleCancelBatch = async () => {
    try {
      await cancelBatchSend();
      info("Cancelado", "El envio fue cancelado.");
      setBatchStatus(null);
    } catch (e) {
      error("Error", "No se pudo cancelar.");
    }
  };

  const pollBatchStatus = async () => {
    const poll = async () => {
      try {
        const status = await getBatchStatus();
        setBatchStatus(status);
        if (status.running) {
          setTimeout(poll, 3000);
        }
      } catch {
        // ignore
      }
    };
    poll();
  };

  // Poll on mount if batch is running
  useEffect(() => {
    getBatchStatus().then((s) => {
      if (s.running) {
        setBatchStatus(s);
        pollBatchStatus();
      }
    }).catch(() => {});
    // Poll anti-spam status
    pollAntiSpamStatus();
  }, []);

  // Anti-spam handlers
  const handleStartAntiSpam = async () => {
    if (!batchFileId || !batchTemplateName) return;
    try {
      await startAntiSpamBatch({
        file_id: batchFileId,
        template_name: batchTemplateName,
        template_language: "es_AR",
        template_variables: "{{full_name}}\n[asesor]\n[estudio]",
      });
      info("Envio iniciado", "El envio anti-spam esta en marcha.");
      pollAntiSpamStatus();
    } catch (e: any) {
      error("Error", e?.error || e?.message || "No se pudo iniciar.");
    }
  };

  const handleStopAntiSpam = async () => {
    try {
      await stopAntiSpamBatch();
      info("Detenido", "El envio fue detenido.");
      const status = await getAntiSpamBatchStatus();
      setAntiSpamStatus(status);
    } catch (e: any) {
      error("Error", e?.error || "No se pudo detener.");
    }
  };

  const handlePauseAntiSpam = async () => {
    try {
      await pauseAntiSpamBatch();
      info("Pausado", "El envio fue pausado.");
      const status = await getAntiSpamBatchStatus();
      setAntiSpamStatus(status);
    } catch (e: any) {
      error("Error", e?.error || "No se pudo pausar.");
    }
  };

  const handleResumeAntiSpam = async () => {
    try {
      await resumeAntiSpamBatch();
      info("Reanudado", "El envio continuo.");
      pollAntiSpamStatus();
    } catch (e: any) {
      error("Error", e?.error || "No se pudo reanudar.");
    }
  };

  const pollAntiSpamStatus = () => {
    const poll = async () => {
      try {
        const status = await getAntiSpamBatchStatus();
        setAntiSpamStatus(status);
        if (status.active) {
          setTimeout(poll, 3000);
        }
      } catch {
        // ignore
      }
    };
    poll();
  };

  const handleExportData = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success(
        "Datos exportados",
        `Se exportaron ${data.leads.length} leads y ${data.files.length} archivo(s).`
      );
    } catch (e) {
      error(
        "No se pudieron exportar los datos",
        e instanceof Error ? e.message : "Intente nuevamente."
      );
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.leads && !data.files) {
        error("Formato inválido", "El archivo no contiene datos de leads o archivos.");
        return;
      }
      const res = await importData(data);
      success(
        "Datos importados",
        `Se importaron ${res.imported_leads} leads y ${res.imported_files} archivo(s). Recargando...`
      );
      // Recargar todo
      await filesQuery.refetch();
      await fileLeadsQuery.refetch();
    } catch (e) {
      error(
        "No se pudieron importar los datos",
        e instanceof Error ? e.message : "El archivo puede estar corrupto."
      );
    }
  };

  const toggleFile = (fileId: string) => {
    setExpanded((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const openSendModal = (lead: Lead) => {
    setSendTarget(lead);
    const leadName = (lead.full_name || "").trim();
    const leadLesion = (lead.lesion || "").trim();
    setSendForm((prev) => ({
      ...prev,
      template_name: prev.template_name || sendTemplates[0]?.name || "",
      template_variables: [leadName || "[Nombre del lead]", "[Nombre del asesor]", "[Nombre del estudio]"].join("\n"),
      body: `Hola ${leadName || "[Nombre]"}, te escribimos desde Estudio Juridico Vita.${leadLesion ? ` Vimos tu consulta sobre: ${leadLesion}.` : ""}`,
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
        lead_name: sendTarget.full_name || sendTarget.nombre || "",
        lead_id: sendTarget.id || "",
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
    !!filters.barrio ||
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
              onClick={() => void handleExportData()}
              disabled={totalCount === 0}
              className="text-xs py-1.5 px-3 rounded-xl bg-green-500/10 border border-green-500/25 text-green-300 hover:bg-green-500/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar datos a archivo JSON"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
            <label
              className="text-xs py-1.5 px-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Importar datos desde archivo JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              Importar
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportData}
              />
            </label>
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
              value={filters.barrio ?? ""}
              onChange={(e) =>
                setFilters({ barrio: e.target.value || undefined })
              }
            >
              <option value="">Barrio: Todos</option>
              {[...new Set(
                Object.values(fileLeadsQuery.data ?? {})
                  .flatMap((f) => f.leads)
                  .map((l) => (l as any).barrio)
                  .filter((b): b is string => !!b)
              )].sort().map((b) => (
                <option key={b} value={b}>{b}</option>
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
            {filters.barrio && (
              <span className="badge badge-default">
                <MapPin className="w-3 h-3 text-accent-cyan" />
                {filters.barrio}
              </span>
            )}
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

      {/* Anti-Spam Batch Send Section */}
      <section className="glass-card gradient-border-top p-4 sm:p-5 opacity-0 animate-stagger-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-accent-gold" />
            <h3 className="font-display font-semibold text-text-primary">Envio Anti-Spam</h3>
            {antiSpamStatus?.active && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                Activo
              </span>
            )}
            {antiSpamStatus?.paused && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                Pausado
              </span>
            )}
          </div>
          <button
            onClick={() => setShowBatchPanel(!showBatchPanel)}
            className="text-xs py-1.5 px-3 rounded-xl bg-accent-gold/10 border border-accent-gold/25 text-accent-gold hover:bg-accent-gold/20 transition-colors"
          >
            {showBatchPanel ? "Ocultar" : "Configurar envio"}
          </button>
        </div>

        {showBatchPanel && (
          <div className="space-y-4">
            {/* Config */}
            {!antiSpamStatus?.active && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Archivo Excel</label>
                    <select
                      className="input-field w-full"
                      value={batchFileId}
                      onChange={(e) => setBatchFileId(e.target.value)}
                    >
                      <option value="">Seleccionar archivo...</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.filename || f.id} ({f.total_rows} leads)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Plantilla</label>
                    <select
                      className="input-field w-full"
                      value={batchTemplateName}
                      onChange={(e) => setBatchTemplateName(e.target.value)}
                    >
                      <option value="">Seleccionar plantilla...</option>
                      {(sendTemplates || []).map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} ({t.status})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-text-muted bg-white/5 rounded-lg p-3">
                  <strong>Protecciones anti-spam:</strong>
                  <ul className="mt-1 space-y-1 list-disc list-inside">
                    <li>Horario: 9:00 a 21:00</li>
                    <li>Frecuencia: 20-40-50s alternando (nunca fija)</li>
                    <li>Limite: 40-55 mensajes por franja horaria</li>
                    <li>Sin numeros repetidos</li>
                  </ul>
                </div>

                <button
                  onClick={handleStartAntiSpam}
                  disabled={!batchFileId || !batchTemplateName}
                  className="btn-primary text-sm"
                >
                  <Send className="w-4 h-4" />
                  Iniciar envio anti-spam
                </button>
              </>
            )}

            {/* Active Status */}
            {(antiSpamStatus?.active || antiSpamStatus?.paused) && (
              <div className="bg-accent-gold/10 border border-accent-gold/25 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-accent-gold">
                    {antiSpamStatus.paused ? "⏸ Pausado" : "📤 Enviando mensajes..."}
                  </span>
                  <span className="text-xs text-text-muted">
                    {antiSpamStatus.sent_count} / {antiSpamStatus.total_leads} enviados
                    {antiSpamStatus.failed_count > 0 && ` · ${antiSpamStatus.failed_count} fallidos`}
                  </span>
                </div>

                <div className="w-full bg-white/10 rounded-full h-2 mb-3">
                  <div
                    className="bg-accent-gold h-2 rounded-full transition-all duration-500"
                    style={{ width: `${((antiSpamStatus.sent_count + antiSpamStatus.failed_count) / Math.max(1, antiSpamStatus.total_leads)) * 100}%` }}
                  />
                </div>

                {antiSpamStatus.current_lead && (
                  <div className="text-xs text-text-muted mb-2">
                    Enviando a: <strong>{antiSpamStatus.current_lead.nombre}</strong> ({antiSpamStatus.current_lead.telefono})
                    {antiSpamStatus.current_lead.barrio && ` · ${antiSpamStatus.current_lead.barrio}`}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-accent-gold font-bold">{antiSpamStatus.sent_count}</div>
                    <div className="text-text-muted">Enviados</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-green-400 font-bold">{antiSpamStatus.remaining}</div>
                    <div className="text-text-muted">Restantes</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-blue-400 font-bold">{antiSpamStatus.chat_limit}</div>
                    <div className="text-text-muted">Limite chat</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-purple-400 font-bold">{antiSpamStatus.sent_phones_count}</div>
                    <div className="text-text-muted">Numeros unicos</div>
                  </div>
                </div>

                <div className="text-xs text-text-muted mb-3">{antiSpamStatus.hour_status}</div>

                {antiSpamStatus.next_send_in != null && (
                  <div className="text-xs text-text-muted mb-2">
                    Proximo envio en: {Math.round(antiSpamStatus.next_send_in)}s
                  </div>
                )}

                {/* Log */}
                {antiSpamStatus.log && antiSpamStatus.log.length > 0 && (
                  <div className="bg-black/20 rounded-lg p-2 max-h-32 overflow-y-auto mb-3">
                    {antiSpamStatus.log.slice(-10).reverse().map((entry, i) => (
                      <div key={i} className={`text-xs ${entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-yellow-400' : 'text-text-muted'}`}>
                        {entry.message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {!antiSpamStatus.paused ? (
                    <button
                      onClick={handlePauseAntiSpam}
                      className="text-xs py-1.5 px-3 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-yellow-300 hover:bg-yellow-500/20 transition-colors"
                    >
                      ⏸ Pausar
                    </button>
                  ) : (
                    <button
                      onClick={handleResumeAntiSpam}
                      className="text-xs py-1.5 px-3 rounded-lg bg-green-500/10 border border-green-500/25 text-green-300 hover:bg-green-500/20 transition-colors"
                    >
                      ▶ Reanudar
                    </button>
                  )}
                  <button
                    onClick={handleStopAntiSpam}
                    className="text-xs py-1.5 px-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    ⏹ Detener
                  </button>
                </div>
              </div>
            )}

            {/* Completed */}
            {antiSpamStatus?.completed && (
              <div className="bg-green-500/10 border border-green-500/25 rounded-lg p-4">
                <div className="text-sm font-medium text-green-300">✅ Envio completado</div>
                <div className="text-xs text-text-muted mt-1">
                  {antiSpamStatus.sent_count} enviados · {antiSpamStatus.failed_count} fallidos
                </div>
                <button
                  onClick={() => setAntiSpamStatus(null)}
                  className="mt-2 text-xs py-1 px-3 rounded-lg bg-white/5 border border-white/10 text-text-muted hover:bg-white/10 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            )}
          </div>
        )}
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
