import React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, User, Phone, Calendar, MapPin, Clock, HeartPulse } from "lucide-react";
import { getWhatsAppBotConversations } from "@/lib/api";

function formatDate(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function CasosADerivarPage() {
  const conversationsQuery = useQuery({
    queryKey: ["bot-conversations"],
    queryFn: () => getWhatsAppBotConversations(true),
    refetchInterval: 10_000,
  });

  const closedConversations = (conversationsQuery.data?.data ?? []).filter(
    (c) => c.closed
  );

  return (
    <section className="glass-card gradient-border-top p-6 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle className="w-6 h-6 text-emerald-300" />
          Casos a Derivar
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Conversaciones finalizadas listas para ser derivadas a un profesional.
        </p>
      </div>

      {closedConversations.length === 0 ? (
        <div className="text-center text-text-muted py-12">
          Aun no hay casos a derivar.
        </div>
      ) : (
        <div className="space-y-4">
          {closedConversations.map((conv, index) => (
            <div
              key={conv.phone_e164 || `closed-${index}`}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary text-lg">
                      {conv.lead_name || "Sin nombre"}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-text-muted mt-0.5">
                      <Phone className="w-3 h-3" />
                      {conv.phone_e164 || "Telefono no identificado"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {conv.close_reason || "Cerrado"}
                  </span>
                  <div className="text-xs text-text-muted mt-1">
                    {formatDate(conv.closed_at || conv.updated_at)}
                  </div>
                </div>
              </div>

              {/* Details */}
              {conv.data && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {conv.data.menu_antiguedad_label && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Antiguedad:</span>
                      <span className="text-text-primary font-medium">{conv.data.menu_antiguedad_label}</span>
                    </div>
                  )}
                  {conv.data.menu_lugar_label && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Lugar:</span>
                      <span className="text-text-primary font-medium">{conv.data.menu_lugar_label}</span>
                    </div>
                  )}
                  {conv.data.menu_horario && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Horario:</span>
                      <span className="text-text-primary font-medium">{conv.data.menu_horario}</span>
                    </div>
                  )}
                  {conv.data.menu_lesion && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <HeartPulse className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Lesion:</span>
                      <span className="text-text-primary font-medium">{conv.data.menu_lesion}</span>
                    </div>
                  )}
                  {conv.data.barrio && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Barrio:</span>
                      <span className="text-text-primary font-medium">{conv.data.barrio}</span>
                    </div>
                  )}
                  {conv.data.ubicacion && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">Localidad:</span>
                      <span className="text-text-primary font-medium">{conv.data.ubicacion}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
