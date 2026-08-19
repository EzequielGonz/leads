import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Radio,
  ShieldCheck,
  Webhook,
  Activity,
  MessagesSquare,
  Bot,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import {
  createWhatsAppCampaign,
  getFiles,
  getLeads,
  getWhatsAppBotConversations,
  getWhatsAppBotStatus,
  getWhatsAppCampaigns,
  getWhatsAppConversations,
  getWhatsAppMessages,
  getWhatsAppStatus,
  getWhatsAppTemplates,
  runWhatsAppBotFollowups,
  sendWhatsAppTestMessage,
  updateWhatsAppBotConfig,
  updateWhatsAppConfig,
  type LeadsQueryParams,
  type WhatsAppBotConversation,
} from "@/lib/api";

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "error" in error) {
    return String((error as { error?: string }).error || "Error inesperado");
  }
  if (error instanceof Error) return error.message;
  return "Error inesperado";
}

function parseVariables(raw: string) {
  return raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const STAGE_LABELS: Record<string, string> = {
  awaiting_status: "Esperando respuesta al primer mensaje",
  awaiting_authorization: "Pidiendo autorización",
  awaiting_resolved_detail: "Consulta por caso resuelto",
  q0: "Verificación de emergencia",
  q1: "Fecha del accidente",
  q2: "Circunstancia del accidente",
  q3: "Relación laboral",
  q4: "Descripción del accidente",
  q5: "Lesión informada",
  q6: "Atención médica",
  q7: "Denuncia ante la ART",
  q8: "Estado del tratamiento",
  q9: "Salud actual",
  q10: "Situación laboral actual",
  q11: "Documentación",
  q12: "Ubicación",
  q13: "Representación profesional",
  awaiting_emergency_offer: "Emergencia: ofreciendo derivación",
  awaiting_optout_confirm: "Confirmando baja",
  awaiting_schedule_offer: "Ofreciendo coordinación",
  awaiting_postpone_choice: "Decisión de postergar",
  awaiting_priority_offer: "Ofreciendo comunicación prioritaria",
  awaiting_close_or_info: "Cierre o información general",
  awaiting_art_rechazo_detail: "Revisando rechazo de ART",
  scheduling_modality: "Eligiendo modalidad",
  scheduling_slot: "Eligiendo horario",
  scheduled: "Turno agendado",
  transferred: "Derivada a profesional",
  closed: "Cerrada",
};

function stageLabel(stage?: string) {
  if (!stage) return "-";
  return STAGE_LABELS[stage] || stage;
}

function botCloseLabel(conv: WhatsAppBotConversation) {
  if (!conv.closed) return conv.appointment_set ? "Turno agendado" : "En curso";
  const reasons: Record<string, string> = {
    baja: "Baja solicitada",
    no_reconoce_consulta: "No reconoce la consulta",
    no_interesado: "No interesado",
    no_autorizo: "No autorizó continuar",
    resuelto: "Caso resuelto",
    ya_tiene_abogado: "Ya tiene abogado",
    informacion_general: "Solo información general",
    postergado: "Postergó decisión",
    rechazo_derivacion: "Rechazó derivación",
    prioridad_declinada: "Declinó prioridad",
  };
  return reasons[conv.close_reason] || conv.close_reason || "Cerrada";
}

const TIPO_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "abogado", label: "Abogados" },
  { value: "contador", label: "Contadores" },
  { value: "medico", label: "Medicos" },
  { value: "empresa", label: "Empresas" },
];

