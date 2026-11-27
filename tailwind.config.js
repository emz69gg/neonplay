/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        surface2: v('surface-2'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        neon: { purple: v('neon-purple'), violet: '#8b5cf6', blue: v('neon-blue'), cyan: v('neon-cyan'), pink: v('neon-pink') },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(168,85,247,.35), 0 8px 30px -6px rgba(139,92,246,.45)',
        'neon-blue': '0 0 0 1px rgba(59,130,246,.35), 0 8px 30px -6px rgba(59,130,246,.45)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } },
        'pop': { '0%': { transform: 'scale(.6)', opacity: 0 }, '70%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
        'float': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'shimmer': { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        'glow': { '0%,100%': { opacity: .55 }, '50%': { opacity: 1 } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.2,.8,.2,1) both',
        'pop': 'pop .25s ease-out both',
        'float': 'float 5s ease-in-out infinite',
        'shimmer': 'shimmer 1.6s linear infinite',
        'glow': 'glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
