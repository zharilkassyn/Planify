export type ThemeKey = 'blue' | 'purple' | 'green' | 'rose' | 'orange' | 'dark';

export const THEMES: Record<ThemeKey, { name: string; primary: string; vars: Record<string, string> }> = {
  blue: {
    name: 'Синий',
    primary: '#2563EB',
    vars: {
      '--primary': '#2563EB',
      '--primary-dark': '#1D4ED8',
      '--primary-light': '#EFF6FF',
      '--primary-mid': '#DBEAFE',
      '--bg': '#DBEAFE',
      '--navy': '#1E3A8A',
      '--ink': '#1E293B',
      '--soft': '#64748B',
      '--card': '#EFF6FF',
      '--border': '#BFDBFE',
    },
  },
  purple: {
    name: 'Фиолетовый',
    primary: '#7C3AED',
    vars: {
      '--primary': '#7C3AED',
      '--primary-dark': '#6D28D9',
      '--primary-light': '#F5F3FF',
      '--primary-mid': '#EDE9FE',
      '--bg': '#EDE9FE',
      '--navy': '#4C1D95',
      '--ink': '#1E293B',
      '--soft': '#64748B',
      '--card': '#F5F3FF',
      '--border': '#DDD6FE',
    },
  },
  green: {
    name: 'Зелёный',
    primary: '#059669',
    vars: {
      '--primary': '#059669',
      '--primary-dark': '#047857',
      '--primary-light': '#ECFDF5',
      '--primary-mid': '#D1FAE5',
      '--bg': '#D1FAE5',
      '--navy': '#064E3B',
      '--ink': '#1E293B',
      '--soft': '#64748B',
      '--card': '#ECFDF5',
      '--border': '#A7F3D0',
    },
  },
  rose: {
    name: 'Розовый',
    primary: '#DB2777',
    vars: {
      '--primary': '#DB2777',
      '--primary-dark': '#BE185D',
      '--primary-light': '#FDF2F8',
      '--primary-mid': '#FBCFE8',
      '--bg': '#FBCFE8',
      '--navy': '#831843',
      '--ink': '#1E293B',
      '--soft': '#64748B',
      '--card': '#FDF2F8',
      '--border': '#F9A8D4',
    },
  },
  orange: {
    name: 'Оранжевый',
    primary: '#EA580C',
    vars: {
      '--primary': '#EA580C',
      '--primary-dark': '#C2410C',
      '--primary-light': '#FFF7ED',
      '--primary-mid': '#FED7AA',
      '--bg': '#FFEDD5',
      '--navy': '#7C2D12',
      '--ink': '#1E293B',
      '--soft': '#64748B',
      '--card': '#FFF7ED',
      '--border': '#FED7AA',
    },
  },
  dark: {
    name: 'Тёмный',
    primary: '#60A5FA',
    vars: {
      '--primary': '#60A5FA',
      '--primary-dark': '#3B82F6',
      '--primary-light': '#1E293B',
      '--primary-mid': '#334155',
      '--bg': '#0F172A',
      '--navy': '#1E40AF',
      '--ink': '#F1F5F9',
      '--soft': '#94A3B8',
      '--card': '#1E293B',
      '--border': '#334155',
    },
  },
};

export function applyTheme(key: ThemeKey) {
  const theme = THEMES[key];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, val]) => {
    root.style.setProperty(prop, val);
  });
  root.setAttribute('data-theme', key);
}
