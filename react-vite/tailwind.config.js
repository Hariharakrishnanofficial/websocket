/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border:    'var(--border)',
        text:      'var(--text)',
        muted:     'var(--muted)',
        accent:    'var(--accent)',
        success:   'var(--success)',
        warn:      'var(--warn)',
        danger:    'var(--danger)',
      },
      fontFamily: {
        sans: [
          '-apple-system','BlinkMacSystemFont','"Segoe UI"','Roboto',
          'Inter','Helvetica','Arial','sans-serif',
        ],
        mono: ['ui-monospace','SFMono-Regular','Menlo','Consolas','monospace'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 10px 30px rgba(0,0,0,.45)',
        glow: '0 0 0 4px rgba(77,171,247,.18)',
      },
      keyframes: {
        pulse2: { '50%': { opacity: '.35' } },
      },
      animation: {
        pulse2: 'pulse2 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
