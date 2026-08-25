import re
import uuid
from datetime import datetime, timezone


ARGENTINA_LOCATIONS = [
    "argentina",
    "buenos aires",
    "caba",
    "córdoba",
    "cordoba",
    "rosario",
    "mendoza",
    "san juan",
    "tucumán",
    "tucuman",
    "salta",
    "neuquén",
    "neuquen",
    "entreríos",
    "entre rios",
    "santa fe",
    "la plata",
    "mar del plata",
]

PROFILE_KEYWORDS = {
    "abogado": [
        "abogado",
        "abogada",
        "estudio jurídico",
        "estudio juridico",
        "derecho",
        "asesor jurídico",
        "asesor juridico",
        "abogacía",
        "abogacia",
    ],
    "contador": [
        "contador",
        "contadora",
        "estudio contable",
        "impuestos",
        "auditor",
        "contabilidad",
    ],
    "medico": [
        "médico",
        "medico",
        "doctor",
        "doctora",
        "clínica",
        "clinica",
        "consultorio",
        "salud",
        "odontólogo",
        "odontologo",
    ],
    "empresa": [
        "empresa",
        "pyme",
        "startup",
        "emprendedor",
        "negocio",
        "comercio",
        "srl",
        "sa",
    ],
}

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_REGEX = re.compile(
    r"(?:(?:\+?54[\s\-]?)?(?:9[\s\-]?)?11[\s\-]?(?:\d{4}[\s\-]?\d{4})|"
    r"(?:\+?54[\s\-]?)?(?:0?\d{2,4})[\s\-]?\d{3,4}[\s\-]?\d{4}|"
    r"(?:\+?54[\s\-]?)?15[\s\-]?\d{4}[\s\-]?\d{4}|"
    r"\d{10})"
)
INSTAGRAM_REGEX = re.compile(
    r"(?:@|instagram\.com/|ig:\s*|inst:\s*|instagram:\s*)[a-zA-Z0-9_.]+",
    re.IGNORECASE,
)
LINKEDIN_REGEX = re.compile(
    r"(?:linkedin\.com/(?:in|company|pub)/|linkedin:\s*)[^\s<>\"]+",
    re.IGNORECASE,
)
WEBSITE_REGEX = re.compile(
    r"https?://[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+",
    re.IGNORECASE,
)
USERNAME_CLEAN_REGEX = re.compile(r"[^a-zA-Z0-9_.]")


def _extract_all_text(values):
    parts = []
    for v in values:
        if v is None:
            continue
        if isinstance(v, list):
            parts.extend(str(x) for x in v if x is not None)
        else:
            parts.append(str(v))
    return " ".join(parts).lower()


def extract_email(text):
    if not text:
        return None
    matches = EMAIL_REGEX.findall(str(text))
    return matches[0] if matches else None


def extract_phone(text):
    if not text:
        return None
    raw_matches = PHONE_REGEX.findall(str(text))
    cleaned = []
    for m in raw_matches:
        digits = re.sub(r"\D", "", m)
        if 7 <= len(digits) <= 15:
            cleaned.append(m.strip())
    return cleaned[0] if cleaned else None


def extract_instagram(text):
    if not text:
        return None
    matches = INSTAGRAM_REGEX.findall(str(text))
    if not matches:
        return None
    raw = matches[0]
    if "instagram.com/" in raw.lower():
        idx = raw.lower().find("instagram.com/") + len("instagram.com/")
        user = raw[idx:]
    elif raw.lower().startswith(("ig:", "inst:", "instagram:")):
        user = raw.split(":", 1)[1]
    else:
        user = raw.lstrip("@")
    user = USERNAME_CLEAN_REGEX.sub("", user)
    return user.rstrip(".").rstrip(",") if user else None


def extract_linkedin(text):
    if not text:
        return None
    matches = LINKEDIN_REGEX.findall(str(text))
    if not matches:
        return None
    raw = matches[0].strip()
    if raw.lower().startswith("linkedin:"):
        raw = raw.split(":", 1)[1].strip()
    if not raw.lower().startswith("http"):
        raw = "https://www.linkedin.com/" + raw.lstrip("/")
    return raw.rstrip("/").rstrip(".")


def extract_website(text):
    if not text:
        return None
    matches = WEBSITE_REGEX.findall(str(text))
    return matches[0].rstrip(".").rstrip(",") if matches else None


