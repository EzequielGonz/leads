import os
import pandas as pd
import chardet


def _sanitize_value(val):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    if isinstance(val, str):
        stripped = val.strip()
        return stripped if stripped != "" else None
    return val


def _df_to_records(df):
    records = []
    for _, row in df.iterrows():
        record = {}
        for col in df.columns:
            val = _sanitize_value(row[col])
            record[col] = val if val is not None else ""
        records.append(record)
    return records


def get_sheet_names(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".xlsx" or ext == ".xlsm":
        xl = pd.ExcelFile(file_path, engine="openpyxl")
        return xl.sheet_names
    if ext == ".xls":
        xl = pd.ExcelFile(file_path, engine="xlrd")
        return xl.sheet_names
    return None


def read_excel(file_path, sheet_name=None):
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        df = None
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig", dtype=str)
        except Exception:
            try:
                with open(file_path, "rb") as f:
                    raw = f.read()
                detected = chardet.detect(raw)
                enc = detected.get("encoding") or "latin-1"
                df = pd.read_csv(file_path, encoding=enc, dtype=str)
            except Exception:
                df = pd.read_csv(file_path, encoding="latin-1", dtype=str, errors="replace")
        return _df_to_records(df)

    if ext == ".xlsx" or ext == ".xlsm":
        engine = "openpyxl"
    elif ext == ".xls":
        engine = "xlrd"
    else:
        raise ValueError(f"Formato de archivo no soportado: {ext}")

    if sheet_name:
        df = pd.read_excel(file_path, sheet_name=sheet_name, engine=engine, dtype=str)
    else:
        df = pd.read_excel(file_path, engine=engine, dtype=str)

    return _df_to_records(df)
