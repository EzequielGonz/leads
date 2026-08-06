import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  currentUser: string | null;
  login: (id: string, password: string) => boolean;
  logout: () => void;
}

const VALID_USERS: Record<string, string> = {
  ezegonza: "12345",
  kevinkegler: "12345",
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  currentUser: null,

  login: (id, password) => {
    if (VALID_USERS[id] === password) {
      set({ isAuthenticated: true, currentUser: id });
      return true;
    }
    return false;
  },

  logout: () => {
    set({ isAuthenticated: false, currentUser: null });
  },
}));