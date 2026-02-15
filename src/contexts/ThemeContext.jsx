import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

const THEMES = {
  light: {
    name: 'light',
    colors: {
      background: '#ffffff',
      surface: '#f8fafc',
      primary: '#3b82f6',
      secondary: '#64748b',
      text: '#1e293b',
      textMuted: '#64748b',
      border: '#e2e8f0',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
  },
  dark: {
    name: 'dark',
    colors: {
      background: '#0f172a',
      surface: '#1e293b',
      primary: '#60a5fa',
      secondary: '#94a3b8',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      border: '#334155',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
  },
};

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved && THEMES[saved]) return saved;

    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  const theme = THEMES[themeName];

  useEffect(() => {
    localStorage.setItem('theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);

    // Apply CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [themeName, theme]);

  const toggleTheme = useCallback(() => {
    setThemeName(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const setTheme = useCallback((name) => {
    if (THEMES[name]) {
      setThemeName(name);
    }
  }, []);

  const value = {
    theme,
    themeName,
    isDark: themeName === 'dark',
    toggleTheme,
    setTheme,
    themes: Object.keys(THEMES),
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
