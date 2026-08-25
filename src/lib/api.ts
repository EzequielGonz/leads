import axios from "axios";

export type LeadTipo = "abogado" | "contador" | "medico" | "empresa" | "sin_clasificar" | "otro";

export interface Lead {
  id: string;
  source_file?: string;
  file_id?: string;
  raw_data?: Record<string, unknown>;
  nombre?: string;
  apellido?: string;
  full_name?: string;
  email?: string;
  telefono?: string;
  instagram?: string;
  linkedin?: string;
  website?: string;
  ubicacion?: string;
  barrio?: string;
  lesion?: string;
  es_argentina: boolean;
  tipo_perfil?: LeadTipo;
  categorias_detectadas?: string[];
  biography?: string;
  follower_count?: number;
  imported_at: string;
  [key: string]: unknown;
}

export interface DashboardStats {
  total_leads: number;
  argentina_count: number;
  por_tipo: Record<string, number>;
  por_ubicacion: Record<string, number>;
  emails_count: number;
  telefonos_count: number;
  instagram_count: number;
}

export interface FileImportResult {
  file_id: string;
  filename: string;
  total_rows?: number;
  columns_detected: string[];
  leads?: Lead[];
  preview_rows?: Lead[];
  sheet_names?: string[];
  status?: string;
}

export interface UploadStatus {
  file_id: string;
  status: string;
  total_rows: number;
  processed: number;
  columns: string[];
  error: string | null;
  filename: string;
  sheet_names?: string[];
}

export interface FileInfo {
  id: string;
  filename: string;
  sheet_name?: string;
  sheet_names?: string[];
  total_rows: number;
  columns_detected: string[];
  uploaded_at: string;
}

export interface LeadsQueryParams {
  search?: string;
  argentina_only?: boolean | "true" | "1";
  tipo?: string;
  barrio?: string;
  ubicacion?: string;
  page?: number;
  size?: number;
  file_id?: string;
}

export interface LeadsResponse {
  data: Lead[];
  total: number;
  page: number;
  size: number;
}

export interface WhatsAppConfig {
  connected: boolean;
  phone_number_id: string;
  business_account_id: string;
  api_version: string;
  has_access_token: boolean;
  has_webhook_verify_token: boolean;
  access_token_masked: string;
  webhook_verify_token_masked: string;
}

export interface WhatsAppStatusResponse {
  config: WhatsAppConfig;
  stats: {
    campaigns_count: number;
    messages_count: number;
    inbound_count: number;
    outbound_count: number;
    failed_count: number;
    last_message_at?: string | null;
    leads_with_phone?: number;
  };
  webhook_url: string;
}

export interface WhatsAppTemplate {
  name: string;
  status: string;
  language?: string;
  category?: string;
}

export interface WhatsAppMessage {
  id: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  lead_name?: string;
  phone_raw?: string;
  phone_e164?: string;
  direction: string;
  message_type: string;
  preview?: string;
  template_name?: string;
  meta_message_id?: string;
  status: string;
  error_message?: string;
  contact_name?: string;
  created_at: string;
}

export interface WhatsAppConversation {
  conversation_key: string;
  phone_e164?: string;
  lead_id?: string | null;
  lead_name?: string;
  last_direction?: string;
  last_status?: string;
  last_preview?: string;
  last_message_at?: string;
  messages_count: number;
}

export interface WhatsAppCampaignTarget {
  lead_id?: string;
  lead_name?: string;
  phone_raw?: string;
  phone_e164?: string;
  status: string;
  error_message?: string;
  preview?: string;
  meta_message_id?: string;
}

export interface WhatsAppCampaign {
  id: string;
  name: string;
  status: string;
  message_type: "text" | "template";
  template_name?: string;
  template_language?: string;
  text_body?: string;
  template_variables?: string[];
  use_bot_first_message?: boolean;
  filters?: Partial<LeadsQueryParams>;
  created_at: string;
  targets_total: number;
  sent_count: number;
  failed_count: number;
  targets: WhatsAppCampaignTarget[];
}

export interface WhatsAppBotConfig {
  bot_enabled: boolean;
  bot_study_name: string;
  bot_advisor_name: string;
  bot_consultation_policy: string;
  bot_legal_name: string;
  bot_verification_channel: string;
  bot_slot_1: string;
  bot_slot_2: string;
  bot_menu_enabled: boolean;
  bot_menu_intro: string;
  bot_menu_questions: Array<{
    id: string;
    question: string;
    options: Array<{ value: string; label: string }>;
    free_text?: boolean;
    required?: boolean;
  }>;
}

