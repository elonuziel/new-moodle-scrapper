/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        moodle: {
          orange: '#f98012',
          dark: '#1e293b',
          accent: '#0284c7',
        }
      }
    },
  },
  plugins: [],
}
