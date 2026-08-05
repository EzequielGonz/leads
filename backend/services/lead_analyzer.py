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
    for loc in ARGENTINA_LOCATIONS:
        if loc in text:
            return True, loc
    return False, None


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
        low = (col or "").lower()
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
    return mapping


def suggest_column_mapping(columns):
    return _default_column_mapping(columns)


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
