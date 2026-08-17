# -*- coding: utf-8 -*-
"""Pruebas de simulación del motor del bot de orientación.

Corre sin dependencias externas:  python backend/tests/test_bot_flows.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from services.bot_service import (  # noqa: E402
    MSG_BAJA,
    MSG_EMERGENCIA,
    MSG_EMERGENCIA_OFERTA,
    MSG_NO_ENTIENDO,
    MSG_PENDIENTE,
    MSG_RESUELTO_Q,
    MSG_SCHEDULE_OPENER,
    MSG_SLOTS,
    build_first_message,
    build_summary,
    ensure_conversation,
    get_bot_config,
    handle_inbound,
    run_due_followups,
)

FAILURES = []


def check(label, condition, extra=""):
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {label}" + (f"  -> {extra}" if extra and not condition else ""))
    if not condition:
        FAILURES.append(label)


def make_store():
    return {
        "config": {
            "bot_enabled": True,
            "bot_study_name": "Estudio Test",
            "bot_advisor_name": "Laura",
            "bot_consultation_policy": "gratuita",
            "bot_legal_name": "Estudio Test S.A.",
            "bot_verification_channel": "nuestra web oficial",
            "bot_slot_1": "lunes 10:00",
            "bot_slot_2": "jueves 15:30",
        },
        "bot_conversations": {},
    }


def send(conv, text, config):
    return handle_inbound(conv, text, config, lead={"full_name": "Juan Pérez"})


def main():
    config = get_bot_config(make_store())
    check("bot habilitado por config", config.get("bot_enabled") is True)

    first = build_first_message({"full_name": "Juan Pérez"}, config)
    check("primer mensaje incluye nombre", "Hola, Juan Pérez" in first)
    check("primer mensaje incluye estudio", "Estudio Test" in first)
    check("primer mensaje incluye asesor", "Soy Laura, del equipo" in first)
    check("primer mensaje pregunta estado", "¿Tu caso todavía está pendiente" in first)

    # --- Flujo feliz completo -----------------------------------------------
    store = make_store()
    conv = ensure_conversation(store, "5491100000001", lead_name="Juan Pérez")
    check("conversación creada en awaiting_status", conv["stage"] == "awaiting_status")

    replies = send(conv, "todavía está pendiente", config)
    check("pendiente -> autorización", replies == [MSG_PENDIENTE] and conv["stage"] == "awaiting_authorization")

    replies = send(conv, "sí, dale", config)
    check("autorización -> pregunta emergencia", "atención médica" in replies[0] and conv["stage"] == "q0")

    replies = send(conv, "no, estoy bien", config)
    check("sin emergencia -> q1", replies and "¿En qué fecha" in replies[0] and conv["stage"] == "q1")

    answers = [
        "el 12 de marzo de 2026",          # q1 fecha
        "dentro del trabajo",              # q2 circunstancia
        "estaba en blanco",                # q3 relación laboral
        "me caí de una escalera",          # q4 descripción
        "me lastimé la rodilla",           # q5 lesión
        "sí, me atendió la ART",           # q6 atención
        "sí, lo denunciaron",              # q7 denuncia
        "sigo en tratamiento",             # q8 tratamiento
        "a veces me duele un poco",        # q9 salud
        "sigo trabajando normal",          # q10 laboral
        "sí, tengo constancias",           # q11 documentación
        "en Rosario, Santa Fe",            # q12 ubicación
        "no, no tengo abogado",            # q13 abogado
    ]
    expected_stages = [
        "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9",
        "q10", "q11", "q12", "q13", "scheduling_modality",
    ]
    for answer, expected in zip(answers, expected_stages):
        replies = send(conv, answer, config)
        check(f"respuesta '{answer[:28]}...' -> {expected}", conv["stage"] == expected)

    replies = send(conv, "una videollamada", config)
    check(
        "modalidad guardada y se ofrecen dos horarios",
        conv["data"]["modalidad"] == "videollamada" and replies == [MSG_SLOTS.format(slot1="lunes 10:00", slot2="jueves 15:30")],
        str(replies),
    )
    check("etapa scheduling_slot", conv["stage"] == "scheduling_slot")

    replies = send(conv, "el lunes 10:00", config)
    check("turno confirmado", conv["stage"] == "scheduled" and conv["data"]["turno_confirmado"] is True)
    check("confirmación incluye nombre y modalidad", "Juan Pérez" in replies[0] and "videollamada" in replies[0])
    check("confirmación lista documentos", "DNI" in replies[0] and "claves, códigos" in replies[0])

    summary = build_summary(conv)
    check("resumen con nivel de prioridad", summary["nivel_prioridad"] == "Media")
    check("resumen con ubicación", summary["lugar_y_provincia"] == "en Rosario, Santa Fe")

    # --- Baja explícita -----------------------------------------------------
    store = make_store()
    conv2 = ensure_conversation(store, "5491100000002", lead_name="Ana")
    replies = send(conv2, "no me escriban más", config)
    check("baja explícita", replies == [MSG_BAJA] and conv2["closed"] and conv2["close_reason"] == "baja")
    check("sin respuestas tras la baja", handle_inbound(conv2, "hola?", config) == [])

    # --- No interesado al primer mensaje ------------------------------------
    store = make_store()
    conv3 = ensure_conversation(store, "5491100000003", lead_name="Pedro")
    replies = send(conv3, "no me interesa", config)
    check("no interesado -> oferta de baja", "¿Querés que también registremos" in replies[0])
    replies = send(conv3, "sí", config)
    check("no interesado -> cierre baja", conv3["closed"] and conv3["close_reason"] == "baja")

    # --- Nunca tuvo accidente -----------------------------------------------
    store = make_store()
    conv4 = ensure_conversation(store, "5491100000004", lead_name="Sofía")
    replies = send(conv4, "nunca tuve un accidente", config)
    check("nunca accidente -> oferta de baja", "dato incorrecto" in replies[0])
    replies = send(conv4, "sí", config)
    check("cierre por no reconocer", conv4["close_reason"] == "no_reconoce_consulta")

    # --- Origen del número (no cambia la etapa) ------------------------------
    store = make_store()
    conv5 = ensure_conversation(store, "5491100000005", lead_name="Luis")
    replies = send(conv5, "¿de dónde sacaron mi número?", config)
    check("pregunta origen", "consulta que realizaste anteriormente" in replies[0])
    check("origen no cambia etapa", conv5["stage"] == "awaiting_status")
    replies = send(conv5, "¿qué publicidad fue?", config)
    check("detalle origen", "No tengo visible desde este chat" in replies[0])

    # --- Objeciones frecuentes ----------------------------------------------
    store = make_store()
    conv6 = ensure_conversation(store, "5491100000006", lead_name="Marta")
    replies = send(conv6, "¿sos un robot?", config)
    check("respuesta robot", "asistente virtual" in replies[0] and "Estudio Test" in replies[0])
    replies = send(conv6, "¿esto es una estafa?", config)
    check("respuesta estafa", "Estudio Test S.A." in replies[0] and "verificar nuestros datos" in replies[0])
    replies = send(conv6, "¿la consulta es gratis?", config)
    check("respuesta gratis", "La consulta inicial es gratuita" in replies[0])
    replies = send(conv6, "¿cuánto voy a cobrar?", config)
    check("respuesta monto y oferta", "No es posible calcular un monto" in replies[0] and conv6["stage"] == "awaiting_schedule_offer")

    # --- Prioridad alta por rechazo de ART ----------------------------------
    store = make_store()
    conv7 = ensure_conversation(store, "5491100000007", lead_name="Diego")
    send(conv7, "sigue pendiente", config)
    send(conv7, "sí", config)
    send(conv7, "no", config)  # q0
    replies = send(conv7, "el 2 de enero", config)  # q1
    check("q1 -> q2", conv7["stage"] == "q2")
    send(conv7, "en el trabajo", config)
    send(conv7, "en blanco", config)
    send(conv7, "me corté la mano", config)
    replies = send(conv7, "una herida grave", config)  # q5 -> lesión grave -> prioridad
    check(
        "lesión grave -> prioridad alta",
        conv7["priority"] == "Alta" and conv7["stage"] == "scheduling_modality"
        and "sería importante que tu situación la revise" in replies[0],
        str(conv7["stage"]),
    )
    replies = send(conv7, "no, no me atendieron", config)  # modalidad
    check(
        "prioridad continúa hacia horario",
        conv7["stage"] == "scheduling_slot",
        str(conv7["stage"]),
    )

    # --- Dos mensajes no comprendidos -> derivación --------------------------
    store = make_store()
    conv8 = ensure_conversation(store, "5491100000008", lead_name="Rocío")
    replies = send(conv8, "xqzkz", config)
    check("primera no comprendida", replies == [MSG_NO_ENTIENDO])
    replies = send(conv8, "bzzzt", config)
    check("segunda no comprendida -> derivación", "derivar" in replies[0] and conv8["stage"] == "transferred")

    # --- Emergencia ----------------------------------------------------------
    store = make_store()
    conv9 = ensure_conversation(store, "5491100000009", lead_name="Carlos")
    replies = send(conv9, "estoy en la guardia, es una emergencia", config)
    check("emergencia -> salud primero", MSG_EMERGENCIA in replies and MSG_EMERGENCIA_OFERTA in replies)
    replies = send(conv9, "sí", config)
    check("emergencia acepta contacto -> derivación", conv9["stage"] == "transferred")

    # --- Seguimientos --------------------------------------------------------
    store = make_store()
    conv10 = ensure_conversation(store, "5491100000010", lead_name="Nadia")
    conv10["updated_at"] = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    pending = run_due_followups(store)
    check("primer seguimiento vencido", len(pending) == 1 and "nuevamente" in pending[0][2])
    conv10["updated_at"] = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    pending = run_due_followups(store)
    check("segundo seguimiento (último)", len(pending) == 1 and "último mensaje" in pending[0][2])
    pending = run_due_followups(store)
    check("no más seguimientos", pending == [])

    # --- Resuelto ------------------------------------------------------------
    store = make_store()
    conv11 = ensure_conversation(store, "5491100000011", lead_name="Elena")
    replies = send(conv11, "ya lo resolví con la ART", config)
    check("resuelto -> detalle", replies == [MSG_RESUELTO_Q])
    replies = send(conv11, "me pagaron la indemnización", config)
    check("indemnización -> cierre resuelto", conv11["closed"] and conv11["close_reason"] == "resuelto")

    # --- Abogado actual ------------------------------------------------------
    store = make_store()
    conv12 = ensure_conversation(store, "5491100000012", lead_name="Tomás")
    send(conv12, "sigue pendiente", config)
    send(conv12, "sí", config)
    send(conv12, "no", config)
    send(conv12, "hace dos meses", config)
    send(conv12, "en el trabajo", config)
    send(conv12, "en blanco", config)
    send(conv12, "me golpeé la cabeza", config)
    send(conv12, "una contusión", config)
    send(conv12, "sí, me vio la ART", config)
    send(conv12, "sí, está denunciado", config)
    send(conv12, "sigo en tratamiento", config)
    send(conv12, "no, estoy bien", config)
    send(conv12, "sigo trabajando", config)
    send(conv12, "tengo constancias", config)
    send(conv12, "en Córdoba", config)
    replies = send(conv12, "sí, tengo abogado", config)
    check("con abogado -> oferta de cierre", "interferir con el asesoramiento" in replies[0] and conv12["stage"] == "awaiting_close_or_info")
    replies = send(conv12, "sí", config)
    check("cierre por abogado", conv12["closed"] and conv12["close_reason"] == "ya_tiene_abogado")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} chequeos fallaron: {FAILURES}")
        sys.exit(1)
    print("Todos los chequeos pasaron.")


if __name__ == "__main__":
    main()
