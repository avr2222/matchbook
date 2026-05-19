/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1D9E75',
          dark:    '#0F6E56',
          light:   '#E1F5EE',
        },
        surface: '#F4F3F0',
        page:    '#F8F8F6',
      },
    },
  },
  plugins: [],
}
