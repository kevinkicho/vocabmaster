/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './public/js/**/*.js',
  ],
  safelist: [
    // Dynamic classes used in analytics tabs (ternary expressions in JS)
    'bg-emerald-400', 'bg-emerald-500', 'bg-amber-400', 'bg-rose-400',
    'text-emerald-500', 'text-amber-500', 'text-rose-500', 'text-amber-400', 'text-violet-400', 'text-violet-500',
    'from-amber-50', 'to-orange-50', 'from-violet-50', 'to-purple-50',
    'dark:from-amber-900/20', 'dark:to-orange-900/20', 'dark:from-violet-900/20', 'dark:to-purple-900/20',
    'border-amber-100', 'dark:border-amber-900/30', 'border-violet-100', 'dark:border-violet-900/30',
    'peer-checked:bg-white', 'peer-checked:text-slate-700',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        indigo: {
          50: 'var(--p-50)', 100: 'var(--p-100)', 200: 'var(--p-200)', 300: 'var(--p-300)', 400: 'var(--p-400)',
          500: 'var(--p-500)', 600: 'var(--p-600)', 700: 'var(--p-700)', 800: 'var(--p-800)', 900: 'var(--p-900)',
        },
        slate: {
          50: 'var(--n-50)', 100: 'var(--n-100)', 200: 'var(--n-200)', 300: 'var(--n-300)', 400: 'var(--n-400)',
          500: 'var(--n-500)', 600: 'var(--n-600)', 700: 'var(--n-700)', 800: 'var(--n-800)', 900: 'var(--n-900)',
        },
        neutral: {
          50: 'var(--n-50)', 100: 'var(--n-100)', 200: 'var(--n-200)', 300: 'var(--n-300)', 400: 'var(--n-400)',
          500: 'var(--n-500)', 600: 'var(--n-600)', 700: 'var(--n-700)', 800: 'var(--n-800)', 900: 'var(--n-900)',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', '"Noto Sans KR"', '"Noto Sans SC"', '"Noto Sans TC"', '"Nunito"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(0,0,0,0.08)',
      },
      screens: {
        landscape: { raw: '(orientation: landscape)' },
      },
      animation: {
        shake: 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' }
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
