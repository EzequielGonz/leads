# -*- coding: utf-8 -*-
"""Bot de orientación por accidentes laborales - Versión completa.

Flujo (máquina de estados):
  1. Template con 2 botones: "Mi caso ya esta resuelto" / "Mi caso esta pendiente"
  2. "Resuelto" → mensaje de agradecimiento y cierre
  3. "Pendiente" → intro + 4 preguntas → cierre con notificación a profesionales

Estados:
  menu_awaiting_choice  → Esperando que el cliente elija resuelto/pendiente
  menu_q1               → Pregunta 1: Antigüedad del caso
  menu_q2               → Pregunta 2: Lugar del accidente
  menu_q3               → Pregunta 3: Horario de consulta (validación regex)
  menu_q4               → Pregunta 4: Lesión / tratamiento (texto libre)
  menu_closed           → Conversación finalizada
"""

import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Normalización de texto (requerimiento del spec)
# ---------------------------------------------------------------------------

def _strip_accents(text):
    """Quita tildes/acentos de un string. Ej: 'está' -> 'esta'."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _normalize(text):
    """Normaliza texto: quita tildes, pasa a minúsculas, trim."""
    return _strip_accents(str(text or "")).strip().lower()


# ---------------------------------------------------------------------------
# Configuración del bot
# ---------------------------------------------------------------------------

DEFAULT_BOT_CONFIG = {
    "bot_enabled": False,
    "bot_menu_enabled": True,
    "bot_menu_intro": "",
    "bot_menu_questions": [],
}

# Preguntas por defecto (las 4 preguntas del formulario)
DEFAULT_MENU_QUESTIONS = [
    {
        "id": "antiguedad",
        "question": "📋 Pregunta 1: ¿Hace cuánto tiempo ocurrió tu accidente laboral?",
        "options": [
            {"value": "1", "label": "Menos de 6 meses"},
            {"value": "2", "label": "Entre 6 meses y 1 año"},
            {"value": "3", "label": "Entre 1 y 2 años"},
            {"value": "4", "label": "Más de 2 años"}
        ]
    },
    {
        "id": "lugar",
        "question": "📋 Pregunta 2: ¿Dónde ocurrió el accidente?",
        "options": [
            {"value": "1", "label": "En el lugar de trabajo"},
            {"value": "2", "label": "En el camino al trabajo"},
            {"value": "3", "label": "Volviendo del trabajo"}
        ]
    },
    {
        "id": "horario",
        "question": (
            "📋 Pregunta 3: 📅 ¿Qué día y horario te quedaría cómodo para una consulta "
            "con un profesional?\n\nLa consulta tiene el fin de analizar con más detalle "
            "tu caso y poder brindarte el mejor asesoramiento integral.\n"
            "La consulta no tiene costo y es completamente sin compromiso.\n"
            "Trabajamos de lunes a viernes de 9 a 18hs.\n\n"
            "(Por favor, escribir tu respuesta en el siguiente formato: 10/5/2026 17:30hs)"
        ),
        "options": [],
        "free_text": True,
        "validate_regex": r"^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}(hs)?$",
        "validation_hint": (
            "Por favor escribí la fecha y hora en este formato:\n"
            "10/5/2026 17:30hs\n\n"
            "Trabajamos de lunes a viernes de 9 a 18hs."
        ),
    },
    {
        "id": "lesion",
        "question": (
            "📋 Pregunta 4: 🩺 ¿Qué lesión o problema de salud te generó el "
            "accidente laboral?\n\n¿Seguís en tratamiento?\n\n"
            "(Escribí tu respuesta)"
        ),
        "options": [],
        "free_text": True
    }
]

# Regex para validar formato de horario
HORARIO_REGEX = re.compile(r"^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}(hs)?$")


def get_menu_config(config):
    """Obtiene la config del menú. Siempre activo."""
    intro = str(config.get("bot_menu_intro") or "").strip()
    questions = config.get("bot_menu_questions")
    if not questions or not isinstance(questions, list) or len(questions) < 4:
        questions = DEFAULT_MENU_QUESTIONS
    return {
        "enabled": True,
        "intro": intro,
        "questions": questions,
    }


# ---------------------------------------------------------------------------
# Números de profesionales para notificación (variables de entorno)
# ---------------------------------------------------------------------------

def _get_professional_phones():
    """Lee los números de notificación de variables de entorno."""
    phones = []
    for i in range(1, 6):
        phone = os.environ.get(f"NOTIFY_NUMBER_{i}", "").strip()
        if phone:
            phones.append(phone)
    # Fallback si no hay variables de entorno configuradas
    if not phones:
        phones = [
            "5492235223906",
            "54911393435473",
        ]
    return phones


def _build_case_summary(conv, config):
    """Arma el resumen del caso para los profesionales (formato del spec)."""
    data = conv.get("data") or {}
    nombre = conv.get("lead_name") or "Sin nombre"
    telefono = conv.get("phone_raw") or conv.get("phone_e164") or ""
    barrio = data.get("barrio") or "No especificado"
    localidad = data.get("ubicacion") or "No especificado"
    antiguedad = data.get("menu_antiguedad_label") or ""
    lugar = data.get("menu_lugar_label") or ""
    horario = data.get("menu_horario") or ""
    lesion = data.get("menu_lesion") or ""
    tratamiento = data.get("menu_tratamiento") or ""

    # Combinar lesión y tratamiento en un solo campo
    lesion_tratamiento = lesion
    if tratamiento:
        lesion_tratamiento = f"{lesion} | Tratamiento: {tratamiento}"

    lines = [
        "📋 *NUEVO CASO A DERIVAR – VITA*",
        "",
        f"👤 *Nombre:* {nombre}",
        f"📞 *Teléfono:* {telefono}",
        f"📍 *Barrio:* {barrio}",
        f"🏙️ *Localidad:* {localidad}",
        f"⏳ *Antigüedad:* {antiguedad}",
        f"⚠️ *Lugar del accidente:* {lugar}",
        f"🗓️ *Consulta solicitada:* {horario}",
        f"🩺 *Lesión / tratamiento:* {lesion_tratamiento}",
        "",
        "👨‍💼 *Asesor asignado:* Leonardo",
        "",
        "---",
        "Este caso requiere atención profesional.",
    ]
    return "\n".join(lines)


def notify_professionals(conv, config):
    """Envía resumen del caso a los profesionales configurados."""
    try:
        from services.whatsapp_service import send_text_message
        summary = _build_case_summary(conv, config)
        phones = _get_professional_phones()
        for phone in phones:
            try:
                send_text_message(phone, summary)
            except Exception as e:
                print(f"[BOT] Error notificando a {phone}: {e}")
    except Exception as e:
        print(f"[BOT] Error notificación: {e}")


# ---------------------------------------------------------------------------
# Funciones auxiliares
# ---------------------------------------------------------------------------

def get_bot_config(store=None):
    """Lee la config del bot desde el store."""
    stored = (store or {}).get("config") or {}
    cfg = {}
    for key, default in DEFAULT_BOT_CONFIG.items():
        cfg[key] = stored.get(key, default)
    cfg["bot_enabled"] = str(cfg.get("bot_enabled")).strip().lower() in (
        "1", "true", "yes", "si", "sí", "on",
    )
    return cfg


def ensure_conversation(store, phone_e164, phone_raw="", lead_id=None, lead_name=""):
    """Crea o busca una conversación."""
    convs = store.setdefault("bot_conversations", {})
    conv = convs.get(phone_e164)
    if conv is None:
        conv = {
            "id": str(uuid.uuid4()),
            "phone_e164": phone_e164,
            "phone_raw": str(phone_raw or ""),
            "lead_id": lead_id,
            "lead_name": lead_name or "",
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
            "stage": "menu_awaiting_choice",
            "closed": False,
            "close_reason": "",
            "closed_at": None,
            "priority": None,
            "replies_count": 0,
            "data": {},
            "summary": None,
        }
        convs[phone_e164] = conv
    return conv


def get_bot_conversation(store, phone_e164):
    """Busca una conversación por número."""
    return (store.get("bot_conversations") or {}).get(phone_e164)


def list_bot_conversations(store, include_closed=True):
    """Lista todas las conversaciones."""
    rows = []
    for conv in (store.get("bot_conversations") or {}).values():
        if not include_closed and conv.get("closed"):
            continue
        rows.append(_public_conversation(conv))
    rows.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return rows


def _public_conversation(conv):
    """Formatea una conversación para el frontend."""
    data = conv.get("data") or {}
    return {
        "phone_e164": conv.get("phone_e164"),
        "lead_name": conv.get("lead_name"),
        "stage": conv.get("stage"),
        "closed": bool(conv.get("closed")),
        "close_reason": conv.get("close_reason") or "",
        "priority": conv.get("priority") or "",
        "replies_count": conv.get("replies_count", 0),
        "created_at": conv.get("created_at"),
        "updated_at": conv.get("updated_at"),
        "closed_at": conv.get("closed_at"),
        "summary": conv.get("summary"),
        "data": {
            "menu_antiguedad_label": data.get("menu_antiguedad_label") or "",
            "menu_lugar_label": data.get("menu_lugar_label") or "",
            "menu_horario": data.get("menu_horario") or "",
            "menu_lesion": data.get("menu_lesion") or "",
            "menu_tratamiento": data.get("menu_tratamiento") or "",
            "barrio": data.get("barrio") or "",
            "ubicacion": data.get("ubicacion") or "",
        },
    }


def bot_stats(store):
    """Estadísticas del bot."""
    convs = list((store.get("bot_conversations") or {}).values())
    return {
        "total": len(convs),
        "active": sum(1 for c in convs if not c.get("closed")),
        "closed": sum(1 for c in convs if c.get("closed")),
    }


def build_first_message(lead, config):
    """Mensaje inicial (no se usa en el flujo nuevo)."""
    return ""


def build_summary(conv):
    """Resumen de la conversación."""
    return {}


def run_due_followups(store):
    """Seguimientos pendientes (deshabilitado)."""
    return []


# ---------------------------------------------------------------------------
# LÓGICA PRINCIPAL: Manejo del menú de 4 preguntas
# ---------------------------------------------------------------------------

def _finalize(conv, reason):
    """Cierra la conversación y guarda el resumen."""
    conv["closed"] = True
    conv["close_reason"] = reason
    conv["closed_at"] = _utc_now()
    conv["updated_at"] = _utc_now()
    conv["summary"] = {
        "nombre": conv.get("lead_name") or "",
        "telefono": conv.get("phone_e164") or "",
        "respuestas": conv.get("data") or {},
    }


def _build_menu_intro():
    """Texto de intro para las preguntas."""
    return (
        "Para poder derivarte con el profesional adecuado según tu\n"
        "situación, necesitamos hacerte algunas preguntas breves.\n"
        "No te preocupes, son solo para entender mejor tu caso y\n"
        "brindarte la mejor atención.\n\n"
        "Responde con el número de cada opción:"
    )


def _build_question(questions, index):
    """Arma el mensaje de una pregunta."""
    q = questions[index]
    lines = [q["question"]]
    for opt in q.get("options", []):
        lines.append(f"   {opt['value']} - {opt['label']}")
    if q.get("free_text") and not q.get("options"):
        # Solo agregar "(Escribí tu respuesta)" si la pregunta NO tiene opciones
        pass
    return "\n".join(lines)


def _validate_free_text(question, text):
    """Valida respuesta de texto libre (horario con regex, lesión que no vacío)."""
    # Si la pregunta tiene regex de validación, usarla
    pattern = question.get("validate_regex")
    if pattern:
        if not re.match(pattern, text.strip()):
            hint = question.get("validation_hint", "Formato inválido. Por favor seguí el formato indicado.")
            return False, hint

    # Verificar que no esté vacío
    if not text.strip():
        return False, "Por favor escribí tu respuesta."

    return True, ""


def handle_inbound(conv, raw_text, config, lead=None):
    """Procesa un mensaje entrante. Devuelve lista de respuestas."""
    conv["replies_count"] = conv.get("replies_count", 0) + 1
    conv["updated_at"] = _utc_now()

    # Si la conversación ya está cerrada, no responder
    if conv.get("closed"):
        return []

    # Actualizar nombre si falta
    if not conv.get("lead_name") and lead:
        name = str(lead.get("full_name") or lead.get("nombre") or "").strip()
        if name:
            conv["lead_name"] = name

    text = str(raw_text or "").strip()
    if not text:
        return []

    stage = conv.get("stage") or "menu_awaiting_choice"
    d = conv.setdefault("data", {})
    menu_cfg = get_menu_config(config)
    questions = menu_cfg["questions"]

    # Normalizar texto (quitar tildes + minúsculas) para comparaciones
    text_normalized = _normalize(text)
    menu_stages = ["menu_q1", "menu_q2", "menu_q3", "menu_q4"]

    # --- PRIMERO: si estamos en una pregunta del menú, procesar respuesta ---
    if stage in menu_stages:
        idx = menu_stages.index(stage)
        current_q = questions[idx]

        # Validar respuesta si tiene opciones (Q1, Q2)
        if current_q.get("options"):
            valid_values = [opt["value"] for opt in current_q["options"]]
            if text.strip() not in valid_values:
                options_text = "\n".join([
                    f"   {opt['value']} - {opt['label']}"
                    for opt in current_q["options"]
                ])
                return [
                    f"Perdón, no entendí. Por favor elegí una de estas opciones:\n\n{options_text}"
                ]
            # Guardar valor y label
            d[f"menu_{current_q['id']}"] = text.strip()
            for opt in current_q["options"]:
                if opt["value"] == text.strip():
                    d[f"menu_{current_q['id']}_label"] = opt["label"]
                    break
        else:
            # Texto libre (Q3 horario, Q4 lesión)
            valid, hint = _validate_free_text(current_q, text)
            if not valid:
                return [hint]

            d[f"menu_{current_q['id']}"] = text.strip()

            # Detectar tratamiento en Q4 (lesión)
            if current_q.get("id") == "lesion":
                t_normalized = _normalize(text)
                if any(w in t_normalized for w in [
                    "si", "sigo", "tratamiento", "tratandome", "en tratamiento"
                ]):
                    d["menu_tratamiento"] = "Si, en tratamiento"
                elif any(w in t_normalized for w in [
                    "no", "alta", "curado", "ya no", "suspendido"
                ]):
                    d["menu_tratamiento"] = "No"
                else:
                    d["menu_tratamiento"] = text.strip()

        # Avanzar a la siguiente pregunta
        next_idx = idx + 1
        if next_idx >= len(questions):
            # Todas las preguntas respondidas → cierre
            _finalize(conv, "menu_completado")
            try:
                notify_professionals(conv, config)
            except Exception as e:
                print(f"[BOT] Error notificación: {e}")
            nombre = conv.get("lead_name") or ""
            return [
                f"Perfecto{', ' + nombre if nombre else ''}. "
                "Un profesional se va a estar contactando con vos brevemente."
            ]

        # Enviar siguiente pregunta
        conv["stage"] = menu_stages[next_idx]
        conv["updated_at"] = _utc_now()
        return [_build_question(questions, next_idx)]

    # --- DESPUÉS: solo en menu_awaiting_choice, detectar botones/texto ---
    if stage == "menu_awaiting_choice":
        # "Ya está resuelto" → mensaje de agradecimiento y cierre
        if "resuelto" in text_normalized:
            _finalize(conv, "resuelto")
            return [
                "¡Gracias por comunicarte con Estudio VITA! "
                "Si en el futuro necesitás asesoramiento, no dudes en escribirnos. "
                "¡Éxitos!"
            ]

        # "Mi caso está pendiente" → iniciar preguntas
        if "pendiente" in text_normalized or "mi caso" in text_normalized:
            d["menu_current_question"] = 0
            conv["stage"] = "menu_q1"
            conv["updated_at"] = _utc_now()
            return [_build_menu_intro(), _build_question(questions, 0)]

        # Texto no reconocido → mostrar opciones
        return [
            "¿Tu caso todavía está pendiente o ya pudiste resolverlo?\n\n"
            "(RESPONDE USANDO 1 O 2)\n\n"
            "1 - Mi caso ya está resuelto\n"
            "2 - Mi caso está pendiente"
        ]

    return []
