/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: ['"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      colors: {
        ink: '#132122',
        paper: '#f5efe4',
        panel: '#fcf8f1',
        ember: '#bf5b3d',
        sage: '#5d7a63',
        brass: '#b2894a',
        clay: '#d78d60'
      }
    }
  },
  plugins: []
}
