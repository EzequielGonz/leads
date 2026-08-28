# -*- coding: utf-8 -*-
"""Tests del bot simplificado."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from services.bot_service import (
    ensure_conversation,
    get_bot_config,
    get_menu_config,
    handle_inbound,
    list_bot_conversations,
    bot_stats,
)

FAILURES = []


def check(label, condition, extra=""):
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {label}" + (f"  -> {extra}" if extra and not condition else ""))
    if not condition:
        FAILURES.append(label)


def make_store():
    return {"config": {}, "bot_conversations": {}}


def test_pendiente_flow():
    """Test: pendiente -> Q1 -> Q2 -> Q3 -> Q4 -> cierre"""
    print("\n=== Test: Flujo completo pendiente ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5492235223906", "2235223906")
    check("Stage inicial es menu_awaiting_choice", conv["stage"] == "menu_awaiting_choice")

    # Pendiente -> intro + Q1
    replies = handle_inbound(conv, "mi caso esta pendiente", cfg)
    check("Pendiente devuelve 2 mensajes", len(replies) == 2)
    check("Stage es menu_q1", conv["stage"] == "menu_q1")

    # Q1
    replies = handle_inbound(conv, "2", cfg)
    check("Q1 responde 1 mensaje", len(replies) == 1)
    check("Avanza a menu_q2", conv["stage"] == "menu_q2")
    check("Guarda antiguedad", conv["data"].get("menu_antiguedad") == "2")
    check("Guarda label antiguedad", conv["data"].get("menu_antiguedad_label") == "Entre 6 meses y 1 año")

    # Q2
    replies = handle_inbound(conv, "1", cfg)
    check("Q2 avanza a menu_q3", conv["stage"] == "menu_q3")

    # Q3
    replies = handle_inbound(conv, "10/6/2026 16:30", cfg)
    check("Q3 avanza a menu_q4", conv["stage"] == "menu_q4")
    check("Guarda horario", conv["data"].get("menu_horario") == "10/6/2026 16:30")

    # Q4
    replies = handle_inbound(conv, "Dolor de espalda, sigo en tratamiento", cfg)
    check("Q4 cierra conversacion", conv["closed"] == True)
    check("Close reason es menu_completado", conv["close_reason"] == "menu_completado")
    check("Detecta tratamiento", conv["data"].get("menu_tratamiento") == "Si, en tratamiento")
    check("Q4 devuelve mensaje de cierre", len(replies) == 1 and "profesional" in replies[0].lower())


def test_resuelto_flow():
    """Test: resuelto -> cierra sin respuesta"""
    print("\n=== Test: Resuelto cierra sin respuesta ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5491122334455", "1122334455")
    replies = handle_inbound(conv, "Mi caso ya esta resuelto", cfg)
    check("Resuelto devuelve 0 mensajes", len(replies) == 0)
    check("Conversacion cerrada", conv["closed"] == True)
    check("Close reason es resuelto", conv["close_reason"] == "resuelto")


def test_closed_ignores():
    """Test: msg a conv cerrada -> ignora"""
    print("\n=== Test: Conversacion cerrada ignora mensajes ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5492235223906", "2235223906")
    handle_inbound(conv, "mi caso esta pendiente", cfg)
    # Cerrar manualmente
    conv["closed"] = True
    conv["close_reason"] = "menu_completado"

    replies = handle_inbound(conv, "hola", cfg)
    check("Msg a conv cerrada devuelve 0", len(replies) == 0)


def test_unknown_text_shows_options():
    """Test: texto no reconocido muestra las 2 opciones"""
    print("\n=== Test: Texto no reconocido muestra opciones ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5499999999999", "999999999")
    replies = handle_inbound(conv, "hola", cfg)
    check("Devuelve 1 mensaje", len(replies) == 1)
    check("Contiene opcion 1", "1 -" in replies[0])
    check("Contiene opcion 2", "2 -" in replies[0])


def test_invalid_q1_answer():
    """Test: respuesta invalida a Q1 pide que elija otra vez"""
    print("\n=== Test: Respuesta invalida en Q1 ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5492235223906", "2235223906")
    handle_inbound(conv, "mi caso esta pendiente", cfg)

    replies = handle_inbound(conv, "xyz", cfg)
    check("Respuesta invalida pide opciones", len(replies) == 1 and "Perdón" in replies[0])
    check("Sigue en menu_q1", conv["stage"] == "menu_q1")


def test_free_text_q4_detection():
    """Test: detecta tratamiento en Q4"""
    print("\n=== Test: Deteccion de tratamiento en Q4 ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv = ensure_conversation(store, "5492235223906", "2235223906")
    handle_inbound(conv, "mi caso esta pendiente", cfg)
    handle_inbound(conv, "1", cfg)
    handle_inbound(conv, "1", cfg)
    handle_inbound(conv, "10/6/2026 16:30", cfg)

    # Caso: "si sigo en tratamiento"
    handle_inbound(conv, "Dolor lumbar, si sigo en tratamiento", cfg)
    check("Detecta 'si'", conv["data"].get("menu_tratamiento") == "Si, en tratamiento")


def test_stats():
    """Test: estadisticas del bot"""
    print("\n=== Test: Estadisticas ===")
    store = make_store()
    cfg = get_bot_config(store)

    conv1 = ensure_conversation(store, "5491111111111", "111111111")
    handle_inbound(conv1, "mi caso esta pendiente", cfg)
    handle_inbound(conv1, "1", cfg)
    handle_inbound(conv1, "1", cfg)
    handle_inbound(conv1, "10/6/2026 16:30", cfg)
    handle_inbound(conv1, "Dolor de cabeza", cfg)

    conv2 = ensure_conversation(store, "5492222222222", "222222222")
    handle_inbound(conv2, "mi caso esta pendiente", cfg)

    stats = bot_stats(store)
    check("Total conversaciones es 2", stats["total"] == 2)
    check("1 cerrada", stats["closed"] == 1)
    check("1 activa", stats["active"] == 1)


if __name__ == "__main__":
    test_pendiente_flow()
    test_resuelto_flow()
    test_closed_ignores()
    test_unknown_text_shows_options()
    test_invalid_q1_answer()
    test_free_text_q4_detection()
    test_stats()

    print(f"\n{'='*50}")
    if FAILURES:
        print(f"FALLARON {len(FAILURES)} TESTS:")
        for f in FAILURES:
            print(f"  - {f}")
    else:
        print("TODOS LOS TESTS PASARON ✅")
