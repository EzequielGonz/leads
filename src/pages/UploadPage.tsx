import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DropzoneUpload from "@/components/DropzoneUpload";
import DataTable from "@/components/DataTable";
import { useToast } from "@/components/Toast";
import {
  uploadFile,
  getUploadStatus,
  suggestColumns,
  type Lead,
  type FileImportResult,
} from "@/lib/api";
import { useLeadsStore } from "@/store/useLeadsStore";
import {
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Columns3,
  Eye,
  Sparkles,
  AlertCircle,
  FileSpreadsheet,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TARGET_FIELDS = [
  { key: "nombre", label: "Nombre", required: false },
  { key: "apellido", label: "Apellido", required: false },
  { key: "email", label: "Email", required: false },
  { key: "telefono", label: "Teléfono", required: false },
  { key: "instagram", label: "Instagram", required: false },
  { key: "linkedin", label: "LinkedIn", required: false },
  { key: "website", label: "Website", required: false },
  { key: "ubicacion", label: "Ubicación", required: false },
  { key: "tipo_perfil", label: "Tipo de Perfil", required: false },
  { key: "biography", label: "Biografía / Descripción", required: false },
];

export default function UploadPage() {
  const navigate = useNavigate();
  const bumpData = useLeadsStore((s) => s.bumpDataVersion);
  const addLeads = useLeadsStore((s) => s.addLeads);
  const prependRecentFile = useLeadsStore((s) => s.prependRecentFile);
  const { success, info, error } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedResult, setProcessedResult] =
    useState<FileImportResult | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [totalRowsImported, setTotalRowsImported] = useState(0);

  const previewData: Lead[] = useMemo(() => {
    return processedResult?.preview_rows ?? [];
  }, [processedResult]);

  useEffect(() => {
    if (columns.length > 0) {
      suggestColumns(columns)
        .then((res) => {
          if (res?.mapping && Object.keys(res.mapping).length > 0) {
            setMapping((prev) => ({ ...res.mapping, ...prev }));
          }
        })
        .catch(() => undefined);
    }
  }, [columns]);

  const handleFileSelected = (f: File) => {
    setFile(f);
    setProcessedResult(null);
    setColumns([]);
    setMapping({});
    setTotalRowsImported(0);
  };

  const handleProcess = async (f: File) => {
    setProcessing(true);
    try {
      // Step 1: Upload file (returns immediately with file_id)
      const result = await uploadFile(f);
      const fileId = result.file_id;

      info(
        "Archivo subido",
        `Procesando ${result.columns_detected?.length ?? 0} columnas en segundo plano...`
      );

      // Step 2: Poll for processing status
      let done = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 300; // 5 min max

      while (!done && attempts < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;
        try {
          const status = await getUploadStatus(fileId);
          if (status.status === "done") {
            done = true;
            const finalResult: FileImportResult = {
              file_id: fileId,
              filename: result.filename,
              total_rows: status.total_rows,
              columns_detected: status.columns,
              leads: [],
              preview_rows: [],
              sheet_names: status.sheet_names,
            };
            setProcessedResult(finalResult);
            setColumns(status.columns || []);
            setTotalRowsImported(status.total_rows ?? 0);
            setProcessing(false);
            success(
              "Archivo procesado correctamente",
              `Se detectaron ${status.columns?.length ?? 0} columnas y ${
                status.total_rows ?? 0
              } leads guardados.`
            );
            info("Mapeo de columnas", "Asocia cada columna si el automático no fue perfecto.");
            try {
              const sug = await suggestColumns(status.columns || []);
              if (sug?.mapping) {
                setMapping(sug.mapping);
              }
            } catch {}
          } else if (status.status === "error") {
            done = true;
            setProcessing(false);
            error(
              "Error al procesar archivo",
              status.error || "Error desconocido durante el procesamiento."
            );
          }
          // else: still processing, keep polling
        } catch {
          // status endpoint might not be ready yet, keep trying
        }
      }

      if (!done) {
        setProcessing(false);
        error(
          "Tiempo de espera agotado",
          "El procesamiento tardó demasiado. Verificá si el archivo aparece en Explorar Datos."
        );
      }
    } catch (e: any) {
      setProcessing(false);
      error(
        "Error al procesar archivo",
        e?.error || e?.message || "Asegúrese de que sea un Excel/CSV válido."
      );
    }
  };

  const handleMapColumn = (targetKey: string, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === "__none__") delete next[targetKey];
      else next[targetKey] = value;
      return next;
    });
  };

  const handleAutoMap = async () => {
    try {
      const sug = await suggestColumns(columns);
      if (sug?.mapping) {
        setMapping(sug.mapping);
        success(
          "Mapeo automático aplicado",
          `${Object.keys(sug.mapping).length} campos detectados.`
        );
      } else {
        success("Sin sugerencias adicionales", "No se detectaron campos extra.");
      }
    } catch {
      error("No se pudo aplicar mapeo automático", "Intentalo manualmente.");
    }
  };

  const handleConfirmImport = async () => {
    if (!processedResult) return;
    setImporting(true);
    try {
      // Leads are already saved to DB by the backend upload endpoint
      // Just refresh the frontend store
      prependRecentFile({
        id: processedResult.file_id,
        filename: processedResult.filename,
        total_rows: processedResult.total_rows,
        columns_detected: processedResult.columns_detected ?? [],
        uploaded_at: new Date().toISOString(),
        sheet_names: processedResult.sheet_names,
      });
      bumpData();
      setImporting(false);
      success(
        "¡Importación completada!",
        `${(processedResult.total_rows ?? 0).toLocaleString("es-AR")} leads guardados en la base de datos.`
      );
      setTimeout(() => navigate("/"), 900);
    } catch (e: any) {
      setImporting(false);
      error("Error al importar", e?.error || e?.message || "Intente nuevamente.");
    }
  };

  const processed = !!processedResult;

  return (
    <div className="space-y-6 max-w-[1300px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-1.5">
              Subir Archivos
            </h1>
            <p className="text-text-muted text-sm sm:text-base">
              Sube tu Excel (.xlsx, .xls) o CSV (.csv). El sistema analizará y
              detectará automáticamente datos argentinos, contactos y perfiles.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="badge badge-default">
              <FileSpreadsheet className="w-3 h-3" />
              .xlsx / .xls / .csv
            </span>
            <span className="badge badge-default">Hasta 100 MB</span>
          </div>
        </div>

        <div className="opacity-0 animate-stagger-2">
          <DropzoneUpload
            onFileSelected={handleFileSelected}
            onProcess={handleProcess}
            processing={processing}
            processed={processed}
          />
        </div>
      </section>

      {processed && (
        <>
          <section className="glass-card gradient-border-top p-5 sm:p-6 opacity-0 animate-stagger-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Columns3 className="w-4.5 h-4.5 text-accent-cyan" />
                  <h2 className="section-title text-lg">
                    Columnas detectadas
                  </h2>
                </div>
                <p className="section-subtitle">
                  Se detectaron {columns.length} columnas. Los análisis automáticos
                  (email, teléfono, Instagram, ubicación Argentina, tipo de perfil)
                  ya se ejecutaron del lado del servidor. Podés mapear manualmente
                  si querés sobreescribir algún campo.
                </p>
              </div>
              <button onClick={handleAutoMap} className="btn-secondary text-sm">
                <Sparkles className="w-4 h-4 text-accent-gold" />
                Re-aplicar sugerencias
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TARGET_FIELDS.map((t) => (
                <div
                  key={t.key}
                  className="p-3 rounded-xl bg-bg-primary/40 border border-glass-border/60"
                >
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    {t.label}
                    {t.required && (
                      <span className="text-red-400 ml-0.5">*</span>
                    )}
                  </label>
                  <select
                    className="select-field text-sm"
                    value={mapping[t.key] ?? "__none__"}
                    onChange={(e) => handleMapColumn(t.key, e.target.value)}
                  >
                    <option value="__none__">— Automático / Sin asignar —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {mapping[t.key] && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Asignado:{" "}
                      <span className="font-medium">{mapping[t.key]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card gradient-border-top p-5 sm:p-6 opacity-0 animate-stagger-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4.5 h-4.5 text-accent-gold" />
                  <h2 className="section-title text-lg">Vista previa</h2>
                </div>
                <p className="section-subtitle">
                  Primeras {previewData.length} filas (de {totalRowsImported.toLocaleString("es-AR")}
                  ) con análisis ya aplicados.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="badge badge-argentina">
                  🇦🇷 {previewData.filter((l) => l.es_argentina).length} AR
                </span>
                <span className="badge badge-default">
                  <Database className="w-3 h-3" />
                  {previewData.filter((l) => l.email).length} 📧 emails
                </span>
                <span className="badge badge-default">
                  📸 {previewData.filter((l) => l.instagram).length} IG
                </span>
              </div>
            </div>
            {previewData.length > 0 ? (
              <DataTable
                data={previewData}
                compact
                showControls={false}
                enablePagination={false}
                pageSize={Math.min(5, previewData.length)}
              />
            ) : (
              <div className="text-center py-10 text-text-muted text-sm">
                Sin datos de preview
              </div>
            )}
          </section>

          <section className="opacity-0 animate-stagger-5">
            <div
              className={cn(
                "glass-card gradient-border-top p-5 sm:p-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4",
                "ring-1 ring-accent-cyan/20 shadow-glow"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center shrink-0">
                  <UploadCloud className="w-5.5 h-5.5 text-accent-cyan" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-text-primary text-lg">
                    Confirmar importación
                  </h3>
                  <p className="text-sm text-text-muted">
                    <span className="text-accent-cyan font-semibold">
                      {totalRowsImported.toLocaleString("es-AR")}
                    </span>{" "}
                    filas listas para importar.
                  </p>
                  {totalRowsImported === 0 && (
                    <p className="text-xs text-accent-gold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      No se detectaron filas válidas en el archivo.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => {
                    setFile(null);
                    setProcessedResult(null);
                    setColumns([]);
                    setMapping({});
                  }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || totalRowsImported === 0}
                  className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      Confirmar e importar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
