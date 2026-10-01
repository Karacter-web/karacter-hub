import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-soft': 'var(--surface-soft)',
        'surface-inverse': 'var(--surface-inverse)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        brand: 'var(--brand)',
        'brand-deep': 'var(--brand-deep)',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'monospace'],
      },
      borderRadius: {
        panel: '14px',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
      },
      animation: {
        'enter-softly': 'enter-softly 420ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
