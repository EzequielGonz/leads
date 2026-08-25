# -*- coding: utf-8 -*-
"""
Batch sender service with anti-spam protections.

Features:
- Time-based scheduling (9 AM to 9 PM)
- Alternating delays (20, 40, 50 seconds) - never fixed
- Chat limit per time slot (40-55 variable)
- Deduplication (track sent numbers)
- Start/stop/pause/resume functionality
- Stats tracking
"""

import json
import os
import random
import threading
import time
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Set

from services.database import (
    load_leads_for_file,
    find_lead_by_phone_fast,
    save_whatsapp_store,
    load_whatsapp_store,
)
from services.whatsapp_service import (
    send_template_message,
    get_bot_status,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DELAY_OPTIONS = [20, 40, 50]  # Seconds between messages (alternating)
HOUR_START = 9  # 9 AM
HOUR_END = 21  # 9 PM
CHAT_LIMIT_MIN = 40
CHAT_LIMIT_MAX = 55
BATCH_SIZE = 50  # Leads per batch from DB


# ---------------------------------------------------------------------------
# State management
# ---------------------------------------------------------------------------
class BatchState:
    """Thread-safe state for batch sending."""

    def __init__(self):
        self._lock = threading.Lock()
        self._reset()

    def _reset(self):
        self.active = False
        self.paused = False
        self.file_id: Optional[str] = None
        self.template_name: Optional[str] = ""
        self.template_language: str = "es_AR"
        self.template_variables: str = ""
        self.total_leads: int = 0
        self.sent_count: int = 0
        self.failed_count: int = 0
        self.current_lead: Optional[Dict] = None
        self.sent_phones: Set[str] = set()
        self.start_time: Optional[float] = None
        self.last_send_time: Optional[float] = None
        self.next_send_time: Optional[float] = None
        self.error: Optional[str] = None
        self.completed: bool = False
        self.chat_limit: int = random.randint(CHAT_LIMIT_MIN, CHAT_LIMIT_MAX)
        self.delay_index: int = 0  # For alternating delays
        self.log: List[Dict] = []  # Last N log entries

    def reset(self):
        with self._lock:
            self._reset()

    def to_dict(self) -> Dict:
        with self._lock:
            now = time.time()
            return {
                "active": self.active,
                "paused": self.paused,
                "file_id": self.file_id,
                "template_name": self.template_name,
                "total_leads": self.total_leads,
                "sent_count": self.sent_count,
                "failed_count": self.failed_count,
                "remaining": max(0, self.total_leads - self.sent_count - self.failed_count),
                "current_lead": self.current_lead,
                "chat_limit": self.chat_limit,
                "error": self.error,
                "completed": self.completed,
                "elapsed": round(now - self.start_time, 1) if self.start_time else 0,
                "next_send_in": round(max(0, self.next_send_time - now), 1) if self.next_send_time else None,
                "log": self.log[-20:],  # Last 20 entries
                "sent_phones_count": len(self.sent_phones),
                "hour_status": self._get_hour_status(),
            }

    def _get_hour_status(self) -> str:
        now = datetime.now()
        hour = now.hour
        if hour < HOUR_START:
            return f"Fuera de horario (arranca a las {HOUR_START}:00)"
        elif hour >= HOUR_END:
            return f"Fuera de horario (terminó a las {HOUR_END}:00)"
        return f"Dentro de horario ({HOUR_START}:00 - {HOUR_END}:00)"

    def add_log(self, message: str, level: str = "info"):
        with self._lock:
            self.log.append({
                "time": datetime.now().isoformat(),
                "message": message,
                "level": level,
            })
            # Keep only last 50 entries
            if len(self.log) > 50:
                self.log = self.log[-50:]


# Global state
_state = BatchState()
_stop_event = threading.Event()
_pause_event = threading.Event()
_worker_thread: Optional[threading.Thread] = None


def _get_next_delay() -> int:
    """Get next delay from alternating sequence."""
    delay = DELAY_OPTIONS[_state.delay_index % len(DELAY_OPTIONS)]
    _state.delay_index += 1
    # Add small jitter (+-3s) to make it less predictable
    return delay + random.randint(-3, 3)


def _is_within_hours() -> bool:
    """Check if current time is within sending hours."""
    now = datetime.now()
    return HOUR_START <= now.hour < HOUR_END


def _normalize_phone(phone: str) -> str:
    """Normalize phone number for deduplication."""
    digits = "".join(c for c in phone if c.isdigit())
    # Use last 10 digits for comparison (country code can vary)
    return digits[-10:] if len(digits) >= 10 else digits


def _load_sent_phones() -> Set[str]:
    """Load previously sent phones from persistent store."""
    try:
        store = load_whatsapp_store()
        return set(store.get("batch_sent_phones", []))
    except Exception:
        return set()


def _save_sent_phones(phones: Set[str]):
    """Save sent phones to persistent store."""
    try:
        store = load_whatsapp_store()
        store["batch_sent_phones"] = list(phones)
        save_whatsapp_store(store)
    except Exception:
        traceback.print_exc()


def _worker(file_id: str, template_name: str, template_language: str, template_variables: str):
    """Background worker that sends messages."""
    global _state

    try:
        _state.file_id = file_id
        _state.template_name = template_name
        _state.template_language = template_language
        _state.template_variables = template_variables
        _state.active = True
        _state.paused = False
        _state.start_time = time.time()
        _state.chat_limit = random.randint(CHAT_LIMIT_MIN, CHAT_LIMIT_MAX)
        _state.delay_index = random.randint(0, len(DELAY_OPTIONS) - 1)  # Start at random point

        _state.add_log(f"Inicio del batch. Límite: {_state.chat_limit} mensajes, Template: {template_name}")

        # Load leads from DB
        leads = load_leads_for_file(file_id)
        _state.total_leads = len(leads)
        _state.add_log(f"Leads cargados: {len(leads)}")

        # Load previously sent phones for deduplication
        previously_sent = _load_sent_phones()
        _state.sent_phones = previously_sent.copy()
        if previously_sent:
            _state.add_log(f"Ya se enviaron mensajes a {len(previously_sent)} números anteriormente")

        # Filter out already-sent numbers
        pending_leads = []
        for lead in leads:
            phone = lead.get("telefono", "")
            if not phone:
                continue
            normalized = _normalize_phone(phone)
            if normalized not in _state.sent_phones:
                pending_leads.append(lead)

        _state.add_log(f"Leads pendientes (sin repetir): {len(pending_leads)}")

        if not pending_leads:
            _state.add_log("No hay leads pendientes para enviar", "warn")
            _state.completed = True
            _state.active = False
            return

        # Process leads
        for i, lead in enumerate(pending_leads):
            # Check stop signal
            if _stop_event.is_set():
                _state.add_log("Envío detenido por el usuario", "warn")
                _state.active = False
                _state.paused = False
                return

            # Check pause signal
            while _pause_event.is_set() and not _stop_event.is_set():
                _state.paused = True
                time.sleep(1)

            _state.paused = False

            # Check time limits
            if not _is_within_hours():
                _state.add_log(f"Fuera de horario ({HOUR_START}:00-{HOUR_END}:00). Esperando...", "warn")
                _state.next_send_time = None
                while not _is_within_hours() and not _stop_event.is_set():
                    time.sleep(30)
                if _stop_event.is_set():
                    _state.add_log("Envío detenido por el usuario", "warn")
                    _state.active = False
                    return
                _state.add_log("Dentro de horario. Continuando envíos...")
                # Reset chat limit for new time slot
                _state.chat_limit = random.randint(CHAT_LIMIT_MIN, CHAT_LIMIT_MAX)
                _state.add_log(f"Nuevo límite de chat: {_state.chat_limit} mensajes")

            # Check chat limit
            if _state.sent_count >= _state.chat_limit:
                _state.add_log(f"Límite alcanzado ({_state.chat_limit} mensajes). Deteniendo...", "warn")
                _state.completed = True
                _state.active = False
                return

            # Get phone and normalize
            phone = lead.get("telefono", "")
            if not phone:
                continue

            normalized = _normalize_phone(phone)
            if normalized in _state.sent_phones:
                continue

            # Set current lead for UI
            _state.current_lead = {
                "nombre": lead.get("full_name") or lead.get("nombre", ""),
                "telefono": phone,
                "barrio": lead.get("barrio", ""),
                "progress": f"{i + 1}/{len(pending_leads)}",
            }

            # Send message
            try:
                # Build template variables
                nombre = lead.get("full_name") or lead.get("nombre", "Cliente")
                variables = template_variables.replace("{{full_name}}", nombre)
                var_list = [v.strip() for v in variables.split("\\n") if v.strip()]

                result = send_template_message(
                    phone_number=phone,
                    template_name=template_name,
                    language_code=template_language,
                    variables=var_list[:10],  # WhatsApp max 10 params
                )

                if result:
                    _state.sent_count += 1
                    _state.sent_phones.add(normalized)
                    _state.last_send_time = time.time()
                    _state.add_log(f"✅ Enviado a {nombre} ({phone})")
                else:
                    _state.failed_count += 1
                    _state.add_log(f"❌ Error enviando a {phone}", "error")

            except Exception as e:
                _state.failed_count += 1
                error_msg = str(e)
                if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                    _state.add_log(f"⚠️ Rate limit detectado. Pausando 60s...", "warn")
                    time.sleep(60)
                else:
                    _state.add_log(f"❌ Error: {error_msg}", "error")

            # Save sent phones periodically
            if _state.sent_count % 5 == 0:
                _save_sent_phones(_state.sent_phones)

            # Wait with alternating delay
            if i < len(pending_leads) - 1:
                delay = _get_next_delay()
                _state.next_send_time = time.time() + delay
                _state.add_log(f"⏳ Esperando {delay}s antes del siguiente mensaje...")
                _stop_event.wait(timeout=delay)
                _state.next_send_time = None

        # Save final state
        _save_sent_phones(_state.sent_phones)
        _state.completed = True
        _state.active = False
        _state.add_log(f"✅ Batch completado. Enviados: {_state.sent_count}, Fallidos: {_state.failed_count}")

    except Exception as e:
        traceback.print_exc()
        _state.error = str(e)
        _state.active = False
        _state.add_log(f"❌ Error fatal: {str(e)}", "error")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def start_batch(file_id: str, template_name: str, template_language: str = "es_AR",
                template_variables: str = "") -> Dict:
    """Start a batch send job."""
    global _worker_thread, _state, _stop_event, _pause_event

    if _state.active:
        return {"error": "Ya hay un envío en curso. Detenelo primero."}

    # Reset state
    _state.reset()
    _stop_event.clear()
    _pause_event.clear()

    # Start worker thread
    _worker_thread = threading.Thread(
        target=_worker,
        args=(file_id, template_name, template_language, template_variables),
        daemon=True,
    )
    _worker_thread.start()

    return {"ok": True, "message": "Envío iniciado"}


def stop_batch() -> Dict:
    """Stop the current batch send."""
    if not _state.active:
        return {"error": "No hay envío activo"}

    _stop_event.set()
    _pause_event.clear()  # Unpause so the thread can exit
    _state.add_log("Deteniendo envío...")

    return {"ok": True, "message": "Envío detenido"}


def pause_batch() -> Dict:
    """Pause the current batch send."""
    if not _state.active:
        return {"error": "No hay envío activo"}

    _pause_event.set()
    _state.add_log("Envío pausado")

    return {"ok": True, "message": "Envío pausado"}


def resume_batch() -> Dict:
    """Resume a paused batch send."""
    if not _state.active:
        return {"error": "No hay envío activo"}

    _pause_event.clear()
    _state.add_log("Envío reanudado")

    return {"ok": True, "message": "Envío reanudado"}


def get_batch_status() -> Dict:
    """Get current batch status."""
    return _state.to_dict()


def clear_sent_history() -> Dict:
    """Clear the sent phones history (allows re-sending to same numbers)."""
    _save_sent_phones(set())
    _state.sent_phones.clear()
    _state.add_log("Historial de envíos limpiado")
    return {"ok": True, "message": "Historial limpiado"}
