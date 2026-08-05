import React, { useState } from "react";
import { Dialog, DialogPanel, DialogTitle, Description } from "@headlessui/react";
import {
  X,
  Mail,
  Phone,
  MapPin,
  Globe,
  Instagram,
  Linkedin,
  Building2,
  User,
  Scale,
  Calculator,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  CheckCircle2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArgentinaBadge, TipoBadge } from "@/components/DataTable";
import type { Lead, LeadTipo } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface LeadProfileModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
}

const TIPO_ICONS: Record<string, React.ElementType> = {
  abogado: Scale,
  contador: Calculator,
  medico: Stethoscope,
  empresa: Building2,
  Persona: User,
  Empresa: Building2,
  sin_clasificar: User,
  otro: Users,
  Otro: Users,
};

function Avatar({ lead }: { lead: Lead }) {
  const nombreFull =
    lead.full_name ||
    [lead.nombre, lead.apellido].filter(Boolean).join(" ") ||
    "Lead";
  const initials = nombreFull
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const gradients = [
    "from-primary to-accent-cyan",
    "from-violet-600 to-fuchsia-500",
    "from-accent-gold to-orange-600",
    "from-emerald-600 to-accent-cyan",
  ];
  const rawId = typeof lead.id === "number" ? lead.id : String(lead.id ?? "").length;
  const idx = rawId % gradients.length;

  return (
    <div
      className={cn(
        "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center font-display font-bold text-2xl sm:text-3xl text-white shadow-glow",
        "bg-gradient-to-br",
        gradients[idx]
      )}
      style={{ boxShadow: "0 10px 40px rgba(6, 182, 212, 0.25)" }}
    >
      {initials || "??"}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  copyable,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
  copyable?: boolean;
  href?: string;
}) {
  const { success } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const copyVal =
      typeof value === "string"
        ? value
        : href && typeof href === "string"
        ? href
        : "";
    if (!copyVal) return;
    try {
      await navigator.clipboard.writeText(copyVal);
      setCopied(true);
      success("Copiado al portapapeles", copyVal);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const isEmpty =
    !value ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty && !href) {
    return (
      <div className="p-3 rounded-lg bg-white/[0.02] border border-glass-border/40 opacity-60">
        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider font-semibold mb-1.5">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </div>
        <div className="text-sm text-text-muted italic">No disponible</div>
      </div>
    );
  }

  const renderValue = () => {
    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-accent-cyan hover:text-cyan-300 hover:underline inline-flex items-center gap-1 break-all min-w-0"
        >
          {value}
          <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
        </a>
      );
    }
    return (
      <div className="text-sm text-text-primary break-all min-w-0">{value}</div>
    );
  };

  return (
    <div className="group p-3 rounded-lg bg-white/[0.03] border border-glass-border/60 hover:border-accent-cyan/30 transition-all">
      <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider font-semibold mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="flex items-start justify-between gap-2">
        {renderValue()}
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/10 transition-all"
            title="Copiar"
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Tag({ children, color = "default" }: { children: React.ReactNode; color?: string }) {
  const colorMap: Record<string, string> = {
    default: "bg-white/5 border-glass-border text-text-secondary",
    cyan: "bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan",
    gold: "bg-accent-gold/10 border-accent-gold/30 text-accent-gold",
    purple: "bg-violet-500/10 border-violet-500/30 text-violet-300",
    red: "bg-accent-red/10 border-accent-red/30 text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border",
        colorMap[color] || colorMap.default
      )}
    >
      {children}
    </span>
  );
}

