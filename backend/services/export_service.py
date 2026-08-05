import json
import pandas as pd


def _flatten_lead(lead):
    flat = {}
    for key, val in lead.items():
        if key == "raw_data":
            continue
        if isinstance(val, list):
            flat[key] = ", ".join(str(x) for x in val)
        elif isinstance(val, dict):
            flat[key] = json.dumps(val, ensure_ascii=False)
        elif isinstance(val, bool):
            flat[key] = "Sí" if val else "No"
        else:
            flat[key] = val if val is not None else ""
    if "raw_data" in lead and isinstance(lead["raw_data"], dict):
        for rk, rv in lead["raw_data"].items():
            col_name = f"raw_{rk}" if rk in flat else rk
            if col_name not in flat:
                flat[col_name] = rv if rv is not None else ""
    return flat


def export_leads_to_xlsx(leads, output_path):
    rows = [_flatten_lead(l) for l in leads]
    if not rows:
        rows = [{"id": "", "mensaje": "Sin datos para exportar"}]
    df = pd.DataFrame(rows)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Leads", index=False)
    return output_path


def export_leads_to_csv(leads, output_path):
    rows = [_flatten_lead(l) for l in leads]
    if not rows:
        rows = [{"id": "", "mensaje": "Sin datos para exportar"}]
    df = pd.DataFrame(rows)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    return output_path


def export_leads_to_json(leads, output_path):
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(leads, f, ensure_ascii=False, indent=2, default=str)
    return output_path
