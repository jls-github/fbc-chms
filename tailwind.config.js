/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/views/**/*.erb',
    './app/helpers/**/*.rb',
    './app/javascript/**/*.js',
    './app/assets/**/*.css'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          700: '#4f46e5'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol']
      }
    }
  },
  plugins: []
}
