/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './public/js/**/*.js',
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
    },
  },
  plugins: [],
};
