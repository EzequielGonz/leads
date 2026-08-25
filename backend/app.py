import os
import sys
import json
import uuid
import tempfile
import traceback
import threading
from datetime import datetime, timezone
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gc
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from services.database import (
    save_leads, load_leads, delete_all_leads,
    save_files, load_files, delete_all_files,
    export_all, import_all, delete_all,
    insert_leads_batch, load_leads_paginated, load_leads_for_file,
    count_leads, delete_leads_for_file, get_dashboard_stats,
    find_lead_by_phone_fast,
)

from services.excel_processor import (
    read_excel, get_sheet_names, _stream_xlsx, _stream_csv, _sanitize_cell,
)
from services.lead_analyzer import (
    process_row,
    suggest_column_mapping,
    guess_column_mapping_by_content,
    ARGENTINA_LOCATIONS,
)
from services.export_service import (
    export_leads_to_xlsx,
    export_leads_to_csv,
    export_leads_to_json,
)
from services.whatsapp_service import (
    WhatsAppServiceError,
    create_campaign,
    fetch_templates,
    get_bot_conversation,
    get_bot_status,
    get_campaign,
    get_status as get_whatsapp_status,
    get_webhook_verify_token,
    list_bot_conversations,
    list_campaigns,
    list_conversations,
    list_messages,
    process_webhook,
    run_bot_followups,
    send_test_message,
    update_bot_config,
    update_config as update_whatsapp_config,
)


load_dotenv()


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
CORS(app, resources={r"/api/*": {"origins": "*"}})


# ---------------------------------------------------------------------------
# Almacenamiento: solo files_store en memoria, leads van directo a DB
# ---------------------------------------------------------------------------

def _load_store_data():
    """Carga datos desde SQLite al arrancar (solo archivos en memoria)."""
    global files_store
    try:
        files_store = load_files()
    except Exception:
        traceback.print_exc()


def _save_store_data():
    """Guarda archivos en SQLite."""
    try:
        save_files(files_store)
    except Exception:
        traceback.print_exc()


_load_store_data()


# ---------------------------------------------------------------------------
# Keep-alive: ping self every 10 min to prevent Render free tier sleep
# ---------------------------------------------------------------------------
import threading, time, urllib.request

def _keep_alive():
    while True:
        time.sleep(600)  # 10 minutes
        try:
            urllib.request.urlopen("https://leads-imos.onrender.com/api/health", timeout=10)
        except Exception:
            pass

_keep_alive_thread = threading.Thread(target=_keep_alive, daemon=True)
_keep_alive_thread.start()


def _make_json_error(message, status=400):
    resp = jsonify({"error": message, "status": status})
    resp.status_code = status
    return resp


def _row_matches_search(lead, search):
    if not search:
        return True
    q = search.lower()
    haystack_parts = []
    for k, v in lead.items():
        if v is None:
            continue
        if isinstance(v, list):
            haystack_parts.extend(str(x).lower() for x in v)
        elif isinstance(v, dict):
            haystack_parts.append(json.dumps(v, ensure_ascii=False).lower())
        else:
            haystack_parts.append(str(v).lower())
    haystack = " ".join(haystack_parts)
    return q in haystack


def _filter_leads(
    leads,
    search=None,
    argentina_only=None,
    tipo=None,
    ubicacion=None,
    file_id=None,
):
    result = []
    for l in leads:
        if argentina_only is not None and str(argentina_only).lower() in ("true", "1", "yes", "si"):
            if not l.get("es_argentina"):
                continue
        if tipo:
            tipos = [t.strip() for t in tipo.split(",") if t.strip()]
            if tipos and l.get("tipo_perfil") not in tipos:
                continue
        if ubicacion:
            ubicaciones = [u.strip().lower() for u in ubicacion.split(",") if u.strip()]
            if ubicaciones:
                lead_ub = (l.get("ubicacion") or "").lower()
                if not any(u in lead_ub for u in ubicaciones):
                    continue
        if file_id:
            if l.get("file_id") != file_id:
                continue
        if not _row_matches_search(l, search):
            continue
        result.append(l)
    return result


# Track background upload processing
_upload_status = {}  # file_id -> {status, total_rows, processed, columns, error}
_upload_status_lock = threading.Lock()


