import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:       '#0f1117',
        surface:  '#161d27',
        surface2: '#1a2235',
        border:   '#272b35',
        border2:  '#323744',
        text:     '#e2e8f0',
        muted:    '#6e7891',
        muted2:   '#4a5168',
        accent:   '#4ade80',
        gold:     '#fbbf24',
        blue:     '#60a5fa',
        red:      '#f87171',
        purple:   '#a78bfa',
        teal:     '#2dd4bf',
        orange:   '#fb923c',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
