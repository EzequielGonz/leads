import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  FileText,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

export interface DropzoneUploadProps {
  onFileSelected?: (file: File) => void;
  onProcess?: (file: File) => Promise<void> | void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  disabled?: boolean;
  processing?: boolean;
  processed?: boolean;
}

const DEFAULT_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
  "application/csv": [".csv"],
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function DropzoneUpload({
  onFileSelected,
  onProcess,
  accept = DEFAULT_ACCEPT,
  maxSize = 50 * 1024 * 1024,
  disabled = false,
  processing = false,
  processed = false,
}: DropzoneUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const { success, error } = useToast();

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File; errors: { code: string; message: string }[] }[]) => {
      if (rejectedFiles.length > 0) {
        const first = rejectedFiles[0];
        const err = first.errors[0];
        if (err?.code === "file-too-large") {
          error(
            "Archivo demasiado grande",
            `El archivo supera el límite de ${formatBytes(maxSize)}.`
          );
        } else if (err?.code === "file-invalid-type") {
          error(
            "Formato no soportado",
            "Solo se admiten archivos Excel (.xlsx, .xls) y CSV (.csv)."
          );
        } else {
          error("Error al subir archivo", err?.message || "Archivo rechazado.");
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const selected = acceptedFiles[0];
        setFile(selected);
        success("Archivo seleccionado", `${selected.name} está listo para procesar.`);
        onFileSelected?.(selected);
      }
    },
    [error, maxSize, onFileSelected, success]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
  } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled: disabled || processing,
  });

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
  };

  const handleProcess = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file || !onProcess) return;
    try {
      await onProcess(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      error("Error al procesar", msg);
    }
  };

  const isXlsx = (name: string) =>
    /\.(xlsx|xls)$/i.test(name);

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "dropzone group",
          isDragActive && "dropzone-active",
          isDragAccept && "ring-2 ring-accent-cyan/40",
          disabled && "opacity-60 cursor-not-allowed",
          file && "py-6"
        )}
      >
        <input {...getInputProps()} />

        {!file ? (
          <div className="flex flex-col items-center justify-center gap-4 py-4">
            <div className="relative">
              <div className="absolute inset-0 bg-accent-cyan/20 blur-2xl rounded-full animate-pulse-slow" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/40 via-accent-cyan/20 to-accent-gold/20 flex items-center justify-center border border-glass-border group-hover:scale-110 transition-transform duration-300">
                <UploadCloud className="w-10 h-10 text-accent-cyan" strokeWidth={1.75} />
              </div>
            </div>
            <div className="space-y-1.5 max-w-md">
              <p className="font-display font-semibold text-text-primary text-lg">
                Arrastra y solta tu archivo aquí
              </p>
              <p className="text-text-muted text-sm">
                o haz click para explorar — admiten{" "}
                <span className="text-accent-cyan font-semibold">.xlsx</span>,{" "}
                <span className="text-accent-cyan font-semibold">.xls</span>,{" "}
                <span className="text-accent-cyan font-semibold">.csv</span>
              </p>
              <p className="text-text-muted text-xs">
                Tamaño máximo: {formatBytes(maxSize)}
              </p>
            </div>

            <div className="flex gap-2 mt-2">
              <span className="badge badge-default">
                <FileSpreadsheet className="w-3 h-3" />
                Excel
              </span>
              <span className="badge badge-default">
                <FileText className="w-3 h-3" /> CSV
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-primary/50 border border-glass-border/60">
              <div
                className={cn(
                  "w-12 h-12 shrink-0 rounded-xl flex items-center justify-center",
                  isXlsx(file.name)
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                    : "bg-blue-500/15 text-blue-300 border border-blue-500/25"
                )}
              >
                {isXlsx(file.name) ? (
                  <FileSpreadsheet className="w-6 h-6" />
                ) : (
                  <FileText className="w-6 h-6" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display font-semibold text-text-primary truncate">
                    {file.name}
                  </p>
                  {processed && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatBytes(file.size)} · Seleccionado correctamente
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!processed && (
                  <>
                    <button
                      onClick={clearFile}
                      disabled={processing}
                      className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                      aria-label="Quitar archivo"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    {onProcess && (
                      <button
                        onClick={handleProcess}
                        disabled={processing}
                        className="btn-primary text-sm"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Procesando
                          </>
                        ) : (
                          <>
                            Procesar
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                {processed && (
                  <span className="badge badge-success badge-argentina bg-emerald-500/10 text-emerald-300 border-emerald-500/25">
                    <CheckCircle2 className="w-3 h-3" /> Procesado
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
