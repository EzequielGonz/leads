# -*- coding: utf-8 -*-
"""Almacenamiento persistente de leads y archivos usando SQLite.

Reemplaza el JSON plano para mayor robustez y compatibilidad con
entornos donde el disco es efímero (como Render free tier).
"""

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "leads.db")

_local = threading.local()


def _get_conn():
    """Obtiene (o crea) una conexión SQLite por hilo."""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return _local.conn


def init_db():
    """Crea las tablas si no existen."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            file_id TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS bot_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whatsapp_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_leads_file_id ON leads(file_id);
    """)
    conn.commit()


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

def save_leads(leads):
    """Guarda una lista completa de leads (reemplaza todos los existentes)."""
    conn = _get_conn()
    conn.execute("DELETE FROM leads")
    for lead in leads:
        conn.execute(
            "INSERT INTO leads (id, data, file_id, created_at) VALUES (?, ?, ?, ?)",
            (
                lead.get("id") or lead.get("telefono", ""),
                json.dumps(lead, ensure_ascii=False),
                lead.get("file_id") or "",
                lead.get("created_at") or _utc_now(),
            ),
        )
    conn.commit()


def load_leads():
    """Carga todos los leads."""
    conn = _get_conn()
    rows = conn.execute("SELECT data FROM leads ORDER BY created_at DESC").fetchall()
    return [json.loads(row["data"]) for row in rows]


def delete_all_leads():
    """Elimina todos los leads."""
    conn = _get_conn()
    conn.execute("DELETE FROM leads")
    conn.commit()


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

def save_files(files):
    """Guarda la lista completa de archivos metadata."""
    conn = _get_conn()
    conn.execute("DELETE FROM files")
    for f in files:
        conn.execute(
            "INSERT INTO files (id, data, created_at) VALUES (?, ?, ?)",
            (
                f.get("id") or "",
                json.dumps(f, ensure_ascii=False),
                f.get("uploaded_at") or _utc_now(),
            ),
        )
    conn.commit()


def load_files():
    """Carga todos los archivos metadata."""
    conn = _get_conn()
    rows = conn.execute("SELECT data FROM files ORDER BY created_at DESC").fetchall()
    return [json.loads(row["data"]) for row in rows]


def delete_all_files():
    """Elimina todos los archivos metadata."""
    conn = _get_conn()
    conn.execute("DELETE FROM files")
    conn.commit()


# ---------------------------------------------------------------------------
# Export / Import
# ---------------------------------------------------------------------------

def export_all():
    """Exporta leads y archivos como dict."""
    return {
        "leads": load_leads(),
        "files": load_files(),
        "exported_at": _utc_now(),
    }


def import_all(data):
    """Importa leads y archivos desde un dict."""
    if "leads" in data and isinstance(data["leads"], list):
        save_leads(data["leads"])
    if "files" in data and isinstance(data["files"], list):
        save_files(data["files"])


def delete_all():
    """Elimina todos los datos."""
    delete_all_leads()
    delete_all_files()


# ---------------------------------------------------------------------------
# Bot Config (persist in SQLite)
# ---------------------------------------------------------------------------
def save_bot_config(config_dict):
    """Guarda la config del bot como key-value pairs."""
    conn = _get_conn()
    conn.execute("DELETE FROM bot_config")
    for key, value in config_dict.items():
        conn.execute(
            "INSERT INTO bot_config (key, value) VALUES (?, ?)",
            (key, json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value),
        )
    conn.commit()


def load_bot_config():
    """Carga la config del bot."""
    conn = _get_conn()
    rows = conn.execute("SELECT key, value FROM bot_config").fetchall()
    config = {}
    for row in rows:
        try:
            config[row["key"]] = json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            config[row["key"]] = row["value"]
    return config


# ---------------------------------------------------------------------------
# WhatsApp Store (persist in SQLite)
# ---------------------------------------------------------------------------
def save_whatsapp_store(store_dict):
    """Guarda el whatsapp store completo como un JSON."""
    conn = _get_conn()
    conn.execute("DELETE FROM whatsapp_store")
    conn.execute(
        "INSERT INTO whatsapp_store (key, value) VALUES (?, ?)",
        ("store", json.dumps(store_dict, ensure_ascii=False)),
    )
    conn.commit()


def load_whatsapp_store():
    """Carga el whatsapp store completo."""
    conn = _get_conn()
    row = conn.execute("SELECT value FROM whatsapp_store WHERE key = 'store'").fetchone()
    if row:
        try:
            return json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            pass
    return {}


# Inicializar al importar
init_db()
