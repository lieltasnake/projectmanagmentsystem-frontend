/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b19',
          900: '#0b112c',
          850: '#0f173b',
          800: '#141e4b',
          700: '#1e2d6d',
        },
      },
    },
  },
  plugins: [],
}
