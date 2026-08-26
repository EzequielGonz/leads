import time
import json
import os
import re
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from urllib import error as urllib_error
from urllib import request as urllib_request

from services.bot_service import (
    DEFAULT_BOT_CONFIG,
    build_first_message,
    ensure_conversation as bot_ensure_conversation,
    get_bot_config as bot_get_config,
    get_bot_conversation as bot_get_conversation,
    get_menu_config as bot_get_menu_config,
    handle_inbound as bot_handle_inbound,
    list_bot_conversations as bot_list_conversations,
    bot_stats as bot_stats,
    run_due_followups as bot_due_followups,
    _build_menu_initial_message,
)
from services.database import save_whatsapp_store, load_whatsapp_store


GRAPH_BASE_URL = "https://graph.facebook.com"
PLACEHOLDER_REGEX = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
NON_DIGIT_REGEX = re.compile(r"\D+")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
STORE_PATH = os.path.join(DATA_DIR, "whatsapp_store.json")

os.makedirs(DATA_DIR, exist_ok=True)

_store_lock = threading.Lock()


class WhatsAppServiceError(Exception):
    pass


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def _default_store():
    return {
        "config": {
            "access_token": "",
            "phone_number_id": "",
            "business_account_id": "",
            "webhook_verify_token": "",
            "api_version": "v21.0",
        },
        "campaigns": [],
        "messages": [],
        "events": [],
        "bot_conversations": {},
    }


