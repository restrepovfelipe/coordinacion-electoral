// tailwind.config.ts
// Coordinación Electoral — Dirección A · Console

import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        surface: '#fafafa',
        'surface-2': '#f5f5f5',
        hover: '#f1f1f1',

        border: '#ececec',
        'border-strong': '#d8d8d8',

        text: '#0a0a0a',
        'text-2': '#5a5a5a',
        'text-3': '#9c9c9c',
        'text-faint': '#c4c4c4',

        accent: {
          DEFAULT: '#0F4C81',
          hover: '#0d3f6a',
          soft: '#eaf1f8',
          fg: '#ffffff',
        },

        ok: {
          DEFAULT: '#3d8a5e',
          soft: '#e5f1ea',
          text: '#2d6645',
        },
        warn: {
          DEFAULT: '#b4811a',
          soft: '#f5ecd5',
          text: '#7e5b14',
        },
        danger: {
          DEFAULT: '#b04545',
          soft: '#f4e3e3',
          text: '#823535',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      fontSize: {
        kicker: ['11px', { letterSpacing: '0.08em', fontWeight: '500' }],
        h2: ['14px', { letterSpacing: '0.04em', fontWeight: '600' }],
        card: ['15px', { letterSpacing: '-0.005em', fontWeight: '600' }],
        h1: ['28px', { letterSpacing: '-0.015em', fontWeight: '600', lineHeight: '1.1' }],
        kpi: ['22px', { fontWeight: '500', lineHeight: '1.1' }],
        stat: ['14px', { fontWeight: '500', lineHeight: '1.1' }],
        th: ['10.5px', { letterSpacing: '0.08em', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '6px',
        lg: '10px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.04)',
        sm: '0 4px 16px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        md: '0 20px 60px rgba(0,0,0,0.18)',
      },
      spacing: {
        '7': '28px',
        '6': '24px',
        '7.5': '30px',
        '6.5': '26px',
        '12': '48px',
        '5.5': '22px',
        '4.5': '18px',
        '2.5': '10px',
      },
      letterSpacing: {
        tight: '-0.015em',
        tightish: '-0.005em',
        wide: '0.04em',
        wider: '0.08em',
      },
    },
  },
  plugins: [],
}

export default config
