import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      const success = login(id, password);
      setLoading(false);
      if (success) {
        navigate("/", { replace: true });
      } else {
        setError("ID o contraseña incorrectos");
      }
    }, 400);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-cyan/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card gradient-border-top p-8 sm:p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-accent-cyan to-accent-gold flex items-center justify-center mb-4 shadow-glow">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-text-primary tracking-tight">
              Panel de Leads
            </h1>
            <p className="text-text-muted text-sm mt-2">
              Inicia sesión para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-id"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                ID de usuario
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  id="login-id"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="Ingrese su ID"
                  autoComplete="username"
                  className="input-field pl-11"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  autoComplete="current-password"
                  className="input-field pl-11"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "btn-primary w-full py-3 text-base",
                loading && "opacity-60 cursor-not-allowed"
              )}
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-glass-border/60">
            <p className="text-xs text-text-muted text-center">
              Credenciales de demo:{" "}
              <span className="text-text-secondary font-medium">
                ezegonza / kevingkegler
              </span>{" "}
              — contraseña{" "}
              <span className="text-text-secondary font-medium">12345</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}