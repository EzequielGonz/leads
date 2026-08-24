import math
import os
import re
from datetime import date, datetime

import chardet
import pandas as pd

# Palabras típicas de encabezado, usadas para distinguir un archivo con fila de
# títulos de uno cuyos datos arrancan en la primera fila.
_HEADER_KEYWORDS = [
    "nombre",
    "apellido",
    "name",
    "dni",
    "documento",
    "telefono",
    "teléfono",
    "celular",
    "phone",
    "email",
    "correo",
    "mail",
    "instagram",
    "linkedin",
    "web",
    "sitio",
    "ubicacion",
    "ubicación",
    "ciudad",
    "pais",
    "país",
    "provincia",
    "localidad",
    "direccion",
    "dirección",
    "domicilio",
    "fecha",
    "sexo",
    "genero",
    "género",
    "bio",
    "descripcion",
    "descripción",
    "tipo",
    "categoria",
    "categoría",
    "empresa",
    "abogado",
    "contador",
    "medico",
    "médico",
    "doctor",
    "art",
    "siniestro",
    "expediente",
    "cuit",
    "cuil",
    "edad",
    "profesion",
    "profesión",
    "ocupacion",
    "ocupación",
    "estado",
    "observacion",
    "observación",
    "detalle",
    "referencia",
    "comentario",
]

_DATE_RE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")
_DIGITS_RE = re.compile(r"^\d+$")
_EMPTY_VALUES = (None, "")


def _sanitize_value(val):
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, str):
        stripped = val.strip()
        return stripped if stripped != "" else None
    if isinstance(val, (pd.Timestamp, datetime, date)):
        return str(val)
    if isinstance(val, float):
        return str(int(val)) if val.is_integer() else str(val)
    if isinstance(val, bool):
        return str(val)
    if isinstance(val, int):
        return str(val)
    return str(val)


def _df_to_records(df):
    records = []
    for _, row in df.iterrows():
        record = {}
        for col in df.columns:
            val = _sanitize_value(row[col])
            record[col] = val if val is not None else ""
        records.append(record)
    return records


def _df_to_records_chunked(df, chunk_size=500):
    """Yields chunks of records from a DataFrame to avoid memory spikes."""
    total = len(df)
    for start in range(0, total, chunk_size):
        chunk = []
        end = min(start + chunk_size, total)
        for idx in range(start, end):
            row = df.iloc[idx]
            record = {}
            for col in df.columns:
                val = _sanitize_value(row[col])
                record[col] = val if val is not None else ""
            chunk.append(record)
        yield chunk


def _looks_like_data_cell(value):
    """Un valor que casi con certeza es dato y no un encabezado."""
    if value is None:
        return False
    if isinstance(value, float) and math.isnan(value):
        return False
    if isinstance(value, (int, float, pd.Timestamp, datetime, date)):
        return True
    text = str(value).strip()
    if not text:
        return False
    if _DIGITS_RE.match(text) and len(text) >= 4:
        return True
    if _DATE_RE.match(text):
        return True
    return False


def _looks_like_header_row(first_row):
    """Detecta si la primera fila del archivo son encabezados o ya son datos."""
    values = list(first_row)
    total = max(1, len(values))

    data_cells = sum(1 for v in values if _looks_like_data_cell(v))
    keyword_cells = sum(
        1
        for v in values
        if isinstance(v, str) and any(k in v.lower() for k in _HEADER_KEYWORDS)
    )

    data_fraction = data_cells / total
    keyword_fraction = keyword_cells / total

    # Si no hay celdas numéricas/fechas, es casi seguro una fila de encabezados.
    if data_fraction == 0:
        return True
    # Con números presentes, es headerless salvo que la mayoría parezcan títulos.
    return keyword_fraction >= 0.5


def _read_csv_raw(file_path):
    try:
        return pd.read_csv(file_path, encoding="utf-8-sig", header=None)
    except Exception:
        try:
            with open(file_path, "rb") as f:
                raw = f.read()
            detected = chardet.detect(raw)
            enc = detected.get("encoding") or "latin-1"
            return pd.read_csv(file_path, encoding=enc, header=None)
        except Exception:
            return pd.read_csv(file_path, encoding="latin-1", header=None, errors="replace")


def get_sheet_names(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".xlsx" or ext == ".xlsm":
        xl = pd.ExcelFile(file_path, engine="openpyxl")
        return xl.sheet_names
    if ext == ".xls":
        xl = pd.ExcelFile(file_path, engine="xlrd")
        return xl.sheet_names
    return None


def _prepare_dataframe(file_path, sheet_name=None):
    """Reads an Excel/CSV into a DataFrame with header detection."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        df = _read_csv_raw(file_path)
    elif ext == ".xlsx" or ext == ".xlsm":
        engine = "openpyxl"
        if sheet_name:
            df = pd.read_excel(file_path, sheet_name=sheet_name, engine=engine, header=None)
        else:
            df = pd.read_excel(file_path, engine=engine, header=None)
    elif ext == ".xls":
        engine = "xlrd"
        if sheet_name:
            df = pd.read_excel(file_path, sheet_name=sheet_name, engine=engine, header=None)
        else:
            df = pd.read_excel(file_path, engine=engine, header=None)
    else:
        raise ValueError(f"Formato de archivo no soportado: {ext}")

    if df is None or df.empty:
        return None, None, None

    first_row = df.iloc[0].tolist()
    if _looks_like_header_row(first_row):
        new_columns = []
        for i, cell in enumerate(first_row):
            label = "" if cell is None else str(cell).strip()
            new_columns.append(label if label else f"Columna_{i + 1}")
        df.columns = new_columns
        df = df.iloc[1:]
    else:
        df.columns = [f"Columna_{i + 1}" for i in range(df.shape[1])]

    columns = list(df.columns)
    total_rows = len(df)
    return df, columns, total_rows


def read_excel(file_path, sheet_name=None):
    """Returns all rows as a list of dicts (legacy, uses more memory)."""
    df, columns, total_rows = _prepare_dataframe(file_path, sheet_name)
    if df is None:
        return []
    return _df_to_records(df)


def read_excel_chunked(file_path, sheet_name=None, chunk_size=500):
    """Generator: yields (columns, total_rows, chunk_iterator).
    Each chunk is a list of ~chunk_size dicts. Uses much less memory."""
    df, columns, total_rows = _prepare_dataframe(file_path, sheet_name)
    if df is None:
        return
    for chunk in _df_to_records_chunked(df, chunk_size):
        yield chunk
    # Free the DataFrame
    del df
