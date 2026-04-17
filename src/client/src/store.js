import { create } from 'zustand';
import axios from 'axios';

axios.defaults.baseURL = '/api';

// Decode JWT payload without a library
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// Restore user from stored token on page load
function restoreUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded) return null;
  // Check expiry
  if (decoded.exp && decoded.exp * 1000 < Date.now()) {
    localStorage.removeItem('token');
    return null;
  }
  return { id: decoded.id, username: decoded.username, is_admin: decoded.is_admin };
}

const restoredToken = localStorage.getItem('token') || null;
const restoredUser = restoreUser();

export const useAuthStore = create((set) => ({
  user: restoredUser,
  token: restoredToken,
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    set({ user: null, token: null });
  }
}));

export const useThemeStore = create((set) => {
  const initialTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', initialTheme);
  
  return {
    theme: initialTheme,
    toggleTheme: () => set((state) => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      return { theme: nextTheme };
    })
  };
});

if (restoredToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${restoredToken}`;
}

