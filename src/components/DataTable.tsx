import React, { useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type OnChangeFn,
} from "@tanstack/react-table";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  Building2,
  User,
  Star,
  Mail,
  Instagram,
  Phone,
  Globe,
  Activity,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead, LeadTipo } from "@/lib/api";

export interface DataTableProps {
  data: Lead[];
  columns?: ColumnDef<Lead>[];
  enableGlobalFilter?: boolean;
  enablePagination?: boolean;
  enableSorting?: boolean;
  onRowClick?: (lead: Lead) => void;
  pageSize?: number;
  showControls?: boolean;
  compact?: boolean;
  totalCount?: number;
  onPaginationChange?: OnChangeFn<PaginationState>;
  pagination?: PaginationState;
  manualPagination?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  rowActions?: (lead: Lead) => void;
}

const TIPO_ICONS: Record<string, React.ElementType> = {
  abogado: Building2,
  contador: Building2,
  medico: User,
  empresa: Building2,
  Persona: User,
  Empresa: Building2,
  Influencer: Star,
  sin_clasificar: User,
  otro: User,
  Otro: User,
};

const TIPO_BADGE: Record<string, string> = {
  abogado: "badge-empresa",
  contador: "badge-influencer",
  medico: "badge-persona",
  empresa: "badge-empresa",
  Persona: "badge-persona",
  Empresa: "badge-empresa",
  Influencer: "badge-influencer",
  sin_clasificar: "badge-default",
  otro: "badge-default",
  Otro: "badge-default",
};

const TIPO_LABEL: Record<string, string> = {
  abogado: "Abogado",
  contador: "Contador",
  medico: "Médico",
  empresa: "Empresa",
  sin_clasificar: "Sin clasificar",
  otro: "Otro",
};

