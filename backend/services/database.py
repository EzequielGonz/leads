# -*- coding: utf-8 -*-
"""Almacenamiento persistente de leads, archivos, config del bot y whatsapp store.

Usa PostgreSQL (DATABASE_URL) si está disponible, fallback a SQLite.
"""

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "leads.db")

DATABASE_URL = os.environ.get("DATABASE_URL", "")

_local = threading.local()


def _use_pg():
    return bool(DATABASE_URL)


def _get_pg_conn():
    """Obtiene (o crea) una conexión PostgreSQL por hilo."""
    if not hasattr(_local, "pg_conn") or _local.pg_conn is None:
        import psycopg2
        _local.pg_conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        _local.pg_conn.autocommit = False
    return _local.pg_conn


def _get_sqlite_conn():
    """Obtiene (o crea) una conexión SQLite por hilo."""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return _local.conn


def _get_conn():
    if _use_pg():
        return _get_pg_conn()
    return _get_sqlite_conn()


def _execute(conn, sql, params=None):
    """Execute SQL safely for both PG and SQLite."""
    if _use_pg():
        cur = conn.cursor()
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur
    else:
        if params:
            return conn.execute(sql, params)
        return conn.execute(sql)


def _fetchall(conn, sql, params=None):
    cur = _execute(conn, sql, params)
    if _use_pg():
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    else:
        return [dict(row) for row in cur.fetchall()]


def _fetchone(conn, sql, params=None):
    cur = _execute(conn, sql, params)
    if _use_pg():
        cols = [d[0] for d in cur.description] if cur.description else []
        row = cur.fetchone()
        return dict(zip(cols, row)) if row else None
    else:
        row = cur.fetchone()
        return dict(row) if row else None


def _commit(conn):
    if _use_pg():
        conn.commit()
    else:
        conn.commit()


def init_db():
    """Crea las tablas si no existen."""
    conn = _get_conn()
    if _use_pg():
        _execute(conn, """
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
    else:
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
    _commit(conn)


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
def save_leads(leads):
    """Guarda una lista completa de leads (reemplaza todos los existentes)."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM leads")
    for lead in leads:
        _execute(
            conn,
            "INSERT INTO leads (id, data, file_id, created_at) VALUES (%s, %s, %s, %s)" if _use_pg()
            else "INSERT INTO leads (id, data, file_id, created_at) VALUES (?, ?, ?, ?)",
            (
                lead.get("id") or lead.get("telefono", ""),
                json.dumps(lead, ensure_ascii=False),
                lead.get("file_id") or "",
                lead.get("created_at") or _utc_now(),
            ),
        )
    _commit(conn)


def load_leads():
    """Carga todos los leads."""
    conn = _get_conn()
    rows = _fetchall(conn, "SELECT data FROM leads ORDER BY created_at DESC")
    return [json.loads(row["data"]) for row in rows]


def delete_all_leads():
    """Elimina todos los leads."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM leads")
    _commit(conn)


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------
def save_files(files):
    """Guarda la lista completa de archivos metadata."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM files")
    for f in files:
        _execute(
            conn,
            "INSERT INTO files (id, data, created_at) VALUES (%s, %s, %s)" if _use_pg()
            else "INSERT INTO files (id, data, created_at) VALUES (?, ?, ?)",
            (
                f.get("id") or "",
                json.dumps(f, ensure_ascii=False),
                f.get("uploaded_at") or _utc_now(),
            ),
        )
    _commit(conn)


def load_files():
    """Carga todos los archivos metadata."""
    conn = _get_conn()
    rows = _fetchall(conn, "SELECT data FROM files ORDER BY created_at DESC")
    return [json.loads(row["data"]) for row in rows]


def delete_all_files():
    """Elimina todos los archivos metadata."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM files")
    _commit(conn)


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
# Bot Config
# ---------------------------------------------------------------------------
def save_bot_config(config_dict):
    """Guarda la config del bot como key-value pairs."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM bot_config")
    for key, value in config_dict.items():
        val = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
        _execute(
            conn,
            "INSERT INTO bot_config (key, value) VALUES (%s, %s)" if _use_pg()
            else "INSERT INTO bot_config (key, value) VALUES (?, ?)",
            (key, val),
        )
    _commit(conn)


def load_bot_config():
    """Carga la config del bot."""
    conn = _get_conn()
    rows = _fetchall(conn, "SELECT key, value FROM bot_config")
    config = {}
    for row in rows:
        try:
            config[row["key"]] = json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            config[row["key"]] = row["value"]
    return config


# ---------------------------------------------------------------------------
# WhatsApp Store
# ---------------------------------------------------------------------------
def save_whatsapp_store(store_dict):
    """Guarda el whatsapp store completo como un JSON."""
    conn = _get_conn()
    _execute(conn, "DELETE FROM whatsapp_store")
    _execute(
        conn,
        "INSERT INTO whatsapp_store (key, value) VALUES (%s, %s)" if _use_pg()
        else "INSERT INTO whatsapp_store (key, value) VALUES (?, ?)",
        ("store", json.dumps(store_dict, ensure_ascii=False)),
    )
    _commit(conn)


def load_whatsapp_store():
    """Carga el whatsapp store completo."""
    conn = _get_conn()
    row = _fetchone(conn, "SELECT value FROM whatsapp_store WHERE key = 'store'")
    if row:
        try:
            return json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            pass
    return {}


# Inicializar al importar
init_db()