export interface WhatsAppBotStatusResponse {
  config: WhatsAppBotConfig;
  stats: {
    total: number;
    active: number;
    closed: number;
    transferred: number;
    scheduled: number;
    opted_out: number;
    high_priority: number;
  };
  first_message: string;
}

export interface WhatsAppBotConversation {
  phone_e164?: string;
  lead_name?: string;
  stage?: string;
  closed: boolean;
  close_reason: string;
  priority: string;
  appointment_set: boolean;
  followups_sent: number;
  replies_count: number;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  summary?: Record<string, string> | null;
  data?: {
    menu_antiguedad_label?: string;
    menu_lugar_label?: string;
    menu_horario?: string;
    menu_lesion?: string;
  };
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "/api",
  timeout: 300000,
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error?.response?.data?.error || error.message || "Error desconocido";
    console.error("API Error:", msg, error?.response?.data);
    return Promise.reject(error?.response?.data || { error: msg, status: error?.response?.status || 500 });
  }
);

export async function uploadFile(
  file: File,
  sheetName?: string
): Promise<FileImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (sheetName) formData.append("sheet_name", sheetName);
  return api.post("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function getUploadStatus(fileId: string): Promise<UploadStatus> {
  return api.get(`/upload/${fileId}/status`);
}

export async function getFiles(): Promise<{ files: FileInfo[] }> {
  return api.get("/files");
}

export async function clearAllData(): Promise<{
  ok: boolean;
  deleted_leads: number;
  deleted_files: number;
}> {
  return api.post("/clear-data");
}

export async function exportData(): Promise<{
  leads: Lead[];
  files: FileInfo[];
  exported_at: string;
}> {
  return api.get("/data/export");
}

export async function importData(payload: {
  leads?: Lead[];
  files?: FileInfo[];
}): Promise<{ ok: boolean; imported_leads: number; imported_files: number }> {
  return api.post("/data/import", payload);
}

export async function getLeads(
  params: LeadsQueryParams = {}
): Promise<LeadsResponse> {
  return api.get("/leads", { params });
}

export async function getLeadById(id: string): Promise<Lead> {
  return api.get(`/leads/${id}`);
}

export async function getDashboardStats(
  fileId?: string
): Promise<DashboardStats> {
  return api.get("/dashboard/stats", { params: fileId ? { file_id: fileId } : {} });
}

