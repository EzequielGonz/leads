# -*- coding: utf-8 -*-
"""
Batch sender service with anti-spam protections.

Features:
- Alternating delays (20, 40, 50 seconds) - never fixed
- Cooldown cycle: send 50 → pause 20min → send 50 again (repeat)
- Optional time limits (9 AM to 9 PM)
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
    save_whatsapp_store,
    load_whatsapp_store,
)
from services.whatsapp_service import (
    send_template_message,
    record_outbound_message,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DELAY_OPTIONS = [20, 40, 50]  # Seconds between messages (alternating)
COOLDOWN_MINUTES = 20  # Minutes between batches
BATCH_LIMIT = 50  # Messages per batch before cooldown
HOUR_START = 9  # 9 AM (only used if time_limit enabled)
HOUR_END = 21  # 9 PM (only used if time_limit enabled)


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
        self.batch_count: int = 0  # Messages sent in current batch
        self.batch_number: int = 0  # Which batch we're on
        self.cooldown_until: Optional[float] = None  # Timestamp when cooldown ends
        self.current_lead: Optional[Dict] = None
        self.sent_phones: Set[str] = set()
        self.start_time: Optional[float] = None
        self.last_send_time: Optional[float] = None
        self.next_send_time: Optional[float] = None
        self.error: Optional[str] = None
        self.completed: bool = False
        self.time_limit_enabled: bool = False
        self.log: List[Dict] = []

    def reset(self):
        with self._lock:
            self._reset()

    def to_dict(self) -> Dict:
        with self._lock:
            now = time.time()
            cooldown_remaining = None
            if self.cooldown_until and self.cooldown_until > now:
                cooldown_remaining = round(self.cooldown_until - now, 0)

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
                "batch_count": self.batch_count,
                "batch_number": self.batch_number,
                "batch_limit": BATCH_LIMIT,
                "cooldown_remaining": cooldown_remaining,
                "cooldown_minutes": COOLDOWN_MINUTES,
                "error": self.error,
                "completed": self.completed,
                "elapsed": round(now - self.start_time, 1) if self.start_time else 0,
                "next_send_in": round(max(0, self.next_send_time - now), 1) if self.next_send_time else None,
                "log": self.log[-30:],
                "sent_phones_count": len(self.sent_phones),
                "time_limit_enabled": self.time_limit_enabled,
                "hour_status": self._get_hour_status(),
            }

    def _get_hour_status(self) -> str:
        if not self.time_limit_enabled:
            return "Sin limite de horario"
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
            if len(self.log) > 100:
                self.log = self.log[-100:]


# Global state
_state = BatchState()
_stop_event = threading.Event()
_pause_event = threading.Event()
_worker_thread: Optional[threading.Thread] = None


def _get_next_delay() -> int:
    """Get next delay from alternating sequence with jitter."""
    delay = DELAY_OPTIONS[_state.delay_index % len(DELAY_OPTIONS)]
    _state.delay_index += 1
    return delay + random.randint(-3, 3)


def _is_within_hours() -> bool:
    """Check if current time is within sending hours."""
    if not _state.time_limit_enabled:
        return True
    now = datetime.now()
    return HOUR_START <= now.hour < HOUR_END


def _normalize_phone(phone: str) -> str:
    """Normalize phone number for deduplication."""
    digits = "".join(c for c in phone if c.isdigit())
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


def _worker(file_id: str, template_name: str, template_language: str,
            template_variables: str, time_limit_enabled: bool):
    """Background worker that sends messages in batches with cooldowns."""
    global _state

    try:
        _state.file_id = file_id
        _state.template_name = template_name
        _state.template_language = template_language
        _state.template_variables = template_variables
        _state.time_limit_enabled = time_limit_enabled
        _state.active = True
        _state.paused = False
        _state.start_time = time.time()
        _state.delay_index = random.randint(0, len(DELAY_OPTIONS) - 1)

        _state.add_log(f"Inicio del batch. Template: {template_name}, Límite horario: {'Sí' if time_limit_enabled else 'No'}")

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

        # Process leads in batches with cooldowns
        lead_index = 0
        while lead_index < len(pending_leads):
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

            # Start new batch
            _state.batch_number += 1
            _state.batch_count = 0
            _state.add_log(f"📦 Iniciando lote #{_state.batch_number} (máximo {BATCH_LIMIT} mensajes)")

            # Send messages in this batch
            while lead_index < len(pending_leads) and _state.batch_count < BATCH_LIMIT:
                # Check stop signal
                if _stop_event.is_set():
                    _state.add_log("Envío detenido por el usuario", "warn")
                    _state.active = False
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

                lead = pending_leads[lead_index]
                lead_index += 1

                # Get phone
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
                    "progress": f"Lote #{_state.batch_number} · {_state.batch_count + 1}/{BATCH_LIMIT}",
                }

                # Send message
                try:
                    nombre = lead.get("full_name") or lead.get("nombre", "Cliente")
                    variables = template_variables.replace("{{full_name}}", nombre)
                    # WhatsApp rejects newlines/tabs in template params.
                    # Each line = separate param. Sanitize each one.
                    import re as _re
                    var_list = []
                    for part in variables.replace("\r", "").split("\n"):
                        part = part.strip()
                        if not part:
                            continue
                        # Remove newlines/tabs, collapse 4+ spaces
                        part = part.replace("\t", " ")
                        part = _re.sub(r"\s+", " ", part).strip()
                        part = _re.sub(r" {4,}", "    ", part)
                        if part:
                            var_list.append(part[:1024])

                    result = send_template_message(
                        to_phone=phone,
                        template_name=template_name,
                        language_code=template_language,
                        body_variables=var_list[:10],
                    )

                    if result:
                        _state.sent_count += 1
                        _state.batch_count += 1
                        _state.sent_phones.add(normalized)
                        _state.last_send_time = time.time()
                        _state.add_log(f"✅ [{_state.batch_count}/{BATCH_LIMIT}] Enviado a {nombre} ({phone})")
                        # Record outbound message in WhatsApp store
                        record_outbound_message(
                            lead=lead, phone_raw=phone, phone_e164=normalized,
                            message_type="template", preview=f"Plantilla {template_name}",
                            status="accepted", template_name=template_name,
                        )
                    else:
                        _state.failed_count += 1
                        _state.add_log(f"❌ Error enviando a {phone}", "error")
                        record_outbound_message(
                            lead=lead, phone_raw=phone, phone_e164=normalized,
                            message_type="template", preview=f"Plantilla {template_name}",
                            status="failed", error_message="No response from API",
                            template_name=template_name,
                        )

                except Exception as e:
                    _state.failed_count += 1
                    error_msg = str(e)
                    if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                        _state.add_log(f"⚠️ Rate limit detectado. Pausando 60s...", "warn")
                        time.sleep(60)
                    else:
                        _state.add_log(f"❌ Error: {error_msg}", "error")
                    record_outbound_message(
                        lead=lead, phone_raw=phone, phone_e164=normalized,
                        message_type="template", preview=f"Plantilla {template_name}",
                        status="failed", error_message=error_msg,
                        template_name=template_name,
                    )

                # Save sent phones periodically
                if _state.sent_count % 5 == 0:
                    _save_sent_phones(_state.sent_phones)

                # Wait with alternating delay
                if _state.batch_count < BATCH_LIMIT and lead_index < len(pending_leads):
                    delay = _get_next_delay()
                    _state.next_send_time = time.time() + delay
                    _state.add_log(f"⏳ Esperando {delay}s...")
                    _stop_event.wait(timeout=delay)
                    _state.next_send_time = None

            # Batch completed — check if there are more leads
            if lead_index < len(pending_leads):
                # Start cooldown
                cooldown_seconds = COOLDOWN_MINUTES * 60
                _state.cooldown_until = time.time() + cooldown_seconds
                _state.add_log(f"⏸ Lote #{_state.batch_number} completado ({_state.batch_count} mensajes). Esperando {COOLDOWN_MINUTES} minutos...")

                # Wait for cooldown
                remaining = cooldown_seconds
                while remaining > 0 and not _stop_event.is_set():
                    chunk = min(remaining, 10)
                    time.sleep(chunk)
                    remaining -= chunk
                    _state.cooldown_until = time.time() + remaining

                _state.cooldown_until = None

                if _stop_event.is_set():
                    _state.add_log("Envío detenido durante cooldown", "warn")
                    _state.active = False
                    return

                _state.add_log(f"▶ Retomando después del cooldown")

        # All done
        _save_sent_phones(_state.sent_phones)
        _state.completed = True
        _state.active = False
        _state.current_lead = None
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
                template_variables: str = "", time_limit_enabled: bool = False) -> Dict:
    """Start a batch send job."""
    global _worker_thread, _state, _stop_event, _pause_event

    if _state.active:
        return {"error": "Ya hay un envío en curso. Detenelo primero."}

    _state.reset()
    _stop_event.clear()
    _pause_event.clear()

    _worker_thread = threading.Thread(
        target=_worker,
        args=(file_id, template_name, template_language, template_variables, time_limit_enabled),
        daemon=True,
    )
    _worker_thread.start()

    return {"ok": True, "message": "Envío iniciado"}


def stop_batch() -> Dict:
    """Stop the current batch send."""
    if not _state.active:
        return {"error": "No hay envío activo"}
    _stop_event.set()
    _pause_event.clear()
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
