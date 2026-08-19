import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lead, LeadsQueryParams, FileInfo, DashboardStats } from "@/lib/api";

interface LeadsState {
  leads: Lead[];
  selectedLead: Lead | null;
  currentFileId: string | null;
  total: number;
  filters: LeadsQueryParams;
  recentFiles: FileInfo[];
  lastImportTimestamp: number;
  setLeads: (leads: Lead[], total?: number) => void;
  addLeads: (leads: Lead[]) => void;
  selectLead: (lead: Lead | null) => void;
  setCurrentFileId: (id: string | null) => void;
  setFilters: (filters: Partial<LeadsQueryParams>) => void;
  resetFilters: () => void;
  setRecentFiles: (files: FileInfo[]) => void;
  prependRecentFile: (file: FileInfo) => void;
  bumpDataVersion: () => void;
  clearAll: () => void;
  dashboardCache?: DashboardStats;
  setDashboardCache: (stats?: DashboardStats) => void;
}

const defaultFilters: LeadsQueryParams = {
  search: "",
  argentina_only: undefined,
  tipo: undefined,
  ubicacion: undefined,
  page: 1,
  size: 25,
  file_id: undefined,
};

export const useLeadsStore = create<LeadsState>()(
  persist(
    (set) => ({
      leads: [],
      selectedLead: null,
      currentFileId: null,
      total: 0,
      filters: { ...defaultFilters },
      recentFiles: [],
      lastImportTimestamp: 0,

  setLeads: (leads, total) =>
    set((state) => ({
      leads,
      total: total ?? state.total,
    })),

  addLeads: (newLeads) =>
    set((state) => ({
      leads: [...newLeads, ...state.leads],
      total: state.total + newLeads.length,
      lastImportTimestamp: Date.now(),
    })),

  selectLead: (lead) => set({ selectedLead: lead }),

  setCurrentFileId: (id) => set({ currentFileId: id }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...newFilters,
        page: newFilters.page ?? state.filters.page,
      },
    })),

  resetFilters: () => set({ filters: { ...defaultFilters } }),

  setRecentFiles: (files) => set({ recentFiles: files }),

  prependRecentFile: (file) =>
    set((state) => ({
      recentFiles: [file, ...state.recentFiles.filter((f) => f.id !== file.id)],
    })),

  bumpDataVersion: () => set({ lastImportTimestamp: Date.now(), dashboardCache: undefined }),

  clearAll: () =>
    set({
      leads: [],
      selectedLead: null,
      currentFileId: null,
      total: 0,
      recentFiles: [],
      dashboardCache: undefined,
      lastImportTimestamp: Date.now(),
      filters: { ...defaultFilters },
    }),

  setDashboardCache: (stats) => set({ dashboardCache: stats }),
    }),
    {
      name: "leads-storage",
      partialize: (state) => ({
        leads: state.leads,
        total: state.total,
        recentFiles: state.recentFiles,
        lastImportTimestamp: state.lastImportTimestamp,
        filters: state.filters,
      }),
    }
  )
);

export default useLeadsStore;
