import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";

export interface LocationData {
  ubicacion: string;
  count: number;
}

export interface TipoData {
  tipo: string;
  count: number;
}

export interface ChartsSectionProps {
  ubicaciones?: LocationData[] | Record<string, number>;
  porTipo?: TipoData[] | Record<string, number>;
  className?: string;
}

const TIPO_COLORS = [
  "#06b6d4",
  "#8b5cf6",
  "#d97706",
  "#64748b",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
];
const BAR_COLORS = [
  "#1e3a8a",
  "#1e40af",
  "#1d4ed8",
  "#2563eb",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#22d3ee",
  "#f59e0b",
  "#d97706",
];

const TIPO_LABELS: Record<string, string> = {
  abogado: "⚖️ Abogado",
  contador: "📊 Contador",
  medico: "🩺 Médico",
  empresa: "🏢 Empresa",
  sin_clasificar: "❔ Sin clasificar",
  otro: "✨ Otro",
  Persona: "👤 Persona",
  Empresa: "🏢 Empresa",
  Influencer: "⭐ Influencer",
  Otro: "✨ Otro",
};

interface DarkTooltipPayload {
  name: string;
  value: number;
  payload: Record<string, unknown>;
  fill?: string;
  color?: string;
}

interface DarkTooltipProps {
  active?: boolean;
  payload?: DarkTooltipPayload[];
  label?: string;
  xKey?: string;
}

function DarkTooltip({ active, payload, label, xKey = "ubicacion" }: DarkTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0];
  return (
    <div className="glass-card px-3.5 py-2.5 text-xs shadow-2xl">
      <div className="font-display font-semibold text-text-primary mb-1">
        {label ?? (data.payload?.[xKey] as string)}
      </div>
      <div className="flex items-center gap-2 text-text-secondary">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: data.fill as string }}
        />
        <span>
          <span className="font-bold text-accent-cyan font-display">
            {data.value.toLocaleString("es-AR")}
          </span>
          {" "}leads
        </span>
      </div>
    </div>
  );
}

function toLocationArr(
  input?: LocationData[] | Record<string, number>
): LocationData[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return Object.entries(input)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => ({ ubicacion: k, count: v }));
}

function toTipoArr(
  input?: TipoData[] | Record<string, number>
): TipoData[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return Object.entries(input)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => ({ tipo: k, count: v }))
    .sort((a, b) => b.count - a.count);
}

export default function ChartsSection({
  ubicaciones,
  porTipo,
  className,
}: ChartsSectionProps) {
  const realUbicaciones = toLocationArr(ubicaciones);
  const realTipo = toTipoArr(porTipo);
  const top10 = [...realUbicaciones].sort((a, b) => b.count - a.count).slice(0, 10);
  const totalTipo = realTipo.reduce((acc, t) => acc + t.count, 0);
  const hasData = top10.length > 0 || totalTipo > 0;

  if (!hasData) {
    return (
      <div className={`${className ?? ""}`}>
        <div className="glass-card gradient-border-top p-10 text-center">
          <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
          <h3 className="font-display font-semibold text-text-primary text-lg mb-1.5">
            Aún no hay estadísticas
          </h3>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Subí un archivo Excel con tus leads para ver distribuciones por
            ubicación y tipo de perfil. Los análisis se actualizan
            automáticamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-5 ${className ?? ""}`}>
      <div className="glass-card gradient-border-top p-5 lg:col-span-2">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4.5 h-4.5 text-accent-cyan" />
              <h3 className="section-title text-base sm:text-lg !mb-0">
                Top 10 Ubicaciones
              </h3>
            </div>
            <p className="section-subtitle text-xs sm:text-sm">
              Distribución de leads por ciudad/provincia
            </p>
          </div>
          <span className="badge badge-default text-[10px] sm:text-xs">
            {top10.reduce((a, b) => a + b.count, 0).toLocaleString("es-AR")} leads
          </span>
        </div>

        <div className="w-full h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={top10}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              barCategoryGap="22%"
            >
              <defs>
                {BAR_COLORS.map((c, i) => (
                  <linearGradient
                    key={i}
                    id={`barFill${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={c} stopOpacity={1} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.35} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 4"
                stroke="rgba(148, 163, 184, 0.1)"
              />
              <XAxis
                dataKey="ubicacion"
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Inter" }}
                axisLine={{ stroke: "rgba(148, 163, 184, 0.2)" }}
                tickLine={false}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "Inter" }}
                axisLine={{ stroke: "rgba(148, 163, 184, 0.2)" }}
                tickLine={false}
                tickFormatter={(v) => v.toLocaleString("es-AR")}
              />
              <Tooltip
                content={<DarkTooltip xKey="ubicacion" />}
                cursor={{ fill: "rgba(6, 182, 212, 0.06)" }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={900}>
                {top10.map((_, i) => (
                  <Cell key={i} fill={`url(#barFill${i % BAR_COLORS.length})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card gradient-border-top p-5">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <PieChartIcon className="w-4.5 h-4.5 text-accent-gold" />
            <h3 className="section-title text-base sm:text-lg !mb-0">
              Por Tipo de Perfil
            </h3>
          </div>
          <p className="section-subtitle text-xs sm:text-sm">
            {totalTipo.toLocaleString("es-AR")} leads categorizados
          </p>
        </div>

        <div className="w-full h-60 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {TIPO_COLORS.map((c, i) => (
                  <linearGradient
                    key={i}
                    id={`pieFill${i}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={c} stopOpacity={1} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={realTipo}
                cx="50%"
                cy="48%"
                innerRadius={55}
                outerRadius={82}
                paddingAngle={3}
                dataKey="count"
                nameKey="tipo"
                animationDuration={900}
                stroke="rgba(15, 23, 42, 0.8)"
                strokeWidth={2}
              >
                {realTipo.map((_, i) => (
                  <Cell key={i} fill={`url(#pieFill${i % TIPO_COLORS.length})`} />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip xKey="tipo" />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => {
                  const entry = realTipo.find((t) => t.tipo === value);
                  const pct = totalTipo
                    ? ((entry?.count ?? 0) / totalTipo) * 100
                    : 0;
                  const label = TIPO_LABELS[value] ?? value;
                  return (
                    <span className="text-xs text-text-secondary font-medium">
                      {label}{" "}
                      <span className="text-text-muted">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
