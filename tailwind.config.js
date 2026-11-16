/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' lets the app control dark mode itself (gyan is a dark navy app).
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
