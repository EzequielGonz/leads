import React from "react";
import Empty from "@/components/Empty";
import { Instagram } from "lucide-react";

export default function ScraperPage() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-6 opacity-0 animate-stagger-1">
        <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-gradient mb-1.5">
          Scraper Instagram
        </h1>
        <p className="text-text-muted text-sm sm:text-base">
          Extrae perfiles y leads desde Instagram con búsqueda por hashtag,
          ubicación o nicho.
        </p>
      </div>

      <div className="glass-card gradient-border-top opacity-0 animate-stagger-2">
        <Empty
          variant="default"
          title="Módulo en construcción"
          description="El scraper de Instagram estará disponible próximamente. Se conectará con tu script de Python para extraer perfiles de manera segura."
          action={{
            label: "Ver script Python",
            icon: Instagram,
            onClick: () => window.open("/scraper_instagram.py", "_blank"),
          }}
        />
      </div>
    </div>
  );
}
