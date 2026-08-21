# -*- coding: utf-8 -*-
"""Motor de conversación del bot de orientación por accidentes laborales.

Implementa el flujo definido en el documento de entrenamiento:
mensaje inicial obligatorio, confirmación de estado, autorización,
chequeo de emergencia, cuestionario de 13 preguntas, objeciones
frecuentes, detección de prioridad, coordinación de entrevista y
solicitudes de baja.

El módulo trabaja con funciones puras sobre el store (diccionarios).
El envío y el registro de los mensajes lo realiza whatsapp_service.
"""

import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Configuración del bot
# ---------------------------------------------------------------------------

DEFAULT_BOT_CONFIG = {
    "bot_enabled": False,
    "bot_study_name": "",
    "bot_advisor_name": "",
    "bot_consultation_policy": "el costo debe confirmarlo el profesional",
    "bot_legal_name": "",
    "bot_verification_channel": "",
    "bot_slot_1": "",
    "bot_slot_2": "",
    # Menú numérico
    "bot_menu_enabled": False,
    "bot_menu_intro": "",
    "bot_menu_questions": [],
}

# Preguntas por defecto del menú numérico
DEFAULT_MENU_QUESTIONS = [
    {
        "id": "antiguedad",
        "question": "📋 Pregunta 1: ¿Cuánto tiempo de antiguedad tiene tu caso?",
        "options": [
            {"value": "1", "label": "Menos de 1 año"},
            {"value": "2", "label": "De 1 a 5 años"},
            {"value": "3", "label": "Más de 5 años"}
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
        "question": "📋 Pregunta 3: 📅 ¿Qué día y horario te viene bien para una reunión con un profesional?",
        "options": [],
        "free_text": True,
        "required": True
    },
    {
        "id": "lesion",
        "question": "📋 Pregunta 4: 🩺 ¿Qué lesión o problema de salud te generó el accidente laboral?",
        "options": [],
        "free_text": True,
        "required": True
    }
]

_ENV_MAP = {
    "bot_enabled": "WHATSAPP_BOT_ENABLED",
    "bot_study_name": "WHATSAPP_BOT_STUDY_NAME",
    "bot_advisor_name": "WHATSAPP_BOT_ADVISOR_NAME",
    "bot_consultation_policy": "WHATSAPP_BOT_CONSULTATION_POLICY",
    "bot_legal_name": "WHATSAPP_BOT_LEGAL_NAME",
    "bot_verification_channel": "WHATSAPP_BOT_VERIFICATION_CHANNEL",
    "bot_slot_1": "WHATSAPP_BOT_SLOT_1",
    "bot_slot_2": "WHATSAPP_BOT_SLOT_2",
    "bot_menu_enabled": "WHATSAPP_BOT_MENU_ENABLED",
    "bot_menu_intro": "WHATSAPP_BOT_MENU_INTRO",
}


def get_menu_config(config):
    """Obtiene la configuración del menú numérico."""
    menu_enabled = str(config.get("bot_menu_enabled")).strip().lower() in (
        "1", "true", "yes", "si", "sí", "on",
    )
    intro = str(config.get("bot_menu_intro") or "").strip()
    questions = config.get("bot_menu_questions") or DEFAULT_MENU_QUESTIONS
    
    return {
        "enabled": menu_enabled,
        "intro": intro,
        "questions": questions
    }


def _build_menu_initial_message(config):
    """Construye el mensaje inicial con las 2 opciones (resuelto / pendiente)."""
    return (
        "¿Tu caso todavía está pendiente o ya pudiste resolverlo?\n\n"
        "1 - Mi caso ya está resuelto\n"
        "2 - Mi caso está pendiente"
    )


def _build_menu_intro():
    """Construye el texto de intro después de elegir 'pendiente'."""
    return (
        "Para poder derivarte con el profesional adecuado según tu\n"
        "situación, necesitamos hacerte algunas preguntas breves.\n"
        "No te preocupes, son solo para entender mejor tu caso y\n"
        "brindarte la mejor atención.\n\n"
        "Responde con el número de cada opción:"
    )


def _build_menu_q1(questions):
    """Construye el mensaje de la pregunta 1."""
    q = questions[0]
    lines = [q["question"]]
    for opt in q["options"]:
        lines.append(f"   {opt['value']} - {opt['label']}")
    return "\n".join(lines)


def _build_menu_q2(questions):
    """Construye el mensaje de la pregunta 2."""
    q = questions[1]
    lines = [q["question"]]
    for opt in q["options"]:
        lines.append(f"   {opt['value']} - {opt['label']}")
    return "\n".join(lines)


def _build_menu_q3(questions):
    """Construye el mensaje de la pregunta 3 (texto libre)."""
    q = questions[2]
    return f"{q['question']}\n\n(Escribí tu respuesta)"


def _build_menu_q4(questions):
    """Construye el mensaje de la pregunta 4 (texto libre)."""
    q = questions[3]
    return f"{q['question']}\n\n(Escribí tu respuesta)"


def _build_menu_completion(conv, config):
    """Construye el mensaje de cierre después de completar todas las preguntas."""
    nombre = conv.get("lead_name") or ""
    estudio = _study_name(config)
    return (
        f"Perfecto{', ' + nombre if nombre else ''}. "
        f"Un profesional se va a estar contactando con vos brevemente."
    )


def get_bot_config(store=None):
    stored = (store or {}).get("config") or {}
    cfg = {}
    for key, default in DEFAULT_BOT_CONFIG.items():
        cfg[key] = stored.get(key, default)
    for key, env_name in _ENV_MAP.items():
        env_value = os.environ.get(env_name)
        if env_value is not None and str(env_value).strip() != "":
            cfg[key] = env_value
    cfg["bot_enabled"] = str(cfg.get("bot_enabled")).strip().lower() in (
        "1", "true", "yes", "si", "sí", "on",
    )
    return cfg


def _study_name(config):
    return str(config.get("bot_study_name") or "").strip() or "nuestro estudio"


def _legal_name(config):
    return str(config.get("bot_legal_name") or "").strip() or _study_name(config)


def _advisor_name(config):
    return str(config.get("bot_advisor_name") or "").strip()


def _policy(config):
    return (
        str(config.get("bot_consultation_policy") or "").strip()
        or "el costo debe confirmarlo el profesional"
    )


def _slot(config, key):
    return str(config.get(key) or "").strip()


# ---------------------------------------------------------------------------
# Textos del documento de entrenamiento (literales)
# ---------------------------------------------------------------------------

MSG_FIRST = (
    "Hola, {nombre}. ¿Cómo estás? {asesor}\n\n"
    "Te escribo por una consulta que realizaste anteriormente relacionada con un "
    "accidente laboral. Muchas personas desconocen que, dependiendo del accidente, "
    "el tratamiento y las posibles secuelas, podrían tener derecho a realizar un reclamo.\n\n"
    "¿Tu caso todavía está pendiente o ya pudiste resolverlo?"
)
MSG_PENDIENTE = (
    "Entiendo. Para que un profesional pueda evaluar tu situación, puedo hacerte unas "
    "preguntas breves sobre lo que ocurrió. ¿Te parece bien?"
)
MSG_AUTORIZA_NO = (
    "No hay problema. Si más adelante necesitás orientación, podés escribirnos por este mismo medio."
)
MSG_EMERGENCIA_Q = (
    "Antes de continuar, ¿estás recibiendo atención médica o necesitás asistencia urgente en este momento?"
)
MSG_EMERGENCIA = (
    "Lo más importante ahora es tu salud. Buscá atención médica o comunicate con el servicio "
    "de emergencias correspondiente. No esperes una respuesta legal para recibir asistencia."
)
MSG_EMERGENCIA_OFERTA = (
    "¿Querés que además deje registrada tu consulta para que un profesional se comunique con vos?"
)
MSG_RESUELTO_Q = (
    "Perfecto. ¿Pudiste resolverlo mediante la ART, recibiste una indemnización o contaste "
    "con asesoramiento de un profesional?"
)
MSG_RESUELTO_FIN = (
    "Entiendo, gracias por responder. Entonces voy a registrar que tu situación ya fue "
    "resuelta para que no continuemos contactándote."
)
MSG_ALTA_MOLESTIAS = (
    "Entiendo. Aunque te hayan dado el alta, que continúes con molestias o limitaciones puede "
    "ser un dato importante para que un profesional revise la situación. ¿Querés que coordinemos una evaluación?"
)
MSG_TIENE_ABOGADO = (
    "Perfecto. Para evitar interferir con el asesoramiento que ya estás recibiendo, no vamos a "
    "cuestionar ni intervenir en su trabajo. ¿Querés que registremos que ya contás con representación?"
)
MSG_NO_SABE_RESUELTO = (
    "Entiendo. En ese caso, un profesional podría revisar el estado del trámite y explicarte "
    "si existe algo pendiente. ¿Querés que coordinemos una consulta?"
)
MSG_NO_INTERESADO = (
    "Entiendo, no hay problema. ¿Querés que también registremos que no deseás recibir nuevos mensajes?"
)
MSG_NUNCA_ACCIDENTE = (
    "Entiendo y disculpá la molestia. Puede tratarse de un dato incorrecto. ¿Querés que "
    "eliminemos este número para que no vuelvas a recibir mensajes?"
)
MSG_NO_RECUERDA = (
    "Entiendo y disculpá la molestia. Puede tratarse de un registro anterior o de un dato "
    "ingresado incorrectamente. ¿Querés que eliminemos este número de nuestra base para que "
    "no volvamos a contactarte?"
)
MSG_BAJA = (
    "Entendido. Registré tu solicitud para que no vuelvas a recibir mensajes. "
    "Disculpá la molestia y gracias por avisarnos."
)
MSG_BAJA_NO_RECONOCE = (
    "Perfecto. Ya registré tu solicitud para que no vuelvas a recibir mensajes. "
    "Disculpá la molestia y gracias por avisarnos."
)
MSG_DISPONIBLE = (
    "Quedamos a tu disposición. Si más adelante necesitás orientación, podés escribirnos por este mismo medio."
)
MSG_ORIGEN = (
    "Tu contacto proviene de una consulta que realizaste anteriormente mediante una publicidad "
    "relacionada con accidentes laborales. Nuestro equipo recibió tus datos para comunicarse y "
    "verificar si todavía necesitabas orientación. Si no autorizás que conservemos tu contacto, "
    "lo eliminamos y no volvemos a escribirte."
)
MSG_ORIGEN_DETALLE = (
    "No tengo visible desde este chat el detalle exacto de la publicidad o del equipo que recibió "
    "inicialmente la consulta. Para no darte información incorrecta, puedo solicitar que una persona "
    "del equipo revise el registro y se comunique con vos. También puedo eliminar tu contacto ahora "
    "mismo si preferís no recibir nuevos mensajes."
)
MSG_ROBOT = (
    "Soy el asistente virtual de {estudio}. Mi función es recopilar información inicial y ayudarte "
    "a coordinar una entrevista. La evaluación del caso la realiza un profesional."
)
MSG_ESTAFA = (
    "Entiendo tu preocupación. Somos {legal}. No necesitás enviar claves, códigos ni datos "
    "bancarios por este chat."
)
MSG_MONTO = (
    "No es posible calcular un monto únicamente por mensaje. Depende de las circunstancias del "
    "accidente, la documentación, el tratamiento y la evaluación que corresponda. Un profesional "
    "puede revisar tu caso y explicarte cómo se analiza.\n\n"
    "¿Querés que coordinemos una consulta para que puedan evaluarlo?"
)
MSG_GRATIS = "La consulta inicial es {politica}."
MSG_PRIORIDAD = (
    "Por lo que me contás, sería importante que tu situación la revise directamente un profesional. "
    "Puedo solicitar una comunicación prioritaria para que te orienten correctamente."
)
MSG_RECHAZO_ART = (
    "Entiendo. Para orientarte correctamente, un profesional necesitaría revisar el rechazo y las "
    "fechas. ¿Tenés alguna notificación o constancia?"
)
MSG_DESPIDO = (
    "Entiendo. Esa situación debería revisarla un profesional porque puede involucrar cuestiones "
    "adicionales al accidente. ¿Querés que solicite una comunicación prioritaria?"
)
MSG_FIRMA = (
    "Para no darte una indicación incorrecta, ese documento debería revisarlo directamente un "
    "profesional antes de orientarte. ¿Querés que solicite una comunicación prioritaria?"
)
MSG_ALTA_DOLOR = (
    "Entiendo. Que continúes con dolor o limitaciones después del alta es un dato importante para "
    "que un profesional revise la situación. ¿Querés que coordinemos una consulta?"
)
MSG_DERIVAR = (
    "Voy a derivar la conversación a un integrante del equipo para que pueda ayudarte personalmente. "
    "También voy a compartirle el resumen de lo que me contaste para que no tengas que repetir "
    "toda la información."
)
MSG_DERIVAR_SIN_INFO = (
    "Para no brindarte información incorrecta, voy a derivar tu consulta a un profesional del equipo."
)
MSG_NO_ENTIENDO = "Perdón, no entendí bien tu respuesta. ¿Podés contármelo de otra manera?"
MSG_SCHEDULE_OPENER = (
    "Gracias por contarme toda esta información. Por lo que mencionás, el siguiente paso sería que "
    "un profesional revise tu situación y te explique qué alternativas pueden existir.\n\n"
    "¿Preferís que la consulta sea mediante una llamada telefónica, una videollamada o de manera presencial?"
)
MSG_MODALIDAD = "¿Preferís que la consulta sea mediante una llamada telefónica, una videollamada o de manera presencial?"
MSG_SLOTS = "Perfecto. Tenemos disponibilidad el {slot1} o el {slot2}. ¿Cuál te resulta más cómodo?"
MSG_SLOTS_FALLBACK = "Perfecto. ¿Qué día y horario te resultaría más cómodo para la consulta?"
MSG_CONFIRMACION = (
    "Perfecto, {nombre}. Tu consulta quedó agendada para el {horario}, mediante {modalidad}, "
    "con un profesional del equipo de {estudio}.\n\n"
    "Para aprovechar la entrevista, podés tener a mano, solamente si los tenés:\n"
    "• DNI.\n"
    "• Denuncia ante la ART.\n"
    "• Constancias médicas.\n"
    "• Estudios realizados.\n"
    "• Alta médica.\n"
    "• Notificación de rechazo.\n"
    "• Recibos de sueldo.\n"
    "• Mensajes relacionados con el accidente.\n\n"
    "No necesitás enviar claves, códigos ni datos bancarios.\n\n"
    "Si necesitás cambiar el horario, podés avisarnos por este mismo medio."
)
MSG_POSTERGA = (
    "No hay problema. Puedo dejar registrada tu consulta para que decidas más adelante. ¿Preferís "
    "que un profesional te envíe primero una explicación general o que cerremos el contacto por ahora?"
)
MSG_EXPLICACION_1 = (
    "Dependiendo de cómo ocurrió el accidente, el tratamiento recibido, la documentación y las "
    "posibles secuelas, podría existir la posibilidad de realizar un reclamo. Eso debe determinarlo "
    "un profesional después de revisar tu situación."
)
MSG_EXPLICACION_2 = (
    "La consulta sirve para conocer el estado del caso y explicarte qué alternativas podrían existir. "
    "No todos los casos son iguales y no podemos garantizar un resultado antes de evaluarlos."
)
MSG_NO_TEXTO = "No recibí bien tu mensaje. ¿Podés escribirme tu respuesta por este chat?"
MSG_YATIENE_ABOGADO = (
    "Perfecto. Para evitar interferir con el asesoramiento que ya recibís, no vamos a cuestionar ni "
    "intervenir en su trabajo. ¿Querés que registremos que ya contás con representación y cerremos el contacto?"
)
MSG_CERRAR_ABOGADO = (
    "Perfecto. Voy a registrar que ya contás con representación y no continuaremos contactándote. "
    "Si necesitás algo, podés escribirnos por este medio."
)
MSG_YA_DERIVADO = (
    "Gracias. Ya derivamos tu consulta a un integrante del equipo, que se va a comunicar con vos."
)
MSG_SCHEDULED_ACK = (
    "¡Gracias por confirmar! Si necesitás modificar el horario o tenés otra consulta, "
    "podés avisarnos por este mismo medio."
)

QUESTIONS = [
    ("q1", "fecha_accidente", "¿En qué fecha ocurrió el accidente?"),
    (
        "q2", "circunstancia",
        "¿El accidente ocurrió dentro del trabajo, mientras realizabas una tarea laboral "
        "o mientras ibas o volvías?",
    ),
    (
        "q3", "relacion_laboral",
        "¿En ese momento trabajabas en relación de dependencia? Por ejemplo, si estabas "
        "en blanco, sin registrar, como monotributista o de manera informal.",
    ),
    ("q4", "descripcion", "¿Podés contarme brevemente cómo ocurrió el accidente?"),
    ("q5", "lesion", "¿Qué lesión o problema de salud te produjo?"),
    ("q6", "atencion_medica", "¿Recibiste atención médica después del accidente?"),
    ("q7", "denuncia_art", "¿El accidente fue denunciado ante la ART?"),
    (
        "q8", "estado_tratamiento",
        "Actualmente, ¿seguís en tratamiento, te dieron el alta o la ART rechazó la atención?",
    ),
    (
        "q9", "salud_actual",
        "¿Actualmente seguís con dolor, molestias o alguna limitación para trabajar o realizar tus actividades?",
    ),
    (
        "q10", "situacion_laboral",
        "Después del accidente, ¿continuaste trabajando normalmente o tuviste algún problema con tu empleador?",
    ),
    (
        "q11", "documentacion",
        "¿Tenés alguna constancia del accidente, denuncia, estudios médicos, alta de la ART "
        "o mensajes con tu empleador?",
    ),
    ("q12", "ubicacion", "¿En qué localidad y provincia ocurrió el accidente?"),
    ("q13", "abogado", "¿Actualmente tenés un abogado que esté llevando este caso?"),
]

_QUESTION_BY_STAGE = {stage: (key, text) for stage, key, text in QUESTIONS}

# Etapas que esperan un "sí / no" simple por parte de la persona.
_YES_NO_STAGES = {
    "awaiting_authorization",
    "awaiting_emergency_offer",
    "awaiting_optout_confirm",
    "awaiting_schedule_offer",
    "awaiting_priority_offer",
    "awaiting_close_or_info",
}

_INTENT_NOT_INTERESTED = (
    "no me interesa", "no me interesan", "no estoy interesado", "no estoy interesada",
    "no quiero saber nada", "no quiero nada", "no me llama la atencion",
)
_INTENT_OPT_OUT_PHRASES = (
    "borrame", "borra mi numero", "elimina mi numero", "elimina mi contacto",
    "eliminen mi numero", "eliminame", "no me escriban", "no me escribas",
    "no me escriba", "no quiero recibir mensajes", "no quiero recibir mas mensajes",
    "no quiero que me escriban", "saquenme", "sacame", "dejen de escribir",
    "deja de escribir", "paren de escribir", "no me molesten", "no me molestes",
    "no autorice", "no autoricen", "quiero la baja", "darme de baja", "dame de baja",
    "borrame de la base", "no quiero estar en la base",
)
_INTENT_EMERGENCY = (
    "sangrando", "internado", "internada", "no puedo respirar", "estoy en el hospital",
    "estoy en la guardia", "me desmaye", "perdi el conocimiento", "no me puedo mover",
    "dolor muy fuerte", "me duele mucho", "accidente grave", "es una emergencia",
    "emergencia medica", "necesito atencion urgente", "asistencia urgente",
)
_INTENT_HABLAR_PERSONA = (
    "hablar con una persona", "hablar con alguien", "hablar con un humano",
    "con un humano", "persona humana", "un responsable", "con un responsable",
    "quiero hablar con alguien", "hablar con el abogado", "me pasas con",
    "me podes pasar con", "alguien del estudio", "atendeme vos", "hablar con un profesional",
    "estoy enojado", "estoy molesto", "quiero hacer un reclamo", "tengo una queja",
)
_INTENT_MONTO = (
    "cuanto voy a cobrar", "cuanto cobro", "cuanto me corresponde", "cuanto me toca",
    "cuanta plata", "cuanto dinero", "cuanto me pagarian", "cuanto van a pagar",
    "cuanto me corresponde cobrar", "calcula", "monto",
)
_INTENT_GRATIS = ("es gratis", "es gratuita", "la consulta es gratis", "la consulta es gratuita", "cuanto cuesta", "cuanto sale")
_INTENT_ROBOT = ("sos un robot", "sos un bot", "es un robot", "es un bot", "eres un robot", "hablo con una maquina", "sos una maquina", "es una maquina")
_INTENT_ESTAFA = ("es una estafa", "esto es una estafa", "es estafa", "me van a estafar", "es una truchada", "es un fraude")
_INTENT_ORIGEN = (
    "de donde sacaron mi numero", "de donde sacaste mi numero", "de donde tienen mi numero",
    "como consiguieron mi numero", "como consiguieron mi numero", "como tienen mi numero",
    "como llegaron a mi", "de donde salio mi numero", "de donde sacan los numeros",
    "por que me escriben", "por que me contactan",
)
_INTENT_ORIGEN_DETALLE = (
    "que publicidad", "con que estudio", "quien les dio mis datos", "quien les paso mis datos",
    "cuando hice esa consulta", "a quien autorice", "que empresa les paso",
    "de que publicidad", "cual publicidad",
)
_INTENT_NO_RECUERDA = (
    "no recuerdo", "no me acuerdo", "no consulte", "yo no consulte", "nunca consulte",
    "no hice ninguna consulta", "no hice una consulta", "no se de que me habla",
    "no se de que me hablas", "de que me hablan", "no hice nada", "no se que es esto",
    "no es mi numero", "ese numero no es mio", "no es mi numero", "no soy yo",
    "no me corresponde ese numero", "debe ser un error",
)
_INTENT_YA_ABOGADO = ("ya tengo abogado", "tengo abogado", "estoy con un abogado", "tengo un abogado")
_INTENT_FIRMA = (
    "me quieren hacer firmar", "me pidieron firmar", "tengo que firmar",
    "me hicieron firmar", "firmar un documento", "firmar algo", "quieren que firme",
    "me dieron un papel", "un documento para firmar",
)
_INTENT_DESPIDO = ("me despidieron", "me echaron", "fui despedido", "fui despedida", "me despidio", "me dejaron afuera del trabajo")
_INTENT_ART_RECHAZO = (
    "la art rechazo", "la art rechazo el accidente", "rechazo el accidente",
    "rechazaron el accidente", "la art no me acepto", "no me reconocieron el accidente",
    "la art no me tomo el accidente", "la art rechazo la atencion",
)
_INTENT_ALTA_DOLOR = (
    "me dieron el alta pero", "alta pero sigo con dolor", "alta y sigo con dolor",
    "sigo con dolor", "tengo dolor todavia", "me dieron el alta y tengo molestias",
    "me dieron el alta pero sigo mal",
)
_INTENT_CAMBIAR_TURNO = ("cambiar el horario", "cambiar la hora", "modificar el horario", "adelantar", "cancelar la consulta", "posponer", "reprogramar", "cambiar el turno", "no puedo ir")


# ---------------------------------------------------------------------------
# Utilidades de normalización y clasificación
# ---------------------------------------------------------------------------

_ACCENT_STRIP = re.compile(r"[^a-z0-9ñ\s]")


def _norm(text):
    s = unicodedata.normalize("NFD", str(text or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = _ACCENT_STRIP.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def _has(text, *phrases):
    t = _norm(text)
    return any(_norm(p) in t for p in phrases)


def _has_word(text, word):
    return re.search(r"\b" + re.escape(_norm(word)) + r"\b", _norm(text)) is not None


def _first_token(text):
    t = _norm(text)
    if not t:
        return ""
    return t.split(" ")[0]


_YES_EXACT = {
    "si", "sip", "sisi", "dale", "ok", "okey", "okay", "bueno", "claro",
    "yes", "obvio", "perfecto", "de una", "seguro", "dalo",
}
_NO_EXACT = {"no", "nop", "nope", "nah", "non", "tampoco"}


def is_yes(text):
    return _first_token(text) in _YES_EXACT


def is_no(text):
    return _first_token(text) in _NO_EXACT


def _classify_modality(text):
    t = _norm(text)
    if any(p in t for p in ("video", "videollamada", "zoom", "meet")):
        return "videollamada"
    if any(p in t for p in ("presencial", "consultorio", "oficina", "estudio")):
        return "presencial"
    if any(p in t for p in ("llamada", "llamado", "telefono", "telefonica", "llamar", "celular")):
        return "llamada telefónica"
    return str(text or "").strip()


# ---------------------------------------------------------------------------
# Prioridad
# ---------------------------------------------------------------------------

def _priority_flags(data):
    flags = []
    joined = " ".join(str(v or "").lower() for v in data.values())
    art = _norm(data.get("denuncia_art") or "")
    trat = _norm(data.get("estado_tratamiento") or "")
    atencion = _norm(data.get("atencion_medica") or "")
    laboral = _norm(data.get("situacion_laboral") or "")

    if str(data.get("emergencia") or "").strip().lower() in ("si", "sí", "yes"):
        flags.append("emergencia")
    if "rechaz" in art or "rechaz" in trat:
        flags.append("rechazo_art")
    if (
        "no recib" in atencion
        or "esperando atencion" in atencion
        or "no me atienden" in atencion
        or "no me atendieron" in atencion
        or "no me atendio" in atencion
        or "nadie me atendio" in atencion
    ):
        flags.append("sin_atencion_medica")
    if "dolor" in trat or "molest" in trat or "secuela" in trat:
        flags.append("alta_con_molestias")
    if "desped" in laboral or "echaron" in laboral:
        flags.append("despido")
    if "amenaz" in laboral or "presion" in laboral:
        flags.append("amenazas_o_presiones")
    if "firma" in laboral or "firmar" in joined:
        flags.append("firma_documento")
    if "fallec" in joined:
        flags.append("fallecimiento")
    if "menor" in joined:
        flags.append("menor_involucrado")
    if "grave" in joined or "lesion importante" in joined:
        flags.append("lesion_grave")
    if "audiencia" in joined or "citacion" in joined or "vencimiento" in joined or "plazo" in joined:
        flags.append("plazo_proximo")
    if "propuesta" in joined or "oferta" in joined:
        flags.append("propuesta_economica")
    return flags


def _evaluate_priority(conv):
    flags = _priority_flags(conv.get("data") or {})
    if flags:
        return "Alta"
    d = conv.get("data") or {}
    answered = sum(
        1 for k in (
            "fecha_accidente", "circunstancia", "relacion_laboral", "descripcion", "lesion",
            "atencion_medica", "denuncia_art", "estado_tratamiento", "salud_actual",
            "situacion_laboral", "documentacion", "ubicacion",
        )
        if d.get(k)
    )
    if d.get("turno_confirmado") or answered >= 4 or conv.get("stage") in (
        "scheduling_modality", "scheduling_slot", "scheduled",
    ):
        return "Media"
    return "Baja"


# ---------------------------------------------------------------------------
# Conversaciones
# ---------------------------------------------------------------------------

def ensure_conversation(store, phone_e164, phone_raw="", lead_id=None, lead_name=""):
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
            "stage": "awaiting_status",
            "closed": False,
            "close_reason": "",
            "closed_at": None,
            "priority": None,
            "followups_sent": 0,
            "followups_at": [],
            "replies_count": 0,
            "unclear_count": 0,
            "data": {},
            "summary": None,
        }
        convs[phone_e164] = conv
    return conv


def _lead_name(lead):
    if not lead:
        return ""
    return str(lead.get("full_name") or lead.get("nombre") or "").strip()


def build_first_message(lead, config):
    nombre = _lead_name(lead) or "[Nombre]"
    asesor = _advisor_name(config)
    if asesor:
        asesor_frase = f"Soy {asesor}, del equipo de {_study_name(config)}."
    else:
        asesor_frase = f"Soy del equipo de {_study_name(config)}."
    return MSG_FIRST.format(nombre=nombre, asesor=asesor_frase)


def _store_answer(conv, key, raw):
    conv.setdefault("data", {})[key] = str(raw or "").strip()


def _set_stage(conv, stage):
    conv["stage"] = stage
    conv["updated_at"] = _utc_now()


def _finalize(conv, reason, priority=None):
    conv["closed"] = True
    conv["close_reason"] = reason
    conv["closed_at"] = _utc_now()
    conv["updated_at"] = _utc_now()
    if priority:
        conv["priority"] = priority
    elif not conv.get("priority"):
        conv["priority"] = _evaluate_priority(conv)
    conv["summary"] = build_summary(conv)


def _transfer(conv):
    conv["stage"] = "transferred"
    conv["updated_at"] = _utc_now()
    if not conv.get("priority"):
        conv["priority"] = _evaluate_priority(conv)
    conv["summary"] = build_summary(conv)


def build_summary(conv):
    d = conv.get("data") or {}
    flags = _priority_flags(d)
    close_reason = conv.get("close_reason") or ""
    return {
        "nombre_completo": conv.get("lead_name") or "",
        "numero_telefono": conv.get("phone_e164") or "",
        "fecha_primer_contacto": conv.get("created_at") or "",
        "origen_general": "Consulta previa sobre accidente laboral",
        "reconoce_haber_consultado": (
            d.get("reconoce_consulta")
            or ("No" if close_reason == "no_reconoce_consulta" else "Pendiente")
        ),
        "autorizo_continuar": d.get("autorizo") or "Pendiente",
        "fecha_accidente": d.get("fecha_accidente") or "",
        "lugar_y_provincia": d.get("ubicacion") or "",
        "tipo_accidente": d.get("circunstancia") or "",
        "descripcion_breve": d.get("descripcion") or "",
        "situacion_laboral_al_momento": d.get("relacion_laboral") or "",
        "lesion_informada": d.get("lesion") or "",
        "atencion_medica_recibida": d.get("atencion_medica") or "",
        "denuncia_realizada": d.get("denuncia_art") or "",
        "estado_tratamiento": d.get("estado_tratamiento") or "",
        "alta_medica": d.get("estado_tratamiento") or "",
        "sintomas_o_limitaciones_actuales": d.get("salud_actual") or "",
        "rechazo_art": "Si" if "rechazo_art" in flags else "No",
        "situacion_laboral_actual": d.get("situacion_laboral") or "",
        "despido_presion_o_conflicto": (
            d.get("situacion_laboral")
            if any(f in flags for f in ("despido", "amenazas_o_presiones", "firma_documento"))
            else ""
        ),
        "documentacion_disponible": d.get("documentacion") or "",
        "tiene_abogado_actualmente": d.get("abogado") or "",
        "nivel_prioridad": conv.get("priority") or _evaluate_priority(conv),
        "modalidad_consulta_elegida": d.get("modalidad") or "",
        "disponibilidad_horaria": d.get("horario") or "",
        "turno_confirmado": "Si" if d.get("turno_confirmado") else "No",
        "solicito_la_baja": (
            "Si" if close_reason in ("baja", "no_reconoce_consulta", "no_interesado") else "No"
        ),
        "observaciones_objetivas": d.get("observaciones") or "",
    }


def get_bot_conversation(store, phone_e164):
    convs = store.get("bot_conversations") or {}
    return convs.get(phone_e164)


def list_bot_conversations(store, include_closed=True):
    rows = []
    for conv in (store.get("bot_conversations") or {}).values():
        if not include_closed and conv.get("closed"):
            continue
        rows.append(_public_conversation(conv))
    rows.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return rows


def _public_conversation(conv):
    return {
        "phone_e164": conv.get("phone_e164"),
        "lead_name": conv.get("lead_name"),
        "stage": conv.get("stage"),
        "closed": bool(conv.get("closed")),
        "close_reason": conv.get("close_reason") or "",
        "priority": conv.get("priority") or "",
        "appointment_set": bool((conv.get("data") or {}).get("turno_confirmado")),
        "followups_sent": conv.get("followups_sent", 0),
        "replies_count": conv.get("replies_count", 0),
        "created_at": conv.get("created_at"),
        "updated_at": conv.get("updated_at"),
        "closed_at": conv.get("closed_at"),
        "summary": conv.get("summary"),
    }


def bot_stats(store):
    convs = list((store.get("bot_conversations") or {}).values())
    active = [c for c in convs if not c.get("closed")]
    closed = [c for c in convs if c.get("closed")]
    return {
        "total": len(convs),
        "active": len(active),
        "closed": len(closed),
        "transferred": sum(1 for c in convs if c.get("stage") == "transferred"),
        "scheduled": sum(1 for c in convs if (c.get("data") or {}).get("turno_confirmado")),
        "opted_out": sum(
            1 for c in closed
            if c.get("close_reason") in ("baja", "no_reconoce_consulta", "no_interesado")
        ),
        "high_priority": sum(1 for c in convs if c.get("priority") == "Alta"),
    }


# ---------------------------------------------------------------------------
# Seguimientos
# ---------------------------------------------------------------------------

_FOLLOWUP_1 = (
    "Hola, {nombre}. Te escribo nuevamente por la consulta relacionada con un accidente laboral. "
    "Queríamos saber si tu situación todavía está pendiente y si necesitás orientación de un profesional.\n\n"
    "Si preferís no recibir nuevos mensajes, podés indicármelo y eliminamos tu contacto."
)
_FOLLOWUP_2 = (
    "Hola, {nombre}. Este es nuestro último mensaje respecto de tu consulta anterior sobre un "
    "accidente laboral. Si todavía necesitás orientación, podés responder por este medio y te "
    "ayudamos a coordinar una entrevista."
)


def run_due_followups(store):
    """Devuelve [(conversacion, phone_e164, cuerpo)] para los seguimientos vencidos."""
    config = get_bot_config(store)
    if not config.get("bot_enabled"):
        return []
    now = datetime.now(timezone.utc)
    convs = store.get("bot_conversations") or {}
    out = []
    for phone, conv in convs.items():
        if conv.get("closed") or conv.get("stage") == "transferred":
            continue
        if conv.get("stage") != "awaiting_status":
            continue
        if conv.get("replies_count", 0) > 0:
            continue
        sent = conv.get("followups_sent", 0)
        if sent >= 2:
            continue
        last = conv.get("updated_at") or conv.get("created_at")
        try:
            last_dt = datetime.fromisoformat(last)
        except Exception:
            continue
        if now - last_dt < timedelta(hours=24):
            continue
        nombre = conv.get("lead_name") or ""
        if sent == 0:
            conv["followups_sent"] = 1
            conv.setdefault("followups_at", []).append(_utc_now())
            conv["updated_at"] = _utc_now()
            out.append((conv, phone, _FOLLOWUP_1.format(nombre=nombre)))
        elif sent == 1:
            conv["followups_sent"] = 2
            conv.setdefault("followups_at", []).append(_utc_now())
            conv["updated_at"] = _utc_now()
            out.append((conv, phone, _FOLLOWUP_2.format(nombre=nombre)))
    return out


# ---------------------------------------------------------------------------
# Motor principal
# ---------------------------------------------------------------------------

def _no_reply(conv, config):
    return [MSG_NO_TEXTO]


def _intent_not_interested(text):
    return _has(text, *_INTENT_NOT_INTERESTED)


def _intent_opt_out(text):
    if _has_word(text, "baja"):
        return True
    return _has(text, *_INTENT_OPT_OUT_PHRASES)


def _intent_emergency(text):
    if is_no(text):
        return False
    return _has(text, *_INTENT_EMERGENCY)


def _intent_urgente_prioridad(text):
    if is_no(text):
        return False
    return "urgente" in _norm(text)


def _handle_yes_no_stage(conv, text, config):
    """Etapas que esperan confirmación sí/no. Devuelve respuestas o None."""
    stage = conv.get("stage")
    d = conv.setdefault("data", {})

    if stage == "awaiting_authorization":
        if is_yes(text):
            d["autorizo"] = "Sí"
            _set_stage(conv, "q0")
            return [MSG_EMERGENCIA_Q]
        if is_no(text):
            d["autorizo"] = "No"
            _finalize(conv, "no_autorizo")
            return [MSG_AUTORIZA_NO]
        return None

    if stage == "awaiting_emergency_offer":
        if is_yes(text):
            _transfer(conv)
            return [MSG_DERIVAR]
        if is_no(text):
            _finalize(conv, "rechazo_derivacion", priority="Alta")
            return [MSG_AUTORIZA_NO]
        return None

    if stage == "awaiting_optout_confirm":
        kind = d.get("optout_kind") or "no_interesado"
        if is_yes(text) or _intent_not_interested(text):
            if kind == "no_reconoce":
                _finalize(conv, "no_reconoce_consulta")
                return [MSG_BAJA_NO_RECONOCE]
            _finalize(conv, "baja")
            return [MSG_BAJA]
        if is_no(text):
            if kind == "no_reconoce":
                _finalize(conv, "no_interesado")
            else:
                _finalize(conv, "no_interesado")
            return [MSG_DISPONIBLE]
        return None

    if stage == "awaiting_schedule_offer":
        if is_yes(text):
            _set_stage(conv, "scheduling_modality")
            return [MSG_SCHEDULE_OPENER]
        if is_no(text):
            _set_stage(conv, "awaiting_postpone_choice")
            return [MSG_POSTERGA]
        return None

    if stage == "awaiting_priority_offer":
        if is_yes(text):
            conv["priority"] = "Alta"
            _set_stage(conv, "scheduling_modality")
            return [MSG_PRIORIDAD, MSG_MODALIDAD]
        if is_no(text):
            _finalize(conv, "prioridad_declinada", priority="Alta")
            return [MSG_DISPONIBLE]
        return None

    if stage == "awaiting_close_or_info":
        if _has(text, "informacion", "explicacion", "solo quiero saber", "consulta general", "informacion general"):
            _finalize(conv, "informacion_general")
            return [MSG_EXPLICACION_1, MSG_EXPLICACION_2]
        if is_yes(text):
            _finalize(conv, "ya_tiene_abogado")
            return [MSG_CERRAR_ABOGADO]
        if is_no(text):
            _finalize(conv, "informacion_general")
            return [MSG_EXPLICACION_1, MSG_EXPLICACION_2]
        return None

    return None


def _handle_interrupt_intents(conv, text, config):
    """Objeciones y consultas frecuentes. Devuelve respuestas o None si no aplica."""
    d = conv.setdefault("data", {})

    if _intent_emergency(text) or _intent_urgente_prioridad(text):
        if _intent_emergency(text):
            d["emergencia"] = "Si"
            conv["priority"] = "Alta"
            _set_stage(conv, "awaiting_emergency_offer")
            return [MSG_EMERGENCIA, MSG_EMERGENCIA_OFERTA]
        conv["priority"] = "Alta"
        _set_stage(conv, "awaiting_priority_offer")
        return [MSG_PRIORIDAD, MSG_MODALIDAD]

    if _has(text, *_INTENT_HABLAR_PERSONA):
        _transfer(conv)
        return [MSG_DERIVAR]

    if _has(text, *_INTENT_MONTO):
        _set_stage(conv, "awaiting_schedule_offer")
        return [MSG_MONTO]

    if _has(text, *_INTENT_GRATIS):
        return [MSG_GRATIS.format(politica=_policy(config))]

    if _has(text, *_INTENT_ROBOT):
        return [MSG_ROBOT.format(estudio=_study_name(config))]

    if _has(text, *_INTENT_ESTAFA):
        canal = str(config.get("bot_verification_channel") or "").strip()
        base = MSG_ESTAFA.format(legal=_legal_name(config))
        if canal:
            base += f" Podés verificar nuestros datos mediante {canal}."
        return [base]

    if _has(text, *_INTENT_ORIGEN):
        return [MSG_ORIGEN]

    if _has(text, *_INTENT_ORIGEN_DETALLE):
        return [MSG_ORIGEN_DETALLE]

    if _has(text, *_INTENT_NO_RECUERDA):
        d["reconoce_consulta"] = "No recuerda"
        d["optout_kind"] = "no_reconoce"
        _set_stage(conv, "awaiting_optout_confirm")
        return [MSG_NO_RECUERDA]

    if (
        len(text) <= 60
        and _has(text, *_INTENT_YA_ABOGADO)
        and "no tengo abogado" not in _norm(text)
        and "no tengo un abogado" not in _norm(text)
    ):
        d["abogado"] = "Si"
        _set_stage(conv, "awaiting_close_or_info")
        return [MSG_YATIENE_ABOGADO]

    if _has(text, *_INTENT_FIRMA):
        conv["priority"] = "Alta"
        _set_stage(conv, "awaiting_priority_offer")
        return [MSG_FIRMA]

    if _has(text, *_INTENT_DESPIDO):
        conv["priority"] = "Alta"
        _set_stage(conv, "awaiting_priority_offer")
        return [MSG_DESPIDO]

    if _has(text, *_INTENT_ART_RECHAZO):
        conv["priority"] = "Alta"
        _set_stage(conv, "awaiting_art_rechazo_detail")
        return [MSG_RECHAZO_ART]

    if _has(text, *_INTENT_ALTA_DOLOR):
        _set_stage(conv, "awaiting_schedule_offer")
        return [MSG_ALTA_DOLOR]

    return None


def _handle_stage(conv, text, config):
    stage = conv.get("stage")
    d = conv.setdefault("data", {})

    if stage == "awaiting_status":
        t = _norm(text)
        if "pendiente" in t or "no lo resolv" in t or "no lo solucion" in t or "todavia no" in t or "aun no" in t:
            d["reconoce_consulta"] = "Sí"
            _set_stage(conv, "awaiting_authorization")
            return [MSG_PENDIENTE]
        if (
            "resolv" in t or "solucion" in t or "indemniz" in t or "cobre" in t
            or "arregle" in t or "cerre" in t or "lo arregle" in t
        ):
            d["reconoce_consulta"] = "Sí"
            _set_stage(conv, "awaiting_resolved_detail")
            return [MSG_RESUELTO_Q]
        if "nunca" in t and ("accidente" in t or "tuve" in t or "sufri" in t):
            d["reconoce_consulta"] = "No"
            d["optout_kind"] = "no_reconoce"
            _set_stage(conv, "awaiting_optout_confirm")
            return [MSG_NUNCA_ACCIDENTE]
        return None

    if stage == "awaiting_resolved_detail":
        t = _norm(text)
        if "indemniz" in t or "cobre" in t:
            _finalize(conv, "resuelto")
            return [MSG_RESUELTO_FIN]
        if "abogad" in t:
            d["abogado"] = "Si"
            _set_stage(conv, "awaiting_close_or_info")
            return [MSG_TIENE_ABOGADO]
        if "no se" in t or "no estoy seguro" in t or "no saber" in t or "no se si" in t:
            _set_stage(conv, "awaiting_schedule_offer")
            return [MSG_NO_SABE_RESUELTO]
        if any(p in t for p in ("dolor", "molest", "secuela", "limitacion", "sigo mal")):
            _set_stage(conv, "awaiting_schedule_offer")
            return [MSG_ALTA_MOLESTIAS]
        _finalize(conv, "resuelto")
        return [MSG_RESUELTO_FIN]

    if stage == "awaiting_postpone_choice":
        t = _norm(text)
        if "explicacion" in t or "informacion" in t or "general" in t:
            _finalize(conv, "informacion_general")
            return [MSG_EXPLICACION_1, MSG_EXPLICACION_2]
        _finalize(conv, "postergado")
        return [MSG_DISPONIBLE]

    if stage == "awaiting_art_rechazo_detail":
        conv["priority"] = "Alta"
        _set_stage(conv, "scheduling_modality")
        return [MSG_PRIORIDAD, MSG_MODALIDAD]

    if stage == "q0":
        if _intent_emergency(text):
            d["emergencia"] = "Si"
            conv["priority"] = "Alta"
            _set_stage(conv, "awaiting_emergency_offer")
            return [MSG_EMERGENCIA, MSG_EMERGENCIA_OFERTA]
        d["emergencia"] = "No"
        _set_stage(conv, "q1")
        return [_QUESTION_BY_STAGE["q1"][1]]

    if stage in _QUESTION_BY_STAGE:
        q_key, q_text = _QUESTION_BY_STAGE[stage]
        _store_answer(conv, q_key, text)

        if stage == "q13":
            if is_no(text) or "no tengo abogado" in _norm(text) or "no, no tengo" in _norm(text):
                d["abogado"] = "No"
                _set_stage(conv, "scheduling_modality")
                return [MSG_SCHEDULE_OPENER]
            d["abogado"] = "Si"
            _set_stage(conv, "awaiting_close_or_info")
            return [MSG_TIENE_ABOGADO]

        flags = _priority_flags(d)
        if flags:
            conv["priority"] = "Alta"
            _set_stage(conv, "scheduling_modality")
            return [MSG_PRIORIDAD, MSG_MODALIDAD]

        next_stage = f"q{int(stage[1:]) + 1}"
        if next_stage in _QUESTION_BY_STAGE:
            _set_stage(conv, next_stage)
            return [_QUESTION_BY_STAGE[next_stage][1]]
        _set_stage(conv, "scheduling_modality")
        return [MSG_SCHEDULE_OPENER]

    if stage == "scheduling_modality":
        d["modalidad"] = _classify_modality(text)
        slot1 = _slot(config, "bot_slot_1")
        slot2 = _slot(config, "bot_slot_2")
        _set_stage(conv, "scheduling_slot")
        if slot1 and slot2:
            return [MSG_SLOTS.format(slot1=slot1, slot2=slot2)]
        return [MSG_SLOTS_FALLBACK]

    if stage == "scheduling_slot":
        d["horario"] = str(text or "").strip()
        d["turno_confirmado"] = True
        _set_stage(conv, "scheduled")
        if not conv.get("priority"):
            conv["priority"] = "Media"
        return [
            MSG_CONFIRMACION.format(
                nombre=conv.get("lead_name") or "",
                horario=d["horario"],
                modalidad=d.get("modalidad") or "la modalidad acordada",
                estudio=_study_name(config),
            )
        ]

    return None


def handle_inbound(conv, raw_text, config, lead=None):
    """Procesa un mensaje entrante y muta la conversación.

    Devuelve una lista de mensajes a enviar (puede estar vacía).
    """
    conv["replies_count"] = conv.get("replies_count", 0) + 1
    conv["updated_at"] = _utc_now()

    if conv.get("closed"):
        return []

    if conv.get("lead_name") is None or not conv.get("lead_name"):
        name = _lead_name(lead)
        if name:
            conv["lead_name"] = name

    text = str(raw_text or "").strip()
    if not text:
        return [MSG_NO_TEXTO]

    stage = conv.get("stage")

    # ============ MODO MENÚ NUMÉRICO ============
    menu_config = get_menu_config(config)
    if menu_config["enabled"] and stage not in ("transferred", "scheduled"):
        return _handle_menu_flow(conv, text, config, lead, menu_config)
    # ============================================

    if stage == "transferred":
        return [MSG_YA_DERIVADO]

    if stage == "scheduled":
        if _has(text, *_INTENT_CAMBIAR_TURNO):
            _transfer(conv)
            return [MSG_DERIVAR]
        return [MSG_SCHEDULED_ACK]

    # Baja o desinterés explícitos primero.
    if _intent_not_interested(text):
        if stage == "awaiting_optout_confirm":
            conv.setdefault("data", {})["optout_kind"] = "no_interesado"
        else:
            conv.setdefault("data", {})["optout_kind"] = "no_interesado"
            _set_stage(conv, "awaiting_optout_confirm")
        return [MSG_NO_INTERESADO]

    if _intent_opt_out(text):
        _finalize(conv, "baja")
        return [MSG_BAJA]

    # Etapas de confirmación sí / no.
    if stage in _YES_NO_STAGES:
        reply = _handle_yes_no_stage(conv, text, config)
        if reply is not None:
            return reply

    # Objeciones y consultas frecuentes (no cambian el hilo principal).
    reply = _handle_interrupt_intents(conv, text, config)
    if reply is not None:
        return reply

    # Flujo por etapa.
    reply = _handle_stage(conv, text, config)
    if reply is not None:
        return reply

    # No se comprendió: máximo dos intentos seguidos, luego se deriva.
    conv["unclear_count"] = conv.get("unclear_count", 0) + 1
    if conv["unclear_count"] >= 2:
        _transfer(conv)
        return [MSG_DERIVAR_SIN_INFO]
    return [MSG_NO_ENTIENDO]


# ---------------------------------------------------------------------------
# Procesamiento del menú numérico
# ---------------------------------------------------------------------------

def _handle_menu_flow(conv, text, config, lead, menu_config):
    """Maneja el flujo del menú numérico paso a paso."""
    d = conv.setdefault("data", {})
    questions = menu_config["questions"]
    stage = conv.get("stage")

    # --- Etapa: enviar mensaje inicial con 2 opciones ---
    if stage in ("awaiting_status", "menu_start"):
        _set_stage(conv, "menu_awaiting_choice")
        return [_build_menu_initial_message(config)]

    # --- Etapa: esperar elección (1=resuelto, 2=pendiente) ---
    if stage == "menu_awaiting_choice":
        t = text.strip()
        if t == "1":
            # Caso resuelto -> cerrar
            _finalize(conv, "caso_resuelto")
            return ["Entiendo, gracias por responder. Si tu caso ya está resuelto, no continuaremos contactándote. ¡Éxitos!"]
        elif t == "2":
            # Caso pendiente -> enviar intro y primera pregunta
            d["menu_current_question"] = 0
            _set_stage(conv, "menu_q1")
            intro = _build_menu_intro()
            q1_msg = _build_menu_q1(questions)
            return [intro, q1_msg]
        else:
            return ["Perdón, no entendí.\n\nPor favor respondé con:\n1 - Mi caso ya está resuelto\n2 - Mi caso está pendiente"]

    # --- Etapa: preguntas 1 a 4 ---
    menu_stages = ["menu_q1", "menu_q2", "menu_q3", "menu_q4"]
    if stage in menu_stages:
        current_idx = menu_stages.index(stage)
        current_q = questions[current_idx]

        # Validar y guardar respuesta
        if current_q.get("options"):
            valid_values = [opt["value"] for opt in current_q["options"]]
            if text.strip() not in valid_values:
                options_text = "\n".join([f"   {opt['value']} - {opt['label']}" for opt in current_q["options"]])
                return [f"Perdón, no entendí. Por favor elegí una de estas opciones:\n\n{options_text}"]
            # Guardar valor y label
            d[f"menu_{current_q['id']}"] = text.strip()
            for opt in current_q["options"]:
                if opt["value"] == text.strip():
                    d[f"menu_{current_q['id']}_label"] = opt["label"]
                    break
        else:
            # Texto libre
            d[f"menu_{current_q['id']}"] = text.strip()

        # Avanzar
        next_idx = current_idx + 1

        if next_idx >= len(questions):
            # Todas las preguntas respondidas -> cierre
            _finalize(conv, "menu_completado")
            return [_build_menu_completion(conv, config)]

        # Enviar siguiente pregunta
        next_q = questions[next_idx]
        _set_stage(conv, menu_stages[next_idx])

        if next_q.get("id") == "horario":
            return [_build_menu_q3(questions)]
        elif next_q.get("id") == "lesion":
            return [_build_menu_q4(questions)]
        else:
            lines = [next_q["question"]]
            for opt in next_q["options"]:
                lines.append(f"   {opt['value']} - {opt['label']}")
            return ["\n".join(lines)]

    # Si llegamos aquí, la conversación ya está en otro estado
    return []
