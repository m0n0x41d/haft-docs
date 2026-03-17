/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#111111',
          tertiary: '#1a1a1a',
        },
        text: {
          primary: '#e8e8e8',
          secondary: '#888888',
          muted: '#555555',
        },
        accent: {
          green: '#46AB47',
          blue: '#6b8afd',
          purple: '#8b5cf6',
          // Fire palette for logo + carousel
          amber: '#ffcc00',
          orange: '#ff8700',
          red: '#ff4444',
        },
        border: {
          subtle: '#1e1e1e',
          hover: '#333333',
        },
      },
      fontFamily: {
        sans: ['Saira', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
      },
      animation: {
        'gradient-shift': 'gradient-shift 4s linear infinite',
      },
      keyframes: {
        'gradient-shift': {
          '0%': { backgroundPosition: '0% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
    },
  },
  plugins: [],
};