def detect_argentina(row_text):
    if not row_text:
        return False, None
    text = str(row_text).lower()
    matched = [loc for loc in ARGENTINA_LOCATIONS if loc in text]
    if not matched:
        return False, None
    # Preferir coincidencias más específicas que el país (ej. "san juan" antes que "argentina")
    non_generic = [loc for loc in matched if loc != "argentina"]
    return True, (non_generic[0] if non_generic else matched[0])


def detect_profile_type(row_text):
    if not row_text:
        return None, []
    text = str(row_text).lower()
    categories = []
    matched_type = None
    for cat, keywords in PROFILE_KEYWORDS.items():
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", text):
                categories.append(cat)
                break
    if categories:
        matched_type = categories[0]
    return matched_type, categories


def _default_column_mapping(columns):
    mapping = {}
    for col in columns:
        low = str(col or "").lower()
        if low in mapping.values():
            continue
        if any(k in low for k in ["correo", "email", "e-mail", "mail"]):
            mapping[col] = "email"
        elif any(k in low for k in ["telefono", "teléfono", "tel ", "tel:", "celular", "phone", "whatsapp", "numero", "número"]):
            mapping[col] = "telefono"
        elif any(k in low for k in ["instagram", "ig", "inst "]):
            mapping[col] = "instagram"
        elif "linkedin" in low:
            mapping[col] = "linkedin"
        elif any(k in low for k in ["web", "site", "pagina", "página"]):
            mapping[col] = "website"
        elif any(k in low for k in ["nombre completo", "fullname", "full name", "name complete"]):
            mapping[col] = "full_name"
        elif any(k in low for k in ["apellido", "lastname", "last name", "surname"]):
            mapping[col] = "apellido"
        elif any(k in low for k in ["nombre", "firstname", "first name", "name"]) and "completo" not in low:
            mapping[col] = "nombre"
        elif any(k in low for k in ["ubicacion", "ubicación", "ciudad", "pais", "país", "location", "lugar", "provincia"]):
            mapping[col] = "ubicacion"
        elif any(k in low for k in ["bio", "biography", "descripcion", "descripción", "acerca", "about"]):
            mapping[col] = "biography"
        elif any(k in low for k in ["lesion", "lesión", "diagnostico", "diagnóstico", "patologia", "patología", "afeccion", "afección", "enfermedad", "dolencia", "traumatismo", "herida", "secuela", "motivo"]):
            mapping[col] = "lesion"
    return mapping


def suggest_column_mapping(columns):
    return _default_column_mapping(columns)


_NAME_MULTI_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÑÜáéíóúñü' ]{2,60}$")
_NAME_SINGLE_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,30}$")
_DATE_CELL_RE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")
_PHONE_PREFIXES = ("0", "9", "+", "54", "15", "11")


def _col_values(records, key):
    vals = []
    for r in records:
        v = r.get(key)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            vals.append(s)
    return vals


def _col_is_date(vals):
    if not vals:
        return False
    return sum(1 for v in vals if _DATE_CELL_RE.match(v)) >= len(vals) * 0.7


def _col_is_dni(vals):
    if not vals:
        return False
    ok = sum(1 for v in vals if re.fullmatch(r"\d{7,8}", v))
    return ok >= len(vals) * 0.7


def _col_is_phone(vals):
    if not vals:
        return False
    ok = 0
    for v in vals:
        digits = re.sub(r"\D", "", v)
        if not (8 <= len(digits) <= 15):
            continue
        # Teléfonos argentinos: prefijos 0/9/+/54/15/11, separadores, o
        # fijos de 10 dígitos (área + número) aunque el Excel pierda el 0 inicial.
        if v.startswith(_PHONE_PREFIXES) or len(digits) == 10 or v != digits:
            ok += 1
    return ok >= len(vals) * 0.7


def _col_is_multiword_name(vals):
    if not vals:
        return False
    ok = sum(1 for v in vals if _NAME_MULTI_RE.match(v) and len(v.split()) >= 2)
    return ok >= len(vals) * 0.6


def _col_is_singleword_name(vals):
    if not vals:
        return False
    ok = sum(1 for v in vals if _NAME_SINGLE_RE.match(v) and len(v.split()) == 1)
    return ok >= len(vals) * 0.6


def _col_is_location(vals):
    if not vals:
        return False
    # No mapear columnas que solo contienen "ARGENTINA" (nacionalidad)
    specific = [v for v in vals if str(v).strip().lower() != "argentina"]
    if len(specific) < len(vals) * 0.6:
        return False
    ok = sum(1 for v in specific if str(v).strip().lower() in ARGENTINA_LOCATIONS)
    return ok >= len(vals) * 0.6