def _read_store():
    # Try SQLite first (persists across Render restarts)
    try:
        db_store = load_whatsapp_store()
        if db_store and isinstance(db_store, dict) and db_store.get("config"):
            base = _default_store()
            for key in base:
                if key in db_store and isinstance(db_store[key], type(base[key])):
                    base[key] = db_store[key]
            return base
    except Exception:
        pass
    # Fall back to JSON file
    if not os.path.exists(STORE_PATH):
        return _default_store()
    try:
        with open(STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return _default_store()
        base = _default_store()
        for key in base:
            if key in data and isinstance(data[key], type(base[key])):
                base[key] = data[key]
        # Migrate to SQLite
        try:
            save_whatsapp_store(base)
        except Exception:
            pass
        return base
    except Exception:
        return _default_store()


def _write_store(store):
    # Write to both JSON and SQLite
    try:
        with open(STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    try:
        save_whatsapp_store(store)
    except Exception:
        pass


def _mutate_store(mutator):
    with _store_lock:
        store = _read_store()
        result = mutator(store)
        _write_store(store)
        return result


def _mask_secret(value):
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def _resolved_config():
    store = _read_store()
    persisted = store.get("config") or {}
    resolved = {
        "access_token": os.environ.get("WHATSAPP_ACCESS_TOKEN") or persisted.get("access_token") or "",
        "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or persisted.get("phone_number_id") or "",
        "business_account_id": os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID") or persisted.get("business_account_id") or "",
        "webhook_verify_token": os.environ.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") or persisted.get("webhook_verify_token") or "",
        "api_version": os.environ.get("WHATSAPP_API_VERSION") or persisted.get("api_version") or "v21.0",
    }
    return resolved


def _public_config(config):
    return {
        "connected": bool(config.get("access_token") and config.get("phone_number_id")),
        "phone_number_id": config.get("phone_number_id") or "",
        "business_account_id": config.get("business_account_id") or "",
        "api_version": config.get("api_version") or "v21.0",
        "has_access_token": bool(config.get("access_token")),
        "has_webhook_verify_token": bool(config.get("webhook_verify_token")),
        "access_token_masked": _mask_secret(config.get("access_token") or ""),
        "webhook_verify_token_masked": _mask_secret(config.get("webhook_verify_token") or ""),
    }


def get_status():
    config = _resolved_config()
    store = _read_store()
    messages = store.get("messages") or []
    campaigns = store.get("campaigns") or []
    inbound = sum(1 for item in messages if item.get("direction") == "inbound")
    outbound = sum(1 for item in messages if item.get("direction") == "outbound")
    failed = sum(1 for item in messages if item.get("status") == "failed")
    last_message_at = messages[-1]["created_at"] if messages else None
    bot_cfg = bot_get_config(store)
    return {
        "config": _public_config(config),
        "stats": {
            "campaigns_count": len(campaigns),
            "messages_count": len(messages),
            "inbound_count": inbound,
            "outbound_count": outbound,
            "failed_count": failed,
            "last_message_at": last_message_at,
        },
        "bot": {
            "enabled": bot_cfg.get("bot_enabled"),
            "stats": bot_stats(store),
        },
    }


def update_config(payload):
    allowed_keys = {
        "access_token",
        "phone_number_id",
        "business_account_id",
        "webhook_verify_token",
        "api_version",
        "bot_enabled",
        "bot_study_name",
        "bot_advisor_name",
        "bot_consultation_policy",
        "bot_legal_name",
        "bot_verification_channel",
        "bot_slot_1",
        "bot_slot_2",
    }

    def _apply(store):
        config = store.setdefault("config", {})
        for key, value in (payload or {}).items():
            if key not in allowed_keys:
                continue
            config[key] = str(value or "").strip()
        return _public_config(_resolved_config())

    public_config = _mutate_store(_apply)
    status = get_status()
    status["config"] = public_config
    return status


def normalize_phone_for_whatsapp(phone):
    raw = str(phone or "").strip()
    if not raw:
        return ""

    digits = NON_DIGIT_REGEX.sub("", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    digits = digits.lstrip("0") or digits

    assumed_argentina = False
    if digits and not digits.startswith("54") and len(digits) in (10, 11):
        digits = f"54{digits}"
        assumed_argentina = True

    if digits.startswith("54"):
        national = digits[2:]
        for area_len in (2, 3, 4):
            marker_index = area_len
            if len(national) > marker_index + 2 and national[marker_index:marker_index + 2] == "15":
                national = f"9{national[:marker_index]}{national[marker_index + 2:]}"
                digits = f"54{national}"
                break
        if assumed_argentina and not national.startswith("9") and len(national) >= 10:
            digits = f"549{national}"

    return digits


def _find_lead_by_phone(leads, normalized_phone):
    if not normalized_phone:
        return None
    for lead in leads or []:
        candidate = normalize_phone_for_whatsapp(lead.get("telefono") or "")
        if not candidate:
            continue
        if candidate == normalized_phone:
            return lead
        if len(candidate) >= 8 and len(normalized_phone) >= 8:
            if candidate.endswith(normalized_phone) or normalized_phone.endswith(candidate):
                return lead
    return None


def _render_text_template(text, lead):
    raw = str(text or "")
    if not raw:
        return ""

    def _replace(match):
        key = match.group(1)
        value = lead.get(key)
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    return PLACEHOLDER_REGEX.sub(_replace, raw)


def _graph_url(config, endpoint):
    api_version = config.get("api_version") or "v21.0"
    endpoint = str(endpoint or "").lstrip("/")
    return f"{GRAPH_BASE_URL}/{api_version}/{endpoint}"


def _perform_request(method, url, access_token, payload=None):
    headers = {
        "Authorization": f"Bearer {access_token}",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib_request.Request(
        url,
        data=data,
        headers=headers,
        method=method.upper(),
    )

    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(body)
            error_data = parsed.get("error") or parsed
        except Exception:
            error_data = body or str(exc)
        raise WhatsAppServiceError(f"Meta API error: {error_data}")
    except urllib_error.URLError as exc:
        raise WhatsAppServiceError(f"No se pudo conectar con Meta: {exc.reason}")


def _ensure_configured():
    config = _resolved_config()
    if not config.get("access_token") or not config.get("phone_number_id"):
        raise WhatsAppServiceError(
            "Falta configurar WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID."
        )
    return config


def _record_event(store, kind, payload):
    events = store.setdefault("events", [])
    events.append({
        "id": str(uuid.uuid4()),
        "kind": kind,
        "created_at": _utc_now(),
        "payload": payload,
    })
    del events[:-100]


# Dedup: track processed message IDs to avoid webhook retries
_processed_msg_ids = set()
_MAX_PROCESSED_IDS = 500

def _is_duplicate_msg(msg_id):
    """Check if this WhatsApp message ID was already processed."""
    if not msg_id:
        return False
    if msg_id in _processed_msg_ids:
        return True
    _processed_msg_ids.add(msg_id)
    if len(_processed_msg_ids) > _MAX_PROCESSED_IDS:
        # Trim old entries
        to_remove = list(_processed_msg_ids)[:_MAX_PROCESSED_IDS // 2]
        for item in to_remove:
            _processed_msg_ids.discard(item)
    return False

def _append_message_record(store, message):
    messages = store.setdefault("messages", [])
    messages.append(message)
    del messages[:-5000]

def _is_duplicate_inbound(phone, text):
    """Check if same message was already processed recently."""
    now = time.time()
    last = _last_inbound.get(phone)
    if last and last[0] == text and (now - last[1]) < _LAST_INBOUND_MAX_AGE:
        return True
    _last_inbound[phone] = (text, now)
    return False


def record_outbound_message(lead, phone_raw, phone_e164, message_type, preview, status="accepted", error_message="", template_name=""):
    """Public: record an outbound message in the WhatsApp store."""
    record = _build_outbound_record(
        lead=lead, campaign_id=None, phone_raw=phone_raw, phone_e164=phone_e164,
        message_type=message_type, preview=preview, status=status,
        error_message=error_message, template_name=template_name,
    )

    def _apply(store):
        _append_message_record(store, record)

    _mutate_store(_apply)


def _append_campaign(store, campaign):
    campaigns = store.setdefault("campaigns", [])
    campaigns.insert(0, campaign)
    del campaigns[100:]


def list_messages(limit=100):
    store = _read_store()
    messages = list(store.get("messages") or [])
    messages.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return messages[:limit]


def list_campaigns():
    store = _read_store()
    campaigns = list(store.get("campaigns") or [])
    campaigns.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return campaigns


def get_campaign(campaign_id):
    for campaign in list_campaigns():
        if campaign.get("id") == campaign_id:
            return campaign
    return None


def list_conversations(limit=50):
    messages = list_messages(limit=1000)
    grouped = {}
    for item in messages:
        phone = item.get("phone_e164") or item.get("phone_raw") or "sin_telefono"
        direction = item.get("direction") or ""
        # Skip pure Meta status callbacks — they are not real conversations
        if direction == "status":
            # Still update lead info if available
            current = grouped.get(phone)
            if current:
                if item.get("lead_name"):
                    current["lead_name"] = item["lead_name"]
                if item.get("lead_id"):
                    current["lead_id"] = item["lead_id"]
            continue
        current = grouped.get(phone)
        if current is None:
            grouped[phone] = {
                "conversation_key": phone,
                "phone_e164": item.get("phone_e164") or "",
                "lead_id": item.get("lead_id"),
                "lead_name": item.get("lead_name") or item.get("contact_name") or "",
                "last_direction": direction,
                "last_status": item.get("status"),
                "last_preview": item.get("preview") or "",
                "last_message_at": item.get("created_at"),
                "messages_count": 1,
                "error_message": item.get("error_message") or "",
            }
            continue
        current["messages_count"] += 1
        if (item.get("created_at") or "") > (current.get("last_message_at") or ""):
            current["last_direction"] = direction
            current["last_status"] = item.get("status")
            current["last_preview"] = item.get("preview") or ""
            current["last_message_at"] = item.get("created_at")
            current["lead_id"] = item.get("lead_id") or current.get("lead_id")
            current["lead_name"] = item.get("lead_name") or current.get("lead_name")
            current["error_message"] = item.get("error_message") or current.get("error_message") or ""
    rows = list(grouped.values())
    rows.sort(key=lambda item: item.get("last_message_at") or "", reverse=True)
    return rows[:limit]


def _build_outbound_record(
    lead,
    campaign_id,
    phone_raw,
    phone_e164,
    message_type,
    preview,
    provider_message_id=None,
    status="accepted",
    error_message="",
    template_name="",
):
    return {
        "id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "lead_id": lead.get("id"),
        "lead_name": lead.get("full_name") or lead.get("nombre") or "",
        "phone_raw": str(phone_raw or ""),
        "phone_e164": phone_e164,
        "direction": "outbound",
        "message_type": message_type,
        "preview": preview,
        "template_name": template_name,
        "meta_message_id": provider_message_id or "",
        "status": status,
        "error_message": error_message,
        "contact_name": lead.get("full_name") or lead.get("nombre") or "",
        "created_at": _utc_now(),
    }


def send_text_message(to_phone, body, preview_url=False):
    config = _ensure_configured()
    normalized = normalize_phone_for_whatsapp(to_phone)
    if not normalized:
        raise WhatsAppServiceError("El telefono de destino no es valido.")
    if not body.strip():
        raise WhatsAppServiceError("El mensaje no puede estar vacio.")

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": normalized,
        "type": "text",
        "text": {
            "preview_url": bool(preview_url),
            "body": body,
        },
    }
    return _perform_request(
        "POST",
        _graph_url(config, f"{config['phone_number_id']}/messages"),
        config["access_token"],
        payload,
    )


def send_template_message(to_phone, template_name, language_code, body_variables=None):
    config = _ensure_configured()
    normalized = normalize_phone_for_whatsapp(to_phone)
    if not normalized:
        raise WhatsAppServiceError("El telefono de destino no es valido.")
    if not template_name:
        raise WhatsAppServiceError("Debes indicar un nombre de plantilla.")

    components = []
    vars_clean = [str(item) for item in (body_variables or []) if str(item).strip()]
    if vars_clean:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": item} for item in vars_clean],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": normalized,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code or "es_AR"},
        },
    }
    if components:
        payload["template"]["components"] = components

    return _perform_request(
        "POST",
        _graph_url(config, f"{config['phone_number_id']}/messages"),
        config["access_token"],
        payload,
    )


def send_test_message(payload):
    message_type = (payload.get("message_type") or "text").strip().lower()
    to_phone = payload.get("to") or ""
    lead_name = payload.get("lead_name") or ""
    lead_id = payload.get("lead_id") or ""

    if message_type == "template":
        template_name = (payload.get("template_name") or "").strip()
        language_code = (payload.get("template_language") or "es_AR").strip()
        body_variables = payload.get("template_variables") or []
        result = send_template_message(to_phone, template_name, language_code, body_variables)
        preview = f"Plantilla {template_name}"
        provider_id = ((result.get("messages") or [{}])[0]).get("id") or ""

        # Después de enviar el template, si el bot menú está activo, enviar el menú automáticamente
        _send_bot_menu_after_template(to_phone, lead_name, lead_id)

        return {
            "ok": True,
            "to": normalize_phone_for_whatsapp(to_phone),
            "preview": preview,
            "provider_message_id": provider_id,
            "response": result,
        }

    body = str(payload.get("body") or "").strip()
    result = send_text_message(to_phone, body, payload.get("preview_url"))
    provider_id = ((result.get("messages") or [{}])[0]).get("id") or ""
    return {
        "ok": True,
        "to": normalize_phone_for_whatsapp(to_phone),
        "preview": body,
        "provider_message_id": provider_id,
        "response": result,
    }


def _send_bot_menu_after_template(to_phone, lead_name="", lead_id=""):
    """Si el bot menú está activo, crea la conversación después de un template.
    No envía el menú automáticamente — el usuario responde con "mi caso esta pendiente"
    y el bot arranca directo con las preguntas."""
    def _apply(store):
        bot_cfg = bot_get_config(store)
        if not bot_cfg.get("bot_enabled"):
            return
        menu_cfg = bot_get_menu_config(bot_cfg)
        if not menu_cfg.get("enabled"):
            return

        phone_e164 = normalize_phone_for_whatsapp(to_phone)
        conv = bot_ensure_conversation(
            store,
            phone_e164=phone_e164,
            phone_raw=to_phone,
            lead_id=lead_id,
            lead_name=lead_name,
        )
        conv["stage"] = "menu_awaiting_choice"
        conv.setdefault("data", {})["menu_current_question"] = 0
        conv["updated_at"] = _utc_now()

    _mutate_store(_apply)


def fetch_templates():
    config = _ensure_configured()
    business_account_id = config.get("business_account_id")
    if not business_account_id:
        return []
    data = _perform_request(
        "GET",
        _graph_url(
            config,
            f"{business_account_id}/message_templates?fields=name,status,language,category",
        ),
        config["access_token"],
    )
    templates = data.get("data") or []
    templates.sort(key=lambda item: (item.get("status") != "APPROVED", item.get("name") or ""))
    return templates


def create_campaign(leads, payload):
    _ensure_configured()
    bot_config = bot_get_config(_read_store())
    use_bot_first_message = bool(payload.get("use_bot_first_message"))

    candidates = [lead for lead in (leads or []) if lead.get("telefono")]
    if not candidates:
        raise WhatsAppServiceError("No hay leads con telefono para enviar.")

    name = (payload.get("name") or "").strip() or f"Campana {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    message_type = (payload.get("message_type") or "template").strip().lower()
    if use_bot_first_message:
        message_type = "text"
    text_body = str(payload.get("text_body") or "").strip()
    template_name = str(payload.get("template_name") or "").strip()
    template_language = str(payload.get("template_language") or "es_AR").strip()
    template_variables = payload.get("template_variables") or []
    filters = deepcopy(payload.get("filters") or {})

    if message_type == "template" and not template_name:
        raise WhatsAppServiceError("Debes indicar una plantilla para la campana.")
    if message_type == "text" and not text_body and not use_bot_first_message:
        raise WhatsAppServiceError("Debes indicar el texto del mensaje para la campana.")

    campaign = {
        "id": str(uuid.uuid4()),
        "name": name,
        "status": "running",
        "message_type": message_type,
        "template_name": template_name,
        "template_language": template_language,
        "text_body": text_body,
        "template_variables": template_variables,
        "use_bot_first_message": use_bot_first_message,
        "filters": filters,
        "created_at": _utc_now(),
        "targets_total": len(candidates),
        "sent_count": 0,
        "failed_count": 0,
        "targets": [],
    }

    outbound_records = []
    for lead in candidates:
        raw_phone = lead.get("telefono") or ""
        normalized_phone = normalize_phone_for_whatsapp(raw_phone)
        preview = ""
        provider_message_id = ""
        send_error = ""
        status = "accepted"

        try:
            if not normalized_phone:
                raise WhatsAppServiceError("No se pudo normalizar el telefono del lead.")

            if message_type == "template":
                raw_vars = [
                    _render_text_template(item, lead)
                    for item in template_variables
                    if str(item).strip()
                ]
                # WhatsApp rejects newlines/tabs/4+ spaces in template params
                rendered_vars = [
                    re.sub(r" {4,}", "    ", v.replace("\r", "").replace("\n", " ").replace("\t", " ").strip())[:1024]
                    for v in raw_vars
                ]
                preview = f"Plantilla {template_name} -> {', '.join(rendered_vars) if rendered_vars else 'sin variables'}"
                response = send_template_message(
                    normalized_phone,
                    template_name,
                    template_language,
                    rendered_vars,
                )
                # Después del template, enviar menú si el bot está activo
                _send_bot_menu_after_template(
                    normalized_phone,
                    lead.get("full_name") or lead.get("nombre") or "",
                    lead.get("id") or "",
                )
            else:
                if use_bot_first_message:
                    rendered_text = build_first_message(lead, bot_config)
                else:
                    rendered_text = _render_text_template(text_body, lead)
                preview = rendered_text
                response = send_text_message(normalized_phone, rendered_text)

            provider_message_id = ((response.get("messages") or [{}])[0]).get("id") or ""
            campaign["sent_count"] += 1
        except Exception as exc:
            status = "failed"
            send_error = str(exc)
            campaign["failed_count"] += 1

        campaign["targets"].append({
            "lead_id": lead.get("id"),
            "lead_name": lead.get("full_name") or lead.get("nombre") or "",
            "phone_raw": raw_phone,
            "phone_e164": normalized_phone,
            "status": status,
            "error_message": send_error,
            "preview": preview,
            "meta_message_id": provider_message_id,
        })
        outbound_records.append(
            _build_outbound_record(
                lead=lead,
                campaign_id=campaign["id"],
                phone_raw=raw_phone,
                phone_e164=normalized_phone,
                message_type=message_type,
                preview=preview,
                provider_message_id=provider_message_id,
                status=status,
                error_message=send_error,
                template_name=template_name,
            )
        )

    campaign["status"] = "completed"

    def _apply(store):
        _append_campaign(store, campaign)
        for message in outbound_records:
            _append_message_record(store, message)
        for target in campaign["targets"]:
            bot_ensure_conversation(
                store,
                phone_e164=target.get("phone_e164") or "",
                phone_raw=target.get("phone_raw") or "",
                lead_id=target.get("lead_id"),
                lead_name=target.get("lead_name") or "",
            )
        _record_event(
            store,
            "campaign_completed",
            {
                "campaign_id": campaign["id"],
                "name": campaign["name"],
                "sent_count": campaign["sent_count"],
                "failed_count": campaign["failed_count"],
            },
        )
        return campaign

    return _mutate_store(_apply)


def _extract_inbound_preview(message):
    text = message.get("text") or {}
    if text.get("body"):
        return text.get("body")
    interactive = message.get("interactive") or {}
    if interactive.get("button_reply"):
        return interactive["button_reply"].get("title") or "Boton interactivo"
    if interactive.get("list_reply"):
        return interactive["list_reply"].get("title") or "Lista interactiva"
    if message.get("type"):
        return f"Mensaje tipo {message['type']}"
    return "Mensaje entrante"


def _update_existing_message_status(store, meta_message_id, status, status_payload):
    updated = False
    for item in reversed(store.get("messages") or []):
        if item.get("meta_message_id") == meta_message_id:
            item["status"] = status or item.get("status")
            item["last_status_at"] = _utc_now()
            item["status_payload"] = status_payload
            updated = True
            break
    return updated


def process_webhook(payload, leads=None, find_lead_fn=None):
    """Process an inbound webhook.
    
    find_lead_fn: optional callable(phone_e164) -> lead dict. If provided,
    used instead of iterating the leads list (avoids loading all leads).
    """
    if leads is None:
        leads = []
    results = {
        "messages_received": 0,
        "statuses_received": 0,
        "bot_replies_sent": 0,
    }

    def _apply(store):
        entries = payload.get("entry") or []
        for entry in entries:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                contacts_by_phone = {
                    contact.get("wa_id"): contact for contact in (value.get("contacts") or [])
                }

                for status in value.get("statuses") or []:
                    meta_message_id = status.get("id") or ""
                    message_status = status.get("status") or "updated"
                    updated = _update_existing_message_status(
                        store, meta_message_id, message_status, status
                    )
                    if not updated:
                        _append_message_record(
                            store,
                            {
                                "id": str(uuid.uuid4()),
                                "campaign_id": None,
                                "lead_id": None,
                                "lead_name": "",
                                "phone_raw": status.get("recipient_id") or "",
                                "phone_e164": normalize_phone_for_whatsapp(status.get("recipient_id") or ""),
                                "direction": "status",
                                "message_type": "status",
                                "preview": message_status,
                                "template_name": "",
                                "meta_message_id": meta_message_id,
                                "status": message_status,
                                "error_message": "",
                                "contact_name": "",
                                "created_at": _utc_now(),
                                "status_payload": status,
                            },
                        )
                    results["statuses_received"] += 1

                for message in value.get("messages") or []:
                    raw_from = message.get("from") or ""
                    phone_e164 = normalize_phone_for_whatsapp(raw_from)
                    if find_lead_fn:
                        lead = find_lead_fn(phone_e164) or {}
                    else:
                        lead = _find_lead_by_phone(leads, phone_e164) or {}
                    contact = contacts_by_phone.get(raw_from) or {}
                    _append_message_record(
                        store,
                        {
                            "id": str(uuid.uuid4()),
                            "campaign_id": None,
                            "lead_id": lead.get("id"),
                            "lead_name": lead.get("full_name") or lead.get("nombre") or "",
                            "phone_raw": raw_from,
                            "phone_e164": phone_e164,
                            "direction": "inbound",
                            "message_type": message.get("type") or "text",
                            "preview": _extract_inbound_preview(message),
                            "template_name": "",
                            "meta_message_id": message.get("id") or "",
                            "status": "received",
                            "error_message": "",
                            "contact_name": contact.get("profile", {}).get("name") or "",
                            "created_at": _utc_now(),
                            "payload": message,
                        },
                    )
                    results["messages_received"] += 1

                    # Respuesta automática del bot de orientación, si está activo.
                    bot_cfg = bot_get_config(store)
                    if bot_cfg.get("bot_enabled"):
                        conv = (store.get("bot_conversations") or {}).get(phone_e164)
                        menu_cfg = bot_get_menu_config(bot_cfg)

                        # Extract text from text, button, and interactive messages
                        inbound_text = None
                        raw_msg_type = message.get("type") or "unknown"
                        if raw_msg_type == "text":
                            inbound_text = message.get("text", {}).get("body")
                        elif raw_msg_type == "button":
                            btn = message.get("button") or {}
                            inbound_text = btn.get("text") or btn.get("payload") or None
                        elif raw_msg_type == "interactive":
                            interactive = message.get("interactive") or {}
                            button_reply = interactive.get("button_reply") or {}
                            list_reply = interactive.get("list_reply") or {}
                            inbound_text = button_reply.get("title") or list_reply.get("title") or None
                        if not inbound_text:
                            for obj in [message, message.get("button"), message.get("interactive")]:
                                if isinstance(obj, dict):
                                    for k in ("text", "payload", "title", "id", "body"):
                                        v = obj.get(k)
                                        if isinstance(v, str) and len(v) > 0:
                                            inbound_text = v
                                            break
                                if inbound_text:
                                    break

                        # Skip duplicate webhook retries (same WhatsApp message ID)
                        msg_id = message.get("id") or ""
                        if msg_id and _is_duplicate_msg(msg_id):
                            continue

                        # Create or reopen conversation when bot+menu is active
                        if menu_cfg.get("enabled") and (not conv or conv.get("closed")):
                            if not conv:
                                conv = bot_ensure_conversation(
                                    store,
                                    phone_e164=phone_e164,
                                    phone_raw=raw_from,
                                    lead_id=lead.get("id") if lead else None,
                                    lead_name=lead.get("full_name") or (lead.get("name") if lead else None) or contact.get("profile", {}).get("name") or "",
                                )
                            conv["closed"] = False
                            conv["close_reason"] = None
                            conv["closed_at"] = None
                            conv["stage"] = "menu_q1"
                            conv.setdefault("data", {})["menu_current_question"] = 0
                            conv.setdefault("data", {})["menu_sent"] = True
                            conv["updated_at"] = _utc_now()

                        if conv and not conv.get("closed"):
                            try:
                                replies = bot_handle_inbound(conv, inbound_text, bot_cfg, lead or None)
                            except Exception as e:
                                _log.error("BOT_HANDLE_ERROR phone=%s text=%r err=%s", phone_e164, inbound_text, e)
                                replies = []
                            for body in replies:
                                try:
                                    send_text_message(phone_e164, body)
                                    status = "accepted"
                                    error_message = ""
                                except Exception as exc:
                                    status = "failed"
                                    error_message = str(exc)
                                _append_message_record(
                                    store,
                                    _build_outbound_record(
                                        lead=lead,
                                        campaign_id=None,
                                        phone_raw=raw_from,
                                        phone_e164=phone_e164,
                                        message_type="text",
                                        preview=body,
                                        status=status,
                                        error_message=error_message,
                                    ),
                                )
                                results["bot_replies_sent"] = results.get("bot_replies_sent", 0) + 1

        _record_event(store, "webhook_received", results)
        return results

    return _mutate_store(_apply)


def _bot_status_from_store(store):
    config = bot_get_config(store)
    return {
        "config": config,
        "stats": bot_stats(store),
        "first_message": build_first_message(None, config),
    }


def get_bot_status():
    return _bot_status_from_store(_read_store())


def update_bot_config(payload):
    allowed = set(DEFAULT_BOT_CONFIG.keys())

    def _apply(store):
        config = store.setdefault("config", {})
        for key, value in (payload or {}).items():
            if key not in allowed:
                continue
            # Para preguntas del menú, guardar como JSON (lista de objetos)
            if key == "bot_menu_questions" and isinstance(value, list):
                config[key] = value
            elif key == "bot_menu_enabled":
                # Guardar como booleano
                config[key] = value
            else:
                config[key] = str(value or "").strip()
        return _bot_status_from_store(store)

    return _mutate_store(_apply)


def list_bot_conversations(include_closed=True):
    return bot_list_conversations(_read_store(), include_closed=include_closed)


def get_bot_conversation(phone):
    normalized = normalize_phone_for_whatsapp(phone)
    return bot_get_conversation(_read_store(), normalized)


def run_bot_followups():
    def _apply(store):
        pending = bot_due_followups(store)
        sent = 0
        for conv, phone, body in pending:
            pseudo_lead = {
                "id": conv.get("lead_id"),
                "full_name": conv.get("lead_name") or "",
                "nombre": "",
            }
            try:
                send_text_message(phone, body)
                status = "accepted"
                error_message = ""
            except Exception as exc:
                status = "failed"
                error_message = str(exc)
            _append_message_record(
                store,
                _build_outbound_record(
                    lead=pseudo_lead,
                    campaign_id=None,
                    phone_raw=phone,
                    phone_e164=phone,
                    message_type="text",
                    preview=body,
                    status=status,
                    error_message=error_message,
                ),
            )
            sent += 1
        _record_event(store, "bot_followups_run", {"sent": sent})
        return {"sent": sent}

    return _mutate_store(_apply)


def get_webhook_verify_token():
    return _resolved_config().get("webhook_verify_token") or ""
