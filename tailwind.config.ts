import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        ink: 'var(--app-text-strong)',
        brand: {
          DEFAULT: 'rgb(33 101 81 / <alpha-value>)',
          50: 'var(--app-brand-50)',
          100: 'var(--app-brand-100)',
          600: 'var(--app-brand-600)',
          700: 'var(--app-brand-700)',
          800: 'var(--app-brand-800)',
          900: 'var(--app-brand-900)',
          950: 'var(--app-brand-950)',
        },
        accent: 'rgb(223 133 44 / <alpha-value>)',
        mist: 'var(--app-bg)',
        surface: {
          DEFAULT: 'var(--app-surface)',
          soft: 'var(--app-surface-soft)',
          muted: 'var(--app-surface-muted)',
        },
        line: {
          DEFAULT: 'var(--app-border)',
          strong: 'var(--app-border-strong)',
        },
        copy: {
          DEFAULT: 'var(--app-text)',
          strong: 'var(--app-text-strong)',
          muted: 'var(--app-text-muted)',
          subtle: 'var(--app-text-subtle)',
        },
      },
      borderRadius: {
        ui: 'var(--radius-md)',
        panel: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-sm)',
        panel: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};

export default config;