def guess_column_mapping_by_content(records):
    """Mapea columnas sin encabezado a partir del contenido de los datos.

    Sirve para archivos cuya primera fila ya es un registro (sin fila de
    títulos): detecta teléfono, nombre, apellido y ubicación según los
    valores de cada columna.
    """
    if not records:
        return {}
    keys = list(records[0].keys())
    stats = {k: _col_values(records, k) for k in keys}

    mapping = {}
    for k in keys:
        vals = stats[k]
        if _col_is_date(vals):
            continue
        if _col_is_dni(vals):
            continue
        if _col_is_phone(vals):
            mapping[k] = "telefono"

    name_cols = []
    for k in keys:
        if k in mapping:
            continue
        if _col_is_multiword_name(stats[k]):
            name_cols.append(k)

    if name_cols:
        nombre_key = name_cols[0]
        mapping[nombre_key] = "nombre"
        idx = keys.index(nombre_key)
        for offset in (-1, 1):
            j = idx + offset
            if 0 <= j < len(keys):
                candidate = keys[j]
                if candidate not in mapping and _col_is_singleword_name(stats[candidate]):
                    mapping[candidate] = "apellido"
                    break

    # Primera columna descriptiva sin asignar -> lesión (diagnóstico/descripción)
    for k in keys:
        if k in mapping:
            continue
        if _col_is_multiword_name(stats[k]):
            mapping[k] = "lesion"
            break

    for k in keys:
        if k not in mapping and _col_is_location(stats[k]):
            mapping[k] = "ubicacion"

    return mapping


def process_row(raw_row, column_mapping=None):
    columns = list(raw_row.keys()) if raw_row else []
    if column_mapping is None:
        column_mapping = _default_column_mapping(columns)

    lead = {
        "id": str(uuid.uuid4()),
        "source_file": "",
        "raw_data": dict(raw_row),
        "nombre": "",
        "apellido": "",
        "full_name": "",
        "email": "",
        "telefono": "",
        "instagram": "",
        "linkedin": "",
        "website": "",
        "ubicacion": "",
        "barrio": "",
        "lesion": "",
        "es_argentina": False,
        "tipo_perfil": None,
        "categorias_detectadas": [],
        "biography": "",
        "follower_count": None,
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }

    for col, field in column_mapping.items():
        if col in raw_row and raw_row[col] not in (None, ""):
            if field in lead and field not in ("id", "raw_data", "source_file", "es_argentina", "tipo_perfil", "categorias_detectadas", "imported_at", "follower_count"):
                if not lead[field]:
                    lead[field] = str(raw_row[col]).strip()

    all_values = [v for v in raw_row.values() if v not in (None, "")]
    combined_text = " ".join(str(v) for v in all_values)

    if not lead["email"]:
        lead["email"] = extract_email(combined_text) or ""
    if not lead["telefono"]:
        lead["telefono"] = extract_phone(combined_text) or ""
    if not lead["instagram"]:
        lead["instagram"] = extract_instagram(combined_text) or ""
    if not lead["linkedin"]:
        lead["linkedin"] = extract_linkedin(combined_text) or ""
    if not lead["website"]:
        lead["website"] = extract_website(combined_text) or ""

    es_ar, matched_loc = detect_argentina(combined_text)
    if es_ar:
        lead["es_argentina"] = True
        if not lead["ubicacion"]:
            lead["ubicacion"] = matched_loc

    if not lead["ubicacion"]:
        for v in all_values:
            _, mloc = detect_argentina(v)
            if mloc:
                lead["ubicacion"] = mloc
                break

    # Extract barrio from LOCALIDAD field in raw_data
    for key in raw_row:
        if key and "localidad" in str(key).lower():
            val = str(raw_row[key]).strip()
            if val and val.lower() not in ("", "nan", "none"):
                lead["barrio"] = val
                break

    tipo, categorias = detect_profile_type(combined_text)
    lead["tipo_perfil"] = tipo
    lead["categorias_detectadas"] = categorias

    if lead["nombre"] and lead["apellido"] and not lead["full_name"]:
        lead["full_name"] = f"{lead['nombre']} {lead['apellido']}".strip()
    elif not lead["full_name"]:
        for v in all_values:
            sv = str(v).strip()
            if 3 <= len(sv) <= 120 and "@" not in sv and "http" not in sv.lower() and not any(c.isdigit() for c in sv[:4]):
                if not lead["full_name"]:
                    lead["full_name"] = sv
                    break

    return lead
