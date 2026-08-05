import os
import sys
import json
import uuid
import tempfile
from datetime import datetime, timezone
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv

from services.excel_processor import read_excel, get_sheet_names
from services.lead_analyzer import (
    process_row,
    suggest_column_mapping,
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
    get_campaign,
    get_status as get_whatsapp_status,
    get_webhook_verify_token,
    list_campaigns,
    list_conversations,
    list_messages,
    process_webhook,
    send_test_message,
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


leads_store = []
files_store = []


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

        sheet_names = None
        if ext in (".xlsx", ".xls", ".xlsm"):
            try:
                sheet_names = get_sheet_names(save_path)
            except Exception:
                sheet_names = None

        try:
            rows = read_excel(save_path, sheet_name=sheet_name)
        except Exception as e:
            return _make_json_error(f"Error leyendo archivo: {str(e)}", 400)

        if not rows:
            return _make_json_error("El archivo no contiene filas de datos", 400)

        columns = list(rows[0].keys())
        leads = []
        for raw in rows:
            lead = process_row(raw)
            lead["source_file"] = original_filename
            lead["file_id"] = file_id
            leads.append(lead)

        file_info = {
            "id": file_id,
            "filename": original_filename,
            "saved_path": save_path,
            "sheet_name": sheet_name,
            "sheet_names": sheet_names,
            "total_rows": len(rows),
            "columns_detected": list(columns),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        files_store.insert(0, file_info)
        leads_store.extend(leads)

        preview = leads[:5]

        return jsonify({
            "file_id": file_id,
            "filename": original_filename,
            "total_rows": len(rows),
            "columns_detected": list(columns),
            "leads": leads,
            "preview_rows": preview,
            "sheet_names": sheet_names,
        })
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


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
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/leads", methods=["GET"])
def get_leads():
    try:
        page = max(1, int(request.args.get("page", 1) or 1))
        size = max(1, min(500, int(request.args.get("size", 20) or 20)))
        search = request.args.get("search")
        argentina_only = request.args.get("argentina_only")
        tipo = request.args.get("tipo")
        ubicacion = request.args.get("ubicacion")
        file_id = request.args.get("file_id")

        filtered = _filter_leads(
            leads_store,
            search=search,
            argentina_only=argentina_only,
            tipo=tipo,
            ubicacion=ubicacion,
            file_id=file_id,
        )
        total = len(filtered)
        start = (page - 1) * size
        end = start + size
        page_data = filtered[start:end]

        return jsonify({
            "data": page_data,
            "total": total,
            "page": page,
            "size": size,
        })
    except ValueError as e:
        return _make_json_error(f"Parámetro inválido: {str(e)}", 400)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/leads/<lead_id>", methods=["GET"])
def get_lead(lead_id):
    try:
        for l in leads_store:
            if l.get("id") == lead_id:
                return jsonify(l)
        return _make_json_error(f"Lead no encontrado: {lead_id}", 404)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/dashboard/stats", methods=["GET"])
def dashboard_stats():
    try:
        file_id = request.args.get("file_id")
        base = list(leads_store)
        if file_id:
            base = [l for l in base if l.get("file_id") == file_id]

        total = len(base)
        argentina_count = sum(1 for l in base if l.get("es_argentina"))
        emails_count = sum(1 for l in base if l.get("email"))
        telefonos_count = sum(1 for l in base if l.get("telefono"))
        instagram_count = sum(1 for l in base if l.get("instagram"))

        tipo_counter = Counter()
        for l in base:
            tp = l.get("tipo_perfil") or "sin_clasificar"
            tipo_counter[tp] += 1
        por_tipo = dict(tipo_counter)

        ubic_counter = Counter()
        for l in base:
            ub = (l.get("ubicacion") or "").strip().lower()
            if not ub:
                continue
            canonical = None
            for loc in ARGENTINA_LOCATIONS:
                if loc in ub or ub in loc:
                    canonical = loc
                    break
            key = canonical or ub
            ubic_counter[key] += 1
        top_ubic = sorted(ubic_counter.items(), key=lambda x: (-x[1], x[0]))[:10]
        por_ubicacion = {k: v for k, v in top_ubic}

        return jsonify({
            "total_leads": total,
            "argentina_count": argentina_count,
            "por_tipo": por_tipo,
            "por_ubicacion": por_ubicacion,
            "emails_count": emails_count,
            "telefonos_count": telefonos_count,
            "instagram_count": instagram_count,
        })
    except Exception as e:
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

        filtered = _filter_leads(
            leads_store,
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
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/status", methods=["GET"])
def whatsapp_status():
    try:
        status = get_whatsapp_status()
        status["stats"]["leads_with_phone"] = sum(
            1 for lead in leads_store if lead.get("telefono")
        )
        status["webhook_url"] = f"{request.url_root.rstrip('/')}/api/whatsapp/webhook"
        return jsonify(status)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/config", methods=["PUT"])
def whatsapp_config():
    try:
        payload = request.get_json(silent=True) or {}
        status = update_whatsapp_config(payload)
        status["webhook_url"] = f"{request.url_root.rstrip('/')}/api/whatsapp/webhook"
        return jsonify(status)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/templates", methods=["GET"])
def whatsapp_templates():
    try:
        return jsonify({"data": fetch_templates()})
    except WhatsAppServiceError as e:
        return _make_json_error(str(e), 400)
    except Exception as e:
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
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns", methods=["GET"])
def whatsapp_campaigns():
    try:
        return jsonify({"data": list_campaigns()})
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns/<campaign_id>", methods=["GET"])
def whatsapp_campaign_by_id(campaign_id):
    try:
        campaign = get_campaign(campaign_id)
        if not campaign:
            return _make_json_error("Campana no encontrada", 404)
        return jsonify(campaign)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/campaigns", methods=["POST"])
def whatsapp_create_campaign():
    try:
        payload = request.get_json(silent=True) or {}
        filters = payload.get("filters") or {}
        selected = _filter_leads(
            leads_store,
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
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/conversations", methods=["GET"])
def whatsapp_conversations():
    try:
        limit = max(1, min(200, int(request.args.get("limit", 30) or 30)))
        return jsonify({"data": list_conversations(limit=limit)})
    except ValueError as e:
        return _make_json_error(f"Parametro invalido: {str(e)}", 400)
    except Exception as e:
        return _make_json_error(f"Error en el servidor: {str(e)}", 500)


@app.route("/api/whatsapp/webhook", methods=["GET"])
def whatsapp_webhook_verify():
    mode = request.args.get("hub.mode")
    verify_token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and verify_token == get_webhook_verify_token():
        return challenge or "", 200
    return _make_json_error("Webhook no verificado", 403)


@app.route("/api/whatsapp/webhook", methods=["POST"])
def whatsapp_webhook_receive():
    try:
        payload = request.get_json(silent=True) or {}
        result = process_webhook(payload, leads_store)
        return jsonify({"received": True, **result})
    except Exception as e:
        return _make_json_error(f"Error procesando webhook: {str(e)}", 500)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "leads": len(leads_store),
        "files": len(files_store),
        "time": datetime.now(timezone.utc).isoformat(),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