export function TipoBadge({ tipo }: { tipo?: string | LeadTipo }) {
  const raw = (tipo || "sin_clasificar") as string;
  const Icon = TIPO_ICONS[raw] || User;
  const label = TIPO_LABEL[raw] || raw;
  return (
    <span className={cn("badge", TIPO_BADGE[raw] || "badge-default")}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function ArgentinaBadge({
  es_argentina,
  argentina,
  ubicacion,
}: {
  es_argentina?: boolean;
  argentina?: boolean;
  ubicacion?: string;
}) {
  const isAR =
    es_argentina === true ||
    argentina === true ||
    /(argentina|argentine|buenos aires|caba|argentina)/i.test(ubicacion || "");
  if (isAR) {
    return (
      <span className="badge badge-argentina">
        <MapPin className="w-3 h-3" />
        🇦🇷 Argentina
      </span>
    );
  }
  return (
    <span className="badge badge-default">
      <MapPin className="w-3 h-3" />
      Exterior
    </span>
  );
}

const DEFAULT_COLUMNS: ColumnDef<Lead>[] = [
  {
    accessorKey: "full_name",
    header: "Nombre",
    size: 180,
    cell: ({ row }) => {
      const lead = row.original;
      const nombre =
        lead.full_name ||
        [lead.nombre, lead.apellido].filter(Boolean).join(" ") ||
        lead.nombre ||
        "Sin nombre";
      return (
        <div className="min-w-0">
          <div className="font-semibold font-display text-text-primary truncate">
            {nombre}
          </div>
          {lead.email && (
            <div className="flex items-center gap-1 text-xs text-text-muted truncate mt-0.5">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "tipo_perfil",
    header: "Tipo",
    size: 110,
    cell: ({ row }) => (
      <TipoBadge tipo={row.original.tipo_perfil ?? (row.original as any).tipo} />
    ),
  },
  {
    accessorKey: "ubicacion",
    header: "Ubicación",
    size: 180,
    cell: ({ row }) => {
      const u = row.original.ubicacion;
      return (
        <div className="flex items-start gap-1.5 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />
          <span className="truncate text-sm">{u || "—"}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "es_argentina",
    header: "País",
    size: 120,
    cell: ({ row }) => (
      <ArgentinaBadge
        es_argentina={row.original.es_argentina}
        argentina={(row.original as any).argentina}
        ubicacion={row.original.ubicacion as string}
      />
    ),
  },
  {
    accessorKey: "telefono",
    header: "Teléfono",
    size: 150,
    cell: ({ row }) => {
      const t = row.original.telefono;
      return t ? (
        <div className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span className="text-sm text-text-secondary">{t}</span>
        </div>
      ) : (
        <span className="text-text-muted/50 text-xs italic">—</span>
      );
    },
  },
  {
    accessorKey: "lesion",
    header: "Lesión",
    size: 200,
    cell: ({ row }) => {
      const l = row.original.lesion;
      return l ? (
        <div className="flex items-start gap-1.5 min-w-0">
          <Activity className="w-3.5 h-3.5 text-red-400/80 mt-0.5 shrink-0" />
          <span className="truncate text-sm text-text-secondary" title={l}>
            {l}
          </span>
        </div>
      ) : (
        <span className="text-text-muted/50 text-xs italic">—</span>
      );
    },
  },
  {
    accessorKey: "instagram",
    header: "Instagram",
    size: 160,
    cell: ({ row }) => {
      const ig = row.original.instagram;
      const cleanIg = ig && typeof ig === "string" ? ig.replace(/^@/, "") : ig;
      return cleanIg ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Instagram className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          <a
            href={`https://instagram.com/${cleanIg}`}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm text-text-secondary hover:text-pink-300 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            @{cleanIg}
          </a>
        </div>
      ) : (
        <span className="text-text-muted/50 text-xs italic">—</span>
      );
    },
  },
  {
    accessorKey: "website",
    header: "Web",
    size: 180,
    cell: ({ row }) => {
      const w = row.original.website ?? (row.original as any).web;
      return w ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
          <a
            href={(w as string).startsWith("http") ? (w as string) : `https://${w}`}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm text-accent-cyan hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {w}
          </a>
        </div>
      ) : (
        <span className="text-text-muted/50 text-xs italic">—</span>
      );
    },
  },
];

function PaginationControls({
  table,
  manual,
  totalCount,
}: {
  table: ReturnType<typeof useReactTable<Lead>>;
  manual?: boolean;
  totalCount?: number;
}) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const pageCount = manual
    ? Math.ceil((totalCount ?? 0) / pageSize)
    : table.getPageCount();

  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalCount ?? table.getRowCount());
  const total = totalCount ?? table.getRowCount();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-glass-border/60 bg-bg-primary/40 rounded-b-xl">
      <div className="text-xs text-text-muted">
        Mostrando <span className="font-semibold text-text-secondary">{from}</span>–
        <span className="font-semibold text-text-secondary">{total > 0 ? to : 0}</span> de{" "}
        <span className="font-semibold text-text-primary font-display">{total}</span> resultados
      </div>
      <div className="flex items-center gap-1.5">
        <button
          className="pagination-btn"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label="Primera página"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          className="pagination-btn"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 px-2">
          <span className="text-xs text-text-muted">
            Página{" "}
            <span className="font-display font-bold text-text-primary">
              {pageIndex + 1}
            </span>{" "}
            / {Math.max(1, pageCount)}
          </span>
        </div>

        <button
          className="pagination-btn"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="Siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          className="pagination-btn"
          onClick={() => table.setPageIndex(Math.max(0, pageCount - 1))}
          disabled={!table.getCanNextPage()}
          aria-label="Última página"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DataTable({
  data,
  columns: customColumns,
  enableGlobalFilter = true,
  enablePagination = true,
  enableSorting = true,
  onRowClick,
  pageSize: initialPageSize = 25,
  showControls = true,
  compact = false,
  totalCount,
  onPaginationChange,
  pagination: controlledPagination,
  manualPagination = false,
  loading = false,
  emptyMessage = "No hay leads para mostrar.",
  rowActions,
}: DataTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const pagination = controlledPagination ?? internalPagination;
  const setPagination: OnChangeFn<PaginationState> = (updater) => {
    if (onPaginationChange) {
      onPaginationChange(updater);
    } else {
      setInternalPagination((prev) =>
        typeof updater === "function" ? (updater as (p: PaginationState) => PaginationState)(prev) : updater
      );
    }
  };

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize: pagination.pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPageSize]);

  const columns = useMemo(() => {
    const base = customColumns ?? DEFAULT_COLUMNS;
    if (!rowActions) return base;
    const actionsColumn: ColumnDef<Lead> = {
      id: "acciones",
      header: "Enviar",
      size: 84,
      enableSorting: false,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <button
            type="button"
            disabled={!lead.telefono}
            onClick={(e) => {
              e.stopPropagation();
              rowActions(lead);
            }}
            title={
              lead.telefono
                ? `Enviar mensaje a ${lead.telefono}`
                : "Sin teléfono"
            }
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3 h-3" />
            Enviar
          </button>
        );
      },
    };
    const copy = [...base];
    const telIndex = base.findIndex(
      (c) =>
        (c as { accessorKey?: string }).accessorKey === "telefono" ||
        c.id === "telefono"
    );
    copy.splice(telIndex === -1 ? copy.length : telIndex + 1, 0, actionsColumn);
    return copy;
  }, [customColumns, rowActions]);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination,
    },
    initialState: {
      pagination: { pageIndex: 0, pageSize: initialPageSize },
    },
    pageCount: manualPagination
      ? Math.ceil((totalCount ?? 0) / pagination.pageSize)
      : undefined,
    manualPagination,
    manualFiltering: manualPagination,
    manualSorting: manualPagination,
    enableGlobalFilter: !manualPagination && enableGlobalFilter,
    enableSorting,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: !manualPagination ? getFilteredRowModel() : undefined,
    getPaginationRowModel: !manualPagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: !manualPagination ? getSortedRowModel() : undefined,
  });

  return (
    <div className="w-full space-y-3">
      {showControls && enableGlobalFilter && !manualPagination && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Buscar en todos los campos..."
            className="input-field pl-9"
          />
        </div>
      )}

      <div className="table-container">
        <div
          className={cn(
            "overflow-auto",
            compact ? "max-h-[360px]" : "max-h-[620px]"
          )}
          style={{ scrollbarGutter: "stable" }}
        >
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = enableSorting && header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        style={{
                          width: header.getSize(),
                          minWidth: header.getSize(),
                        }}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div
                          className={cn(
                            "flex items-center gap-1.5",
                            canSort && "cursor-pointer select-none"
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort &&
                            (sorted === "asc" ? (
                              <ChevronUp className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                            ) : sorted === "desc" ? (
                              <ChevronDown className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                            ) : (
                              <ChevronsUpDown className="w-3.5 h-3.5 text-text-muted/60 shrink-0 opacity-0 group-hover:opacity-100" />
                            ))}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-48 text-center text-text-muted"
                  >
                    <div className="flex flex-col items-center gap-3 py-10">
                      <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Cargando leads...</span>
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-40 text-center text-text-muted"
                  >
                    <div className="py-10 text-sm">{emptyMessage}</div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(onRowClick && "cursor-pointer")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          minWidth: cell.column.getSize(),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {enablePagination && (
          <PaginationControls
            table={table}
            manual={manualPagination}
            totalCount={totalCount}
          />
        )}
      </div>
    </div>
  );
}
