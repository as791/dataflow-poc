/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: {
          white: 'rgba(255,255,255,0.08)',
          border: 'rgba(255,255,255,0.15)',
          hover: 'rgba(255,255,255,0.13)',
          active: 'rgba(255,255,255,0.18)',
        },
        brand: {
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
        },
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      backdropBlur: {
        glass: '12px',
        'glass-heavy': '24px',
      },
      backgroundImage: {
        'canvas-gradient':
          'radial-gradient(ellipse at 20% 20%, #1e1b4b 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #312e81 0%, transparent 50%), linear-gradient(135deg, #0f0c29 0%, #1a1639 50%, #0a0820 100%)',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.37)',
        'glass-glow': '0 0 24px rgba(99,102,241,0.4)',
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