export default function LeadProfileModal({ open, onClose, lead }: LeadProfileModalProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!lead) return null;

  const nombreCompleto =
    lead.full_name ||
    [lead.nombre, lead.apellido].filter(Boolean).join(" ") ||
    "Lead sin nombre";

  const tipoReal: LeadTipo =
    (lead.tipo_perfil as LeadTipo) ?? ((lead as any).tipo as LeadTipo) ?? "sin_clasificar";

  const categorias =
    Array.isArray(lead.categorias_detectadas) && lead.categorias_detectadas.length > 0
      ? lead.categorias_detectadas
      : (lead as any).categoria
      ? [(lead as any).categoria]
      : [];

  const TipoIcon = TIPO_ICONS[tipoReal] ?? TIPO_ICONS["sin_clasificar"] ?? User;

  const biography = lead.biography ?? (lead as any).descripcion;
  const website = lead.website ?? (lead as any).web;
  const esArgentina = lead.es_argentina ?? (lead as any).argentina;

  const knownKeys = new Set([
    "id",
    "source_file",
    "file_id",
    "raw_data",
    "nombre",
    "apellido",
    "full_name",
    "email",
    "telefono",
    "instagram",
    "linkedin",
    "website",
    "ubicacion",
    "es_argentina",
    "tipo_perfil",
    "categorias_detectadas",
    "biography",
    "follower_count",
    "imported_at",
    "web",
    "pais",
    "argentina",
    "tipo",
    "categoria",
    "descripcion",
  ]);

  const rawKeys = Object.keys(lead).filter((k) => !knownKeys.has(k));

  const cleanIg =
    lead.instagram && typeof lead.instagram === "string"
      ? lead.instagram.replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/$/, "")
      : lead.instagram;

  const cleanLi =
    lead.linkedin && typeof lead.linkedin === "string"
      ? lead.linkedin.startsWith("http")
        ? lead.linkedin
        : `https://www.linkedin.com/in/${lead.linkedin.replace(/.*linkedin\.com\/in\//, "").replace(/\/$/, "")}`
      : undefined;

  const cleanWeb =
    website && typeof website === "string"
      ? website.startsWith("http")
        ? website
        : `https://${website}`
      : undefined;

  return (
    <Dialog
      open={open}
      as="div"
      className="relative z-50 focus:outline-none"
      onClose={onClose}
    >
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          <DialogPanel
            transition
            className={cn(
              "relative w-full max-w-3xl origin-top transform rounded-2xl",
              "bg-bg-secondary/90 backdrop-blur-2xl border border-glass-border",
              "shadow-2xl shadow-black/50",
              "data-[closed]:opacity-0 data-[closed]:scale-95 data-[enter]:duration-300 data-[leave]:duration-200 transition-all"
            )}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-accent-cyan to-accent-gold rounded-t-2xl" />

            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
                <Avatar lead={lead} />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="font-display font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
                    {nombreCompleto}
                  </DialogTitle>
                  <Description className="mt-1.5 flex flex-wrap items-center gap-2">
                    <TipoBadge tipo={tipoReal} />
                    <ArgentinaBadge
                      es_argentina={esArgentina === true}
                      ubicacion={lead.ubicacion as string}
                    />
                    {categorias
                      .filter((c) => c && c !== tipoReal)
                      .map((c, i) => (
                        <Tag key={i} color={["cyan", "gold", "purple"][i % 3]}>
                          <TipoIcon className="w-3 h-3" />
                          {String(c)}
                        </Tag>
                      ))}
                    {lead.source_file && (
                      <Tag color="purple">
                        <Building2 className="w-3 h-3" />
                        {String(lead.source_file)}
                      </Tag>
                    )}
                  </Description>
                  {biography && (
                    <p className="mt-3 text-sm text-text-secondary leading-relaxed">
                      {biography as string}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  icon={Mail}
                  label="Email"
                  value={lead.email as string}
                  href={lead.email ? `mailto:${lead.email}` : undefined}
                  copyable
                />
                <Field
                  icon={Phone}
                  label="Teléfono"
                  value={lead.telefono as string}
                  href={
                    lead.telefono
                      ? `tel:${String(lead.telefono).replace(/[^+\d]/g, "")}`
                      : undefined
                  }
                  copyable
                />
                <Field
                  icon={Instagram}
                  label="Instagram"
                  value={cleanIg ? `@${cleanIg}` : undefined}
                  href={cleanIg ? `https://instagram.com/${cleanIg}` : undefined}
                  copyable
                />
                <Field
                  icon={Linkedin}
                  label="LinkedIn"
                  value={
                    lead.linkedin
                      ? String(lead.linkedin).replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")
                      : undefined
                  }
                  href={cleanLi}
                  copyable
                />
                <Field
                  icon={Globe}
                  label="Sitio Web"
                  value={website as string}
                  href={cleanWeb}
                  copyable
                />
                <Field
                  icon={MapPin}
                  label="Ubicación"
                  value={lead.ubicacion as string}
                  copyable
                />
              </div>

              {lead.raw_data &&
              typeof lead.raw_data === "object" &&
              Object.keys(lead.raw_data).length > 0 ? (
                <div className="border-t border-glass-border/60 pt-4">
                  <button
                    onClick={() => setShowRaw((s) => !s)}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-sm font-semibold text-text-secondary font-display">
                      Datos originales ({Object.keys(lead.raw_data).length} campos)
                    </span>
                    {showRaw ? (
                      <ChevronUp className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                    )}
                  </button>
                  {showRaw && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                      {Object.entries(lead.raw_data as Record<string, unknown>)
                        .filter(([, v]) => v != null && String(v).trim() !== "")
                        .map(([k, v]) => {
                          const valueStr =
                            typeof v === "object" ? JSON.stringify(v, null, 0) : String(v ?? "");
                          return (
                            <div
                              key={k}
                              className="p-2.5 rounded-lg bg-bg-primary/50 border border-glass-border/50 text-xs"
                            >
                              <div className="text-text-muted uppercase tracking-wider font-semibold text-[10px] mb-1">
                                {k}
                              </div>
                              <div className="text-text-secondary break-all line-clamp-2">
                                {valueStr || "—"}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : rawKeys.length > 0 ? (
                <div className="border-t border-glass-border/60 pt-4">
                  <button
                    onClick={() => setShowRaw((s) => !s)}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-sm font-semibold text-text-secondary font-display">
                      Datos adicionales ({rawKeys.length} campos)
                    </span>
                    {showRaw ? (
                      <ChevronUp className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
                    )}
                  </button>
                  {showRaw && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                      {rawKeys.map((k) => {
                        const v = (lead as any)[k];
                        const valueStr =
                          typeof v === "object" ? JSON.stringify(v, null, 0) : String(v ?? "");
                        return (
                          <div
                            key={k}
                            className="p-2.5 rounded-lg bg-bg-primary/50 border border-glass-border/50 text-xs"
                          >
                            <div className="text-text-muted uppercase tracking-wider font-semibold text-[10px] mb-1">
                              {k}
                            </div>
                            <div className="text-text-secondary break-all line-clamp-2">
                              {valueStr || "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 p-5 sm:px-8 border-t border-glass-border/60 bg-bg-primary/30 rounded-b-2xl">
              <button onClick={onClose} className="btn-secondary">
                Cerrar perfil
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
