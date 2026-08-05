import os
import json
import csv
from dotenv import load_dotenv
from instagrapi import Client

# Cargar variables de entorno
load_dotenv()

# Advertencia importante
print("""
⚠️  ADVERTENCIA IMPORTANTE:
- El scraping de Instagram puede violar los Términos de Servicio de Instagram.
- Tu cuenta puede ser bloqueada o suspendida.
- Usa este programa solo con fines educativos y bajo tu propia responsabilidad.
- Es recomendable usar una cuenta secundaria, no tu cuenta personal.
""")

# Palabras clave predefinidas para perfiles argentinos
PREDEFINED_KEYWORDS = {
    "1": {
        "nombre": "Abogados y Estudios Jurídicos",
        "keywords": [
            "abogado argentina",
            "estudio jurídico argentina",
            "abogado buenos aires",
            "abogado caba",
            "estudio juridico argentina",
            "abogado penal argentina",
            "abogado civil argentina"
        ]
    },
    "2": {
        "nombre": "Contadores y Estudios Contables",
        "keywords": [
            "contador argentina",
            "estudio contable argentina",
            "contador buenos aires",
            "contador caba"
        ]
    },
    "3": {
        "nombre": "Empresas y Emprendedores",
        "keywords": [
            "empresa argentina",
            "emprendedor argentina",
            "startup argentina",
            "pyme argentina"
        ]
    },
    "4": {
        "nombre": "Médicos y Profesionales de la Salud",
        "keywords": [
            "medico argentina",
            "doctor argentina",
            "clínica argentina",
            "consultorio médico argentina"
        ]
    },
    "5": {
        "nombre": "Personalizado (ingresar tus propias palabras clave)",
        "keywords": []
    }
}

# Palabras clave para filtrar por ubicación argentina
ARGENTINA_LOCATIONS = [
    "argentina", "buenos aires", "caba", "córdoba", "rosario", "mendoza", 
    "san juan", "tucumán", "salta", "neuquén", "entreríos", "santa fe"
]

