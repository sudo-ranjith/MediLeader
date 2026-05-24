import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoggedIn: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

// Secure async storage: encrypts via Electron safeStorage before writing to localStorage.
// Falls back to plain localStorage if running outside Electron (e.g., browser dev mode).
const secureStorage = createJSONStorage<AuthState>(() => ({
  getItem: async (name: string) => {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    if (typeof window.api?.authDecrypt === 'function') {
      const decrypted = await window.api.authDecrypt(raw);
      return decrypted ?? null;
    }
    return raw;
  },
  setItem: async (name: string, value: string) => {
    if (typeof window.api?.authEncrypt === 'function') {
      const encrypted = await window.api.authEncrypt(value);
      localStorage.setItem(name, encrypted);
    } else {
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
}));

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isLoggedIn: false,
      login: (token, user) => set({ token, user, isLoggedIn: true }),
      logout: () => set({ token: null, user: null, isLoggedIn: false }),
    }),
    {
      name: 'pharma-vault-auth',
      storage: secureStorage,
    }
  )
);