def _process_file_background(file_id, save_path, ext, original_filename, sheet_name):
    """Process uploaded file in background thread."""
    try:
        with _upload_status_lock:
            _upload_status[file_id]["status"] = "processing"

        # Detect sheet names
        sheet_names = None
        if ext in (".xlsx", ".xls", ".xlsm"):
            try:
                sheet_names = get_sheet_names(save_path)
            except Exception:
                sheet_names = None

        # Detect columns from streaming first row
        columns = []
        if ext == ".csv":
            stream_gen = _stream_csv(save_path)
        elif ext in (".xlsx", ".xlsm"):
            stream_gen = _stream_xlsx(save_path, sheet_name=sheet_name)
        else:
            with _upload_status_lock:
                _upload_status[file_id]["status"] = "error"
                _upload_status[file_id]["error"] = "Formato no soportado"
            return

        rows_iter = None
        for cols, rows in stream_gen:
            columns = list(cols)
            rows_iter = rows
            break

        if not columns:
            with _upload_status_lock:
                _upload_status[file_id]["status"] = "error"
                _upload_status[file_id]["error"] = "El archivo no contiene datos"
            return

        # Update status with detected columns
        with _upload_status_lock:
            _upload_status[file_id]["columns"] = columns
            _upload_status[file_id]["sheet_names"] = sheet_names
            _upload_status[file_id]["status"] = "processing"

        # Process rows using the iterator we already have
        sample_rows = []
        SAMPLE_LIMIT = 50
        total_leads = 0
        preview = []
        chunk_leads = []
        CHUNK_SIZE = 100
        mapping_detected = False
        column_mapping = suggest_column_mapping(columns)

        for raw in rows_iter:
            # Skip completely empty rows
            if not raw or all((v is None or (isinstance(v, str) and not v.strip())) for v in raw.values()):
                continue

            total_leads += 1

            if not mapping_detected:
                sample_rows.append(raw)
                if len(sample_rows) >= SAMPLE_LIMIT:
                    if not column_mapping:
                        column_mapping = guess_column_mapping_by_content(sample_rows)
                    mapping_detected = True
                    del sample_rows
                    sample_rows = []
                    gc.collect()

            lead = process_row(raw, column_mapping)
            lead["source_file"] = original_filename
            lead["file_id"] = file_id
            chunk_leads.append(lead)

            if len(chunk_leads) >= CHUNK_SIZE:
                insert_leads_batch(chunk_leads)
                if not preview:
                    preview = chunk_leads[:5]
                del chunk_leads
                chunk_leads = []
                gc.collect()

                # Update progress every chunk
                with _upload_status_lock:
                    _upload_status[file_id]["processed"] = total_leads
                    _upload_status[file_id]["total_rows"] = total_leads

        if not mapping_detected and sample_rows:
            if not column_mapping:
                column_mapping = guess_column_mapping_by_content(sample_rows)
            del sample_rows
            gc.collect()

        if chunk_leads:
            insert_leads_batch(chunk_leads)
            if not preview:
                preview = chunk_leads[:5]
            del chunk_leads
            gc.collect()

        file_info = {
            "id": file_id,
            "filename": original_filename,
            "saved_path": save_path,
            "sheet_name": sheet_name,
            "sheet_names": sheet_names,
            "total_rows": total_leads,
            "columns_detected": list(columns),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        files_store.insert(0, file_info)
        _save_store_data()

        with _upload_status_lock:
            _upload_status[file_id]["status"] = "done"
            _upload_status[file_id]["total_rows"] = total_leads
            _upload_status[file_id]["processed"] = total_leads
            _upload_status[file_id]["columns"] = list(columns)

        print(f"[UPLOAD] Done: {original_filename} -> {total_leads} leads")

    except Exception as e:
        traceback.print_exc()
        with _upload_status_lock:
            _upload_status[file_id]["status"] = "error"
            _upload_status[file_id]["error"] = str(e)


@app.route("/api/upload", methods=["POST"])
def upload_file():
    try:
        if "file" not in request.files:
            return _make_json_error("No se envió ningún archivo", 400)
        file = request.files["file"]
        if file.filename == "":
            return _make_json_error("Nombre de archivo vacío", 400)

        sheet_name = request.form.get("sheet_name") or None
        original_filename = file.filename
        ext = os.path.splitext(original_filename)[1].lower()
        allowed = {".xlsx", ".xls", ".csv", ".xlsm"}
        if ext not in allowed:
            return _make_json_error(
                f"Formato no permitido: {ext}. Use: {', '.join(sorted(allowed))}",
                400,
            )

        file_id = str(uuid.uuid4())
        safe_name = f"{file_id}_{original_filename}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
        file.save(save_path)

        # Initialize status — columns will be detected in background
        with _upload_status_lock:
            _upload_status[file_id] = {
                "status": "pending",
                "total_rows": 0,
                "processed": 0,
                "columns": [],
                "error": None,
                "filename": original_filename,
                "sheet_names": None,
            }

        # Start background processing (detects columns + processes rows)
        t = threading.Thread(
            target=_process_file_background,
            args=(file_id, save_path, ext, original_filename, sheet_name),
            daemon=True,
        )
        t.start()

        # Return IMMEDIATELY — no file reading at all
        return jsonify({
            "file_id": file_id,
            "filename": original_filename,
            "status": "processing",
        })
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/upload/<file_id>/status", methods=["GET"])
def upload_status(file_id):
    """Check background upload progress."""
    with _upload_status_lock:
        status = _upload_status.get(file_id)
    if not status:
        return _make_json_error("Upload no encontrado", 404)
    return jsonify({
        "file_id": file_id,
        "status": status["status"],
        "total_rows": status["total_rows"],
        "processed": status["processed"],
        "columns": status["columns"],
        "error": status["error"],
        "filename": status.get("filename"),
        "sheet_names": status.get("sheet_names"),
    })


@app.route("/api/files", methods=["GET"])
def list_files():
    try:
        safe_files = []
        for f in files_store:
            sf = dict(f)
            sf.pop("saved_path", None)
            safe_files.append(sf)
        return jsonify({"files": safe_files})
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/clear-data", methods=["POST"])
def clear_data():
    """Borra todos los leads importados, el registro de archivos y los
    archivos subidos del disco."""
    try:
        deleted_leads = count_leads()
        deleted_files = len(files_store)
        for f in files_store:
            saved = f.get("saved_path")
            if saved and os.path.exists(saved):
                try:
                    os.remove(saved)
                except Exception:
                    pass
        delete_all_leads()
        files_store.clear()
        _save_store_data()
        return jsonify({
            "ok": True,
            "deleted_leads": deleted_leads,
            "deleted_files": deleted_files,
        })
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/data/export", methods=["GET"])
def export_data():
    """Exporta todos los leads y archivos como JSON descargable."""
    try:
        data = export_all()
        return jsonify(data)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/data/import", methods=["POST"])
def import_data():
    """Importa leads y archivos desde un JSON."""
    try:
        payload = request.get_json(silent=True) or {}
        if not payload.get("leads") and not payload.get("files"):
            return _make_json_error("No se enviaron datos para importar.", 400)
        import_all(payload)
        # Recargar archivos en memoria
        global files_store
        files_store = load_files()
        return jsonify({
            "ok": True,
            "imported_leads": count_leads(),
            "imported_files": len(files_store),
        })
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/leads", methods=["GET"])
def get_leads():
    try:
        page = max(1, int(request.args.get("page", 1) or 1))
        size = max(1, min(500, int(request.args.get("size", 20) or 20)))
        search = request.args.get("search")
        file_id = request.args.get("file_id")

        # Query DB directly with pagination (no memory spike)
        page_data, total = load_leads_paginated(
            page=page,
            size=size,
            file_id=file_id,
            search=search,
        )

        return jsonify({
            "data": page_data,
            "total": total,
            "page": page,
            "size": size,
        })
    except ValueError as e:
        return _make_json_error(f"Parámetro inválido: {str(e)}", 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/leads/<lead_id>", methods=["GET"])
def get_lead(lead_id):
    try:
        # Query DB directly
        from services.database import _get_conn, _fetchone, _use_pg
        conn = _get_conn()
        pg = _use_pg()
        placeholder = "%s" if pg else "?"
        row = _fetchone(conn, f"SELECT data FROM leads WHERE id = {placeholder}", (lead_id,))
        if row:
            return jsonify(json.loads(row["data"]))
        return _make_json_error(f"Lead no encontrado: {lead_id}", 404)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/dashboard/stats", methods=["GET"])
def dashboard_stats():
    try:
        file_id = request.args.get("file_id")
        # Use SQL-based stats (no full lead load = no memory spike)
        stats = get_dashboard_stats(file_id)

        # For tipo and ubicacion, only load a lightweight subset
        base = load_leads_for_file(file_id) if file_id else []
        if not base and not file_id:
            # Only load for top-level stats (not file-specific)
            base = []

        tipo_counter = Counter()
        ubic_counter = Counter()
        for l in base:
            tp = l.get("tipo_perfil") or "sin_clasificar"
            tipo_counter[tp] += 1
            ub = (l.get("ubicacion") or "").strip().lower()
            if ub:
                canonical = None
                for loc in ARGENTINA_LOCATIONS:
                    if loc in ub or ub in loc:
                        canonical = loc
                        break
                ubic_counter[canonical or ub] += 1

        por_tipo = dict(tipo_counter)
        top_ubic = sorted(ubic_counter.items(), key=lambda x: (-x[1], x[0]))[:10]
        por_ubicacion = {k: v for k, v in top_ubic}

        return jsonify({
            **stats,
            "por_tipo": por_tipo,
            "por_ubicacion": por_ubicacion,
        })
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/leads/export", methods=["POST"])
def export_leads():
    try:
        payload = request.get_json(silent=True) or {}
        fmt = (payload.get("format") or "xlsx").lower()
        filters = payload.get("filters") or {}

        if fmt not in ("xlsx", "csv", "json"):
            return _make_json_error(
                f"Formato inválido: {fmt}. Use: xlsx, csv, json",
                400,
            )

        # Load from DB instead of memory
        all_leads = load_leads_for_file(filters.get("file_id")) if filters.get("file_id") else load_leads()
        filtered = _filter_leads(
            all_leads,
            search=filters.get("search"),
            argentina_only=filters.get("argentina_only"),
            tipo=filters.get("tipo"),
            ubicacion=filters.get("ubicacion"),
            file_id=filters.get("file_id"),
        )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        fd, tmp_path = tempfile.mkstemp(
            suffix=f".{fmt}",
            prefix=f"leads_export_{timestamp}_",
        )
        os.close(fd)

        try:
            if fmt == "xlsx":
                export_leads_to_xlsx(filtered, tmp_path)
                mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            elif fmt == "csv":
                export_leads_to_csv(filtered, tmp_path)
                mimetype = "text/csv; charset=utf-8"
            else:
                export_leads_to_json(filtered, tmp_path)
                mimetype = "application/json"

            download_name = f"leads_{timestamp}.{fmt}"
            return send_file(
                tmp_path,
                mimetype=mimetype,
                as_attachment=True,
                download_name=download_name,
            )
        finally:
            try:
                @app.after_this_request
                def _cleanup(response):
                    try:
                        if os.path.exists(tmp_path):
                            os.remove(tmp_path)
                    except Exception:
                        pass
                    return response
            except Exception:
                pass
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/columns/suggest", methods=["GET"])
def columns_suggest():
    try:
        cols_raw = request.args.get("columns") or ""
        if not cols_raw:
            return jsonify({"mapping": {}})
        columns = [c.strip() for c in cols_raw.split(",") if c.strip()]
        mapping = suggest_column_mapping(columns)
        return jsonify({"mapping": mapping})
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/status", methods=["GET"])
def whatsapp_status():
    try:
        status = get_whatsapp_status()
        # Count leads with phone from DB
        status["stats"]["leads_with_phone"] = count_leads()
        status["webhook_url"] = f"{request.url_root.rstrip('/')}/api/whatsapp/webhook"
        return jsonify(status)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/config", methods=["PUT"])
def whatsapp_config():
    try:
        payload = request.get_json(silent=True) or {}
        status = update_whatsapp_config(payload)
        status["webhook_url"] = f"{request.url_root.rstrip('/')}/api/whatsapp/webhook"
        return jsonify(status)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/templates", methods=["GET"])
def whatsapp_templates():
    try:
        return jsonify({"data": fetch_templates()})
    except WhatsAppServiceError as e:
        return _make_json_error(str(e), 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/test-send", methods=["POST"])
def whatsapp_test_send():
    try:
        payload = request.get_json(silent=True) or {}
        result = send_test_message(payload)
        return jsonify(result)
    except WhatsAppServiceError as e:
        return _make_json_error(str(e), 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns", methods=["GET"])
def whatsapp_campaigns():
    try:
        return jsonify({"data": list_campaigns()})
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns/<campaign_id>", methods=["GET"])
def whatsapp_campaign_by_id(campaign_id):
    try:
        campaign = get_campaign(campaign_id)
        if not campaign:
            return _make_json_error("Campana no encontrada", 404)
        return jsonify(campaign)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns", methods=["POST"])
def whatsapp_create_campaign():
    try:
        payload = request.get_json(silent=True) or {}
        filters = payload.get("filters") or {}
        # Load from DB instead of memory
        all_leads = load_leads_for_file(filters.get("file_id")) if filters.get("file_id") else load_leads()
        selected = _filter_leads(
            all_leads,
            search=filters.get("search"),
            argentina_only=filters.get("argentina_only"),
            tipo=filters.get("tipo"),
            ubicacion=filters.get("ubicacion"),
            file_id=filters.get("file_id"),
        )
        campaign = create_campaign(selected, payload)
        return jsonify(campaign), 201
    except WhatsAppServiceError as e:
        return _make_json_error(str(e), 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/messages", methods=["GET"])
def whatsapp_messages():
    try:
        limit = max(1, min(500, int(request.args.get("limit", 50) or 50)))
        phone = request.args.get("phone")
        rows = list_messages(limit=1000)
        if phone:
            q = str(phone).strip()
            rows = [
                item for item in rows
                if q in (item.get("phone_e164") or "") or q in (item.get("phone_raw") or "")
            ]
        rows = rows[:limit]
        return jsonify({"data": rows})
    except ValueError as e:
        return _make_json_error(f"Parametro invalido: {str(e)}", 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/conversations", methods=["GET"])
def whatsapp_conversations():
    try:
        limit = max(1, min(200, int(request.args.get("limit", 30) or 30)))
        return jsonify({"data": list_conversations(limit=limit)})
    except ValueError as e:
        return _make_json_error(f"Parametro invalido: {str(e)}", 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/bot", methods=["GET"])
def whatsapp_bot_status():
    try:
        return jsonify(get_bot_status())
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/bot", methods=["PUT"])
def whatsapp_bot_config():
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(update_bot_config(payload))
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/bot/conversations", methods=["GET"])
def whatsapp_bot_conversations():
    try:
        include_closed = str(request.args.get("include_closed", "1")).lower() not in ("0", "false", "no")
        return jsonify({"data": list_bot_conversations(include_closed=include_closed)})
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/bot/conversations/<phone>", methods=["GET"])
def whatsapp_bot_conversation_detail(phone):
    try:
        conversation = get_bot_conversation(phone)
        if not conversation:
            return _make_json_error("Conversación del bot no encontrada", 404)
        return jsonify(conversation)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/bot/followups/run", methods=["POST"])
def whatsapp_bot_run_followups():
    try:
        return jsonify(run_bot_followups())
    except WhatsAppServiceError as e:
        return _make_json_error(str(e), 400)
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/webhook", methods=["GET"])
def whatsapp_webhook_verify():
    mode = request.args.get("hub.mode")
    verify_token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and verify_token == get_webhook_verify_token():
        return challenge or "", 200
    return _make_json_error("Webhook no verificado", 403)


# ---------------------------------------------------------------------------
# Batch sending with delays
# ---------------------------------------------------------------------------
import threading
import time
import random

_batch_state = {
    "running": False,
    "total": 0,
    "sent": 0,
    "failed": 0,
    "current_phone": "",
    "current_name": "",
    "file_name": "",
    "cancelled": False,
}
_batch_lock = threading.Lock()


def _send_batch_worker(leads, template_name, template_language, template_variables_fn, file_name):
    """Worker thread that sends messages with random delays."""
    global _batch_state
    with _batch_lock:
        _batch_state = {
            "running": True,
            "total": len(leads),
            "sent": 0,
            "failed": 0,
            "current_phone": "",
            "current_name": "",
            "file_name": file_name,
            "cancelled": False,
        }

    for lead in leads:
        # Check if cancelled
        with _batch_lock:
            if _batch_state["cancelled"]:
                _batch_state["running"] = False
                return

        phone = lead.get("telefono") or lead.get("phone") or ""
        name = lead.get("full_name") or lead.get("nombre") or ""

        if not phone or len(phone) < 8:
            with _batch_lock:
                _batch_state["failed"] += 1
            continue

        with _batch_lock:
            _batch_state["current_phone"] = phone
            _batch_state["current_name"] = name

        try:
            # Build variables for this lead
            variables = template_variables_fn(lead)

            # Send template + bot menu
            from services.whatsapp_service import send_test_message
            result = send_test_message({
                "to": phone,
                "message_type": "template",
                "template_name": template_name,
                "template_language": template_language,
                "template_variables": variables,
                "lead_name": name,
                "lead_id": lead.get("id", ""),
            })
            with _batch_lock:
                _batch_state["sent"] += 1
        except Exception as e:
            print(f"[BATCH] Error sending to {phone}: {e}")
            with _batch_lock:
                _batch_state["failed"] += 1

        # Random delay between 20-40 seconds
        delay = random.uniform(20, 40)
        time.sleep(delay)

    with _batch_lock:
        _batch_state["running"] = False


@app.route("/api/whatsapp/batch-send", methods=["POST"])
def whatsapp_batch_send():
    try:
        with _batch_lock:
            if _batch_state["running"]:
                return _make_json_error("Ya hay un envio en curso. Espera a que termine.", 409)

        payload = request.get_json(silent=True) or {}
        file_id = payload.get("file_id") or ""
        template_name = (payload.get("template_name") or "").strip()
        template_language = (payload.get("template_language") or "es_AR").strip()
        template_variables_key = payload.get("template_variables_key") or "full_name"

        if not file_id:
            return _make_json_error("Se requiere file_id", 400)
        if not template_name:
            return _make_json_error("Se requiere template_name", 400)

        # Get leads for this file
        all_leads = load_leads()
        file_leads = [l for l in all_leads if l.get("file_id") == file_id and (l.get("telefono") or l.get("phone"))]

        if not file_leads:
            return _make_json_error("No se encontraron leads con telefono para este archivo", 404)

        # Get file name
        files = load_files()
        file_name = ""
        for f in files:
            if f.get("id") == file_id:
                file_name = f.get("name") or f.get("filename") or ""
                break

        # Build variables function
        def variables_fn(lead):
            name = lead.get("full_name") or lead.get("nombre") or ""
            return [
                name,
                "[Nombre del asesor]",
                "[Nombre del estudio]",
            ]

        # Start batch in background thread
        thread = threading.Thread(
            target=_send_batch_worker,
            args=(file_leads, template_name, template_language, variables_fn, file_name),
            daemon=True,
        )
        thread.start()

        return jsonify({
            "ok": True,
            "message": f"Envio iniciado a {len(file_leads)} numeros",
            "total": len(file_leads),
        })
    except Exception as e:
        traceback.print_exc()
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/batch-status", methods=["GET"])
def whatsapp_batch_status():
    with _batch_lock:
        return jsonify(dict(_batch_state))


@app.route("/api/whatsapp/batch-cancel", methods=["POST"])
def whatsapp_batch_cancel():
    with _batch_lock:
        if _batch_state["running"]:
            _batch_state["cancelled"] = True
            return jsonify({"ok": True, "message": "Envio cancelado"})
        return jsonify({"ok": False, "message": "No hay envio en curso"})


@app.route("/api/whatsapp/webhook", methods=["POST"])
def whatsapp_webhook_receive():
    try:
        payload = request.get_json(silent=True) or {}
        # Use DB search instead of loading all leads into memory
        result = process_webhook(payload, [], find_lead_fn=find_lead_by_phone_fast)
        return jsonify({"received": True, **result})
    except Exception as e:
        return _make_json_error(f"Error procesando webhook: {str(e)}", 500)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "leads": count_leads(),
        "files": len(files_store),
        "time": datetime.now(timezone.utc).isoformat(),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