class InstagramScraper:
    def __init__(self):
        self.client = Client()
        
    def login(self, username, password):
        try:
            print(f"Iniciando sesión como {username}...")
            self.client.login(username, password)
            print("Inicio de sesión exitoso!")
            return True
        except Exception as e:
            print(f"Error al iniciar sesión: {e}")
            return False
            
    def search_profiles_by_keywords(self, keywords, count_per_keyword=20):
        all_profiles = []
        seen_usernames = set()
        
        for keyword in keywords:
            try:
                print(f"\nBuscando perfiles con la palabra clave: '{keyword}'...")
                search_results = self.client.search_users_v1(keyword, count_per_keyword)
                
                for user in search_results.users:
                    if user.username in seen_usernames:
                        continue
                    
                    seen_usernames.add(user.username)
                    profile = {
                        "username": user.username,
                        "full_name": user.full_name,
                        "user_id": user.pk,
                        "is_private": user.is_private,
                        "is_verified": user.is_verified,
                        "follower_count": getattr(user, "follower_count", None),
                        "following_count": getattr(user, "following_count", None),
                        "profile_pic_url": user.profile_pic_url,
                        "biography": getattr(user, "biography", None)
                    }
                    all_profiles.append(profile)
                
            except Exception as e:
                print(f"Error al buscar perfiles con '{keyword}': {e}")
                
        return all_profiles
    
    def filter_profiles(self, profiles, filter_argentina=True, include_private=False):
        filtered = []
        
        for profile in profiles:
            if not include_private and profile["is_private"]:
                continue
                
            if filter_argentina:
                text_to_check = (
                    profile["username"].lower() + 
                    " " + profile["full_name"].lower() + 
                    " " + (profile["biography"].lower() if profile["biography"] else "")
                )
                
                is_argentina = any(loc in text_to_check for loc in ARGENTINA_LOCATIONS)
                if not is_argentina:
                    continue
                    
            filtered.append(profile)
            
        return filtered
            
    def save_profiles_to_json(self, profiles, filename):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(profiles, f, ensure_ascii=False, indent=2)
        print(f"\n✓ Perfiles guardados en {filename}")
        
    def save_profiles_to_csv(self, profiles, filename):
        if not profiles:
            return
            
        keys = profiles[0].keys()
        with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
            dict_writer = csv.DictWriter(f, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(profiles)
        print(f"\n✓ Perfiles guardados en {filename}")
        
    def logout(self):
        try:
            self.client.logout()
            print("\nSesión cerrada correctamente.")
        except:
            pass

def main():
    print("=== SCRAPER DE PERFILES DE INSTAGRAM (ARGENTINA) ===\n")
    
    # Obtener credenciales del usuario
    username = os.getenv("INSTAGRAM_USERNAME")
    password = os.getenv("INSTAGRAM_PASSWORD")
    
    if not username or not password:
        username = input("Ingresa tu nombre de usuario de Instagram: ")
        password = input("Ingresa tu contraseña de Instagram: ")
    
    # Seleccionar categoría
    print("\nSelecciona el tipo de perfiles que deseas buscar:")
    for key, value in PREDEFINED_KEYWORDS.items():
        print(f"{key}. {value['nombre']}")
    
    choice = input("\nIngresa el número de la opción: ").strip()
    while choice not in PREDEFINED_KEYWORDS:
        choice = input("Opción inválida. Intenta nuevamente: ").strip()
    
    selected_option = PREDEFINED_KEYWORDS[choice]
    keywords = selected_option["keywords"]
    
    # Si es personalizado, pedir palabras clave
    if not keywords:
        print("\nIngresa tus palabras clave separadas por comas (ej: abogado, estudio jurídico):")
        user_keywords = input().strip()
        keywords = [k.strip() for k in user_keywords.split(",") if k.strip()]
    
    # Configuración adicional
    count_per_keyword = input("\n¿Cuántos perfiles por palabra clave? (default: 20): ")
    try:
        count_per_keyword = int(count_per_keyword)
    except:
        count_per_keyword = 20
        
    filter_argentina = input("\n¿Filtrar solo perfiles de Argentina? (s/n, default: s): ").strip().lower() != "n"
    include_private = input("¿Incluir perfiles privados? (s/n, default: n): ").strip().lower() == "s"
    
    # Nombre del archivo
    filename_base = input("\nNombre base para los archivos de salida (default: perfiles_argentina): ").strip()
    if not filename_base:
        filename_base = "perfiles_argentina"
    
    # Inicializar scraper
    scraper = InstagramScraper()
    
    # Iniciar sesión
    if not scraper.login(username, password):
        return
        
    # Buscar perfiles
    print("\n=== Iniciando búsqueda ===")
    profiles = scraper.search_profiles_by_keywords(keywords, count_per_keyword)
    print(f"\nTotal de perfiles encontrados (sin filtrar): {len(profiles)}")
    
    # Filtrar perfiles
    filtered_profiles = scraper.filter_profiles(profiles, filter_argentina, include_private)
    print(f"Total de perfiles después de filtrar: {len(filtered_profiles)}")
    
    if filtered_profiles:
        print(f"\n✓ Se encontraron {len(filtered_profiles)} perfiles relevantes:")
        for i, profile in enumerate(filtered_profiles, 1):
            print(f"\n{i}. @{profile['username']}")
            print(f"   Nombre: {profile['full_name']}")
            print(f"   Privado: {'Sí' if profile['is_private'] else 'No'}")
            print(f"   Verificado: {'Sí' if profile['is_verified'] else 'No'}")
            if profile["biography"]:
                print(f"   Bio: {profile['biography'][:100]}...")
            
        # Guardar resultados
        scraper.save_profiles_to_json(filtered_profiles, f"{filename_base}.json")
        scraper.save_profiles_to_csv(filtered_profiles, f"{filename_base}.csv")
    else:
        print("\nNo se encontraron perfiles que cumplan los criterios.")
        
    # Cerrar sesión
    scraper.logout()

if __name__ == "__main__":
    main()