export async function suggestColumns(columns: string[]): Promise<{ mapping: Record<string, string> }> {
  return api.get("/columns/suggest", { params: { columns: columns.join(",") } });
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatusResponse> {
  return api.get("/whatsapp/status");
}

export async function updateWhatsAppConfig(payload: {
  access_token?: string;
  phone_number_id?: string;
  business_account_id?: string;
  webhook_verify_token?: string;
  api_version?: string;
}): Promise<WhatsAppStatusResponse> {
  return api.put("/whatsapp/config", payload);
}

export async function getWhatsAppTemplates(): Promise<{ data: WhatsAppTemplate[] }> {
  return api.get("/whatsapp/templates");
}

export async function sendWhatsAppTestMessage(payload: {
  to: string;
  message_type: "text" | "template";
  body?: string;
  template_name?: string;
  template_language?: string;
  template_variables?: string[];
  preview_url?: boolean;
  lead_name?: string;
  lead_id?: string;
}): Promise<{
  ok: boolean;
  to: string;
  preview: string;
  provider_message_id?: string;
}> {
  return api.post("/whatsapp/test-send", payload);
}

export async function getWhatsAppCampaigns(): Promise<{ data: WhatsAppCampaign[] }> {
  return api.get("/whatsapp/campaigns");
}

export async function createWhatsAppCampaign(payload: {
  name: string;
  message_type: "text" | "template";
  text_body?: string;
  template_name?: string;
  template_language?: string;
  template_variables?: string[];
  use_bot_first_message?: boolean;
  filters?: Partial<LeadsQueryParams>;
}): Promise<WhatsAppCampaign> {
  return api.post("/whatsapp/campaigns", payload);
}

export async function getWhatsAppMessages(limit = 50, phone?: string): Promise<{ data: WhatsAppMessage[] }> {
  return api.get("/whatsapp/messages", {
    params: { limit, phone },
  });
}

export async function getWhatsAppConversations(limit = 30): Promise<{ data: WhatsAppConversation[] }> {
  return api.get("/whatsapp/conversations", {
    params: { limit },
  });
}

export async function getWhatsAppBotStatus(): Promise<WhatsAppBotStatusResponse> {
  return api.get("/whatsapp/bot");
}

export async function updateWhatsAppBotConfig(
  payload: Partial<WhatsAppBotConfig>
): Promise<WhatsAppBotStatusResponse> {
  return api.put("/whatsapp/bot", payload);
}

export async function getWhatsAppBotConversations(
  includeClosed = true
): Promise<{ data: WhatsAppBotConversation[] }> {
  return api.get("/whatsapp/bot/conversations", {
    params: { include_closed: includeClosed ? "1" : "0" },
  });
}

export async function runWhatsAppBotFollowups(): Promise<{ sent: number }> {
  return api.post("/whatsapp/bot/followups/run");
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function exportLeads(
  format: "xlsx" | "csv" | "json",
  filters: Partial<LeadsQueryParams> = {}
): Promise<Blob> {
  const response = await api.post("/leads/export", {
    format,
    filters,
  }, {
    responseType: "blob",
    timeout: 120000,
  });
  const blob = response as unknown as Blob;
  const extByFormat: Record<string, string> = { xlsx: "xlsx", csv: "csv", json: "json" };
  const mimeByFormat: Record<string, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv;charset=utf-8;",
    json: "application/json",
  };
  const finalBlob =
    blob.type && blob.type !== "application/octet-stream"
      ? blob
      : new Blob([blob], { type: mimeByFormat[format] ?? blob.type });
  const ts = new Date().toISOString().slice(0, 10);
  downloadBlob(finalBlob, `leads_export_${ts}.${extByFormat[format] ?? format}`);
  return finalBlob;
}

// ---------------------------------------------------------------------------
// Batch sending
// ---------------------------------------------------------------------------
export interface BatchStatus {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  current_phone: string;
  current_name: string;
  file_name: string;
  cancelled: boolean;
}

export async function startBatchSend(payload: {
  file_id: string;
  template_name: string;
  template_language?: string;
  template_variables_key?: string;
}): Promise<{ ok: boolean; message: string; total: number }> {
  return api.post("/whatsapp/batch-send", payload);
}

export async function getBatchStatus(): Promise<BatchStatus> {
  return api.get("/whatsapp/batch-status");
}

export async function cancelBatchSend(): Promise<{ ok: boolean; message: string }> {
  return api.post("/whatsapp/batch-cancel");
}

// --- Anti-spam batch sender ---
export interface BatchAntiSpamStatus {
  active: boolean;
  paused: boolean;
  file_id: string | null;
  template_name: string;
  total_leads: number;
  sent_count: number;
  failed_count: number;
  remaining: number;
  current_lead: {
    nombre: string;
    telefono: string;
    barrio: string;
    progress: string;
  } | null;
  batch_count: number;
  batch_number: number;
  batch_limit: number;
  cooldown_remaining: number | null;
  cooldown_minutes: number;
  error: string | null;
  completed: boolean;
  time_limit_enabled: boolean;
  elapsed: number;
  next_send_in: number | null;
  log: Array<{ time: string; message: string; level: string }>;
  sent_phones_count: number;
  hour_status: string;
}

export async function startAntiSpamBatch(payload: {
  file_id: string;
  template_name: string;
  template_language?: string;
  template_variables?: string;
  time_limit_enabled?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  return api.post("/batch/start", payload);
}

export async function stopAntiSpamBatch(): Promise<{ ok: boolean; message: string }> {
  return api.post("/batch/stop");
}

export async function pauseAntiSpamBatch(): Promise<{ ok: boolean; message: string }> {
  return api.post("/batch/pause");
}

export async function resumeAntiSpamBatch(): Promise<{ ok: boolean; message: string }> {
  return api.post("/batch/resume");
}

export async function getAntiSpamBatchStatus(): Promise<BatchAntiSpamStatus> {
  return api.get("/batch/status");
}

export async function clearBatchHistory(): Promise<{ ok: boolean; message: string }> {
  return api.post("/batch/clear-history");
}

export default api;