export default function WhatsAppPage() {
  const { success, error, info } = useToast();
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = React.useState(false);
  const [configInitialized, setConfigInitialized] = React.useState(false);

  const [configForm, setConfigForm] = React.useState({
    access_token: "",
    phone_number_id: "",
    business_account_id: "",
    webhook_verify_token: "",
    api_version: "v21.0",
  });

  const [testForm, setTestForm] = React.useState({
    to: "",
    message_type: "text" as "text" | "template",
    body: "Hola {{full_name}}, te escribimos desde Leads AR para continuar la conversacion.",
    template_name: "",
    template_language: "es_AR",
    template_variables: `{{full_name}}\n[Nombre del asesor]\n[Nombre del estudio]`,
  });

  const [campaignForm, setCampaignForm] = React.useState({
    name: "",
    message_type: "template" as "text" | "template",
    text_body:
      "Hola {{full_name}}, vimos tu perfil y queremos contarte una propuesta. Respondeme por este medio si te interesa.",
    template_name: "",
    template_language: "es_AR",
    template_variables: `{{full_name}}\n[Nombre del asesor]\n[Nombre del estudio]`,
    use_bot_first_message: false,
    search: "",
    argentina_only: true,
    tipo: "",
    ubicacion: "",
    file_id: "",
  });

  const [botForm, setBotForm] = React.useState({
    bot_enabled: false,
    bot_study_name: "",
    bot_advisor_name: "",
    bot_consultation_policy: "",
    bot_legal_name: "",
    bot_verification_channel: "",
    bot_slot_1: "",
    bot_slot_2: "",
  });
  const [botInitialized, setBotInitialized] = React.useState(false);
  const [isSavingBot, setIsSavingBot] = React.useState(false);
  const [isRunningFollowups, setIsRunningFollowups] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [isReplying, setIsReplying] = React.useState(false);

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: getWhatsAppStatus,
    staleTime: 5_000,
  });

  const filesQuery = useQuery({
    queryKey: ["files-for-whatsapp"],
    queryFn: getFiles,
    staleTime: 30_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: getWhatsAppTemplates,
    enabled: statusQuery.isSuccess,
    retry: 2,
    staleTime: 30_000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: getWhatsAppCampaigns,
    staleTime: 5_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["whatsapp-messages"],
    queryFn: () => getWhatsAppMessages(20),
    staleTime: 5_000,
  });

  const messagesCount = messagesQuery.data?.data?.length ?? 0;
  useNotificationSound(messagesCount);

  const conversationsQuery = useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: () => getWhatsAppConversations(10),
    staleTime: 5_000,
  });

  const botStatusQuery = useQuery({
    queryKey: ["whatsapp-bot"],
    queryFn: getWhatsAppBotStatus,
    staleTime: 5_000,
  });

  const botConversationsQuery = useQuery({
    queryKey: ["whatsapp-bot-conversations"],
    queryFn: () => getWhatsAppBotConversations(false),
    staleTime: 5_000,
  });

  const previewFilters = React.useMemo<LeadsQueryParams>(
    () => ({
      page: 1,
      size: 1,
      search: campaignForm.search || undefined,
      argentina_only: campaignForm.argentina_only ? true : undefined,
      tipo: campaignForm.tipo || undefined,
      ubicacion: campaignForm.ubicacion || undefined,
      file_id: campaignForm.file_id || undefined,
    }),
    [
      campaignForm.search,
      campaignForm.argentina_only,
      campaignForm.tipo,
      campaignForm.ubicacion,
      campaignForm.file_id,
    ]
  );

  const leadsPreviewQuery = useQuery({
    queryKey: ["whatsapp-campaign-preview", previewFilters],
    queryFn: () => getLeads(previewFilters),
    staleTime: 5_000,
  });

  const refreshAll = React.useCallback(async () => {
    await Promise.all([
      statusQuery.refetch(),
      templatesQuery.refetch(),
      campaignsQuery.refetch(),
      messagesQuery.refetch(),
      conversationsQuery.refetch(),
      leadsPreviewQuery.refetch(),
      botStatusQuery.refetch(),
      botConversationsQuery.refetch(),
    ]);
  }, [botConversationsQuery, botStatusQuery, campaignsQuery, conversationsQuery, leadsPreviewQuery, messagesQuery, statusQuery, templatesQuery]);

  React.useEffect(() => {
    const bot = botStatusQuery.data;
    if (!bot || botInitialized) return;
    setBotForm((prev) => ({
      ...prev,
      bot_enabled: Boolean(bot.config.bot_enabled),
      bot_study_name: bot.config.bot_study_name || "",
      bot_advisor_name: bot.config.bot_advisor_name || "",
      bot_consultation_policy: bot.config.bot_consultation_policy || "",
      bot_legal_name: bot.config.bot_legal_name || "",
      bot_verification_channel: bot.config.bot_verification_channel || "",
      bot_slot_1: bot.config.bot_slot_1 || "",
      bot_slot_2: bot.config.bot_slot_2 || "",
    }));
    setBotInitialized(true);
  }, [botStatusQuery.data, botInitialized]);

  React.useEffect(() => {
    const status = statusQuery.data;
    if (!status || configInitialized) return;
    setConfigForm((prev) => ({
      ...prev,
      phone_number_id: status.config.phone_number_id || "",
      business_account_id: status.config.business_account_id || "",
      api_version: status.config.api_version || "v21.0",
    }));
    setConfigInitialized(true);
  }, [statusQuery.data, configInitialized]);

  React.useEffect(() => {
    const templates = templatesQuery.data?.data ?? [];
    if (!templates.length) return;
    setCampaignForm((prev) =>
      prev.template_name
        ? prev
        : { ...prev, template_name: templates[0]?.name || prev.template_name }
    );
    setTestForm((prev) =>
      prev.template_name
        ? prev
        : { ...prev, template_name: templates[0]?.name || prev.template_name }
    );
  }, [templatesQuery.data]);

  async function handleSaveBot(event: React.FormEvent) {
    event.preventDefault();
    setIsSavingBot(true);
    try {
      await updateWhatsAppBotConfig(botForm);
      success(
        "Bot actualizado",
        "La configuración del asistente de orientación quedó guardada."
      );
      await botStatusQuery.refetch();
    } catch (err) {
      error("No se pudo guardar la configuración del bot", getErrorMessage(err));
    } finally {
      setIsSavingBot(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  }

  function buildTemplateBody() {
    return (
      "Hola {{1}}, ¿cómo estás? Soy {{2}}, del equipo de {{3}}.\n\n" +
      "Te escribo por una consulta que realizaste anteriormente relacionada con un accidente " +
      "laboral. Muchas personas desconocen que, dependiendo del accidente, el tratamiento y las " +
      "posibles secuelas, podrían tener derecho a realizar un reclamo.\n\n" +
      "¿Tu caso todavía está pendiente o ya pudiste resolverlo?"
    );
  }

  function buildTemplateVariables() {
    const advisor = botForm.bot_advisor_name.trim() || "[Nombre del asesor]";
    const study = botForm.bot_study_name.trim() || "[Nombre del estudio]";
    return `{{full_name}}\n${advisor}\n${study}`;
  }

  async function handleCopyTemplate() {
    const ok = await copyToClipboard(buildTemplateBody());
    if (ok) {
      success(
        "Cuerpo copiado",
        "Pegalo en el Cuerpo de la plantilla en WhatsApp Manager, con idioma Español (Argentina)."
      );
    } else {
      error("No se pudo copiar", "Copiá el texto manualmente desde el preview.");
    }
  }

  async function handleCopyTemplateVariables() {
    const ok = await copyToClipboard(buildTemplateVariables());
    if (ok) {
      success(
        "Variables copiadas",
        "Pegalas en 'Variables por línea o separadas por coma' al crear la campaña."
      );
    } else {
      error("No se pudo copiar", "Copiá las variables manualmente.");
    }
  }

  async function handleRunFollowups() {
    setIsRunningFollowups(true);
    try {
      const result = await runWhatsAppBotFollowups();
      info("Seguimientos", `Se despacharon ${result.sent} seguimientos vencidos.`);
      await Promise.all([botStatusQuery.refetch(), botConversationsQuery.refetch()]);
    } catch (err) {
      error("No se pudieron enviar los seguimientos", getErrorMessage(err));
    } finally {
      setIsRunningFollowups(false);
    }
  }

  async function handleSendReply(phone: string) {
    if (!replyText.trim() || !phone) return;
    setIsReplying(true);
    try {
      await sendWhatsAppTestMessage({
        to: phone,
        message_type: "text",
        body: replyText.trim(),
      });
      success("Mensaje enviado", `Respuesta enviada a ${phone}.`);
      setReplyText("");
      setReplyTarget(null);
      messagesQuery.refetch();
    } catch (err) {
      error("No se pudo enviar", getErrorMessage(err));
    } finally {
      setIsReplying(false);
    }
  }

  const files = filesQuery.data?.files ?? [];
  const campaigns = campaignsQuery.data?.data ?? [];
  const messages = messagesQuery.data?.data ?? [];
  const conversations = conversationsQuery.data?.data ?? [];
  const templates = templatesQuery.data?.data ?? [];
  const status = statusQuery.data;
  const selectedLeadsCount = leadsPreviewQuery.data?.total ?? 0;

  async function handleSaveConfig(event: React.FormEvent) {
    event.preventDefault();
    setIsSavingConfig(true);
    try {
      const payload: Record<string, string> = {
        phone_number_id: configForm.phone_number_id.trim(),
        business_account_id: configForm.business_account_id.trim(),
        api_version: configForm.api_version.trim() || "v21.0",
      };
      if (configForm.access_token.trim()) {
        payload.access_token = configForm.access_token.trim();
      }
      if (configForm.webhook_verify_token.trim()) {
        payload.webhook_verify_token = configForm.webhook_verify_token.trim();
      }
      await updateWhatsAppConfig(payload);
      setConfigForm((prev) => ({
        ...prev,
        access_token: "",
        webhook_verify_token: "",
      }));
      await refreshAll();
      success("WhatsApp configurado", "La conexion con Meta quedo guardada en el proyecto.");
    } catch (err) {
      error("No se pudo guardar la configuracion", getErrorMessage(err));
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleTestSend(event: React.FormEvent) {
    event.preventDefault();
    setIsSendingTest(true);
    try {
      await sendWhatsAppTestMessage({
        to: testForm.to.trim(),
        message_type: testForm.message_type,
        body: testForm.body,
        template_name: testForm.template_name,
        template_language: testForm.template_language,
        template_variables: parseVariables(testForm.template_variables),
      });
      success("Mensaje enviado", "La prueba se despacho a Meta correctamente.");
      await refreshAll();
    } catch (err) {
      error("No se pudo enviar la prueba", getErrorMessage(err));
    } finally {
      setIsSendingTest(false);
    }
  }

  async function handleCreateCampaign(event: React.FormEvent) {
    event.preventDefault();
    setIsCreatingCampaign(true);
    try {
      const filters: Partial<LeadsQueryParams> = {
        search: campaignForm.search || undefined,
        argentina_only: campaignForm.argentina_only ? true : undefined,
        tipo: campaignForm.tipo || undefined,
        ubicacion: campaignForm.ubicacion || undefined,
        file_id: campaignForm.file_id || undefined,
      };

      const campaign = await createWhatsAppCampaign({
        name:
          campaignForm.name.trim() ||
          `Campana ${new Date().toLocaleString("es-AR")}`,
        message_type: campaignForm.message_type,
        text_body: campaignForm.text_body,
        template_name: campaignForm.template_name,
        template_language: campaignForm.template_language,
        template_variables: parseVariables(campaignForm.template_variables),
        use_bot_first_message: campaignForm.use_bot_first_message,
        filters,
      });

      success(
        "Campana ejecutada",
        `Se procesaron ${campaign.targets_total} leads, con ${campaign.sent_count} aceptados por Meta.`
      );
      await refreshAll();
    } catch (err) {
      error("No se pudo crear la campana", getErrorMessage(err));
    } finally {
      setIsCreatingCampaign(false);
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8 max-w-[1500px] mx-auto">
      <section className="opacity-0 animate-stagger-1">
        <div className="glass-card gradient-border-top p-6 sm:p-8 lg:p-10 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 mb-4">
                <Radio className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-xs font-semibold text-emerald-200 tracking-wide">
                  META WHATSAPP BUSINESS
                </span>
              </div>
              <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-2">
                Campanas, respuestas y webhook de WhatsApp
              </h1>
              <p className="text-text-secondary text-sm sm:text-base leading-relaxed max-w-2xl">
                Configura tu numero Business, envia pruebas, lanza campanas sobre los
                leads detectados y registra respuestas entrantes dentro del mismo panel.
              </p>
            </div>
            <button
              onClick={() => {
                void refreshAll();
                info("Sincronizando", "Actualizando estado, conversaciones y campanas.");
              }}
              className="btn-secondary text-sm px-4 py-3 shrink-0"
            >
              <RefreshCw
                className={`w-4 h-4 ${statusQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refrescar panel
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          {
            icon: ShieldCheck,
            label: "Estado del canal",
            value: status?.config.connected ? "Conectado" : "Pendiente",
            tone: status?.config.connected ? "text-emerald-300" : "text-amber-300",
          },
          {
            icon: Bot,
            label: "Leads con telefono",
            value: String(status?.stats.leads_with_phone ?? 0),
            tone: "text-cyan-300",
          },
          {
            icon: Send,
            label: "Mensajes salientes",
            value: String(status?.stats.outbound_count ?? 0),
            tone: "text-blue-300",
          },
          {
            icon: MessagesSquare,
            label: "Respuestas entrantes",
            value: String(status?.stats.inbound_count ?? 0),
            tone: "text-fuchsia-300",
          },
          {
            icon: Activity,
            label: "Campanas ejecutadas",
            value: String(status?.stats.campaigns_count ?? 0),
            tone: "text-amber-300",
          },
        ].map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="glass-card gradient-border-top p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-text-primary" />
              </div>
            </div>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-1">{label}</div>
            <div className={`text-2xl font-display font-bold ${tone}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <form onSubmit={handleSaveConfig} className="glass-card gradient-border-top p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
                Configuracion de Meta
              </h2>
              <p className="section-subtitle">
                Guarda las credenciales del numero Business y el token de verificacion del webhook.
              </p>
            </div>
            <span
              className={`badge ${status?.config.connected ? "badge-argentina" : "badge-empresa"}`}
            >
              {status?.config.connected ? "Canal activo" : "Falta configurar"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Access Token de Meta
              </label>
              <input
                type="password"
                value={configForm.access_token}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, access_token: e.target.value }))}
                className="input-field"
                placeholder={
                  status?.config.access_token_masked
                    ? `Actual: ${status.config.access_token_masked} | escribe uno nuevo para reemplazar`
                    : "EAAG..."
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Phone Number ID
              </label>
              <input
                value={configForm.phone_number_id}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, phone_number_id: e.target.value }))}
                className="input-field"
                placeholder="123456789012345"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Business Account ID
              </label>
              <input
                value={configForm.business_account_id}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, business_account_id: e.target.value }))}
                className="input-field"
                placeholder="Opcional, pero recomendado para listar plantillas"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Webhook Verify Token
              </label>
              <input
                type="password"
                value={configForm.webhook_verify_token}
                onChange={(e) =>
                  setConfigForm((prev) => ({ ...prev, webhook_verify_token: e.target.value }))
                }
                className="input-field"
                placeholder={
                  status?.config.webhook_verify_token_masked
                    ? `Actual: ${status.config.webhook_verify_token_masked}`
                    : "token-seguro-de-verificacion"
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                API Version
              </label>
              <input
                value={configForm.api_version}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, api_version: e.target.value }))}
                className="input-field"
                placeholder="v21.0"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-xs text-text-muted leading-relaxed">
              La URL para registrar en Meta es <span className="text-text-primary">{status?.webhook_url || "-"}</span>
            </div>
            <button
              type="submit"
              className="btn-primary px-5 py-3 disabled:opacity-50"
              disabled={isSavingConfig}
            >
              <ShieldCheck className="w-4 h-4" />
              {isSavingConfig ? "Guardando..." : "Guardar configuracion"}
            </button>
          </div>
        </form>

        <div className="glass-card gradient-border-top p-6">
          <div className="mb-5">
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <Webhook className="w-5 h-5 text-cyan-300" />
              Checklist de conexion
            </h2>
            <p className="section-subtitle">
              Pasos minimos para que el numero Business funcione con este backend.
            </p>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              1. Carga `Access Token`, `Phone Number ID` y `Webhook Verify Token`.
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              2. En Meta Developers registra la URL del webhook y usa el mismo verify token.
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              3. Suscribe eventos de mensajes para recibir respuestas y estados.
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              4. Para campanas salientes usa preferentemente plantillas aprobadas por Meta.
            </div>
          </div>

          <div className="mt-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-100">
            Ultima actividad: {formatDate(status?.stats.last_message_at)}
          </div>
        </div>
      </section>

      <section className="glass-card gradient-border-top p-6 overflow-hidden">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-300" />
              Bot de orientación laboral
            </h2>
            <p className="section-subtitle">
              Asistente que responde automáticamente a los contactos por accidentes laborales:
              verifica el estado del caso, hace preguntas breves, detecta urgencias, agenda
              entrevistas y respeta cada solicitud de baja.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              type="button"
              onClick={() => void handleRunFollowups()}
              className="btn-secondary text-sm px-4 py-3 shrink-0"
              disabled={isRunningFollowups}
            >
              <Send className="w-4 h-4" />
              {isRunningFollowups ? "Enviando..." : "Enviar seguimientos"}
            </button>
            <label className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={botForm.bot_enabled}
                onChange={(e) => setBotForm((prev) => ({ ...prev, bot_enabled: e.target.checked }))}
                className="w-4 h-4 accent-cyan-500"
              />
              <span className="text-sm text-text-secondary">Bot activo</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Conversaciones", value: botStatusQuery.data?.stats.total ?? 0 },
            { label: "Activas", value: botStatusQuery.data?.stats.active ?? 0 },
            { label: "Turnos agendados", value: botStatusQuery.data?.stats.scheduled ?? 0 },
            { label: "Prioridad alta", value: botStatusQuery.data?.stats.high_priority ?? 0 },
            { label: "Bajas", value: botStatusQuery.data?.stats.opted_out ?? 0 },
            { label: "Derivadas", value: botStatusQuery.data?.stats.transferred ?? 0 },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-xs uppercase tracking-wider text-text-muted mb-1">{item.label}</div>
              <div className="text-xl font-display font-bold text-text-primary">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <form onSubmit={handleSaveBot} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Nombre del estudio
                </label>
                <input
                  value={botForm.bot_study_name}
                  onChange={(e) => setBotForm((prev) => ({ ...prev, bot_study_name: e.target.value }))}
                  className="input-field"
                  placeholder="Estudio Jurídico ..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Nombre del asesor
                </label>
                <input
                  value={botForm.bot_advisor_name}
                  onChange={(e) => setBotForm((prev) => ({ ...prev, bot_advisor_name: e.target.value }))}
                  className="input-field"
                  placeholder="Laura"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Política de la consulta inicial
                </label>
                <input
                  value={botForm.bot_consultation_policy}
                  onChange={(e) =>
                    setBotForm((prev) => ({ ...prev, bot_consultation_policy: e.target.value }))
                  }
                  className="input-field"
                  placeholder="gratuita / tiene un costo de $... / el costo debe confirmarlo el profesional"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Nombre legal del estudio
                </label>
                <input
                  value={botForm.bot_legal_name}
                  onChange={(e) => setBotForm((prev) => ({ ...prev, bot_legal_name: e.target.value }))}
                  className="input-field"
                  placeholder="Para la respuesta ante '¿es una estafa?'"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Medio de verificación
                </label>
                <input
                  value={botForm.bot_verification_channel}
                  onChange={(e) =>
                    setBotForm((prev) => ({ ...prev, bot_verification_channel: e.target.value }))
                  }
                  className="input-field"
                  placeholder="nuestra web oficial / nuestras redes"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Horario 1 disponible
                </label>
                <input
                  value={botForm.bot_slot_1}
                  onChange={(e) => setBotForm((prev) => ({ ...prev, bot_slot_1: e.target.value }))}
                  className="input-field"
                  placeholder="lunes 10:00"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Horario 2 disponible
                </label>
                <input
                  value={botForm.bot_slot_2}
                  onChange={(e) => setBotForm((prev) => ({ ...prev, bot_slot_2: e.target.value }))}
                  className="input-field"
                  placeholder="jueves 15:30"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted leading-relaxed">
                El bot responde las respuestas entrantes dentro de la ventana de 24 horas que abre
                el primer mensaje de cada campaña.
              </p>
              <button
                type="submit"
                className="btn-primary px-5 py-3 shrink-0 disabled:opacity-50"
                disabled={isSavingBot}
              >
                <Bot className="w-4 h-4" />
                {isSavingBot ? "Guardando..." : "Guardar bot"}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs uppercase tracking-wider text-text-muted">
                Primer mensaje (preview)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyTemplate()}
                  className="text-xs px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-100 hover:bg-cyan-500/20"
                >
                  Copiar para plantilla
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyTemplateVariables()}
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10"
                >
                  Copiar variables
                </button>
              </div>
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed max-h-72 overflow-y-auto">
              {botStatusQuery.data?.first_message ||
                "Configurá el bot para ver el mensaje inicial."}
            </p>
            <p className="text-xs text-text-muted mt-3 leading-relaxed">
              "Copiar para plantilla" genera el cuerpo con las variables {"{{1}}"}, {"{{2}}"} y {"{{3}}"}
              para pegar en WhatsApp Manager (idioma Español Argentina). "Copiar variables" copia
              los valores que van en la campaña: nombre del lead, asesor y estudio.
            </p>
          </div>
        </div>
      </section>

      <section className="glass-card gradient-border-top p-6 overflow-hidden">
        <div className="mb-4">
          <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-fuchsia-300" />
            Conversaciones del bot
          </h2>
          <p className="section-subtitle">
            Mensajes recibidos por el bot de orientación, con el estado del flujo
            y la posibilidad de responder directamente.
          </p>
        </div>
        <div className="space-y-3">
          {(botConversationsQuery.data?.data ?? []).length === 0 ? (
            <div className="text-center text-text-muted py-8">
              Aun no hay conversaciones del bot.
            </div>
          ) : (
            (botConversationsQuery.data?.data ?? []).map((conv, index) => (
              <div
                key={conv.phone_e164 || `bot-conv-${index}`}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-text-primary">
                      {conv.lead_name || conv.phone_e164 || "Sin nombre"}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {conv.phone_e164 || "Telefono no identificado"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        conv.priority === "Alta"
                          ? "badge-empresa"
                          : conv.priority === "Media"
                            ? "badge-argentina"
                            : "badge-persona"
                      }`}
                    >
                      {conv.priority || "-"}
                    </span>
                    <div className="text-xs text-text-muted">
                      {formatDate(conv.updated_at)}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-text-secondary mt-3">
                  <span className="text-text-muted">Etapa:</span> {stageLabel(conv.stage)}
                  <span className="mx-2">·</span>
                  <span className="text-text-muted">Estado:</span> {botCloseLabel(conv)}
                </div>
                {conv.summary && (
                  <div className="text-sm text-text-secondary mt-2 line-clamp-2">
                    {conv.summary.descripcion_breve || conv.summary.lesion_informada || "Sin detalle disponible"}
                  </div>
                )}
                <div className="mt-3 text-xs text-text-muted">
                  {conv.replies_count} respuestas · {conv.followups_sent} followups
                  {conv.appointment_set && " · Turno agendado"}
                </div>
                {conv.phone_e164 && (
                  <div className="mt-3">
                    {replyTarget === `bot-${conv.phone_e164}` ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input flex-1"
                          placeholder="Escribi tu respuesta..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isReplying) {
                              handleSendReply(conv.phone_e164!);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className="btn btn-primary"
                          disabled={isReplying || !replyText.trim()}
                          onClick={() => handleSendReply(conv.phone_e164!)}
                        >
                          {isReplying ? "Enviando..." : "Enviar"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => { setReplyTarget(null); setReplyText(""); }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost text-sm text-fuchsia-300 hover:text-fuchsia-200"
                        onClick={() => setReplyTarget(`bot-${conv.phone_e164}`)}
                      >
                        <Send className="w-3 h-3 inline mr-1" />
                        Responder
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <form onSubmit={handleTestSend} className="glass-card gradient-border-top p-6">
          <div className="mb-5">
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <Send className="w-5 h-5 text-cyan-300" />
              Prueba de envio
            </h2>
            <p className="section-subtitle">
              Sirve para validar el numero conectado antes de lanzar una campana completa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Numero destino
              </label>
              <input
                value={testForm.to}
                onChange={(e) => setTestForm((prev) => ({ ...prev, to: e.target.value }))}
                className="input-field"
                placeholder="54911..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Tipo de envio
              </label>
              <select
                value={testForm.message_type}
                onChange={(e) =>
                  setTestForm((prev) => ({
                    ...prev,
                    message_type: e.target.value as "text" | "template",
                  }))
                }
                className="select-field"
              >
                <option value="text">Texto libre</option>
                <option value="template">Plantilla aprobada</option>
              </select>
            </div>

            {testForm.message_type === "template" ? (
              <>
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Plantilla
                  </label>
                  <select
                    value={testForm.template_name}
                    onChange={(e) =>
                      setTestForm((prev) => ({ ...prev, template_name: e.target.value }))
                    }
                    className="select-field"
                  >
                    <option value="">Seleccionar plantilla</option>
                    {templates.map((template) => (
                      <option key={template.name} value={template.name}>
                        {template.name} ({template.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Variables del body
                  </label>
                  <textarea
                    value={testForm.template_variables}
                    onChange={(e) =>
                      setTestForm((prev) => ({ ...prev, template_variables: e.target.value }))
                    }
                    rows={4}
                    className="input-field resize-y"
                    placeholder="{{full_name}}, empresa demo"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Texto
                </label>
                <textarea
                  value={testForm.body}
                  onChange={(e) => setTestForm((prev) => ({ ...prev, body: e.target.value }))}
                  rows={5}
                  className="input-field resize-y"
                  placeholder="Puedes usar variables como {{full_name}}"
                />
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="text-xs text-text-muted">
              Si usas texto libre, solo aplica dentro de la ventana de 24 horas.
            </div>
            <button type="submit" className="btn-primary px-5 py-3" disabled={isSendingTest}>
              <Send className="w-4 h-4" />
              {isSendingTest ? "Enviando..." : "Enviar prueba"}
            </button>
          </div>
        </form>

        <form onSubmit={handleCreateCampaign} className="glass-card gradient-border-top p-6">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-300" />
                Crear campana
              </h2>
              <p className="section-subtitle">
                Filtra leads del panel y envia mensajes automaticamente al grupo seleccionado.
              </p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-sm text-cyan-100">
              Coincidencias actuales: {selectedLeadsCount}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Nombre de campana
              </label>
              <input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                className="input-field"
                placeholder="Prospeccion abogados agosto"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Buscar dentro del lead
              </label>
              <input
                value={campaignForm.search}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, search: e.target.value }))}
                className="input-field"
                placeholder="Instagram, email, nombre..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Archivo origen
              </label>
              <select
                value={campaignForm.file_id}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, file_id: e.target.value }))}
                className="select-field"
              >
                <option value="">Todos los archivos</option>
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.filename}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Tipo de perfil
              </label>
              <select
                value={campaignForm.tipo}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, tipo: e.target.value }))}
                className="select-field"
              >
                {TIPO_OPTIONS.map((item) => (
                  <option key={item.value || "todos"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Ubicacion contiene
              </label>
              <input
                value={campaignForm.ubicacion}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, ubicacion: e.target.value }))}
                className="input-field"
                placeholder="Buenos Aires, Cordoba..."
              />
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <input
                id="argentina-only"
                type="checkbox"
                checked={campaignForm.argentina_only}
                onChange={(e) =>
                  setCampaignForm((prev) => ({ ...prev, argentina_only: e.target.checked }))
                }
                className="w-4 h-4 accent-cyan-500"
              />
              <label htmlFor="argentina-only" className="text-sm text-text-secondary">
                Solo leads detectados en Argentina
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Tipo de mensaje
              </label>
              <select
                value={campaignForm.message_type}
                onChange={(e) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    message_type: e.target.value as "text" | "template",
                  }))
                }
                className="select-field"
              >
                <option value="template">Plantilla</option>
                <option value="text">Texto libre</option>
              </select>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <input
                id="bot-first-message"
                type="checkbox"
                checked={campaignForm.use_bot_first_message}
                onChange={(e) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    use_bot_first_message: e.target.checked,
                  }))
                }
                className="w-4 h-4 accent-cyan-500"
              />
              <div>
                <label htmlFor="bot-first-message" className="text-sm text-text-secondary">
                  Usar el primer mensaje del bot (accidentes laborales)
                </label>
                <p className="text-xs text-text-muted mt-0.5">
                  Reemplaza el texto por el mensaje inicial del asistente; las respuestas las
                  gestiona el bot si está activo.
                </p>
              </div>
            </div>

            {campaignForm.message_type === "template" ? (
              <>
                <div>
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Plantilla aprobada
                  </label>
                  <select
                    value={campaignForm.template_name}
                    onChange={(e) =>
                      setCampaignForm((prev) => ({ ...prev, template_name: e.target.value }))
                    }
                    className="select-field"
                  >
                    <option value="">Seleccionar plantilla</option>
                    {templates.map((template) => (
                      <option key={template.name} value={template.name}>
                        {template.name} ({template.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-text-secondary mb-2 block">
                    Variables por linea o separadas por coma
                  </label>
                  <textarea
                    value={campaignForm.template_variables}
                    onChange={(e) =>
                      setCampaignForm((prev) => ({ ...prev, template_variables: e.target.value }))
                    }
                    rows={4}
                    className="input-field resize-y"
                    placeholder="{{full_name}}&#10;{{ubicacion}}"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Texto personalizado
                </label>
                <textarea
                  value={campaignForm.text_body}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({ ...prev, text_body: e.target.value }))
                  }
                  rows={5}
                  className="input-field resize-y"
                  placeholder="Usa variables como {{full_name}}, {{ubicacion}} o {{instagram}}"
                />
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-xs text-text-muted leading-relaxed">
              El backend enviara a todos los leads filtrados que tengan telefono detectado.
            </div>
            <button
              type="submit"
              className="btn-primary px-5 py-3 disabled:opacity-50"
              disabled={isCreatingCampaign}
            >
              <MessageCircle className="w-4 h-4" />
              {isCreatingCampaign ? "Ejecutando..." : "Ejecutar campana"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <div className="glass-card gradient-border-top p-6 overflow-hidden">
          <div className="mb-4">
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-300" />
              Campanas recientes
            </h2>
            <p className="section-subtitle">
              Resultado resumido de las ultimas ejecuciones enviadas a Meta.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="text-left">Campana</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Resultados</th>
                  <th className="text-left">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-text-muted py-8">
                      Aun no hay campanas ejecutadas.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <div className="font-medium text-text-primary">{campaign.name}</div>
                        <div className="text-xs text-text-muted">
                          {campaign.template_name || "Texto libre"}
                        </div>
                      </td>
                      <td className="capitalize">{campaign.message_type}</td>
                      <td>
                        <div className="text-emerald-300">{campaign.sent_count} aceptados</div>
                        <div className="text-red-300 text-xs">{campaign.failed_count} fallidos</div>
                      </td>
                      <td className="text-sm text-text-muted">{formatDate(campaign.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card gradient-border-top p-6 overflow-hidden">
          <div className="mb-4">
            <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
              <MessagesSquare className="w-5 h-5 text-fuchsia-300" />
              Conversaciones detectadas
            </h2>
            <p className="section-subtitle">
              Vista rapida de hilos recientes recibidos por el webhook.
            </p>
          </div>
          <div className="space-y-3">
            {conversations.length === 0 ? (
              <div className="text-center text-text-muted py-8">
                Todavia no entraron respuestas o mensajes.
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.conversation_key}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-text-primary">
                        {conversation.lead_name || conversation.phone_e164 || "Sin nombre"}
                      </div>
                      <div className="text-xs text-text-muted mt-1">
                        {conversation.phone_e164 || "Telefono no identificado"}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted">
                      {formatDate(conversation.last_message_at)}
                    </div>
                  </div>
                  <div className="text-sm text-text-secondary mt-3 line-clamp-2">
                    {conversation.last_preview || "Sin preview disponible"}
                  </div>
                  <div className="mt-3 text-xs text-text-muted">
                    {conversation.messages_count} mensajes · ultimo estado {conversation.last_status || "-"}
                  </div>
                  {conversation.phone_e164 && (
                    <div className="mt-3">
                      {replyTarget === conversation.conversation_key ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="input flex-1"
                            placeholder="Escribi tu respuesta..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !isReplying) {
                                handleSendReply(conversation.phone_e164!);
                              }
                            }}
                            autoFocus
                          />
                          <button
                            className="btn btn-primary"
                            disabled={isReplying || !replyText.trim()}
                            onClick={() => handleSendReply(conversation.phone_e164!)}
                          >
                            {isReplying ? "Enviando..." : "Enviar"}
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => { setReplyTarget(null); setReplyText(""); }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-ghost text-sm text-fuchsia-300 hover:text-fuchsia-200"
                          onClick={() => setReplyTarget(conversation.conversation_key)}
                        >
                          <Send className="w-3 h-3 inline mr-1" />
                          Responder
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="glass-card gradient-border-top p-6 overflow-hidden">
        <div className="mb-4">
          <h2 className="section-title text-xl sm:text-2xl flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-cyan-300" />
            Actividad reciente del canal
          </h2>
          <p className="section-subtitle">
            Mensajes salientes, respuestas entrantes y estados devueltos por Meta.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Direccion</th>
                <th className="text-left">Lead / contacto</th>
                <th className="text-left">Telefono</th>
                <th className="text-left">Preview</th>
                <th className="text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-text-muted py-8">
                    Aun no hay actividad guardada en WhatsApp.
                  </td>
                </tr>
              ) : (
                messages.map((item) => (
                  <tr key={item.id}>
                    <td className="text-sm text-text-muted">{formatDate(item.created_at)}</td>
                    <td className="capitalize">{item.direction}</td>
                    <td>{item.lead_name || item.contact_name || "-"}</td>
                    <td>{item.phone_e164 || item.phone_raw || "-"}</td>
                    <td className="max-w-[420px] truncate">{item.preview || "-"}</td>
                    <td>
                      <span className="badge badge-persona">{item.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
