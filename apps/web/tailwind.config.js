/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        glass: {
          white: 'rgba(255,255,255,0.055)',
          border: 'rgba(255,255,255,0.09)',
          hover: 'rgba(255,255,255,0.09)',
          active: 'rgba(255,255,255,0.13)',
        },
        brand: {
          300: '#a89df8',
          400: '#8c7cf4',
          500: '#7c6cf2',
          600: '#6757df',
        },
        cyan: '#52d6e8',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      backdropBlur: {
        glass: '16px',
        'glass-heavy': '28px',
      },
      backgroundImage: {
        'canvas-gradient':
          'radial-gradient(ellipse at 18% 0%, rgba(124,108,242,.15) 0%, transparent 38%), radial-gradient(ellipse at 90% 82%, rgba(82,214,232,.08) 0%, transparent 34%), linear-gradient(145deg, #080a10 0%, #0b0e17 48%, #080a10 100%)',
      },
      boxShadow: {
        glass: '0 18px 50px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.045)',
        'glass-glow': '0 12px 40px rgba(124,108,242,.22), inset 0 1px 0 rgba(255,255,255,.08)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 16px rgba(99,102,241,0.5)' },
          '50%': { boxShadow: '0 0 28px rgba(99,102,241,0.8)' },
        },
      },
    },
  },
  plugins: [],
};
