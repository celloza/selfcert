/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // controlled via root .dark class (supports user preference & system fallback)
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
