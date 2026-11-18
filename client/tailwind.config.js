/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { 950:'#071522', 900:'#0b1c2d', 800:'#122b40', 700:'#1d3c51' },
        teal: { 500:'#0e9f91', 600:'#087f76', 700:'#086861' },
        mist: '#f4f7f8'
      },
      boxShadow: { card:'0 10px 32px rgba(15,35,50,.07)' }
    }
  },
  plugins: []
};
