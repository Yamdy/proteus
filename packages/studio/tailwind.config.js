/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0a0f",
          50: "#18181b",
          100: "#1e1e23",
          200: "#27272a",
          300: "#3f3f46",
        },
      },
    },
  },
  plugins: [],
};
